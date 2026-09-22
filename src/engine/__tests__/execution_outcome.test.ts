/**
 * EVE Trade — Phase 2B: Execution Outcome Engine Tests (Chantier 1)
 *
 * Verifies mathematical contracts, edge cases, invariants, status transitions,
 * VWAP calculations, fill ratios, timestamp bounds, non-mutation, and determinism.
 */

import {
  calculateExecutionOutcome,
  calculateVwap,
  extractTransactionTimestampBounds,
  determineExecutionStatus,
} from '../executionOutcome';
import { ExecutionTransactionRef } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runAllExecutionOutcomeTests() {
  console.log('=== RUNNING PHASE 2B: EXECUTION OUTCOME ENGINE TESTS ===');

  // Helper factory for test transactions
  const createTx = (
    transaction_id: number,
    quantity: number,
    unit_price: number,
    is_buy: boolean,
    timestamp: string,
    order_id?: string
  ): ExecutionTransactionRef => ({
    transaction_id,
    order_id,
    character_id: 99991234,
    type_id: 34, // Tritanium
    location_id: 60003760, // Jita 4-4
    is_buy,
    quantity,
    unit_price,
    timestamp,
  });

  // -------------------------------------------------------------
  // SUITE 1: Quantities & Basic Aggregations
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Quantities & Basic Aggregations ---');

  // Case 1.1: No transactions
  {
    const outcome = calculateExecutionOutcome(1000, [], []);
    assert(outcome.executed_buy_quantity === 0, 'No buy tx -> executed_buy_quantity === 0');
    assert(outcome.executed_sell_quantity === 0, 'No sell tx -> executed_sell_quantity === 0');
    assert(outcome.remaining_inventory_quantity === 0, 'No tx -> inventory === 0');
    assert(outcome.execution_status === 'PLANNED', 'No tx -> status === PLANNED');
    assert(outcome.match_level === 'UNMATCHED', 'No tx -> match_level === UNMATCHED');
    assert(outcome.has_inventory_inconsistency === false, 'No inconsistency when empty');
    console.log('  [PASS] Empty transactions handle correctly as PLANNED/UNMATCHED');
  }

  // Case 1.2: Partial Buy
  {
    const buyTxs = [createTx(1, 300, 10.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(1000, buyTxs, []);
    assert(outcome.executed_buy_quantity === 300, 'Partial buy: 300 units');
    assert(outcome.executed_sell_quantity === 0, 'No sell tx -> 0');
    assert(outcome.remaining_inventory_quantity === 300, 'Remaining inventory should be 300');
    assert(outcome.execution_status === 'BUY_PARTIAL', '300/1000 -> BUY_PARTIAL');
    assert(Math.abs(outcome.buy_fill_ratio - 0.3) < 1e-6, 'buy_fill_ratio is 0.3 (30%)');
    assert(outcome.sell_fill_ratio === 0, 'sell_fill_ratio is 0');
    console.log('  [PASS] Partial buy handled correctly');
  }

  // Case 1.3: Multiple Buys (Complete Buy)
  {
    const buyTxs = [
      createTx(1, 400, 10.0, true, '2026-09-20T10:00:00Z'),
      createTx(2, 600, 12.0, true, '2026-09-20T11:00:00Z'),
    ];
    const outcome = calculateExecutionOutcome(1000, buyTxs, []);
    assert(outcome.executed_buy_quantity === 1000, 'Sum of buy quantities = 1000');
    assert(outcome.remaining_inventory_quantity === 1000, 'Inventory = 1000');
    assert(outcome.execution_status === 'BUY_FILLED', '1000/1000 -> BUY_FILLED');
    assert(Math.abs(outcome.buy_fill_ratio - 1.0) < 1e-6, 'buy_fill_ratio is 1.0');
    console.log('  [PASS] Multiple buys aggregated to BUY_FILLED');
  }

  // Case 1.4: Buy Filled + Partial Sell
  {
    const buyTxs = [createTx(1, 1000, 10.0, true, '2026-09-20T10:00:00Z')];
    const sellTxs = [createTx(2, 400, 15.0, false, '2026-09-20T14:00:00Z')];
    const outcome = calculateExecutionOutcome(1000, buyTxs, sellTxs);
    assert(outcome.executed_buy_quantity === 1000, 'Bought = 1000');
    assert(outcome.executed_sell_quantity === 400, 'Sold = 400');
    assert(outcome.remaining_inventory_quantity === 600, 'Remaining inventory = 600');
    assert(outcome.execution_status === 'SELL_PARTIAL', '1000 bought, 400 sold -> SELL_PARTIAL');
    assert(Math.abs(outcome.sell_fill_ratio - 0.4) < 1e-6, 'sell_fill_ratio is 0.4');
    console.log('  [PASS] Buy filled + partial sell -> SELL_PARTIAL with 600 remaining inventory');
  }

  // Case 1.5: Buy Filled + Complete Sell
  {
    const buyTxs = [createTx(1, 1000, 10.0, true, '2026-09-20T10:00:00Z')];
    const sellTxs = [
      createTx(2, 500, 15.0, false, '2026-09-20T14:00:00Z'),
      createTx(3, 500, 16.0, false, '2026-09-20T16:00:00Z'),
    ];
    const outcome = calculateExecutionOutcome(1000, buyTxs, sellTxs);
    assert(outcome.executed_buy_quantity === 1000, 'Bought = 1000');
    assert(outcome.executed_sell_quantity === 1000, 'Sold = 1000');
    assert(outcome.remaining_inventory_quantity === 0, 'Remaining inventory = 0');
    assert(outcome.execution_status === 'CLOSED', '1000 bought, 1000 sold -> CLOSED');
    assert(Math.abs(outcome.sell_fill_ratio - 1.0) < 1e-6, 'sell_fill_ratio is 1.0');
    console.log('  [PASS] Complete sell -> CLOSED');
  }

  // -------------------------------------------------------------
  // SUITE 2: Volume-Weighted Average Price (VWAP)
  // -------------------------------------------------------------
  console.log('--- Test Suite 2: Volume-Weighted Average Price (VWAP) ---');

  // Case 2.1: Spec example (100 @ 10 ISK, 200 @ 20 ISK -> VWAP = 16.666666...)
  {
    const txs = [
      createTx(1, 100, 10.0, true, '2026-09-20T10:00:00Z'),
      createTx(2, 200, 20.0, true, '2026-09-20T11:00:00Z'),
    ];
    const vwap = calculateVwap(txs);
    assert(vwap !== null, 'VWAP should not be null');
    const expectedVwap = (100 * 10.0 + 200 * 20.0) / 300;
    assert(Math.abs(vwap! - expectedVwap) < 1e-6, `VWAP should be 16.666666..., got ${vwap}`);
    console.log('  [PASS] 100@10 + 200@20 -> VWAP 16.666667 ISK exact');
  }

  // Case 2.2: Single transaction VWAP
  {
    const txs = [createTx(1, 50, 42.5, true, '2026-09-20T10:00:00Z')];
    const vwap = calculateVwap(txs);
    assert(vwap === 42.5, `Single tx VWAP must match unit price, got ${vwap}`);
    console.log('  [PASS] Single transaction VWAP matches unit price');
  }

  // Case 2.3: Empty array VWAP
  {
    const vwap = calculateVwap([]);
    assert(vwap === null, 'Empty array VWAP must be null');
    console.log('  [PASS] Empty transactions VWAP is null (no fake 0)');
  }

  // Case 2.4: Zero or negative quantity handling in VWAP
  {
    const txs = [
      createTx(1, 0, 10.0, true, '2026-09-20T10:00:00Z'),
      createTx(2, -50, 20.0, true, '2026-09-20T11:00:00Z'),
    ];
    const vwap = calculateVwap(txs);
    assert(vwap === null, 'Non-positive quantity transactions must yield null VWAP');
    console.log('  [PASS] Non-positive quantity handling returns null without division by zero');
  }

  // Case 2.5: Separate VWAP for buy and sell transactions
  {
    const buyTxs = [
      createTx(1, 100, 10.0, true, '2026-09-20T10:00:00Z'),
      createTx(2, 100, 14.0, true, '2026-09-20T11:00:00Z'),
    ];
    const sellTxs = [
      createTx(3, 50, 20.0, false, '2026-09-20T14:00:00Z'),
      createTx(4, 150, 24.0, false, '2026-09-20T15:00:00Z'),
    ];
    const outcome = calculateExecutionOutcome(200, buyTxs, sellTxs);
    assert(outcome.vwap_buy_price === 12.0, 'Buy VWAP should be 12.0');
    // Sell VWAP = (50*20 + 150*24) / 200 = (1000 + 3600) / 200 = 23.0
    assert(outcome.vwap_sell_price === 23.0, 'Sell VWAP should be 23.0');
    console.log('  [PASS] Separate buy and sell VWAPs computed accurately');
  }

  // -------------------------------------------------------------
  // SUITE 3: Fill Ratios & Mathematical Boundaries
  // -------------------------------------------------------------
  console.log('--- Test Suite 3: Fill Ratios & Mathematical Boundaries ---');

  // Case 3.1: 0% ratio
  {
    const outcome = calculateExecutionOutcome(500, [], []);
    assert(outcome.buy_fill_ratio === 0, '0% buy ratio');
    assert(outcome.sell_fill_ratio === 0, '0% sell ratio');
    console.log('  [PASS] 0% execution fill ratio verified');
  }

  // Case 3.2: 50% ratio
  {
    const buyTxs = [createTx(1, 250, 100.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(500, buyTxs, []);
    assert(Math.abs(outcome.buy_fill_ratio - 0.5) < 1e-6, '50% buy ratio');
    console.log('  [PASS] 50% execution fill ratio verified');
  }

  // Case 3.3: 100% ratio
  {
    const buyTxs = [createTx(1, 500, 100.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(500, buyTxs, []);
    assert(Math.abs(outcome.buy_fill_ratio - 1.0) < 1e-6, '100% buy ratio');
    console.log('  [PASS] 100% execution fill ratio verified');
  }

  // Case 3.4: Over-execution (e.g. bought 750 of planned 500 -> 150%)
  {
    const buyTxs = [createTx(1, 750, 100.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(500, buyTxs, []);
    assert(Math.abs(outcome.buy_fill_ratio - 1.5) < 1e-6, 'Over-execution ratio 1.5 preserved');
    assert(outcome.execution_status === 'BUY_FILLED', 'Over-execution is BUY_FILLED');
    console.log('  [PASS] Over-execution ratio > 1.0 accurately preserved without artificial clamping');
  }

  // Case 3.5: planned_quantity = 0 protection
  {
    const buyTxs = [createTx(1, 100, 10.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(0, buyTxs, []);
    assert(outcome.buy_fill_ratio === 0, 'Ratio should be 0 when planned_quantity is 0');
    assert(!Number.isNaN(outcome.buy_fill_ratio), 'Ratio must not be NaN');
    assert(Number.isFinite(outcome.buy_fill_ratio), 'Ratio must be finite');
    assert(outcome.execution_status === 'BUY_FILLED', 'Bought items with 0 planned -> BUY_FILLED');
    console.log('  [PASS] planned_quantity = 0 safely protected against NaN/Infinity');
  }

  // -------------------------------------------------------------
  // SUITE 4: Status Transitions & Ambiguity
  // -------------------------------------------------------------
  console.log('--- Test Suite 4: Status Transitions & Ambiguity ---');

  // Case 4.1: Transitions ladder
  assert(determineExecutionStatus(1000, 0, 0) === 'PLANNED', '0 bought -> PLANNED');
  assert(determineExecutionStatus(1000, 300, 0) === 'BUY_PARTIAL', '300 bought -> BUY_PARTIAL');
  assert(determineExecutionStatus(1000, 1000, 0) === 'BUY_FILLED', '1000 bought -> BUY_FILLED');
  assert(determineExecutionStatus(1000, 1000, 500) === 'SELL_PARTIAL', '1000 bought, 500 sold -> SELL_PARTIAL');
  assert(determineExecutionStatus(1000, 1000, 1000) === 'CLOSED', '1000 bought, 1000 sold -> CLOSED');
  assert(determineExecutionStatus(1000, 300, 300) === 'CLOSED', '300 bought, 300 sold -> CLOSED');
  console.log('  [PASS] Canonical status transitions verified');

  // Case 4.2: Forced status: ABANDONED
  {
    const buyTxs = [createTx(1, 200, 10.0, true, '2026-09-20T10:00:00Z')];
    const outcome = calculateExecutionOutcome(1000, buyTxs, [], { force_status: 'ABANDONED' });
    assert(outcome.execution_status === 'ABANDONED', 'Forced status ABANDONED respected');
    console.log('  [PASS] ABANDONED status override verified');
  }

  // Case 4.3: Match level: AMBIGUOUS and PROBABLE_MATCH independence
  {
    const buyTxs = [createTx(1, 300, 10.0, true, '2026-09-20T10:00:00Z')];
    const outcomeProbable = calculateExecutionOutcome(1000, buyTxs, [], {
      match_level: 'PROBABLE_MATCH',
    });
    assert(outcomeProbable.execution_status === 'BUY_PARTIAL', 'Status remains BUY_PARTIAL');
    assert(outcomeProbable.match_level === 'PROBABLE_MATCH', 'Match level is PROBABLE_MATCH');

    const outcomeAmbiguous = calculateExecutionOutcome(1000, buyTxs, [], {
      match_level: 'AMBIGUOUS',
    });
    assert(outcomeAmbiguous.execution_status === 'BUY_PARTIAL', 'Status is independent of match level');
    assert(outcomeAmbiguous.match_level === 'AMBIGUOUS', 'Match level is AMBIGUOUS');
    console.log('  [PASS] match_level is strictly independent of execution_status');
  }

  // -------------------------------------------------------------
  // SUITE 5: Timestamps & Chronological Order
  // -------------------------------------------------------------
  console.log('--- Test Suite 5: Timestamps & Chronological Bounds ---');

  // Case 5.1: Bounds extraction from multiple transactions
  {
    const txs = [
      createTx(1, 10, 10, true, '2026-09-20T12:00:00Z'),
      createTx(2, 10, 10, true, '2026-09-20T08:00:00Z'),
      createTx(3, 10, 10, true, '2026-09-20T15:30:00Z'),
    ];
    const bounds = extractTransactionTimestampBounds(txs);
    assert(bounds.first_at === '2026-09-20T08:00:00Z', 'first_at must be earliest');
    assert(bounds.last_at === '2026-09-20T15:30:00Z', 'last_at must be latest');
    assert(
      Date.parse(bounds.first_at!) <= Date.parse(bounds.last_at!),
      'first_at <= last_at invariant'
    );
    console.log('  [PASS] Timestamp bounds correctly extracted (first <= last)');
  }

  // Case 5.2: Single transaction bounds
  {
    const txs = [createTx(1, 10, 10, true, '2026-09-20T09:15:00Z')];
    const bounds = extractTransactionTimestampBounds(txs);
    assert(bounds.first_at === '2026-09-20T09:15:00Z', 'Single tx first_at matches');
    assert(bounds.last_at === '2026-09-20T09:15:00Z', 'Single tx last_at matches');
    console.log('  [PASS] Single transaction bounds equal');
  }

  // Case 5.3: Empty transactions bounds
  {
    const bounds = extractTransactionTimestampBounds([]);
    assert(bounds.first_at === null, 'Empty tx first_at is null');
    assert(bounds.last_at === null, 'Empty tx last_at is null');
    console.log('  [PASS] Empty transaction bounds return null');
  }

  // -------------------------------------------------------------
  // SUITE 6: Security, Invariants & Non-Mutation
  // -------------------------------------------------------------
  console.log('--- Test Suite 6: Security, Invariants & Non-Mutation ---');

  // Case 6.1: Non-negative inventory when sold > bought (Anomaly / Inconsistency)
  {
    const buyTxs = [createTx(1, 100, 10.0, true, '2026-09-20T10:00:00Z')];
    const sellTxs = [createTx(2, 250, 15.0, false, '2026-09-20T11:00:00Z')];
    const outcome = calculateExecutionOutcome(100, buyTxs, sellTxs);
    assert(outcome.remaining_inventory_quantity === 0, 'Inventory must be capped at 0, never negative');
    assert(outcome.has_inventory_inconsistency === true, 'Flagged as inventory inconsistency');
    assert(outcome.inconsistency_reasons?.length === 1, 'Inconsistency reason logged');
    assert(
      outcome.inconsistency_reasons![0].includes('exceeds bought quantity'),
      'Detailed inconsistency reason provided'
    );
    console.log('  [PASS] Invariant verified: remaining_inventory_quantity >= 0 (no short-selling artifact)');
  }

  // Case 6.2: Input immutability (No mutation of input arrays or transaction objects)
  {
    const buyTxs = Object.freeze([
      Object.freeze(createTx(1, 100, 10.0, true, '2026-09-20T10:00:00Z')),
      Object.freeze(createTx(2, 200, 12.0, true, '2026-09-20T11:00:00Z')),
    ]);
    const sellTxs = Object.freeze([
      Object.freeze(createTx(3, 150, 18.0, false, '2026-09-20T14:00:00Z')),
    ]);

    // Should not throw on frozen objects
    const outcome = calculateExecutionOutcome(300, buyTxs, sellTxs);

    assert(buyTxs.length === 2, 'Input buy array length unchanged');
    assert(sellTxs.length === 1, 'Input sell array length unchanged');
    assert(buyTxs[0].quantity === 100, 'Input tx object unchanged');
    assert(outcome.executed_buy_quantity === 300, 'Calculation succeeded');

    // Output should be frozen
    assert(Object.isFrozen(outcome), 'Outcome object is frozen');
    assert(Object.isFrozen(outcome.buy_transactions), 'buy_transactions is frozen');
    assert(Object.isFrozen(outcome.sell_transactions), 'sell_transactions is frozen');
    console.log('  [PASS] Strict input and output immutability verified');
  }

  // Case 6.3: Determinism (input A -> output A every time)
  {
    const buyTxs = [
      createTx(101, 500, 10.5, true, '2026-09-20T10:00:00Z', '1001'),
      createTx(102, 500, 11.0, true, '2026-09-20T12:00:00Z', '1002'),
    ];
    const sellTxs = [
      createTx(201, 400, 14.0, false, '2026-09-20T14:00:00Z', '2001'),
    ];
    const options = {
      match_level: 'DIRECT_MATCH' as const,
      candidate_observation_ids: ['obs_test_1', 'obs_test_2'],
      linked_order_ids: ['3001'],
    };

    const out1 = calculateExecutionOutcome(1000, buyTxs, sellTxs, options);
    const out2 = calculateExecutionOutcome(1000, buyTxs, sellTxs, options);

    assert(JSON.stringify(out1) === JSON.stringify(out2), 'Determinism: out1 === out2');
    assert(out1.vwap_buy_price === out2.vwap_buy_price, 'Deterministic VWAP');
    assert(out1.executed_buy_quantity === out2.executed_buy_quantity, 'Deterministic quantities');
    assert(out1.linked_order_ids.length === 4, 'Order IDs deduplicated: 1001, 1002, 2001, 3001');
    console.log('  [PASS] Deterministic calculation verified');
  }

  // Case 6.4: Zero NaN or Infinity guarantees
  {
    const outcome = calculateExecutionOutcome(0, [], [], { force_status: 'PLANNED' });
    const numericFields = [
      outcome.planned_quantity,
      outcome.executed_buy_quantity,
      outcome.executed_sell_quantity,
      outcome.remaining_inventory_quantity,
      outcome.buy_fill_ratio,
      outcome.sell_fill_ratio,
    ];
    for (const num of numericFields) {
      assert(!Number.isNaN(num), `Field value ${num} must not be NaN`);
      assert(Number.isFinite(num), `Field value ${num} must be finite`);
    }
    console.log('  [PASS] Zero NaN / Infinity guarantee verified across all numeric properties');
  }

  console.log('🎉 ALL PHASE 2B EXECUTION OUTCOME ENGINE TESTS PASSED WITH 100% SUCCESS!');
}

runAllExecutionOutcomeTests();
