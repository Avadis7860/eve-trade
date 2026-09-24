/**
 * ============================================================================
 * EVE TRADE — PHASE 4: END-TO-END INTEGRATION & COHERENCE GATE TESTS
 * ============================================================================
 *
 * Validates the complete pipeline:
 * EVE Characters -> AuthService -> Orders / Transactions -> OrderScopingEngine
 * -> TraderAnalyticsService -> RealizedFinancialOutcomeEngine -> FleetFinancialEngine
 *
 * Checks all Phase 4 Gate Criteria:
 * 1. character_id = 0 invariant: NEVER assigned to real character, order, or transaction;
 *    NEVER accepted for individual financial calculations.
 * 2. Cross-character isolation: CrossCharacterFinancialMappingViolationError enforced.
 * 3. Mes Ordres / Fleet coherence: Order ownership strictly preserved across active character switches.
 * 4. Performance / Finance coherence: Individual P&L strictly isolated; Fleet P&L aggregated post-calculation.
 * 5. Additive vs Non-additive metrics: Mathematical correctness verified.
 * 6. Active character switching: Switching active character causes zero corruption.
 * 7. Mono-character & Multi-character modes: Both paths fully operational.
 */

import { selectOrdersByScope } from '../orderScoping';
import { FleetFinancialEngine } from '../fleetFinancial';
import {
  RealizedFinancialOutcomeEngine,
  CrossCharacterFinancialMappingViolationError,
} from '../realizedFinancialOutcome';
import {
  CharacterExecutionRecord,
  CharacterFinancialResult,
  EveCharacterOrder,
  EveCharacterTransaction,
  OrderScope,
  PerformanceScope,
  TraderPerformanceMetrics,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function createTestOrders(): EveCharacterOrder[] {
  return [
    {
      order_id: '10001',
      character_id: 1001,
      character_name: 'Pilot Alpha',
      type_id: 34,
      type_name: 'Tritanium',
      region_id: 10000002,
      region_name: 'The Forge',
      location_id: 60003760,
      price: 5.5,
      volume_remain: 500000,
      volume_total: 1000000,
      is_buy_order: true,
      issued: '2026-03-30T10:00:00Z',
      duration: 90,
      escrow: 2750000,
    },
    {
      order_id: '10002',
      character_id: 1001,
      character_name: 'Pilot Alpha',
      type_id: 35,
      type_name: 'Pyerite',
      region_id: 10000002,
      region_name: 'The Forge',
      location_id: 60003760,
      price: 12.0,
      volume_remain: 100000,
      volume_total: 100000,
      is_buy_order: false,
      issued: '2026-03-30T11:00:00Z',
      duration: 90,
    },
    {
      order_id: '20001',
      character_id: 1002,
      character_name: 'Pilot Beta',
      type_id: 36,
      type_name: 'Mexallon',
      region_id: 10000043,
      region_name: 'Domain',
      location_id: 60008494,
      price: 45.0,
      volume_remain: 50000,
      volume_total: 50000,
      is_buy_order: false,
      issued: '2026-03-30T12:00:00Z',
      duration: 90,
    },
  ];
}

function createTestTransactionsAlpha(): EveCharacterTransaction[] {
  return [
    {
      transaction_id: 501,
      character_id: 1001,
      character_name: 'Pilot Alpha',
      date: '2026-03-29T10:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 4.0,
      quantity: 100000,
      is_buy: true,
      is_personal: true,
      client_id: 9001,
    },
    {
      transaction_id: 502,
      character_id: 1001,
      character_name: 'Pilot Alpha',
      date: '2026-03-30T10:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 5.0,
      quantity: 100000,
      is_buy: false,
      is_personal: true,
      client_id: 9002,
    },
  ];
}

function createTestTransactionsBeta(): EveCharacterTransaction[] {
  return [
    {
      transaction_id: 601,
      character_id: 1002,
      character_name: 'Pilot Beta',
      date: '2026-03-29T11:00:00Z',
      type_id: 36,
      location_id: 60008494,
      unit_price: 40.0,
      quantity: 10000,
      is_buy: true,
      is_personal: true,
      client_id: 9003,
    },
    {
      transaction_id: 602,
      character_id: 1002,
      character_name: 'Pilot Beta',
      date: '2026-03-30T11:00:00Z',
      type_id: 36,
      location_id: 60008494,
      unit_price: 48.0,
      quantity: 10000,
      is_buy: false,
      is_personal: true,
      client_id: 9004,
    },
  ];
}

function runEndToEndIntegrationTests() {
  console.log('===============================================================');
  console.log('--- RUNNING PHASE 4 END-TO-END INTEGRATION & COHERENCE TESTS ---');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Gate Check 1: character_id = 0 Invariant & Engine Protection
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 1: character_id = 0 Invariant & Engine Protection ---');
  let rejectedZeroInCalculateForTransactions = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(0, 34, createTestTransactionsAlpha());
  } catch (err: any) {
    if (err.message.includes('requires a valid positive characterId')) {
      rejectedZeroInCalculateForTransactions = true;
    }
  }
  assert(rejectedZeroInCalculateForTransactions, 'calculateForTransactions must reject characterId = 0');

  let rejectedZeroInCalculate = false;
  try {
    const invalidExecutionRecord: CharacterExecutionRecord = {
      character_id: 0, // INVALID
      observation_id: 'obs_1',
      execution_id: 'exec_1',
      opportunity_id: 'opp_1',
      match_level: 'DIRECT_MATCH',
      transaction_ids: [],
      first_correlated_at: '2026-03-30T10:00:00Z',
      last_updated_at: '2026-03-30T10:00:00Z',
      correlation_engine_version: '1.0.0',
      data_state: 'VALID',
      execution_outcome: {
        execution_status: 'CLOSED',
        match_level: 'DIRECT_MATCH',
        planned_quantity: 100,
        executed_buy_quantity: 100,
        executed_sell_quantity: 100,
        remaining_inventory_quantity: 0,
        buy_fill_ratio: 1.0,
        sell_fill_ratio: 1.0,
        vwap_buy_price: 4.0,
        vwap_sell_price: 5.0,
        first_buy_at: '2026-03-29T10:00:00Z',
        last_buy_at: '2026-03-29T10:00:00Z',
        first_sell_at: '2026-03-30T10:00:00Z',
        last_sell_at: '2026-03-30T10:00:00Z',
        buy_transactions: [],
        sell_transactions: [],
        linked_order_ids: [],
        candidate_observation_ids: ['obs_1'],
      },
    };
    RealizedFinancialOutcomeEngine.calculate(invalidExecutionRecord);
  } catch (err: any) {
    if (err.message.includes('requires a valid positive character_id')) {
      rejectedZeroInCalculate = true;
    }
  }
  assert(rejectedZeroInCalculate, 'calculate must reject executionRecord with character_id = 0');
  console.log('  [PASS] Gate Check 1: character_id = 0 strictly forbidden for individual financial calculations.');

  // --------------------------------------------------------------------------
  // Gate Check 2: Cross-Character Scope Guard
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 2: Cross-Character Financial Scope ---');
  const betaSameTypeTransaction = {
    ...createTestTransactionsBeta()[0],
    type_id: 34,
  };
  const mixedTxs = [...createTestTransactionsAlpha(), betaSameTypeTransaction];
  let crossCharCaught = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, mixedTxs);
  } catch (err) {
    if (err instanceof CrossCharacterFinancialMappingViolationError) {
      crossCharCaught = true;
    }
  }
  assert(crossCharCaught, 'calculateForTransactions must reject same-type cross-character transactions when no common accounting scope is declared');
  console.log('  [PASS] Gate Check 2: Cross-character scope guard verified.');

  // --------------------------------------------------------------------------
  // Gate Check 3: Mes Ordres / Fleet Scoping Coherence & Active Switching
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 3: Mes Ordres Scoping & Active Switching ---');
  const allOrders = createTestOrders();
  const fleetCharIds = ['1001', '1002'];

  // Scope: Active Character = 1001 (Pilot Alpha)
  const scopeActiveAlpha: OrderScope = { type: 'active_character' };
  const ordersAlpha = selectOrdersByScope(allOrders, scopeActiveAlpha, {
    activeCharacterId: '1001',
    fleetCharacterIds: fleetCharIds,
    corporationIds: [],
  });
  assert(ordersAlpha.length === 2, 'Alpha should have 2 active orders');
  assert(ordersAlpha.every((o: EveCharacterOrder) => o.character_id === 1001), 'All orders in Alpha scope must belong to 1001');

  // Scope: Active Character = 1002 (Pilot Beta) -> Switch active character
  const ordersBeta = selectOrdersByScope(allOrders, scopeActiveAlpha, {
    activeCharacterId: '1002',
    fleetCharacterIds: fleetCharIds,
    corporationIds: [],
  });
  assert(ordersBeta.length === 1, 'Beta should have 1 active order');
  assert(ordersBeta[0].character_id === 1002, 'Beta order must belong to 1002');
  assert(ordersBeta[0].order_id === '20001', 'Beta order ID must remain 20001');

  // Scope: Fleet -> All orders from fleet participants
  const scopeFleet: OrderScope = { type: 'fleet' };
  const ordersFleet = selectOrdersByScope(allOrders, scopeFleet, {
    activeCharacterId: '1001',
    fleetCharacterIds: fleetCharIds,
    corporationIds: [],
  });
  assert(ordersFleet.length === 3, 'Fleet scope should contain all 3 orders');
  // Invariant: Orders retain original character_id (no replacement with 0 or fleet id)
  assert(ordersFleet.find((o: EveCharacterOrder) => o.order_id === '10001')?.character_id === 1001, 'Order 10001 must keep character_id 1001');
  assert(ordersFleet.find((o: EveCharacterOrder) => o.order_id === '20001')?.character_id === 1002, 'Order 20001 must keep character_id 1002');
  console.log('  [PASS] Gate Check 3: Order scoping and active character switching verified.');

  // --------------------------------------------------------------------------
  // Gate Check 4: Individual P&L -> Fleet P&L Aggregation
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 4: Individual P&L & Fleet Consolidation ---');
  // Character Alpha P&L calculation
  const outcomeAlpha = RealizedFinancialOutcomeEngine.calculateForTransactions(
    1001,
    34,
    createTestTransactionsAlpha(),
    {
      financialConfig: {
        accounting_level: 5,
        broker_relations_level: 5,
        advanced_broker_relations_level: 5,
        faction_standing: 0,
        corp_standing: 0,
        enable_transport_costs: false,
      },
    }
  );

  // Character Beta P&L calculation
  const outcomeBeta = RealizedFinancialOutcomeEngine.calculateForTransactions(
    1002,
    36,
    createTestTransactionsBeta(),
    {
      financialConfig: {
        accounting_level: 5,
        broker_relations_level: 5,
        advanced_broker_relations_level: 5,
        faction_standing: 0,
        corp_standing: 0,
        enable_transport_costs: false,
      },
    }
  );

  assert(outcomeAlpha.realized_gross === 100_000, 'Alpha gross profit should be 100k ISK (500k rev - 400k cost)');
  assert(outcomeBeta.realized_gross === 80_000, 'Beta gross profit should be 80k ISK (480k rev - 400k cost)');

  if (
    outcomeAlpha.net_realized_profit === null ||
    outcomeAlpha.roi === null ||
    outcomeBeta.net_realized_profit === null ||
    outcomeBeta.roi === null
  ) {
    throw new Error('Configured E2E financial outcomes must expose numeric net profit and ROI');
  }

  // Build character metrics records
  const metricsAlpha: TraderPerformanceMetrics = {
    character_id: 1001,
    character_name: 'Pilot Alpha',
    last_calculated: '2026-03-30T12:00:00Z',
    total_realized_profit: outcomeAlpha.net_realized_profit,
    total_realized_gross: outcomeAlpha.realized_gross,
    total_buy_volume: outcomeAlpha.realized_acquisition_cost,
    total_sell_volume: outcomeAlpha.realized_revenue,
    total_turnover: outcomeAlpha.realized_acquisition_cost + outcomeAlpha.realized_revenue,
    total_closed_trades: 1,
    profitable_trades: 1,
    unprofitable_trades: 0,
    win_rate_pct: 100,
    average_realized_roi: outcomeAlpha.roi,
    average_hold_days: outcomeAlpha.weighted_hold_days,
    total_broker_fees_paid: 0,
    total_sales_tax_paid: outcomeAlpha.fees.estimated_sales_tax,
    total_estimated_fees: outcomeAlpha.fees.estimated_total_fees,
    top_profitable_items: [],
    recent_trade_cycles: [
      {
        cycle_id: 'cycle_alpha_1',
        type_id: 34,
        type_name: 'Tritanium',
        buy_date: '2026-03-29T10:00:00Z',
        sell_date: '2026-03-30T10:00:00Z',
        quantity: 100000,
        avg_buy_price: 4.0,
        avg_sell_price: 5.0,
        total_buy_cost: outcomeAlpha.realized_acquisition_cost,
        total_sell_revenue: outcomeAlpha.realized_revenue,
        gross_profit: outcomeAlpha.realized_gross,
        estimated_fees_paid: outcomeAlpha.fees.estimated_total_fees,
        net_profit: outcomeAlpha.net_realized_profit,
        roi: outcomeAlpha.roi,
        hold_days: outcomeAlpha.weighted_hold_days,
        is_profitable: true,
        financial_completeness: 'OBSERVED',
        is_net_estimated: false,
        character_id: 1001,
        character_name: 'Pilot Alpha',
      },
    ],
    activity_by_location: [],
    category_success_rate: {},
    trader_title: 'Négociant Initié',
    trader_badge_color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    calibration_weight: 1.0,
    financial_completeness: 'OBSERVED',
    is_net_estimated: false,
    realized_profit_label: 'Bénéfice Net Réalisé',
    has_unmatched_trades: false,
    unmatched_trades_count: 0,
  };

  const metricsBeta: TraderPerformanceMetrics = {
    character_id: 1002,
    character_name: 'Pilot Beta',
    last_calculated: '2026-03-30T12:00:00Z',
    total_realized_profit: outcomeBeta.net_realized_profit,
    total_realized_gross: outcomeBeta.realized_gross,
    total_buy_volume: outcomeBeta.realized_acquisition_cost,
    total_sell_volume: outcomeBeta.realized_revenue,
    total_turnover: outcomeBeta.realized_acquisition_cost + outcomeBeta.realized_revenue,
    total_closed_trades: 1,
    profitable_trades: 1,
    unprofitable_trades: 0,
    win_rate_pct: 100,
    average_realized_roi: outcomeBeta.roi,
    average_hold_days: outcomeBeta.weighted_hold_days,
    total_broker_fees_paid: 0,
    total_sales_tax_paid: outcomeBeta.fees.estimated_sales_tax,
    total_estimated_fees: outcomeBeta.fees.estimated_total_fees,
    top_profitable_items: [],
    recent_trade_cycles: [
      {
        cycle_id: 'cycle_beta_1',
        type_id: 36,
        type_name: 'Mexallon',
        buy_date: '2026-03-29T11:00:00Z',
        sell_date: '2026-03-30T11:00:00Z',
        quantity: 10000,
        avg_buy_price: 40.0,
        avg_sell_price: 48.0,
        total_buy_cost: outcomeBeta.realized_acquisition_cost,
        total_sell_revenue: outcomeBeta.realized_revenue,
        gross_profit: outcomeBeta.realized_gross,
        estimated_fees_paid: outcomeBeta.fees.estimated_total_fees,
        net_profit: outcomeBeta.net_realized_profit,
        roi: outcomeBeta.roi,
        hold_days: outcomeBeta.weighted_hold_days,
        is_profitable: true,
        financial_completeness: 'OBSERVED',
        is_net_estimated: false,
        character_id: 1002,
        character_name: 'Pilot Beta',
      },
    ],
    activity_by_location: [],
    category_success_rate: {},
    trader_title: 'Négociant Initié',
    trader_badge_color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    calibration_weight: 1.0,
    financial_completeness: 'OBSERVED',
    is_net_estimated: false,
    realized_profit_label: 'Bénéfice Net Réalisé',
    has_unmatched_trades: false,
    unmatched_trades_count: 0,
  };

  const characterResults: CharacterFinancialResult[] = [
    {
      characterId: '1001',
      characterName: 'Pilot Alpha',
      metrics: metricsAlpha,
      dataHealth: 'fresh',
    },
    {
      characterId: '1002',
      characterName: 'Pilot Beta',
      metrics: metricsBeta,
      dataHealth: 'fresh',
    },
  ];

  // Consolidate Fleet
  const fleetRes = FleetFinancialEngine.aggregateFleetPerformance(characterResults);
  const fleetM = fleetRes.fleetMetrics;

  // Verify Exact Additivity
  assert(
    fleetM.total_realized_profit === metricsAlpha.total_realized_profit + metricsBeta.total_realized_profit,
    'Fleet realized profit must equal Alpha profit + Beta profit'
  );
  assert(
    fleetM.total_realized_gross === 180_000,
    'Fleet gross profit must equal 180k ISK (100k + 80k)'
  );
  assert(
    fleetM.total_buy_volume === 800_000,
    'Fleet buy volume must equal 800k ISK (400k + 400k)'
  );
  assert(
    fleetM.total_sell_volume === 980_000,
    'Fleet sell volume must equal 980k ISK (500k + 480k)'
  );
  assert(
    fleetM.total_turnover === 1_780_000,
    'Fleet turnover must equal 1.78M ISK'
  );
  assert(fleetM.total_closed_trades === 2, 'Fleet total closed trades must equal 2');
  assert(fleetM.profitable_trades === 2, 'Fleet profitable trades must equal 2');
  assert(fleetM.win_rate_pct === 100, 'Fleet win rate must be 100%');
  assert(fleetM.character_id === 0, 'Fleet summary character_id must be 0');
  console.log('  [PASS] Gate Check 4: Additive & Non-additive fleet metrics verified.');

  // --------------------------------------------------------------------------
  // Gate Check 5: Switching Active Character produces zero fleet drift
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 5: Active Switching Drift Resistance ---');
  const scopePerformanceActive: PerformanceScope = { type: 'active_character' };
  const selectActiveA = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopePerformanceActive, '1001');
  assert(selectActiveA.selectedMetrics?.character_id === 1001, 'Active A must return Alpha metrics');

  const selectActiveB = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopePerformanceActive, '1002');
  assert(selectActiveB.selectedMetrics?.character_id === 1002, 'Active B must return Beta metrics');

  // Fleet performance is identical regardless of who is active
  const scopePerformanceFleet: PerformanceScope = { type: 'fleet' };
  const selectFleetFromA = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopePerformanceFleet, '1001');
  const selectFleetFromB = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopePerformanceFleet, '1002');
  assert(
    selectFleetFromA.fleetResult?.fleetMetrics.total_realized_profit === selectFleetFromB.fleetResult?.fleetMetrics.total_realized_profit,
    'Fleet P&L must be invariant to active character switch'
  );
  console.log('  [PASS] Gate Check 5: Active character switching drift resistance verified.');

  // --------------------------------------------------------------------------
  // Gate Check 6: Mono-Character Backward Compatibility
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 6: Mono-Character Mode Backward Compatibility ---');
  const singleCharResults: CharacterFinancialResult[] = [
    {
      characterId: '1001',
      characterName: 'Pilot Alpha',
      metrics: metricsAlpha,
      dataHealth: 'fresh',
    },
  ];
  const monoFleet = FleetFinancialEngine.aggregateFleetPerformance(singleCharResults);
  assert(monoFleet.participatingCharacterCount === 1, 'Mono-character fleet should have 1 participant');
  assert(monoFleet.fleetMetrics.total_realized_profit === metricsAlpha.total_realized_profit, 'Mono fleet profit must match single char profit');
  assert(monoFleet.fleetMetrics.total_turnover === metricsAlpha.total_turnover, 'Mono fleet turnover must match single char turnover');
  assert(monoFleet.hasUnavailableCharacters === false, 'Mono fleet with fresh char has no unavailable');
  console.log('  [PASS] Gate Check 6: Mono-character backward compatibility verified.');

  // --------------------------------------------------------------------------
  // Gate Check 7: Multi-Character with Partial / Unavailable Pilot
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 7: Multi-Character Partial Availability ---');
  const multiCharWithUnavailable: CharacterFinancialResult[] = [
    {
      characterId: '1001',
      characterName: 'Pilot Alpha',
      metrics: metricsAlpha,
      dataHealth: 'fresh',
    },
    {
      characterId: '1002',
      characterName: 'Pilot Beta',
      metrics: metricsBeta,
      dataHealth: 'fresh',
    },
    {
      characterId: '1003',
      characterName: 'Pilot Gamma',
      metrics: {
        ...metricsAlpha,
        character_id: 1003,
        character_name: 'Pilot Gamma',
        total_realized_profit: 0,
      },
      dataHealth: 'unavailable',
      errorMessage: 'EVE SSO Token Expired (401)',
    },
  ];

  const partialFleetRes = FleetFinancialEngine.aggregateFleetPerformance(multiCharWithUnavailable);
  assert(partialFleetRes.hasUnavailableCharacters === true, 'hasUnavailableCharacters must be true');
  assert(partialFleetRes.unavailableCharacterNames.includes('Pilot Gamma'), 'Pilot Gamma must be in unavailableCharacterNames');
  assert(partialFleetRes.participatingCharacterCount === 2, 'Only 2 characters should participate');
  assert(
    partialFleetRes.fleetMetrics.total_realized_profit === metricsAlpha.total_realized_profit + metricsBeta.total_realized_profit,
    'Profit must aggregate only valid participants'
  );
  console.log('  [PASS] Gate Check 7: Partial availability handling verified.');

  console.log('===============================================================');
  console.log('ALL PHASE 4 END-TO-END INTEGRATION & COHERENCE TESTS PASSED (100%)');
  console.log('===============================================================');
}

runEndToEndIntegrationTests();
