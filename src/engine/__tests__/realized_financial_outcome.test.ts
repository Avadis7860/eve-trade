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
  EveCharacterTransaction,
  TradeCycleRecord,
  RealizedFinancialOutcome,
  RealizedFinancialCalculationOptions,
} from '../../types';
import {
  RealizedFinancialOutcomeEngine,
  REALIZED_FINANCIAL_ENGINE_VERSION,
} from '../realizedFinancialOutcome';
import { ExecutionTrackingService } from '../../services/executionTrackingService';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { TraderAnalyticsService } from '../../services/traderAnalytics';
import { roundIsk } from '../money';

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
    assert(outcome.net_realized_profit !== null && outcome.net_realized_profit === 44600, 'Net profit = 50,000 - 5400 = 44,600 ISK');
    assert(outcome.roi === 0.446, 'ROI = 44,600 / 100,000 = 0.446 (44.6%)');
    assert(outcome.fifo_allocations.length === 1, 'Exactly 1 allocation');
    assert(
      outcome.fifo_allocations[0].provenance.source_kind === 'ESI_WALLET_TRANSACTION' &&
        outcome.fifo_allocations[0].provenance.source_id === '201' &&
        outcome.fifo_allocations[0].provenance.principal_scope === 'character:2112001',
      'FIFO allocation must preserve source kind, source ID and principal scope',
    );
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
    assert(outcome.position_lifecycle === 'PARTIALLY_REALIZED', 'Partial sell must leave the position partially realized');
    assert(outcome.position_remaining_quantity === 600, 'Position lifecycle must expose 600 units remaining');
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
    assert(outcome.capital_committed === 1_000_000, 'Capital committed remains the full acquisition cost');
    assert(outcome.cash_recovered === 900_000, 'Cash recovered is only the revenue from the 6,000 allocated disposals');
    assert(outcome.capital_recovery_delta === -100_000, 'Capital recovery delta is distinct from realized P&L');
    assert(
      outcome.capital_recovery_ratio !== null &&
        Math.abs(outcome.capital_recovery_ratio - 0.9) < Number.EPSILON,
      'Capital recovery ratio is scoped to the whole known position'
    );
    assert(outcome.gross_realized_profit === 300_000, 'Realized gross P&L remains +300,000 ISK');
    assert(outcome.remaining_lots.length === 1, '1 open lot');
    assert(outcome.remaining_lots[0].remaining_quantity === 4000, 'Lot remaining 4000');
    assert(outcome.position_lifecycle === 'PARTIALLY_REALIZED', 'Position must remain partial while inventory remains');
    assert(outcome.position_remaining_quantity === 4000, 'Position must expose remaining quantity');
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
    assert(outcome.net_realized_profit !== null && outcome.net_realized_profit === 408500, 'Net realized profit 408,500');
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
    assert(outcome.net_realized_profit === null, 'Net realized profit must be unavailable when fee evidence is unavailable');
    assert(outcome.roi === null, 'Net ROI must remain unavailable when fee evidence is unavailable');
    assert(outcome.margin === null, 'Net margin must remain unavailable when fee evidence is unavailable');
    assert(outcome.fees.fee_source === 'UNAVAILABLE', 'fee_source === UNAVAILABLE');
    assert(outcome.data_state === 'PARTIAL', 'data_state is marked PARTIAL due to unavailable fees');
    assert(outcome.state_reasons !== undefined && outcome.state_reasons.some((r) => r.includes('Fee configuration is unavailable')), 'State reasons explain fee absence');
    console.log('  [PASS] Test 13: UNAVAILABLE fee mode handled cleanly.');
  }

  // Direct transaction calculations must not expose synthetic observation provenance.
  {
    const direct = RealizedFinancialOutcomeEngine.calculateForTransactions(
      2112001,
      34,
      [
        {
          transaction_id: 901,
          type_id: 34,
          location_id: 60003760,
          is_buy: true,
          quantity: 10,
          unit_price: 100,
          timestamp: '2026-09-20T10:00:00Z',
        },
        {
          transaction_id: 902,
          type_id: 34,
          location_id: 60003760,
          is_buy: false,
          quantity: 10,
          unit_price: 150,
          timestamp: '2026-09-20T11:00:00Z',
        },
      ],
      { financialConfig: mockFinancialConfig },
    );

    assert(direct.calculation_source === 'TRANSACTION_FACTS', 'direct calculations must identify transaction facts as their source');
    assert(direct.observation_id === undefined, 'direct calculations must not expose a synthetic observation ID');
  }

  // Test 14: Division by Zero Protection
  {
    console.log('--- Test 14: Division by Zero Protection ---');
    // Case 1: No matched inventory for a valid type.
    // An entirely empty execution record has no type_id and therefore cannot satisfy
    // the position-ledger positive-type invariant.
    const emptySell: ExecutionTransactionRef = {
      transaction_id: 301,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1,
      unit_price: 100,
      timestamp: '2026-09-20T12:00:00Z',
    };
    const emptyRecord = createMockExecutionRecord({ buyTxs: [], sellTxs: [emptySell] });
    const outcomeEmpty = RealizedFinancialOutcomeEngine.calculate(emptyRecord, {
      financialConfig: mockFinancialConfig,
    });

    assert(outcomeEmpty.roi === null, 'ROI is unavailable when no acquisition cost denominator exists');
    assert(outcomeEmpty.margin === null, 'Margin is unavailable when no realized revenue denominator exists');
    assert(outcomeEmpty.profit_per_unit === null, 'Profit per unit is unavailable when no matched quantity exists');

    // Case 2: Zero-price facts are invalid source data, not a valid zero-cost acquisition.
    // The ledger must surface them as PARTIAL rather than relaxing its positive-price invariant.
    const freeBuy: ExecutionTransactionRef = { transaction_id: 1, type_id: 34, location_id: 60003760, is_buy: true, quantity: 100, unit_price: 0, timestamp: '2026-09-20T10:00:00Z' };
    const freeSell: ExecutionTransactionRef = { transaction_id: 2, type_id: 34, location_id: 60003760, is_buy: false, quantity: 100, unit_price: 0, timestamp: '2026-09-20T12:00:00Z' };
    const freeRecord = createMockExecutionRecord({ buyTxs: [freeBuy], sellTxs: [freeSell] });
    const outcomeFree = RealizedFinancialOutcomeEngine.calculate(freeRecord, { financialConfig: mockFinancialConfig });

    assert(outcomeFree.roi === null, 'ROI remains unavailable when no valid acquisition cost is available');
    assert(outcomeFree.margin === null, 'Margin remains unavailable when no valid revenue is available');
    assert(outcomeFree.profit_per_unit === null, 'Profit per unit remains unavailable when no valid matched quantity exists');
    assert(outcomeFree.data_state === 'PARTIAL', 'Invalid zero-price facts must remain PARTIAL');
    assert(
      outcomeFree.state_reasons !== undefined &&
        outcomeFree.state_reasons.some((reason) => reason.includes('Invalid transaction facts')),
      'Invalid zero-price facts must be explicitly diagnosed'
    );
    console.log('  [PASS] Test 14: Division by zero protection verified without weakening ledger validation.');
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

  // Test 19: Cross-Character Economic Allocation
  {
    console.log('--- Test 19: Cross-Character Economic Allocation ---');
    const buy: ExecutionTransactionRef = {
      transaction_id: 101,
      character_id: 2112001,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 1000,
      unit_price: 100,
      timestamp: '2026-09-20T10:00:00Z',
    };
    const sell: ExecutionTransactionRef = {
      transaction_id: 201,
      character_id: 2112002,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 1,
      unit_price: 150,
      timestamp: '2026-09-20T12:00:00Z',
    };

    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(
      2112001,
      34,
      [buy, sell],
      {
        financialConfig: mockFinancialConfig,
        accounting_scope_id: 'ecosystem:test',
      },
    );

    assert(outcome.matched_quantity === 1, 'cross-character sale must consume shared inventory');
    assert(outcome.position_remaining_quantity === 999, '999 units must remain');
    assert(outcome.position_lifecycle === 'PARTIALLY_REALIZED', 'position remains partial');
    assert(outcome.position_disposition_states[0].lifecycle_status === 'PARTIALLY_REALIZED', 'partial disposal remains open');
    assert(outcome.fifo_allocations[0].provenance.principal_scope === 'character:2112002', 'seller provenance is preserved');
    assert(outcome.remaining_lots[0].provenance.principal_scope === 'character:2112001', 'buyer provenance is preserved');
    assert(outcome.accounting_scope_id === 'ecosystem:test', 'accounting scope is preserved');
    assert(outcome.source_coverage === 'MARKET_TRACEABLE', 'market-only lineage is traceable');
    console.log('  [PASS] Test 19: Cross-character economic allocation validated.');
  }

  // Cross-scope mismatch must fail closed instead of consuming another ecosystem.
  {
    const scopedBuy: ExecutionTransactionRef = {
      transaction_id: 301,
      character_id: 2112001,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 10,
      unit_price: 100,
      timestamp: '2026-09-20T10:00:00Z',
      accounting_scope_id: 'ecosystem:test',
    };
    const scopedSell: ExecutionTransactionRef = {
      transaction_id: 302,
      character_id: 2112002,
      type_id: 34,
      location_id: 60003760,
      is_buy: false,
      quantity: 10,
      unit_price: 150,
      timestamp: '2026-09-20T11:00:00Z',
      accounting_scope_id: 'ecosystem:other',
    };
    const rejected = RealizedFinancialOutcomeEngine.calculateForTransactions(
      2112001,
      34,
      [scopedBuy, scopedSell],
      {
        financialConfig: mockFinancialConfig,
        accounting_scope_id: 'ecosystem:test',
      },
    );
    assert(rejected.matched_quantity === 0, 'cross-scope disposal must not consume the acquisition lot');
    assert(rejected.source_coverage === 'PARTIAL', 'cross-scope outcome must report partial coverage');
  }
