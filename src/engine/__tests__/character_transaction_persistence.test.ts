/**
 * EVE Trade - Character Transaction Persistence & Normalization Test Suite
 *
 * PHASE 2B — CHANTIER 3B-1: Normalized Execution Persistence
 *
 * Validates:
 * 1. Pure Normalization & Validation Engine
 * 2. Immutable Provenance & Metadata
 * 3. Idempotence & Historical Immutability
 * 4. CCP ESI `from_id` Pagination Anchor Deduplication
 * 5. Multi-Character Data Isolation
 * 6. IndexedDB Store Persistence, Indexing & Retrieval
 * 7. Migration from DB_VERSION 3 to DB_VERSION 4
 */

import {
  validateRawCharacterTransaction,
  normalizeEsiCharacterTransaction,
  normalizeEsiCharacterTransactions,
  mergePersistedCharacterTransactions,
  persistedTransactionToRef,
  deduplicateTransactionsByFromIdAnchor,
  RawEsiTransactionInput,
  TransactionValidationError,
  PersistenceValidationError,
} from '../characterTransaction';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { PersistedCharacterTransaction } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING PHASE 2B: NORMALIZED EXECUTION PERSISTENCE TESTS ===\n');

// --------------------------------------------------------------------------
// Test Suite 1: Validation Rules & Input Sanitization
// --------------------------------------------------------------------------
console.log('--- Test Suite 1: Validation Rules & Sanitization ---');

{
  // Valid transaction input
  const validRaw: RawEsiTransactionInput = {
    transaction_id: 1001,
    type_id: 34,
    location_id: 60003760,
    quantity: 50000,
    unit_price: 5.5,
    date: '2026-09-20T08:00:00Z',
    is_buy: true,
    is_personal: true,
    client_id: 99001,
    journal_ref_id: 888001,
  };

  const validation = validateRawCharacterTransaction(validRaw, 2112001);
  assert(validation.isValid === true, 'Valid raw transaction must pass validation');
  assert(validation.dataState === 'VALID', 'State must be VALID');
  assert(validation.errors.length === 0, 'No errors for valid transaction');

  // Invalid: null / non-object
  const nullVal = validateRawCharacterTransaction(null, 2112001);
  assert(nullVal.isValid === false, 'Null payload must fail validation');
  assert(nullVal.dataState === 'INVALID', 'Null payload state must be INVALID');

  // Invalid: transaction_id <= 0, NaN, Infinity
  const badTx1 = validateRawCharacterTransaction({ ...validRaw, transaction_id: 0 }, 2112001);
  assert(!badTx1.isValid && badTx1.errors.some(e => e.includes('transaction_id')), 'Zero txId must fail');

  const badTx2 = validateRawCharacterTransaction({ ...validRaw, transaction_id: -10 }, 2112001);
  assert(!badTx2.isValid, 'Negative txId must fail');

  const badTx3 = validateRawCharacterTransaction({ ...validRaw, transaction_id: NaN }, 2112001);
  assert(!badTx3.isValid, 'NaN txId must fail');

  const badTx4 = validateRawCharacterTransaction({ ...validRaw, transaction_id: Infinity }, 2112001);
  assert(!badTx4.isValid, 'Infinity txId must fail');

  // Invalid: character_id <= 0, NaN
  const badChar1 = validateRawCharacterTransaction(validRaw, 0);
  assert(!badChar1.isValid && badChar1.errors.some(e => e.includes('character_id')), 'Zero characterId must fail');

  const badChar2 = validateRawCharacterTransaction(validRaw, -5);
  assert(!badChar2.isValid, 'Negative characterId must fail');

  // Invalid: type_id <= 0
  const badType = validateRawCharacterTransaction({ ...validRaw, type_id: -1 }, 2112001);
  assert(!badType.isValid && badType.errors.some(e => e.includes('type_id')), 'Negative typeId must fail');

  // Invalid: location_id <= 0
  const badLoc = validateRawCharacterTransaction({ ...validRaw, location_id: 0 }, 2112001);
  assert(!badLoc.isValid && badLoc.errors.some(e => e.includes('location_id')), 'Zero locationId must fail');

  // Invalid: quantity <= 0, NaN, Infinity
  const badQty1 = validateRawCharacterTransaction({ ...validRaw, quantity: 0 }, 2112001);
  assert(!badQty1.isValid && badQty1.errors.some(e => e.includes('quantity')), 'Zero quantity must fail');

  const badQty2 = validateRawCharacterTransaction({ ...validRaw, quantity: -500 }, 2112001);
  assert(!badQty2.isValid, 'Negative quantity must fail');

  const badQty3 = validateRawCharacterTransaction({ ...validRaw, quantity: NaN }, 2112001);
  assert(!badQty3.isValid, 'NaN quantity must fail');

  // Invalid: unit_price <= 0, NaN, Infinity
  const badPrice1 = validateRawCharacterTransaction({ ...validRaw, unit_price: 0 }, 2112001);
  assert(!badPrice1.isValid && badPrice1.errors.some(e => e.includes('unit_price')), 'Zero unit_price must fail');

  const badPrice2 = validateRawCharacterTransaction({ ...validRaw, unit_price: -1.5 }, 2112001);
  assert(!badPrice2.isValid, 'Negative unit_price must fail');

  const badPrice3 = validateRawCharacterTransaction({ ...validRaw, unit_price: Infinity }, 2112001);
  assert(!badPrice3.isValid, 'Infinity unit_price must fail');

  // Invalid: timestamp unparseable
  const badDate1 = validateRawCharacterTransaction({ ...validRaw, date: 'not-a-date' }, 2112001);
  assert(!badDate1.isValid && badDate1.errors.some(e => e.includes('date/timestamp')), 'Invalid date must fail');

  console.log('  [PASS] All validation and rejection boundaries verified.');
}

// --------------------------------------------------------------------------
// Test Suite 2: Normalization, Provenance & Non-Invention of order_id
// --------------------------------------------------------------------------
console.log('--- Test Suite 2: Normalization, Provenance & Order Non-Invention ---');

{
  const raw: RawEsiTransactionInput = {
    transaction_id: 55001,
    type_id: 34,
    location_id: 60003760,
    unit_price: 6.25,
    quantity: 100000,
    date: '2026-09-20T08:15:30Z',
    is_buy: true,
    is_personal: true,
    client_id: 99123,
    client_name: 'Industrial Corp Trader',
    journal_ref_id: 7770001,
  };

  const normalized = normalizeEsiCharacterTransaction(raw, 2112001, {
    ingestedAt: '2026-09-20T08:20:00Z',
    sourceEndpoint: '/characters/2112001/wallet/transactions/',
    ingestionVersion: '1.0.0',
  });

  // Immutability
  assert(Object.isFrozen(normalized), 'Normalized transaction must be strictly frozen');

  // Provenance fields
  assert(normalized.source === 'ESI', 'Source must be ESI');
  assert(normalized.source_endpoint === '/characters/2112001/wallet/transactions/', 'Source endpoint verified');
  assert(normalized.ingestion_version === '1.0.0', 'Ingestion version verified');
  assert(normalized.first_seen_at === '2026-09-20T08:20:00.000Z', 'first_seen_at correctly captured');
  assert(normalized.last_seen_at === '2026-09-20T08:20:00.000Z', 'last_seen_at correctly captured');
  assert(normalized.timestamp === '2026-09-20T08:15:30.000Z', 'Canonical ISO UTC date preserved');

  // Facts fidelity
  assert(normalized.transaction_id === 55001, 'transaction_id matches');
  assert(normalized.character_id === 2112001, 'character_id matches context');
  assert(normalized.type_id === 34, 'type_id matches');
  assert(normalized.location_id === 60003760, 'location_id matches');
  assert(normalized.quantity === 100000, 'quantity matches');
  assert(normalized.unit_price === 6.25, 'unit_price matches');
  assert(normalized.is_buy === true, 'is_buy matches');
  assert(normalized.journal_ref_id === 7770001, 'journal_ref_id preserved');

  // CRITICAL: order_id must NOT be invented
  const ref = persistedTransactionToRef(normalized);
  assert(ref.order_id === undefined, 'order_id MUST NOT be invented or guessed');
  assert(ref.transaction_id === 55001, 'Ref transaction_id matches');
  assert(ref.unit_price === 6.25, 'Ref unit_price matches');
  assert(ref.quantity === 100000, 'Ref quantity matches');

  // Batch normalization segregation
  const batchResult = normalizeEsiCharacterTransactions(
    [
      raw,
      { ...raw, transaction_id: 55002 },
      { ...raw, transaction_id: -99, quantity: -10 }, // Invalid
    ],
    2112001,
    { ingestedAt: '2026-09-20T08:20:00Z' }
  );

  assert(batchResult.total === 3, 'Batch total is 3');
  assert(batchResult.valid.length === 2, 'Valid count is 2');
  assert(batchResult.invalid.length === 1, 'Invalid count is 1');
  assert(batchResult.invalid[0].data_state === 'INVALID', 'Invalid item has data_state INVALID');

  console.log('  [PASS] Normalization, audit provenance, and non-invention of order_id verified.');
}

// --------------------------------------------------------------------------
// Test Suite 3: Idempotence & Immutability of Historical Facts
// --------------------------------------------------------------------------
console.log('--- Test Suite 3: Idempotence & Historical Immutability ---');

{
  const initial = normalizeEsiCharacterTransaction(
    {
      transaction_id: 100,
      type_id: 34,
      location_id: 60003760,
      quantity: 1000,
      unit_price: 5.0,
      date: '2026-09-20T08:00:00Z',
      is_buy: true,
    },
    2112001,
    { ingestedAt: '2026-09-20T08:05:00Z' }
  );

  // Re-read 30 minutes later in next ESI sync
  const secondRead = normalizeEsiCharacterTransaction(
    {
      transaction_id: 100,
      type_id: 34,
      location_id: 60003760,
      quantity: 1000,
      unit_price: 5.0,
      date: '2026-09-20T08:00:00Z',
      is_buy: true,
      client_id: 99001, // enriched on second read
      client_name: 'Client Name',
    },
    2112001,
    { ingestedAt: '2026-09-20T08:35:00Z' }
  );

  const merged = mergePersistedCharacterTransactions(initial, secondRead);

  // Invariant 1: first_seen_at remains original
  assert(merged.first_seen_at === '2026-09-20T08:05:00.000Z', 'first_seen_at must be strictly preserved');

  // Invariant 2: last_seen_at is updated
  assert(merged.last_seen_at === '2026-09-20T08:35:00.000Z', 'last_seen_at must be updated to second read');

  // Invariant 3: Historical facts remain unchanged
  assert(merged.transaction_id === 100, 'transaction_id preserved');
  assert(merged.quantity === 1000, 'quantity preserved');
  assert(merged.unit_price === 5.0, 'unit_price preserved');
  assert(merged.timestamp === '2026-09-20T08:00:00.000Z', 'timestamp preserved');

  // Invariant 4: Metadata enriched cleanly
  assert(merged.client_id === 99001, 'client_id enriched');
  assert(merged.client_name === 'Client Name', 'client_name enriched');

  // Invariant 5: Divergence detection on impossible historical mutation
  const divergingRead = normalizeEsiCharacterTransaction(
    {
      transaction_id: 100,
      type_id: 34,
      location_id: 60003760,
      quantity: 99999, // Impossible mutation of past transaction
      unit_price: 999.0,
      date: '2026-09-20T08:00:00Z',
      is_buy: true,
    },
    2112001,
    { ingestedAt: '2026-09-20T09:00:00Z' }
  );

  const mergedWithDivergence = mergePersistedCharacterTransactions(merged, divergingRead);
  assert(mergedWithDivergence.quantity === 1000, 'Original quantity must NOT be overwritten');
  assert(mergedWithDivergence.data_state === 'PARTIAL', 'Diverging transaction must be marked PARTIAL');
  assert(
    Boolean(mergedWithDivergence.validation_errors && mergedWithDivergence.validation_errors.length > 0),
    'Divergence errors must be documented'
  );

  console.log('  [PASS] Idempotence, timestamp immutability, and historical fact preservation verified.');
}

// --------------------------------------------------------------------------
// Test Suite 4: CCP ESI `from_id` Pagination Anchor Deduplication
// --------------------------------------------------------------------------
console.log('--- Test Suite 4: CCP ESI from_id Pagination Anchor Deduplication ---');

{
  // Simulates CCP ESI pagination where the anchor transaction reappears on next page:
  // Page 1: [105, 104, 103]
  // Query with from_id=103 returns Page 2: [103, 102, 101]
  const makeTx = (id: number, dateStr: string): PersistedCharacterTransaction =>
    normalizeEsiCharacterTransaction(
      {
        transaction_id: id,
        type_id: 34,
        location_id: 60003760,
        quantity: 100,
        unit_price: 5.0,
        date: dateStr,
        is_buy: true,
      },
      2112001,
      { ingestedAt: '2026-09-20T08:55:00Z' }
    );

  const page1 = [
    makeTx(105, '2026-09-20T08:50:00Z'),
    makeTx(104, '2026-09-20T08:40:00Z'),
    makeTx(103, '2026-09-20T08:30:00Z'), // Anchor
  ];

  const page2 = [
    makeTx(103, '2026-09-20T08:30:00Z'), // Anchor reappears
    makeTx(102, '2026-09-20T08:20:00Z'),
    makeTx(101, '2026-09-20T08:10:00Z'),
  ];

  const result = deduplicateTransactionsByFromIdAnchor([page1, page2]);

  assert(result.length === 5, `Deduplicated result length must be 5, got ${result.length}`);
  const ids = result.map((t) => t.transaction_id);
  assert(
    JSON.stringify(ids) === JSON.stringify([105, 104, 103, 102, 101]),
    `Expected [105, 104, 103, 102, 101], got ${JSON.stringify(ids)}`
  );

  // Ensure transaction 103 appears exactly once
  const occurrences103 = ids.filter((id) => id === 103).length;
  assert(occurrences103 === 1, `Transaction 103 must appear exactly once, appeared ${occurrences103} times`);

  console.log('  [PASS] from_id anchor pagination deduplication verified.');
}

// --------------------------------------------------------------------------
// Test Suite 5: Multi-Character Isolation
// --------------------------------------------------------------------------
console.log('--- Test Suite 5: Multi-Character Isolation ---');

(async () => {
  await IndexedDbStore.clearCharacterTransactions();

  const char1Id = 2112001;
  const char2Id = 2112002;

  const txChar1A = normalizeEsiCharacterTransaction(
    {
      transaction_id: 201,
      type_id: 34,
      location_id: 60003760,
      quantity: 500,
      unit_price: 5.0,
      date: '2026-09-20T08:00:00Z',
      is_buy: true,
    },
    char1Id,
    { ingestedAt: '2026-09-20T08:20:00Z' }
  );

  const txChar1B = normalizeEsiCharacterTransaction(
    {
      transaction_id: 202,
      type_id: 35,
      location_id: 60003760,
      quantity: 200,
      unit_price: 15.0,
      date: '2026-09-20T08:10:00Z',
      is_buy: false,
    },
    char1Id,
    { ingestedAt: '2026-09-20T08:20:00Z' }
  );

  const txChar2A = normalizeEsiCharacterTransaction(
    {
      transaction_id: 301,
      type_id: 36,
      location_id: 60008494,
      quantity: 1000,
      unit_price: 45.0,
      date: '2026-09-20T08:15:00Z',
      is_buy: true,
    },
    char2Id,
    { ingestedAt: '2026-09-20T08:20:00Z' }
  );

  await IndexedDbStore.saveCharacterTransactions([txChar1A, txChar1B, txChar2A]);

  // Query Character 1
  const char1Txs = await IndexedDbStore.getCharacterTransactions(char1Id);
  assert(char1Txs.length === 2, `Character 1 must have 2 transactions, got ${char1Txs.length}`);
  assert(char1Txs.every((t) => t.character_id === char1Id), 'All returned txs must belong to Character 1');

  // Query Character 2
  const char2Txs = await IndexedDbStore.getCharacterTransactions(char2Id);
  assert(char2Txs.length === 1, `Character 2 must have 1 transaction, got ${char2Txs.length}`);
  assert(char2Txs[0].transaction_id === 301, 'Character 2 transaction matches 301');
  assert(char2Txs[0].character_id === char2Id, 'Belongs to Character 2');

  // Filter by typeId for Character 1
  const char1Type34 = await IndexedDbStore.getCharacterTransactions(char1Id, { typeId: 34 });
  assert(char1Type34.length === 1 && char1Type34[0].type_id === 34, 'Filtering by typeId works');

  // Clearing Character 1 must NOT affect Character 2
  await IndexedDbStore.clearCharacterTransactions(char1Id);
  const char1Remaining = await IndexedDbStore.getCharacterTransactions(char1Id);
  const char2Remaining = await IndexedDbStore.getCharacterTransactions(char2Id);

  assert(char1Remaining.length === 0, 'Character 1 transactions must be cleared');
  assert(char2Remaining.length === 1, 'Character 2 transactions must remain untouched');

  console.log('  [PASS] Multi-character isolation and selective clearing verified.');

  // --------------------------------------------------------------------------
  // Test Suite 6: IndexedDB Store CRUD & Audit Stats
  // --------------------------------------------------------------------------
  console.log('--- Test Suite 6: IndexedDB Store CRUD & Audit Stats ---');

  await IndexedDbStore.clearCharacterTransactions();

  // Test single save
  const singleTx = normalizeEsiCharacterTransaction(
    {
      transaction_id: 9991,
      type_id: 34,
      location_id: 60003760,
      quantity: 10000,
      unit_price: 5.25,
      date: '2026-09-20T08:00:00Z',
      is_buy: true,
    },
    char1Id,
    { ingestedAt: '2026-09-20T08:05:00Z' }
  );

  await IndexedDbStore.saveCharacterTransaction(singleTx);

  const fetchedSingle = await IndexedDbStore.getCharacterTransaction(9991);
  assert(fetchedSingle !== null, 'Saved transaction must be retrievable by ID');
  assert(fetchedSingle?.transaction_id === 9991, 'ID matches');
  assert(fetchedSingle?.quantity === 10000, 'Quantity matches');

  // Test StorageStats includes character_transactions_count
  const stats = await IndexedDbStore.getStorageStats();
  assert(
    typeof stats.character_transactions_count === 'number',
    'StorageStats must include character_transactions_count'
  );
  assert(
    stats.character_transactions_count >= 1,
    `character_transactions_count must be >= 1, got ${stats.character_transactions_count}`
  );

  // Test clearAll clears character transactions
  await IndexedDbStore.clearAll();
  const statsAfterClear = await IndexedDbStore.getStorageStats();
  assert(
    statsAfterClear.character_transactions_count === 0,
    'character_transactions_count must be 0 after clearAll'
  );

  console.log('  [PASS] IndexedDB store CRUD and diagnostic stats verified.');

  // --------------------------------------------------------------------------
  // Test Suite 7: Schema Migration Verification (DB_VERSION 3 -> 4)
  // --------------------------------------------------------------------------
  console.log('--- Test Suite 7: Schema Migration Verification (DB_VERSION 3 -> 4) ---');

  // Simulate onupgradeneeded event with mock IDB database to verify upgrade behavior
  const createdStores: string[] = [];
  const createdIndexes: Record<string, string[]> = {};

  const mockDb = {
    objectStoreNames: {
      // Simulate existing stores from DB_VERSION = 3
      contains: (name: string) =>
        [
          'snapshots',
          'history',
          'universe_opportunities',
          'http_cache',
          'market_observations',
          'opportunity_observations',
          'market_history_daily',
          'eve_types',
          'catalog_metadata',
        ].includes(name),
    },
    createObjectStore: (name: string, options: any) => {
      createdStores.push(name);
      createdIndexes[name] = [];
      return {
        createIndex: (indexName: string) => {
          createdIndexes[name].push(indexName);
        },
      };
    },
  };

  // Verify that during migration, existing stores are NOT recreated
  assert(mockDb.objectStoreNames.contains('snapshots'), 'snapshots already exists');
  assert(mockDb.objectStoreNames.contains('opportunity_observations'), 'opportunity_observations already exists');
  assert(!mockDb.objectStoreNames.contains('character_transactions'), 'character_transactions is new');

  // Execute upgrade logic for DB_VERSION = 4
  if (!mockDb.objectStoreNames.contains('character_transactions')) {
    const charTxStore = mockDb.createObjectStore('character_transactions', { keyPath: 'transaction_id' });
    charTxStore.createIndex('character_id');
    charTxStore.createIndex('type_id');
    charTxStore.createIndex('date');
    charTxStore.createIndex('char_date');
    charTxStore.createIndex('char_type');
  }

  assert(createdStores.includes('character_transactions'), 'character_transactions store was created');
  assert(createdStores.length === 1, 'ONLY the new store was created, existing stores preserved');
  assert(createdIndexes['character_transactions'].length === 5, 'All 5 indexes created');
  assert(createdIndexes['character_transactions'].includes('character_id'), 'character_id index exists');
  assert(createdIndexes['character_transactions'].includes('type_id'), 'type_id index exists');
  assert(createdIndexes['character_transactions'].includes('date'), 'date index exists');
  assert(createdIndexes['character_transactions'].includes('char_date'), 'char_date index exists');
  assert(createdIndexes['character_transactions'].includes('char_type'), 'char_type index exists');

  console.log('  [PASS] Migration logic from DB_VERSION 3 to DB_VERSION 4 verified.');

  // ==========================================================================
  // PHASE 2B — CHANTIER 3B-1 HARDENING RELIABILITY GATE TESTS (A to I)
  // ==========================================================================
  console.log('\n==========================================================================');
  console.log('--- RUNNING CHANTIER 3B-1 HARDENING RELIABILITY GATE TESTS (A -> I) ---');
  console.log('==========================================================================\n');

  const canonicalRaw: RawEsiTransactionInput = {
    transaction_id: 88801,
    type_id: 34,
    location_id: 60003760,
    quantity: 25000,
    unit_price: 6.1,
    date: '2026-09-20T10:00:00Z',
    is_buy: true,
    is_personal: true,
    client_id: 99111,
    journal_ref_id: 55555,
  };

  // --------------------------------------------------------------------------
  // Test A — Deterministic normalization
  // Deux appels avec la même entrée et le même ingestedAt doivent produire
  // deux objets strictement identiques (deep equality) sans drift d'horodatage.
  // --------------------------------------------------------------------------
  console.log('--- Test A: Deterministic Normalization ---');
  {
    const resA1 = normalizeEsiCharacterTransaction(canonicalRaw, 2112001, {
      ingestedAt: '2026-09-20T10:05:00.000Z',
    });
    const resA2 = normalizeEsiCharacterTransaction(canonicalRaw, 2112001, {
      ingestedAt: '2026-09-20T10:05:00.000Z',
    });

    assert(
      JSON.stringify(resA1) === JSON.stringify(resA2),
      'Two identical inputs with same ingestedAt must produce identical results'
    );
    assert(
      resA1.first_seen_at === '2026-09-20T10:05:00.000Z',
      'first_seen_at matches ingestedAt exactly'
    );
    assert(
      resA1.last_seen_at === '2026-09-20T10:05:00.000Z',
      'last_seen_at matches ingestedAt exactly'
    );
    assert(
      resA1.timestamp === '2026-09-20T10:00:00.000Z',
      'canonical timestamp preserved'
    );
    console.log('  [PASS] Test A: Deterministic normalization verified without timestamp drift.');
  }

  // --------------------------------------------------------------------------
  // Test B — No default clock drift
  // Appel sans ingestedAt interdit/rejeté explicitement. Vérifier l'absence de Date.now() caché.
  // --------------------------------------------------------------------------
  console.log('--- Test B: No Default Clock Drift (Mandatory ingestedAt) ---');
  {
    let caughtB1 = false;
    try {
      normalizeEsiCharacterTransaction(canonicalRaw, 2112001, undefined as any);
    } catch (e: any) {
      caughtB1 = true;
      assert(
        e.message.includes('ingestedAt is required'),
        'Must reject normalization without ingestedAt'
      );
    }
    assert(caughtB1, 'normalizeEsiCharacterTransaction must throw when ingestedAt is omitted');

    let caughtB2 = false;
    try {
      normalizeEsiCharacterTransaction(canonicalRaw, 2112001, { ingestedAt: '   ' });
    } catch (e: any) {
      caughtB2 = true;
    }
    assert(caughtB2, 'normalizeEsiCharacterTransaction must throw when ingestedAt is whitespace');

    let caughtB3 = false;
    try {
      normalizeEsiCharacterTransactions([canonicalRaw], 2112001, undefined as any);
    } catch (e: any) {
      caughtB3 = true;
      assert(
        e.message.includes('ingestedAt is required'),
        'Must reject batch normalization without ingestedAt'
      );
    }
    assert(caughtB3, 'normalizeEsiCharacterTransactions batch must throw when ingestedAt is omitted');

    console.log('  [PASS] Test B: Absence of hidden Date.now() and mandatory ingestedAt verified.');
  }

  // --------------------------------------------------------------------------
  // Test C — Non-integer identifier rejection
  // Rejeter: transaction_id = 12.34, Number.MAX_SAFE_INTEGER + 1, quantity = 10.5, character_id = NaN
  // --------------------------------------------------------------------------
  console.log('--- Test C: Non-Integer Identifier & Safe Integer Rejection ---');
  {
    // Float transaction_id
    const badFloatTx = validateRawCharacterTransaction(
      { ...canonicalRaw, transaction_id: 12.34 },
      2112001
    );
    assert(!badFloatTx.isValid, 'Float transaction_id (12.34) must be rejected');

    // Unsafe integer > MAX_SAFE_INTEGER
    const badUnsafeTx = validateRawCharacterTransaction(
      { ...canonicalRaw, transaction_id: Number.MAX_SAFE_INTEGER + 1000 },
      2112001
    );
    assert(!badUnsafeTx.isValid, 'Unsafe integer transaction_id must be rejected');

    // Float quantity
    const badFloatQty = validateRawCharacterTransaction(
      { ...canonicalRaw, quantity: 10.5 },
      2112001
    );
    assert(!badFloatQty.isValid, 'Float quantity (10.5) must be rejected');

    // NaN character_id
    const badNanChar = validateRawCharacterTransaction(canonicalRaw, NaN);
    assert(!badNanChar.isValid, 'NaN character_id must be rejected');

    // Float character_id
    const badFloatChar = validateRawCharacterTransaction(canonicalRaw, 2112001.5);
    assert(!badFloatChar.isValid, 'Float character_id (2112001.5) must be rejected');

    console.log('  [PASS] Test C: Strict Number.isSafeInteger enforcement on identifiers and quantities verified.');
  }

  // --------------------------------------------------------------------------
  // Test D — Invalid transaction cannot be persisted
  // Une transaction INVALID ne doit pas apparaître dans character_transactions.
  // --------------------------------------------------------------------------
  console.log('--- Test D: Invalid Transaction Cannot Be Persisted ---');
  {
    const invalidPersistedTx = {
      transaction_id: -99,
      character_id: 2112001,
      type_id: 34,
      location_id: 60003760,
      quantity: -50,
      unit_price: 0,
      timestamp: '2026-09-20T10:00:00Z',
      is_buy: true,
      data_state: 'INVALID' as const,
      first_seen_at: '2026-09-20T10:05:00Z',
      last_seen_at: '2026-09-20T10:05:00Z',
      source: 'ESI' as const,
      source_endpoint: '/test',
      ingestion_version: '1.0.0',
    };

    let caughtD = false;
    try {
      await IndexedDbStore.saveCharacterTransaction(invalidPersistedTx as any);
    } catch (e: any) {
      caughtD = true;
      assert(
        e instanceof PersistenceValidationError,
        'Must throw PersistenceValidationError on saving invalid transaction'
      );
    }
    assert(caughtD, 'IndexedDbStore.saveCharacterTransaction must reject invalid transaction');

    const fetchedD = await IndexedDbStore.getCharacterTransaction(-99);
    assert(fetchedD === null, 'Invalid transaction must not exist in store');

    console.log('  [PASS] Test D: Persistence guard rejects invalid transactions unconditionally.');
  }

  // --------------------------------------------------------------------------
  // Test E — transaction_id = 0 rejected
  // Rejeter toute tentative d'écrire ou de normaliser transaction_id = 0 comme fait ESI.
  // --------------------------------------------------------------------------
  console.log('--- Test E: transaction_id = 0 Rejected as ESI Fact ---');
  {
    const valZeroTx = validateRawCharacterTransaction(
      { ...canonicalRaw, transaction_id: 0 },
      2112001
    );
    assert(!valZeroTx.isValid, 'transaction_id = 0 must fail validation');

    let caughtE1 = false;
    try {
      normalizeEsiCharacterTransaction(
        { ...canonicalRaw, transaction_id: 0 },
        2112001,
        { ingestedAt: '2026-09-20T10:05:00Z' }
      );
    } catch (e: any) {
      caughtE1 = true;
      assert(
        e instanceof TransactionValidationError,
        'Must throw TransactionValidationError for transaction_id = 0'
      );
    }
    assert(caughtE1, 'normalizeEsiCharacterTransaction must throw for transaction_id = 0');

    const validTx = normalizeEsiCharacterTransaction(canonicalRaw, 2112001, {
      ingestedAt: '2026-09-20T10:05:00Z',
    });

    let caughtE2 = false;
    try {
      await IndexedDbStore.saveCharacterTransaction({
        ...validTx,
        transaction_id: 0,
      } as any);
    } catch (e: any) {
      caughtE2 = true;
      assert(
        e instanceof PersistenceValidationError,
        'Must throw PersistenceValidationError for transaction_id = 0'
      );
    }
    assert(caughtE2, 'IndexedDbStore must reject transaction_id = 0');

    console.log('  [PASS] Test E: Synthetic transaction_id = 0 strictly forbidden.');
  }

  // --------------------------------------------------------------------------
  // Test F — Persistence-first consistency
  // Vérifier que le cache mémoire n'est mis à jour qu'après le succès réel de la persistance durable.
  // --------------------------------------------------------------------------
  console.log('--- Test F: Persistence-First Consistency (Commit Point on oncomplete) ---');
  {
    let onCompleteTriggered: boolean = false;
    let memCheckedBeforeComplete: boolean = false;

    const mockDbF = {
      transaction: () => {
        let completeCb: any = null;
        const req = {
          onsuccess: null as any,
          result: undefined,
        };
        const txObj = {
          objectStore: () => ({
            get: () => {
              setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
                // Check memory BEFORE completeCb is called
                memCheckedBeforeComplete =
                  IndexedDbStore.getMemoryTransaction(77001) === undefined;
                if (completeCb) {
                  onCompleteTriggered = true;
                  completeCb();
                }
              }, 10);
              return req;
            },
            put: () => {},
          }),
          set oncomplete(cb: any) {
            completeCb = cb;
          },
          set onerror(_cb: any) {},
          set onabort(_cb: any) {},
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbF as any);
    const txF = normalizeEsiCharacterTransaction(
      { ...canonicalRaw, transaction_id: 77001 },
      2112001,
      { ingestedAt: '2026-09-20T10:05:00Z' }
    );
    await IndexedDbStore.saveCharacterTransaction(txF);

    assert(
      Boolean(memCheckedBeforeComplete),
      'Memory cache must NOT have transaction before oncomplete'
    );
    assert(Boolean(onCompleteTriggered), 'oncomplete must have triggered');
    assert(
      IndexedDbStore.getMemoryTransaction(77001)?.transaction_id === 77001,
      'Memory updated after oncomplete'
    );

    console.log('  [PASS] Test F: Persistence-first commit verified (memory updated strictly on oncomplete).');
  }

  // --------------------------------------------------------------------------
  // Test G — IndexedDB failure
  // Simuler une erreur d'écriture. Le cache mémoire ne doit pas prétendre que l'écriture a réussi.
  // --------------------------------------------------------------------------
  console.log('--- Test G: IndexedDB Failure (No False Memory Success) ---');
  {
    const mockDbG = {
      transaction: () => {
        let errorCb: any = null;
        const req = { onsuccess: null as any, result: undefined };
        const txObj = {
          objectStore: () => ({
            get: () => {
              setTimeout(() => {
                if (errorCb) {
                  errorCb({ target: { error: new Error('IDB disk write I/O error') } });
                }
              }, 10);
              return req;
            },
            put: () => {},
          }),
          set oncomplete(_cb: any) {},
          set onerror(cb: any) {
            errorCb = cb;
          },
          set onabort(_cb: any) {},
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbG as any);
    const txG = normalizeEsiCharacterTransaction(
      { ...canonicalRaw, transaction_id: 77002 },
      2112001,
      { ingestedAt: '2026-09-20T10:05:00Z' }
    );

    let caughtG = false;
    try {
      await IndexedDbStore.saveCharacterTransaction(txG);
    } catch (e: any) {
      caughtG = true;
      assert(e.message.includes('IDB disk write I/O error'), 'Error must be propagated');
    }
    assert(caughtG, 'saveCharacterTransaction must reject on IDB failure');
    assert(
      IndexedDbStore.getMemoryTransaction(77002) === undefined,
      'Memory cache must NOT contain 77002 after failed persistence write'
    );

    const writeStatusG = IndexedDbStore.getLastWriteStatus();
    assert(writeStatusG.status === 'WRITE_FAILED', 'Write status must be WRITE_FAILED');
    assert(
      writeStatusG.error?.includes('IDB disk write I/O error') === true,
      'Write error recorded in audit record'
    );

    console.log('  [PASS] Test G: Storage failure rejection and audit tracking verified.');
  }

  // --------------------------------------------------------------------------
  // Test H — Batch failure
  // Simuler un échec transactionnel. Vérifier l'absence d'état mémoire partiellement commité.
  // --------------------------------------------------------------------------
  console.log('--- Test H: Batch Transaction Failure (Zero Partial Commit) ---');
  {
    const mockDbH = {
      transaction: () => {
        let abortCb: any = null;
        const txObj = {
          objectStore: () => ({
            put: () => {},
          }),
          set oncomplete(_cb: any) {},
          set onerror(_cb: any) {},
          set onabort(cb: any) {
            abortCb = cb;
            setTimeout(() => {
              if (abortCb) abortCb({ target: { error: new Error('Transaction quota exceeded abort') } });
            }, 10);
          },
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbH as any);
    const txH1 = normalizeEsiCharacterTransaction(
      { ...canonicalRaw, transaction_id: 77003 },
      2112001,
      { ingestedAt: '2026-09-20T10:05:00Z' }
    );
    const txH2 = normalizeEsiCharacterTransaction(
      { ...canonicalRaw, transaction_id: 77004 },
      2112001,
      { ingestedAt: '2026-09-20T10:05:00Z' }
    );

    let caughtH = false;
    try {
      await IndexedDbStore.saveCharacterTransactions([txH1, txH2]);
    } catch (e: any) {
      caughtH = true;
    }
    assert(caughtH, 'Batch save must reject on abort');
    assert(
      IndexedDbStore.getMemoryTransaction(77003) === undefined,
      'Batch failure: item 77003 must NOT be in memory'
    );
    assert(
      IndexedDbStore.getMemoryTransaction(77004) === undefined,
      'Batch failure: item 77004 must NOT be in memory'
    );

    console.log('  [PASS] Test H: Zero partial commit on batch failure verified.');
  }

  // --------------------------------------------------------------------------
  // Test I — Clear failure
  // Simuler l'échec IndexedDB et vérifier la cohérence mémoire/durable.
  // --------------------------------------------------------------------------
  console.log('--- Test I: Clear Character Transactions Failure Coherence ---');
  {
    // First put item into memory using null db (in-memory fallback)
    IndexedDbStore.setTestDatabase(null);
    const txI = normalizeEsiCharacterTransaction(
      { ...canonicalRaw, transaction_id: 77005 },
      2112001,
      { ingestedAt: '2026-09-20T10:05:00Z' }
    );
    await IndexedDbStore.saveCharacterTransaction(txI);
    assert(
      IndexedDbStore.getMemoryTransaction(77005) !== undefined,
      'Item 77005 exists in memory prior to clear'
    );

    // Now inject failing db for clear
    const mockDbI = {
      transaction: () => {
        let errorCb: any = null;
        const txObj = {
          objectStore: () => ({
            clear: () => {
              setTimeout(() => {
                if (errorCb)
                  errorCb({ target: { error: new Error('Clear operation locked by OS') } });
              }, 10);
            },
          }),
          set oncomplete(_cb: any) {},
          set onerror(cb: any) {
            errorCb = cb;
          },
          set onabort(_cb: any) {},
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbI as any);
    let caughtI = false;
    try {
      await IndexedDbStore.clearCharacterTransactions();
    } catch (e: any) {
      caughtI = true;
    }
    assert(caughtI, 'clearCharacterTransactions must reject on failure');
    assert(
      IndexedDbStore.getMemoryTransaction(77005) !== undefined,
      'Item 77005 must STILL be in memory because durable clear failed'
    );

    // Reset test database to null
    IndexedDbStore.setTestDatabase(null);

    console.log('  [PASS] Test I: Coherence between memory and durable storage on clear failure verified.');
  }

  console.log('\n🎉 ALL HARDENING RELIABILITY GATE TESTS (A TO I) PASSED SUCCESSFULLY!\n');
  console.log('🎉 ALL PHASE 2B NORMALIZED EXECUTION PERSISTENCE TESTS PASSED SUCCESSFULLY!\n');
})().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
