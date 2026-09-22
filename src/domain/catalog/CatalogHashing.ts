import { EveTypeDetail } from '../../types';
import { Sha256 } from '../integrity/Sha256';
export { Sha256 } from '../integrity/Sha256';

/**
 * Deterministic Normalizer and Checksum Engine for EVE Type Catalogs.
 */
export class CatalogHashing {
  /**
   * Normalizes an EveTypeDetail object into a strictly ordered, canonical representation.
   * Volatile runtime properties (e.g. transient live prices or user notes) are excluded
   * from the structural identity hash, while foundational attributes are strictly normalized.
   */
  static normalizeItem(item: EveTypeDetail): Record<string, unknown> {
    return {
      category_id: Number(item.category_id || 0),
      group_id: Number(item.group_id || 0),
      name: String(item.name || '').trim(),
      portion_size: item.portion_size !== undefined && item.portion_size !== null ? Number(item.portion_size) : 1,
      type_id: Number(item.type_id),
      volume: Math.round(Number(item.volume || 0) * 10000) / 10000,
    };
  }

  /**
   * Serializes a catalog collection into a deterministic string representation:
   * 1. Filters and normalizes each valid item.
   * 2. Sorts items strictly by `type_id` ascending.
   * 3. Serializes via JSON without extraneous whitespace.
   */
  static serializeDeterministic(items: EveTypeDetail[]): string {
    // Sort strictly by type_id ascending
    const sorted = [...items]
      .filter((t) => t && Number.isInteger(Number(t.type_id)) && Number(t.type_id) > 0)
      .map(this.normalizeItem)
      .sort((a, b) => (a.type_id as number) - (b.type_id as number));

    return JSON.stringify(sorted);
  }

  /**
   * Computes the canonical SHA-256 checksum of an EVE type collection.
   * Guarantee: Changing array order does NOT change the resulting checksum.
   */
  static computeCatalogChecksum(items: EveTypeDetail[]): string {
    const serialized = this.serializeDeterministic(items);
    return Sha256.hash(serialized);
  }
}
