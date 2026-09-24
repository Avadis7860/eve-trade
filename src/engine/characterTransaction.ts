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
  readonly ingestedAt: string;
  readonly sourceEndpoint?: string;
  readonly ingestionVersion?: string;
}

export interface RawValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly dataState: 'VALID' | 'INVALID';
}

export interface InvalidCharacterTransactionRecord {
  readonly data_state: 'INVALID';
  readonly validation_errors: readonly string[];
  readonly raw: RawEsiTransactionInput | null | undefined;
  readonly character_id: number;
  readonly attempted_at: string;
}

export class TransactionValidationError extends Error {
  readonly errors: readonly string[];
  readonly raw: RawEsiTransactionInput | null | undefined;
  readonly characterId: number;

  constructor(
    message: string,
    errors: readonly string[],
    raw: RawEsiTransactionInput | null | undefined,
    characterId: number
  ) {
    super(message);
    this.name = 'TransactionValidationError';
    this.errors = Object.freeze([...errors]);
    this.raw = raw;
    this.characterId = characterId;
    Object.setPrototypeOf(this, TransactionValidationError.prototype);
  }
}

export class PersistenceValidationError extends Error {
  readonly transaction: unknown;
  readonly errors: readonly string[];

  constructor(message: string, errors: readonly string[], transaction: unknown) {
    super(message);
    this.name = 'PersistenceValidationError';
    this.errors = Object.freeze([...errors]);
    this.transaction = transaction;
    Object.setPrototypeOf(this, PersistenceValidationError.prototype);
  }
}

/**
 * Pure validator for raw character transaction inputs.
 * Rejects non-finite numbers, NaN, Infinity, negative or zero values for critical IDs and amounts.
 * Strictly enforces Number.isSafeInteger on all ESI 64-bit integer identifiers and quantities.
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

  // 1. Character ID - must be positive safe integer
  if (!Number.isSafeInteger(characterId) || characterId <= 0) {
    errors.push(`Invalid character_id: ${characterId} (must be a positive safe integer).`);
  }

  // 2. Transaction ID - must be positive safe integer (int64 ESI contract)
  const txId = Number(raw.transaction_id);
  if (!Number.isSafeInteger(txId) || txId <= 0) {
    errors.push(`Invalid transaction_id: ${String(raw.transaction_id)} (must be a positive safe integer).`);
  }

  // 3. Type ID - must be positive safe integer
  const typeId = Number(raw.type_id);
  if (!Number.isSafeInteger(typeId) || typeId <= 0) {
    errors.push(`Invalid type_id: ${String(raw.type_id)} (must be a positive safe integer).`);
  }

  // 4. Location ID - must be positive safe integer
  const locId = Number(raw.location_id);
  if (!Number.isSafeInteger(locId) || locId <= 0) {
    errors.push(`Invalid location_id: ${String(raw.location_id)} (must be a positive safe integer).`);
  }

  // 5. Quantity - must be positive safe integer per ESI transaction contract (no fractional quantities)
  const qty = Number(raw.quantity);
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    errors.push(`Invalid quantity: ${String(raw.quantity)} (must be a strictly positive safe integer).`);
  }

  // 6. Unit Price - must be strictly positive finite number (can have decimals)
  const price = Number(raw.unit_price);
  if (typeof price !== 'number' || !Number.isFinite(price) || isNaN(price) || price <= 0) {
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

  // 9. Client ID (optional) - if present must be positive safe integer
  if (raw.client_id !== undefined && raw.client_id !== null) {
    const clientId = Number(raw.client_id);
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      errors.push(`Invalid client_id: ${String(raw.client_id)} (must be a positive safe integer).`);
    }
  }

  // 10. Journal Ref ID (optional) - if present must be positive safe integer
  if (raw.journal_ref_id !== undefined && raw.journal_ref_id !== null) {
    const journalRefId = Number(raw.journal_ref_id);
    if (!Number.isSafeInteger(journalRefId) || journalRefId <= 0) {
      errors.push(`Invalid journal_ref_id: ${String(raw.journal_ref_id)} (must be a positive safe integer).`);
    }
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
 * - ingestedAt is MANDATORY in options; Date.now() or new Date() are NEVER called to synthesize clock values.
 * - NEVER invent order_id (ESI wallet transactions endpoint does not supply order_id).
 * - NEVER map journal_ref_id to order_id.
 * - Normalized timestamps are always canonical ISO-8601 UTC strings.
 * - NEVER synthesize fake facts (like transaction_id=0, quantity=0, price=0, timestamp=now) for invalid inputs.
 * - Throws TransactionValidationError if raw input fails validation.
 * - All returned objects are frozen with Object.freeze().
 */
export function normalizeEsiCharacterTransaction(
  raw: RawEsiTransactionInput,
  characterId: number,
  options?: NormalizationOptions
): PersistedCharacterTransaction {
  if (!options?.ingestedAt || typeof options.ingestedAt !== 'string' || options.ingestedAt.trim() === '') {
    throw new Error(
      'NormalizationOptions.ingestedAt is required and must be an explicit, valid ISO-8601 UTC timestamp string.'
    );
  }
  const ingestedTime = new Date(options.ingestedAt).getTime();
  if (isNaN(ingestedTime) || ingestedTime <= 0) {
    throw new Error(
      `NormalizationOptions.ingestedAt must be a valid ISO-8601 timestamp string, received: "${options.ingestedAt}".`
    );
  }
  const canonicalIngestedAt = new Date(options.ingestedAt).toISOString();

  const validation = validateRawCharacterTransaction(raw, characterId);
  if (!validation.isValid) {
    throw new TransactionValidationError(
      `Cannot normalize invalid raw character transaction: ${validation.errors.join('; ')}`,
      validation.errors,
      raw,
      characterId
    );
  }

  const txId = Number(raw.transaction_id);
  const typeId = Number(raw.type_id);
  const locId = Number(raw.location_id);
  const qty = Number(raw.quantity);
  const price = Number(raw.unit_price);
  const isBuy = Boolean(raw.is_buy);

  const rawDate = raw.date ?? raw.timestamp;
  const canonicalTimestamp = new Date(rawDate as string).toISOString();

  const clientId =
    raw.client_id !== undefined && raw.client_id !== null ? Number(raw.client_id) : undefined;
  const journalRefId =
    raw.journal_ref_id !== undefined && raw.journal_ref_id !== null
      ? Number(raw.journal_ref_id)
      : undefined;
  const isPersonal = raw.is_personal !== undefined ? Boolean(raw.is_personal) : true;
  const clientName = typeof raw.client_name === 'string' ? raw.client_name : undefined;
  const typeName = typeof raw.type_name === 'string' ? raw.type_name : undefined;
  const locationName = typeof raw.location_name === 'string' ? raw.location_name : undefined;

  const sourceEndpoint =
    options.sourceEndpoint || `/characters/${characterId}/wallet/transactions/`;
  const ingestionVersion = options.ingestionVersion || '1.0.0';

  const result: PersistedCharacterTransaction = {
    transaction_id: txId,
    character_id: characterId,
    type_id: typeId,
    location_id: locId,
    is_buy: isBuy,
    quantity: qty,
    unit_price: price,
    timestamp: canonicalTimestamp,

    is_personal: isPersonal,
    client_id: clientId,
    client_name: clientName,
    type_name: typeName,
    location_name: locationName,
    journal_ref_id: journalRefId,

    first_seen_at: canonicalIngestedAt,
    last_seen_at: canonicalIngestedAt,
    source: 'ESI',
    source_endpoint: sourceEndpoint,
    ingestion_version: ingestionVersion,

    data_state: 'VALID',
  };

  return Object.freeze(result);
}

/**
 * Normalizes a list of raw ESI transactions and segregates valid from invalid records.
 * Invalid entries are audited as InvalidCharacterTransactionRecord with raw payload and validation errors,
 * with ZERO synthetic facts generated.
 */
export function normalizeEsiCharacterTransactions(
  rawList: readonly RawEsiTransactionInput[] | null | undefined,
  characterId: number,
  options?: NormalizationOptions
): {
  readonly valid: readonly PersistedCharacterTransaction[];
  readonly invalid: readonly InvalidCharacterTransactionRecord[];
  readonly total: number;
} {
  if (!options?.ingestedAt || typeof options.ingestedAt !== 'string' || options.ingestedAt.trim() === '') {
    throw new Error(
      'NormalizationOptions.ingestedAt is required and must be an explicit, valid ISO-8601 UTC timestamp string.'
    );
  }
  const ingestedTime = new Date(options.ingestedAt).getTime();
  if (isNaN(ingestedTime) || ingestedTime <= 0) {
    throw new Error(
      `NormalizationOptions.ingestedAt must be a valid ISO-8601 timestamp string, received: "${options.ingestedAt}".`
    );
  }
  const canonicalIngestedAt = new Date(options.ingestedAt).toISOString();

  if (!rawList || !Array.isArray(rawList)) {
    return Object.freeze({
      valid: Object.freeze([]),
      invalid: Object.freeze([]),
      total: 0,
    });
  }

  const valid: PersistedCharacterTransaction[] = [];
  const invalid: InvalidCharacterTransactionRecord[] = [];

  for (const raw of rawList) {
    const validation = validateRawCharacterTransaction(raw, characterId);
    if (validation.isValid) {
      const normalized = normalizeEsiCharacterTransaction(raw, characterId, options);
      valid.push(normalized);
    } else {
      invalid.push(
        Object.freeze({
          data_state: 'INVALID' as const,
          validation_errors: validation.errors,
          raw,
          character_id: characterId,
          attempted_at: canonicalIngestedAt,
        })
      );
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
    provenance: {
      source_kind: 'ESI_WALLET_TRANSACTION',
      source_id: String(tx.transaction_id),
      principal_scope: `character:${tx.character_id}`,
    },
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
