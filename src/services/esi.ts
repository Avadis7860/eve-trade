import {
  RawMarketOrder,
  DailyMarketHistory,
  HistoricalStats,
  EveCharacterOrder,
  EveCharacterTransaction,
  EveCharacterOrderHistory,
  EveCharacterJournalEntry,
  MarketDataQuality,
  TypeCatalogMetadata,
} from '../types';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { AuthService } from './authService';
import { fetchBackendApi } from './backendApiClient';
import { normalizeOrderId } from '../engine/orderIdentity';
import {
  normalizeCorporationOrder,
  normalizeCorporationOrderHistory,
} from '../engine/corporationOrder';

export type EsiCollectionState =
  | 'AVAILABLE'
  | 'EMPTY'
  | 'UNAVAILABLE'
  | 'ERROR'
  | 'PARTIAL';

export interface EsiCollectionResult<T> {
  readonly state: EsiCollectionState;
  readonly data: T[];
  readonly status: number;
  readonly error?: string;
  readonly errorCode?: string;
  readonly reauthorizeRequired?: boolean;
}

function classifyCollectionResult<T>(
  result: {
    ok: boolean;
    status: number;
    data?: T[];
    error?: string;
    errorCode?: string;
    reauthorizeRequired?: boolean;
  },
): EsiCollectionResult<T> {
  if (result.ok && Array.isArray(result.data)) {
    return {
      state: result.status === 206
        ? 'PARTIAL'
        : result.data.length === 0
          ? 'EMPTY'
          : 'AVAILABLE',
      data: result.data,
      status: result.status,
    };
  }

  if (result.status === 304 || result.status === 204) {
    return {
      state: 'UNAVAILABLE',
      data: [],
      status: result.status,
      error: result.error || 'ESI returned no fresh collection payload',
    };
  }

  return {
    state: 'ERROR',
    data: [],
    status: result.status,
    error: result.error || 'ESI collection request failed',
    errorCode: result.errorCode,
    reauthorizeRequired: result.reauthorizeRequired,
  };
}

function unavailableCollection<T>(
  status: number,
  error: string,
): EsiCollectionResult<T> {
  return {
    state: 'UNAVAILABLE',
    data: [],
    status,
    error,
  };
}

export interface EsiFetchOrdersResult {
  orders: RawMarketOrder[];
  quality: MarketDataQuality;
}

const EVE_CORPORATION_ORDERS_SCOPE = 'esi-markets.read_corporation_orders.v1';

export class EsiService {
  private static locationNameCache = new Map<number, string>();
  private static deduplicatedOrderStore = new Map<string, RawMarketOrder>();

  /**
   * Returns current statistics of the deduplicated Order Database
   */
  static getOrderDatabaseStats() {
    return {
      total_orders_cached: this.deduplicatedOrderStore.size,
      cached_locations: this.locationNameCache.size,
    };
  }

  /**
   * Clears the order database cache
   */
  static clearOrderDatabase() {
    this.deduplicatedOrderStore.clear();
  }

  /**
   * Pure order validator: ensures orders conform to EVE Online game constraints.
   */
  static validateOrder(
    raw: any,
    expectedRegionId: number,
    expectedTypeId?: number
  ): { isValid: boolean; reason?: string; order?: RawMarketOrder } {
    if (!raw || typeof raw !== 'object') {
      return { isValid: false, reason: 'Order object is null or invalid' };
    }

    const orderId = normalizeOrderId(raw.order_id);
    if (!orderId) {
      return { isValid: false, reason: `Invalid or unsafe order_id: ${raw.order_id}` };
    }

    const typeId = Number(raw.type_id || expectedTypeId);
    if (!Number.isInteger(typeId) || typeId <= 0) {
      return { isValid: false, reason: `Invalid type_id: ${raw.type_id}` };
    }
    if (expectedTypeId && typeId !== expectedTypeId) {
      return { isValid: false, reason: `Type ID mismatch: got ${typeId}, expected ${expectedTypeId}` };
    }

    const price = Number(raw.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { isValid: false, reason: `Invalid price: ${raw.price}` };
    }

    const volumeRemain = Number(raw.volume_remain);
    if (!Number.isFinite(volumeRemain) || volumeRemain <= 0) {
      return { isValid: false, reason: `Invalid volume_remain: ${raw.volume_remain}` };
    }

    const volumeTotal = Number(raw.volume_total ?? volumeRemain);
    if (!Number.isFinite(volumeTotal) || volumeTotal < volumeRemain) {
      return { isValid: false, reason: `volume_total (${volumeTotal}) < volume_remain (${volumeRemain})` };
    }

    const systemId = Number(raw.system_id ?? 0);
    const locationId = Number(raw.location_id ?? 0);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return { isValid: false, reason: `Invalid location_id: ${raw.location_id}` };
    }

    const isBuyOrder = Boolean(raw.is_buy_order);
    const issuedStr = typeof raw.issued === 'string' ? raw.issued : new Date().toISOString();
    const duration = Number(raw.duration ?? 90);

    const validOrder: RawMarketOrder = {
      order_id: orderId,
      type_id: typeId,
      region_id: expectedRegionId,
      system_id: systemId,
      location_id: locationId,
      price: price,
      volume_remain: volumeRemain,
      volume_total: volumeTotal,
      min_volume: raw.min_volume ? Number(raw.min_volume) : 1,
      is_buy_order: isBuyOrder,
      order_range: raw.range || raw.order_range || 'region',
      issued: issuedStr,
      duration: duration,
      captured_at: new Date().toISOString(),
    };

    return { isValid: true, order: validOrder };
  }

  /**
   * Fetches active market orders for a given region and type with full pagination,
   * comprehensive error recovery, deduplication, and quality metadata tracking.
   */
  static async fetchLiveOrdersDetailed(regionId: number, typeId: number): Promise<EsiFetchOrdersResult> {
    const startTime = Date.now(); let pagesFetched = 0; let expectedPages = 1;
    let totalRawOrders = 0; let rejectedCount = 0; let duplicateCount = 0; let errorCount = 0;
    let lastError: string | undefined;
    let lastHttpStatus: number | undefined;
    let cacheStatus: 'HIT' | 'MISS' | 'REVALIDATED' | undefined;
    let esiErrorLimitRemaining: number | undefined;
    let esiErrorLimitResetSeconds: number | undefined;
    let retryAfterSeconds: number | undefined;
    const seenOrderIds = new Set<string>(); const validOrders: RawMarketOrder[] = [];
    const processPage = (pageData: any[]) => {
      totalRawOrders += pageData.length;
      for (const raw of pageData) {
        const { isValid, order } = this.validateOrder(raw, regionId, typeId);
        if (!isValid || !order) { rejectedCount++; continue; }
        if (seenOrderIds.has(order.order_id)) { duplicateCount++; continue; }
        seenOrderIds.add(order.order_id); this.deduplicatedOrderStore.set(order.order_id, order); validOrders.push(order);
      }
    };
    const fetchPage = async (page: number) => {
      const result = await fetchBackendApi<any[]>(`/api/markets/${regionId}/orders?type_id=${typeId}&page=${page}`);
      lastHttpStatus = result.status;
      const rawCacheStatus = result.headers.get('x-cache-status');
      if (rawCacheStatus === 'HIT' || rawCacheStatus === 'MISS' || rawCacheStatus === 'REVALIDATED') cacheStatus = rawCacheStatus;
      const rawRemain = result.headers.get('x-esi-error-limit-remain');
      const rawReset = result.headers.get('x-esi-error-limit-reset');
      const rawRetryAfter = result.headers.get('retry-after');
      if (rawRemain) esiErrorLimitRemaining = Number.parseInt(rawRemain, 10);
      if (rawReset) esiErrorLimitResetSeconds = Number.parseInt(rawReset, 10);
      if (rawRetryAfter) retryAfterSeconds = Number.parseInt(rawRetryAfter, 10);
      if (!result.ok && result.status !== 404) throw new Error(`Market API returned HTTP ${result.status}`);
      const xPages = result.headers.get('x-pages'); const parsed = xPages ? Number.parseInt(xPages, 10) : 1;
      return { data: Array.isArray(result.data) ? result.data : [], totalPages: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 1 };
    };
    try {
      const first = await fetchPage(1); pagesFetched = 1; expectedPages = first.totalPages; processPage(first.data);
      for (let page = 2; page <= expectedPages; page++) {
        try { const next = await fetchPage(page); pagesFetched++; processPage(next.data); }
        catch (err) { errorCount++; lastError = `Page ${page} failed: ${String(err)}`; }
      }
    } catch (err) {
      errorCount++; lastError = String(err);
      return { orders: [], quality: {
        source:'unavailable', freshness:'expired', completeness:'empty', validation_status:'invalid', data_state:'ERROR', health_status:'ERROR',
        fetched_at:new Date().toISOString(), age_seconds:0, pages_fetched:0, expected_pages:1, orders_fetched:0, orders_valid:0,
        duplicate_orders_removed:0, rejected_orders_count:0, error_count:errorCount, last_error:lastError, confidence:0, sync_duration_ms:Date.now()-startTime, last_http_status:lastHttpStatus, cache_status:cacheStatus, esi_error_limit_remaining:esiErrorLimitRemaining, esi_error_limit_reset_seconds:esiErrorLimitResetSeconds, retry_after_seconds:retryAfterSeconds
      }};
    }
    const completeness = pagesFetched >= expectedPages ? (validOrders.length === 0 ? 'empty' : 'complete') : pagesFetched > 0 ? 'partial' : 'empty';
    return { orders: validOrders, quality: {
      source:'esi', freshness:'fresh', completeness, data_state:completeness==='partial'?'PARTIAL':validOrders.length===0?'EMPTY':'VALID',
      health_status:completeness==='partial'?'PARTIAL':'LIVE', validation_status:errorCount===0&&rejectedCount===0?'valid':'suspicious',
      fetched_at:new Date().toISOString(), age_seconds:0, pages_fetched:pagesFetched, expected_pages:expectedPages,
      orders_fetched:totalRawOrders, orders_valid:validOrders.length, duplicate_orders_removed:duplicateCount, rejected_orders_count:rejectedCount,
      error_count:errorCount, last_error:lastError, confidence:expectedPages>0?Number((pagesFetched/expectedPages).toFixed(2)):1, sync_duration_ms:Date.now()-startTime, last_http_status:lastHttpStatus, cache_status:cacheStatus, esi_error_limit_remaining:esiErrorLimitRemaining, esi_error_limit_reset_seconds:esiErrorLimitResetSeconds, retry_after_seconds:retryAfterSeconds
    }};
  }

  /**
   * Fetches active market orders for a given region and type from EVE ESI.
   * Backward-compatible helper that returns strictly validated RawMarketOrder[].
   */
  static async fetchLiveOrders(regionId: number, typeId: number): Promise<RawMarketOrder[]> {
    const result = await this.fetchLiveOrdersDetailed(regionId, typeId);
    return result.orders;
  }

  /**
   * Fetches historical daily trade data from ESI (/markets/{region_id}/history/)
   * Computes 7d and 30d median volume, avg price, volatility, and trend.
   */
  static async fetchMarketHistory(regionId: number, typeId: number): Promise<HistoricalStats | null> {
    try {
      const result = await fetchBackendApi<DailyMarketHistory[]>(`/api/markets/${regionId}/history?type_id=${typeId}`);
      if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
      const data = result.data;
      const sorted=[...data].sort((a,b)=>b.date.localeCompare(a.date)), last7=sorted.slice(0,7), last30=sorted.slice(0,30);
      const median=(arr:number[])=>{if(!arr.length)return 0;const v=[...arr].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
      const vol7=last7.map(h=>h.volume), vol30=last30.map(h=>h.volume), prices30=last30.map(h=>h.average);
      const avg7=vol7.reduce((a,b)=>a+b,0)/Math.max(1,vol7.length), avg30=vol30.reduce((a,b)=>a+b,0)/Math.max(1,vol30.length);
      return {type_id:typeId,region_id:regionId,daily_volume_7d_avg:Math.round(avg7),daily_volume_7d_median:Math.round(median(vol7)),daily_volume_30d_avg:Math.round(avg30),daily_volume_30d_median:Math.round(median(vol30)),daily_order_count_avg:Math.round(last7.reduce((a,b)=>a+b.order_count,0)/Math.max(1,last7.length)),price_median_30d:median(prices30),price_volatility:prices30.length>1?(Math.max(...prices30)-Math.min(...prices30))/Math.max(1,median(prices30)):0,volume_trend:avg7>avg30*1.15?'increasing':avg7<avg30*0.85?'decreasing':'stable',is_live_esi:true};
    } catch { return null; }
  }

  /**
   * Look up a type by ID from ESI
   */
  static async lookupTypeById(typeId: number) {
    if (!Number.isInteger(typeId) || typeId <= 0) return null;
    try { const {ok,data}=await fetchBackendApi<any>(`/api/types/lookup/${typeId}`); if(!ok || !data)return null; return {type_id:data.type_id,group_id:data.group_id,name:data.name,volume:data.volume||data.packaged_volume||0.01,packaged_volume:data.packaged_volume,description:data.description?String(data.description).replace(/<[^>]*>?/gm,'').slice(0,140):''}; }
    catch { return null; }
  }

  /**
   * Search for types by name using ESI
   */
  static async searchTypesByName(query: string) {
    if (!query || query.length < 2) return [];
    try { const {ok,data}=await fetchBackendApi<any[]>(`/api/types/search?q=${encodeURIComponent(query)}&limit=5`); return ok&&Array.isArray(data)?data:[]; }
    catch { return []; }
  }

  /**
   * Helper to perform authenticated requests with automatic token refresh on 401
   */
  private static async executeWithAuthRefreshResult<T>(
    characterId: number,
    initialToken: string,
    requestFn: (token: string) => Promise<{
      ok: boolean;
      status: number;
      data?: T;
      error?: string;
      errorCode?: string;
      reauthorizeRequired?: boolean;
    }>
  ): Promise<{
    ok: boolean;
    status: number;
    data?: T;
    error?: string;
    errorCode?: string;
    reauthorizeRequired?: boolean;
  }> {
    let token = initialToken;
    try {
      const res1 = await requestFn(token);
      if (res1.ok && res1.data !== undefined) {
        return res1;
      }

      // If 401 Unauthorized, try refreshing token immediately.
      if (res1.status === 401) {
        const freshToken = await AuthService.getFreshToken(characterId);
        if (freshToken && freshToken !== token) {
          token = freshToken;
          const res2 = await requestFn(token);
          if (res2.ok && res2.data !== undefined) {
            return res2;
          }
          AuthService.markTokenExpired(characterId, 'Session SSO expirée ou révoquée (401)');
          return res2;
        }

        AuthService.markTokenExpired(characterId, 'Session SSO expirée ou révoquée (401)');
      }

      return res1;
    } catch (err) {
      console.warn(`Auth request error for character #${characterId}:`, err);
      return {
        ok: false,
        status: 500,
        error: String(err),
      };
    }
  }

  private static async executeWithAuthRefresh<T>(
    characterId: number,
    initialToken: string,
    requestFn: (token: string) => Promise<{ ok: boolean; status: number; data?: T }>
  ): Promise<T | null> {
    const result = await this.executeWithAuthRefreshResult(characterId, initialToken, requestFn);
    return result.ok && result.data !== undefined ? result.data : null;
  }

  /** Fetches active character orders with explicit data-state semantics. */
  static async fetchCharacterOrders(
    characterId: number,
    accessToken: string,
  ): Promise<EsiCollectionResult<EveCharacterOrder>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }

    const result = await this.executeWithAuthRefreshResult<EveCharacterOrder[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<EveCharacterOrder[]>(`/api/character/${characterId}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return {
          ok: response.ok,
          status: response.status,
          data: response.data ?? undefined,
          error: !response.ok ? `HTTP_${response.status}` : undefined,
        };
      },
    );

    return classifyCollectionResult(result);
  }

  static requireUsableCollection<T>(
    result: EsiCollectionResult<T>,
    label: string,
  ): T[] {
    if (result.state === 'AVAILABLE' || result.state === 'EMPTY') {
      return result.data;
    }

    throw new Error(
      `ESI ${label} unavailable [${result.state}] HTTP_${result.status}: ${result.error || 'no details'}`,
    );
  }

  /** Fetches character wallet balance */
  static async fetchCharacterWallet(characterId: number, accessToken: string): Promise<number | null> {
    return await this.executeWithAuthRefresh<number>(characterId, accessToken, async token => {
      const response = await fetchBackendApi<{ balance: number }>(`/api/character/${characterId}/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { ok: response.ok, status: response.status, data: response.data?.balance };
    });
  }

  /** Fetches character wallet transactions with explicit data-state semantics. */
  static async fetchCharacterTransactions(
    characterId: number,
    accessToken: string,
    fromId?: number,
  ): Promise<EsiCollectionResult<EveCharacterTransaction>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }

    const query = fromId !== undefined ? `?from_id=${encodeURIComponent(String(fromId))}` : '';
    const result = await this.executeWithAuthRefreshResult<EveCharacterTransaction[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<EveCharacterTransaction[]>(`/api/character/${characterId}/transactions${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return {
          ok: response.ok,
          status: response.status,
          data: response.data ?? undefined,
          error: !response.ok ? `HTTP_${response.status}` : undefined,
        };
      },
    );

    return classifyCollectionResult(result);
  }

  /** Fetches past character orders with explicit data-state semantics. */
  static async fetchCharacterOrderHistory(
    characterId: number,
    accessToken: string,
    page: number = 1,
  ): Promise<EsiCollectionResult<EveCharacterOrderHistory>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }
    if (!Number.isInteger(page) || page < 1 || page > 1000) {
      return unavailableCollection(400, 'INVALID_PAGE');
    }

    const result = await this.executeWithAuthRefreshResult<EveCharacterOrderHistory[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<EveCharacterOrderHistory[]>(`/api/character/${characterId}/orders/history?page=${page}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return {
          ok: response.ok,
          status: response.status,
          data: response.data ?? undefined,
          error: !response.ok ? `HTTP_${response.status}` : undefined,
        };
      },
    );

    return classifyCollectionResult(result);
  }

  /** Fetches character wallet journal with explicit data-state semantics. */
  static async fetchCharacterJournal(
    characterId: number,
    accessToken: string,
  ): Promise<EsiCollectionResult<any>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }

    const result = await this.executeWithAuthRefreshResult<any[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<any[]>(`/api/character/${characterId}/journal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return {
          ok: response.ok,
          status: response.status,
          data: response.data ?? undefined,
          error: !response.ok ? `HTTP_${response.status}` : undefined,
        };
      },
    );

    return classifyCollectionResult(result);
  }
  /** Fetches normalized active corporation orders observed by a character. */
  static async fetchCharacterCorporationOrders(
    characterId: number,
    accessToken: string,
    corporationId: number,
    corporationName?: string,
  ): Promise<EsiCollectionResult<EveCharacterOrder>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }
    if (!Number.isInteger(corporationId) || corporationId <= 0) {
      return classifyCollectionResult({
        ok: false,
        status: 400,
        error: 'INVALID_CORPORATION_ID',
      });
    }

    // CCP exposes character identity and granted scopes in the access-token JWT.
    // These checks are an early diagnostic gate; ESI remains authoritative.
    const tokenCharacterId = AuthService.getTokenCharacterId(accessToken);
    if (tokenCharacterId !== null && tokenCharacterId !== characterId) {
      return {
        state: 'ERROR',
        data: [],
        status: 403,
        error: 'CHARACTER_IDENTITY_MISMATCH',
        errorCode: 'CHARACTER_IDENTITY_MISMATCH',
        reauthorizeRequired: false,
      };
    }

    if (AuthService.hasTokenScope(accessToken, EVE_CORPORATION_ORDERS_SCOPE) === false) {
      return {
        state: 'ERROR',
        data: [],
        status: 403,
        error: 'CORP_ORDERS_SCOPE_MISSING',
        errorCode: 'CORP_ORDERS_SCOPE_MISSING',
        reauthorizeRequired: true,
      };
    }

    const result = await this.executeWithAuthRefreshResult<EveCharacterOrder[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<unknown>(
          `/api/character/${characterId}/corporation/orders`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const errorPayload =
          response.data && typeof response.data === 'object' && !Array.isArray(response.data)
            ? response.data as Record<string, unknown>
            : null;
        return {
          ok: response.ok,
          status: response.status,
          data: Array.isArray(response.data) ? response.data as EveCharacterOrder[] : undefined,
          error: !response.ok
            ? (typeof errorPayload?.error === 'string' ? errorPayload.error : 'HTTP_' + response.status)
            : undefined,
          errorCode: !response.ok && typeof errorPayload?.error === 'string'
            ? errorPayload.error
            : undefined,
          reauthorizeRequired: !response.ok && errorPayload?.reauthorize_required === true,
        };
      },
    );

    const classified = classifyCollectionResult(result);
    if (classified.state !== 'AVAILABLE' && classified.state !== 'EMPTY') {
      return classified;
    }

    const normalized = classified.data.map((raw) =>
      normalizeCorporationOrder(
        raw,
        characterId,
        corporationId,
        corporationName,
      ),
    );

    if (normalized.some((order) => order === null)) {
      return {
        state: 'ERROR',
        data: [],
        status: 502,
        error: 'INVALID_CORPORATION_ORDER_PAYLOAD',
      };
    }

    return {
      ...classified,
      data: normalized as EveCharacterOrder[],
    };
  }

  /** Fetches normalized corporation order history observed by a character. */
  static async fetchCharacterCorporationOrderHistory(
    characterId: number,
    accessToken: string,
    corporationId: number,
    corporationName?: string,
    page = 1,
  ): Promise<EsiCollectionResult<EveCharacterOrderHistory>> {
    if (!accessToken || !accessToken.trim()) {
      return unavailableCollection(401, 'MISSING_ACCESS_TOKEN');
    }
    if (!Number.isInteger(corporationId) || corporationId <= 0) {
      return classifyCollectionResult({
        ok: false,
        status: 400,
        error: 'INVALID_CORPORATION_ID',
      });
    }
    if (!Number.isInteger(page) || page < 1 || page > 1000) {
      return classifyCollectionResult({
        ok: false,
        status: 400,
        error: 'INVALID_PAGE',
      });
    }

    const result = await this.executeWithAuthRefreshResult<EveCharacterOrderHistory[]>(
      characterId,
      accessToken,
      async token => {
        const response = await fetchBackendApi<EveCharacterOrderHistory[]>(
          `/api/character/${characterId}/corporation/orders/history?page=${page}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return {
          ok: response.ok,
          status: response.status,
          data: response.data ?? undefined,
          error: !response.ok ? `HTTP_${response.status}` : undefined,
        };
      },
    );

    const classified = classifyCollectionResult(result);
    if (classified.state !== 'AVAILABLE' && classified.state !== 'EMPTY') {
      return classified;
    }

    const normalized = classified.data.map((raw) =>
      normalizeCorporationOrderHistory(
        raw,
        characterId,
        corporationId,
        corporationName,
      ),
    );

    if (normalized.some((order) => order === null)) {
      return {
        state: 'ERROR',
        data: [],
        status: 502,
        error: 'INVALID_CORPORATION_ORDER_HISTORY_PAYLOAD',
      };
    }

    return {
      ...classified,
      data: normalized as EveCharacterOrderHistory[],
    };
  }

  /**
   * Resolves any New Eden station or structure ID to a clean name via UniverseRepository
   */
  static async resolveLocationName(locationId: number, accessToken?: string): Promise<string> {
    const loc = await UniverseRepository.getInstance().resolveLocation(locationId, accessToken);
    return loc.name;
  }

  /**
   * Fetches character trading skills (Accounting, Broker Relations)
   */
  static async fetchCharacterSkills(characterId: number, accessToken: string) {
    return await this.executeWithAuthRefresh<{ accounting: number; broker_relations: number }>(characterId, accessToken, async token => {
      const response = await fetchBackendApi<{ skills?: Array<{ skill_id: number; active_skill_level?: number }> }>(`/api/character/${characterId}/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return { ok: false, status: response.status };
      const skills = response.data?.skills || [];
      const accounting = skills.find(x => x.skill_id === 3443)?.active_skill_level ?? 0;
      const broker_relations = skills.find(x => x.skill_id === 3444)?.active_skill_level ?? 0;
      return { ok: true, status: response.status, data: { accounting, broker_relations } };
    });
  }

  /**
   * Fetches character corporation profile (ID, Name, Ticker)
   */
  static async fetchCorporationInfo(
    characterId: number,
    accessToken?: string
  ): Promise<{
    ok: boolean;
    data?: {
      character_id: number;
      corporation_id: number;
      corporation_name: string;
      ticker?: string;
      member_count?: number;
    };
    error?: string;
    status?: number;
  }> {
    try {
      const res = await fetchBackendApi<any>(`/api/character/${characterId}/corporation`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (res.ok && res.data) return { ok: true, status: res.status, data: res.data };
      return { ok: false, status: res.status, error: `HTTP_${res.status}` };
    } catch (err) {
      return { ok: false, status: 500, error: String(err) };
    }
  }

  static async fetchCorporationWallets(
    characterId: number,
    accessToken: string
  ): Promise<{
    ok: boolean;
    data?: {
      corporation_id: number;
      wallets: Array<{ division: number; name: string; balance: number }>;
    };
    error?: string;
    status?: number;
  }> {
    const result = await this.executeWithAuthRefreshResult<{
      corporation_id: number;
      wallets: Array<{ division: number; name: string; balance: number }>;
    }>(characterId, accessToken, async token => {
      try {
        const res = await fetchBackendApi<any>(`/api/character/${characterId}/corporation/wallets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return {
          ok: res.ok,
          status: res.status,
          data: res.data ?? undefined,
          error: !res.ok ? `HTTP_${res.status}` : undefined,
        };
      } catch (err) {
        return { ok: false, status: 500, error: String(err) };
      }
    });

    if (result.ok && result.data) {
      return { ok: true, status: result.status, data: result.data };
    }

    return {
      ok: false,
      status: result.status,
      error: result.error || 'CORPORATION_WALLETS_UNAVAILABLE',
    };
  }
  /** Fetches metadata status of the Type Catalog */
  static async getTypeCatalogStatus(): Promise<TypeCatalogMetadata> {
    const result = await fetchBackendApi<TypeCatalogMetadata>('/api/types/status');
    if (!result.ok || !result.data) {
      throw new Error(`Catalog status endpoint returned HTTP ${result.status}`);
    }
    return result.data;
  }

  static async fetchAllMarketTypes(): Promise<Array<{
    type_id: number;
    name: string;
    group_id: number;
    category_id: number;
    volume: number;
    average_price?: number;
    adjusted_price?: number;
  }>> {
    const result = await fetchBackendApi<any>('/api/types/all');
    if (!result.ok || !result.data) throw new Error(`Failed to load market types catalog: HTTP_${result.status}`);
    const data = result.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.types)) return data.types;
    throw new Error('CATALOG_DATA_FORMAT_INVALID');
  }

  static async searchMarketTypes(query: string, limit = 50): Promise<Array<{
    type_id: number;
    name: string;
    group_id: number;
    category_id: number;
    volume: number;
    average_price?: number;
    adjusted_price?: number;
  }>> {
    const result = await fetchBackendApi<any[]>(`/api/types/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!result.ok || !Array.isArray(result.data)) throw new Error(`Type search returned HTTP ${result.status}`);
    return result.data;
  }
}
