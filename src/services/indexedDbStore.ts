import {
  MarketDataSnapshot,
  HistoricalStats,
  UniverseWideOpportunity,
  MarketObservation,
  OpportunityObservation,
  DailyMarketHistory,
  EveTypeDetail,
  TypeCatalogMetadata,
} from '../types';

export interface StorageStats {
  snapshots_count: number;
  orders_count: number;
  history_count: number;
  opportunities_count: number;
  observations_count: number;
  opportunity_observations_count: number;
  types_count: number;
  estimated_bytes: number;
  db_ready: boolean;
  last_persisted_at: string | null;
  last_write_status: StorageWriteStatus;
  write_success_count: number;
  write_failure_count: number;
}

export type StorageWriteStatus = 'IDLE' | 'WRITE_SUCCESS' | 'WRITE_FAILED' | 'WRITE_PENDING';

export interface StorageWriteRecord {
  status: StorageWriteStatus;
  error: string | null;
  attempts: number;
  successes: number;
  failures: number;
  last_write_at: string | null;
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
const DB_VERSION = 3;

export class IndexedDbStore {
  private static db: IDBDatabase | null = null;
  private static initPromise: Promise<boolean> | null = null;
  private static memorySnapshots = new Map<string, MarketDataSnapshot>();
  private static memoryHistory = new Map<string, HistoricalStats>();
  private static memoryOpportunities: UniverseWideOpportunity[] = [];
  private static memoryHttpCache = new Map<string, EsiHttpCacheEntry>();
  private static memoryObservations: MarketObservation[] = [];
  private static memoryOpportunityObservations: OpportunityObservation[] = [];
  private static memoryDailyHistory = new Map<string, DailyMarketHistory[]>();
  private static memoryTypes = new Map<number, EveTypeDetail>();
  private static memoryCatalogMetadata: TypeCatalogMetadata | null = null;
  private static lastPersistedAt: string | null = null;

  // Storage Write Audit Tracking
  private static lastWriteStatus: StorageWriteStatus = 'IDLE';
  private static lastWriteError: string | null = null;
  private static writeAttemptsCount = 0;
  private static writeSuccessesCount = 0;
  private static writeFailuresCount = 0;

  static getLastWriteStatus(): StorageWriteRecord {
    return {
      status: this.lastWriteStatus,
      error: this.lastWriteError,
      attempts: this.writeAttemptsCount,
      successes: this.writeSuccessesCount,
      failures: this.writeFailuresCount,
      last_write_at: this.lastPersistedAt,
    };
  }

  private static recordWriteAttempt(): void {
    this.writeAttemptsCount++;
    this.lastWriteStatus = 'WRITE_PENDING';
  }

  private static recordWriteSuccess(): void {
    this.writeSuccessesCount++;
    this.lastWriteStatus = 'WRITE_SUCCESS';
    this.lastWriteError = null;
    this.lastPersistedAt = new Date().toISOString();
  }

  private static recordWriteFailure(err: unknown): void {
    this.writeFailuresCount++;
    this.lastWriteStatus = 'WRITE_FAILED';
    this.lastWriteError = err instanceof Error ? err.message : String(err);
    console.warn('[IndexedDB] Write failed:', this.lastWriteError);
  }

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

          // 5. Immutable Market Observations (Append-Only)
          if (!db.objectStoreNames.contains('market_observations')) {
            const obsStore = db.createObjectStore('market_observations', { keyPath: 'observation_id' });
            obsStore.createIndex('type_id', 'type_id', { unique: false });
            obsStore.createIndex('region_id', 'region_id', { unique: false });
            obsStore.createIndex('captured_at', 'captured_at', { unique: false });
            obsStore.createIndex('observation_hash', 'observation_hash', { unique: false });
          }

          // 6. Opportunity Observations (Append-Only with Outcome Tracking)
          if (!db.objectStoreNames.contains('opportunity_observations')) {
            const oppStore = db.createObjectStore('opportunity_observations', { keyPath: 'observation_id' });
            oppStore.createIndex('opportunity_id', 'opportunity_id', { unique: false });
            oppStore.createIndex('type_id', 'type_id', { unique: false });
            oppStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // 7. Daily Raw History ESI Series
          if (!db.objectStoreNames.contains('market_history_daily')) {
            const dailyStore = db.createObjectStore('market_history_daily', { keyPath: 'key' });
            dailyStore.createIndex('type_id', 'type_id', { unique: false });
            dailyStore.createIndex('region_id', 'region_id', { unique: false });
          }

          // 8. EVE Online Types Catalog
          if (!db.objectStoreNames.contains('eve_types')) {
            const typesStore = db.createObjectStore('eve_types', { keyPath: 'type_id' });
            typesStore.createIndex('name', 'name', { unique: false });
            typesStore.createIndex('group_id', 'group_id', { unique: false });
            typesStore.createIndex('category_id', 'category_id', { unique: false });
          }

          // 9. Catalog Metadata and Audit Records
          if (!db.objectStoreNames.contains('catalog_metadata')) {
            db.createObjectStore('catalog_metadata', { keyPath: 'key' });
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
   * Saves an immutable MarketObservation (Append-Only)
   */
  static async saveMarketObservation(obs: MarketObservation): Promise<void> {
    this.memoryObservations.push(obs);
    // Keep memory bounded to latest 5000 observations
    if (this.memoryObservations.length > 5000) {
      this.memoryObservations.shift();
    }

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('market_observations', 'readwrite');
        const store = tx.objectStore('market_observations');
        store.put(obs);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves MarketObservations for a specific item and region
   */
  static async getMarketObservations(
    typeId: number,
    regionId: number,
    limit: number = 50
  ): Promise<MarketObservation[]> {
    const memoryMatches = this.memoryObservations
      .filter((o) => o.type_id === typeId && o.region_id === regionId)
      .slice(-limit);

    const isReady = await this.init();
    if (!isReady || !this.db) return memoryMatches;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('market_observations', 'readonly');
        const store = tx.objectStore('market_observations');
        const index = store.index('type_id');
        const req = index.getAll(typeId);

        req.onsuccess = () => {
          const results = (req.result as MarketObservation[]) || [];
          const filtered = results
            .filter((o) => o.region_id === regionId)
            .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())
            .slice(-limit);
          resolve(filtered.length > 0 ? filtered : memoryMatches);
        };
        req.onerror = () => resolve(memoryMatches);
      } catch {
        resolve(memoryMatches);
      }
    });
  }

  /**
   * Saves an immutable OpportunityObservation (Append-Only)
   */
  static async saveOpportunityObservation(opp: OpportunityObservation): Promise<void> {
    const existingIdx = this.memoryOpportunityObservations.findIndex(
      (o) => o.observation_id === opp.observation_id
    );
    if (existingIdx >= 0) {
      this.memoryOpportunityObservations[existingIdx] = opp;
    } else {
      this.memoryOpportunityObservations.push(opp);
      if (this.memoryOpportunityObservations.length > 1000) {
        this.memoryOpportunityObservations.shift();
      }
    }

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('opportunity_observations', 'readwrite');
        const store = tx.objectStore('opportunity_observations');
        store.put(opp);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves stored opportunity observations
   */
  static async getOpportunityObservations(
    typeId?: number,
    limit: number = 100
  ): Promise<OpportunityObservation[]> {
    const memoryMatches = typeId
      ? this.memoryOpportunityObservations.filter((o) => o.type_id === typeId).slice(-limit)
      : this.memoryOpportunityObservations.slice(-limit);

    const isReady = await this.init();
    if (!isReady || !this.db) return memoryMatches;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('opportunity_observations', 'readonly');
        const store = tx.objectStore('opportunity_observations');
        const req = typeId ? store.index('type_id').getAll(typeId) : store.getAll();

        req.onsuccess = () => {
          const results = (req.result as OpportunityObservation[]) || [];
          results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          resolve(results.slice(0, limit));
        };
        req.onerror = () => resolve(memoryMatches);
      } catch {
        resolve(memoryMatches);
      }
    });
  }

  /**
   * Saves raw daily history from ESI
   */
  static async saveDailyHistory(
    typeId: number,
    regionId: number,
    historyList: DailyMarketHistory[]
  ): Promise<void> {
    const key = this.getCompositeKey(typeId, regionId);
    this.memoryDailyHistory.set(key, historyList);

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('market_history_daily', 'readwrite');
        const store = tx.objectStore('market_history_daily');
        store.put({
          key,
          type_id: typeId,
          region_id: regionId,
          history: historyList,
          saved_at: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves raw daily history
   */
  static async getDailyHistory(typeId: number, regionId: number): Promise<DailyMarketHistory[]> {
    const key = this.getCompositeKey(typeId, regionId);
    const inMem = this.memoryDailyHistory.get(key);
    if (inMem && inMem.length > 0) return inMem;

    const isReady = await this.init();
    if (!isReady || !this.db) return inMem || [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('market_history_daily', 'readonly');
        const store = tx.objectStore('market_history_daily');
        const req = store.get(key);

        req.onsuccess = () => {
          const res = req.result;
          resolve(res?.history || inMem || []);
        };
        req.onerror = () => resolve(inMem || []);
      } catch {
        resolve(inMem || []);
      }
    });
  }

  /**
   * Atomically replaces the entire cached EVE types catalog and its metadata.
   * INVARIANT: Clears all existing records in the transaction before writing,
   * completely preventing stale records from previous versions from lingering.
   */
  static async replaceCatalog(types: EveTypeDetail[], metadata: TypeCatalogMetadata): Promise<void> {
    // 1. Refresh memory cache cleanly
    this.memoryTypes.clear();
    for (const t of types) {
      this.memoryTypes.set(t.type_id, t);
    }
    this.memoryCatalogMetadata = { ...metadata };

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['eve_types', 'catalog_metadata'], 'readwrite');
        const typesStore = tx.objectStore('eve_types');
        const metaStore = tx.objectStore('catalog_metadata');

        // Atomic wipe of all old types
        typesStore.clear();

        // Write validated fresh dataset
        for (const t of types) {
          typesStore.put(t);
        }

        // Store authoritative catalog metadata
        metaStore.put({
          key: 'active_catalog',
          metadata,
          persisted_at: new Date().toISOString(),
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves both cached EVE types and their authoritative persistence metadata.
   */
  static async getCatalogWithMetadata(): Promise<{
    types: EveTypeDetail[];
    metadata: TypeCatalogMetadata | null;
  }> {
    const inMemTypes = Array.from(this.memoryTypes.values());
    if (inMemTypes.length > 0 && this.memoryCatalogMetadata) {
      return { types: inMemTypes, metadata: this.memoryCatalogMetadata };
    }

    const isReady = await this.init();
    if (!isReady || !this.db) {
      return { types: inMemTypes, metadata: this.memoryCatalogMetadata };
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['eve_types', 'catalog_metadata'], 'readonly');
        const typesStore = tx.objectStore('eve_types');
        const metaStore = tx.objectStore('catalog_metadata');

        const typesReq = typesStore.getAll();
        const metaReq = metaStore.get('active_catalog');

        let fetchedTypes: EveTypeDetail[] = inMemTypes;
        let fetchedMeta: TypeCatalogMetadata | null = this.memoryCatalogMetadata;

        typesReq.onsuccess = () => {
          fetchedTypes = (typesReq.result as EveTypeDetail[]) || [];
        };

        metaReq.onsuccess = () => {
          if (metaReq.result && metaReq.result.metadata) {
            fetchedMeta = metaReq.result.metadata;
          }
        };

        tx.oncomplete = () => {
          this.memoryTypes.clear();
          for (const t of fetchedTypes) {
            this.memoryTypes.set(t.type_id, t);
          }
          this.memoryCatalogMetadata = fetchedMeta;
          resolve({ types: fetchedTypes, metadata: fetchedMeta });
        };

        tx.onerror = () => {
          resolve({ types: inMemTypes, metadata: this.memoryCatalogMetadata });
        };
      } catch {
        resolve({ types: inMemTypes, metadata: this.memoryCatalogMetadata });
      }
    });
  }

  /**
   * Clears only the catalog stores and memory cache.
   */
  static async clearCatalog(): Promise<void> {
    this.memoryTypes.clear();
    this.memoryCatalogMetadata = null;

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['eve_types', 'catalog_metadata'], 'readwrite');
        tx.objectStore('eve_types').clear();
        tx.objectStore('catalog_metadata').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Stores EVE online types (bulk legacy compatibility)
   */
  static async saveEveTypes(types: EveTypeDetail[]): Promise<void> {
    for (const t of types) {
      this.memoryTypes.set(t.type_id, t);
    }

    const isReady = await this.init();
    if (!isReady || !this.db || types.length === 0) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('eve_types', 'readwrite');
        const store = tx.objectStore('eve_types');
        for (const t of types) {
          store.put(t);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves all cached EVE types
   */
  static async getEveTypes(): Promise<EveTypeDetail[]> {
    const inMem = Array.from(this.memoryTypes.values());
    if (inMem.length > 0) return inMem;

    const isReady = await this.init();
    if (!isReady || !this.db) return inMem;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('eve_types', 'readonly');
        const store = tx.objectStore('eve_types');
        const req = store.getAll();

        req.onsuccess = () => {
          const results = (req.result as EveTypeDetail[]) || [];
          for (const t of results) {
            this.memoryTypes.set(t.type_id, t);
          }
          resolve(results);
        };
        req.onerror = () => resolve(inMem);
      } catch {
        resolve(inMem);
      }
    });
  }

  /**
   * Search cached EVE types
   */
  static async searchEveTypes(query: string, limit: number = 25): Promise<EveTypeDetail[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const all = await this.getEveTypes();
    return all
      .filter((t) => t.name.toLowerCase().includes(q) || String(t.type_id) === q)
      .slice(0, limit);
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
      observations_count: this.memoryObservations.length,
      opportunity_observations_count: this.memoryOpportunityObservations.length,
      types_count: this.memoryTypes.size,
      estimated_bytes: jsonLength,
      db_ready: Boolean(this.db),
      last_persisted_at: this.lastPersistedAt,
      last_write_status: this.lastWriteStatus,
      write_success_count: this.writeSuccessesCount,
      write_failure_count: this.writeFailuresCount,
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
    this.memoryObservations = [];
    this.memoryOpportunityObservations = [];
    this.memoryDailyHistory.clear();
    this.memoryTypes.clear();
    this.lastPersistedAt = null;

    try {
      localStorage.removeItem('eve_universe_opportunities');
    } catch {}

    const isReady = await this.init();
    if (!isReady || !this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(
          [
            'snapshots',
            'history',
            'universe_opportunities',
            'http_cache',
            'market_observations',
            'opportunity_observations',
            'market_history_daily',
            'eve_types',
            'catalog_metadata',
          ],
          'readwrite'
        );
        tx.objectStore('snapshots').clear();
        tx.objectStore('history').clear();
        tx.objectStore('universe_opportunities').clear();
        tx.objectStore('http_cache').clear();
        tx.objectStore('market_observations').clear();
        tx.objectStore('opportunity_observations').clear();
        tx.objectStore('market_history_daily').clear();
        tx.objectStore('eve_types').clear();
        tx.objectStore('catalog_metadata').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
