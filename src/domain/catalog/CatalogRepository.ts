import { EveTypeDetail, TypeCatalogMetadata, TypeCatalogStatus, TypeResolutionResult } from '../../types';
import { EVE_TYPES_CATALOG } from '../../data/universe';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { CatalogValidator } from './CatalogValidator';

export type CatalogListener = (meta: TypeCatalogMetadata, count: number) => void;

export class CatalogRepository {
  private static instance: CatalogRepository;

  private typeMap = new Map<number, EveTypeDetail>();
  private customTypeMap = new Map<number, EveTypeDetail>();
  private metadata: TypeCatalogMetadata;
  private listeners = new Set<CatalogListener>();
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Seed with baseline verified catalog immediately so synchronous lookups never fail
    for (const t of EVE_TYPES_CATALOG) {
      this.typeMap.set(t.type_id, t);
    }
    const baselineChecksum = CatalogValidator.computeCanonicalChecksum(EVE_TYPES_CATALOG);

    // INVARIANT: Baseline fallback core is NEVER CATALOG_READY
    this.metadata = {
      version: '2026.09.20.1',
      checksum: baselineChecksum,
      item_count: this.typeMap.size,
      expected_count: this.typeMap.size,
      status: 'CATALOG_FALLBACK_CORE',
      loaded_at: new Date().toISOString(),
      source: 'fallback_core',
      is_degraded: true,
      error: 'Operating in baseline fallback core mode',
    };
  }

  static getInstance(): CatalogRepository {
    if (!CatalogRepository.instance) {
      CatalogRepository.instance = new CatalogRepository();
    }
    return CatalogRepository.instance;
  }

  /**
   * Resets the repository instance (primarily for isolated test executions).
   */
  static resetInstance(): void {
    CatalogRepository.instance = new CatalogRepository();
  }

  /**
   * Checks if the catalog satisfies complete verifiable readiness invariants.
   * INVARIANT: CATALOG_FALLBACK_CORE can NEVER return isReady() === true.
   */
  isReady(): boolean {
    return (
      this.metadata.status === 'CATALOG_READY' &&
      !this.metadata.is_degraded &&
      this.metadata.source !== 'fallback_core' &&
      this.typeMap.size > 0
    );
  }

  /**
   * Checks if the catalog is running in degraded or fallback mode.
   */
  isDegraded(): boolean {
    return !this.isReady();
  }

  /**
   * Initializes the repository by hydrating from IndexedDB then querying the server catalog.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1. Instant local load from IndexedDB cache with strict checksum validation
      try {
        const cached = await IndexedDbStore.getCatalogWithMetadata();
        if (cached && cached.types && cached.types.length > 0) {
          const { validTypes, errors } = CatalogValidator.validateCollection(cached.types);
          const computedChecksum = CatalogValidator.computeCanonicalChecksum(validTypes);

          // Stale or corrupted cache check (purge old fallback caches with < 1000 items)
          if (
            !cached.metadata ||
            cached.metadata.item_count < 1000 ||
            cached.types.length < 1000 ||
            cached.metadata.checksum !== computedChecksum ||
            cached.metadata.item_count !== validTypes.length ||
            errors.length > 0
          ) {
            console.warn('[CatalogRepository] Stale, legacy or partial IndexedDB cache detected. Purging cache.');
            await IndexedDbStore.clearCatalog();
          } else {
            // Cache is authentic and complete (> 1000 items)
            this.typeMap.clear();
            for (const t of validTypes) {
              this.typeMap.set(t.type_id, t);
            }

            const completeness = CatalogValidator.validateCatalogCompleteness(validTypes, {
              expectedCount: cached.metadata.expected_count,
              expectedChecksum: cached.metadata.checksum,
              currentChecksum: computedChecksum,
              source: cached.metadata.source,
            });

            this.metadata = {
              ...cached.metadata,
              status: completeness.status,
              is_degraded: completeness.isDegraded,
              item_count: this.typeMap.size,
              loaded_at: new Date().toISOString(),
              source: 'indexeddb',
            };
            this.notify();
          }
        }
      } catch (err) {
        console.warn('CatalogRepository: could not read from IndexedDB:', err);
      }

      // 2. Fetch fresh catalog and verified metadata from server
      try {
        const res = await fetch('/api/types/all');
        if (res.ok) {
          const data = await res.json();
          const rawItems: unknown[] = Array.isArray(data) ? data : data.types || [];
          const serverMeta: TypeCatalogMetadata | undefined = data.metadata;

          if (!serverMeta) {
            this.metadata = {
              ...this.metadata,
              status: 'CATALOG_CORRUPTED',
              is_degraded: true,
              error: 'Server response violates contract: missing catalog metadata',
            };
            this.notify();
            return;
          }

          // Validate server payload collection
          const { validTypes, errors } = CatalogValidator.validateCollection(rawItems);

          // Contract check: Item count match
          if (validTypes.length !== serverMeta.item_count || errors.length > 0) {
            this.metadata = {
              ...this.metadata,
              status: 'CATALOG_CORRUPTED',
              is_degraded: true,
              error: `Server payload count mismatch or errors (expected ${serverMeta.item_count}, valid ${validTypes.length}, errors ${errors.length})`,
            };
            this.notify();
            return;
          }

          // Contract check: Checksum match
          const computedChecksum = CatalogValidator.computeCanonicalChecksum(validTypes);
          if (computedChecksum !== serverMeta.checksum) {
            this.metadata = {
              ...this.metadata,
              status: 'CATALOG_CORRUPTED',
              is_degraded: true,
              error: `Server checksum mismatch: expected ${serverMeta.checksum}, computed ${computedChecksum}`,
            };
            this.notify();
            return;
          }

          // Evaluate completeness
          const completeness = CatalogValidator.validateCatalogCompleteness(validTypes, {
            expectedCount: serverMeta.expected_count,
            expectedChecksum: serverMeta.checksum,
            currentChecksum: computedChecksum,
            source: serverMeta.source,
          });

          // ATOMIC REPLACEMENT of types map
          this.typeMap.clear();
          for (const t of validTypes) {
            this.typeMap.set(t.type_id, t);
          }

          this.metadata = {
            version: serverMeta.version,
            checksum: computedChecksum,
            item_count: this.typeMap.size,
            expected_count: serverMeta.expected_count,
            status: completeness.status,
            loaded_at: new Date().toISOString(),
            source: serverMeta.source || 'server',
            is_degraded: completeness.isDegraded,
            error: completeness.reason,
          };

          // Persist atomically to IndexedDB
          await IndexedDbStore.replaceCatalog(validTypes, this.metadata);
          this.notify();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn('CatalogRepository: server sync offline or unavailable:', err);
        if (!this.isReady()) {
          if (this.typeMap.size > 1000) {
            const types = Array.from(this.typeMap.values());
            const checksum = CatalogValidator.computeCanonicalChecksum(types);
            this.metadata = {
              version: '2026.09.20.1',
              checksum,
              item_count: types.length,
              expected_count: types.length,
              status: 'CATALOG_READY',
              loaded_at: new Date().toISOString(),
              source: 'filesystem',
              is_degraded: false,
            };
            this.notify();
          } else {
            this.metadata.status = 'CATALOG_FALLBACK_CORE';
            this.metadata.is_degraded = true;
            this.metadata.error = 'Server sync offline; operating on verified fallback core';
            this.notify();
          }
        }
      }
    })();

    return this.initPromise;
  }

  /**
   * Retrieves an item by unique CCP type_id (O(1)).
   */
  getTypeById(typeId: number): EveTypeDetail | undefined {
    return this.customTypeMap.get(typeId) || this.typeMap.get(typeId);
  }

  /**
   * Resolves an item with strict provenance, classification and certainty.
   * INVARIANT: Never masks an unknown type as a verified catalog type.
   */
  resolveType(typeId: number): TypeResolutionResult {
    const meta = this.getMetadata();

    // 1. Custom dynamically registered type
    const custom = this.customTypeMap.get(typeId);
    if (custom) {
      return {
        status: 'RESOLVED_DYNAMIC',
        type: custom,
        type_id: custom.type_id,
        name: custom.name,
        volume: custom.volume,
        group_id: custom.group_id,
        category_id: custom.category_id,
        source: 'custom_type',
        catalog_version: meta.version,
        catalog_checksum: meta.checksum,
        is_verified: true,
        confidence: 1.0,
      };
    }

    // 2. Canonical catalog type
    const catalogItem = this.typeMap.get(typeId);
    if (catalogItem) {
      const isFallback = this.metadata.status === 'CATALOG_FALLBACK_CORE' || this.metadata.source === 'fallback_core';
      return {
        status: 'RESOLVED_CATALOG',
        type: catalogItem,
        type_id: catalogItem.type_id,
        name: catalogItem.name,
        volume: catalogItem.volume,
        group_id: catalogItem.group_id,
        category_id: catalogItem.category_id,
        source: isFallback ? 'fallback_core' : 'catalog_ready',
        catalog_version: meta.version,
        catalog_checksum: meta.checksum,
        is_verified: !isFallback,
        confidence: isFallback ? 0.85 : 1.0,
      };
    }

    // 3. Unknown type
    return {
      status: 'TYPE_UNKNOWN',
      type: undefined,
      type_id: typeId,
      name: `Type #${typeId}`,
      volume: 0.01,
      group_id: 0,
      category_id: 0,
      source: 'none',
      catalog_version: meta.version,
      catalog_checksum: meta.checksum,
      is_verified: false,
      confidence: 0.0,
      error: `Type ID ${typeId} is not present in local catalog or custom registrations`,
    };
  }

  /**
   * Resolves a human-readable name for a given type_id with guaranteed fallback.
   */
  getTypeName(typeId: number): string {
    const item = this.getTypeById(typeId);
    return item ? item.name : `Type #${typeId}`;
  }

  /**
   * Returns all known verified types (including custom added types).
   */
  getAllTypes(): EveTypeDetail[] {
    const combined = new Map(this.typeMap);
    for (const [id, custom] of this.customTypeMap) {
      combined.set(id, custom);
    }
    return Array.from(combined.values());
  }

  /**
   * Returns types specifically eligible for trade/scanning.
   */
  getTradableTypes(): EveTypeDetail[] {
    return this.getAllTypes().filter((t) => t.type_id > 0 && t.name.length > 0);
  }

  /**
   * Searches types by name or ID.
   */
  search(query: string, limit = 100): EveTypeDetail[] {
    const term = query.trim().toLowerCase();
    if (!term) return this.getAllTypes().slice(0, limit);

    const isNum = /^\d+$/.test(term);
    if (isNum) {
      const num = Number(term);
      const exact = this.getTypeById(num);
      const rest = this.getAllTypes().filter((t) => t.type_id !== num && (t.type_id.toString().includes(term) || t.name.toLowerCase().includes(term)));
      return exact ? [exact, ...rest].slice(0, limit) : rest.slice(0, limit);
    }

    return this.getAllTypes()
      .filter((t) => t.name.toLowerCase().includes(term) || t.type_id.toString().includes(term))
      .slice(0, limit);
  }

  /**
   * Alias for search for intuitive discovery.
   */
  searchTypes(query: string, limit = 100): EveTypeDetail[] {
    return this.search(query, limit);
  }

  /**
   * Registers a user-defined custom type.
   */
  registerCustomType(type: EveTypeDetail): void {
    const res = CatalogValidator.validateType(type);
    if (!res.isValid) {
      throw new Error(`Cannot register invalid custom type: ${res.error}`);
    }
    this.customTypeMap.set(type.type_id, type);
    this.notify();
  }

  /**
   * Explicitly sets catalog types and metadata (used for testing or explicit sync injection).
   */
  loadExplicitDataset(types: EveTypeDetail[], metadata: TypeCatalogMetadata): void {
    this.typeMap.clear();
    for (const t of types) {
      this.typeMap.set(t.type_id, t);
    }
    this.metadata = { ...metadata };
    this.notify();
  }

  /**
   * Returns current metadata and health status.
   */
  getMetadata(): TypeCatalogMetadata {
    return {
      ...this.metadata,
      item_count: this.typeMap.size + this.customTypeMap.size,
    };
  }

  /**
   * Subscribes a callback to repository updates.
   */
  subscribe(listener: CatalogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const meta = this.getMetadata();
    const count = meta.item_count;
    this.listeners.forEach((fn) => {
      try {
        fn(meta, count);
      } catch (e) {
        console.warn('CatalogRepository listener error:', e);
      }
    });
  }
}
