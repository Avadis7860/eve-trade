/**
 * EVE Trade - Character Transaction Ingestion Test Suite
 *
 * PHASE 2B — CHANTIER 3B-2: ESI Execution Ingestion
 *
 * Comprehensive Test Suite covering all 17 mandatory verification points:
 * 1. Initial fetch for a character (Page 1 -> validation -> persistence -> summary)
 * 2. Idempotent repeated synchronization (0 new, N existing, zero duplicates)
 * 3. `from_id` pagination progression and anchor deduplication
 * 4. Reappearing pagination anchor deduplicated across page boundaries
 * 5. High activity > first page (multi-page gap bridging to known anchor)
 * 6. Non-destructive handling of invalid records among valid transactions
 * 7. 401 Unauthorized followed by successful token refresh and ingestion
 * 8. 401 Unauthorized with failed token refresh (explicit AUTH_REQUIRED)
 * 9. 403 Forbidden with missing required scope
 * 10. 429 Rate limiting respecting Retry-After
 * 11. 420 Error limit exceeded (RATE_LIMITED)
 * 12. Transient 5xx server error with retry
 * 13. Page 2 network failure preserves Page 1 committed transactions (PARTIAL)
 * 14. Persistence failure handling (PERSISTENCE_ERROR, zero fake commits)
 * 15. Strict multi-character data isolation
 * 16. Immutability of first_seen_at and updates to last_seen_at
 * 17. Absolute non-interference: zero automatic correlation or outcome mutation
 */

import {
  CharacterTransactionSyncService,
  REQUIRED_WALLET_TRANSACTION_SCOPE,
  deriveTransactionHistoryCoverage,
} from '../../services/characterTransactionSyncService';
import { CharacterRepository } from '../../domain/character/CharacterRepository';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { AuthService } from '../../services/authService';
import {
  EsiWalletClientAdapter,
  EsiWalletTransactionResponse,
  EveCharacterSession,
  OpportunityObservation,
  PersistedCharacterTransaction,
} from '../../types';
import { RawEsiTransactionInput } from '../characterTransaction';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Deterministic Mock ESI Wallet Client Adapter for comprehensive testing
 */
class MockEsiWalletClientAdapter implements EsiWalletClientAdapter {
  readonly calls: Array<{ characterId: number; accessToken: string; from_id?: number }> = [];

  private responsesByFromId: Map<string, EsiWalletTransactionResponse> = new Map();
  private responseQueue: EsiWalletTransactionResponse[] = [];
  private handler?: (
    characterId: number,
    accessToken: string,
    options?: { from_id?: number }
  ) => Promise<EsiWalletTransactionResponse> | EsiWalletTransactionResponse;

  setResponseForFromId(fromId: number | undefined, response: EsiWalletTransactionResponse) {
    const key = fromId !== undefined ? String(fromId) : 'default';
    this.responsesByFromId.set(key, response);
  }

  enqueueResponse(response: EsiWalletTransactionResponse) {
    this.responseQueue.push(response);
  }

  setCustomHandler(
    fn: (
      characterId: number,
      accessToken: string,
      options?: { from_id?: number }
    ) => Promise<EsiWalletTransactionResponse> | EsiWalletTransactionResponse
  ) {
    this.handler = fn;
  }

  reset() {
    this.calls.length = 0;
    this.responsesByFromId.clear();
    this.responseQueue.length = 0;
    this.handler = undefined;
  }

  async fetchWalletTransactions(
    characterId: number,
    accessToken: string,
    options?: { from_id?: number; signal?: AbortSignal }
  ): Promise<EsiWalletTransactionResponse> {
    this.calls.push({ characterId, accessToken, from_id: options?.from_id });

    if (this.handler) {
      return this.handler(characterId, accessToken, options);
    }

    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }

    const key = options?.from_id !== undefined ? String(options.from_id) : 'default';
    if (this.responsesByFromId.has(key)) {
      return this.responsesByFromId.get(key)!;
    }

    // Default fallback: empty response
    return {
      ok: true,
      status: 200,
      data: [],
    };
  }
}

async function runTests() {
  console.log('=== RUNNING PHASE 2B: ESI EXECUTION INGESTION (CHANTIER 3B-2) TESTS ===\n');

  const mockAdapter = new MockEsiWalletClientAdapter();

  // --------------------------------------------------------------------------
  // Test 1: Premier fetch d'un personnage (Initial fetch with 1 page)
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Premier fetch d\'un personnage ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charId = 2112001;
    const session: EveCharacterSession = {
      character_id: charId,
      character_name: 'Test Pilot Alpha',
      portrait_url: 'https://images.evetech.net/characters/2112001/portrait',
      access_token: 'valid_token_alpha',
      expires_at: Date.now() + 1000 * 60 * 20,
    };
    AuthService.saveCharacter(session, true);

    const rawTxs: RawEsiTransactionInput[] = [
      {
        transaction_id: 103,
        type_id: 34,
        location_id: 60003760,
        quantity: 10000,
        unit_price: 5.0,
        date: '2026-09-20T10:00:00Z',
        is_buy: true,
        is_personal: true,
      },
      {
        transaction_id: 102,
        type_id: 35,
        location_id: 60003760,
        quantity: 500,
        unit_price: 15.5,
        date: '2026-09-20T09:30:00Z',
        is_buy: false,
        is_personal: true,
      },
      {
        transaction_id: 101,
        type_id: 36,
        location_id: 60003760,
        quantity: 2000,
        unit_price: 45.0,
        date: '2026-09-20T09:00:00Z',
        is_buy: true,
        is_personal: true,
      },
    ];

    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: rawTxs,
    });
    // Follow-up request with from_id: 101 returns anchor only (end of data)
    mockAdapter.setResponseForFromId(101, {
      ok: true,
      status: 200,
      data: [rawTxs[2]], // Anchor only
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      now: () => '2026-09-20T10:05:00.000Z',
    });

    assert(summary.character_id === charId, 'Summary character_id matches');
    assert(summary.pages_fetched === 2, `Pages fetched must be 2, got ${summary.pages_fetched}`);
    assert(summary.transactions_received === 4, `Received 4 records (3 + 1 anchor), got ${summary.transactions_received}`);
    assert(summary.transactions_valid === 3, `Valid transactions count must be 3, got ${summary.transactions_valid}`);
    assert(summary.transactions_new === 3, `New transactions persisted must be 3, got ${summary.transactions_new}`);
    assert(summary.transactions_existing === 0, 'No existing transactions on first fetch');
    assert(summary.duplicates_removed === 1, `Duplicates removed must be 1 (the 101 anchor), got ${summary.duplicates_removed}`);
    assert(summary.stopped_reason === 'NO_MORE_DATA', `Stopped reason must be NO_MORE_DATA, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === true, 'Pagination completed must be true');
    assert(summary.data_state === 'VALID', 'data_state must be VALID');
    assert(summary.health_status === 'LIVE', 'health_status must be LIVE');
    assert(summary.latest_transaction_id === 103, 'Latest transaction_id is 103');
    assert(summary.oldest_transaction_id === 101, 'Oldest transaction_id is 101');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 3, `IndexedDB must contain 3 persisted transactions, got ${inStore.length}`);
    assert(inStore[0].first_seen_at === '2026-09-20T10:05:00.000Z', 'first_seen_at recorded properly');

    console.log('  [PASS] Test 1: Premier fetch validated with full summary & persistence.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Synchronisation répétée idempotente (Second run with same data)
  // --------------------------------------------------------------------------
  console.log('--- Test 2: Synchronisation répétée idempotente ---');
  {
    const charId = 2112001;
    // Repeat the sync with exactly the same ESI payload at T2
    const summary2 = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      now: () => '2026-09-20T10:35:00.000Z',
    });

    assert(summary2.transactions_new === 0, `Repeated sync must produce 0 new transactions, got ${summary2.transactions_new}`);
    assert(summary2.transactions_existing === 3, `Existing updated transactions must be 3, got ${summary2.transactions_existing}`);
    assert(summary2.data_state === 'VALID', 'State remains VALID');
    assert(summary2.health_status === 'LIVE', 'Health remains LIVE');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 3, 'IndexedDB row count must not duplicate on repeated sync');

    // Verify first_seen_at remains T1 and last_seen_at is updated to T2
    const tx103 = inStore.find((t) => t.transaction_id === 103)!;
    assert(tx103.first_seen_at === '2026-09-20T10:05:00.000Z', 'first_seen_at must remain original T1');
    assert(tx103.last_seen_at === '2026-09-20T10:35:00.000Z', 'last_seen_at must be updated to T2');

    console.log('  [PASS] Test 2: Idempotent synchronization verified.');
  }

  // --------------------------------------------------------------------------
  // Test 3: Pagination from_id progression
  // --------------------------------------------------------------------------
  console.log('--- Test 3: Pagination from_id progression ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charId = 2112001;
    const page1: RawEsiTransactionInput[] = [
      {
        transaction_id: 105,
        type_id: 34,
        location_id: 60003760,
        quantity: 1000,
        unit_price: 5.0,
        date: '2026-09-20T12:00:00Z',
        is_buy: true,
      },
      {
        transaction_id: 104,
        type_id: 34,
        location_id: 60003760,
        quantity: 2000,
        unit_price: 5.1,
        date: '2026-09-20T11:50:00Z',
        is_buy: true,
      },
      {
        transaction_id: 103,
        type_id: 34,
        location_id: 60003760,
        quantity: 3000,
        unit_price: 5.2,
        date: '2026-09-20T11:40:00Z',
        is_buy: true,
      },
    ];

    // Page 2 includes anchor 103
    const page2: RawEsiTransactionInput[] = [
      page1[2], // Anchor 103
      {
        transaction_id: 102,
        type_id: 34,
        location_id: 60003760,
        quantity: 4000,
        unit_price: 5.3,
        date: '2026-09-20T11:30:00Z',
        is_buy: true,
      },
      {
        transaction_id: 101,
        type_id: 34,
        location_id: 60003760,
        quantity: 5000,
        unit_price: 5.4,
        date: '2026-09-20T11:20:00Z',
        is_buy: true,
      },
    ];

    // Page 3: anchor 101 only
    const page3: RawEsiTransactionInput[] = [page2[2]];

    mockAdapter.setResponseForFromId(undefined, { ok: true, status: 200, data: page1 });
    mockAdapter.setResponseForFromId(103, { ok: true, status: 200, data: page2 });
    mockAdapter.setResponseForFromId(101, { ok: true, status: 200, data: page3 });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.pages_fetched === 3, `Expected 3 pages, got ${summary.pages_fetched}`);
    assert(summary.transactions_received === 7, `Expected 7 received (3+3+1), got ${summary.transactions_received}`);
    assert(summary.duplicates_removed === 2, `Expected 2 anchor duplicates removed, got ${summary.duplicates_removed}`);
    assert(summary.transactions_valid === 5, `Expected 5 unique valid transactions, got ${summary.transactions_valid}`);
    assert(summary.transactions_new === 5, `Expected 5 new persisted, got ${summary.transactions_new}`);
    assert(summary.pagination_completed === true, 'Pagination completed');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 5, `Store must contain 5 transactions, got ${inStore.length}`);
    const ids = inStore.map((t) => t.transaction_id);
    assert(
      ids.includes(105) && ids.includes(104) && ids.includes(103) && ids.includes(102) && ids.includes(101),
      'All 5 unique transactions must be stored'
    );

    console.log('  [PASS] Test 3: from_id pagination progression and deduplication verified.');
  }

  // --------------------------------------------------------------------------
  // Test 4: Ancre réapparaissante (Anchor specifically verified)
  // --------------------------------------------------------------------------
  console.log('--- Test 4: Ancre réapparaissante ---');
  {
    const charId = 2112001;
    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    const countOf103 = inStore.filter((t) => t.transaction_id === 103).length;
    assert(countOf103 === 1, `Anchor 103 must exist exactly once, found ${countOf103}`);

    console.log('  [PASS] Test 4: Anchor deduplication verified strictly.');
  }

  // --------------------------------------------------------------------------
  // Test 5: Activité > première page (Multi-page gap bridging to known anchor)
  // --------------------------------------------------------------------------
  console.log('--- Test 5: Activité > première page (Gap bridging) ---');
  {
    // Local store currently has transactions [105, 104, 103, 102, 101].
    // Now ESI has high activity: transactions [110, 109, 108] on page 1,
    // [108, 107, 106, 105] on page 2.
    // Page 2 contains 105, which is already in local store!
    // Sync should stop immediately at page 2 with ANCHOR_REACHED.
    mockAdapter.reset();
    const charId = 2112001;

    const page1: RawEsiTransactionInput[] = [
      {
        transaction_id: 110,
        type_id: 34,
        location_id: 60003760,
        quantity: 100,
        unit_price: 6.0,
        date: '2026-09-20T14:00:00Z',
        is_buy: true,
      },
      {
        transaction_id: 109,
        type_id: 34,
        location_id: 60003760,
        quantity: 200,
        unit_price: 6.1,
        date: '2026-09-20T13:50:00Z',
        is_buy: true,
      },
      {
        transaction_id: 108,
        type_id: 34,
        location_id: 60003760,
        quantity: 300,
        unit_price: 6.2,
        date: '2026-09-20T13:40:00Z',
        is_buy: true,
      },
    ];

    const page2: RawEsiTransactionInput[] = [
      page1[2], // Anchor 108
      {
        transaction_id: 107,
        type_id: 34,
        location_id: 60003760,
        quantity: 400,
        unit_price: 6.3,
        date: '2026-09-20T13:30:00Z',
        is_buy: true,
      },
      {
        transaction_id: 106,
        type_id: 34,
        location_id: 60003760,
        quantity: 500,
        unit_price: 6.4,
        date: '2026-09-20T13:20:00Z',
        is_buy: true,
      },
      {
        transaction_id: 105, // ALREADY KNOWN in store!
        type_id: 34,
        location_id: 60003760,
        quantity: 1000,
        unit_price: 5.0,
        date: '2026-09-20T12:00:00Z',
        is_buy: true,
      },
    ];

    mockAdapter.setResponseForFromId(undefined, { ok: true, status: 200, data: page1 });
    mockAdapter.setResponseForFromId(108, { ok: true, status: 200, data: page2 });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.pages_fetched === 2, `Expected 2 pages fetched, got ${summary.pages_fetched}`);
    assert(summary.stopped_reason === 'ANCHOR_REACHED', `Expected ANCHOR_REACHED, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === true, 'Pagination must be completed');
    assert(summary.transactions_new === 5, `Expected 5 new transactions (110, 109, 108, 107, 106), got ${summary.transactions_new}`);
    assert(summary.transactions_existing === 1, `Expected 1 updated (105), got ${summary.transactions_existing}`);

    console.log('  [PASS] Test 5: Multi-page gap bridging to known anchor verified.');
  }

  // --------------------------------------------------------------------------
  // Test 6: Invalid transaction parmi des transactions valides
  // --------------------------------------------------------------------------
  console.log('--- Test 6: Invalid transaction non-destructive handling ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charId = 2112001;
    const mixedBatch: any[] = [
      {
        transaction_id: 201,
        type_id: 34,
        location_id: 60003760,
        quantity: 500,
        unit_price: 5.5,
        date: '2026-09-20T15:00:00Z',
        is_buy: true,
      },
      {
        transaction_id: -99, // INVALID ID
        type_id: 34,
        location_id: 60003760,
        quantity: -10, // INVALID QUANTITY
        unit_price: 5.5,
        date: '2026-09-20T15:00:00Z',
        is_buy: true,
      },
      {
        transaction_id: 200,
        type_id: 34,
        location_id: 60003760,
        quantity: 600,
        unit_price: 5.6,
        date: '2026-09-20T14:50:00Z',
        is_buy: true,
      },
    ];

    mockAdapter.setResponseForFromId(undefined, { ok: true, status: 200, data: mixedBatch });
    mockAdapter.setResponseForFromId(200, { ok: true, status: 200, data: [mixedBatch[2]] });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.transactions_valid === 2, `Expected 2 valid transactions, got ${summary.transactions_valid}`);
    assert(summary.transactions_invalid === 1, `Expected 1 invalid transaction, got ${summary.transactions_invalid}`);
    assert(summary.transactions_new === 2, `Expected 2 new persisted, got ${summary.transactions_new}`);
    assert(summary.error_count >= 1, `Error count must reflect invalid record, got ${summary.error_count}`);

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 2, `Store must contain exactly the 2 valid transactions, got ${inStore.length}`);
    assert(inStore.some((t) => t.transaction_id === 201) && inStore.some((t) => t.transaction_id === 200), 'IDs 201 and 200 exist');
    assert(!inStore.some((t) => t.transaction_id <= 0), 'No fake or invalid transaction_id <= 0 written');

    console.log('  [PASS] Test 6: Invalid records isolated non-destructively.');
  }

  // --------------------------------------------------------------------------
  // Test 7: 401 Unauthorized puis refresh réussi
  // --------------------------------------------------------------------------
  console.log('--- Test 7: 401 Unauthorized puis refresh réussi ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    let refreshCallCount = 0;
    // Mock AuthService getFreshToken
    const origGetFreshToken = AuthService.getFreshToken;
    AuthService.getFreshToken = async (id: number) => {
      refreshCallCount++;
      return 'fresh_token_xyz_456';
    };

    let attemptCount = 0;
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      attemptCount++;
      if (token === 'valid_token_alpha') {
        // First attempt with old token fails 401
        return { ok: false, status: 401, data: null, error: 'Unauthorized' };
      }
      if (token === 'fresh_token_xyz_456') {
        if (opts?.from_id !== undefined) {
          return { ok: true, status: 200, data: [] };
        }
        // Second attempt with fresh token succeeds
        return {
          ok: true,
          status: 200,
          data: [
            {
              transaction_id: 301,
              type_id: 34,
              location_id: 60003760,
              quantity: 1000,
              unit_price: 5.0,
              date: '2026-09-20T16:00:00Z',
              is_buy: true,
            },
          ],
        };
      }
      return { ok: false, status: 401, data: null };
    });

    try {
      const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
        esiAdapter: mockAdapter,
      });

      assert(refreshCallCount > 0, 'AuthService.getFreshToken must be called upon 401');
      assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected NO_MORE_DATA after successful refresh, got ${summary.stopped_reason}`);
      assert(summary.data_state === 'VALID', 'State must be VALID');
      assert(summary.transactions_valid === 1, 'Transaction retrieved after refresh');
    } finally {
      AuthService.getFreshToken = origGetFreshToken;
    }

    console.log('  [PASS] Test 7: 401 recovery via token refresh verified.');
  }

  // --------------------------------------------------------------------------
  // Test 8: 401 + refresh échoué
  // --------------------------------------------------------------------------
  console.log('--- Test 8: 401 + refresh échoué ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    const origGetFreshToken = AuthService.getFreshToken;
    AuthService.getFreshToken = async () => null; // Refresh fails

    mockAdapter.setCustomHandler(async () => {
      return { ok: false, status: 401, data: null, error: 'Unauthorized' };
    });

    try {
      const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
        esiAdapter: mockAdapter,
      });

      assert(summary.stopped_reason === 'AUTH_REQUIRED', `Expected AUTH_REQUIRED, got ${summary.stopped_reason}`);
      assert(summary.data_state === 'ERROR', 'DataState must be ERROR');
      assert(summary.health_status === 'ERROR', 'HealthStatus must be ERROR');
      assert(summary.pagination_completed === false, 'Pagination not completed');
      assert(summary.error_count > 0, 'Errors recorded');
    } finally {
      AuthService.getFreshToken = origGetFreshToken;
    }

    console.log('  [PASS] Test 8: 401 with failed refresh correctly reports AUTH_REQUIRED.');
  }

  // --------------------------------------------------------------------------
  // Test 9: 403 Forbidden (scope manquant)
  // --------------------------------------------------------------------------
  console.log('--- Test 9: 403 Forbidden (scope manquant) ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    mockAdapter.setResponseForFromId(undefined, {
      ok: false,
      status: 403,
      data: null,
      error: 'Forbidden: missing scope',
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'AUTH_REQUIRED', `Expected AUTH_REQUIRED, got ${summary.stopped_reason}`);
    assert(summary.data_state === 'ERROR', 'data_state is ERROR');
    assert(
      summary.errors.some((e) => e.includes(REQUIRED_WALLET_TRANSACTION_SCOPE)),
      'Error message must specify the missing required wallet scope'
    );

    console.log('  [PASS] Test 9: 403 Forbidden scope failure detected.');
  }

  // --------------------------------------------------------------------------
  // Test 10: 429 respectant Retry-After
  // --------------------------------------------------------------------------
  console.log('--- Test 10: 429 respectant Retry-After ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    mockAdapter.setResponseForFromId(undefined, {
      ok: false,
      status: 429,
      data: null,
      error: 'Too Many Requests',
      retryAfterSeconds: 5,
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'RATE_LIMITED', `Expected RATE_LIMITED, got ${summary.stopped_reason}`);
    assert(summary.data_state === 'ERROR', 'data_state is ERROR');
    assert(
      summary.errors.some((e) => e.includes('429') && e.includes('5s')),
      'Error reflects 429 and retry delay'
    );

    console.log('  [PASS] Test 10: 429 Rate Limited with Retry-After verified.');
  }

  // --------------------------------------------------------------------------
  // Test 11: 420 Error Limit
  // --------------------------------------------------------------------------
  console.log('--- Test 11: 420 Error Limit ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    mockAdapter.setResponseForFromId(undefined, {
      ok: false,
      status: 420,
      data: null,
      error: 'Error Limit Exceeded',
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'RATE_LIMITED', `Expected RATE_LIMITED, got ${summary.stopped_reason}`);
    assert(summary.errors.some((e) => e.includes('420')), 'Error reflects 420');

    console.log('  [PASS] Test 11: 420 Error Limit verified.');
  }

  // --------------------------------------------------------------------------
  // Test 12: 5xx + retry
  // --------------------------------------------------------------------------
  console.log('--- Test 12: 5xx + retry ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    let attempt = 0;
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      attempt++;
      if (attempt === 1) {
        // Transient 503
        return { ok: false, status: 503, data: null, error: 'Service Unavailable' };
      }
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return {
        ok: true,
        status: 200,
        data: [
          {
            transaction_id: 401,
            type_id: 34,
            location_id: 60003760,
            quantity: 500,
            unit_price: 5.0,
            date: '2026-09-20T17:00:00Z',
            is_buy: true,
          },
        ],
      };
    });

    // Custom fetcher with retry
    const retryAdapter: EsiWalletClientAdapter = {
      async fetchWalletTransactions(cId, token, opts) {
        let res = await mockAdapter.fetchWalletTransactions(cId, token, opts);
        if (res.status >= 500) {
          res = await mockAdapter.fetchWalletTransactions(cId, token, opts);
        }
        return res;
      },
    };

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: retryAdapter,
    });

    assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected success after retry, got ${summary.stopped_reason}`);
    assert(summary.transactions_valid === 1, 'Transaction fetched on retry');

    console.log('  [PASS] Test 12: 5xx retry handling verified.');
  }

  // --------------------------------------------------------------------------
  // Test 13: Failure page 2 après succès page 1 (Preserves Page 1 data)
  // --------------------------------------------------------------------------
  console.log('--- Test 13: Failure page 2 après succès page 1 ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charId = 2112001;
    const page1: RawEsiTransactionInput[] = [
      {
        transaction_id: 502,
        type_id: 34,
        location_id: 60003760,
        quantity: 100,
        unit_price: 5.0,
        date: '2026-09-20T18:00:00Z',
        is_buy: true,
      },
      {
        transaction_id: 501,
        type_id: 34,
        location_id: 60003760,
        quantity: 200,
        unit_price: 5.1,
        date: '2026-09-20T17:50:00Z',
        is_buy: true,
      },
    ];

    mockAdapter.setResponseForFromId(undefined, { ok: true, status: 200, data: page1 });
    // Page 2 fails with 500
    mockAdapter.setResponseForFromId(501, { ok: false, status: 500, data: null, error: 'Internal Server Error' });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.pages_fetched === 1, 'Only page 1 succeeded');
    assert(summary.stopped_reason === 'NETWORK_ERROR', `Expected NETWORK_ERROR, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'Pagination not completed due to network error');
    assert(summary.data_state === 'PARTIAL', 'Data state is PARTIAL because page 1 succeeded');
    assert(summary.health_status === 'PARTIAL', 'Health status is PARTIAL');

    // Crucial: Page 1 transactions must be preserved in IndexedDB
    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 2, `Page 1 transactions must remain committed in store, got ${inStore.length}`);
    assert(inStore.some((t) => t.transaction_id === 502) && inStore.some((t) => t.transaction_id === 501), 'IDs 502 and 501 stored');

    console.log('  [PASS] Test 13: Page 1 committed data preserved despite Page 2 failure.');
  }

  // --------------------------------------------------------------------------
  // Test 14: Persistence failure handling
  // --------------------------------------------------------------------------
  console.log('--- Test 14: Persistence failure handling ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: [
        {
          transaction_id: 601,
          type_id: 34,
          location_id: 60003760,
          quantity: 1000,
          unit_price: 5.0,
          date: '2026-09-20T19:00:00Z',
          is_buy: true,
        },
      ],
    });

    // Temporarily monkey-patch saveCharacterTransactions to simulate failure
    const origSave = IndexedDbStore.saveCharacterTransactions;
    IndexedDbStore.saveCharacterTransactions = async () => {
      throw new Error('IndexedDB QuotaExceededError: disk full');
    };

    try {
      const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
        esiAdapter: mockAdapter,
      });

      assert(summary.stopped_reason === 'PERSISTENCE_ERROR', `Expected PERSISTENCE_ERROR, got ${summary.stopped_reason}`);
      assert(summary.transactions_new === 0, `Failed persistence must not report new transactions, got ${summary.transactions_new}`);
      assert(summary.pagination_completed === false, 'Pagination must be false');
      assert(summary.data_state === 'ERROR', 'data_state must be ERROR');
      assert(summary.health_status === 'ERROR', 'health_status must be ERROR');
    } finally {
      IndexedDbStore.saveCharacterTransactions = origSave;
    }

    console.log('  [PASS] Test 14: Persistence failure correctly reported as PERSISTENCE_ERROR.');
  }

  // --------------------------------------------------------------------------
  // Test 15: Multi-character data isolation
  // --------------------------------------------------------------------------
  console.log('--- Test 15: Multi-character data isolation ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charA = 2112001;
    const charB = 2112002;

    AuthService.saveCharacter(
      {
        character_id: charB,
        character_name: 'Test Pilot Bravo',
        portrait_url: 'https://images.evetech.net/characters/2112002/portrait',
        access_token: 'valid_token_bravo',
        expires_at: Date.now() + 1000 * 60 * 20,
      },
      false
    );

    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      if (cId === charA) {
        return {
          ok: true,
          status: 200,
          data: [
            {
              transaction_id: 701,
              type_id: 34,
              location_id: 60003760,
              quantity: 100,
              unit_price: 5.0,
              date: '2026-09-20T20:00:00Z',
              is_buy: true,
            },
          ],
        };
      }
      if (cId === charB) {
        return {
          ok: true,
          status: 200,
          data: [
            {
              transaction_id: 801,
              type_id: 35,
              location_id: 60008494,
              quantity: 200,
              unit_price: 15.0,
              date: '2026-09-20T20:05:00Z',
              is_buy: false,
            },
          ],
        };
      }
      return { ok: false, status: 404, data: null };
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charA, {
      esiAdapter: mockAdapter,
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charB, {
      esiAdapter: mockAdapter,
    });

    const txsA = await IndexedDbStore.getCharacterTransactions(charA);
    const txsB = await IndexedDbStore.getCharacterTransactions(charB);

    assert(txsA.length === 1 && txsA[0].transaction_id === 701, 'Character A has only tx 701');
    assert(txsA[0].character_id === charA, 'Belongs to Char A');
    assert(txsB.length === 1 && txsB[0].transaction_id === 801, 'Character B has only tx 801');
    assert(txsB[0].character_id === charB, 'Belongs to Char B');

    console.log('  [PASS] Test 15: Multi-character data isolation verified.');
  }

  // --------------------------------------------------------------------------
  // Test 16: First-seen / Last-seen timestamps
  // --------------------------------------------------------------------------
  console.log('--- Test 16: First-seen / Last-seen timestamps ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();

    const charId = 2112001;
    const rawTx: RawEsiTransactionInput = {
      transaction_id: 901,
      type_id: 34,
      location_id: 60003760,
      quantity: 5000,
      unit_price: 5.12,
      date: '2026-09-20T05:00:00Z', // Original EVE event timestamp
      is_buy: true,
    };

    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return { ok: true, status: 200, data: [rawTx] };
    });

    // Run 1 at T1
    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      now: () => '2026-09-20T08:00:00.000Z',
    });

    const txAfterT1 = (await IndexedDbStore.getCharacterTransaction(901))!;
    assert(txAfterT1.first_seen_at === '2026-09-20T08:00:00.000Z', 'first_seen_at is T1');
    assert(txAfterT1.last_seen_at === '2026-09-20T08:00:00.000Z', 'last_seen_at is T1');
    assert(txAfterT1.timestamp === '2026-09-20T05:00:00.000Z', 'timestamp is EVE event time');

    // Run 2 at T2
    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      now: () => '2026-09-20T10:00:00.000Z',
    });

    const txAfterT2 = (await IndexedDbStore.getCharacterTransaction(901))!;
    assert(txAfterT2.first_seen_at === '2026-09-20T08:00:00.000Z', 'first_seen_at strictly preserved as T1');
    assert(txAfterT2.last_seen_at === '2026-09-20T10:00:00.000Z', 'last_seen_at updated to T2');
    assert(txAfterT2.timestamp === '2026-09-20T05:00:00.000Z', 'timestamp remains untouched');

    console.log('  [PASS] Test 16: first_seen_at and last_seen_at lifecycle verified.');
  }

  // --------------------------------------------------------------------------
  // Test 17: Absolute Non-Interference: Zero Automatic Correlation or Mutation
  // --------------------------------------------------------------------------
  console.log('--- Test 17: Zero automatic correlation or outcome mutation ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    // Create an opportunity observation in IndexedDbStore
    const testObservation: OpportunityObservation = {
      observation_id: 'obs_test_correlation_zero',
      opportunity_id: 'opp_test_123',
      timestamp: '2026-09-20T07:00:00Z',
      type_id: 34,
      type_name: 'Tritanium',
      source_region_id: 10000002,
      dest_region_id: 10000043,
      source_hub_id: 'jita',
      dest_hub_id: 'amarr',
      strategy: 'immediate',
      buy_price: 5.0,
      sell_price: 5.5,
      quantity: 100000,
      net_profit: 50000,
      roi: 0.1,
      expected_days_to_sell: 1,
      capturable_profit: 50000,
      profit_per_day: 50000,
      overall_score: 85,
      liquidity_score: 90,
      stability_score: 80,
      data_confidence: 95,
      is_anomalous: false,
      bottleneck: 'capital',
    };

    await IndexedDbStore.saveOpportunityObservations([testObservation]);

    const obsCountBefore = (await IndexedDbStore.getOpportunityObservations(34)).length;
    assert(obsCountBefore >= 1, 'Observation saved in store');

    // Run transaction ingestion
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return {
        ok: true,
        status: 200,
        data: [
          {
            transaction_id: 9999,
            type_id: 34,
            location_id: 60003760,
            quantity: 50000,
            unit_price: 5.0,
            date: '2026-09-20T07:15:00Z',
            is_buy: true,
          },
        ],
      };
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    // Verify opportunity observations are completely untouched
    const obsAfter = await IndexedDbStore.getOpportunityObservations(34);
    assert(obsAfter.length === obsCountBefore, 'Observations count unchanged');

    // Verify stored observation fields are unchanged
    const targetObs = obsAfter.find((o) => o.observation_id === 'obs_test_correlation_zero')!;
    assert(targetObs.type_id === 34, 'Observation type_id untouched');
    assert((targetObs as any).execution_outcome === undefined, 'Zero execution_outcome on observation');
    assert((targetObs as any).match_level === undefined, 'Zero match_level on observation');

    console.log('  [PASS] Test 17: Zero automatic correlation or outcome mutation verified.');
  }

  // ==========================================================================
  // CHANTIER 3B-2 HARDENING GATE TESTS (HG-1 to HG-12)
  // ==========================================================================
  console.log('\n==========================================================================');
  console.log('--- RUNNING CHANTIER 3B-2 HARDENING GATE TESTS (HG-1 TO HG-12) ---');
  console.log('==========================================================================');

  // --------------------------------------------------------------------------
  // HG-1: 5xx retry réel (succeeds on 2nd attempt, transactions persisted)
  // --------------------------------------------------------------------------
  console.log('--- HG-1: 5xx retry réel ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    let attempt = 0;
    let page1Attempts = 0;
    const sleepCalls: number[] = [];
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      attempt++;
      if (opts?.from_id === undefined) {
        page1Attempts++;
      }
      if (attempt === 1) {
        return { ok: false, status: 503, data: null, error: 'Service Unavailable' };
      }
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return {
        ok: true,
        status: 200,
        data: [
          {
            transaction_id: 7001,
            type_id: 34,
            location_id: 60003760,
            quantity: 1500,
            unit_price: 5.5,
            date: '2026-09-21T02:00:00Z',
            is_buy: true,
          },
        ],
      };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    assert(page1Attempts === 2, `Expected 2 attempts for page 1, got ${page1Attempts}`);
    assert(attempt === 3, `Expected 3 total calls (2 for page 1, 1 for terminal page 2), got ${attempt}`);
    assert(sleepCalls.length === 1, 'Exponential backoff sleep was invoked');
    assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected NO_MORE_DATA, got ${summary.stopped_reason}`);
    assert(summary.transactions_valid === 1, '1 valid transaction processed on retry');
    assert(summary.data_state === 'VALID', 'data_state is VALID');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 1 && inStore[0].transaction_id === 7001, 'Transaction 7001 persisted in store');
    console.log('  [PASS] HG-1: 5xx real retry and persistence verified.');
  }

  // --------------------------------------------------------------------------
  // HG-2: Retry borné (5xx repeatedly fails, stops at maxRetries with NETWORK_ERROR)
  // --------------------------------------------------------------------------
  console.log('--- HG-2: Retry borné sur 5xx ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    let attempt = 0;
    mockAdapter.setCustomHandler(async () => {
      attempt++;
      return { ok: false, status: 500, data: null, error: 'Internal Server Error' };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      maxRetries: 2,
      sleepFn: async () => {},
    });

    // Initial attempt (1) + 2 retries = 3 calls
    assert(attempt === 3, `Expected 3 attempts (1 initial + 2 retries), got ${attempt}`);
    assert(summary.stopped_reason === 'NETWORK_ERROR', `Expected NETWORK_ERROR, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'pagination_completed must be false');
    assert(summary.data_state === 'ERROR', 'data_state must be ERROR');
    console.log('  [PASS] HG-2: Bounded retry for 5xx verified.');
  }

  // --------------------------------------------------------------------------
  // HG-3: 429 + Retry-After (bounded wait & retry succeeds)
  // --------------------------------------------------------------------------
  console.log('--- HG-3: 429 + Retry-After (bounded wait & retry) ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    let attempt = 0;
    let page1Attempts = 0;
    const sleptMs: number[] = [];
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      attempt++;
      if (opts?.from_id === undefined) {
        page1Attempts++;
      }
      if (attempt === 1) {
        return {
          ok: false,
          status: 429,
          data: null,
          error: 'Too Many Requests',
          retryAfterSeconds: 2,
        };
      }
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return {
        ok: true,
        status: 200,
        data: [
          {
            transaction_id: 7003,
            type_id: 34,
            location_id: 60003760,
            quantity: 500,
            unit_price: 5.2,
            date: '2026-09-21T02:15:00Z',
            is_buy: false,
          },
        ],
      };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      sleepFn: async (ms) => {
        sleptMs.push(ms);
      },
      maxWaitRetryAfterMs: 5000,
    });

    assert(page1Attempts === 2, `Expected 2 attempts for page 1, got ${page1Attempts}`);
    assert(attempt === 3, `Expected 3 total calls, got ${attempt}`);
    assert(sleptMs.length === 1 && sleptMs[0] === 2000, 'Slept exactly 2000ms as per Retry-After: 2');
    assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected NO_MORE_DATA, got ${summary.stopped_reason}`);
    assert(summary.transactions_valid === 1, 'Transaction 7003 processed on retry');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.some((t) => t.transaction_id === 7003), 'Transaction 7003 committed to IndexedDB');
    console.log('  [PASS] HG-3: 429 bounded wait & retry verified.');
  }

  // --------------------------------------------------------------------------
  // HG-4: 429 Retry-After dépasse le max wait (arrête immédiatement en RATE_LIMITED)
  // --------------------------------------------------------------------------
  console.log('--- HG-4: 429 Retry-After dépasse le max wait ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    let slept = false;
    mockAdapter.setCustomHandler(async () => {
      return {
        ok: false,
        status: 429,
        data: null,
        error: 'Too Many Requests',
        retryAfterSeconds: 120, // 2 minutes
      };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      maxWaitRetryAfterMs: 10000, // max wait is 10s
      sleepFn: async () => {
        slept = true;
      },
    });

    assert(!slept, 'Should not sleep if Retry-After exceeds maxWaitRetryAfterMs');
    assert(summary.stopped_reason === 'RATE_LIMITED', `Expected RATE_LIMITED, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'pagination_completed must be false');
    assert(summary.errors.some((e) => e.includes('exceeds maximum bounded wait')), 'Error mentions max bounded wait');
    console.log('  [PASS] HG-4: 429 exceeding max wait correctly halts with RATE_LIMITED.');
  }

  // --------------------------------------------------------------------------
  // HG-5: 420 + Error-Limit Reset (respects reset window)
  // --------------------------------------------------------------------------
  console.log('--- HG-5: 420 + Error-Limit Reset ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    let attempt = 0;
    let page1Attempts = 0;
    const sleptMs: number[] = [];
    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      attempt++;
      if (opts?.from_id === undefined) {
        page1Attempts++;
      }
      if (attempt === 1) {
        return {
          ok: false,
          status: 420,
          data: null,
          error: 'Error Limit Exceeded',
          errorLimitReset: 3, // 3 seconds
        };
      }
      if (opts?.from_id !== undefined) {
        return { ok: true, status: 200, data: [] };
      }
      return {
        ok: true,
        status: 200,
        data: [
          {
            transaction_id: 7005,
            type_id: 34,
            location_id: 60003760,
            quantity: 300,
            unit_price: 5.1,
            date: '2026-09-21T02:30:00Z',
            is_buy: true,
          },
        ],
      };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      maxWaitRetryAfterMs: 10000,
      sleepFn: async (ms) => {
        sleptMs.push(ms);
      },
    });

    assert(page1Attempts === 2, `Expected 2 attempts for page 1, got ${page1Attempts}`);
    assert(attempt === 3, `Expected 3 total calls, got ${attempt}`);
    assert(sleptMs.length === 1 && sleptMs[0] === 3000, 'Slept 3000ms as per errorLimitReset: 3');
    assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected NO_MORE_DATA, got ${summary.stopped_reason}`);
    assert(summary.transactions_valid === 1, 'Transaction 7005 processed');

    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.some((t) => t.transaction_id === 7005), 'Transaction 7005 committed');
    console.log('  [PASS] HG-5: 420 error-limit reset window verified.');
  }

  // --------------------------------------------------------------------------
  // HG-6: Timeout effectif via timeoutMs
  // --------------------------------------------------------------------------
  console.log('--- HG-6: Timeout effectif via timeoutMs ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    // Simulate hanging network request
    mockAdapter.setCustomHandler(async (_cId, _token, opts) => {
      return new Promise<EsiWalletTransactionResponse>((resolve) => {
        const timer = setTimeout(() => {
          resolve({ ok: true, status: 200, data: [] });
        }, 300);

        if (opts && (opts as any).signal) {
          (opts as any).signal.addEventListener('abort', () => {
            clearTimeout(timer);
          });
        }
      });
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      timeoutMs: 30, // 30ms timeout
    });

    assert(summary.stopped_reason === 'NETWORK_ERROR', `Expected NETWORK_ERROR, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'pagination_completed must be false');
    assert(summary.errors.some((e) => e.includes('timed out after 30ms')), 'Error records explicit timeout message');
    console.log('  [PASS] HG-6: Configurable timeoutMs verified.');
  }

  // --------------------------------------------------------------------------
  // HG-7: Page 1 persistée malgré échec Page 2 (503 retries épuisés)
  // --------------------------------------------------------------------------
  console.log('--- HG-7: Page 1 persistée malgré échec Page 2 ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    const page1: RawEsiTransactionInput[] = [];
    for (let i = 1; i <= 10; i++) {
      page1.push({
        transaction_id: 7100 + i,
        type_id: 34,
        location_id: 60003760,
        quantity: 100 * i,
        unit_price: 5.0,
        date: `2026-09-21T03:00:${i < 10 ? '0' + i : i}Z`,
        is_buy: true,
      });
    }

    mockAdapter.setCustomHandler(async (cId, token, opts) => {
      if (opts?.from_id === undefined) {
        return { ok: true, status: 200, data: page1 };
      }
      // Page 2 always fails with 503
      return { ok: false, status: 503, data: null, error: 'Database Unavailable' };
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      maxRetries: 2,
      sleepFn: async () => {},
    });

    assert(summary.pages_fetched === 1, 'Only page 1 succeeded');
    assert(summary.stopped_reason === 'NETWORK_ERROR', `Expected NETWORK_ERROR, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'pagination_completed must be false');
    assert(summary.data_state === 'PARTIAL', 'data_state is PARTIAL');
    assert(summary.health_status === 'PARTIAL', 'health_status is PARTIAL');
    assert(summary.transactions_valid === 10, 'All 10 items from page 1 validated');

    // Verify all 10 items are committed to IndexedDB
    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 10, `All 10 items must be persisted in store, got ${inStore.length}`);
    for (let i = 1; i <= 10; i++) {
      assert(inStore.some((t) => t.transaction_id === 7100 + i), `Item #${7100 + i} persisted`);
    }
    console.log('  [PASS] HG-7: Page 1 persistence strictly preserved despite Page 2 failure.');
  }

  // --------------------------------------------------------------------------
  // HG-8: Gap Bridging (local: 105, 103, 101; ESI: 108, 107, 106, 105, 104, 103, 102, 101)
  // --------------------------------------------------------------------------
  console.log('--- HG-8: Gap Bridging ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    // Seed local storage with 105, 103, 101
    const seedTransactions: PersistedCharacterTransaction[] = [105, 103, 101].map((id) => ({
      transaction_id: id,
      character_id: charId,
      timestamp: '2026-09-20T10:00:00.000Z',
      type_id: 34,
      quantity: 100,
      unit_price: 5.0,
      total_value: 500.0,
      is_buy: true,
      is_personal: true,
      location_id: 60003760,
      journal_ref_id: id * 10,
      client_id: 1000,
      first_seen_at: '2026-09-20T10:00:00.000Z',
      last_seen_at: '2026-09-20T10:00:00.000Z',
      raw_hash: `hash_${id}`,
      ingestion_version: '1.0.0',
      source_endpoint: `/characters/${charId}/wallet/transactions/`,
      source: 'ESI',
      data_state: 'VALID',
    }));

    await IndexedDbStore.saveCharacterTransactions(seedTransactions);

    // ESI returns 108, 107, 106, 105, 104, 103, 102, 101
    const esiBatch: RawEsiTransactionInput[] = [108, 107, 106, 105, 104, 103, 102, 101].map((id) => ({
      transaction_id: id,
      type_id: 34,
      location_id: 60003760,
      quantity: 100,
      unit_price: 5.0,
      date: `2026-09-21T0${id % 10}:00:00Z`,
      is_buy: true,
    }));

    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: esiBatch,
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'ANCHOR_REACHED', `Expected ANCHOR_REACHED, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === true, 'pagination_completed must be true');
    assert(summary.transactions_new === 5, `Expected 5 new transactions (108, 107, 106, 104, 102), got ${summary.transactions_new}`);
    assert(summary.transactions_existing === 3, `Expected 3 existing transactions (105, 103, 101), got ${summary.transactions_existing}`);

    // Verify all 8 transactions are now in store
    const inStore = await IndexedDbStore.getCharacterTransactions(charId);
    assert(inStore.length === 8, `Expected 8 transactions in store, got ${inStore.length}`);
    for (const id of [101, 102, 103, 104, 105, 106, 107, 108]) {
      assert(inStore.some((t) => t.transaction_id === id), `Transaction #${id} is in store`);
    }
    console.log('  [PASS] HG-8: Gap bridging correctly recovered all missing intermediate transactions.');
  }

  // --------------------------------------------------------------------------
  // HG-9: Pagination sans progression (oldestInBatch === currentFromId)
  // --------------------------------------------------------------------------
  console.log('--- HG-9: Pagination sans progression ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    // Page 1 returns [100, 95] -> next from_id will be 95
    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: [
        { transaction_id: 100, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T01:00:00Z', is_buy: true },
        { transaction_id: 95, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T00:50:00Z', is_buy: true },
      ],
    });

    // Page 2 (from_id: 95) returns items [98, 95] where oldestInBatch is still 95!
    mockAdapter.setResponseForFromId(95, {
      ok: true,
      status: 200,
      data: [
        { transaction_id: 98, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T00:55:00Z', is_buy: true },
        { transaction_id: 95, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T00:50:00Z', is_buy: true },
      ],
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'NETWORK_ERROR', `Expected NETWORK_ERROR on stagnant pagination, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === false, 'pagination_completed must be false');
    assert(summary.data_state === 'PARTIAL', 'data_state is PARTIAL (page 1 saved)');
    assert(summary.errors.some((e) => e.includes('Pagination stagnant')), 'Error mentions pagination stagnant');
    console.log('  [PASS] HG-9: Stagnant pagination safely trapped without infinite loop or false completeness.');
  }

  // --------------------------------------------------------------------------
  // HG-10: Ancre seule en dernière page (Anchor-only final page)
  // --------------------------------------------------------------------------
  console.log('--- HG-10: Ancre seule en dernière page ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    // Page 1: [105, 104] -> oldest is 104
    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: [
        { transaction_id: 105, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T01:00:00Z', is_buy: true },
        { transaction_id: 104, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T00:50:00Z', is_buy: true },
      ],
    });

    // Page 2: only contains the anchor 104
    mockAdapter.setResponseForFromId(104, {
      ok: true,
      status: 200,
      data: [
        { transaction_id: 104, type_id: 34, location_id: 60003760, quantity: 10, unit_price: 5.0, date: '2026-09-21T00:50:00Z', is_buy: true },
      ],
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    assert(summary.stopped_reason === 'NO_MORE_DATA', `Expected NO_MORE_DATA, got ${summary.stopped_reason}`);
    assert(summary.pagination_completed === true, 'pagination_completed must be true');
    assert(summary.transactions_valid === 2, '2 transactions valid');
    assert(summary.duplicates_removed === 1, 'Anchor transaction on page 2 was deduplicated');
    console.log('  [PASS] HG-10: Anchor-only final page terminates with NO_MORE_DATA and pagination_completed.');
  }

  // --------------------------------------------------------------------------
  // HG-11: Absence absolue de mutation de OpportunityObservation
  // --------------------------------------------------------------------------
  console.log('--- HG-11: Absence absolue de mutation de OpportunityObservation ---');
  {
    await IndexedDbStore.clearAll();
    mockAdapter.reset();
    const charId = 2112001;

    const testObservation: OpportunityObservation = {
      observation_id: 'obs_hg11_check',
      opportunity_id: 'opp_hg11_test',
      timestamp: '2026-09-21T00:00:00Z',
      type_id: 34,
      type_name: 'Tritanium',
      source_region_id: 10000002,
      dest_region_id: 10000043,
      source_hub_id: 'jita',
      dest_hub_id: 'amarr',
      strategy: 'immediate',
      buy_price: 5.0,
      sell_price: 5.5,
      quantity: 100000,
      net_profit: 50000,
      roi: 0.1,
      expected_days_to_sell: 1,
      capturable_profit: 50000,
      profit_per_day: 50000,
      overall_score: 85,
      liquidity_score: 90,
      stability_score: 80,
      data_confidence: 95,
      is_anomalous: false,
      bottleneck: 'capital',
    };

    await IndexedDbStore.saveOpportunityObservations([testObservation]);

    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: [
        {
          transaction_id: 99999,
          type_id: 34,
          location_id: 60003760,
          quantity: 100000,
          unit_price: 5.0,
          date: '2026-09-21T00:05:00Z',
          is_buy: true,
        },
      ],
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
    });

    const storedObs = (await IndexedDbStore.getOpportunityObservations(34)).find(
      (o) => o.observation_id === 'obs_hg11_check'
    )!;

    assert((storedObs as any).execution_outcome === undefined, 'execution_outcome is undefined');
    assert((storedObs as any).realized === undefined, 'realized is undefined');
    assert((storedObs as any).realized_profit === undefined, 'realized_profit is undefined');
    assert((storedObs as any).prediction_error_pct === undefined, 'prediction_error_pct is undefined');
    console.log('  [PASS] HG-11: Absolute immutability of OpportunityObservation verified.');
  }

  // --------------------------------------------------------------------------
  // HG-12: Options de synchronisation effectives (maxRetries, retryOnTransientError, timeoutMs)
  // --------------------------------------------------------------------------
  console.log('--- HG-12: Options de synchronisation effectives ---');
  {
    mockAdapter.reset();
    const charId = 2112001;

    // Test A: retryOnTransientError = false -> stops immediately on 503 without retries
    let attemptA = 0;
    mockAdapter.setCustomHandler(async () => {
      attemptA++;
      return { ok: false, status: 503, data: null, error: 'Service Unavailable' };
    });

    const summaryA = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      retryOnTransientError: false,
      maxRetries: 3,
    });

    assert(attemptA === 1, `Expected exactly 1 attempt with retryOnTransientError=false, got ${attemptA}`);
    assert(summaryA.stopped_reason === 'NETWORK_ERROR', 'Stopped with NETWORK_ERROR immediately');

    // Test B: maxRetries = 1 vs maxRetries = 3
    let attemptB = 0;
    mockAdapter.setCustomHandler(async () => {
      attemptB++;
      return { ok: false, status: 503, data: null, error: 'Service Unavailable' };
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      retryOnTransientError: true,
      maxRetries: 1,
      sleepFn: async () => {},
    });

    assert(attemptB === 2, `Expected 2 attempts with maxRetries=1, got ${attemptB}`);

    let attemptC = 0;
    mockAdapter.setCustomHandler(async () => {
      attemptC++;
      return { ok: false, status: 503, data: null, error: 'Service Unavailable' };
    });

    await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      retryOnTransientError: true,
      maxRetries: 3,
      sleepFn: async () => {},
    });

    assert(attemptC === 4, `Expected 4 attempts with maxRetries=3, got ${attemptC}`);
    console.log('  [PASS] HG-12: Options maxRetries, retryOnTransientError, and timeoutMs proven effective.');
  }

  // FIN-002: collection coverage is explicit and separate from source health.
  {
    const completeFromFreshHistory = deriveTransactionHistoryCoverage({
      full_history_requested: true,
      stopped_reason: 'NO_MORE_DATA',
      transactions_received: 100,
    });
    assert(
      completeFromFreshHistory === 'COMPLETE_FOR_SCOPE',
      'full-history synchronization reaching NO_MORE_DATA must establish complete source-history coverage',
    );

    const completeFromFirstSync = deriveTransactionHistoryCoverage({
      full_history_requested: false,
      stopped_reason: 'NO_MORE_DATA',
      transactions_received: 100,
    });
    assert(
      completeFromFirstSync === 'COMPLETE_FOR_SCOPE',
      'first synchronization reaching NO_MORE_DATA without a prior anchor may establish complete source-history coverage',
    );

    const incrementalAnchor = deriveTransactionHistoryCoverage({
      full_history_requested: false,
      last_known_transaction_id_before_sync: 5000,
      stopped_reason: 'ANCHOR_REACHED',
      transactions_received: 50,
    });
    assert(
      incrementalAnchor === 'PARTIAL',
      'incremental synchronization reaching a known anchor must remain partial for full-history coverage',
    );

    const interrupted = deriveTransactionHistoryCoverage({
      full_history_requested: true,
      stopped_reason: 'NETWORK_ERROR',
      transactions_received: 50,
    });
    assert(
      interrupted === 'PARTIAL',
      'interrupted synchronization after received data must remain partial',
    );

    const failedBeforeData = deriveTransactionHistoryCoverage({
      full_history_requested: true,
      stopped_reason: 'AUTH_REQUIRED',
      transactions_received: 0,
    });
    assert(
      failedBeforeData === 'UNKNOWN',
      'authorization failure before any data must keep history coverage unknown',
    );
  }

  // FIN-002: the latest sync coverage must be durable and must not overwrite snapshot freshness.
  {
    mockAdapter.reset();
    const charId = 2112001;
    mockAdapter.setResponseForFromId(undefined, {
      ok: true,
      status: 200,
      data: [],
    });

    const summary = await CharacterTransactionSyncService.syncCharacterTransactions(charId, {
      esiAdapter: mockAdapter,
      fullHistory: true,
    });

    assert(summary.history_coverage === 'COMPLETE_FOR_SCOPE', 'empty full-history sync must still establish complete source-history coverage');
    assert(summary.economic_origin_coverage === 'UNKNOWN', 'economic-origin coverage remains unknown while non-market origins are not covered');

    const persistedSummary = CharacterRepository.getInstance().getTransactionSyncSummary(charId);
    assert(
      persistedSummary?.history_coverage === 'COMPLETE_FOR_SCOPE',
      'transaction sync coverage must be durably persisted',
    );
    assert(
      persistedSummary?.health_status === 'LIVE',
      'durable sync summary must preserve source health separately from coverage',
    );
  }

  console.log('\n================================================================');
  console.log('ALL INGESTION & HARDENING TESTS (17 + 12 = 29) PASSED (100%)');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\nFAILED TEST SUITE:', err);
  process.exit(1);
});
