import { EveTypeDetail, TypeCatalogMetadata, TypeCatalogStatus } from '../types';
import { EVE_TYPES_CATALOG } from '../data/universe';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
   * Validates an individual EveTypeDetail item conforming to EVE Online specifications.
   */
  static validateTypeItem(item: any): { isValid: boolean; error?: string } {
    if (!item || typeof item !== 'object') {
      return { isValid: false, error: 'Item is null or not an object' };
    }
    const typeId = Number(item.type_id);
    if (!Number.isInteger(typeId) || typeId <= 0) {
      return { isValid: false, error: `Invalid type_id: ${item.type_id}` };
    }
    if (typeof item.name !== 'string' || item.name.trim().length === 0) {
      return { isValid: false, error: `Type ${typeId} has missing or empty name` };
    }
    const volume = Number(item.volume);
    if (!Number.isFinite(volume) || volume < 0) {
      return { isValid: false, error: `Type ${typeId} has invalid volume: ${item.volume}` };
    }
    return { isValid: true };
  }

  /**
   * Computes deterministic SHA-256 checksum for catalog content.
   */
  static computeChecksum(data: string | Buffer | object[]): string {
    const hash = crypto.createHash('sha256');
    if (typeof data === 'string') {
      hash.update(data);
    } else if (Buffer.isBuffer(data)) {
      hash.update(data);
    } else {
      // Deterministic sort by type_id before hashing
      const sorted = [...data].sort((a: any, b: any) => (a.type_id || 0) - (b.type_id || 0));
      hash.update(JSON.stringify(sorted));
    }
    return hash.digest('hex');
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

    // 1. File Not Found -> Fallback to EVE_TYPES_CATALOG with CATALOG_UNAVAILABLE / CATALOG_FALLBACK_CORE
    if (!foundPath) {
      const fallbackChecksum = this.computeChecksum(EVE_TYPES_CATALOG);
      const metadata: TypeCatalogMetadata = {
        version: CATALOG_VERSION,
        checksum: fallbackChecksum,
        item_count: EVE_TYPES_CATALOG.length,
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
        checksum: this.computeChecksum(rawContent),
        item_count: 0,
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

    // 3. Validate every item
    const validItems: EveTypeDetail[] = [];
    const itemErrors: string[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const val = this.validateTypeItem(item);
      if (val.isValid) {
        validItems.push({
          type_id: Number(item.type_id),
          name: String(item.name).trim(),
          group_id: Number(item.group_id || 0),
          category_id: Number(item.category_id || 0),
          volume: Number(item.volume || 0.01),
          packaged_volume: item.packaged_volume ? Number(item.packaged_volume) : undefined,
          average_price: item.average_price ? Number(item.average_price) : undefined,
          adjusted_price: item.adjusted_price ? Number(item.adjusted_price) : undefined,
          description: item.description ? String(item.description) : undefined,
        });
      } else {
        itemErrors.push(`Index ${i}: ${val.error}`);
      }
    }

    const checksum = this.computeChecksum(rawContent);
    const isCorrupted = itemErrors.length > 0 && validItems.length === 0;
    const isDegraded = validItems.length < 50;

    const status: TypeCatalogStatus = isCorrupted
      ? 'CATALOG_CORRUPTED'
      : validItems.length === 0
      ? 'CATALOG_EMPTY'
      : isDegraded
      ? 'CATALOG_DEGRADED'
      : 'CATALOG_READY';

    const metadata: TypeCatalogMetadata = {
      version: CATALOG_VERSION,
      checksum: checksum,
      item_count: validItems.length,
      status: status,
      loaded_at: nowIso,
      source: 'filesystem',
      file_path: foundPath,
      minimum_expected_count: 50,
      is_degraded: isDegraded,
      error: itemErrors.length > 0 ? `${itemErrors.length} invalid items encountered` : undefined,
    };

    this.cachedMetadata = metadata;
    this.cachedTypes = validItems;
    return { metadata, types: validItems };
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
