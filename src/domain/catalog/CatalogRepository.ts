import { EveTypeDetail, TypeCatalogMetadata, TypeCatalogStatus } from '../../types';
import { EVE_TYPES_CATALOG } from '../../data/universe';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { CatalogValidator } from './CatalogValidator';

export type CatalogListener = (meta: TypeCatalogMetadata, count: number) => void;

export class CatalogRepository {
  private static instance: CatalogRepository;
  private typeMap = new Map<number, EveTypeDetail>();
  private customTypeMap = new Map<number, EveTypeDetail>();
  private metadata: TypeCatalogMetadata = {
    version: '2026.09.20.1',
    checksum: 'uninitialized',
    item_count: 0,
    status: 'CATALOG_UNAVAILABLE',
    loaded_at: new Date().toISOString(),
    source: 'uninitialized',
  };
  private listeners = new Set<CatalogListener>();
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Seed with baseline verified catalog immediately so synchronous lookups never fail
    for (const t of EVE_TYPES_CATALOG) {
      this.typeMap.set(t.type_id, t);
    }
    this.metadata = {
      version: '2026.09.20.1',
      checksum: 'baseline_core',
      item_count: this.typeMap.size,
      status: 'CATALOG_FALLBACK_CORE',
      loaded_at: new Date().toISOString(),
      source: 'fallback_core',
    };
  }

  static getInstance(): CatalogRepository {
    if (!CatalogRepository.instance) {
      CatalogRepository.instance = new CatalogRepository();
    }
    return CatalogRepository.instance;
  }

  /**
   * Initializes the repository by hydrating from IndexedDB then querying the server catalog.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // 1. Instant local load from IndexedDB cache
      try {
        const cached = await IndexedDbStore.getEveTypes();
        if (cached && cached.length > 0) {
          const { validTypes } = CatalogValidator.validateCollection(cached);
          if (validTypes.length > 0) {
            for (const t of validTypes) {
              this.typeMap.set(t.type_id, t);
            }
            this.metadata = {
              version: this.metadata.version,
              checksum: 'cached_indexeddb',
              item_count: this.typeMap.size,
              status: 'CATALOG_LOADED',
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
        const res = await fetch('/api/types/all?include_metadata=true');
        if (res.ok) {
          const data = await res.json();
          const rawItems = Array.isArray(data) ? data : data.types || [];
          const serverMeta: TypeCatalogMetadata | undefined = data.metadata;

          const { validTypes, errors } = CatalogValidator.validateCollection(rawItems);
          if (validTypes.length > 0) {
            for (const t of validTypes) {
              const existing = this.typeMap.get(t.type_id);
              if (existing) {
                // Merge pricing without overwriting foundational properties
                this.typeMap.set(t.type_id, {
                  ...existing,
                  ...t,
                  average_price: t.average_price ?? existing.average_price,
                  adjusted_price: t.adjusted_price ?? existing.adjusted_price,
                });
              } else {
                this.typeMap.set(t.type_id, t);
              }
            }

            this.metadata = {
              version: serverMeta?.version || this.metadata.version,
              checksum: serverMeta?.checksum || 'server_verified',
              item_count: this.typeMap.size,
              status: serverMeta?.status || 'CATALOG_LOADED',
              loaded_at: new Date().toISOString(),
              source: 'server',
              error: errors.length > 0 ? `${errors.length} types skipped during validation` : undefined,
            };

            // Persist verified items to IndexedDB
            await IndexedDbStore.saveEveTypes(Array.from(this.typeMap.values()));
            this.notify();
          }
        }
      } catch (err) {
        console.warn('CatalogRepository: server sync offline or unavailable:', err);
        if (this.metadata.status !== 'CATALOG_LOADED') {
          this.metadata.status = 'CATALOG_FALLBACK_CORE';
          this.notify();
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
