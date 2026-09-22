import {
  RawMarketOrder,
  DailyMarketHistory,
  HistoricalStats,
  EveCharacterTransaction,
  EveCharacterOrderHistory,
  EveCharacterJournalEntry,
  MarketDataQuality,
  TypeCatalogMetadata,
} from '../types';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { AuthService } from './authService';
import { fetchBackendApi } from './backendApiClient';

export interface EsiFetchOrdersResult {
  orders: RawMarketOrder[];
  quality: MarketDataQuality;
}

export class EsiService {
  private static locationNameCache = new Map<number, string>();
  private static deduplicatedOrderStore = new Map<number, RawMarketOrder>();

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

    const orderId = Number(raw.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return { isValid: false, reason: `Invalid order_id: ${raw.order_id}` };
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
    const seenOrderIds = new Set<number>(); const validOrders: RawMarketOrder[] = [];
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
      const { response, data } = await fetchBackendApi<any[]>(`/api/markets/${regionId}/orders?type_id=${typeId}&page=${page}`);
      if (!response.ok) throw new Error(`Market API returned HTTP ${response.status}`);
      const xPages = response.headers.get('x-pages'); const parsed = xPages ? Number.parseInt(xPages, 10) : 1;
      return { data: Array.isArray(data) ? data : [], totalPages: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 1 };
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
        duplicate_orders_removed:0, rejected_orders_count:0, error_count:errorCount, last_error:lastError, confidence:0, sync_duration_ms:Date.now()-startTime
      }};
    }
    const completeness = pagesFetched >= expectedPages ? (validOrders.length === 0 ? 'empty' : 'complete') : pagesFetched > 0 ? 'partial' : 'empty';
    return { orders: validOrders, quality: {
      source:'esi', freshness:'fresh', completeness, data_state:completeness==='partial'?'PARTIAL':validOrders.length===0?'EMPTY':'VALID',
      health_status:completeness==='partial'?'PARTIAL':'LIVE', validation_status:errorCount===0&&rejectedCount===0?'valid':'suspicious',
      fetched_at:new Date().toISOString(), age_seconds:0, pages_fetched:pagesFetched, expected_pages:expectedPages,
      orders_fetched:totalRawOrders, orders_valid:validOrders.length, duplicate_orders_removed:duplicateCount, rejected_orders_count:rejectedCount,
      error_count:errorCount, last_error:lastError, confidence:expectedPages>0?Number((pagesFetched/expectedPages).toFixed(2)):1, sync_duration_ms:Date.now()-startTime
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
      const { response, data } = await fetchBackendApi<DailyMarketHistory[]>(`/api/markets/${regionId}/history?type_id=${typeId}`);
      if (!response.ok || !Array.isArray(data) || data.length === 0) return null;
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
    try { const {response,data}=await fetchBackendApi<any>(`/api/types/lookup/${typeId}`); if(!response.ok)return null; return {type_id:data.type_id,group_id:data.group_id,name:data.name,volume:data.volume||data.packaged_volume||0.01,packaged_volume:data.packaged_volume,description:data.description?String(data.description).replace(/<[^>]*>?/gm,'').slice(0,140):''}; }
    catch { return null; }
  }

  /**
   * Search for types by name using ESI
   */
  static async searchTypesByName(query: string) {
    if (!query || query.length < 2) return [];
    try { const {response,data}=await fetchBackendApi<any[]>(`/api/types/search?q=${encodeURIComponent(query)}&limit=5`); return response.ok&&Array.isArray(data)?data:[]; }
    catch { return []; }
  }

  /**
   * Helper to perform authenticated requests with automatic token refresh on 401
   */
  private static async executeWithAuthRefresh<T>(
    characterId: number,
    initialToken: string,
    requestFn: (token: string) => Promise<{ ok: boolean; status: number; data?: T }>
  ): Promise<T | null> {
    let token = initialToken;
    try {
      const res1 = await requestFn(token);
      if (res1.ok && res1.data !== undefined) {
        return res1.data;
      }

      // If 401 Unauthorized, try refreshing token immediately
      if (res1.status === 401) {
        const freshToken = await AuthService.getFreshToken(characterId);
        if (freshToken && freshToken !== token) {
          token = freshToken;
          const res2 = await requestFn(token);
          if (res2.ok && res2.data !== undefined) {
            return res2.data;
          }
        }
        AuthService.markTokenExpired(characterId, 'Session SSO expirée ou révoquée (401)');
      }
      return null;
    } catch (err) {
      console.warn(`Auth request error for character #${characterId}:`, err);
      return null;
    }
  }

  /**
   * Fetches active character orders using the character's OAuth token
   */
  static async fetchCharacterOrders(characterId: number, accessToken: string) {
    const result=await this.executeWithAuthRefresh<any[]>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/orders`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};return {ok:true,status:response.status,data:await response.json()};});return result||[];
  }

  /**
   * Fetches character wallet balance
   */
  static async fetchCharacterWallet(characterId: number, accessToken: string): Promise<number | null> {
    return await this.executeWithAuthRefresh<number>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/wallet`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};const data=await response.json();return {ok:true,status:response.status,data:data.balance};});
  }

  /**
   * Fetches character wallet transactions (real buy/sell market history)
   */
  static async fetchCharacterTransactions(characterId: number, accessToken: string, fromId?: number): Promise<EveCharacterTransaction[]> {
    const query=fromId!==undefined?`?from_id=${encodeURIComponent(String(fromId))}`:'';
    const result=await this.executeWithAuthRefresh<EveCharacterTransaction[]>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/transactions${query}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};return {ok:true,status:response.status,data:await response.json()};});return result||[];
  }

  /**
   * Fetches past closed/fulfilled/cancelled character orders (order history)
   */
  static async fetchCharacterOrderHistory(characterId: number, accessToken: string, page: number = 1): Promise<EveCharacterOrderHistory[]> {
    const result=await this.executeWithAuthRefresh<EveCharacterOrderHistory[]>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/orders/history?page=${page}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};return {ok:true,status:response.status,data:await response.json()};});return result||[];
  }

  /**
   * Fetches character wallet journal (taxes, fees, transfers, broker fees)
   */
  static async fetchCharacterJournal(characterId: number, accessToken: string) {
    const result=await this.executeWithAuthRefresh<any[]>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/journal`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};return {ok:true,status:response.status,data:await response.json()};});return result||[];
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
    return await this.executeWithAuthRefresh<{accounting:number;broker_relations:number}>(characterId,accessToken,async token=>{const response=await fetch(`/api/character/${characterId}/skills`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return {ok:false,status:response.status};const data=await response.json();const skills=data.skills||[];const accounting=skills.find((x:{skill_id:number})=>x.skill_id===3443)?.active_skill_level??0;const broker_relations=skills.find((x:{skill_id:number})=>x.skill_id===3444)?.active_skill_level??0;return {ok:true,status:response.status,data:{accounting,broker_relations}};});
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
  }> {
    try {
      const res = await fetch(`/api/character/${characterId}/corporation`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data };
      }
      return { ok: false, error: `HTTP_${res.status}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /**
   * Fetches corporation wallet divisions and balances from ESI proxy.
   * If character lacks Director/Accountant roles or scopes, returns structured error without crashing.
   */
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
    const resObj = await this.executeWithAuthRefresh<{
      corporation_id: number;
      wallets: Array<{ division: number; name: string; balance: number }>;
    }>(characterId, accessToken, async (token: string) => {
      try {
        const res = await fetch(`/api/character/${characterId}/corporation/wallets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          return { ok: true, status: res.status, data };
        }
        return {
          ok: false,
          status: res.status,
          error: data.message || data.error || `HTTP_${res.status}`,
        };
      } catch (err) {
        return { ok: false, status: 500, error: String(err) };
      }
    });

    if (resObj) {
      return { ok: true, data: resObj };
    }
    return { ok: false, error: 'CORPORATION_WALLETS_UNAVAILABLE' };
  }

  /**
   * Fetches metadata status of the Type Catalog
   */
  static async getTypeCatalogStatus(): Promise<TypeCatalogMetadata> {
    const response = await fetch('/api/types/status');
    if (!response.ok) {
      throw new Error(`Catalog status endpoint returned HTTP ${response.status}`);
    }
    return await response.json();
  }

  /**
   * Fetches all tradeable market types with real average and adjusted prices from Tranquility.
   * Never silently swallows failures into empty arrays.
   */
  static async fetchAllMarketTypes(): Promise<Array<{
    type_id: number;
    name: string;
    group_id: number;
    category_id: number;
    volume: number;
    average_price?: number;
    adjusted_price?: number;
  }>> {
    try {
      const response = await fetch('/api/types/all');
      if (!response.ok) {
        let errDetails = `HTTP_${response.status}`;
        try {
          const errJson = await response.json();
          errDetails = errJson.error || errJson.message || errDetails;
        } catch {}
        throw new Error(`Failed to load market types catalog: ${errDetails}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        if (Array.isArray(data?.types)) return data.types;
        throw new Error('CATALOG_DATA_FORMAT_INVALID');
      }
      return data;
    } catch (err) {
      console.error('EsiService.fetchAllMarketTypes error:', err);
      throw err;
    }
  }

  /**
   * Fast search across market types with live ESI fallback
   */
  static async searchMarketTypes(query: string, limit = 50): Promise<Array<{
    type_id: number;
    name: string;
    group_id: number;
    category_id: number;
    volume: number;
    average_price?: number;
    adjusted_price?: number;
  }>> {
    try {
      const response = await fetch(`/api/types/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Type search returned HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.error('EsiService.searchMarketTypes error:', err);
      throw err;
    }
  }
}
