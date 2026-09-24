import { EveTypeDetail, TypeCatalogStatus } from '../../types';
import { CatalogHashing } from './CatalogHashing';
import { CANONICAL_CATALOG_MANIFEST } from '../../data/catalogManifest';

export interface CatalogValidationResult {
  isValid: boolean;
  error?: string;
  field?: string;
}

export interface CatalogCompletenessOptions {
  expectedCount?: number;
  expectedChecksum?: string;
  currentChecksum?: string;
  source?: string;
}

export class CatalogValidator {
  static computeCanonicalChecksum(items: EveTypeDetail[]): string {
    return CatalogHashing.computeCatalogChecksum(items);
  }

  static validateType(item: unknown): CatalogValidationResult {
    if (!item || typeof item !== 'object') {
      return { isValid: false, error: 'Item is null or not an object' };
    }

    const rec = item as Record<string, unknown>;
    const typeId = Number(rec.type_id);
    if (!Number.isInteger(typeId) || typeId <= 0) {
      return { isValid: false, error: `Invalid or non-positive type_id: ${rec.type_id}`, field: 'type_id' };
    }
    if (typeof rec.name !== 'string' || rec.name.trim().length === 0) {
      return { isValid: false, error: `Type #${typeId} has empty or missing name`, field: 'name' };
    }
    const volume = Number(rec.volume);
    if (!Number.isFinite(volume) || volume < 0) {
      return { isValid: false, error: `Type #${typeId} has invalid volume: ${rec.volume}`, field: 'volume' };
    }
    return { isValid: true };
  }

  static validateCollection(items: unknown[]): {
    validTypes: EveTypeDetail[];
    errors: string[];
    uniqueTypeIds: Set<number>;
  } {
    const validMap = new Map<number, EveTypeDetail>();
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = this.validateType(items[i]);
      if (!result.isValid) {
        errors.push(`Row ${i}: ${result.error}`);
        continue;
      }

      const rec = items[i] as Record<string, unknown>;
      const typeId = Number(rec.type_id);
      if (validMap.has(typeId)) {
        errors.push(`Duplicate type_id ${typeId} detected at index ${i}`);
      }

      validMap.set(typeId, {
        type_id: typeId,
        name: String(rec.name).trim(),
        group_id: Number(rec.group_id || 0),
        group_name: rec.group_name ? String(rec.group_name) : undefined,
        category_id: Number(rec.category_id || 0),
        category_name: rec.category_name ? String(rec.category_name) : undefined,
        volume: Number(rec.volume),
        packaged_volume: rec.packaged_volume ? Number(rec.packaged_volume) : undefined,
        portion_size: rec.portion_size ? Number(rec.portion_size) : 1,
        average_price: rec.average_price ? Number(rec.average_price) : undefined,
        adjusted_price: rec.adjusted_price ? Number(rec.adjusted_price) : undefined,
        description: rec.description ? String(rec.description) : undefined,
      });
    }

    const validTypes = Array.from(validMap.values());
    return { validTypes, errors, uniqueTypeIds: new Set(validMap.keys()) };
  }

  static validateCatalogCompleteness(
    items: EveTypeDetail[],
    optionsOrMinCount: CatalogCompletenessOptions | number = {},
    legacyExpectedChecksum?: string,
    legacyCurrentChecksum?: string
  ): {
    isReady: boolean;
    isDegraded: boolean;
    status: TypeCatalogStatus;
    reason?: string;
  } {
    const options: CatalogCompletenessOptions =
      typeof optionsOrMinCount === 'number'
        ? {
            expectedCount: optionsOrMinCount,
            expectedChecksum: legacyExpectedChecksum,
            currentChecksum: legacyCurrentChecksum,
          }
        : optionsOrMinCount;

    const expectedCount = CANONICAL_CATALOG_MANIFEST.expectedCount;
    const expectedChecksum = CANONICAL_CATALOG_MANIFEST.checksum;
    const currentChecksum =
      options.currentChecksum || (items.length > 0 ? this.computeCanonicalChecksum(items) : '');

    if (!items || items.length === 0) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_EMPTY',
        reason: 'Catalog has 0 items',
      };
    }

    if (options.source === 'fallback_core' || options.source === 'filesystem_core') {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_FALLBACK_CORE',
        reason: 'Catalog is operating on fallback core data; canonical completeness is not established.',
      };
    }

    if (items.length < expectedCount) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_PARTIAL',
        reason: `Catalog items count (${items.length}) is lower than canonical expected count (${expectedCount})`,
      };
    }

    if (items.length > expectedCount) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_CORRUPTED',
        reason: `Catalog items count (${items.length}) exceeds canonical expected count (${expectedCount})`,
      };
    }

    if (options.expectedCount !== undefined && options.expectedCount !== expectedCount) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_CORRUPTED',
        reason: `Catalog metadata expected_count (${options.expectedCount}) does not match canonical expected count (${expectedCount})`,
      };
    }

    if (options.expectedChecksum !== undefined && options.expectedChecksum !== expectedChecksum) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_CORRUPTED',
        reason: `Catalog metadata checksum (${options.expectedChecksum}) does not match canonical checksum (${expectedChecksum})`,
      };
    }

    if (currentChecksum !== expectedChecksum) {
      return {
        isReady: false,
        isDegraded: true,
        status: 'CATALOG_CORRUPTED',
        reason: `Checksum mismatch: expected canonical ${expectedChecksum}, got ${currentChecksum}`,
      };
    }

    return {
      isReady: true,
      isDegraded: false,
      status: 'CATALOG_READY',
    };
  }
}
