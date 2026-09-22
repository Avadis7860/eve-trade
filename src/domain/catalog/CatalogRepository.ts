import {
  EveTypeDetail,
  TypeCatalogMetadata,
  TypeCatalogStatus,
  TypeResolutionResult,
  MarketGroup,
  MarketCategory,
  CatalogProvenanceSource,
  CatalogCompleteness,
} from '../../types';

function catalogProvenance(
  source: CatalogProvenanceSource,
  verified: boolean,
  completeness: CatalogCompleteness,
  checksum: string,
  error?: string
) {
  return {
    source,
    loaded_at: new Date().toISOString(),
    verified,
    confidence: verified ? 1.0 : 0,
    completeness,
    version: CANONICAL_CATALOG_MANIFEST.version,
    checksum,
    expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
    ...(error ? { error } : {}),
  };
}
import { EVE_TYPES_CATALOG, EVE_GROUPS, EVE_CATEGORIES } from '../../data/universe';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { CatalogValidator } from './CatalogValidator';
import { CANONICAL_CATALOG_MANIFEST } from '../../data/catalogManifest';

export type CatalogListener = (meta: TypeCatalogMetadata, count: number) => void;

export class CatalogRepository {
  private static instance: CatalogRepository;

  private typeMap = new Map<number, EveTypeDetail>();
  private customTypeMap = new Map<number, EveTypeDetail>();
  private groupMap = new Map<number, MarketGroup>();
  private categoryMap = new Map<number, MarketCategory>();
  private metadata: TypeCatalogMetadata;
  private listeners = new Set<CatalogListener>();
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // 1. Seed with baseline verified catalog immediately so synchronous lookups never fail
    for (const t of EVE_TYPES_CATALOG) {
      this.typeMap.set(t.type_id, t);
    }

    // 2. Seed groups and categories
    for (const g of EVE_GROUPS) {
      this.groupMap.set(g.group_id, g);
    }
    for (const c of EVE_CATEGORIES) {
      this.categoryMap.set(c.category_id, c);
    }

    const baselineChecksum = CatalogValidator.computeCanonicalChecksum(EVE_TYPES_CATALOG);
    const integrity = CatalogValidator.validateCatalogCompleteness(EVE_TYPES_CATALOG, {
      expectedCount: CANONICAL_CATALOG_MANIFEST.expectedCount,
      expectedChecksum: CANONICAL_CATALOG_MANIFEST.checksum,
      currentChecksum: baselineChecksum,
      source: 'canonical_asset',
    });

    this.metadata = {
      version: CANONICAL_CATALOG_MANIFEST.version,
      checksum: baselineChecksum,
      item_count: this.typeMap.size,
      expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
      status: integrity.status,
      loaded_at: new Date().toISOString(),
      source: integrity.isReady ? 'canonical_asset' : 'fallback_core',
      is_degraded: !integrity.isReady,
      error: integrity.isReady ? undefined : integrity.reason,
      provenance: catalogProvenance(
        integrity.isReady ? 'canonical_asset' : 'fallback_core',
        integrity.isReady,
        integrity.isReady ? 'complete' : 'partial',
        baselineChecksum,
        integrity.reason
      ),
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
      (this.metadata.source === 'canonical_asset' || this.metadata.source === 'server' || this.metadata.source === 'indexeddb') &&
      this.metadata.version === CANONICAL_CATALOG_MANIFEST.version &&
      this.metadata.checksum === CANONICAL_CATALOG_MANIFEST.checksum &&
      this.metadata.expected_count === CANONICAL_CATALOG_MANIFEST.expectedCount &&
      this.typeMap.size === CANONICAL_CATALOG_MANIFEST.expectedCount
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

          if (
            !cached.metadata ||
            cached.metadata.status !== 'CATALOG_READY' ||
            cached.metadata.expected_count !== CANONICAL_CATALOG_MANIFEST.expectedCount ||
            cached.metadata.item_count !== CANONICAL_CATALOG_MANIFEST.expectedCount ||
            cached.types.length !== CANONICAL_CATALOG_MANIFEST.expectedCount ||
            cached.metadata.checksum !== CANONICAL_CATALOG_MANIFEST.checksum ||
            computedChecksum !== CANONICAL_CATALOG_MANIFEST.checksum ||
            errors.length > 0
          ) {
            console.warn('[CatalogRepository] Stale, legacy or partial IndexedDB cache detected. Purging cache.');
            await IndexedDbStore.clearCatalog();
          } else {
            // Cache is authentic and complete against the canonical manifest.
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
              version: CANONICAL_CATALOG_MANIFEST.version,
              expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
              checksum: CANONICAL_CATALOG_MANIFEST.checksum,
              provenance: catalogProvenance(
                'indexeddb',
                true,
                'complete',
                CANONICAL_CATALOG_MANIFEST.checksum
              ),
            };
            this.notify();
          }
        }
      } catch (err) {
        console.warn('CatalogRepository: could not read from IndexedDB:', err);
      }

      // 2. Fetch authoritative catalog from Backend API
      try {
        const res = await fetch('/api/types/all');
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        let types: EveTypeDetail[] = [];
        let serverMeta: Partial<TypeCatalogMetadata> = {};

        if (Array.isArray(data)) {
          types = data;
        } else if (data && Array.isArray(data.types)) {
          types = data.types;
          serverMeta = data.metadata || {};
        }

        if (types.length === 0) {
          throw new Error('Server returned empty types collection');
        }

        // Validate complete structure and items
        const { validTypes, errors } = CatalogValidator.validateCollection(types);
        if (validTypes.length === 0) {
          throw new Error(`Catalog verification failed: 0 valid items. Errors: ${errors.join(', ')}`);
        }

        const computedChecksum = CatalogValidator.computeCanonicalChecksum(validTypes);
        const completeness = CatalogValidator.validateCatalogCompleteness(validTypes, {
          expectedCount: serverMeta.expected_count,
          expectedChecksum: serverMeta.checksum,
          currentChecksum: computedChecksum,
          source: 'server',
        });

        if (
          serverMeta.status !== 'CATALOG_READY' ||
          !completeness.isReady ||
          serverMeta.expected_count !== CANONICAL_CATALOG_MANIFEST.expectedCount ||
          serverMeta.checksum !== CANONICAL_CATALOG_MANIFEST.checksum ||
          validTypes.length !== CANONICAL_CATALOG_MANIFEST.expectedCount ||
          computedChecksum !== CANONICAL_CATALOG_MANIFEST.checksum ||
          errors.length > 0
        ) {
          console.warn('[CatalogRepository] Server catalog rejected: canonical manifest mismatch or incomplete dataset.');
          return;
        }

        this.typeMap.clear();
        for (const t of validTypes) this.typeMap.set(t.type_id, t);

        this.metadata = {
          version: CANONICAL_CATALOG_MANIFEST.version,
          checksum: CANONICAL_CATALOG_MANIFEST.checksum,
          item_count: this.typeMap.size,
          expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
          status: 'CATALOG_READY',
          is_degraded: false,
          loaded_at: new Date().toISOString(),
          source: 'server',
          provenance: catalogProvenance('server', true, 'complete', CANONICAL_CATALOG_MANIFEST.checksum),
        };

        await IndexedDbStore.replaceCatalog(validTypes, this.metadata);
        this.notify();
      } catch (err) {
        console.warn('CatalogRepository: server sync offline or unavailable:', err);
        // Retain current in-memory cache
        if (this.typeMap.size === 0) {
          for (const t of EVE_TYPES_CATALOG) {
            this.typeMap.set(t.type_id, t);
          }
          this.metadata = {
            version: CANONICAL_CATALOG_MANIFEST.version,
            checksum: CatalogValidator.computeCanonicalChecksum(EVE_TYPES_CATALOG),
            item_count: this.typeMap.size,
            expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
            status: 'CATALOG_FALLBACK_CORE',
            loaded_at: new Date().toISOString(),
            source: 'fallback_core',
            is_degraded: true,
            error: `Failed to load catalog from server: ${String(err)}`,
            provenance: catalogProvenance('fallback_core', false, 'partial', CatalogValidator.computeCanonicalChecksum(EVE_TYPES_CATALOG), `Failed to load catalog from server: ${String(err)}`),
          };
          this.notify();
        }
      }
    })();

    return this.initPromise;
  }

  /**
   * Direct synchronous lookup by type_id.
   */
  getTypeById(typeId: number): EveTypeDetail | undefined {
    return this.customTypeMap.get(typeId) || this.typeMap.get(typeId);
  }

  /**
   * Resolves item volume in m³ with safe default.
   */
  getTypeVolume(typeId: number): number {
    const item = this.getTypeById(typeId);
    return item?.volume && item.volume > 0 ? item.volume : 0.01;
  }

  /**
   * Resolves an item with strict provenance, classification and certainty.
   * INVARIANT: Never masks an unknown type as a verified catalog type.
   */
  resolveType(typeId: number, fallbackDetails?: Partial<EveTypeDetail>): TypeResolutionResult {
    const meta = this.getMetadata();

    // 1. Canonical catalog type always has precedence over dynamic registrations.
    const catalogItem = this.typeMap.get(typeId);
    if (catalogItem) {
      const isFallback = !this.isReady();
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
        confidence: isFallback ? 0 : 1.0,
        provenance: catalogProvenance(
          isFallback ? 'fallback_core' : 'canonical_asset',
          !isFallback,
          isFallback ? 'partial' : 'complete',
          meta.checksum
        ),
      };
    }

    // 2. Custom dynamically registered type. Dynamic resolution is never canonical or verified.
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
        is_verified: false,
        confidence: 0.0,
        provenance: catalogProvenance('dynamic', false, 'unknown', meta.checksum),
      };
    }

    // 3. Fallback details provided (e.g. from opportunity or scanner)
    if (fallbackDetails && fallbackDetails.name) {
      const dynamicType: EveTypeDetail = {
        type_id: typeId,
        name: fallbackDetails.name,
        description: fallbackDetails.description || '',
        volume: fallbackDetails.volume && fallbackDetails.volume > 0 ? fallbackDetails.volume : 0.01,
        group_id: fallbackDetails.group_id || 0,
        group_name: fallbackDetails.group_name,
        category_id: fallbackDetails.category_id || 0,
        category_name: fallbackDetails.category_name,
        average_price: fallbackDetails.average_price,
      };
      this.registerCustomType(dynamicType);
      return {
        status: 'RESOLVED_DYNAMIC',
        type: dynamicType,
        type_id: typeId,
        name: dynamicType.name,
        volume: dynamicType.volume,
        group_id: dynamicType.group_id,
        category_id: dynamicType.category_id,
        source: 'custom_type',
        catalog_version: meta.version,
        catalog_checksum: meta.checksum,
        is_verified: false,
        confidence: 0.0,
        provenance: catalogProvenance('dynamic', false, 'unknown', meta.checksum),
      };
    }

    // 4. Unknown type
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
      provenance: catalogProvenance('unknown', false, 'unknown', meta.checksum, `Type ID ${typeId} is not present in local catalog or custom registrations`),
    };
  }

  /**
   * Batch resolves a collection of type IDs efficiently.
   */
  resolveTypesBatch(typeIds: number[]): Map<number, TypeResolutionResult> {
    const results = new Map<number, TypeResolutionResult>();
    for (const id of typeIds) {
      results.set(id, this.resolveType(id));
    }
    return results;
  }

  /**
   * Resolves a type asynchronously, falling back to server ESI lookup if not in local catalog.
   */
  async resolveTypeAsync(typeId: number): Promise<TypeResolutionResult> {
    const syncRes = this.resolveType(typeId);
    if (syncRes.status !== 'TYPE_UNKNOWN') {
      return syncRes;
    }

    try {
      const res = await fetch(`/api/types/lookup/${typeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.name) {
          const detail: EveTypeDetail = {
            type_id: typeId,
            name: data.name,
            volume: typeof data.volume === 'number' ? data.volume : 0.01,
            group_id: typeof data.group_id === 'number' ? data.group_id : 0,
            category_id: typeof data.category_id === 'number' ? data.category_id : 0,
            average_price: data.average_price,
            adjusted_price: data.adjusted_price,
          };
          this.customTypeMap.set(typeId, detail);
          const meta = this.getMetadata();
          return {
            status: 'RESOLVED_ESI',
            type: detail,
            type_id: typeId,
            name: detail.name,
            volume: detail.volume,
            group_id: detail.group_id,
            category_id: detail.category_id,
            source: 'esi_lookup',
            catalog_version: meta.version,
            catalog_checksum: meta.checksum,
            is_verified: false,
            confidence: 0.0,
            provenance: catalogProvenance('esi', false, 'unknown', meta.checksum),
          };
        }
      }
    } catch (err) {
      console.warn(`CatalogRepository: failed async lookup for type ${typeId}:`, err);
    }

    return syncRes;
  }

  /**
   * Resolves a human-readable name for a given type_id with guaranteed fallback.
   */
  getTypeName(typeId: number): string {
    const item = this.getTypeById(typeId);
    return item ? item.name : `Type #${typeId}`;
  }

  /**
   * Resolves market group by group_id.
   */
  getGroup(groupId: number): MarketGroup | undefined {
    return this.groupMap.get(groupId);
  }

  /**
   * Returns all known market groups.
   */
  getGroups(): MarketGroup[] {
    return Array.from(this.groupMap.values());
  }

  /**
   * Resolves market category by category_id.
   */
  getCategory(categoryId: number): MarketCategory | undefined {
    return this.categoryMap.get(categoryId);
  }

  /**
   * Returns all known market categories.
   */
  getCategories(): MarketCategory[] {
    return Array.from(this.categoryMap.values());
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
  registerCustomType(type: EveTypeDetail): TypeResolutionResult {
    const res = CatalogValidator.validateType(type);
    if (!res.isValid) {
      throw new Error(`Cannot register invalid custom type: ${res.error}`);
    }
    if (this.typeMap.has(type.type_id)) {
      return this.resolveType(type.type_id);
    }
    this.customTypeMap.set(type.type_id, type);
    this.notify();
    return this.resolveType(type.type_id);
  }

  /**
   * Explicitly loads a dataset through the same canonical trust boundary as all other sources.
   * Caller-provided metadata is descriptive only; readiness is always recomputed from the payload.
   */
  loadExplicitDataset(types: EveTypeDetail[], metadata: TypeCatalogMetadata): void {
    const { validTypes, errors } = CatalogValidator.validateCollection(types);
    const computedChecksum = CatalogValidator.computeCanonicalChecksum(validTypes);
    const integrity = CatalogValidator.validateCatalogCompleteness(validTypes, {
      expectedCount: CANONICAL_CATALOG_MANIFEST.expectedCount,
      expectedChecksum: CANONICAL_CATALOG_MANIFEST.checksum,
      currentChecksum: computedChecksum,
      source: metadata.source,
    });

    const trustedSource =
      metadata.source === 'canonical_asset' ||
      metadata.source === 'server' ||
      metadata.source === 'indexeddb';

    const status: TypeCatalogStatus =
      errors.length > 0
        ? 'CATALOG_CORRUPTED'
        : !trustedSource && integrity.isReady
          ? 'CATALOG_CORRUPTED'
          : integrity.status;

    this.typeMap.clear();
    for (const t of validTypes) {
      this.typeMap.set(t.type_id, t);
    }

    const provenanceSource: CatalogProvenanceSource =
      status === 'CATALOG_READY' &&
      (metadata.source === 'canonical_asset' ||
        metadata.source === 'server' ||
        metadata.source === 'indexeddb')
        ? metadata.source
        : 'unknown';

    this.metadata = {
      ...metadata,
      version: CANONICAL_CATALOG_MANIFEST.version,
      checksum: computedChecksum,
      item_count: this.typeMap.size,
      expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
      status,
      is_degraded: status !== 'CATALOG_READY',
      error: errors.length > 0 ? errors.join('; ') : integrity.reason,
      provenance: {
        source: provenanceSource,
        loaded_at: new Date().toISOString(),
        verified: status === 'CATALOG_READY',
        confidence: status === 'CATALOG_READY' ? 1.0 : 0,
        completeness: status === 'CATALOG_READY' ? 'complete' : 'partial',
        version: CANONICAL_CATALOG_MANIFEST.version,
        checksum: computedChecksum,
        expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
        error: errors.length > 0 ? errors.join('; ') : integrity.reason,
      },
    };
    this.notify();
  }

  /**
   * Returns current metadata and health status.
   */
  getMetadata(): TypeCatalogMetadata {
    return {
      ...this.metadata,
      item_count: this.typeMap.size,
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
