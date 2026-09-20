/**
 * EVE Trade - Character Transaction Normalization & Validation Engine
 *
 * PURE MATHEMATICAL & TRANSFORMATION ENGINE (Zero network, zero DOM, zero side-effects).
 * Normalizes raw ESI character wallet transactions into immutable, auditable,
 * and strongly-typed PersistedCharacterTransaction objects.
 *
 * Conforms strictly to EVE Online CCP ESI contracts and AGENTS.md mathematical purity rules.
 */

import { ExecutionTransactionRef, PersistedCharacterTransaction } from '../types';

export interface RawEsiTransactionInput {
  transaction_id?: unknown;
  date?: unknown;
  timestamp?: unknown;
  type_id?: unknown;
  type_name?: unknown;
  location_id?: unknown;
  location_name?: unknown;
  unit_price?: unknown;
  quantity?: unknown;
  is_buy?: unknown;
  is_personal?: unknown;
  client_id?: unknown;
  client_name?: unknown;
  journal_ref_id?: unknown;
  order_id?: unknown;
}

export interface NormalizationOptions {
  readonly ingestedAt?: string;
  readonly sourceEndpoint?: string;
  readonly ingestionVersion?: string;
}

export interface RawValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly dataState: 'VALID' | 'PARTIAL' | 'INVALID';
}

/**
 * Pure validator for raw character transaction inputs.
 * Rejects non-finite numbers, NaN, Infinity, negative or zero values for critical IDs and amounts.
 */
export function validateRawCharacterTransaction(
  raw: RawEsiTransactionInput | null | undefined,
  characterId: number
): RawValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return Object.freeze({
      isValid: false,
      errors: Object.freeze(['Raw transaction payload is null, undefined, or not an object.']),
      dataState: 'INVALID',
    });
  }

  // 1. Character ID
  if (!Number.isInteger(characterId) || characterId <= 0 || !Number.isFinite(characterId)) {
    errors.push(`Invalid character_id: ${characterId} (must be a positive finite integer).`);
  }

  // 2. Transaction ID
  const txId = Number(raw.transaction_id);
  if (!Number.isInteger(txId) || txId <= 0 || !Number.isFinite(txId)) {
    errors.push(`Invalid transaction_id: ${String(raw.transaction_id)} (must be a positive finite integer).`);
  }

  // 3. Type ID
  const typeId = Number(raw.type_id);
  if (!Number.isInteger(typeId) || typeId <= 0 || !Number.isFinite(typeId)) {
    errors.push(`Invalid type_id: ${String(raw.type_id)} (must be a positive finite integer).`);
  }

  // 4. Location ID
  const locId = Number(raw.location_id);
  if (!Number.isInteger(locId) || locId <= 0 || !Number.isFinite(locId)) {
    errors.push(`Invalid location_id: ${String(raw.location_id)} (must be a positive finite integer).`);
  }

  // 5. Quantity
  const qty = Number(raw.quantity);
  if (!Number.isFinite(qty) || isNaN(qty) || qty <= 0) {
    errors.push(`Invalid quantity: ${String(raw.quantity)} (must be a strictly positive finite number).`);
  }

  // 6. Unit Price
  const price = Number(raw.unit_price);
  if (!Number.isFinite(price) || isNaN(price) || price <= 0) {
    errors.push(`Invalid unit_price: ${String(raw.unit_price)} (must be a strictly positive finite number).`);
  }

  // 7. Date / Timestamp
  const rawDate = raw.date ?? raw.timestamp;
  if (!rawDate || (typeof rawDate !== 'string' && !(rawDate instanceof Date))) {
    errors.push(`Missing or non-string date/timestamp: ${String(rawDate)}.`);
  } else {
    const parsedTime = new Date(rawDate as string).getTime();
    if (isNaN(parsedTime) || parsedTime <= 0) {
      errors.push(`Unparseable date/timestamp: ${String(rawDate)}.`);
    }
  }

  // 8. Direction (is_buy)
  if (typeof raw.is_buy !== 'boolean' && raw.is_buy !== 0 && raw.is_buy !== 1) {
    errors.push(`Invalid direction is_buy: ${String(raw.is_buy)} (must be boolean or 0/1).`);
  }

  const isValid = errors.length === 0;
  const dataState = isValid ? 'VALID' : 'INVALID';

  return Object.freeze({
    isValid,
    errors: Object.freeze(errors),
    dataState,
  });
}

/**
 * Pure normalization function that transforms raw ESI character transaction data
 * into an immutable PersistedCharacterTransaction.
 *
 * CRITICAL SENSITIVE CONSTRAINTS:
 * - NEVER invent order_id (ESI wallet transactions endpoint does not supply order_id).
 * - NEVER map journal_ref_id to order_id.
 * - Normalized timestamps are always canonical ISO-8601 UTC strings.
 * - All returned objects are frozen with Object.freeze().
 */
export function normalizeEsiCharacterTransaction(
  raw: RawEsiTransactionInput,
  characterId: number,
  options?: NormalizationOptions
): PersistedCharacterTransaction {
  const validation = validateRawCharacterTransaction(raw, characterId);
  const nowUtc = options?.ingestedAt || new Date().toISOString();
  const sourceEndpoint = options?.sourceEndpoint || `/characters/${characterId}/wallet/transactions/`;
  const ingestionVersion = options?.ingestionVersion || '1.0.0';

  const txId = Number(raw?.transaction_id);
  const typeId = Number(raw?.type_id);
  const locId = Number(raw?.location_id);
  const qty = Number(raw?.quantity);
  const price = Number(raw?.unit_price);
  const isBuy = Boolean(raw?.is_buy);

  let canonicalTimestamp: string;
  const rawDate = raw?.date ?? raw?.timestamp;
  if (rawDate && (typeof rawDate === 'string' || rawDate instanceof Date)) {
    const d = new Date(rawDate);
    canonicalTimestamp = !isNaN(d.getTime()) ? d.toISOString() : (typeof rawDate === 'string' ? rawDate : nowUtc);
  } else {
    canonicalTimestamp = nowUtc;
  }

  // Optional client and journal metadata
  const clientId = raw?.client_id !== undefined ? Number(raw.client_id) : undefined;
  const journalRefId = raw?.journal_ref_id !== undefined ? Number(raw.journal_ref_id) : undefined;
  const isPersonal = raw?.is_personal !== undefined ? Boolean(raw.is_personal) : true;
  const clientName = typeof raw?.client_name === 'string' ? raw.client_name : undefined;
  const typeName = typeof raw?.type_name === 'string' ? raw.type_name : undefined;
  const locationName = typeof raw?.location_name === 'string' ? raw.location_name : undefined;

  const result: PersistedCharacterTransaction = {
    transaction_id: isNaN(txId) ? 0 : txId,
    character_id: characterId,
    type_id: isNaN(typeId) ? 0 : typeId,
    location_id: isNaN(locId) ? 0 : locId,
    is_buy: isBuy,
    quantity: isNaN(qty) ? 0 : qty,
    unit_price: isNaN(price) ? 0 : price,
    timestamp: canonicalTimestamp,

    is_personal: isPersonal,
    client_id: clientId !== undefined && !isNaN(clientId) ? clientId : undefined,
    client_name: clientName,
    type_name: typeName,
    location_name: locationName,
    journal_ref_id: journalRefId !== undefined && !isNaN(journalRefId) ? journalRefId : undefined,

    first_seen_at: nowUtc,
    last_seen_at: nowUtc,
    source: 'ESI',
    source_endpoint: sourceEndpoint,
    ingestion_version: ingestionVersion,

    data_state: validation.dataState,
    validation_errors: validation.errors.length > 0 ? validation.errors : undefined,
  };

  return Object.freeze(result);
}

/**
 * Normalizes a list of raw ESI transactions and segregates valid from invalid records.
 */
export function normalizeEsiCharacterTransactions(
  rawList: readonly RawEsiTransactionInput[] | null | undefined,
  characterId: number,
  options?: NormalizationOptions
): {
  readonly valid: readonly PersistedCharacterTransaction[];
  readonly invalid: readonly PersistedCharacterTransaction[];
  readonly total: number;
} {
  if (!rawList || !Array.isArray(rawList)) {
    return Object.freeze({
      valid: Object.freeze([]),
      invalid: Object.freeze([]),
      total: 0,
    });
  }

  const valid: PersistedCharacterTransaction[] = [];
  const invalid: PersistedCharacterTransaction[] = [];

  for (const raw of rawList) {
    const normalized = normalizeEsiCharacterTransaction(raw, characterId, options);
    if (normalized.data_state === 'VALID') {
      valid.push(normalized);
    } else {
      invalid.push(normalized);
    }
  }

  return Object.freeze({
    valid: Object.freeze(valid),
    invalid: Object.freeze(invalid),
    total: rawList.length,
  });
}

/**
 * Pure idempotent merge function for persisted character transactions.
 * Preserves the original first_seen_at timestamp and immutable ESI historical facts.
 * Updates last_seen_at and flags any unexpected mutation between successive ESI reads.
 */
export function mergePersistedCharacterTransactions(
  existing: PersistedCharacterTransaction | undefined,
  incoming: PersistedCharacterTransaction
): PersistedCharacterTransaction {
  if (!existing) {
    return incoming;
  }

  // Detect any unexpected divergence in historical facts
  const divergenceErrors: string[] = [];
  if (existing.quantity !== incoming.quantity) {
    divergenceErrors.push(
      `Historical quantity changed on transaction ${existing.transaction_id}: original ${existing.quantity} vs incoming ${incoming.quantity}.`
    );
  }
  if (existing.unit_price !== incoming.unit_price) {
    divergenceErrors.push(
      `Historical unit_price changed on transaction ${existing.transaction_id}: original ${existing.unit_price} vs incoming ${incoming.unit_price}.`
    );
  }
  if (existing.type_id !== incoming.type_id) {
    divergenceErrors.push(
      `Historical type_id changed on transaction ${existing.transaction_id}: original ${existing.type_id} vs incoming ${incoming.type_id}.`
    );
  }
  if (existing.location_id !== incoming.location_id) {
    divergenceErrors.push(
      `Historical location_id changed on transaction ${existing.transaction_id}: original ${existing.location_id} vs incoming ${incoming.location_id}.`
    );
  }
  if (existing.is_buy !== incoming.is_buy) {
    divergenceErrors.push(
      `Historical is_buy changed on transaction ${existing.transaction_id}: original ${existing.is_buy} vs incoming ${incoming.is_buy}.`
    );
  }

  const mergedErrors = [
    ...(existing.validation_errors || []),
    ...divergenceErrors,
  ];

  // Pick max last_seen_at
  const lastSeenAt =
    new Date(incoming.last_seen_at).getTime() > new Date(existing.last_seen_at).getTime()
      ? incoming.last_seen_at
      : existing.last_seen_at;

  const merged: PersistedCharacterTransaction = {
    // Preserve immutable facts from existing
    transaction_id: existing.transaction_id,
    character_id: existing.character_id,
    type_id: existing.type_id,
    location_id: existing.location_id,
    is_buy: existing.is_buy,
    quantity: existing.quantity,
    unit_price: existing.unit_price,
    timestamp: existing.timestamp,

    // Merge enriched metadata if available in incoming
    is_personal: existing.is_personal ?? incoming.is_personal,
    client_id: existing.client_id ?? incoming.client_id,
    client_name: existing.client_name ?? incoming.client_name,
    type_name: existing.type_name ?? incoming.type_name,
    location_name: existing.location_name ?? incoming.location_name,
    journal_ref_id: existing.journal_ref_id ?? incoming.journal_ref_id,

    // Audit timestamps
    first_seen_at: existing.first_seen_at,
    last_seen_at: lastSeenAt,
    source: existing.source,
    source_endpoint: existing.source_endpoint,
    ingestion_version: incoming.ingestion_version || existing.ingestion_version,

    data_state: divergenceErrors.length > 0 ? 'PARTIAL' : existing.data_state,
    validation_errors: mergedErrors.length > 0 ? Object.freeze(mergedErrors) : undefined,
  };

  return Object.freeze(merged);
}

/**
 * Transforms a PersistedCharacterTransaction into an ExecutionTransactionRef for the Correlation Engine.
 * Intentionally does NOT fabricate or guess order_id.
 */
export function persistedTransactionToRef(
  tx: PersistedCharacterTransaction
): ExecutionTransactionRef {
  return Object.freeze({
    transaction_id: tx.transaction_id,
    character_id: tx.character_id,
    type_id: tx.type_id,
    location_id: tx.location_id,
    is_buy: tx.is_buy,
    quantity: tx.quantity,
    unit_price: tx.unit_price,
    timestamp: tx.timestamp,
    // order_id is deliberately undefined
  });
}

/**
 * Pure pagination deduplication helper for CCP ESI `from_id` anchor pagination.
 *
 * CCP ESI Specification:
 * In `/characters/{character_id}/wallet/transactions/?from_id={anchor_id}`,
 * the anchor transaction with ID equal to `anchor_id` reappears in the subsequent page.
 *
 * This pure function merges multiple paginated chunks, deduplicating strictly on transaction_id
 * while preserving chronological descending order.
 */
export function deduplicateTransactionsByFromIdAnchor(
  pages: readonly (readonly PersistedCharacterTransaction[])[]
): readonly PersistedCharacterTransaction[] {
  if (!pages || pages.length === 0) return Object.freeze([]);

  const seenIds = new Set<number>();
  const deduplicated: PersistedCharacterTransaction[] = [];

  for (const page of pages) {
    if (!page) continue;
    for (const tx of page) {
      if (!tx || seenIds.has(tx.transaction_id)) {
        continue;
      }
      seenIds.add(tx.transaction_id);
      deduplicated.push(tx);
    }
  }

  // Sort descending by timestamp (most recent first), tie-break with transaction_id desc
  deduplicated.sort((a, b) => {
    const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    return diff !== 0 ? diff : b.transaction_id - a.transaction_id;
  });

  return Object.freeze(deduplicated);
}
