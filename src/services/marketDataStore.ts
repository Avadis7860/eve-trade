import { EsiService } from './esi';
import {
  RawMarketOrder,
  HistoricalStats,
  MarketHub,
  MarketDataSnapshot,
  MarketDataQuality,
  MarketObservation,
  DataHealthStatus,
} from '../types';
import { IndexedDbStore } from './indexedDbStore';
import { FailureSemantics } from '../engine/failureSemantics';

interface HistoryCacheEntry {
  stats: HistoricalStats;
  timestamp: number;
}

export class MarketDataStore {
  // Primary structured stores: type_id -> (region_id -> MarketDataSnapshot)
  private static snapshots = new Map<number, Map<number, MarketDataSnapshot>>();
  private static historyCache = new Map<number, Map<number, HistoryCacheEntry>>();

  // Active in-flight requests to deduplicate concurrent calls
  private static activeFetches = new Map<string, Promise<any>>();
  private static listeners = new Set<() => void>();
  private static isHydrated = false;

  /**
   * Hydrates the in-memory store from durable IndexedDB storage
   */
  static async hydrateFromIndexedDb(): Promise<void> {
    if (this.isHydrated) return;
    try {
      const persistedSnaps = await IndexedDbStore.loadAllSnapshots();
      for (const snap of persistedSnaps) {
        if (!this.snapshots.has(snap.type_id)) {
          this.snapshots.set(snap.type_id, new Map());
        }
        this.snapshots.get(snap.type_id)!.set(snap.region_id, snap);
      }

      const persistedHistory = await IndexedDbStore.loadAllHistory();
      for (const [key, stats] of persistedHistory.entries()) {
        const [typeIdStr, regionIdStr] = key.split(':');
        const typeId = Number(typeIdStr);
        const regionId = Number(regionIdStr);
        if (typeId && regionId) {
          if (!this.historyCache.has(typeId)) {
            this.historyCache.set(typeId, new Map());
          }
          this.historyCache.get(typeId)!.set(regionId, {
            stats,
            timestamp: Date.now() - 300000,
          });
        }
      }

      this.isHydrated = true;
      if (persistedSnaps.length > 0) {
        this.notifyListeners();
      }
    } catch (err) {
      console.warn('[MarketDataStore] Failed to hydrate from IndexedDB:', err);
    }
  }

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
   * Store a complete verified market snapshot for (typeId, regionId)
   */
  static setSnapshot(snapshot: MarketDataSnapshot) {
    if (!this.snapshots.has(snapshot.type_id)) {
      this.snapshots.set(snapshot.type_id, new Map());
    }
    this.snapshots.get(snapshot.type_id)!.set(snapshot.region_id, snapshot);
    // Asynchronously save to durable IndexedDB store
    IndexedDbStore.saveSnapshot(snapshot).catch((err) => {
      console.warn('[MarketDataStore] saveSnapshot failed to persist:', err);
    });

    // Compute and record immutable MarketObservation (Append-Only)
    try {
      const buys = snapshot.orders.filter((o) => o.is_buy_order);
      const sells = snapshot.orders.filter((o) => !o.is_buy_order);
      const bestBuy = buys.length > 0 ? Math.max(...buys.map((o) => o.price)) : undefined;
      const bestSell = sells.length > 0 ? Math.min(...sells.map((o) => o.price)) : undefined;
      const buyVol = buys.reduce((acc, o) => acc + o.volume_remain, 0);
      const sellVol = sells.reduce((acc, o) => acc + o.volume_remain, 0);
      const spreadAbs = bestSell !== undefined && bestBuy !== undefined ? bestSell - bestBuy : undefined;
      const spreadPct =
        bestSell !== undefined && bestBuy !== undefined && bestBuy > 0
          ? ((bestSell - bestBuy) / bestBuy) * 100
          : undefined;

      const minuteBucket = Math.floor(snapshot.timestamp / 60000);
      const obsHash = `${snapshot.type_id}:${snapshot.region_id}:${minuteBucket}:${bestBuy || 0}:${bestSell || 0}`;

      const obs: MarketObservation = {
        observation_id: `obs-${snapshot.type_id}-${snapshot.region_id}-${snapshot.timestamp}`,
        observation_hash: obsHash,
        type_id: snapshot.type_id,
        region_id: snapshot.region_id,
        captured_at: new Date(snapshot.timestamp).toISOString(),
        source: 'esi_market_orders',
        best_buy_price: bestBuy,
        best_sell_price: bestSell,
        buy_volume_visible: buyVol,
        sell_volume_visible: sellVol,
        spread_absolute: spreadAbs,
        spread_pct: spreadPct,
        order_count_buy: buys.length,
        order_count_sell: sells.length,
        data_age_seconds: snapshot.quality?.age_seconds ?? 0,
        esi_pages_fetched: snapshot.quality?.pages_fetched,
        esi_pages_expected: snapshot.quality?.expected_pages,
        confidence: snapshot.quality?.confidence ?? 1.0,
      };

      IndexedDbStore.saveMarketObservation(obs).catch((err) => {
        console.warn('[MarketDataStore] saveMarketObservation failed:', err);
      });
    } catch (e) {
      console.warn('Failed to record MarketObservation:', e);
    }
  }

  /**
   * Store raw orders with generated or provided quality metadata
   */
  static setOrders(
    typeId: number,
    regionId: number,
    orders: RawMarketOrder[],
    isLiveEsi: boolean = true,
    qualityOverride?: MarketDataQuality
  ) {
    const now = Date.now();
    const snapshotTimestamp = qualityOverride?.fetched_at ? new Date(qualityOverride.fetched_at).getTime() : now;
    const quality: MarketDataQuality = qualityOverride || {
      source: isLiveEsi ? 'esi' : 'cache',
      freshness: 'fresh',
      completeness: orders.length > 0 ? 'complete' : 'empty',
      validation_status: 'valid',
      data_state: orders.length > 0 ? 'VALID' : 'EMPTY',
      health_status: isLiveEsi ? 'LIVE' : 'CACHE',
      fetched_at: new Date(now).toISOString(),
      age_seconds: 0,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: orders.length,
      orders_valid: orders.length,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      confidence: 1.0,
      sync_duration_ms: 0,
    };

    const snapshot: MarketDataSnapshot = {
      type_id: typeId,
      region_id: regionId,
      orders,
      timestamp: snapshotTimestamp,
      quality,
    };

    this.setSnapshot(snapshot);
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

    // Also attach to snapshot if present
    const snap = this.getSnapshot(typeId, regionId);
    if (snap) {
      snap.history = stats;
    }

    // Persist to IndexedDB
    IndexedDbStore.saveHistory(typeId, regionId, stats).catch((err) => {
      console.warn('[MarketDataStore] saveHistory failed:', err);
    });
  }

  /**
   * Retrieve full verified snapshot for an item in a region
   */
  static getSnapshot(typeId: number, regionId: number): MarketDataSnapshot | null {
    const typeMap = this.snapshots.get(typeId);
    if (!typeMap) return null;
    const snap = typeMap.get(regionId);
    if (!snap) return null;

    // Dynamically update age_seconds and freshness
    const ageSec = Math.round((Date.now() - snap.timestamp) / 1000);
    snap.quality.age_seconds = ageSec;
    if (ageSec > 1800) {
      // > 30 minutes
      snap.quality.freshness = 'expired';
      snap.quality.confidence = Math.max(0.1, snap.quality.confidence * 0.5);
    } else if (ageSec > 600) {
      // > 10 minutes
      snap.quality.freshness = 'stale';
      snap.quality.confidence = Math.max(0.3, snap.quality.confidence * 0.8);
    } else if (ageSec > 120) {
      // > 2 minutes
      snap.quality.freshness = 'recent';
    } else {
      snap.quality.freshness = 'fresh';
    }

    // Phase 2B Failure Semantics — Canonical Health and DataState
    const healthStatus = FailureSemantics.evaluateHealth(snap.quality);
    snap.quality.health_status = healthStatus;
    snap.quality.data_state = FailureSemantics.healthToDataState(healthStatus, snap.orders ? snap.orders.length : 0);

    return snap;
  }

  /**
   * Returns canonical Phase 2B failure semantics health state:
   * LIVE | CACHE | STALE | PARTIAL | UNKNOWN | ERROR
   */
  static getDataHealth(typeId: number, regionId: number): DataHealthStatus {
    const snap = this.getSnapshot(typeId, regionId);
    if (!snap) return 'UNKNOWN';
    return snap.quality.health_status || FailureSemantics.evaluateHealth(snap.quality);
  }

  /**
   * Get orders for a specific item in a region (strictly real orders, or null)
   */
  static getOrders(typeId: number, regionId: number): RawMarketOrder[] | null {
    const snap = this.getSnapshot(typeId, regionId);
    return snap ? snap.orders : null;
  }

  /**
   * Get data quality descriptor for a specific item in a region
   */
  static getQuality(typeId: number, regionId: number): MarketDataQuality | null {
    const snap = this.getSnapshot(typeId, regionId);
    return snap ? snap.quality : null;
  }

  /**
   * Check whether verified orders exist for an item across hubs
   */
  static hasOrdersForType(typeId: number): boolean {
    const typeMap = this.snapshots.get(typeId);
    if (!typeMap || typeMap.size === 0) return false;
    for (const snap of typeMap.values()) {
      if (snap.orders && snap.orders.length > 0) return true;
    }
    return false;
  }

  /**
   * Get whether data for an item is verified live from ESI and fresh
   */
  static isLiveEsi(typeId: number, regionId: number): boolean {
    const snap = this.getSnapshot(typeId, regionId);
    return Boolean(snap && snap.quality.source === 'esi' && snap.quality.freshness !== 'expired');
  }

  /**
   * Get timestamp of last fetch for an item in a region
   */
  static getTimestamp(typeId: number, regionId: number): number | null {
    const snap = this.snapshots.get(typeId)?.get(regionId);
    return snap ? snap.timestamp : null;
  }

  /**
   * Get all cached orders for a type across all active hubs (returns strictly real orders, empty array if none)
   */
  static getOrdersForType(
    typeId: number,
    hubs: MarketHub[]
  ): Record<number, RawMarketOrder[]> {
    const result: Record<number, RawMarketOrder[]> = {};
    const typeMap = this.snapshots.get(typeId);

    for (const hub of hubs) {
      const snap = typeMap?.get(hub.region_id);
      if (snap && snap.orders) {
        result[hub.region_id] = snap.orders;
      } else {
        // Strictly empty array - NO mock data fabrication!
        result[hub.region_id] = [];
      }
    }

    return result;
  }

  /**
   * Get all quality descriptors for a type across hubs
   */
  static getQualitiesForType(
    typeId: number,
    hubs: MarketHub[]
  ): Record<number, MarketDataQuality> {
    const result: Record<number, MarketDataQuality> = {};
    for (const hub of hubs) {
      const snap = this.getSnapshot(typeId, hub.region_id);
      if (snap) {
        result[hub.region_id] = snap.quality;
      } else {
        result[hub.region_id] = {
          source: 'unavailable',
          freshness: 'expired',
          completeness: 'empty',
          validation_status: 'invalid',
          fetched_at: new Date(0).toISOString(),
          age_seconds: 999999,
          pages_fetched: 0,
          expected_pages: 1,
          orders_fetched: 0,
          orders_valid: 0,
          duplicate_orders_removed: 0,
          rejected_orders_count: 0,
          error_count: 0,
          confidence: 0,
          sync_duration_ms: 0,
        };
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
    for (const typeMap of this.snapshots.values()) {
      for (const [regionId, snap] of typeMap.entries()) {
        if (!result[regionId]) result[regionId] = [];
        result[regionId].push(...snap.orders);
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
    forceRefresh: boolean = false
  ): Promise<{
    orderBooks: Record<number, RawMarketOrder[]>;
    history: Record<number, HistoricalStats>;
    qualities: Record<number, MarketDataQuality>;
    successCount: number;
  }> {
    const activeHubs = hubs.filter((h) => h.active);
    const orderBooks: Record<number, RawMarketOrder[]> = {};
    const history: Record<number, HistoricalStats> = {};
    const qualities: Record<number, MarketDataQuality> = {};
    let successCount = 0;

    // Check if recently fetched (< 5 minutes) and not forcing refresh
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const isAlreadyCached =
      !forceRefresh &&
      activeHubs.length > 0 &&
      activeHubs.every((hub) => {
        const snap = this.getSnapshot(typeId, hub.region_id);
        return Boolean(
          snap &&
          snap.timestamp > fiveMinutesAgo &&
          snap.quality.source === 'esi' &&
          snap.quality.error_count === 0 &&
          (snap.quality.completeness === 'complete' || snap.quality.completeness === 'empty') &&
          (snap.quality.data_state === 'VALID' || snap.quality.data_state === 'EMPTY')
        );
      });

    if (isAlreadyCached) {
      return {
        orderBooks: this.getOrdersForType(typeId, activeHubs),
        history: this.getHistoryForType(typeId),
        qualities: this.getQualitiesForType(typeId, activeHubs),
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
            const [ordersResult, hist] = await Promise.all([
              EsiService.fetchLiveOrdersDetailed(hub.region_id, typeId),
              EsiService.fetchMarketHistory(hub.region_id, typeId),
            ]);

            const { orders, quality } = ordersResult;

            if (quality.source === 'esi' && orders.length > 0) {
              const snapshot: MarketDataSnapshot = {
                type_id: typeId,
                region_id: hub.region_id,
                orders,
                timestamp: Date.now(),
                quality,
                history: hist || undefined,
              };
              this.setSnapshot(snapshot);
              orderBooks[hub.region_id] = orders;
              qualities[hub.region_id] = quality;
              if (quality.completeness === 'complete' && quality.error_count === 0) successCount++;
            } else if (quality.source === 'esi' && quality.error_count === 0) {
              const emptySnap: MarketDataSnapshot = {
                type_id: typeId,
                region_id: hub.region_id,
                orders: [],
                timestamp: Date.now(),
                quality,
                history: hist || undefined,
              };
              this.setSnapshot(emptySnap);
              orderBooks[hub.region_id] = [];
              qualities[hub.region_id] = quality;
              successCount++;
            } else {
              // ESI returned partial or error: check previous cache
              const previousSnap = this.getSnapshot(typeId, hub.region_id);
              const previousHealth = previousSnap ? FailureSemantics.evaluateHealth(previousSnap.quality) : null;
              if (previousSnap && previousHealth !== 'ERROR' && previousHealth !== 'UNKNOWN') {
                // Degrade previous cache to STALE
                const ageSec = Math.round((Date.now() - previousSnap.timestamp) / 1000);
                const degradedQuality: MarketDataQuality = {
                  ...previousSnap.quality,
                  source: 'cache',
                  freshness: 'stale',
                  data_state: 'STALE',
                  health_status: 'STALE',
                  age_seconds: ageSec,
                  confidence: Math.max(0.2, previousSnap.quality.confidence * 0.7),
                  last_error: quality.last_error || 'ESI sync issue, using cached snapshot',
                  last_http_status: quality.last_http_status,
                  cache_status: quality.cache_status,
                  esi_error_limit_remaining: quality.esi_error_limit_remaining,
                  esi_error_limit_reset_seconds: quality.esi_error_limit_reset_seconds,
                  retry_after_seconds: quality.retry_after_seconds,
                };
                previousSnap.quality = degradedQuality;
                orderBooks[hub.region_id] = previousSnap.orders;
                qualities[hub.region_id] = degradedQuality;
              } else {
                // No previous cache: store empty snapshot
                const emptySnap: MarketDataSnapshot = {
                  type_id: typeId,
                  region_id: hub.region_id,
                  orders: [],
                  timestamp: Date.now(),
                  quality,
                };
                this.setSnapshot(emptySnap);
                orderBooks[hub.region_id] = [];
                qualities[hub.region_id] = quality;
              }
            }

            if (hist) {
              this.setHistory(typeId, hub.region_id, hist);
              history[hub.region_id] = hist;
            }
          } catch (err: unknown) {
            console.warn(`Could not sync live ESI for region ${hub.region}:`, err);
            const previousSnap = this.getSnapshot(typeId, hub.region_id);
            const previousHealth = previousSnap ? FailureSemantics.evaluateHealth(previousSnap.quality) : null;
            if (previousSnap && previousHealth !== 'ERROR' && previousHealth !== 'UNKNOWN') {
              const ageSec = Math.round((Date.now() - previousSnap.timestamp) / 1000);
              const degradedQuality: MarketDataQuality = {
                ...previousSnap.quality,
                source: 'cache',
                freshness: 'stale',
                data_state: 'STALE',
                health_status: 'STALE',
                age_seconds: ageSec,
                confidence: Math.max(0.2, previousSnap.quality.confidence * 0.6),
                last_error: String(err),
              };
              previousSnap.quality = degradedQuality;
              orderBooks[hub.region_id] = previousSnap.orders;
              qualities[hub.region_id] = degradedQuality;
            } else {
              const failedQuality: MarketDataQuality = {
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
                error_count: 1,
                last_error: String(err),
                confidence: 0,
                sync_duration_ms: 0,
              };
              const failedSnapshot: MarketDataSnapshot = {
                type_id: typeId,
                region_id: hub.region_id,
                orders: [],
                timestamp: Date.now(),
                quality: failedQuality,
              };
              this.setSnapshot(failedSnapshot);
              orderBooks[hub.region_id] = [];
              qualities[hub.region_id] = failedQuality;
            }
          }
        })
      );

      this.notifyListeners();

      return {
        orderBooks,
        history,
        qualities,
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
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    for (const tid of uniqueTypeIds) {
      const needsFetch = activeHubs.some((hub) => {
        const snap = this.getSnapshot(tid, hub.region_id);
        return !snap || FailureSemantics.evaluateHealth(snap.quality) !== 'LIVE' || snap.timestamp < fiveMinutesAgo;
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

  /**
   * Force-refresh market context for all item types present in the active-order scope.
   * This method is reserved for explicit user refresh actions; background synchronization
   * continues to use the freshness-aware syncCharacterOrdersMarketData path.
   */
  static async refreshCharacterOrdersMarketData(
    typeIds: number[],
    hubs: MarketHub[]
  ): Promise<void> {
    const uniqueTypeIds = Array.from(new Set(typeIds)).filter((id) => id > 0);
    const activeHubs = hubs.filter((h) => h.active);
    if (uniqueTypeIds.length === 0 || activeHubs.length === 0) return;

    const chunkSize = 4;
    for (let i = 0; i < uniqueTypeIds.length; i += chunkSize) {
      const chunk = uniqueTypeIds.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (typeId) => {
          const fetchKey = `type_${typeId}`;
          const inFlight = this.activeFetches.get(fetchKey);

          if (inFlight) {
            try {
              await inFlight;
            } catch {
              // The explicit refresh below owns the final refresh result.
            }
          }

          await this.fetchLiveItemData(typeId, activeHubs, true);
        })
      );
    }
    this.notifyListeners();
  }

  /**
   * Diagnostic summary of all loaded snapshots in store
   */
  static getStoreSummary() {
    let totalSnapshots = 0;
    let liveCount = 0;
    let staleCount = 0;
    let expiredCount = 0;
    let totalOrders = 0;

    for (const typeMap of this.snapshots.values()) {
      for (const snap of typeMap.values()) {
        totalSnapshots++;
        totalOrders += snap.orders.length;
        if (snap.quality.freshness === 'fresh' || snap.quality.freshness === 'recent') {
          liveCount++;
        } else if (snap.quality.freshness === 'stale') {
          staleCount++;
        } else {
          expiredCount++;
        }
      }
    }

    return {
      total_snapshots: totalSnapshots,
      live_snapshots: liveCount,
      stale_snapshots: staleCount,
      expired_snapshots: expiredCount,
      total_real_orders: totalOrders,
    };
  }

  /**
   * Clear the entire market data store
   */
  static clearStore() {
    this.snapshots.clear();
    this.historyCache.clear();
    IndexedDbStore.clearAll().catch(() => {});
    this.notifyListeners();
  }
}

