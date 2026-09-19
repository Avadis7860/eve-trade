import {
  RawMarketOrder,
  DailyMarketHistory,
  HistoricalStats,
  EveCharacterTransaction,
  EveCharacterOrderHistory,
  EveCharacterJournalEntry,
} from '../types';
import { KNOWN_STATION_NAMES } from '../data/universe';
import { AuthService } from './authService';

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
   * Fetches active market orders for a given region and type from EVE ESI.
   * Guarantees strict deduplication on CCP order_id!
   */
  static async fetchLiveOrders(regionId: number, typeId: number): Promise<RawMarketOrder[]> {
    const url = `${this.BASE_URL}/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ESI returned status ${response.status}: ${response.statusText}`);
      }

      const orders: Array<{
        order_id: number;
        type_id: number;
        system_id: number;
        location_id: number;
        price: number;
        volume_remain: number;
        volume_total: number;
        is_buy_order: boolean;
        range?: string;
        issued: string;
        duration: number;
      }> = await response.json();
      
      const now = new Date().toISOString();
      const resultOrders: RawMarketOrder[] = [];

      for (const o of orders) {
        if (!o.order_id || o.price <= 0 || o.volume_remain <= 0) continue;

        const standardized: RawMarketOrder = {
          order_id: o.order_id,
          type_id: o.type_id || typeId,
          region_id: regionId,
          system_id: o.system_id,
          location_id: o.location_id,
          price: o.price,
          volume_remain: o.volume_remain,
          volume_total: o.volume_total,
          is_buy_order: o.is_buy_order,
          order_range: o.range,
          issued: o.issued,
          duration: o.duration,
          captured_at: now,
        };

        // Strict CCP order_id deduplication into the master database
        this.deduplicatedOrderStore.set(o.order_id, standardized);
        resultOrders.push(standardized);
      }

      return resultOrders;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Fetches historical daily trade data from ESI (/markets/{region_id}/history/)
   * Computes 7d and 30d median volume, avg price, volatility, and trend.
   */
  static async fetchMarketHistory(regionId: number, typeId: number): Promise<HistoricalStats | null> {
    const url = `${this.BASE_URL}/markets/${regionId}/history/?datasource=tranquility&type_id=${typeId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
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
        daily_volume_7d_avg: Math.round(avg7),
        daily_volume_7d_median: Math.round(median(vol7)),
        daily_volume_30d_avg: Math.round(avg30),
        daily_volume_30d_median: Math.round(median(vol30)),
        daily_order_count_avg: Math.round(last7.reduce((a, b) => a + b.order_count, 0) / Math.max(1, last7.length)),
        price_median_30d: median(prices30),
        price_volatility: prices30.length > 1 ? (Math.max(...prices30) - Math.min(...prices30)) / Math.max(1, median(prices30)) : 0,
        volume_trend: trend,
      };
    } catch {
      clearTimeout(timeoutId);
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
      } catch {}

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
      } catch {
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
      } catch {}

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const balance = await directRes.json();
          return { ok: true, status: directRes.status, data: balance };
        }
        return { ok: false, status: directRes.status };
      } catch {
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
      } catch {}

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/transactions/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch {
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
      } catch {}

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
      } catch {
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
      } catch {}

      try {
        const directRes = await fetch(`${this.BASE_URL}/characters/${characterId}/wallet/journal/?datasource=tranquility`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          return { ok: true, status: directRes.status, data };
        }
        return { ok: false, status: directRes.status };
      } catch {
        return { ok: false, status: 500 };
      }
    });

    return result || [];
  }

  /**
   * Resolves any New Eden station or structure ID to a clean name
   */
  static async resolveLocationName(locationId: number, accessToken?: string): Promise<string> {
    if (this.locationNameCache.has(locationId)) {
      return this.locationNameCache.get(locationId)!;
    }

    // Check universe static dictionary
    if (KNOWN_STATION_NAMES[locationId]) {
      const name = KNOWN_STATION_NAMES[locationId];
      this.locationNameCache.set(locationId, name);
      return name;
    }

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`/api/universe/location/${locationId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          this.locationNameCache.set(locationId, data.name);
          return data.name;
        }
      }
    } catch {}

    const fallback = `Station #${locationId}`;
    this.locationNameCache.set(locationId, fallback);
    return fallback;
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
        } catch {}

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
        } catch {
          return { ok: false, status: 500 };
        }
      }
    );
  }

  /**
   * Fetches all 15,801 tradeable market types with real average and adjusted prices from Tranquility.
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
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('Failed to fetch /api/types/all:', err);
    }
    return [];
  }

  /**
   * Fast search across all 15,801 types
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
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('Failed to search market types:', err);
    }
    return [];
  }
}
