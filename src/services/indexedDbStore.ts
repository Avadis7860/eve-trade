import { MarketDataSnapshot, HistoricalStats, UniverseWideOpportunity } from '../types';

export interface StorageStats {
  snapshots_count: number;
  orders_count: number;
  history_count: number;
  opportunities_count: number;
  estimated_bytes: number;
  db_ready: boolean;
  last_persisted_at: string | null;
}

export interface EsiHttpCacheEntry {
  url: string;
  etag?: string;
  expires?: string;
  data: any;
  cached_at: number;
  ttl_ms: number;
}

const DB_NAME = 'eve_trade_durable_store';
const DB_VERSION = 1;

export class IndexedDbStore {
  private static db: IDBDatabase | null = null;
  private static initPromise: Promise<boolean> | null = null;
  private static memorySnapshots = new Map<string, MarketDataSnapshot>();
  private static memoryHistory = new Map<string, HistoricalStats>();
  private static memoryOpportunities: UniverseWideOpportunity[] = [];
  private static memoryHttpCache = new Map<string, EsiHttpCacheEntry>();
  private static lastPersistedAt: string | null = null;

  /**
   * Initializes the IndexedDB database schema
   */
  static async init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
        // Node.js or SSR environment fallback
        resolve(false);
        return;
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 1. Market Snapshots: keyPath is composite key string "typeId:regionId"
          if (!db.objectStoreNames.contains('snapshots')) {
            const store = db.createObjectStore('snapshots', { keyPath: 'key' });
            store.createIndex('type_id', 'type_id', { unique: false });
            store.createIndex('region_id', 'region_id', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // 2. Historical stats: keyPath "typeId:regionId"
          if (!db.objectStoreNames.contains('history')) {
            const store = db.createObjectStore('history', { keyPath: 'key' });
            store.createIndex('type_id', 'type_id', { unique: false });
            store.createIndex('region_id', 'region_id', { unique: false });
          }

          // 3. Universe opportunities cache
          if (!db.objectStoreNames.contains('universe_opportunities')) {
            db.createObjectStore('universe_opportunities', { keyPath: 'id' });
          }

          // 4. ESI HTTP Cache: keyPath url
          if (!db.objectStoreNames.contains('http_cache')) {
            const store = db.createObjectStore('http_cache', { keyPath: 'url' });
            store.createIndex('cached_at', 'cached_at', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          resolve(true);
        };

        request.onerror = (event) => {
          console.warn('[IndexedDB] Failed to open database, falling back to memory:', event);
          resolve(false);
        };
      } catch (err) {
        console.warn('[IndexedDB] Init exception, falling back to memory:', err);
        resolve(false);
      }
    });

    return this.initPromise;
  }

  private static getCompositeKey(typeId: number, regionId: number): string {
    return `${typeId}:${regionId}`;
  }

  /**
   * Saves a verified market snapshot durably to IndexedDB
   */
  static async saveSnapshot(snapshot: MarketDataSnapshot): Promise<void> {
    const key = this.getCompositeKey(snapshot.type_id, snapshot.region_id);
    this.memorySnapshots.set(key, snapshot);
    this.lastPersistedAt = new Date().toISOString();

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        store.put({
          key,
          type_id: snapshot.type_id,
          region_id: snapshot.region_id,
          timestamp: snapshot.timestamp,
          snapshot,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Bulk save snapshots (used during mass syncs)
   */
  static async bulkSaveSnapshots(snapshots: MarketDataSnapshot[]): Promise<void> {
    for (const snap of snapshots) {
      const key = this.getCompositeKey(snap.type_id, snap.region_id);
      this.memorySnapshots.set(key, snap);
    }
    this.lastPersistedAt = new Date().toISOString();

    const isReady = await this.init();
    if (!isReady || !this.db || snapshots.length === 0) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        for (const snap of snapshots) {
          store.put({
            key: this.getCompositeKey(snap.type_id, snap.region_id),
            type_id: snap.type_id,
            region_id: snap.region_id,
            timestamp: snap.timestamp,
            snapshot: snap,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves a snapshot by typeId and regionId
   */
  static async getSnapshot(typeId: number, regionId: number): Promise<MarketDataSnapshot | null> {
    const key = this.getCompositeKey(typeId, regionId);
    if (this.memorySnapshots.has(key)) {
      return this.memorySnapshots.get(key)!;
    }

    const isReady = await this.init();
    if (!isReady || !this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.snapshot) {
            this.memorySnapshots.set(key, req.result.snapshot);
            resolve(req.result.snapshot);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Loads all snapshots from IndexedDB into memory on application startup
   */
  static async loadAllSnapshots(): Promise<MarketDataSnapshot[]> {
    const isReady = await this.init();
    if (!isReady || !this.db) {
      return Array.from(this.memorySnapshots.values());
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const req = store.getAll();
        req.onsuccess = () => {
          const results: MarketDataSnapshot[] = [];
          if (Array.isArray(req.result)) {
            for (const item of req.result) {
              if (item.snapshot) {
                results.push(item.snapshot);
                this.memorySnapshots.set(item.key, item.snapshot);
              }
            }
          }
          resolve(results);
        };
        req.onerror = () => resolve(Array.from(this.memorySnapshots.values()));
      } catch {
        resolve(Array.from(this.memorySnapshots.values()));
      }
    });
  }

  /**
   * Saves historical stats for an item and region
   */
  static async saveHistory(typeId: number, regionId: number, stats: HistoricalStats): Promise<void> {
    const key = this.getCompositeKey(typeId, regionId);
    this.memoryHistory.set(key, stats);

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('history', 'readwrite');
        const store = tx.objectStore('history');
        store.put({ key, type_id: typeId, region_id: regionId, stats });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Loads all historical stats
   */
  static async loadAllHistory(): Promise<Map<string, HistoricalStats>> {
    const isReady = await this.init();
    if (!isReady || !this.db) {
      return new Map(this.memoryHistory);
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('history', 'readonly');
        const store = tx.objectStore('history');
        const req = store.getAll();
        req.onsuccess = () => {
          if (Array.isArray(req.result)) {
            for (const item of req.result) {
              if (item.stats) {
                this.memoryHistory.set(item.key, item.stats);
              }
            }
          }
          resolve(new Map(this.memoryHistory));
        };
        req.onerror = () => resolve(new Map(this.memoryHistory));
      } catch {
        resolve(new Map(this.memoryHistory));
      }
    });
  }

  /**
   * Saves scanned universe opportunities
   */
  static async saveUniverseOpportunities(opps: UniverseWideOpportunity[]): Promise<void> {
    this.memoryOpportunities = [...opps];
    this.lastPersistedAt = new Date().toISOString();

    // Also sync to localStorage as secondary backup for top 50 items
    try {
      localStorage.setItem('eve_universe_opportunities', JSON.stringify(opps.slice(0, 100)));
    } catch {}

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('universe_opportunities', 'readwrite');
        const store = tx.objectStore('universe_opportunities');
        store.clear();
        for (const opp of opps) {
          store.put(opp);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Loads scanned universe opportunities from durable storage
   */
  static async loadUniverseOpportunities(): Promise<UniverseWideOpportunity[]> {
    if (this.memoryOpportunities.length > 0) {
      return [...this.memoryOpportunities];
    }

    const isReady = await this.init();
    if (!isReady || !this.db) {
      try {
        const fallback = localStorage.getItem('eve_universe_opportunities');
        return fallback ? JSON.parse(fallback) : [];
      } catch {
        return [];
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('universe_opportunities', 'readonly');
        const store = tx.objectStore('universe_opportunities');
        const req = store.getAll();
        req.onsuccess = () => {
          if (Array.isArray(req.result) && req.result.length > 0) {
            this.memoryOpportunities = req.result;
            resolve(req.result);
          } else {
            try {
              const fallback = localStorage.getItem('eve_universe_opportunities');
              resolve(fallback ? JSON.parse(fallback) : []);
            } catch {
              resolve([]);
            }
          }
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * HTTP Cache storage for ESI requests
   */
  static async getHttpCache(url: string): Promise<EsiHttpCacheEntry | null> {
    if (this.memoryHttpCache.has(url)) {
      const entry = this.memoryHttpCache.get(url)!;
      if (Date.now() - entry.cached_at < entry.ttl_ms) {
        return entry;
      }
    }

    const isReady = await this.init();
    if (!isReady || !this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('http_cache', 'readonly');
        const store = tx.objectStore('http_cache');
        const req = store.get(url);
        req.onsuccess = () => {
          if (req.result) {
            const entry: EsiHttpCacheEntry = req.result;
            if (Date.now() - entry.cached_at < entry.ttl_ms) {
              this.memoryHttpCache.set(url, entry);
              resolve(entry);
              return;
            }
          }
          resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  static async setHttpCache(entry: EsiHttpCacheEntry): Promise<void> {
    this.memoryHttpCache.set(entry.url, entry);

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('http_cache', 'readwrite');
        const store = tx.objectStore('http_cache');
        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Diagnostic statistics on stored datasets
   */
  static async getStorageStats(): Promise<StorageStats> {
    let orderCount = 0;
    for (const snap of this.memorySnapshots.values()) {
      orderCount += snap.orders.length;
    }

    // Estimate memory/disk footprint
    const jsonLength = JSON.stringify(Array.from(this.memorySnapshots.values())).length;

    return {
      snapshots_count: this.memorySnapshots.size,
      orders_count: orderCount,
      history_count: this.memoryHistory.size,
      opportunities_count: this.memoryOpportunities.length,
      estimated_bytes: jsonLength,
      db_ready: Boolean(this.db),
      last_persisted_at: this.lastPersistedAt,
    };
  }

  /**
   * Clears all IndexedDB object stores and memory
   */
  static async clearAll(): Promise<void> {
    this.memorySnapshots.clear();
    this.memoryHistory.clear();
    this.memoryOpportunities = [];
    this.memoryHttpCache.clear();
    this.lastPersistedAt = null;

    try {
      localStorage.removeItem('eve_universe_opportunities');
    } catch {}

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(
          ['snapshots', 'history', 'universe_opportunities', 'http_cache'],
          'readwrite'
        );
        tx.objectStore('snapshots').clear();
        tx.objectStore('history').clear();
        tx.objectStore('universe_opportunities').clear();
        tx.objectStore('http_cache').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
