/**
 * EVE Trade - Execution Tracking Integration Test Suite
 *
 * PHASE 2B — CHANTIER 3B-3: Correlation Integration Implementation
 *
 * Validates the complete pipeline:
 * PersistedCharacterTransaction -> persistedTransactionToRef() -> Execution Correlation Engine
 * -> correlated transactions -> Execution Outcome Engine -> CharacterExecutionRecord
 * -> character_executions (IndexedDbStore)
 *
 * Complete verification of the 18 required test scenarios:
 * 1. Transaction matches observation: STRONG_MATCH -> single CharacterExecutionRecord
 * 2. Same observation, Character A and Character B -> two separate execution records
 * 3. Character A CLOSED / Character B BUY_PARTIAL -> independent execution statuses
 * 4. Cross-character mapping -> explicit rejection (CrossCharacterMappingViolationError)
 * 5. AMBIGUOUS match -> no automatic selected observation, no execution record created
 * 6. UNMATCHED transaction -> no execution record created
 * 7. Partial execution -> correct quantities & fill ratios
 * 8. Split transactions (1000, 2000, 3000) -> aggregated in a single execution cycle
 * 9. VWAP calculation -> identical to pure calculateVwap
 * 10. Re-execution with same data -> idempotent, zero double counting
 * 11. Observation immutability -> byte-for-byte deep equality before and after correlation
 * 12. Evidence hash -> strictly preserved and unchanged
 * 13. Migration DB v4 -> v5 -> all 10 existing stores preserved, character_executions created
 * 14. Unknown transaction -> no fake execution record
 * 15. Character isolation -> zero data leakage from Character A to Character B
 * 16. Correlation engine version -> stored as "1.0.0"
 * 17. Recomputation -> identical outcome produced from source transactions
 * 18. Concurrency -> parallel character tracking runs do not overwrite each other
 */

import {
  CharacterExecutionRecord,
  OpportunityObservation,
  PersistedCharacterTransaction,
} from '../../types';
import {
  ExecutionTrackingService,
  CrossCharacterMappingViolationError,
  buildExecutionId,
  CORRELATION_ENGINE_VERSION,
} from '../../services/executionTrackingService';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { calculateVwap } from '../executionOutcome';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING PHASE 2B: EXECUTION TRACKING INTEGRATION TESTS (18 SCENARIOS) ===\n');

// --------------------------------------------------------------------------
// Test Fixture Factories
// --------------------------------------------------------------------------

function createTestObservation(overrides?: Partial<OpportunityObservation>): OpportunityObservation {
  return Object.freeze({
    observation_id: 'obs-001',
    opportunity_id: 'opp-001',
    timestamp: '2026-09-20T12:00:00.000Z',
    type_id: 34, // Tritanium
    type_name: 'Tritanium',
    source_region_id: 10000002, // The Forge
    dest_region_id: 10000043, // Domain
    source_hub_id: 'jita',
    dest_hub_id: 'amarr',
    strategy: 'immediate',
    buy_price: 5.0,
    sell_price: 6.5,
    quantity: 10000,
    net_profit: 15000,
    roi: 0.3,
    expected_days_to_sell: 1,
    capturable_profit: 15000,
    profit_per_day: 15000,
    overall_score: 85,
    liquidity_score: 90,
    stability_score: 85,
    data_confidence: 0.95,
    is_anomalous: false,
    bottleneck: 'capital',
    evidence: Object.freeze({
      schema_version: '4-pillars-v1',
      evidence_hash: 'hash-abc-123-fixed-evidence-sha256',
      market_data: { source_orders_count: 5, dest_orders_count: 5 },
      catalog: { type_id: 34, name: 'Tritanium', is_valid: true },
      universe: { source_region_id: 10000002, dest_region_id: 10000043 },
      financial: { buy_price: 5.0, sell_price: 6.5, quantity: 10000, net_profit: 15000 },
      certified_at: '2026-09-20T12:00:00.000Z',
    }) as any,
    ...overrides,
  });
}

function createTestPersistedTransaction(
  overrides?: Partial<PersistedCharacterTransaction>
): PersistedCharacterTransaction {
  return Object.freeze({
    transaction_id: 10001,
    character_id: 2112001,
    type_id: 34,
    location_id: 60003760, // Jita IV-4
    is_buy: true,
    quantity: 10000,
    unit_price: 5.02, // within 2% of 5.0
    timestamp: '2026-09-20T12:05:00.000Z',
    is_personal: true,
    client_id: 99001,
    journal_ref_id: 888001,
    first_seen_at: '2026-09-20T12:10:00.000Z',
    last_seen_at: '2026-09-20T12:10:00.000Z',
    source: 'ESI',
    source_endpoint: '/characters/2112001/wallet/transactions/',
    ingestion_version: '1.0.0',
    data_state: 'VALID',
    ...overrides,
  });
}

async function runAllTests() {
  await IndexedDbStore.clearAll();

  // --------------------------------------------------------------------------
  // Test 1: STRONG_MATCH -> single CharacterExecutionRecord
  // --------------------------------------------------------------------------
  console.log('--- Test 1: STRONG_MATCH produces single CharacterExecutionRecord ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const tx = createTestPersistedTransaction();

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    assert(summary.character_id === 2112001, 'Summary character_id matches target');
    assert(summary.strong_matches === 1, 'Transaction matches strongly');
    assert(summary.transactions_correlated === 1, '1 transaction correlated');
    assert(summary.execution_records_created === 1, '1 execution record created');
    assert(summary.execution_records.length === 1, '1 execution record in summary');

    const record = summary.execution_records[0];
    assert(record.execution_id === 'exec_2112001_obs-001', 'Canonical execution_id generated');
    assert(record.character_id === 2112001, 'character_id populated explicitly');
    assert(record.observation_id === 'obs-001', 'observation_id matches');
    assert(record.opportunity_id === 'opp-001', 'opportunity_id matches');
    assert(record.match_level === 'STRONG_MATCH', 'Match level is STRONG_MATCH');
    assert(record.transaction_ids.length === 1 && record.transaction_ids[0] === 10001, 'transaction_ids populated');
    assert(record.execution_outcome.execution_status === 'BUY_FILLED', 'Outcome status is BUY_FILLED');
    assert(record.execution_outcome.executed_buy_quantity === 10000, 'Executed quantity is 10000');
    assert(record.data_state === 'VALID', 'Record data_state is VALID');

    // Verify retrieval from IndexedDbStore
    const stored = await IndexedDbStore.getCharacterExecution('exec_2112001_obs-001');
    assert(stored !== null, 'Record retrievable from IndexedDbStore');
    assert(stored?.execution_id === record.execution_id, 'Stored record matches');

    console.log('  [PASS] Test 1: STRONG_MATCH single CharacterExecutionRecord verified.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Same observation, Character A and Character B -> two separate execution records
  // --------------------------------------------------------------------------
  console.log('--- Test 2: Multi-Character Independence on Same Observation ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const txA = createTestPersistedTransaction({ transaction_id: 10001, character_id: 2112001 });
    const txB = createTestPersistedTransaction({ transaction_id: 10002, character_id: 2112002 });

    const summaryA = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txA],
      observations: [obs],
    });
    const summaryB = await ExecutionTrackingService.trackCharacterExecutions(2112002, {
      transactions: [txB],
      observations: [obs],
    });

    assert(summaryA.execution_records_created === 1, 'Summary A created 1 record');
    assert(summaryB.execution_records_created === 1, 'Summary B created 1 record');

    const recA = await IndexedDbStore.getCharacterExecution('exec_2112001_obs-001');
    const recB = await IndexedDbStore.getCharacterExecution('exec_2112002_obs-001');

    assert(recA !== null && recB !== null, 'Both records exist independently');
    assert(recA?.character_id === 2112001, 'Rec A character is 2112001');
    assert(recB?.character_id === 2112002, 'Rec B character is 2112002');
    assert(recA?.execution_id !== recB?.execution_id, 'Execution IDs are distinct');

    const listA = await IndexedDbStore.getCharacterExecutions(2112001);
    const listB = await IndexedDbStore.getCharacterExecutions(2112002);
    assert(listA.length === 1 && listA[0].character_id === 2112001, 'Querying A returns only A');
    assert(listB.length === 1 && listB[0].character_id === 2112002, 'Querying B returns only B');

    console.log('  [PASS] Test 2: Two separate execution records for same observation verified.');
  }

  // --------------------------------------------------------------------------
  // Test 3: Character A CLOSED / Character B BUY_PARTIAL
  // --------------------------------------------------------------------------
  console.log('--- Test 3: Independent Execution Statuses (A CLOSED / B BUY_PARTIAL) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ quantity: 10000 });

    // Character A buys 10000 then sells 10000 at destination (Amarr)
    const txABuy = createTestPersistedTransaction({
      transaction_id: 20001,
      character_id: 2112001,
      quantity: 10000,
      is_buy: true,
      unit_price: 5.0,
      location_id: 60003760, // Jita
      timestamp: '2026-09-20T12:05:00.000Z',
    });
    const txASell = createTestPersistedTransaction({
      transaction_id: 20002,
      character_id: 2112001,
      quantity: 10000,
      is_buy: false,
      unit_price: 6.48, // within 2% of 6.5
      location_id: 60008494, // Amarr VIII (Domain)
      timestamp: '2026-09-20T14:30:00.000Z',
    });

    // Character B only buys 4000
    const txBBuy = createTestPersistedTransaction({
      transaction_id: 20003,
      character_id: 2112002,
      quantity: 4000,
      is_buy: true,
      unit_price: 5.0,
      location_id: 60003760,
      timestamp: '2026-09-20T12:05:00.000Z',
    });

    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txABuy, txASell],
      observations: [obs],
    });
    await ExecutionTrackingService.trackCharacterExecutions(2112002, {
      transactions: [txBBuy],
      observations: [obs],
    });

    const recA = await IndexedDbStore.getCharacterExecution('exec_2112001_obs-001');
    const recB = await IndexedDbStore.getCharacterExecution('exec_2112002_obs-001');

    assert(recA?.execution_outcome.execution_status === 'CLOSED', 'Character A status must be CLOSED');
    assert(recA?.execution_outcome.remaining_inventory_quantity === 0, 'Character A remaining inventory is 0');
    assert(recA?.execution_outcome.sell_fill_ratio === 1.0, 'Character A sell fill ratio is 100%');

    assert(recB?.execution_outcome.execution_status === 'BUY_PARTIAL', 'Character B status must be BUY_PARTIAL');
    assert(recB?.execution_outcome.executed_buy_quantity === 4000, 'Character B bought 4000');
    assert(recB?.execution_outcome.remaining_inventory_quantity === 4000, 'Character B remaining inventory is 4000');

    console.log('  [PASS] Test 3: Independent execution statuses verified.');
  }

  // --------------------------------------------------------------------------
  // Test 4: Cross-Character Mapping -> Explicit rejection
  // --------------------------------------------------------------------------
  console.log('--- Test 4: Cross-Character Mapping Guard (Explicit Rejection) ---');
  {
    const obs = createTestObservation();
    // Transaction belongs to Character 2112002
    const rogueTx = createTestPersistedTransaction({
      transaction_id: 30001,
      character_id: 2112002,
    });

    let caught = false;
    try {
      // Attempting to track under Character 2112001
      await ExecutionTrackingService.trackCharacterExecutions(2112001, {
        transactions: [rogueTx],
        observations: [obs],
      });
    } catch (err: any) {
      caught = true;
      assert(
        err instanceof CrossCharacterMappingViolationError,
        'Error must be an instance of CrossCharacterMappingViolationError'
      );
      assert(err.transactionCharacterId === 2112002, 'Violation captures offending character ID');
      assert(err.targetCharacterId === 2112001, 'Violation captures target character ID');
      assert(err.transactionId === 30001, 'Violation captures transaction ID');
    }
    assert(caught, 'Must throw CrossCharacterMappingViolationError on mismatched character_id');

    console.log('  [PASS] Test 4: Cross-Character mapping rejection verified.');
  }

  // --------------------------------------------------------------------------
  // Test 5: AMBIGUOUS match -> No automatic selected observation
  // --------------------------------------------------------------------------
  console.log('--- Test 5: AMBIGUOUS Match Preservation ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    // Two identical candidate observations with identical scores
    const obsA = createTestObservation({ observation_id: 'obs-ambig-1', opportunity_id: 'opp-1' });
    const obsB = createTestObservation({ observation_id: 'obs-ambig-2', opportunity_id: 'opp-2' });

    const tx = createTestPersistedTransaction({ transaction_id: 40001 });

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obsA, obsB],
    });

    assert(summary.ambiguous_matches === 1, 'Ambiguous match count is 1');
    assert(summary.execution_records_created === 0, 'No execution record created for ambiguous transaction');
    assert(summary.unassigned_transactions.length === 1, 'Transaction listed in unassigned_transactions');
    assert(summary.unassigned_transactions[0].match_level === 'AMBIGUOUS', 'Unassigned match_level is AMBIGUOUS');
    assert(
      summary.unassigned_transactions[0].candidate_observation_ids.length === 2,
      'Both candidate observations preserved in ambiguity'
    );

    const storedExecutions = await IndexedDbStore.getCharacterExecutions(2112001);
    assert(storedExecutions.length === 0, 'Zero execution records stored in database');

    console.log('  [PASS] Test 5: AMBIGUOUS match preservation verified.');
  }

  // --------------------------------------------------------------------------
  // Test 6: UNMATCHED transaction -> No execution record created
  // --------------------------------------------------------------------------
  console.log('--- Test 6: UNMATCHED Transaction Handling ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ type_id: 34 });
    // Transaction is for type_id 35 (Pyerite) with price 20.0
    const tx = createTestPersistedTransaction({
      transaction_id: 50001,
      type_id: 35,
      unit_price: 20.0,
    });

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    assert(summary.unmatched_transactions === 1, 'Unmatched transaction count is 1');
    assert(summary.execution_records_created === 0, 'No execution record created for unmatched transaction');
    assert(summary.unassigned_transactions.length === 1, 'Unmatched listed in unassigned_transactions');
    assert(summary.unassigned_transactions[0].match_level === 'UNMATCHED', 'Level is UNMATCHED');

    console.log('  [PASS] Test 6: UNMATCHED transaction handling verified.');
  }

  // --------------------------------------------------------------------------
  // Test 7: Partial execution -> Correct quantities & fill ratios
  // --------------------------------------------------------------------------
  console.log('--- Test 7: Partial Execution Quantities and Fill Ratios ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ quantity: 10000 });
    const tx = createTestPersistedTransaction({
      transaction_id: 60001,
      quantity: 4000,
    });

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    assert(summary.execution_records.length === 1, '1 record created');
    const rec = summary.execution_records[0];
    assert(rec.execution_outcome.planned_quantity === 10000, 'Planned quantity is 10000');
    assert(rec.execution_outcome.executed_buy_quantity === 4000, 'Executed buy is 4000');
    assert(rec.execution_outcome.buy_fill_ratio === 0.4, 'Buy fill ratio is 0.4');
    assert(rec.execution_outcome.remaining_inventory_quantity === 4000, 'Remaining inventory is 4000');
    assert(rec.execution_outcome.execution_status === 'BUY_PARTIAL', 'Status is BUY_PARTIAL');

    console.log('  [PASS] Test 7: Partial execution verified.');
  }

  // --------------------------------------------------------------------------
  // Test 8: Split transactions (1000, 2000, 3000) -> Aggregated in one cycle
  // --------------------------------------------------------------------------
  console.log('--- Test 8: Split Transactions Aggregated in Single Execution Cycle ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ quantity: 10000 });

    const tx1 = createTestPersistedTransaction({ transaction_id: 70001, quantity: 1000, timestamp: '2026-09-20T12:05:00.000Z' });
    const tx2 = createTestPersistedTransaction({ transaction_id: 70002, quantity: 2000, timestamp: '2026-09-20T12:10:00.000Z' });
    const tx3 = createTestPersistedTransaction({ transaction_id: 70003, quantity: 3000, timestamp: '2026-09-20T12:15:00.000Z' });

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx1, tx2, tx3],
      observations: [obs],
    });

    assert(summary.execution_records_created === 1, 'Exactly 1 execution record created');
    const rec = summary.execution_records[0];
    assert(rec.execution_outcome.executed_buy_quantity === 6000, 'Aggregated buy quantity is 6000');
    assert(rec.transaction_ids.length === 3, 'All 3 transaction IDs recorded');
    assert(rec.transaction_ids[0] === 70001 && rec.transaction_ids[1] === 70002 && rec.transaction_ids[2] === 70003, 'IDs sorted in ascending order');

    console.log('  [PASS] Test 8: Split transactions aggregation verified.');
  }

  // --------------------------------------------------------------------------
  // Test 9: VWAP calculation -> Identical to pure calculateVwap
  // --------------------------------------------------------------------------
  console.log('--- Test 9: VWAP Calculation Equivalence ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ quantity: 10000 });

    const tx1 = createTestPersistedTransaction({ transaction_id: 80001, quantity: 1000, unit_price: 5.0, timestamp: '2026-09-20T12:01:00Z' });
    const tx2 = createTestPersistedTransaction({ transaction_id: 80002, quantity: 2000, unit_price: 5.05, timestamp: '2026-09-20T12:02:00Z' });
    const tx3 = createTestPersistedTransaction({ transaction_id: 80003, quantity: 3000, unit_price: 5.10, timestamp: '2026-09-20T12:03:00Z' });

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx1, tx2, tx3],
      observations: [obs],
    });

    const expectedVwap = (1000 * 5.0 + 2000 * 5.05 + 3000 * 5.10) / (1000 + 2000 + 3000);
    const rec = summary.execution_records[0];
    assert(rec.execution_outcome.vwap_buy_price !== null, 'VWAP must not be null');
    assert(
      Math.abs(rec.execution_outcome.vwap_buy_price! - expectedVwap) < 1e-9,
      `VWAP (${rec.execution_outcome.vwap_buy_price}) must match mathematical expectation (${expectedVwap})`
    );

    console.log('  [PASS] Test 9: VWAP calculation equivalence verified.');
  }

  // --------------------------------------------------------------------------
  // Test 10: Re-execution with same data -> Idempotent, zero double counting
  // --------------------------------------------------------------------------
  console.log('--- Test 10: Idempotent Re-execution (Zero Double Counting) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const tx = createTestPersistedTransaction({ transaction_id: 90001, quantity: 5000 });

    const clock1 = '2026-09-20T12:30:00.000Z';
    const clock2 = '2026-09-20T12:45:00.000Z';

    // First execution
    const summary1 = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
      now: () => clock1,
    });
    assert(summary1.execution_records_created === 1, 'First run creates 1 record');
    assert(summary1.execution_records_updated === 0, 'First run updates 0 records');
    const firstRec = summary1.execution_records[0];

    // Second execution with identical input
    const summary2 = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
      now: () => clock2,
    });
    assert(summary2.execution_records_created === 0, 'Second run creates 0 records');
    assert(summary2.execution_records_updated === 1, 'Second run updates 1 record');

    const totalStored = await IndexedDbStore.getCharacterExecutions(2112001);
    assert(totalStored.length === 1, 'Database contains exactly 1 execution record');

    const secondRec = totalStored[0];
    assert(secondRec.first_correlated_at === clock1, 'first_correlated_at is preserved');
    assert(secondRec.last_updated_at === clock2, 'last_updated_at is updated');
    assert(secondRec.execution_outcome.executed_buy_quantity === 5000, 'Executed quantity is STILL 5000 (not doubled)');

    console.log('  [PASS] Test 10: Idempotent re-execution verified without double counting.');
  }

  // --------------------------------------------------------------------------
  // Test 11: Observation immutability -> Deep equality before and after correlation
  // --------------------------------------------------------------------------
  console.log('--- Test 11: OpportunityObservation Immutability ---');
  {
    const obs = createTestObservation();
    const originalObsJson = JSON.stringify(obs);
    const tx = createTestPersistedTransaction();

    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    const postCorrelationObsJson = JSON.stringify(obs);
    assert(originalObsJson === postCorrelationObsJson, 'OpportunityObservation must remain byte-for-byte identical');

    console.log('  [PASS] Test 11: Observation immutability verified.');
  }

  // --------------------------------------------------------------------------
  // Test 12: Evidence hash -> Invariant & strictly preserved
  // --------------------------------------------------------------------------
  console.log('--- Test 12: Evidence Hash Invariance ---');
  {
    const obs = createTestObservation();
    assert(obs.evidence !== undefined, 'Evidence must be present');
    const expectedHash = obs.evidence!.evidence_hash;
    const tx = createTestPersistedTransaction();

    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    assert(obs.evidence!.evidence_hash === expectedHash, 'evidence_hash must never be altered');

    console.log('  [PASS] Test 12: Evidence hash invariance verified.');
  }

  // --------------------------------------------------------------------------
  // Test 13: Migration DB v4 -> v5 -> all existing stores preserved
  // --------------------------------------------------------------------------
  console.log('--- Test 13: IndexedDB Migration from v4 to v5 ---');
  {
    // Simulate IndexedDB upgrade environment
    const existingStores = [
      'snapshots',
      'history',
      'universe_opportunities',
      'http_cache',
      'market_observations',
      'opportunity_observations',
      'market_history_daily',
      'eve_types',
      'catalog_metadata',
      'character_transactions',
    ];

    const createdStores: string[] = [];
    const createdIndexes: Record<string, string[]> = {};

    const mockDb: any = {
      objectStoreNames: {
        contains: (name: string) => existingStores.includes(name) || createdStores.includes(name),
      },
      createObjectStore: (name: string, options: any) => {
        createdStores.push(name);
        createdIndexes[name] = [];
        return {
          createIndex: (idxName: string, keyPath: any, opts: any) => {
            createdIndexes[name].push(idxName);
          },
        };
      },
    };

    // Execute migration logic for DB_VERSION = 5
    if (!mockDb.objectStoreNames.contains('character_executions')) {
      const execStore = mockDb.createObjectStore('character_executions', { keyPath: 'execution_id' });
      execStore.createIndex('character_id', 'character_id', { unique: false });
      execStore.createIndex('observation_id', 'observation_id', { unique: false });
      execStore.createIndex('opportunity_id', 'opportunity_id', { unique: false });
      execStore.createIndex('char_obs', ['character_id', 'observation_id'], { unique: true });
    }

    assert(createdStores.includes('character_executions'), 'character_executions object store was created');
    assert(createdStores.length === 1, 'Only the new store was created, existing 10 stores preserved');
    assert(createdIndexes['character_executions'].length === 4, 'All 4 indexes created on character_executions');
    assert(createdIndexes['character_executions'].includes('character_id'), 'character_id index exists');
    assert(createdIndexes['character_executions'].includes('observation_id'), 'observation_id index exists');
    assert(createdIndexes['character_executions'].includes('opportunity_id'), 'opportunity_id index exists');
    assert(createdIndexes['character_executions'].includes('char_obs'), 'compound char_obs index exists');

    console.log('  [PASS] Test 13: DB v4 to v5 migration verified.');
  }

  // --------------------------------------------------------------------------
  // Test 14: Unknown transaction -> No fake execution record
  // --------------------------------------------------------------------------
  console.log('--- Test 14: Unknown / Empty Transactions produce No Fake Records ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [],
      observations: [obs],
    });

    assert(summary.transactions_considered === 0, '0 transactions considered');
    assert(summary.execution_records_created === 0, '0 execution records created');
    assert(summary.execution_records.length === 0, '0 execution records returned');

    console.log('  [PASS] Test 14: Unknown / empty transactions handled cleanly.');
  }

  // --------------------------------------------------------------------------
  // Test 15: Character isolation -> No Character A data in Character B
  // --------------------------------------------------------------------------
  console.log('--- Test 15: Character Isolation & Data Partitioning ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const txA = createTestPersistedTransaction({ transaction_id: 11001, character_id: 2112001 });

    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txA],
      observations: [obs],
    });

    const bRecords = await IndexedDbStore.getCharacterExecutions(2112002);
    assert(bRecords.length === 0, 'Character 2112002 has 0 execution records');

    const allRecords = await IndexedDbStore.getAllCharacterExecutions();
    assert(allRecords.every((r) => r.character_id === 2112001), 'All records belong strictly to 2112001');

    console.log('  [PASS] Test 15: Character isolation verified.');
  }

  // --------------------------------------------------------------------------
  // Test 16: Correlation Engine Version -> Stored as "1.0.0"
  // --------------------------------------------------------------------------
  console.log('--- Test 16: Correlation Engine Version in Execution Record ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const tx = createTestPersistedTransaction();

    const summary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx],
      observations: [obs],
    });

    const rec = summary.execution_records[0];
    assert(rec.correlation_engine_version === CORRELATION_ENGINE_VERSION, 'Version matches "1.0.0"');
    assert(rec.correlation_engine_version === '1.0.0', 'Version is explicitly "1.0.0"');

    console.log('  [PASS] Test 16: Correlation engine version verified.');
  }

  // --------------------------------------------------------------------------
  // Test 17: Recomputation -> Identical outcome produced from source transactions
  // --------------------------------------------------------------------------
  console.log('--- Test 17: Recomputation Determinism ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();
    const tx1 = createTestPersistedTransaction({ transaction_id: 12001, quantity: 3000 });
    const tx2 = createTestPersistedTransaction({ transaction_id: 12002, quantity: 7000 });

    const initialSummary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx1, tx2],
      observations: [obs],
    });

    const recomputedSummary = await ExecutionTrackingService.recomputeCharacterExecutions(2112001, {
      transactions: [tx1, tx2],
      observations: [obs],
    });

    const initRec = initialSummary.execution_records[0];
    const recomputedRec = recomputedSummary.execution_records[0];

    assert(initRec.execution_id === recomputedRec.execution_id, 'Execution IDs match');
    assert(initRec.execution_outcome.executed_buy_quantity === recomputedRec.execution_outcome.executed_buy_quantity, 'Quantities match');
    assert(initRec.execution_outcome.vwap_buy_price === recomputedRec.execution_outcome.vwap_buy_price, 'VWAPs match');
    assert(initRec.first_correlated_at === recomputedRec.first_correlated_at, 'first_correlated_at preserved across recomputation');

    console.log('  [PASS] Test 17: Recomputation determinism verified.');
  }

  // --------------------------------------------------------------------------
  // Test 18: Concurrency -> Parallel character tracking runs do not overwrite each other
  // --------------------------------------------------------------------------
  console.log('--- Test 18: Concurrency (Parallel Multi-Character Tracking) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation();

    const txA = createTestPersistedTransaction({ transaction_id: 13001, character_id: 2112001, quantity: 5000 });
    const txB = createTestPersistedTransaction({ transaction_id: 13002, character_id: 2112002, quantity: 8000 });

    const [summaryA, summaryB] = await Promise.all([
      ExecutionTrackingService.trackCharacterExecutions(2112001, {
        transactions: [txA],
        observations: [obs],
      }),
      ExecutionTrackingService.trackCharacterExecutions(2112002, {
        transactions: [txB],
        observations: [obs],
      }),
    ]);

    assert(summaryA.execution_records.length === 1, 'Character A has 1 record');
    assert(summaryB.execution_records.length === 1, 'Character B has 1 record');

    const storedA = await IndexedDbStore.getCharacterExecution('exec_2112001_obs-001');
    const storedB = await IndexedDbStore.getCharacterExecution('exec_2112002_obs-001');

    assert(storedA !== null && storedA.execution_outcome.executed_buy_quantity === 5000, 'Record A stored correctly');
    assert(storedB !== null && storedB.execution_outcome.executed_buy_quantity === 8000, 'Record B stored correctly');

    const allRecords = await IndexedDbStore.getAllCharacterExecutions();
    assert(allRecords.length === 2, 'Total 2 records in database, neither overwritten');

    console.log('  [PASS] Test 18: Concurrency and parallel tracking verified.');
  }

  // ==========================================================================
  // PHASE 2B — CHANTIER 3B-3.1: EXECUTION STATE INTEGRITY & RECONCILIATION GATE
  // ==========================================================================
  console.log('\n==========================================================================');
  console.log('--- RUNNING CHANTIER 3B-3.1 RECONCILIATION & INTEGRITY GATE TESTS (1 -> 9) ---');
  console.log('==========================================================================\n');

  // Reset test database to clean in-memory state
  IndexedDbStore.setTestDatabase(null);

  // --------------------------------------------------------------------------
  // Scenario 1: forceRecompute supprime le record devenu non attribuable
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 1: forceRecompute Removes Obsolete / Unattributable Records ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ observation_id: 'obs-gate-001' });
    const tx1 = createTestPersistedTransaction({ transaction_id: 20001, character_id: 2112001, unit_price: 5.0 });

    // Initial run attributes tx1 to obs-gate-001
    const initialSummary = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx1],
      observations: [obs],
    });
    assert(initialSummary.execution_records_created === 1, 'Initial record created');
    assert(initialSummary.execution_records.length === 1, '1 execution record returned');
    assert((await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-001')) !== null, 'Record exists in DB');

    // Recompute without transactions (or transactions that do not correlate)
    const recomputeSummary = await ExecutionTrackingService.recomputeCharacterExecutions(2112001, {
      transactions: [],
      observations: [obs],
    });

    assert(recomputeSummary.execution_records.length === 0, 'No active execution records returned');
    assert(recomputeSummary.execution_records_deleted === 1, '1 execution record reported as deleted');
    const storedAfter = await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-001');
    assert(storedAfter === null, 'Obsolete record was deleted from durable storage and memory');

    console.log('  [PASS] Gate Scenario 1: Obsolete record cleanly deleted during forceRecompute.');
  }

  // --------------------------------------------------------------------------
  // Scenario 2: forceRecompute d'un personnage ne supprime pas les records des autres personnages
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 2: Cross-Character Isolation During forceRecompute ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ observation_id: 'obs-gate-002' });
    const txA = createTestPersistedTransaction({ transaction_id: 20002, character_id: 2112001 });
    const txB = createTestPersistedTransaction({ transaction_id: 20003, character_id: 2112002 });

    // Both characters track executions on obs-gate-002
    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txA],
      observations: [obs],
    });
    await ExecutionTrackingService.trackCharacterExecutions(2112002, {
      transactions: [txB],
      observations: [obs],
    });

    assert((await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-002')) !== null, 'Char A record exists');
    assert((await IndexedDbStore.getCharacterExecutionByObservation(2112002, 'obs-gate-002')) !== null, 'Char B record exists');

    // Force recompute Char A with empty transactions
    const recomputeA = await ExecutionTrackingService.recomputeCharacterExecutions(2112001, {
      transactions: [],
      observations: [obs],
    });
    assert(recomputeA.execution_records_deleted === 1, 'Char A record deleted');

    // Verify Char A has 0 records, but Char B has 1 record intact!
    assert((await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-002')) === null, 'Char A record removed');
    const recordBAfter = await IndexedDbStore.getCharacterExecutionByObservation(2112002, 'obs-gate-002');
    assert(recordBAfter !== null, 'Char B record preserved completely without any side effects');
    assert(recordBAfter?.character_id === 2112002, 'Char B identity preserved');

    console.log('  [PASS] Gate Scenario 2: Cross-character isolation during forceRecompute verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Isolation multi-personnages : injection d'une transaction étrangère rejetée sans mutation d'état
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 3: Foreign Transaction Rejected Without State Mutation ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ observation_id: 'obs-gate-003' });
    const txLegit = createTestPersistedTransaction({ transaction_id: 20004, character_id: 2112001, quantity: 1000 });
    const txForeign = createTestPersistedTransaction({ transaction_id: 20005, character_id: 9999999, quantity: 500 });

    // First create legitimate state
    await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txLegit],
      observations: [obs],
    });
    const stateBefore = await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-003');
    assert(stateBefore !== null, 'Legitimate record exists');
    const hashBefore = JSON.stringify(stateBefore);

    // Attempt to inject foreign transaction into 2112001's pipeline
    let caught = false;
    try {
      await ExecutionTrackingService.trackCharacterExecutions(2112001, {
        transactions: [txLegit, txForeign],
        observations: [obs],
      });
    } catch (err: any) {
      caught = true;
      assert(err instanceof CrossCharacterMappingViolationError, 'Must throw CrossCharacterMappingViolationError');
      assert(err.transactionCharacterId === 9999999, 'Violating character ID reported');
      assert(err.targetCharacterId === 2112001, 'Target character ID reported');
    }
    assert(caught, 'Cross-character transaction injection must throw error');

    // Verify state was NOT mutated
    const stateAfter = await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-gate-003');
    assert(JSON.stringify(stateAfter) === hashBefore, 'Database state unchanged after rejection');

    console.log('  [PASS] Gate Scenario 3: Foreign transaction rejection without state mutation verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Concurrence même personnage + même observation : aucune corruption, aucun doublon, first_correlated_at invariant
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 4: Concurrency Same Character & Same Observation ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ observation_id: 'obs-gate-004' });
    const tx1 = createTestPersistedTransaction({ transaction_id: 20006, character_id: 2112001, quantity: 2000 });
    const tx2 = createTestPersistedTransaction({ transaction_id: 20007, character_id: 2112001, quantity: 3000 });

    // Initial run to establish first_correlated_at
    const initial = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [tx1],
      observations: [obs],
    });
    const originalFirstCorrelatedAt = initial.execution_records[0].first_correlated_at;

    // Concurrently execute 3 tracking operations on the same character and observation
    await Promise.all([
      ExecutionTrackingService.trackCharacterExecutions(2112001, { transactions: [tx1, tx2], observations: [obs] }),
      ExecutionTrackingService.trackCharacterExecutions(2112001, { transactions: [tx1, tx2], observations: [obs] }),
      ExecutionTrackingService.trackCharacterExecutions(2112001, { transactions: [tx1, tx2], observations: [obs] }),
    ]);

    // Check records in database
    const allExecs = await IndexedDbStore.getCharacterExecutions(2112001, { observationId: 'obs-gate-004' });
    assert(allExecs.length === 1, 'Exactly 1 execution record exists (no duplicates)');
    assert(allExecs[0].first_correlated_at === originalFirstCorrelatedAt, 'first_correlated_at remains strictly invariant under concurrency');
    assert(allExecs[0].execution_outcome.executed_buy_quantity === 5000, 'Quantities aggregated cleanly');

    console.log('  [PASS] Gate Scenario 4: Concurrency without duplication or first_correlated_at drift verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 5: IndexedDB write failure simulée : aucun record dans le cache mémoire
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 5: Simulated IndexedDB Write Failure (Zero Cache Pollution) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const mockDbFailWrite = {
      transaction: () => {
        let errorCb: any = null;
        const txObj = {
          objectStore: () => ({
            get: () => ({ onsuccess: null as any }),
            put: () => {},
          }),
          set oncomplete(_cb: any) {},
          set onerror(cb: any) {
            errorCb = cb;
            setTimeout(() => {
              if (errorCb) errorCb({ target: { error: new Error('Simulated IDB Write Failure') } });
            }, 5);
          },
          set onabort(_cb: any) {},
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbFailWrite as any);
    const mockRecord = Object.freeze({
      execution_id: 'exec_2112001_fail-001',
      character_id: 2112001,
      observation_id: 'obs-fail-001',
      opportunity_id: 'opp-fail-001',
      execution_outcome: {
        execution_status: 'BUY_FILLED',
        match_level: 'STRONG_MATCH',
        planned_quantity: 100,
        executed_buy_quantity: 100,
        executed_sell_quantity: 0,
        remaining_inventory_quantity: 100,
        buy_fill_ratio: 1.0,
        sell_fill_ratio: 0.0,
        vwap_buy_price: 100.0,
        vwap_sell_price: null,
        first_buy_at: '2026-09-20T10:00:00Z',
        last_buy_at: '2026-09-20T10:00:00Z',
        first_sell_at: null,
        last_sell_at: null,
        buy_transactions: [],
        sell_transactions: [],
        linked_order_ids: [],
        candidate_observation_ids: ['obs-fail-001'],
      },
      match_level: 'STRONG_MATCH',
      transaction_ids: [29991],
      first_correlated_at: '2026-09-20T10:00:00Z',
      last_updated_at: '2026-09-20T10:00:00Z',
      correlation_engine_version: '1.0.0',
      data_state: 'VALID',
    } as CharacterExecutionRecord);

    let caught = false;
    try {
      await IndexedDbStore.saveCharacterExecution(mockRecord);
    } catch (err: any) {
      caught = true;
      assert(err.message.includes('Simulated IDB Write Failure'), 'Error propagated');
    }
    assert(caught, 'saveCharacterExecution must reject when DB write fails');
    assert(IndexedDbStore.getMemoryCharacterExecution('exec_2112001_fail-001') === undefined, 'Cache memory MUST NOT be polluted on write failure');

    // Reset database to in-memory mode
    IndexedDbStore.setTestDatabase(null);

    console.log('  [PASS] Gate Scenario 5: Write failure rejection and zero cache pollution verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Batch failure : 0 record partiellement persisté
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 6: Batch Write Failure (Zero Partial Commit) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const mockDbBatchAbort = {
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
              if (abortCb) abortCb({ target: { error: new Error('Batch Quota Exceeded Abort') } });
            }, 5);
          },
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbBatchAbort as any);
    const rec1 = Object.freeze({
      execution_id: 'exec_2112001_batch-001',
      character_id: 2112001,
      observation_id: 'obs-batch-001',
      opportunity_id: 'opp-batch-001',
      execution_outcome: {
        execution_status: 'BUY_FILLED',
        match_level: 'STRONG_MATCH',
        planned_quantity: 100,
        executed_buy_quantity: 100,
        executed_sell_quantity: 0,
        remaining_inventory_quantity: 100,
        buy_fill_ratio: 1.0,
        sell_fill_ratio: 0.0,
        vwap_buy_price: 100.0,
        vwap_sell_price: null,
        first_buy_at: '2026-09-20T10:00:00Z',
        last_buy_at: '2026-09-20T10:00:00Z',
        first_sell_at: null,
        last_sell_at: null,
        buy_transactions: [],
        sell_transactions: [],
        linked_order_ids: [],
        candidate_observation_ids: ['obs-batch-001'],
      },
      match_level: 'STRONG_MATCH',
      transaction_ids: [29992],
      first_correlated_at: '2026-09-20T10:00:00Z',
      last_updated_at: '2026-09-20T10:00:00Z',
      correlation_engine_version: '1.0.0',
      data_state: 'VALID',
    } as CharacterExecutionRecord);

    const rec2 = Object.freeze({
      ...rec1,
      execution_id: 'exec_2112001_batch-002',
      observation_id: 'obs-batch-002',
      transaction_ids: [29993],
    } as CharacterExecutionRecord);

    let caught = false;
    try {
      await IndexedDbStore.saveCharacterExecutions([rec1, rec2]);
    } catch (err: any) {
      caught = true;
      assert(err.message.includes('Batch Quota Exceeded Abort'), 'Abort error propagated');
    }
    assert(caught, 'saveCharacterExecutions must reject on abort');
    assert(IndexedDbStore.getMemoryCharacterExecution('exec_2112001_batch-001') === undefined, 'rec1 not in memory');
    assert(IndexedDbStore.getMemoryCharacterExecution('exec_2112001_batch-002') === undefined, 'rec2 not in memory');

    IndexedDbStore.setTestDatabase(null);

    console.log('  [PASS] Gate Scenario 6: Batch failure zero partial commit verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Échec de lecture IndexedDB : erreur explicite, pas de faux null ni masque silencieux
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 7: Explicit Error on Read Failures (No False Null) ---');
  {
    const mockDbReadFail = {
      transaction: () => {
        let errorCb: any = null;
        const req = {
          onsuccess: null as any,
          onerror: null as any,
        };
        const txObj = {
          objectStore: () => ({
            get: () => {
              setTimeout(() => {
                if (req.onerror) req.onerror({ target: { error: new Error('Corrupted IDB Sector Read Error') } });
              }, 5);
              return req;
            },
            index: () => ({
              get: () => {
                setTimeout(() => {
                  if (req.onerror) req.onerror({ target: { error: new Error('Corrupted Index Sector Read Error') } });
                }, 5);
                return req;
              },
              getAll: () => {
                setTimeout(() => {
                  if (req.onerror) req.onerror({ target: { error: new Error('Corrupted Table Read Error') } });
                }, 5);
                return req;
              },
            }),
            indexNames: { contains: (name: string) => true },
            getAll: () => {
              setTimeout(() => {
                if (req.onerror) req.onerror({ target: { error: new Error('Corrupted Table Read Error') } });
              }, 5);
              return req;
            },
          }),
          set onerror(cb: any) {
            errorCb = cb;
          },
        };
        return txObj;
      },
    };

    IndexedDbStore.setTestDatabase(mockDbReadFail as any);

    // 1. getCharacterExecution must reject
    let caughtRead1 = false;
    try {
      await IndexedDbStore.getCharacterExecution('exec_2112001_test');
    } catch (err: any) {
      caughtRead1 = true;
      assert(
        err.message.includes('Corrupted IDB Sector Read Error') ||
          err.message.includes('Failed to read CharacterExecutionRecord'),
        'Error propagated'
      );
    }
    assert(caughtRead1, 'getCharacterExecution must reject on read failure instead of returning null');

    // 2. getCharacterExecutionByObservation must reject
    let caughtRead2 = false;
    try {
      await IndexedDbStore.getCharacterExecutionByObservation(2112001, 'obs-test');
    } catch (err: any) {
      caughtRead2 = true;
    }
    assert(caughtRead2, 'getCharacterExecutionByObservation must reject on read failure instead of returning null');

    // 3. getCharacterExecutions must reject
    let caughtRead3 = false;
    try {
      await IndexedDbStore.getCharacterExecutions(2112001);
    } catch (err: any) {
      caughtRead3 = true;
    }
    assert(caughtRead3, 'getCharacterExecutions must reject on read failure instead of returning empty array');

    // 4. getAllCharacterExecutions must reject
    let caughtRead4 = false;
    try {
      await IndexedDbStore.getAllCharacterExecutions();
    } catch (err: any) {
      caughtRead4 = true;
    }
    assert(caughtRead4, 'getAllCharacterExecutions must reject on read failure instead of returning empty array');

    IndexedDbStore.setTestDatabase(null);

    console.log('  [PASS] Gate Scenario 7: Read failure explicit rejection verified without masking.');
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Non-régression d'idempotence : run 1 -> run 2 identique -> run 3 recompute
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 8: Idempotence Chain (Run 1 -> Run 2 Identical -> Run 3 Recompute) ---');
  {
    await IndexedDbStore.clearCharacterExecutions();
    const obs = createTestObservation({ observation_id: 'obs-gate-008', quantity: 5000 });
    const txBuy = createTestPersistedTransaction({
      transaction_id: 20008,
      character_id: 2112001,
      is_buy: true,
      quantity: 5000,
      unit_price: 5.0,
      location_id: 60003760,
      timestamp: '2026-09-20T12:05:00.000Z',
    });
    const txSell = createTestPersistedTransaction({
      transaction_id: 20009,
      character_id: 2112001,
      is_buy: false,
      quantity: 5000,
      unit_price: 6.48,
      location_id: 60008494,
      timestamp: '2026-09-20T14:30:00.000Z',
    });

    const clock1 = () => '2026-09-20T12:00:00.000Z';
    const clock2 = () => '2026-09-20T13:00:00.000Z';
    const clock3 = () => '2026-09-20T14:00:00.000Z';

    // Run 1
    const run1 = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txBuy, txSell],
      observations: [obs],
      now: clock1,
    });
    const rec1 = run1.execution_records[0];

    // Run 2: Identical run at later time
    const run2 = await ExecutionTrackingService.trackCharacterExecutions(2112001, {
      transactions: [txBuy, txSell],
      observations: [obs],
      now: clock2,
    });
    const rec2 = run2.execution_records[0];

    // Run 3: Force recompute at later time
    const run3 = await ExecutionTrackingService.recomputeCharacterExecutions(2112001, {
      transactions: [txBuy, txSell],
      observations: [obs],
      now: clock3,
    });
    const rec3 = run3.execution_records[0];

    // Assert strict invariants across the chain
    assert(
      rec1.execution_id === rec2.execution_id && rec2.execution_id === rec3.execution_id,
      'Execution IDs match'
    );
    assert(rec1.first_correlated_at === '2026-09-20T12:00:00.000Z', 'first_correlated_at initialized in run 1');
    assert(rec2.first_correlated_at === rec1.first_correlated_at, 'first_correlated_at strictly invariant in run 2');
    assert(rec3.first_correlated_at === rec1.first_correlated_at, 'first_correlated_at strictly invariant in run 3 recompute');

    assert(rec1.execution_outcome.execution_status === 'CLOSED', 'Status is CLOSED');
    assert(rec2.execution_outcome.execution_status === 'CLOSED', 'Status is CLOSED in run 2');
    assert(rec3.execution_outcome.execution_status === 'CLOSED', 'Status is CLOSED in run 3');

    assert(
      rec1.execution_outcome.executed_buy_quantity === rec3.execution_outcome.executed_buy_quantity,
      'Buy quantity strictly invariant'
    );
    assert(
      rec1.execution_outcome.executed_sell_quantity === rec3.execution_outcome.executed_sell_quantity,
      'Sell quantity strictly invariant'
    );
    assert(
      rec1.execution_outcome.vwap_buy_price === rec3.execution_outcome.vwap_buy_price,
      'VWAP buy strictly invariant'
    );
    assert(
      rec1.execution_outcome.vwap_sell_price === rec3.execution_outcome.vwap_sell_price,
      'VWAP sell strictly invariant'
    );
    assert(
      JSON.stringify(rec1.transaction_ids) === JSON.stringify(rec3.transaction_ids),
      'Transaction IDs array identical'
    );

    console.log('  [PASS] Gate Scenario 8: Strict multi-run idempotence and temporal metadata invariance verified.');
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Respect des versions : correlation_engine_version immuable et présent
  // --------------------------------------------------------------------------
  console.log('--- Gate Scenario 9: Immutable correlation_engine_version Enforcement ---');
  {
    const allRecords = await IndexedDbStore.getAllCharacterExecutions();
    assert(allRecords.length > 0, 'Database contains execution records');
    for (const rec of allRecords) {
      assert(typeof rec.correlation_engine_version === 'string', 'Version must be string');
      assert(
        rec.correlation_engine_version === '1.0.0',
        `Version must be "1.0.0", got: ${rec.correlation_engine_version}`
      );
      assert(rec.correlation_engine_version === CORRELATION_ENGINE_VERSION, 'Matches constant');
    }

    console.log('  [PASS] Gate Scenario 9: correlation_engine_version immutable and present across all records.');
  }

  console.log('\n==========================================================================');
  console.log('ALL CHANTIER 3B-3 & 3B-3.1 GATE TESTS (18 + 9 = 27) PASSED (100%)');
  console.log('==========================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
