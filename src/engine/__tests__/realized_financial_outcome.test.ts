/**
 * EVE Trade - Realized Financial Outcome Engine Test Suite
 * 
 * PHASE 2B — CHANTIER 3B-4A: Realized Financial Outcome Engine
 * 
 * Validates deterministic P&L, FIFO cost basis, revenue, fee estimation,
 * ROI, margin, hold time, and audit traceability from CharacterExecutionRecords.
 * 
 * 22 Mandatory Scénarios (Section 19):
 * 1. Simple buy + simple sell
 * 2. Multi-buy + single sell
 * 3. Single buy + multi-sell
 * 4. Multi-buy + multi-sell
 * 5. FIFO spanning multiple lots
 * 6. Partial sell
 * 7. Remaining inventory & cost basis
 * 8. Sell exceeding available inventory (orphan/oversold)
 * 9. Transaction prices distinct from observation prices
 * 10. Gross profit calculation
 * 11. Net profit calculation
 * 12. Estimated fees explicitly marked as estimated
 * 13. Absence of observed fees != 0 (UNAVAILABLE mode)
 * 14. Division by zero protection
 * 15. Quantity-weighted hold time
 * 16. Exact determinism
 * 17. Immutability of transactions
 * 18. Immutability of CharacterExecutionRecord
 * 19. Cross-character isolation guard
 * 20. Idempotence
 * 21. Engine version 1.0.0
 * 22. Complete FIFO traceability
 * 
 * Plus Property Invariants & Persistence Verification (Sections 20 & 18).
 */

import {
  CharacterExecutionRecord,
  ExecutionTransactionRef,
  FinancialConfig,
  OpportunityExecutionOutcome,
  PersistedCharacterTransaction,
} from '../../types';
import {
  RealizedFinancialOutcomeEngine,
  REALIZED_FINANCIAL_ENGINE_VERSION,
  CrossCharacterFinancialMappingViolationError,
} from '../realizedFinancialOutcome';
import { ExecutionTrackingService } from '../../services/executionTrackingService';
import { IndexedDbStore } from '../../services/indexedDbStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING PHASE 2B: CHANTIER 3B-4A REALIZED FINANCIAL OUTCOME ENGINE TESTS ===\n');

// --------------------------------------------------------------------------
// Fixture Helpers
// --------------------------------------------------------------------------

function createMockExecutionRecord(params: {
  characterId?: number;
  observationId?: string;
  typeId?: number;
  buyTxs?: ExecutionTransactionRef[];
  sellTxs?: ExecutionTransactionRef[];
  dataState?: 'VALID' | 'PARTIAL' | 'AMBIGUOUS';
}): CharacterExecutionRecord {
  const characterId = params.characterId ?? 2112001;
  const observationId = params.observationId ?? 'obs-test-001';
  const typeId = params.typeId ?? 34; // Tritanium
  const buyTxs = params.buyTxs ?? [];
  const sellTxs = params.sellTxs ?? [];

  const totalBuyQty = buyTxs.reduce((sum, b) => sum + b.quantity, 0);
  const totalSellQty = sellTxs.reduce((sum, s) => sum + s.quantity, 0);

  const outcome: OpportunityExecutionOutcome = Object.freeze({
    execution_status: totalSellQty >= totalBuyQty && totalBuyQty > 0 ? 'CLOSED' : 'BUY_FILLED',
    match_level: 'STRONG_MATCH',
    planned_quantity: Math.max(totalBuyQty, 1000),
    executed_buy_quantity: totalBuyQty,
    executed_sell_quantity: totalSellQty,
    remaining_inventory_quantity: Math.max(0, totalBuyQty - totalSellQty),
    buy_fill_ratio: totalBuyQty > 0 ? 1.0 : 0.0,
    sell_fill_ratio: totalBuyQty > 0 ? totalSellQty / totalBuyQty : 0.0,
    vwap_buy_price: buyTxs.length > 0 ? buyTxs[0].unit_price : null,
    vwap_sell_price: sellTxs.length > 0 ? sellTxs[0].unit_price : null,
    first_buy_at: buyTxs[0]?.timestamp ?? null,
    last_buy_at: buyTxs[buyTxs.length - 1]?.timestamp ?? null,
    first_sell_at: sellTxs[0]?.timestamp ?? null,
    last_sell_at: sellTxs[sellTxs.length - 1]?.timestamp ?? null,
    buy_transactions: Object.freeze(buyTxs),
    sell_transactions: Object.freeze(sellTxs),
    linked_order_ids: Object.freeze([]),
    candidate_observation_ids: Object.freeze([observationId]),
  });

  return Object.freeze({
    execution_id: `exec_${characterId}_${observationId}`,
    character_id: characterId,
    observation_id: observationId,
    opportunity_id: `opp_${observationId}`,
    execution_outcome: outcome,
    match_level: 'STRONG_MATCH',
    transaction_ids: Object.freeze([...buyTxs.map((b) => b.transaction_id), ...sellTxs.map((s) => s.transaction_id)]),
    first_correlated_at: '2026-09-20T10:00:00.000Z',
    last_updated_at: '2026-09-20T12:00:00.000Z',
    correlation_engine_version: '1.0.0',
    data_state: params.dataState ?? 'VALID',
  });
}

const mockFinancialConfig: Partial<FinancialConfig> = {
  accounting_level: 5,         // 3.6% Sales Tax
  broker_relations_level: 5,   // 1.5% NPC Broker Fee (standing 0)
  faction_standing: 0.0,
  corp_standing: 0.0,
  is_alpha_clone: false,
};

// --------------------------------------------------------------------------
// Test Execution Runner
// --------------------------------------------------------------------------

async function runAllTests() {
  // Test 1: Simple Buy + Simple Sell
  {
    console.log('--- Test 1: Simple Buy + Simple Sell ---');
    const buy: ExecutionTransactionRef = {
      transaction_id: 101,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 1000,
      unit_price: 100,
      timestamp: '2026-09-20T10:00:00.000Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 201,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1000,
      unit_price: 150,
      timestamp: '2026-09-20T12:00:00.000Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
      executionFeeMode: 'TAKER_TAKER',
    });

    assert(outcome.matched_quantity === 1000, 'Matched quantity must be 1000');
    assert(outcome.remaining_inventory_quantity === 0, 'Remaining inventory must be 0');
    assert(outcome.realized_acquisition_cost === 100000, 'Acquisition cost must be 100,000 ISK');
    assert(outcome.realized_revenue === 150000, 'Revenue must be 150,000 ISK');
    assert(outcome.gross_realized_profit === 50000, 'Gross profit must be 50,000 ISK');
    assert(outcome.fees.fee_mode === 'ESTIMATED', 'Fee mode must be ESTIMATED');
    assert(outcome.fees.estimated_sales_tax === 5400, 'Sales tax 3.6% of 150k = 5400 ISK');
    assert(outcome.fees.estimated_buy_broker_fee === 0, 'Taker buy broker fee = 0 ISK');
    assert(outcome.fees.estimated_sell_broker_fee === 0, 'Taker sell broker fee = 0 ISK');
    assert(outcome.net_realized_profit === 44600, 'Net profit = 50,000 - 5400 = 44,600 ISK');
    assert(outcome.roi === 0.446, 'ROI = 44,600 / 100,000 = 0.446 (44.6%)');
    assert(outcome.fifo_allocations.length === 1, 'Exactly 1 allocation');
    assert(outcome.fifo_allocations[0].hold_days === 2 / 24, 'Hold days = 2 hours = 0.0833 days');
    console.log('  [PASS] Test 1: Simple buy + simple sell validated.');
  }

  // Test 2: Multi-Buy + Single Sell (FIFO Consuming Multiple Lots)
  {
    console.log('--- Test 2: Multi-Buy + Single Sell (FIFO Consuming Multiple Lots) ---');
    const buy1: ExecutionTransactionRef = {
      transaction_id: 101,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 1000,
      unit_price: 100,
      timestamp: '2026-09-20T08:00:00.000Z',
    };
    const buy2: ExecutionTransactionRef = {
      transaction_id: 102,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 2000,
      unit_price: 120,
      timestamp: '2026-09-20T09:00:00.000Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 201,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1500,
      unit_price: 150,
      timestamp: '2026-09-20T12:00:00.000Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.matched_quantity === 1500, 'Matched 1500 units');
    assert(outcome.remaining_inventory_quantity === 1500, 'Remaining inventory 1500 units');
    assert(outcome.fifo_allocations.length === 2, '2 FIFO allocations');

    // Allocation 1: 1000 @ 100 from buy1
    assert(outcome.fifo_allocations[0].buy_transaction_id === 101, 'Alloc 1 from buy1');
    assert(outcome.fifo_allocations[0].allocated_quantity === 1000, 'Alloc 1 quantity 1000');
    assert(outcome.fifo_allocations[0].buy_unit_price === 100, 'Alloc 1 price 100');

    // Allocation 2: 500 @ 120 from buy2
    assert(outcome.fifo_allocations[1].buy_transaction_id === 102, 'Alloc 2 from buy2');
    assert(outcome.fifo_allocations[1].allocated_quantity === 500, 'Alloc 2 quantity 500');
    assert(outcome.fifo_allocations[1].buy_unit_price === 120, 'Alloc 2 price 120');

    // Cost: 1000*100 + 500*120 = 100,000 + 60,000 = 160,000 ISK
    assert(outcome.realized_acquisition_cost === 160000, 'Realized acquisition cost 160,000 ISK');
    // Revenue: 1500 * 150 = 225,000 ISK
    assert(outcome.realized_revenue === 225000, 'Realized revenue 225,000 ISK');
    // Gross profit: 225,000 - 160,000 = 65,000 ISK
    assert(outcome.gross_realized_profit === 65000, 'Gross profit 65,000 ISK');

    // Remaining cost basis: 1500 @ 120 = 180,000 ISK
    assert(outcome.remaining_inventory_cost_basis === 180000, 'Remaining inventory cost basis 180,000 ISK');
    console.log('  [PASS] Test 2: Multi-buy + single sell validated.');
  }

  // Test 3: Single Buy + Multi-Sell (Single Lot Consumed by Multiple Sells)
  {
    console.log('--- Test 3: Single Buy + Multi-Sell ---');
    const buy: ExecutionTransactionRef = {
      transaction_id: 101,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 2000,
      unit_price: 100,
      timestamp: '2026-09-20T08:00:00.000Z',
    };
    const sell1: ExecutionTransactionRef = {
      transaction_id: 201,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 500,
      unit_price: 150,
      timestamp: '2026-09-20T10:00:00.000Z',
    };
    const sell2: ExecutionTransactionRef = {
      transaction_id: 202,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1000,
      unit_price: 160,
      timestamp: '2026-09-20T12:00:00.000Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell1, sell2] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.matched_quantity === 1500, 'Matched 1500 units');
    assert(outcome.remaining_inventory_quantity === 500, '500 units remaining');
    assert(outcome.remaining_inventory_cost_basis === 50000, 'Remaining inventory cost 50,000 ISK (500 @ 100)');
    assert(outcome.fifo_allocations.length === 2, '2 allocations');
    assert(outcome.fifo_allocations[0].sell_transaction_id === 201 && outcome.fifo_allocations[0].allocated_quantity === 500, 'Alloc 1 match');
    assert(outcome.fifo_allocations[1].sell_transaction_id === 202 && outcome.fifo_allocations[1].allocated_quantity === 1000, 'Alloc 2 match');
    assert(outcome.realized_revenue === 500 * 150 + 1000 * 160, 'Revenue 235,000 ISK');
    console.log('  [PASS] Test 3: Single buy + multi-sell validated.');
  }

  // Test 4: Multi-Buy + Multi-Sell
  {
    console.log('--- Test 4: Multi-Buy + Multi-Sell ---');
    const buyA: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T08:00:00Z' };
    const buyB: ExecutionTransactionRef = { transaction_id: 102, type_id: 34, location_id: 60003760, is_buy: true, quantity: 2000, unit_price: 120, timestamp: '2026-09-20T09:00:00Z' };
    const buyC: ExecutionTransactionRef = { transaction_id: 103, type_id: 34, location_id: 60003760, is_buy: true, quantity: 3000, unit_price: 130, timestamp: '2026-09-20T10:00:00Z' };

    const sellX: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1500, unit_price: 160, timestamp: '2026-09-20T12:00:00Z' };
    const sellY: ExecutionTransactionRef = { transaction_id: 202, type_id: 34, location_id: 60003760, is_buy: false, quantity: 2500, unit_price: 170, timestamp: '2026-09-20T14:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buyA, buyB, buyC], sellTxs: [sellX, sellY] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.total_buy_quantity === 6000, 'Total buy 6000');
    assert(outcome.total_sell_quantity === 4000, 'Total sell 4000');
    assert(outcome.matched_quantity === 4000, 'Matched 4000');
    assert(outcome.remaining_inventory_quantity === 2000, 'Remaining 2000');

    // sellX (1500) -> consumes 1000 from buyA (100) + 500 from buyB (120)
    // sellY (2500) -> consumes remaining 1500 from buyB (120) + 1000 from buyC (130)
    // remaining -> 2000 from buyC (130) = 260,000 ISK
    assert(outcome.remaining_inventory_cost_basis === 260000, 'Remaining cost basis 260,000 ISK');
    assert(outcome.fifo_allocations.length === 4, '4 allocations across lots');
    console.log('  [PASS] Test 4: Multi-buy + multi-sell validated.');
  }

  // Test 5: FIFO Spanning Across 3 Different Lots
  {
    console.log('--- Test 5: FIFO Spanning Across 3 Different Lots ---');
    const buy1: ExecutionTransactionRef = { transaction_id: 1, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 10, timestamp: '2026-09-20T01:00:00Z' };
    const buy2: ExecutionTransactionRef = { transaction_id: 2, type_id: 34, location_id: 60003760, is_buy: true, quantity: 200, unit_price: 20, timestamp: '2026-09-20T02:00:00Z' };
    const buy3: ExecutionTransactionRef = { transaction_id: 3, type_id: 34, location_id: 60003760, is_buy: true, quantity: 300, unit_price: 30, timestamp: '2026-09-20T03:00:00Z' };

    const bigSell: ExecutionTransactionRef = { transaction_id: 10, type_id: 34, location_id: 60003760, is_buy: false, quantity: 450, unit_price: 50, timestamp: '2026-09-20T05:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2, buy3], sellTxs: [bigSell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.fifo_allocations.length === 3, 'Single sell generated 3 allocations');
    assert(outcome.fifo_allocations[0].allocated_quantity === 100 && outcome.fifo_allocations[0].buy_unit_price === 10, '100 @ 10');
    assert(outcome.fifo_allocations[1].allocated_quantity === 200 && outcome.fifo_allocations[1].buy_unit_price === 20, '200 @ 20');
    assert(outcome.fifo_allocations[2].allocated_quantity === 150 && outcome.fifo_allocations[2].buy_unit_price === 30, '150 @ 30');
    assert(outcome.remaining_inventory_quantity === 150, '150 remaining in buy3');
    console.log('  [PASS] Test 5: FIFO spanning across 3 lots validated.');
  }

  // Test 6: Partial Sell
  {
    console.log('--- Test 6: Partial Sell ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 400, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.matched_quantity === 400, 'Matched 400');
    assert(outcome.remaining_inventory_quantity === 600, 'Remaining 600');
    assert(outcome.realized_acquisition_cost === 40000, 'Cost 40,000 ISK');
    assert(outcome.realized_revenue === 60000, 'Revenue 60,000 ISK');
    console.log('  [PASS] Test 6: Partial sell validated.');
  }

  // Test 7: Remaining Inventory & Cost Basis
  {
    console.log('--- Test 7: Remaining Inventory & Cost Basis ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 10000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 6000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.remaining_inventory_quantity === 4000, '4000 units remaining');
    assert(outcome.remaining_inventory_cost_basis === 400000, '400,000 ISK remaining cost basis');
    assert(outcome.remaining_lots.length === 1, '1 open lot');
    assert(outcome.remaining_lots[0].remaining_quantity === 4000, 'Lot remaining 4000');
    console.log('  [PASS] Test 7: Remaining inventory & cost basis validated.');
  }

  // Test 8: Sell Exceeding Available Inventory (Orphan / Oversold)
  {
    console.log('--- Test 8: Sell Exceeding Available Inventory (Orphan / Oversold) ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1500, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.matched_quantity === 1000, 'Matched 1000 units');
    assert(outcome.unmatched_sell_quantity === 500, 'Unmatched 500 units');
    assert(outcome.has_unmatched_sell_quantity === true, 'has_unmatched_sell_quantity is true');
    assert(outcome.data_state === 'PARTIAL', 'data_state must be PARTIAL');
    assert(outcome.remaining_inventory_quantity === 0, 'Remaining inventory 0');
    assert(outcome.realized_acquisition_cost === 100000, 'Cost strictly from matched 1000 units (100k ISK)');
    assert(outcome.realized_revenue === 150000, 'Revenue strictly from matched 1000 units (150k ISK)');
    assert(outcome.state_reasons !== undefined && outcome.state_reasons.some((r) => r.includes('500 units sold exceed')), 'Explains unmatched units in reasons');
    console.log('  [PASS] Test 8: Sell exceeding available inventory validated without cost fabrication.');
  }

  // Test 9: Transaction Prices Distinct From Observation Prices
  {
    console.log('--- Test 9: Transaction Prices Distinct From Observation Prices ---');
    // Observation might have expected buy: 90, sell: 160
    // Realized actual transactions: buy @ 100, sell @ 150
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.realized_acquisition_cost === 100000, 'Uses executed unit price 100, not observation price');
    assert(outcome.realized_revenue === 150000, 'Uses executed unit price 150, not observation price');
    console.log('  [PASS] Test 9: Executed transaction prices used strictly.');
  }

  // Test 10: Gross Profit Calculation
  {
    console.log('--- Test 10: Gross Profit Calculation ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 500, unit_price: 200, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 500, unit_price: 350, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.gross_realized_profit === 500 * 350 - 500 * 200, 'Gross profit = 175,000 - 100,000 = 75,000 ISK');
    console.log('  [PASS] Test 10: Gross profit calculation verified.');
  }

  // Test 11: Net Profit Calculation with Fees
  {
    console.log('--- Test 11: Net Profit Calculation with Fees ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 1000, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 1500, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
      executionFeeMode: 'MAKER_MAKER',
    });

    // Buy cost: 1,000,000 ISK, broker fee 1.5% = 15,000 ISK
    // Revenue: 1,500,000 ISK, broker fee 1.5% = 22,500 ISK, sales tax 3.6% = 54,000 ISK
    // Total fees: 15,000 + 22,500 + 54,000 = 91,500 ISK
    // Gross profit: 500,000 ISK
    // Net profit: 500,000 - 91,500 = 408,500 ISK
    assert(outcome.fees.estimated_buy_broker_fee === 15000, 'Buy broker fee 15,000');
    assert(outcome.fees.estimated_sell_broker_fee === 22500, 'Sell broker fee 22,500');
    assert(outcome.fees.estimated_sales_tax === 54000, 'Sales tax 54,000');
    assert(outcome.fees.estimated_total_fees === 91500, 'Total fees 91,500');
    assert(outcome.net_realized_profit === 408500, 'Net realized profit 408,500');
    console.log('  [PASS] Test 11: Net profit calculation with fees verified.');
  }

  // Test 12: Estimated Fees Explicitly Marked
  {
    console.log('--- Test 12: Estimated Fees Explicitly Marked ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 100, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcome.fees.fee_mode === 'ESTIMATED', 'fee_mode === ESTIMATED');
    assert(outcome.fees.fee_source === 'CONFIG_ESTIMATE', 'fee_source === CONFIG_ESTIMATE');
    assert(outcome.fees.observed_fees_paid === undefined, 'No fake observed_fees_paid fabricated');
    console.log('  [PASS] Test 12: Fee provenance cleanly marked as ESTIMATED.');
  }

  // Test 13: Absence of Observed Fees != 0 (UNAVAILABLE Mode)
  {
    console.log('--- Test 13: Absence of Observed Fees != 0 (UNAVAILABLE Mode) ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 100, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    // Run WITHOUT financial config
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {});

    assert(outcome.fees.fee_mode === 'UNAVAILABLE', 'fee_mode === UNAVAILABLE');
    assert(outcome.fees.fee_source === 'UNAVAILABLE', 'fee_source === UNAVAILABLE');
    assert(outcome.data_state === 'PARTIAL', 'data_state is marked PARTIAL due to unavailable fees');
    assert(outcome.state_reasons !== undefined && outcome.state_reasons.some((r) => r.includes('Fee configuration is unavailable')), 'State reasons explain fee absence');
    console.log('  [PASS] Test 13: UNAVAILABLE fee mode handled cleanly.');
  }

  // Test 14: Division by Zero Protection
  {
    console.log('--- Test 14: Division by Zero Protection ---');
    // Case 1: Zero buy, zero sell
    const emptyRecord = createMockExecutionRecord({ buyTxs: [], sellTxs: [] });
    const outcomeEmpty = RealizedFinancialOutcomeEngine.calculate(emptyRecord, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcomeEmpty.roi === 0.0, 'ROI is 0.0 on empty');
    assert(outcomeEmpty.margin === 0.0, 'Margin is 0.0 on empty');
    assert(outcomeEmpty.profit_per_unit === 0.0, 'Profit per unit is 0.0 on empty');
    assert(!isNaN(outcomeEmpty.roi) && isFinite(outcomeEmpty.roi), 'ROI is finite');
    assert(!isNaN(outcomeEmpty.margin) && isFinite(outcomeEmpty.margin), 'Margin is finite');

    // Case 2: Free items (unit price 0)
    const freeBuy: ExecutionTransactionRef = { transaction_id: 1, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 0, timestamp: '2026-09-20T10:00:00Z' };
    const freeSell: ExecutionTransactionRef = { transaction_id: 2, type_id: 34, location_id: 60003760, is_buy: false, quantity: 100, unit_price: 0, timestamp: '2026-09-20T12:00:00Z' };
    const freeRecord = createMockExecutionRecord({ buyTxs: [freeBuy], sellTxs: [freeSell] });
    const outcomeFree = RealizedFinancialOutcomeEngine.calculate(freeRecord, { financialConfig: mockFinancialConfig });

    assert(outcomeFree.roi === 0.0, 'ROI is 0.0 when cost is 0');
    assert(outcomeFree.margin === 0.0, 'Margin is 0.0 when revenue is 0');
    console.log('  [PASS] Test 14: Division by zero protection verified.');
  }

  // Test 15: Quantity-Weighted Hold Time
  {
    console.log('--- Test 15: Quantity-Weighted Hold Time ---');
    // Buy 1: 1000 units at T0 (2026-09-20T00:00:00Z)
    // Buy 2: 3000 units at T0 + 10 hours (2026-09-20T10:00:00Z)
    // Sell: 4000 units at T0 + 20 hours (2026-09-20T20:00:00Z)
    // Average weighted buy time: (1000 * 0h + 3000 * 10h) / 4000 = 30000 / 4000 = 7.5 hours
    // Sell time: 20 hours
    // Weighted hold duration: 20h - 7.5h = 12.5 hours = 0.520833 days
    const buy1: ExecutionTransactionRef = { transaction_id: 1, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T00:00:00.000Z' };
    const buy2: ExecutionTransactionRef = { transaction_id: 2, type_id: 34, location_id: 60003760, is_buy: true, quantity: 3000, unit_price: 100, timestamp: '2026-09-20T10:00:00.000Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 3, type_id: 34, location_id: 60003760, is_buy: false, quantity: 4000, unit_price: 150, timestamp: '2026-09-20T20:00:00.000Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, {
      financialConfig: mockFinancialConfig,
    });

    const expectedHoldMs = 12.5 * 3600 * 1000;
    assert(Math.abs(outcome.weighted_hold_ms - expectedHoldMs) < 1000, 'Hold ms matches 12.5h');
    assert(Math.abs(outcome.weighted_hold_days - 12.5 / 24) < 0.0001, 'Hold days matches 12.5/24');
    assert(outcome.weighted_buy_timestamp === '2026-09-20T07:30:00.000Z', 'Weighted buy timestamp is 07:30 UTC');
    console.log('  [PASS] Test 15: Quantity-weighted hold time verified.');
  }

  // Test 16: Exact Determinism
  {
    console.log('--- Test 16: Exact Determinism ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const run1 = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });
    const run2 = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(JSON.stringify(run1) === JSON.stringify(run2), 'Runs produce byte-identical JSON strings');
    console.log('  [PASS] Test 16: Exact determinism verified.');
  }

  // Test 17: Immutability of Transactions
  {
    console.log('--- Test 17: Immutability of Transactions ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const buyJsonBefore = JSON.stringify(buy);
    const sellJsonBefore = JSON.stringify(sell);

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(JSON.stringify(buy) === buyJsonBefore, 'Buy transaction was not mutated');
    assert(JSON.stringify(sell) === sellJsonBefore, 'Sell transaction was not mutated');
    console.log('  [PASS] Test 17: Transaction immutability verified.');
  }

  // Test 18: Immutability of CharacterExecutionRecord
  {
    console.log('--- Test 18: Immutability of CharacterExecutionRecord ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const recordJsonBefore = JSON.stringify(record);

    RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(JSON.stringify(record) === recordJsonBefore, 'CharacterExecutionRecord was not mutated');
    console.log('  [PASS] Test 18: Execution record immutability verified.');
  }

  // Test 19: Cross-Character Isolation Guard
  {
    console.log('--- Test 19: Cross-Character Isolation Guard ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const record = createMockExecutionRecord({ characterId: 2112001, buyTxs: [buy] });

    // Inject external transaction belonging to Char B (2112002)
    const foreignTx: PersistedCharacterTransaction = {
      transaction_id: 999,
      character_id: 2112002, // Foreign!
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1000,
      unit_price: 150,
      timestamp: '2026-09-20T12:00:00Z',
      client_id: 1,
      first_seen_at: '2026-09-20T12:00:00Z',
      last_seen_at: '2026-09-20T12:00:00Z',
      source: 'ESI',
      source_endpoint: '/test',
      ingestion_version: '1.0.0',
      data_state: 'VALID',
    };

    let caughtError = false;
    try {
      RealizedFinancialOutcomeEngine.calculate(record, {
        transactions: [foreignTx],
      });
    } catch (err) {
      if (err instanceof CrossCharacterFinancialMappingViolationError) {
        caughtError = true;
      }
    }

    assert(caughtError, 'CrossCharacterFinancialMappingViolationError must be thrown on foreign transaction');
    console.log('  [PASS] Test 19: Cross-character isolation guard verified.');
  }

  // Test 20: Idempotence
  {
    console.log('--- Test 20: Idempotence ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const res1 = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });
    const res2 = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });
    const res3 = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(res1.net_realized_profit === res2.net_realized_profit && res2.net_realized_profit === res3.net_realized_profit, 'Net profit invariant across 3 runs');
    assert(res1.roi === res3.roi, 'ROI invariant across runs');
    console.log('  [PASS] Test 20: Strict idempotence verified.');
  }

  // Test 21: Engine Version 1.0.0
  {
    console.log('--- Test 21: Engine Version 1.0.0 ---');
    const buy: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const record = createMockExecutionRecord({ buyTxs: [buy] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record);

    assert(REALIZED_FINANCIAL_ENGINE_VERSION === '1.0.0', 'REALIZED_FINANCIAL_ENGINE_VERSION === 1.0.0');
    assert(outcome.realized_financial_engine_version === '1.0.0', 'Outcome version is 1.0.0');
    console.log('  [PASS] Test 21: Engine version 1.0.0 verified.');
  }

  // Test 22: Complete FIFO Traceability
  {
    console.log('--- Test 22: Complete FIFO Traceability ---');
    const buy1: ExecutionTransactionRef = { transaction_id: 40001, type_id: 34, location_id: 60003760, is_buy: true, quantity: 1000, unit_price: 100, timestamp: '2026-09-20T08:00:00Z' };
    const buy2: ExecutionTransactionRef = { transaction_id: 40002, type_id: 34, location_id: 60003760, is_buy: true, quantity: 500, unit_price: 120, timestamp: '2026-09-20T09:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 50001, type_id: 34, location_id: 60003760, is_buy: false, quantity: 1500, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(outcome.fifo_allocations.length === 2, '2 allocations tracked');
    const alloc1 = outcome.fifo_allocations[0];
    const alloc2 = outcome.fifo_allocations[1];

    assert(alloc1.sell_transaction_id === 50001 && alloc1.buy_transaction_id === 40001, 'Alloc 1: SELL 50001 <- BUY 40001');
    assert(alloc1.allocated_quantity === 1000 && alloc1.buy_unit_price === 100, 'Alloc 1: 1000 units @ 100');
    assert(alloc2.sell_transaction_id === 50001 && alloc2.buy_transaction_id === 40002, 'Alloc 2: SELL 50001 <- BUY 40002');
    assert(alloc2.allocated_quantity === 500 && alloc2.buy_unit_price === 120, 'Alloc 2: 500 units @ 120');
    console.log('  [PASS] Test 22: Complete FIFO traceability verified.');
  }

  // --------------------------------------------------------------------------
  // Property Invariants (Section 20)
  // --------------------------------------------------------------------------
  console.log('\n--- Property Invariants Verification (Section 20) ---');
  {
    // Run 50 randomized configurations
    for (let run = 0; run < 50; run++) {
      const numBuys = 1 + Math.floor(Math.random() * 5);
      const numSells = 1 + Math.floor(Math.random() * 5);

      const buyTxs: ExecutionTransactionRef[] = [];
      let curTime = 1758360000000;
      for (let b = 0; b < numBuys; b++) {
        curTime += 60000;
        buyTxs.push({
          transaction_id: 1000 + b,
          type_id: 34,
          location_id: 60003760,
          is_buy: true,
          quantity: 100 + Math.floor(Math.random() * 5000),
          unit_price: 50 + Math.floor(Math.random() * 200),
          timestamp: new Date(curTime).toISOString(),
        });
      }

      const sellTxs: ExecutionTransactionRef[] = [];
      for (let s = 0; s < numSells; s++) {
        curTime += 60000;
        sellTxs.push({
          transaction_id: 2000 + s,
          type_id: 34,
          location_id: 60003760,
          is_buy: false,
          quantity: 100 + Math.floor(Math.random() * 5000),
          unit_price: 100 + Math.floor(Math.random() * 300),
          timestamp: new Date(curTime).toISOString(),
        });
      }

      const record = createMockExecutionRecord({ buyTxs, sellTxs });
      const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

      const totalBuyQty = buyTxs.reduce((sum, b) => sum + b.quantity, 0);
      const totalSellQty = sellTxs.reduce((sum, s) => sum + s.quantity, 0);

      // Invariant 1: matched_quantity <= total_buy_quantity
      assert(outcome.matched_quantity <= totalBuyQty, `Invariant 1 failed on run ${run}`);

      // Invariant 2: matched_quantity + remaining_inventory_quantity === total_buy_quantity
      assert(
        outcome.matched_quantity + outcome.remaining_inventory_quantity === totalBuyQty,
        `Invariant 2 failed on run ${run}: ${outcome.matched_quantity} + ${outcome.remaining_inventory_quantity} !== ${totalBuyQty}`
      );

      // Invariant 3: total_sell_quantity === matched_quantity + unmatched_sell_quantity
      assert(
        totalSellQty === outcome.matched_quantity + outcome.unmatched_sell_quantity,
        `Invariant 3 failed on run ${run}`
      );

      // Invariant 4: For each allocation: allocated_quantity > 0, gross_cost >= 0, gross_revenue >= 0
      for (const a of outcome.fifo_allocations) {
        assert(a.allocated_quantity > 0, 'Invariant 4: allocated_quantity > 0');
        assert(a.gross_cost >= 0, 'Invariant 4: gross_cost >= 0');
        assert(a.gross_revenue >= 0, 'Invariant 4: gross_revenue >= 0');
        assert(a.hold_duration_ms >= 0, 'Invariant 4: hold_duration_ms >= 0');
      }

      // Invariant 5: No buy transaction provides more units than its initial quantity
      const buyAllocMap = new Map<number, number>();
      for (const a of outcome.fifo_allocations) {
        buyAllocMap.set(a.buy_transaction_id, (buyAllocMap.get(a.buy_transaction_id) || 0) + a.allocated_quantity);
      }
      for (const b of buyTxs) {
        const allocated = buyAllocMap.get(b.transaction_id) || 0;
        assert(allocated <= b.quantity, `Invariant 5 failed: lot ${b.transaction_id} over-consumed`);
      }

      // Invariant 6: Realized acquisition cost === sum(alloc.gross_cost)
      const sumGrossCost = Math.round(outcome.fifo_allocations.reduce((s, a) => s + a.gross_cost, 0) * 100) / 100;
      assert(outcome.realized_acquisition_cost === sumGrossCost, 'Invariant 6 failed: cost matches sum of allocations');

      // Invariant 7: Realized revenue === sum(alloc.gross_revenue)
      const sumGrossRev = Math.round(outcome.fifo_allocations.reduce((s, a) => s + a.gross_revenue, 0) * 100) / 100;
      assert(outcome.realized_revenue === sumGrossRev, 'Invariant 7 failed: revenue matches sum of allocations');

      // Invariant 8: Remaining inventory cost basis === sum(lot.total_remaining_cost)
      const sumRemCost = Math.round(outcome.remaining_lots.reduce((s, l) => s + l.total_remaining_cost, 0) * 100) / 100;
      assert(outcome.remaining_inventory_cost_basis === sumRemCost, 'Invariant 8 failed: remaining cost basis matches lots');
    }
    console.log('  [PASS] 50 randomized multi-lot property invariant stress runs passed (100%).');
  }

  // --------------------------------------------------------------------------
  // Persistence & Storage Integration Test (Section 18)
  // --------------------------------------------------------------------------
  console.log('\n--- Persistence Integration Verification (Section 18) ---');
  {
    const characterId = 2112001;
    const observationId = 'obs-persist-001';

    const buy: ExecutionTransactionRef = { transaction_id: 801, type_id: 34, location_id: 60003760, is_buy: true, quantity: 2000, unit_price: 100, timestamp: '2026-09-20T10:00:00Z' };
    const sell: ExecutionTransactionRef = { transaction_id: 901, type_id: 34, location_id: 60003760, is_buy: false, quantity: 2000, unit_price: 150, timestamp: '2026-09-20T12:00:00Z' };

    const initialRecord = createMockExecutionRecord({
      characterId,
      observationId,
      buyTxs: [buy],
      sellTxs: [sell],
    });

    // Save initial record to IndexedDB
    await IndexedDbStore.saveCharacterExecution(initialRecord);

    // Calculate and persist outcome via ExecutionTrackingService
    const updatedRecord = await ExecutionTrackingService.calculateAndPersistRealizedOutcome(
      characterId,
      observationId,
      {
        financialConfig: mockFinancialConfig,
      }
    );

    assert(updatedRecord !== null, 'Updated record returned');
    assert(updatedRecord?.realized_financial_outcome !== undefined, 'Outcome attached');
    assert(updatedRecord?.realized_financial_outcome?.net_realized_profit !== undefined, 'Net profit calculated');

    // Retrieve from IndexedDB store to verify durable persistence
    const loaded = await IndexedDbStore.getCharacterExecutionByObservation(characterId, observationId);
    assert(loaded !== null, 'Loaded from IndexedDB');
    assert(loaded?.realized_financial_outcome !== undefined, 'Persisted outcome present in IndexedDB');
    assert(loaded?.realized_financial_outcome?.realized_financial_engine_version === '1.0.0', 'Engine version 1.0.0 persisted');
    assert(loaded?.realized_financial_outcome?.gross_realized_profit === 100000, 'Gross profit 100,000 ISK persisted');
    assert(loaded?.character_id === characterId, 'Character ID preserved in store');

    console.log('  [PASS] Persistence integration and durable retrieval verified.');
  }

  // ==========================================================================
  // CHANTIER 3B-4A.1: FINANCIAL CORRECTNESS GATE (CASES A TO F & ADVERSARIAL)
  // ==========================================================================
  console.log('\n==========================================================================');
  console.log('--- RUNNING CHANTIER 3B-4A.1 FINANCIAL CORRECTNESS GATE (CASES A -> F) ---');
  console.log('==========================================================================');

  // Cas A: FIFO classique (nominal)
  {
    console.log('\n--- Cas A: FIFO classique (nominal) ---');
    const buy: ExecutionTransactionRef = {
      transaction_id: 1001,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 10.0,
      timestamp: '2026-09-20T10:00:00Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 2001,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 100,
      unit_price: 20.0,
      timestamp: '2026-09-20T11:00:00Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(outcome.matched_quantity === 100, 'Cas A: 100 matched quantity');
    assert(outcome.unmatched_sell_quantity === 0, 'Cas A: 0 unmatched sell quantity');
    assert(outcome.has_unmatched_sell_quantity === false, 'Cas A: has_unmatched_sell_quantity is false');
    assert(outcome.remaining_inventory_quantity === 0, 'Cas A: 0 remaining inventory');
    assert(outcome.realized_acquisition_cost === 1000.0, 'Cas A: 1,000 ISK acquisition cost');
    assert(outcome.realized_revenue === 2000.0, 'Cas A: 2,000 ISK revenue');
    assert(outcome.gross_realized_profit === 1000.0, 'Cas A: 1,000 ISK gross profit');
    assert(outcome.realized_gross === 1000.0, 'Cas A: realized_gross matches gross profit');
    assert(outcome.data_state === 'VALID', 'Cas A: data_state is VALID');
    assert(outcome.financial_completeness === 'ESTIMATED', 'Cas A: financial_completeness is ESTIMATED with config');
    assert(outcome.is_net_estimated === true, 'Cas A: is_net_estimated is true');
    assert(outcome.is_financially_complete === false, 'Cas A: is_financially_complete is false (estimated != observed)');
    assert(outcome.fifo_allocations.length === 1, 'Cas A: 1 FIFO allocation');
    assert(outcome.fifo_allocations[0].allocated_quantity === 100, 'Cas A: allocation quantity 100');
    assert(outcome.fifo_allocations[0].gross_cost === 1000.0, 'Cas A: gross cost 1,000');
    assert(outcome.fifo_allocations[0].gross_revenue === 2000.0, 'Cas A: gross revenue 2,000');
    assert(outcome.fifo_allocations[0].gross_profit === 1000.0, 'Cas A: gross profit 1,000');
    assert(outcome.fifo_allocations[0].hold_days > 0, 'Cas A: positive hold duration');
    console.log('  [PASS] Cas A: FIFO classique verified.');
  }

  // Cas B: Vente avant achat (Causal FIFO Enforcement)
  {
    console.log('\n--- Cas B: Vente avant achat (Causal FIFO Enforcement) ---');
    const sell: ExecutionTransactionRef = {
      transaction_id: 2002,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 100,
      unit_price: 20.0,
      timestamp: '2026-09-20T10:00:00Z', // 10:00 SELL
    };
    const buy: ExecutionTransactionRef = {
      transaction_id: 1002,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 10.0,
      timestamp: '2026-09-20T11:00:00Z', // 11:00 BUY (occurs after SELL)
    };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    // CAUSAL INVARIANT: The sell at 10:00 CANNOT consume the buy at 11:00!
    assert(outcome.matched_quantity === 0, 'Cas B: 0 matched quantity (sell before buy)');
    assert(outcome.unmatched_sell_quantity === 100, 'Cas B: 100 unmatched sell quantity');
    assert(outcome.has_unmatched_sell_quantity === true, 'Cas B: has_unmatched_sell_quantity is true');
    assert(outcome.remaining_inventory_quantity === 100, 'Cas B: 100 remaining buy inventory');
    assert(outcome.remaining_inventory_cost_basis === 1000.0, 'Cas B: remaining buy inventory basis preserved at 1,000 ISK');
    assert(outcome.realized_acquisition_cost === 0.0, 'Cas B: ZERO cost fabrication (realizedAcquisitionCost === 0)');
    assert(outcome.realized_revenue === 0.0, 'Cas B: realized revenue === 0');
    assert(outcome.gross_realized_profit === 0.0, 'Cas B: gross realized profit === 0');
    assert(outcome.data_state === 'PARTIAL', 'Cas B: data_state is strictly PARTIAL');
    assert(outcome.financial_completeness === 'PARTIAL', 'Cas B: financial_completeness is PARTIAL');
    assert(outcome.fifo_allocations.length === 0, 'Cas B: 0 FIFO allocations');
    assert(outcome.state_reasons !== undefined && outcome.state_reasons.length > 0, 'Cas B: state reasons populated');
    const hasCausalReason = outcome.state_reasons?.some((r) => r.toLowerCase().includes('causal'));
    assert(hasCausalReason === true, 'Cas B: diagnostic explains causal sequence deficit');
    console.log('  [PASS] Cas B: Vente avant achat causally rejected from consumption.');
  }

  // Cas C: Vente partiellement couverte
  {
    console.log('\n--- Cas C: Vente partiellement couverte ---');
    const buy: ExecutionTransactionRef = {
      transaction_id: 1003,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 50,
      unit_price: 10.0,
      timestamp: '2026-09-20T10:00:00Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 2003,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 100,
      unit_price: 20.0,
      timestamp: '2026-09-20T11:00:00Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(outcome.matched_quantity === 50, 'Cas C: 50 matched quantity');
    assert(outcome.unmatched_sell_quantity === 50, 'Cas C: 50 unmatched sell quantity');
    assert(outcome.has_unmatched_sell_quantity === true, 'Cas C: has_unmatched_sell_quantity is true');
    assert(outcome.remaining_inventory_quantity === 0, 'Cas C: 0 remaining buy inventory');
    assert(outcome.realized_acquisition_cost === 500.0, 'Cas C: acquisition cost 500 ISK (50 * 10)');
    assert(outcome.realized_revenue === 1000.0, 'Cas C: realized revenue 1,000 ISK (50 * 20)');
    assert(outcome.gross_realized_profit === 500.0, 'Cas C: gross realized profit 500 ISK');
    assert(outcome.data_state === 'PARTIAL', 'Cas C: data_state is PARTIAL');
    assert(outcome.financial_completeness === 'PARTIAL', 'Cas C: financial_completeness is PARTIAL');
    assert(outcome.fifo_allocations.length === 1, 'Cas C: 1 FIFO allocation for covered portion');
    assert(outcome.fifo_allocations[0].allocated_quantity === 50, 'Cas C: allocated qty 50');
    console.log('  [PASS] Cas C: Vente partiellement couverte verified.');
  }

  // Cas D: FIFO multi-lots
  {
    console.log('\n--- Cas D: FIFO multi-lots ---');
    const buy1: ExecutionTransactionRef = {
      transaction_id: 1004,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 10.0,
      timestamp: '2026-09-20T10:00:00Z',
    };
    const buy2: ExecutionTransactionRef = {
      transaction_id: 1005,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 20.0,
      timestamp: '2026-09-20T11:00:00Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 2004,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 150,
      unit_price: 30.0,
      timestamp: '2026-09-20T12:00:00Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2], sellTxs: [sell] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    assert(outcome.matched_quantity === 150, 'Cas D: 150 matched quantity');
    assert(outcome.unmatched_sell_quantity === 0, 'Cas D: 0 unmatched sell quantity');
    assert(outcome.remaining_inventory_quantity === 50, 'Cas D: 50 remaining inventory in lot 2');
    assert(outcome.remaining_inventory_cost_basis === 1000.0, 'Cas D: 50 * 20 = 1,000 ISK remaining basis');
    assert(outcome.realized_acquisition_cost === 2000.0, 'Cas D: (100 * 10) + (50 * 20) = 2,000 ISK cost');
    assert(outcome.realized_revenue === 4500.0, 'Cas D: 150 * 30 = 4,500 ISK revenue');
    assert(outcome.gross_realized_profit === 2500.0, 'Cas D: 4,500 - 2,000 = 2,500 ISK gross profit');
    assert(outcome.fifo_allocations.length === 2, 'Cas D: 2 allocations');
    assert(outcome.fifo_allocations[0].buy_transaction_id === 1004 && outcome.fifo_allocations[0].allocated_quantity === 100, 'Cas D: lot 1 fully consumed');
    assert(outcome.fifo_allocations[1].buy_transaction_id === 1005 && outcome.fifo_allocations[1].allocated_quantity === 50, 'Cas D: lot 2 half consumed');
    assert(outcome.data_state === 'VALID', 'Cas D: data_state is VALID');
    console.log('  [PASS] Cas D: FIFO multi-lots verified.');
  }

  // Cas E: FIFO temporel complexe
  {
    console.log('\n--- Cas E: FIFO temporel complexe ---');
    const buy1: ExecutionTransactionRef = {
      transaction_id: 1006,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 10.0,
      timestamp: '2026-09-20T10:00:00Z',
    };
    const sell1: ExecutionTransactionRef = {
      transaction_id: 2005,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 50,
      unit_price: 20.0,
      timestamp: '2026-09-20T11:00:00Z',
    };
    const buy2: ExecutionTransactionRef = {
      transaction_id: 1007,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 100,
      unit_price: 30.0,
      timestamp: '2026-09-20T12:00:00Z',
    };
    const sell2: ExecutionTransactionRef = {
      transaction_id: 2006,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 100,
      unit_price: 40.0,
      timestamp: '2026-09-20T13:00:00Z',
    };

    const record = createMockExecutionRecord({ buyTxs: [buy1, buy2], sellTxs: [sell1, sell2] });
    const outcome = RealizedFinancialOutcomeEngine.calculate(record, { financialConfig: mockFinancialConfig });

    // Step by step:
    // Sell 1 (11:00) consumes 50 from Buy 1 (remaining in lot 1: 50)
    // Sell 2 (13:00) consumes remaining 50 from Buy 1, THEN 50 from Buy 2 (remaining in lot 2: 50)
    assert(outcome.matched_quantity === 150, 'Cas E: 150 matched quantity');
    assert(outcome.unmatched_sell_quantity === 0, 'Cas E: 0 unmatched sell');
    assert(outcome.remaining_inventory_quantity === 50, 'Cas E: 50 units remaining in lot 2');
    assert(outcome.remaining_inventory_cost_basis === 1500.0, 'Cas E: 50 * 30 = 1,500 ISK remaining basis');
    assert(outcome.fifo_allocations.length === 3, 'Cas E: exactly 3 allocations');
    // Allocation 1: sell1 <- buy1 (50 units @ 10)
    assert(outcome.fifo_allocations[0].sell_transaction_id === 2005 && outcome.fifo_allocations[0].buy_transaction_id === 1006, 'Cas E: Alloc 1 sell1 <- buy1');
    assert(outcome.fifo_allocations[0].allocated_quantity === 50 && outcome.fifo_allocations[0].buy_unit_price === 10.0, 'Cas E: Alloc 1 50 @ 10');
    // Allocation 2: sell2 <- buy1 (remaining 50 units @ 10)
    assert(outcome.fifo_allocations[1].sell_transaction_id === 2006 && outcome.fifo_allocations[1].buy_transaction_id === 1006, 'Cas E: Alloc 2 sell2 <- buy1 (residual)');
    assert(outcome.fifo_allocations[1].allocated_quantity === 50 && outcome.fifo_allocations[1].buy_unit_price === 10.0, 'Cas E: Alloc 2 50 @ 10');
    // Allocation 3: sell2 <- buy2 (50 units @ 30)
    assert(outcome.fifo_allocations[2].sell_transaction_id === 2006 && outcome.fifo_allocations[2].buy_transaction_id === 1007, 'Cas E: Alloc 3 sell2 <- buy2');
    assert(outcome.fifo_allocations[2].allocated_quantity === 50 && outcome.fifo_allocations[2].buy_unit_price === 30.0, 'Cas E: Alloc 3 50 @ 30');

    // Total cost: (50 * 10) + (50 * 10) + (50 * 30) = 500 + 500 + 1500 = 2,500 ISK
    assert(outcome.realized_acquisition_cost === 2500.0, 'Cas E: 2,500 ISK realized cost');
    // Total revenue: (50 * 20) + (100 * 40) = 1,000 + 4,000 = 5,000 ISK
    assert(outcome.realized_revenue === 5000.0, 'Cas E: 5,000 ISK realized revenue');
    assert(outcome.gross_realized_profit === 2500.0, 'Cas E: 2,500 ISK gross profit');
    assert(outcome.data_state === 'VALID', 'Cas E: data_state is VALID');
    console.log('  [PASS] Cas E: FIFO temporel complexe verified.');
  }

  // Cas F: Timestamp identique & Tie-breaker (transaction_id ASC)
  {
    console.log('\n--- Cas F: Timestamp identique & Tie-breaker (transaction_id ASC) ---');
    const sameTimestamp = '2026-09-20T10:00:00Z';

    // Subcase F1: Multiple buys with same timestamp consumed in transaction_id ASC order
    const buyLowTx: ExecutionTransactionRef = {
      transaction_id: 1010,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 50,
      unit_price: 10.0,
      timestamp: sameTimestamp,
    };
    const buyHighTx: ExecutionTransactionRef = {
      transaction_id: 1020,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 50,
      unit_price: 15.0,
      timestamp: sameTimestamp,
    };
    const sellTx: ExecutionTransactionRef = {
      transaction_id: 1030,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 50,
      unit_price: 20.0,
      timestamp: sameTimestamp,
    };

    const recordF1 = createMockExecutionRecord({
      buyTxs: [buyHighTx, buyLowTx], // Passed unsorted intentionally
      sellTxs: [sellTx],
    });
    const outcomeF1 = RealizedFinancialOutcomeEngine.calculate(recordF1, { financialConfig: mockFinancialConfig });

    assert(outcomeF1.fifo_allocations.length === 1, 'Subcase F1: 1 allocation');
    assert(outcomeF1.fifo_allocations[0].buy_transaction_id === 1010, 'Subcase F1: tx 1010 consumed first (transaction_id ASC)');
    assert(outcomeF1.fifo_allocations[0].buy_unit_price === 10.0, 'Subcase F1: cost basis from lower tx_id lot');
    assert(outcomeF1.remaining_lots[0].buy_transaction_id === 1020, 'Subcase F1: lot 1020 remains unconsumed');

    // Subcase F2: SELL with transaction_id < BUY at same timestamp cannot consume the buy
    const earlySellSameTime: ExecutionTransactionRef = {
      transaction_id: 1005,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 50,
      unit_price: 20.0,
      timestamp: sameTimestamp,
    };
    const lateBuySameTime: ExecutionTransactionRef = {
      transaction_id: 1006,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 50,
      unit_price: 10.0,
      timestamp: sameTimestamp,
    };

    const recordF2 = createMockExecutionRecord({
      buyTxs: [lateBuySameTime],
      sellTxs: [earlySellSameTime],
    });
    const outcomeF2 = RealizedFinancialOutcomeEngine.calculate(recordF2, { financialConfig: mockFinancialConfig });

    // Causal tie-breaker: tx 1005 (sell) < tx 1006 (buy), so sell occurred before buy!
    assert(outcomeF2.matched_quantity === 0, 'Subcase F2: 0 matched (sell has lower tx_id than buy)');
    assert(outcomeF2.unmatched_sell_quantity === 50, 'Subcase F2: 50 unmatched sell');
    assert(outcomeF2.data_state === 'PARTIAL', 'Subcase F2: data_state is PARTIAL');

    // Subcase F3: BUY with transaction_id < SELL at same timestamp CAN be consumed
    const earlyBuySameTime: ExecutionTransactionRef = {
      transaction_id: 1007,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 50,
      unit_price: 10.0,
      timestamp: sameTimestamp,
    };
    const lateSellSameTime: ExecutionTransactionRef = {
      transaction_id: 1008,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 50,
      unit_price: 20.0,
      timestamp: sameTimestamp,
    };

    const recordF3 = createMockExecutionRecord({
      buyTxs: [earlyBuySameTime],
      sellTxs: [lateSellSameTime],
    });
    const outcomeF3 = RealizedFinancialOutcomeEngine.calculate(recordF3, { financialConfig: mockFinancialConfig });

    // Buy tx 1007 < sell tx 1008: causally eligible
    assert(outcomeF3.matched_quantity === 50, 'Subcase F3: 50 matched (buy has lower tx_id than sell)');
    assert(outcomeF3.unmatched_sell_quantity === 0, 'Subcase F3: 0 unmatched sell');
    assert(outcomeF3.data_state === 'VALID', 'Subcase F3: data_state is VALID');

    console.log('  [PASS] Cas F: Timestamp identique & tie-breaker (transaction_id ASC) verified.');
  }

  // Adversarial & Robustness Tests
  {
    console.log('\n--- Adversarial & Edge Cases ---');

    // Adv 1: Non-chronological shuffled transaction arrays
    const b1: ExecutionTransactionRef = { transaction_id: 101, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 10, timestamp: '2026-09-20T08:00:00Z' };
    const b2: ExecutionTransactionRef = { transaction_id: 102, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 20, timestamp: '2026-09-20T09:00:00Z' };
    const s1: ExecutionTransactionRef = { transaction_id: 201, type_id: 34, location_id: 60003760, is_buy: false, quantity: 150, unit_price: 30, timestamp: '2026-09-20T10:00:00Z' };

    // Pass in reverse order
    const shuffledRecord = createMockExecutionRecord({
      buyTxs: [b2, b1],
      sellTxs: [s1],
    });
    const sortedRecord = createMockExecutionRecord({
      buyTxs: [b1, b2],
      sellTxs: [s1],
    });

    const resShuffled = RealizedFinancialOutcomeEngine.calculate(shuffledRecord, { financialConfig: mockFinancialConfig });
    const resSorted = RealizedFinancialOutcomeEngine.calculate(sortedRecord, { financialConfig: mockFinancialConfig });

    assert(resShuffled.realized_acquisition_cost === resSorted.realized_acquisition_cost, 'Adv 1: Sorting determinism for cost');
    assert(resShuffled.fifo_allocations[0].buy_transaction_id === 101, 'Adv 1: Earlier buy lot 101 consumed first despite array ordering');

    // Adv 2: Non-finite and negative inputs clamped defensively
    const degenBuy: ExecutionTransactionRef = {
      transaction_id: 109,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: -50, // Negative quantity
      unit_price: NaN, // NaN price
      timestamp: '2026-09-20T08:00:00Z',
    };
    const degenSell: ExecutionTransactionRef = {
      transaction_id: 209,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: Infinity, // Non-finite quantity
      unit_price: -10, // Negative price
      timestamp: '2026-09-20T09:00:00Z',
    };
    const degenRecord = createMockExecutionRecord({ buyTxs: [degenBuy], sellTxs: [degenSell] });
    const degenOutcome = RealizedFinancialOutcomeEngine.calculate(degenRecord, { financialConfig: mockFinancialConfig });

    assert(Number.isFinite(degenOutcome.gross_realized_profit), 'Adv 2: No NaN or Infinity propagation');
    assert(Number.isFinite(degenOutcome.roi), 'Adv 2: Finite ROI');
    assert(Number.isFinite(degenOutcome.margin), 'Adv 2: Finite margin');

    // Adv 3: Financial completeness taxonomy verification
    // 3.1: UNAVAILABLE when no config
    const noConfigOutcome = RealizedFinancialOutcomeEngine.calculate(sortedRecord);
    assert(noConfigOutcome.financial_completeness === 'UNAVAILABLE', 'Adv 3.1: Completeness is UNAVAILABLE without config');
    assert(noConfigOutcome.realized_net_estimated === null, 'Adv 3.1: realized_net_estimated is null (NO DATA != ZERO DATA)');
    assert(noConfigOutcome.is_financially_complete === false, 'Adv 3.1: Not complete without config');

    // 3.2: ESTIMATED with UNKNOWN execution role
    const configOutcome = RealizedFinancialOutcomeEngine.calculate(sortedRecord, {
      financialConfig: mockFinancialConfig,
      executionFeeMode: 'UNKNOWN',
    });
    assert(configOutcome.financial_completeness === 'ESTIMATED', 'Adv 3.2: Completeness is ESTIMATED');
    assert(configOutcome.is_net_estimated === true, 'Adv 3.2: is_net_estimated is true');
    assert(configOutcome.fees.is_role_assumed === true, 'Adv 3.2: is_role_assumed is true for UNKNOWN');
    assert(configOutcome.is_financially_complete === false, 'Adv 3.2: ESTIMATE != OBSERVED FACT');

    // 3.3: Explicit fee roles (MAKER_MAKER vs TAKER_TAKER)
    const makerOutcome = RealizedFinancialOutcomeEngine.calculate(sortedRecord, {
      financialConfig: mockFinancialConfig,
      executionFeeMode: 'MAKER_MAKER',
    });
    const takerOutcome = RealizedFinancialOutcomeEngine.calculate(sortedRecord, {
      financialConfig: mockFinancialConfig,
      executionFeeMode: 'TAKER_TAKER',
    });

    assert(makerOutcome.fees.estimated_buy_broker_fee > 0, 'Adv 3.3: MAKER buy has broker fee');
    assert(makerOutcome.fees.estimated_sell_broker_fee > 0, 'Adv 3.3: MAKER sell has broker fee');
    assert(takerOutcome.fees.estimated_buy_broker_fee === 0, 'Adv 3.3: TAKER buy has 0% broker fee');
    assert(takerOutcome.fees.estimated_sell_broker_fee === 0, 'Adv 3.3: TAKER sell has 0% broker fee');
    assert(takerOutcome.fees.estimated_sales_tax > 0, 'Adv 3.3: Sales tax applies regardless of role');
    assert(takerOutcome.net_realized_profit > makerOutcome.net_realized_profit, 'Adv 3.3: Taker net profit > Maker net profit');

    console.log('  [PASS] Adversarial & edge cases verified.');
  }

  console.log('\n==========================================================================');
  console.log('ALL CHANTIER 3B-4A & 3B-4A.1 FINANCIAL GATE TESTS (22 + 10 + 6 + 3) PASSED (100%)');
  console.log('==========================================================================');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
