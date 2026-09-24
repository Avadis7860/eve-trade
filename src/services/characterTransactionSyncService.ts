/**
 * EVE Trade - Character Transaction Synchronization Service
 *
 * PHASE 2B — CHANTIER 3B-2: ESI Execution Ingestion
 *
 * Orchestrates:
 * 1. Multi-Character Auth Verification & Session Lifecycle (AuthService)
 * 2. ESI Wallet Transactions Acquisition & Pagination (from_id anchor handling)
 * 3. Rate Limiting (429 Retry-After & 420 Error Limiting)
 * 4. Normalization via Pure Engine (characterTransaction.ts)
 * 5. Persistence-First Storage (IndexedDbStore.saveCharacterTransactions)
 * 6. Non-Destructive Ingestion Diagnostic Summary & Failure Semantics
 *
 * INVARIANTS:
 * - Pure engine remains 100% pure (ingestedAt injected by this orchestrator).
 * - Zero automatic correlation with OpportunityObservation or execution_outcome.
 * - Persistence is committed before reporting success.
 * - Never returns empty list on authentication failure.
 */

import {
  CharacterTransactionSyncOptions,
  CharacterTransactionSyncStoppedReason,
  CharacterTransactionSyncSummary,
  DataHealthStatus,
  DataState,
  EsiWalletClientAdapter,
  EsiWalletTransactionResponse,
  EveCharacterSession,
  PersistedCharacterTransaction,
} from '../types';
import {
  normalizeEsiCharacterTransactions,
  RawEsiTransactionInput,
} from '../engine/characterTransaction';
import type { FinancialHistoryCoverage, EconomicOriginCoverage } from '../types/financial';
import { IndexedDbStore } from './indexedDbStore';
import { AuthService } from './authService';
import { CharacterRepository } from '../domain/character/CharacterRepository';

export const REQUIRED_WALLET_TRANSACTION_SCOPE = 'esi-wallet.read_character_wallet.v1';
export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_SYNC_TIMEOUT_MS = 15000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_MAX_WAIT_RETRY_AFTER_MS = 60000;

/**
 * Default HTTP client adapter communicating through the application server proxy endpoint:
 * `/api/character/${characterId}/transactions`
 *
 * All ESI wallet transaction requests are securely proxied via the application backend
 * to maintain strict control over headers, rate-limiting, and network compliance.
 */
export class HttpEsiWalletClientAdapter implements EsiWalletClientAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  async fetchWalletTransactions(
    characterId: number,
    accessToken: string,
    options?: {
      from_id?: number;
      signal?: AbortSignal;
    }
  ): Promise<EsiWalletTransactionResponse> {
    const fromIdQuery = options?.from_id !== undefined ? `?from_id=${encodeURIComponent(String(options.from_id))}` : '';
    const proxyUrl = `${this.baseUrl}/api/character/${characterId}/transactions${fromIdQuery}`;

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: options?.signal,
      });

      const retryAfterHeader = response.headers.get('retry-after');
      const remainHeader = response.headers.get('x-esi-error-limit-remain');
      const resetHeader = response.headers.get('x-esi-error-limit-reset');

      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      const errorLimitRemain = remainHeader ? parseInt(remainHeader, 10) : undefined;
      const errorLimitReset = resetHeader ? parseInt(resetHeader, 10) : undefined;

      const headersRecord: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        headersRecord[key.toLowerCase()] = val;
      });

      if (!response.ok) {
        let errText: string = response.statusText;
        try {
          const jsonErr = await response.json();
          errText = jsonErr.details || jsonErr.error || JSON.stringify(jsonErr);
        } catch {
          errText = await response.text().catch(() => response.statusText);
        }

        return {
          ok: false,
          status: response.status,
          data: null,
          error: errText,
          retryAfterSeconds,
          errorLimitRemain,
          errorLimitReset,
          headers: headersRecord,
        };
      }

      const data = (await response.json()) as RawEsiTransactionInput[];
      return {
        ok: true,
        status: response.status,
        data: Array.isArray(data) ? data : [],
        retryAfterSeconds,
        errorLimitRemain,
        errorLimitReset,
        headers: headersRecord,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * CharacterTransactionSyncService
 * Production-ready orchestration for ESI wallet transaction ingestion.
 */
export class CharacterTransactionSyncService {
  private static defaultAdapter: EsiWalletClientAdapter = new HttpEsiWalletClientAdapter();

  /**
   * Sets the global default ESI adapter (e.g. For mock injection during tests)
   */
  static setDefaultAdapter(adapter: EsiWalletClientAdapter): void {
    this.defaultAdapter = adapter;
  }

  /**
   * Gets the global default ESI adapter
   */
  static getDefaultAdapter(): EsiWalletClientAdapter {
    return this.defaultAdapter;
  }

  /**
   * Resets default adapter back to standard HttpEsiWalletClientAdapter
   */
  static resetDefaultAdapter(): void {
    this.defaultAdapter = new HttpEsiWalletClientAdapter();
  }

  /**
   * Ingests wallet transactions for a specific character from ESI,
   * performs strict normalization, deduplicates against pagination anchors,
   * commits to IndexedDB, and generates an observable audit summary.
   */
  static async syncCharacterTransactions(
    characterId: number,
    options?: CharacterTransactionSyncOptions
  ): Promise<CharacterTransactionSyncSummary> {
    const startedAt = options?.now ? options.now() : new Date().toISOString();
    const startTimeMs = Date.now();
    const maxPages = Math.max(1, options?.maxPages ?? DEFAULT_MAX_PAGES);
    const adapter = options?.esiAdapter ?? this.defaultAdapter;
    const retryOnTransient = options?.retryOnTransientError ?? true;
    const maxRetries = options?.maxRetries !== undefined ? Math.max(0, options.maxRetries) : DEFAULT_MAX_RETRIES;
    const timeoutMs = options?.timeoutMs !== undefined ? Math.max(1, options.timeoutMs) : DEFAULT_SYNC_TIMEOUT_MS;
    const sleepFn = options?.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const maxWaitRetryAfterMs =
      options?.maxWaitRetryAfterMs !== undefined
        ? Math.max(0, options.maxWaitRetryAfterMs)
        : DEFAULT_MAX_WAIT_RETRY_AFTER_MS;
    const errors: string[] = [];

    // 1. Validation of character identifier
    if (!Number.isSafeInteger(characterId) || characterId <= 0) {
      return this.persistSummary({
        characterId: characterId || 0,
        startedAt,
        completedAt: startedAt,
        durationMs: 0,
        pagesFetched: 0,
        transactionsReceived: 0,
        transactionsValid: 0,
        transactionsInvalid: 0,
        transactionsNew: 0,
        transactionsExisting: 0,
        duplicatesRemoved: 0,
        paginationCompleted: false,
        stoppedReason: 'VALIDATION_ERROR',
        errors: [`Invalid characterId: must be a positive safe integer (received ${characterId})`],
        dataState: 'ERROR',
        healthStatus: 'ERROR',
      });
    }

    // 2. Authentication & Character Session Resolution
    let session: EveCharacterSession | undefined = AuthService.getLinkedCharacters().find(
      (c) => c.character_id === characterId
    );

    if (!session || !session.access_token) {
      return this.persistSummary({
        characterId,
        startedAt,
        completedAt: startedAt,
        durationMs: 0,
        pagesFetched: 0,
        transactionsReceived: 0,
        transactionsValid: 0,
        transactionsInvalid: 0,
        transactionsNew: 0,
        transactionsExisting: 0,
        duplicatesRemoved: 0,
        paginationCompleted: false,
        stoppedReason: 'AUTH_REQUIRED',
        errors: [`No active authentication session or access token found for character #${characterId}`],
        dataState: 'ERROR',
        healthStatus: 'ERROR',
      });
    }

    // 3. Check for Token Expiry & Proactive Refresh
    if (AuthService.isTokenExpiredOrExpiringSoon(session)) {
      try {
        session = await AuthService.refreshCharacterToken(session);
      } catch (refreshErr) {
        errors.push(`Token refresh attempt failed: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}`);
      }

      if (session.is_token_expired || !session.access_token) {
        return this.persistSummary({
          characterId,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          pagesFetched: 0,
          transactionsReceived: 0,
          transactionsValid: 0,
          transactionsInvalid: 0,
          transactionsNew: 0,
          transactionsExisting: 0,
          duplicatesRemoved: 0,
          paginationCompleted: false,
          stoppedReason: 'AUTH_REQUIRED',
          errors: [`SSO token expired and refresh failed for character #${characterId}`],
          dataState: 'ERROR',
          healthStatus: 'ERROR',
        });
      }
    }

    // 4. Identify Local Known Transactions (Anchor Detection)
    let lastKnownTransactionIdBeforeSync: number | undefined = undefined;
    const knownTransactionIds = new Set<number>();

    try {
      const existingTxs = await IndexedDbStore.getCharacterTransactions(characterId);
      if (existingTxs.length > 0) {
        for (const tx of existingTxs) {
          knownTransactionIds.add(tx.transaction_id);
        }
        lastKnownTransactionIdBeforeSync = existingTxs[0].transaction_id;
      }
    } catch (err) {
      errors.push(`Warning: could not inspect local transaction history: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 5. Ingestion Loop (Pages & Anchors)
    let currentFromId: number | undefined = undefined;
    let pagesFetched = 0;
    let transactionsReceived = 0;
    let transactionsValid = 0;
    let transactionsInvalid = 0;
    let transactionsNew = 0;
    let transactionsExisting = 0;
    let duplicatesRemoved = 0;
    let stoppedReason: CharacterTransactionSyncStoppedReason = 'NO_MORE_DATA';
    let paginationCompleted = false;

    let latestTransactionId: number | undefined = undefined;
    let oldestTransactionId: number | undefined = undefined;
    const seenInThisSync = new Set<number>();

    while (pagesFetched < maxPages) {
      let pageResponse: EsiWalletTransactionResponse | null = null;
      let transientRetries = 0;
      let rateLimitRetries = 0;
      let errorLimitRetries = 0;
      let authRefreshAttempted = false;

      while (true) {
        const abortController = new AbortController();
        let timer: any = null;

        try {
          const fetchPromise = adapter.fetchWalletTransactions(characterId, session.access_token, {
            from_id: currentFromId,
            signal: abortController.signal,
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              abortController.abort();
              reject(new Error(`Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);
          });

          pageResponse = await Promise.race([fetchPromise, timeoutPromise]);
        } catch (fetchErr: any) {
          const isTimeout =
            abortController.signal.aborted ||
            (fetchErr instanceof Error && fetchErr.message.includes('timed out')) ||
            fetchErr?.name === 'AbortError';

          if (isTimeout) {
            stoppedReason = 'NETWORK_ERROR';
            errors.push(`Request timed out after ${timeoutMs}ms`);
            paginationCompleted = false;
            pageResponse = null;
            break;
          }

          if (retryOnTransient && transientRetries < maxRetries) {
            transientRetries++;
            const delay = Math.min(500 * Math.pow(2, transientRetries - 1), 5000);
            await sleepFn(delay);
            continue;
          }

          stoppedReason = 'NETWORK_ERROR';
          errors.push(`Network fetch error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
          paginationCompleted = false;
          pageResponse = null;
          break;
        } finally {
          if (timer) clearTimeout(timer);
        }

        // Handle 401 Unauthorized (attempt one-time refresh)
        if (pageResponse.status === 401) {
          if (!authRefreshAttempted) {
            authRefreshAttempted = true;
            let freshToken: string | null = null;
            try {
              freshToken = await AuthService.getFreshToken(characterId);
            } catch {
              freshToken = null;
            }

            if (freshToken && freshToken !== session.access_token) {
              session = { ...session, access_token: freshToken };
              continue;
            }
          }

          AuthService.markTokenExpired(characterId, 'Session SSO expirée ou révoquée (401)');
          stoppedReason = 'AUTH_REQUIRED';
          errors.push(`ESI 401 Unauthorized: token rejected for character #${characterId}`);
          paginationCompleted = false;
          pageResponse = null;
          break;
        }

        // Handle 403 Forbidden (Missing Scope)
        if (pageResponse.status === 403) {
          stoppedReason = 'AUTH_REQUIRED';
          errors.push(
            `ESI 403 Forbidden: Character #${characterId} lacks required scope "${REQUIRED_WALLET_TRANSACTION_SCOPE}"`
          );
          paginationCompleted = false;
          pageResponse = null;
          break;
        }

        // Handle 429 Rate Limited (Retry-After)
        if (pageResponse.status === 429) {
          const retrySec = pageResponse.retryAfterSeconds;
          if (retrySec !== undefined && Number.isFinite(retrySec) && retrySec >= 0) {
            const waitMs = retrySec * 1000;
            if (waitMs <= maxWaitRetryAfterMs && rateLimitRetries < maxRetries) {
              rateLimitRetries++;
              await sleepFn(waitMs);
              continue;
            } else {
              stoppedReason = 'RATE_LIMITED';
              errors.push(
                `ESI 429 Rate Limited: retry after ${retrySec}s exceeds maximum bounded wait (${maxWaitRetryAfterMs}ms) or retries exhausted (${rateLimitRetries}/${maxRetries})`
              );
              paginationCompleted = false;
              pageResponse = null;
              break;
            }
          } else {
            stoppedReason = 'RATE_LIMITED';
            errors.push('ESI 429 Rate Limited: no valid Retry-After header provided');
            paginationCompleted = false;
            pageResponse = null;
            break;
          }
        }

        // Handle 420 Error Limit Exceeded
        if (
          pageResponse.status === 420 ||
          (pageResponse.errorLimitRemain !== undefined && pageResponse.errorLimitRemain <= 0)
        ) {
          const resetSec = pageResponse.errorLimitReset;
          if (resetSec !== undefined && Number.isFinite(resetSec) && resetSec >= 0) {
            const resetWaitMs = resetSec * 1000;
            if (resetWaitMs <= maxWaitRetryAfterMs && errorLimitRetries < maxRetries) {
              errorLimitRetries++;
              await sleepFn(resetWaitMs);
              continue;
            } else {
              stoppedReason = 'RATE_LIMITED';
              errors.push(
                `ESI 420 Error Limit Exceeded: reset in ${resetSec}s exceeds maximum bounded wait (${maxWaitRetryAfterMs}ms) or retries exhausted (${errorLimitRetries}/${maxRetries})`
              );
              paginationCompleted = false;
              pageResponse = null;
              break;
            }
          } else {
            stoppedReason = 'RATE_LIMITED';
            errors.push('ESI 420 Error Limit Exceeded: error limit exhausted with no reset window header');
            paginationCompleted = false;
            pageResponse = null;
            break;
          }
        }

        // Handle 5xx Transient Server Errors
        if (pageResponse.status >= 500) {
          if (retryOnTransient && transientRetries < maxRetries) {
            transientRetries++;
            const delay = Math.min(500 * Math.pow(2, transientRetries - 1), 5000);
            await sleepFn(delay);
            continue;
          } else {
            stoppedReason = 'NETWORK_ERROR';
            errors.push(`ESI server error (HTTP ${pageResponse.status}): ${pageResponse.error || 'Unknown'}`);
            paginationCompleted = false;
            pageResponse = null;
            break;
          }
        }

        // Handle other non-ok HTTP statuses
        if (!pageResponse.ok || !pageResponse.data) {
          stoppedReason = 'NETWORK_ERROR';
          errors.push(`ESI request failed (HTTP ${pageResponse.status}): ${pageResponse.error || 'Unknown'}`);
          paginationCompleted = false;
          pageResponse = null;
          break;
        }

        break;
      }

      if (!pageResponse || !pageResponse.ok || !pageResponse.data) {
        break;
      }

      const rawItems = pageResponse.data;
      pagesFetched++;
      transactionsReceived += rawItems.length;

      // Stop Condition: Page is completely empty
      if (rawItems.length === 0) {
        stoppedReason = 'NO_MORE_DATA';
        paginationCompleted = true;
        break;
      }

      // Handle CCP ESI `from_id` anchor deduplication:
      // The anchor item with transaction_id === currentFromId is re-sent by ESI.
      // Also protect against any items already processed in previous pages of this run.
      const pageNewItems: RawEsiTransactionInput[] = [];
      let anchorItemsFiltered = 0;

      for (const item of rawItems) {
        const txId = Number(item?.transaction_id);
        if (currentFromId !== undefined && txId === currentFromId) {
          anchorItemsFiltered++;
          duplicatesRemoved++;
        } else if (seenInThisSync.has(txId)) {
          anchorItemsFiltered++;
          duplicatesRemoved++;
        } else {
          pageNewItems.push(item);
        }
      }

      // If after filtering the anchor/duplicates, no items remain:
      // ESI has reached the end of history.
      if (pageNewItems.length === 0) {
        stoppedReason = currentFromId !== undefined ? 'NO_MORE_DATA' : 'NO_NEW_DATA';
        paginationCompleted = true;
        break;
      }

      // 6. Pure Engine Normalization & Validation
      const explicitIngestedAt = options?.now ? options.now() : new Date().toISOString();
      const normalizationResult = normalizeEsiCharacterTransactions(pageNewItems, characterId, {
        ingestedAt: explicitIngestedAt,
        sourceEndpoint: `/characters/${characterId}/wallet/transactions/`,
        ingestionVersion: '1.0.0',
      });

      transactionsValid += normalizationResult.valid.length;
      transactionsInvalid += normalizationResult.invalid.length;

      if (normalizationResult.invalid.length > 0) {
        for (const inv of normalizationResult.invalid) {
          errors.push(
            `Record #${inv.raw?.transaction_id ?? 'unknown'} failed validation: ${(inv.validation_errors || []).join('; ')}`
          );
        }
      }

      // 7. Persistence-First Commit to IndexedDB
      if (normalizationResult.valid.length > 0) {
        try {
          const persistResult = await IndexedDbStore.saveCharacterTransactions(normalizationResult.valid);
          transactionsNew += persistResult.saved;
          transactionsExisting += persistResult.updated;
        } catch (persistErr) {
          stoppedReason = 'PERSISTENCE_ERROR';
          errors.push(`Persistence commit failed: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`);
          paginationCompleted = false;
          break;
        }
      }

      // Track min/max observed transaction IDs and seen IDs
      for (const validTx of normalizationResult.valid) {
        seenInThisSync.add(validTx.transaction_id);
        if (latestTransactionId === undefined || validTx.transaction_id > latestTransactionId) {
          latestTransactionId = validTx.transaction_id;
        }
        if (oldestTransactionId === undefined || validTx.transaction_id < oldestTransactionId) {
          oldestTransactionId = validTx.transaction_id;
        }
      }

      // 8. Incremental Anchor Reached Check
      // If we are performing an incremental sync (not fullHistory) and this page has
      // reached or passed our previously known transaction threshold:
      if (!options?.fullHistory && lastKnownTransactionIdBeforeSync !== undefined) {
        const hitKnownAnchor = normalizationResult.valid.some(
          (tx) => knownTransactionIds.has(tx.transaction_id) || tx.transaction_id <= lastKnownTransactionIdBeforeSync!
        );
        if (hitKnownAnchor) {
          stoppedReason = 'ANCHOR_REACHED';
          paginationCompleted = true;
          break;
        }
      }

      // 9. Determine next `from_id` anchor for pagination
      // CCP ESI contract: oldest valid transaction_id in the current raw batch
      const validNumericIds = rawItems
        .map((t) => Number(t?.transaction_id))
        .filter((id) => Number.isSafeInteger(id) && id > 0);

      if (validNumericIds.length === 0) {
        stoppedReason = 'NO_MORE_DATA';
        paginationCompleted = true;
        break;
      }

      const oldestInBatch = Math.min(...validNumericIds);
      if (oldestInBatch === currentFromId) {
        // Oldest ID did not progress; avoid infinite loop and do NOT claim complete data without proof
        stoppedReason = 'NETWORK_ERROR';
        paginationCompleted = false;
        errors.push(
          `Pagination stagnant: oldest transaction_id #${oldestInBatch} in batch matches current from_id anchor; cannot guarantee completeness`
        );
        break;
      }

      currentFromId = oldestInBatch;
    }

    // Guard: Max pages limit reached
    if (pagesFetched >= maxPages && !paginationCompleted && stoppedReason === 'NO_MORE_DATA') {
      stoppedReason = 'MAX_PAGES_GUARD';
      paginationCompleted = false;
    }

    // 10. Canonical DataState & HealthStatus Resolution
    let dataState: DataState = 'VALID';
    let healthStatus: DataHealthStatus = 'LIVE';

    if (stoppedReason === 'AUTH_REQUIRED' || stoppedReason === 'PERSISTENCE_ERROR') {
      dataState = 'ERROR';
      healthStatus = 'ERROR';
    } else if (stoppedReason === 'NETWORK_ERROR' || stoppedReason === 'RATE_LIMITED') {
      dataState = transactionsValid > 0 ? 'PARTIAL' : 'ERROR';
      healthStatus = transactionsValid > 0 ? 'PARTIAL' : 'ERROR';
    } else if (stoppedReason === 'MAX_PAGES_GUARD') {
      dataState = 'PARTIAL';
      healthStatus = 'PARTIAL';
    } else {
      dataState = transactionsValid === 0 && transactionsReceived === 0 ? 'EMPTY' : 'VALID';
      healthStatus = 'LIVE';
      if (stoppedReason === 'ANCHOR_REACHED' || stoppedReason === 'NO_MORE_DATA' || stoppedReason === 'NO_NEW_DATA') {
        paginationCompleted = true;
      }
    }

    const completedAt = options?.now ? options.now() : new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startTimeMs);

    return this.persistSummary({
      characterId,
      startedAt,
      completedAt,
      durationMs,
      pagesFetched,
      transactionsReceived,
      transactionsValid,
      transactionsInvalid,
      transactionsNew,
      transactionsExisting,
      duplicatesRemoved,
      paginationCompleted,
      stoppedReason,
      errors,
      latestTransactionId,
      oldestTransactionId,
      lastKnownTransactionIdBeforeSync,
      dataState,
      healthStatus,
    });
  }

  private static persistSummary(
    params: Parameters<typeof CharacterTransactionSyncService.buildSummary>[0],
  ): CharacterTransactionSyncSummary {
    const summary = CharacterTransactionSyncService.buildSummary(params);
    try {
      CharacterRepository.getInstance().saveTransactionSyncSummary(summary.character_id, summary);
    } catch (error) {
      console.warn('[CharacterTransactionSyncService] Failed to persist coverage summary:', error);
    }
    return summary;
  }

  private static buildSummary(params: {
    characterId: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    pagesFetched: number;
    fullHistoryRequested?: boolean;
    transactionsReceived: number;
    transactionsValid: number;
    transactionsInvalid: number;
    transactionsNew: number;
    transactionsExisting: number;
    duplicatesRemoved: number;
    paginationCompleted: boolean;
    stoppedReason: CharacterTransactionSyncStoppedReason;
    errors: string[];
    latestTransactionId?: number;
    oldestTransactionId?: number;
    lastKnownTransactionIdBeforeSync?: number;
    dataState: DataState;
    healthStatus: DataHealthStatus;
  }): CharacterTransactionSyncSummary {
    const historyCoverage: FinancialHistoryCoverage =
      params.stoppedReason === 'NO_MORE_DATA' &&
      (params.fullHistoryRequested === true || params.lastKnownTransactionIdBeforeSync === undefined)
        ? 'COMPLETE_FOR_SCOPE'
        : params.transactionsReceived > 0 &&
            params.stoppedReason !== 'VALIDATION_ERROR' &&
            params.stoppedReason !== 'AUTH_REQUIRED' &&
            params.stoppedReason !== 'NO_NEW_DATA'
          ? 'PARTIAL'
          : 'UNKNOWN';

    const economicOriginCoverage: EconomicOriginCoverage = 'UNKNOWN';

    return {
      character_id: params.characterId,
      started_at: params.startedAt,
      completed_at: params.completedAt,
      duration_ms: params.durationMs,
      pages_fetched: params.pagesFetched,
      transactions_received: params.transactionsReceived,
      transactions_valid: params.transactionsValid,
      transactions_invalid: params.transactionsInvalid,
      transactions_new: params.transactionsNew,
      transactions_existing: params.transactionsExisting,
      duplicates_removed: params.duplicatesRemoved,
      pagination_completed: params.paginationCompleted,
      stopped_reason: params.stoppedReason,
      error_count: params.errors.length,
      errors: Object.freeze([...params.errors]),
      latest_transaction_id: params.latestTransactionId,
      oldest_transaction_id: params.oldestTransactionId,
      last_known_transaction_id_before_sync: params.lastKnownTransactionIdBeforeSync,
      data_state: params.dataState,
      health_status: params.healthStatus,
    };
  }
}
