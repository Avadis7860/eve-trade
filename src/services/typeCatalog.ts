import { EveTypeDetail, TypeCatalogMetadata, TypeCatalogStatus } from '../types';
import { EVE_TYPES_CATALOG } from '../data/universe';
import { CatalogHashing } from '../domain/catalog/CatalogHashing';
import { CatalogValidator } from '../domain/catalog/CatalogValidator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const CATALOG_VERSION = '2026.09.20.1';

function getModuleDir(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  return process.cwd();
}

export class TypeCatalogService {
  private static cachedMetadata: TypeCatalogMetadata | null = null;
  private static cachedTypes: EveTypeDetail[] = [];

  /**
   * Computes deterministic SHA-256 checksum for catalog items using the canonical normalizer.
   */
  static computeChecksum(items: EveTypeDetail[]): string {
    return CatalogHashing.computeCatalogChecksum(items);
  }

  /**
   * Candidate paths to resolve allMarketTypes.json in various runtime environments (dev, prod, Docker).
   */
  static getCandidatePaths(): string[] {
    const modDir = getModuleDir();
    return [
      path.resolve(process.cwd(), 'src', 'data', 'allMarketTypes.json'),
      path.resolve(process.cwd(), 'data', 'allMarketTypes.json'),
      path.resolve(modDir, '..', 'data', 'allMarketTypes.json'),
      path.resolve(modDir, '..', '..', 'src', 'data', 'allMarketTypes.json'),
    ];
  }

  /**
   * Loads and validates the catalog from disk with fallback to verified core catalog.
   * INVARIANT: Never masks baseline core datasets (53 types) as CATALOG_READY.
   * Fallback datasets are strictly typed as CATALOG_FALLBACK_CORE.
   */
  static loadCatalog(explicitPath?: string): { metadata: TypeCatalogMetadata; types: EveTypeDetail[] } {
    const candidatePaths = explicitPath ? [explicitPath] : this.getCandidatePaths();
    let foundPath: string | null = null;

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      } catch {}
    }

    const nowIso = new Date().toISOString();

    // 1. File Not Found -> Fallback to EVE_TYPES_CATALOG
    if (!foundPath) {
      const fallbackChecksum = this.computeChecksum(EVE_TYPES_CATALOG);
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: fallbackChecksum,
        item_count: EVE_TYPES_CATALOG.length,
        expected_count: EVE_TYPES_CATALOG.length,
        status: 'CATALOG_FALLBACK_CORE',
        loaded_at: nowIso,
        source: 'fallback_core',
        error: 'allMarketTypes.json file not found on disk; utilizing verified in-memory core catalog',
      };
      this.cachedMetadata = metadata;
      this.cachedTypes = [...EVE_TYPES_CATALOG];
      return { metadata, types: this.cachedTypes };
    }

    // 2. Read File and Check for Corruption / Empty
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(foundPath, 'utf-8');
    } catch (readErr) {
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: this.computeChecksum(EVE_TYPES_CATALOG),
        item_count: EVE_TYPES_CATALOG.length,
        expected_count: EVE_TYPES_CATALOG.length,
        status: 'CATALOG_CORRUPTED',
        loaded_at: nowIso,
        source: 'fallback_core',
        file_path: foundPath,
        error: `Failed to read catalog file: ${String(readErr)}`,
      };
      this.cachedMetadata = metadata;
      this.cachedTypes = [...EVE_TYPES_CATALOG];
      return { metadata, types: this.cachedTypes };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: this.computeChecksum(EVE_TYPES_CATALOG),
        item_count: EVE_TYPES_CATALOG.length,
        expected_count: EVE_TYPES_CATALOG.length,
        status: 'CATALOG_CORRUPTED',
        loaded_at: nowIso,
        source: 'fallback_core',
        file_path: foundPath,
        error: `JSON parse error in catalog file: ${String(parseErr)}`,
      };
      this.cachedMetadata = metadata;
      this.cachedTypes = [...EVE_TYPES_CATALOG];
      return { metadata, types: this.cachedTypes };
    }

    if (!Array.isArray(parsed)) {
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: this.computeChecksum(EVE_TYPES_CATALOG),
        item_count: EVE_TYPES_CATALOG.length,
        expected_count: EVE_TYPES_CATALOG.length,
        status: 'CATALOG_CORRUPTED',
        loaded_at: nowIso,
        source: 'fallback_core',
        file_path: foundPath,
        error: 'Catalog root JSON is not an array',
      };
      this.cachedMetadata = metadata;
      this.cachedTypes = [...EVE_TYPES_CATALOG];
      return { metadata, types: this.cachedTypes };
    }

    if (parsed.length === 0) {
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: CatalogHashing.computeCatalogChecksum([]),
        item_count: 0,
        expected_count: 0,
        status: 'CATALOG_EMPTY',
        loaded_at: nowIso,
        source: 'filesystem',
        file_path: foundPath,
        error: 'Catalog file contains zero items',
      };
      this.cachedMetadata = metadata;
      this.cachedTypes = [];
      return { metadata, types: [] };
    }

    // 3. Validate every item using domain validator
    const { validTypes, errors } = CatalogValidator.validateCollection(parsed);

    const isCorrupted = errors.length > 0 && validTypes.length === 0;
    const checksum = CatalogHashing.computeCatalogChecksum(validTypes);

    // INVARIANT: Baseline of <= 100 types represents the core fallback catalog (53 types).
    // When the full universal SDE dataset (> 1000 items) is present, it is CATALOG_READY.
    const isFullUniverse = validTypes.length > 500;
    const status: TypeCatalogStatus = isCorrupted
      ? 'CATALOG_CORRUPTED'
      : validTypes.length === 0
      ? 'CATALOG_EMPTY'
      : isFullUniverse
      ? 'CATALOG_READY'
      : 'CATALOG_FALLBACK_CORE';

    const source = isFullUniverse ? 'server' : 'fallback_core';
    const is_degraded = !isFullUniverse;

    const metadata: TypeCatalogMetadata = {
      version: CATALOG_VERSION,
      checksum,
      item_count: validTypes.length,
      expected_count: validTypes.length,
      status,
      loaded_at: nowIso,
      source,
      file_path: foundPath,
      minimum_expected_count: validTypes.length,
      is_degraded,
      error: errors.length > 0 ? `${errors.length} invalid items encountered` : undefined,
    };

    this.cachedMetadata = metadata;
    this.cachedTypes = validTypes;
    return { metadata, types: validTypes };
  }

  /**
   * Returns current cached catalog metadata.
   */
  static getMetadata(): TypeCatalogMetadata {
    if (!this.cachedMetadata) {
      this.loadCatalog();
    }
    return this.cachedMetadata!;
  }

  /**
   * Returns current cached catalog types.
   */
  static getTypes(): EveTypeDetail[] {
    if (!this.cachedMetadata) {
      this.loadCatalog();
    }
    return this.cachedTypes;
  }

  /**
   * Look up a single type by its unique CCP type_id.
   */
  static getTypeById(typeId: number): EveTypeDetail | undefined {
    const types = this.getTypes();
    return types.find((t) => t.type_id === typeId);
  }

  /**
   * Fast in-memory search across cached types.
   */
  static searchTypes(query: string, limit = 50): EveTypeDetail[] {
    const q = (query || '').trim().toLowerCase();
    const types = this.getTypes();
    if (!q) return types.slice(0, limit);

    const isNumeric = /^\d+$/.test(q);
    if (isNumeric) {
      const numId = Number(q);
      const exact = types.find((t) => t.type_id === numId);
      if (exact) return [exact];
    }

    const results: EveTypeDetail[] = [];
    for (const t of types) {
      if (t.name.toLowerCase().includes(q) || String(t.type_id) === q) {
        results.push(t);
        if (results.length >= limit) break;
      }
    }
    return results;
  }
}
