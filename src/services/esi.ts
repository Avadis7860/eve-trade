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

export interface EsiFetchOrdersResult {
  orders: RawMarketOrder[];
  quality: MarketDataQuality;
}

export class EsiService {
  private static BASE_URL = 'https://esi.evetech.net/latest';
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
   * Performs an HTTP GET with exponential backoff, jitter, timeout, and status code handling.
   */
  private static async fetchWithRetry(
    url: string,
    options: {
      maxRetries?: number;
      timeoutMs?: number;
      fallbackUrl?: string;
    } = {}
  ): Promise<{ response: Response; attempts: number }> {
    const maxRetries = options.maxRetries ?? 3;
    const timeoutMs = options.timeoutMs ?? 12000;
    let attempts = 0;
    let currentUrl = url;

    while (attempts < maxRetries) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(currentUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Success or 404 (valid negative response from ESI)
        if (res.ok || res.status === 404) {
          return { response: res, attempts };
        }

        // Handle Rate limit (429) or Service Unavailable (503) with Retry-After
        if (res.status === 429 || res.status === 503 || res.status === 420) {
          const retryAfterHeader = res.headers.get('Retry-After');
          const delaySec = retryAfterHeader ? Math.min(Number(retryAfterHeader) || 1, 5) : 1;
          const jitter = Math.random() * 200;
          await new Promise((resolve) => setTimeout(resolve, delaySec * 1000 + jitter));
          continue;
        }

        // Retryable Server Errors (500, 502, 504)
        if (res.status >= 500 && res.status <= 599) {
          if (attempts < maxRetries) {
            const backoff = Math.pow(2, attempts) * 200 + Math.random() * 150;
            await new Promise((resolve) => setTimeout(resolve, backoff));
            // Try fallback proxy on second attempt if available
            if (options.fallbackUrl && attempts === 2) {
              currentUrl = options.fallbackUrl;
            }
            continue;
          }
        }

        return { response: res, attempts };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (attempts >= maxRetries) {
          throw err;
        }
        const backoff = Math.pow(2, attempts) * 250 + Math.random() * 150;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        if (options.fallbackUrl && attempts === 2) {
          currentUrl = options.fallbackUrl;
        }
      }
    }

    throw new Error(`Failed after ${attempts} attempts to fetch ${url}`);
  }

  /**
   * Fetches active market orders for a given region and type with full pagination,
   * comprehensive error recovery, deduplication, and quality metadata tracking.
   */
  static async fetchLiveOrdersDetailed(
    regionId: number,
    typeId: number
  ): Promise<EsiFetchOrdersResult> {
    const startTime = Date.now();
    let pagesFetched = 0;
    let expectedPages = 1;
    let totalRawOrders = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    let lastError: string | undefined;

    const seenOrderIds = new Set<number>();
    const validOrders: RawMarketOrder[] = [];

    // 1. Fetch Page 1
    const page1Url = `${this.BASE_URL}/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}&page=1`;
    const fallbackPage1Url = `/api/markets/${regionId}/orders?type_id=${typeId}&page=1`;

    let page1Data: any[] = [];
    try {
      const { response: res1 } = await this.fetchWithRetry(page1Url, {
        maxRetries: 3,
        timeoutMs: 12000,
        fallbackUrl: fallbackPage1Url,
      });

      if (!res1.ok) {
        if (res1.status === 404) {
          // 404 means no orders exist for this type in this region (normal market condition)
          expectedPages = 1;
          pagesFetched = 1;
        } else {
          errorCount++;
          lastError = `ESI returned HTTP ${res1.status}`;
          throw new Error(lastError);
        }
      } else {
        pagesFetched = 1;
        // Parse X-Pages header
        const xPagesHeader = res1.headers.get('x-pages');
        if (xPagesHeader) {
          const parsedPages = parseInt(xPagesHeader, 10);
          if (!isNaN(parsedPages) && parsedPages > 1) {
            // Clamp to safe max (e.g. 50 pages)
            expectedPages = Math.min(parsedPages, 50);
          }
        }

        page1Data = await res1.json();
      }
    } catch (err: unknown) {
      errorCount++;
      lastError = String(err);
      // Return structured quality metadata with 0 confidence
      const quality: MarketDataQuality = {
        source: 'unavailable',
        freshness: 'expired',
        completeness: 'empty',
        validation_status: 'invalid',
        data_state: 'ERROR',
        health_status: 'ERROR',
        fetched_at: new Date().toISOString(),
        age_seconds: 0,
        pages_fetched: 0,
        expected_pages: 1,
        orders_fetched: 0,
        orders_valid: 0,
        duplicate_orders_removed: 0,
        rejected_orders_count: 0,
        error_count: errorCount,
        last_error: lastError,
        confidence: 0,
        sync_duration_ms: Date.now() - startTime,
      };
      return { orders: [], quality };
    }

    // Process Page 1 orders
    if (Array.isArray(page1Data)) {
      totalRawOrders += page1Data.length;
      for (const raw of page1Data) {
        const { isValid, order, reason } = this.validateOrder(raw, regionId, typeId);
        if (!isValid || !order) {
          rejectedCount++;
          continue;
        }
        if (seenOrderIds.has(order.order_id)) {
          duplicateCount++;
          continue;
        }
        seenOrderIds.add(order.order_id);
        this.deduplicatedOrderStore.set(order.order_id, order);
        validOrders.push(order);
      }
    }

    // 2. Fetch remaining pages if expectedPages > 1
    if (expectedPages > 1) {
      const remainingPages: number[] = [];
      for (let p = 2; p <= expectedPages; p++) {
        remainingPages.push(p);
      }

      // Concurrently fetch up to 3 pages at a time
      const chunkSize = 3;
      for (let i = 0; i < remainingPages.length; i += chunkSize) {
        const chunk = remainingPages.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (page) => {
            const pageUrl = `${this.BASE_URL}/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}&page=${page}`;
            const fallbackUrl = `/api/markets/${regionId}/orders?type_id=${typeId}&page=${page}`;
            try {
              const { response: pageRes } = await this.fetchWithRetry(pageUrl, {
                maxRetries: 3,
                timeoutMs: 12000,
                fallbackUrl,
              });
              if (pageRes.ok) {
                pagesFetched++;
                const data = await pageRes.json();
                if (Array.isArray(data)) {
                  totalRawOrders += data.length;
                  for (const raw of data) {
                    const { isValid, order } = this.validateOrder(raw, regionId, typeId);
                    if (!isValid || !order) {
                      rejectedCount++;
                      continue;
                    }
                    if (seenOrderIds.has(order.order_id)) {
                      duplicateCount++;
                      continue;
                    }
                    seenOrderIds.add(order.order_id);
                    this.deduplicatedOrderStore.set(order.order_id, order);
                    validOrders.push(order);
                  }
                }
              } else {
                errorCount++;
                lastError = `Page ${page} failed with HTTP ${pageRes.status}`;
              }
            } catch (err: unknown) {
              errorCount++;
              lastError = `Page ${page} failed: ${String(err)}`;
            }
          })
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const completeness = pagesFetched >= expectedPages ? (validOrders.length === 0 ? 'empty' : 'complete') : pagesFetched > 0 ? 'partial' : 'empty';
    const confidence = expectedPages > 0 ? Number((pagesFetched / expectedPages).toFixed(2)) : 1.0;
    const dataState = completeness === 'partial' ? 'PARTIAL' : validOrders.length === 0 ? 'EMPTY' : 'VALID';
    const healthStatus = completeness === 'partial' ? 'PARTIAL' : 'LIVE';

    const quality: MarketDataQuality = {
      source: 'esi',
      freshness: 'fresh',
      completeness,
      data_state: dataState,
      health_status: healthStatus,
      validation_status: errorCount === 0 && rejectedCount === 0 ? 'valid' : 'suspicious',
      fetched_at: new Date().toISOString(),
      age_seconds: 0,
      pages_fetched: pagesFetched,
      expected_pages: expectedPages,
      orders_fetched: totalRawOrders,
      orders_valid: validOrders.length,
      duplicate_orders_removed: duplicateCount,
      rejected_orders_count: rejectedCount,
      error_count: errorCount,
      last_error: lastError,
      confidence,
      sync_duration_ms: durationMs,
    };

    return { orders: validOrders, quality };
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
    const url = `${this.BASE_URL}/markets/${regionId}/history/?datasource=tranquility&type_id=${typeId}`;
    const fallbackUrl = `/api/markets/${regionId}/history?type_id=${typeId}`;

    try {
      const { response } = await this.fetchWithRetry(url, {
        maxRetries: 3,
        timeoutMs: 12000,
        fallbackUrl,
      });

      if (!response.ok) return null;

      const rawHistory: DailyMarketHistory[] = await response.json();
      if (!Array.isArray(rawHistory) || rawHistory.length === 0) return null;

      // Sort recent first
      const sorted = [...rawHistory].sort((a, b) => b.date.localeCompare(a.date));
      const last7 = sorted.slice(0, 7);
      const last30 = sorted.slice(0, 30);

      const median = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      };

      const vol7 = last7.map((h) => h.volume);
      const vol30 = last30.map((h) => h.volume);
      const prices30 = last30.map((h) => h.average);

      const avg7 = vol7.reduce((a, b) => a + b, 0) / Math.max(1, vol7.length);
      const avg30 = vol30.reduce((a, b) => a + b, 0) / Math.max(1, vol30.length);

      const trend: 'increasing' | 'stable' | 'decreasing' =
        avg7 > avg30 * 1.15 ? 'increasing' : avg7 < avg30 * 0.85 ? 'decreasing' : 'stable';

      return {
        type_id: typeId,
        region_id: regionId,
        daily_volume_7d_avg: Math.round(avg7),
        daily_volume_7d_median: Math.round(median(vol7)),
        daily_volume_30d_avg: Math.round(avg30),
        daily_volume_30d_median: Math.round(median(vol30)),
        daily_order_count_avg: Math.round(last7.reduce((a, b) => a + b.order_count, 0) / Math.max(1, last7.length)),
        price_median_30d: median(prices30),
        price_volatility: prices30.length > 1 ? (Math.max(...prices30) - Math.min(...prices30)) / Math.max(1, median(prices30)) : 0,
        volume_trend: trend,
        is_live_esi: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Look up a type by ID from ESI
   */
  static async lookupTypeById(typeId: number) {
    try {
      const response = await fetch(`${this.BASE_URL}/universe/types/${typeId}/?datasource=tranquility&language=en`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        type_id: data.type_id,
        group_id: data.group_id,
        name: data.name,
        volume: data.volume || data.packaged_volume || 0.01,
        packaged_volume: data.packaged_volume,
        description: data.description ? data.description.replace(/<[^>]*>?/gm, '').slice(0, 140) : '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Search for types by name using ESI
   */
  static async searchTypesByName(query: string) {
    if (!query || query.length < 2) return [];
    try {
      const response = await fetch(
        `${this.BASE_URL}/universe/ids/?datasource=tranquility&language=en`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([query]),
        }
      );
      if (!response.ok) return [];
      const data = await response.json();
      const inventoryTypes = data.inventory_types || [];
      const results = [];
      for (const item of inventoryTypes.slice(0, 5)) {
        const detail = await this.lookupTypeById(item.id);
        if (detail) results.push(detail);
      }
      return results;
    } catch {
      return [];
    }
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
    const result = await this.executeWithAuthRefresh<any[]>(characterId, accessToken, async (token) => {
      // 1. Try server proxy
      try {
        const response = await fetch(`/api/character/${characterId}/orders`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return { ok: true, status: response.status, data };
        }
        if (response.status === 401) {
          return { ok: false, status: 401 };
        }
      } catch (proxyErr) {
        console.warn(`[EsiService] Server proxy failed for character orders (${characterId}):`, proxyErr);
      }

      // 2. Direct ESI fallback
      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/orders/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch (directErr) {
        console.warn(`[EsiService] Direct ESI failed for character orders (${characterId}):`, directErr);
        return { ok: false, status: 500 };
      }
    });

    return result || [];
  }

  /**
   * Fetches character wallet balance
   */
  static async fetchCharacterWallet(characterId: number, accessToken: string): Promise<number | null> {
    return await this.executeWithAuthRefresh<number>(characterId, accessToken, async (token) => {
      try {
        const response = await fetch(`/api/character/${characterId}/wallet`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return { ok: true, status: response.status, data: data.balance };
        }
        if (response.status === 401) return { ok: false, status: 401 };
      } catch (proxyErr) {
        console.warn(`[EsiService] Server proxy failed for character wallet (${characterId}):`, proxyErr);
      }

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const balance = await directRes.json();
          return { ok: true, status: directRes.status, data: balance };
        }
        return { ok: false, status: directRes.status };
      } catch (directErr) {
        console.warn(`[EsiService] Direct ESI failed for character wallet (${characterId}):`, directErr);
        return { ok: false, status: 500 };
      }
    });
  }

  /**
   * Fetches character wallet transactions (real buy/sell market history)
   */
  static async fetchCharacterTransactions(characterId: number, accessToken: string): Promise<EveCharacterTransaction[]> {
    const result = await this.executeWithAuthRefresh<EveCharacterTransaction[]>(characterId, accessToken, async (token) => {
      try {
        const response = await fetch(`/api/character/${characterId}/transactions`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return { ok: true, status: response.status, data };
        }
        if (response.status === 401) return { ok: false, status: 401 };
      } catch (proxyErr) {
        console.warn(`[EsiService] Server proxy failed for character transactions (${characterId}):`, proxyErr);
      }

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/transactions/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch (directErr) {
        console.warn(`[EsiService] Direct ESI failed for character transactions (${characterId}):`, directErr);
        return { ok: false, status: 500 };
      }
    });

    return result || [];
  }

  /**
   * Fetches past closed/fulfilled/cancelled character orders (order history)
   */
  static async fetchCharacterOrderHistory(
    characterId: number,
    accessToken: string,
    page: number = 1
  ): Promise<EveCharacterOrderHistory[]> {
    const result = await this.executeWithAuthRefresh<EveCharacterOrderHistory[]>(characterId, accessToken, async (token) => {
      try {
        const response = await fetch(`/api/character/${characterId}/orders/history?page=${page}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return { ok: true, status: response.status, data };
        }
        if (response.status === 401) return { ok: false, status: 401 };
      } catch (proxyErr) {
        console.warn(`[EsiService] Server proxy failed for character order history (${characterId}):`, proxyErr);
      }

      try {
        const directRes = await fetch(
          `${this.BASE_URL}/characters/${characterId}/orders/history/?datasource=tranquility&page=${page}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch (directErr) {
        console.warn(`[EsiService] Direct ESI failed for character order history (${characterId}):`, directErr);
        return { ok: false, status: 500 };
      }
    });

    return result || [];
  }

  /**
   * Fetches character wallet journal (taxes, fees, transfers, broker fees)
   */
  static async fetchCharacterJournal(characterId: number, accessToken: string) {
    const result = await this.executeWithAuthRefresh<any[]>(characterId, accessToken, async (token) => {
      try {
        const response = await fetch(`/api/character/${characterId}/journal`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return { ok: true, status: response.status, data };
        }
        if (response.status === 401) return { ok: false, status: 401 };
      } catch (proxyErr) {
        console.warn(`[EsiService] Server proxy failed for character journal (${characterId}):`, proxyErr);
      }

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/journal/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch (directErr) {
        console.warn(`[EsiService] Direct ESI failed for character journal (${characterId}):`, directErr);
        return { ok: false, status: 500 };
      }
    });

    return result || [];
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
    return await this.executeWithAuthRefresh<{ accounting: number; broker_relations: number }>(
      characterId,
      accessToken,
      async (token) => {
        try {
          const response = await fetch(`/api/character/${characterId}/skills`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json();
            const skills = data.skills || [];
            const accounting = skills.find((s: { skill_id: number }) => s.skill_id === 3443)?.active_skill_level ?? 0;
            const brokerRel = skills.find((s: { skill_id: number }) => s.skill_id === 3444)?.active_skill_level ?? 0;
            return { ok: true, status: response.status, data: { accounting, broker_relations: brokerRel } };
          }
          if (response.status === 401) return { ok: false, status: 401 };
        } catch (proxyErr) {
          console.warn(`[EsiService] Server proxy failed for character skills (${characterId}):`, proxyErr);
        }

        try {
          const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/skills/?datasource=tranquility`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (directRes.ok) {
            const data = await directRes.json();
            const skills = data.skills || [];
            const accounting = skills.find((s: { skill_id: number }) => s.skill_id === 3443)?.active_skill_level ?? 0;
            const brokerRel = skills.find((s: { skill_id: number }) => s.skill_id === 3444)?.active_skill_level ?? 0;
            return { ok: true, status: directRes.status, data: { accounting, broker_relations: brokerRel } };
          }
          return { ok: false, status: directRes.status };
        } catch (directErr) {
          console.warn(`[EsiService] Direct ESI failed for character skills (${characterId}):`, directErr);
          return { ok: false, status: 500 };
        }
      }
    );
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
