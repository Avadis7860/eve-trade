import { EsiService } from './esi';
import { RawMarketOrder, HistoricalStats, MarketHub } from '../types';
import { generateMockOrders } from '../data/mockData';

interface OrderCacheEntry {
  orders: RawMarketOrder[];
  timestamp: number;
  is_live_esi: boolean;
}

interface HistoryCacheEntry {
  stats: HistoricalStats;
  timestamp: number;
}

export class MarketDataStore {
  // Primary structured stores: type_id -> (region_id -> entry)
  private static ordersCache = new Map<number, Map<number, OrderCacheEntry>>();
  private static historyCache = new Map<number, Map<number, HistoryCacheEntry>>();

  // Active in-flight requests to deduplicate concurrent calls
  private static activeFetches = new Map<string, Promise<any>>();
  private static listeners = new Set<() => void>();

  /**
   * Subscribe to market data updates across the application
   */
  static subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  static notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn('MarketDataStore listener error:', e);
      }
    });
  }

  /**
   * Store live ESI or synchronized orders for an item in a specific region
   */
  static setOrders(
    typeId: number,
    regionId: number,
    orders: RawMarketOrder[],
    isLiveEsi: boolean = true
  ) {
    if (!this.ordersCache.has(typeId)) {
      this.ordersCache.set(typeId, new Map());
    }
    this.ordersCache.get(typeId)!.set(regionId, {
      orders,
      timestamp: Date.now(),
      is_live_esi: isLiveEsi,
    });
  }

  /**
   * Store historical market stats for an item in a region
   */
  static setHistory(typeId: number, regionId: number, stats: HistoricalStats) {
    if (!this.historyCache.has(typeId)) {
      this.historyCache.set(typeId, new Map());
    }
    this.historyCache.get(typeId)!.set(regionId, {
      stats,
      timestamp: Date.now(),
    });
  }

  /**
   * Get orders for a specific item in a region
   */
  static getOrders(typeId: number, regionId: number): RawMarketOrder[] | null {
    const typeMap = this.ordersCache.get(typeId);
    if (!typeMap) return null;
    const entry = typeMap.get(regionId);
    return entry ? entry.orders : null;
  }

  /**
   * Check whether live or cached orders exist for an item across hubs
   */
  static hasOrdersForType(typeId: number): boolean {
    const typeMap = this.ordersCache.get(typeId);
    if (!typeMap || typeMap.size === 0) return false;
    for (const entry of typeMap.values()) {
      if (entry.orders && entry.orders.length > 0) return true;
    }
    return false;
  }

  /**
   * Get whether data for an item is verified live from ESI
   */
  static isLiveEsi(typeId: number, regionId: number): boolean {
    const typeMap = this.ordersCache.get(typeId);
    return Boolean(typeMap?.get(regionId)?.is_live_esi);
  }

  /**
   * Get timestamp of last fetch for an item in a region
   */
  static getTimestamp(typeId: number, regionId: number): number | null {
    const typeMap = this.ordersCache.get(typeId);
    return typeMap?.get(regionId)?.timestamp || null;
  }

  /**
   * Get all cached orders for a type across all regions
   */
  static getOrdersForType(
    typeId: number,
    hubs: MarketHub[],
    fallbackBasePrice: number = 1000
  ): Record<number, RawMarketOrder[]> {
    const result: Record<number, RawMarketOrder[]> = {};
    const typeMap = this.ordersCache.get(typeId);

    for (const hub of hubs) {
      const entry = typeMap?.get(hub.region_id);
      if (entry && entry.orders.length > 0) {
        result[hub.region_id] = entry.orders;
      } else {
        // Fallback realistic orders if not yet fetched
        result[hub.region_id] = generateMockOrders(hub.region_id, typeId, fallbackBasePrice);
      }
    }

    return result;
  }

  /**
   * Get all cached history stats for a type across all regions
   */
  static getHistoryForType(typeId: number): Record<number, HistoricalStats> {
    const result: Record<number, HistoricalStats> = {};
    const typeMap = this.historyCache.get(typeId);
    if (typeMap) {
      for (const [regionId, entry] of typeMap.entries()) {
        result[regionId] = entry.stats;
      }
    }
    return result;
  }

  /**
   * Flatten all cached orders across all item types by region (used for global views & order advisor)
   */
  static getAllOrdersByRegion(): Record<number, RawMarketOrder[]> {
    const result: Record<number, RawMarketOrder[]> = {};
    for (const typeMap of this.ordersCache.values()) {
      for (const [regionId, entry] of typeMap.entries()) {
        if (!result[regionId]) result[regionId] = [];
        result[regionId].push(...entry.orders);
      }
    }
    return result;
  }

  /**
   * Retrieve history stats for (regionId, typeId)
   */
  static getHistory(typeId: number, regionId: number): HistoricalStats | null {
    return this.historyCache.get(typeId)?.get(regionId)?.stats || null;
  }

  /**
   * Fetch live ESI market orders and history for an item across all active hubs seamlessly
   */
  static async fetchLiveItemData(
    typeId: number,
    hubs: MarketHub[],
    forceRefresh: boolean = false,
    fallbackBasePrice: number = 1000
  ): Promise<{
    orderBooks: Record<number, RawMarketOrder[]>;
    history: Record<number, HistoricalStats>;
    successCount: number;
  }> {
    const activeHubs = hubs.filter((h) => h.active);
    const orderBooks: Record<number, RawMarketOrder[]> = {};
    const history: Record<number, HistoricalStats> = {};
    let successCount = 0;

    // Check if recently fetched (< 10 minutes) and not forcing refresh
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const isAlreadyCached =
      !forceRefresh &&
      activeHubs.every((hub) => {
        const entry = this.ordersCache.get(typeId)?.get(hub.region_id);
        return entry && entry.is_live_esi && entry.timestamp > tenMinutesAgo;
      });

    if (isAlreadyCached) {
      return {
        orderBooks: this.getOrdersForType(typeId, activeHubs, fallbackBasePrice),
        history: this.getHistoryForType(typeId),
        successCount: activeHubs.length,
      };
    }

    const fetchKey = `type_${typeId}`;
    if (this.activeFetches.has(fetchKey)) {
      return this.activeFetches.get(fetchKey)!;
    }

    const fetchPromise = (async () => {
      await Promise.all(
        activeHubs.map(async (hub) => {
          try {
            const [liveOrders, hist] = await Promise.all([
              EsiService.fetchLiveOrders(hub.region_id, typeId),
              EsiService.fetchMarketHistory(hub.region_id, typeId),
            ]);

            if (liveOrders && liveOrders.length > 0) {
              this.setOrders(typeId, hub.region_id, liveOrders, true);
              orderBooks[hub.region_id] = liveOrders;
              successCount++;
            } else {
              // Retain previous or generate fallback
              const existing = this.getOrders(typeId, hub.region_id);
              orderBooks[hub.region_id] =
                existing || generateMockOrders(hub.region_id, typeId, fallbackBasePrice);
            }

            if (hist) {
              this.setHistory(typeId, hub.region_id, hist);
              history[hub.region_id] = hist;
            }
          } catch (err) {
            console.warn(`Could not sync live ESI for region ${hub.region}:`, err);
            const existing = this.getOrders(typeId, hub.region_id);
            orderBooks[hub.region_id] =
              existing || generateMockOrders(hub.region_id, typeId, fallbackBasePrice);
          }
        })
      );

      this.notifyListeners();

      return {
        orderBooks,
        history,
        successCount,
      };
    })();

    this.activeFetches.set(fetchKey, fetchPromise);

    try {
      const res = await fetchPromise;
      return res;
    } finally {
      this.activeFetches.delete(fetchKey);
    }
  }

  /**
   * Batch synchronize live ESI market orders for a list of character order types
   */
  static async syncCharacterOrdersMarketData(
    typeIds: number[],
    hubs: MarketHub[]
  ): Promise<void> {
    const uniqueTypeIds = Array.from(new Set(typeIds)).filter((id) => id > 0);
    const activeHubs = hubs.filter((h) => h.active);

    const typesToFetch: number[] = [];
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    for (const tid of uniqueTypeIds) {
      const needsFetch = activeHubs.some((hub) => {
        const entry = this.ordersCache.get(tid)?.get(hub.region_id);
        return !entry || !entry.is_live_esi || entry.timestamp < tenMinutesAgo;
      });
      if (needsFetch) {
        typesToFetch.push(tid);
      }
    }

    if (typesToFetch.length === 0) return;

    // Concurrently fetch up to 4 items at a time
    const chunkSize = 4;
    for (let i = 0; i < typesToFetch.length; i += chunkSize) {
      const chunk = typesToFetch.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (tid) => {
          await this.fetchLiveItemData(tid, activeHubs, false);
        })
      );
    }

    this.notifyListeners();
  }
}
