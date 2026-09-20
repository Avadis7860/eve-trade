import { EveTypeDetail, TypeCatalogMetadata, TypeCatalogStatus } from '../../types';

export interface CatalogValidationResult {
  isValid: boolean;
  error?: string;
  field?: string;
}

export class CatalogValidator {
  /**
   * Validates an individual EVE type according to CCP specifications.
   */
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

  /**
   * Validates an entire collection of types, checking for duplicates and corrupted records.
   */
  static validateCollection(items: unknown[]): {
    validTypes: EveTypeDetail[];
    errors: string[];
    uniqueTypeIds: Set<number>;
  } {
    const validTypes: EveTypeDetail[] = [];
    const errors: string[] = [];
    const uniqueTypeIds = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const res = this.validateType(item);
      if (!res.isValid) {
        errors.push(`Row ${i}: ${res.error}`);
        continue;
      }

      const rec = item as Record<string, unknown>;
      const typeId = Number(rec.type_id);

      if (uniqueTypeIds.has(typeId)) {
        errors.push(`Duplicate type_id detected at index ${i}: ${typeId}`);
        continue;
      }

      uniqueTypeIds.add(typeId);
      validTypes.push({
        type_id: typeId,
        name: String(rec.name).trim(),
        group_id: Number(rec.group_id || 0),
        group_name: rec.group_name ? String(rec.group_name) : undefined,
        category_id: Number(rec.category_id || 0),
        category_name: rec.category_name ? String(rec.category_name) : undefined,
        volume: Number(rec.volume || 0.01),
        packaged_volume: rec.packaged_volume ? Number(rec.packaged_volume) : undefined,
        portion_size: rec.portion_size ? Number(rec.portion_size) : 1,
        average_price: rec.average_price ? Number(rec.average_price) : undefined,
        adjusted_price: rec.adjusted_price ? Number(rec.adjusted_price) : undefined,
        description: rec.description ? String(rec.description) : undefined,
      });
    }

    return { validTypes, errors, uniqueTypeIds };
  }
}
