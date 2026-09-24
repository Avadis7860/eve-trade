/**
 * ============================================================================
 * EVE TRADE — PHASE 3 GATE TESTS: MULTI-CHARACTER PERFORMANCE & FLEET P&L
 * ============================================================================
 */

import { FleetFinancialEngine } from '../fleetFinancial';
import {
  RealizedFinancialOutcomeEngine,
  CrossCharacterFinancialMappingViolationError,
} from '../realizedFinancialOutcome';
import {
  CharacterFinancialResult,
  EveCharacterTransaction,
  PerformanceScope,
  TraderPerformanceMetrics,
} from '../../types';
import { TraderAnalyticsService } from '../../services/traderAnalytics';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

const createMockMetrics = (
  charId: number,
  charName: string,
  profit: number,
  closedTrades: number,
  buyVol: number,
  sellVol: number,
  brokerFees: number = 0,
  salesTax: number = 0
): TraderPerformanceMetrics => ({
  character_id: charId,
  character_name: charName,
  last_calculated: '2026-03-30T12:00:00Z',
  total_realized_profit: profit,
  total_buy_volume: buyVol,
  total_sell_volume: sellVol,
  total_turnover: buyVol + sellVol,
  total_closed_trades: closedTrades,
  profitable_trades: profit > 0 ? closedTrades : 0,
  unprofitable_trades: profit <= 0 ? closedTrades : 0,
  win_rate_pct: profit > 0 ? 100 : 0,
  average_realized_roi: buyVol > 0 ? profit / buyVol : 0,
  average_realized_roi_scope: 'CLOSING_DISPOSAL_ALLOCATIONS',
  average_hold_days: 1.5,
  capital_recovery: {
    scope: 'KNOWN_POSITIONS',
    provenance: [
      {
        source_kind: 'ESI_WALLET_TRANSACTION',
        source_id: String(charId),
        principal_scope: `character:${charId}`,
      },
    ],
    financial_completeness: 'OBSERVED',
    capital_committed: buyVol,
    cash_recovered: sellVol,
    capital_recovery_delta: sellVol - buyVol,
    capital_recovery_ratio: buyVol > 0 ? sellVol / buyVol : null,
    remaining_quantity: 0,
    remaining_cost_basis: 0,
    known_position_count: closedTrades,
    open_position_count: 0,
    partially_realized_position_count: 0,
    closed_position_count: closedTrades,
  },
  total_broker_fees_paid: brokerFees,
  total_sales_tax_paid: salesTax,
  top_profitable_items: [
    {
      type_id: 34,
      type_name: 'Tritanium',
      total_profit: profit,
      trades_count: closedTrades,
      avg_roi: buyVol > 0 ? profit / buyVol : 0,
      avg_hold_days: 1.5,
      total_volume_units: 1000,
      profit_label: 'Bénéfice Net Réalisé (Certifié)',
      is_net_estimated: false,
    },
  ],
  recent_trade_cycles: [
    {
      cycle_id: `cycle_${charId}_1`,
      type_id: 34,
      type_name: 'Tritanium',
      buy_date: '2026-03-29T10:00:00Z',
      sell_date: '2026-03-30T10:00:00Z',
      quantity: 1000,
      avg_buy_price: buyVol / 1000,
      avg_sell_price: sellVol / 1000,
      total_buy_cost: buyVol,
      total_sell_revenue: sellVol,
      gross_profit: sellVol - buyVol,
      estimated_fees_paid: brokerFees + salesTax,
      net_profit: profit,
      roi: buyVol > 0 ? profit / buyVol : 0,
      hold_days: 1.0,
      is_profitable: profit > 0,
      financial_completeness: 'OBSERVED',
      is_net_estimated: false,
      character_id: charId,
      character_name: charName,
    },
  ],
  activity_by_location: [
    {
      location_id: 60003760,
      location_name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      total_volume_isk: buyVol + sellVol,
      transaction_count: closedTrades * 2,
    },
  ],
  category_success_rate: {
    Mineral: {
      total_trades: closedTrades,
      profit_isk: profit,
      win_rate: profit > 0 ? 100 : 0,
      avg_roi: buyVol > 0 ? profit / buyVol : 0,
    },
  },
  trader_title: 'Négociant Initié',
  trader_badge_color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  calibration_weight: 1.0,
  financial_completeness: 'OBSERVED',
  is_net_estimated: false,
  realized_profit_label: 'Bénéfice Net Réalisé (Certifié)',
  total_realized_gross: sellVol - buyVol,
  total_estimated_fees: brokerFees + salesTax,
  has_unmatched_trades: false,
  unmatched_trades_count: 0,
});

function runFleetFinancialTests() {
  console.log('===============================================================');
  console.log('--- RUNNING PHASE 3 MULTI-CHARACTER & FLEET FINANCIAL TESTS ---');
  console.log('===============================================================');

  // Test 1: PerformanceScope Selection
  console.log('--- Test 1: PerformanceScope active_character ---');
  const metricsA = createMockMetrics(1001, 'Trader Alpha', 50_000_000, 10, 100_000_000, 150_000_000, 1_000_000, 2_000_000);
  const metricsB = createMockMetrics(1002, 'Trader Beta', 25_000_000, 5, 50_000_000, 75_000_000, 500_000, 1_000_000);

  const characterResults: CharacterFinancialResult[] = [
    {
      characterId: '1001',
      characterName: 'Trader Alpha',
      metrics: metricsA,
      dataHealth: 'fresh',
    },
    {
      characterId: '1002',
      characterName: 'Trader Beta',
      metrics: metricsB,
      dataHealth: 'fresh',
    },
  ];

  const scopeActive: PerformanceScope = { type: 'active_character' };
  const selectionActive = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopeActive, '1001');
  assert(selectionActive.selectedMetrics?.character_id === 1001, 'Should resolve character 1001 as active');
  assert(selectionActive.selectedMetrics?.total_realized_profit === 50_000_000, 'Profit should be 50M');
  console.log('  [PASS] Test 1: Scope active_character validated.');

  // Test 2: Specific Character Scope
  console.log('--- Test 2: PerformanceScope specific character ---');
  const scopeCharB: PerformanceScope = { type: 'character', characterId: '1002' };
  const selectionCharB = FleetFinancialEngine.selectPerformanceByScope(characterResults, scopeCharB, '1001');
  assert(selectionCharB.selectedMetrics?.character_id === 1002, 'Should resolve character 1002');
  assert(selectionCharB.selectedMetrics?.total_realized_profit === 25_000_000, 'Profit should be 25M');
  console.log('  [PASS] Test 2: Scope specific character validated.');

  // Test 3: Reporting aggregation of already-calculated character metrics.
  // This is deliberately tested through aggregateFleetPerformance directly:
  // selectPerformanceByScope must not use character-isolated metrics as an
  // economic fleet fallback under FIN-002.
  console.log('--- Test 3: Fleet Reporting Aggregation ---');
  const scopeFleet: PerformanceScope = { type: 'fleet' };
  const reportingFleet = FleetFinancialEngine.aggregateFleetPerformance(characterResults, scopeFleet);
  assert(reportingFleet !== undefined, 'Fleet reporting result must be defined');
  const fleetMetrics = reportingFleet.fleetMetrics;

  // Exact Additive Properties
  assert(fleetMetrics.total_realized_profit === 75_000_000, `Expected 75M profit, got ${fleetMetrics.total_realized_profit}`);
  assert(fleetMetrics.total_buy_volume === 150_000_000, `Expected 150M buy vol, got ${fleetMetrics.total_buy_volume}`);
  assert(fleetMetrics.total_sell_volume === 225_000_000, `Expected 225M sell vol, got ${fleetMetrics.total_sell_volume}`);
  assert(fleetMetrics.total_turnover === 375_000_000, `Expected 375M turnover, got ${fleetMetrics.total_turnover}`);
  assert(fleetMetrics.total_closed_trades === 15, `Expected 15 closed trades, got ${fleetMetrics.total_closed_trades}`);
  assert(fleetMetrics.total_broker_fees_paid === 1_500_000, `Expected 1.5M broker fees, got ${fleetMetrics.total_broker_fees_paid}`);
  assert(fleetMetrics.total_sales_tax_paid === 3_000_000, `Expected 3.0M sales tax, got ${fleetMetrics.total_sales_tax_paid}`);
  assert(
    fleetMetrics.average_realized_roi_scope === 'CLOSED_POSITIONS',
    'Fleet ROI scope must remain explicit'
  );
  assert(fleetMetrics.capital_recovery?.capital_committed === 150_000_000, 'Fleet committed capital must aggregate known positions');
  assert(fleetMetrics.capital_recovery?.cash_recovered === 225_000_000, 'Fleet recovered cash must aggregate allocated disposal revenue');
  assert(fleetMetrics.capital_recovery?.capital_recovery_delta === 75_000_000, 'Fleet recovery delta must remain separate from realized P&L');
  assert(
    fleetMetrics.capital_recovery?.capital_recovery_ratio === 1.5,
    'Fleet recovery ratio must use known-position committed capital as denominator'
  );
  assert(
    fleetMetrics.capital_recovery?.known_position_count === 15 &&
      fleetMetrics.capital_recovery?.closed_position_count === 15,
    'Fleet recovery must preserve position counts'
  );
  assert(fleetMetrics.character_id === 0, 'Fleet character_id should be 0 (no fake EVE ID)');
  assert(fleetMetrics.recent_trade_cycles.length === 2, 'Should contain all trade cycles from both characters');
  assert(fleetMetrics.recent_trade_cycles[0].character_name === 'Trader Alpha' || fleetMetrics.recent_trade_cycles[1].character_name === 'Trader Alpha', 'Cycles must preserve character attribution');
  console.log('  [PASS] Test 3: Fleet aggregation validated.');

  // Test 4: Financial Isolation Guard (CrossCharacterFinancialMappingViolationError)
  console.log('--- Test 4: Strict Financial Isolation Guard ---');
  const mixedTxs: EveCharacterTransaction[] = [
    {
      transaction_id: 1,
      character_id: 1001,
      character_name: 'Trader Alpha',
      date: '2026-03-30T10:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 5.0,
      quantity: 100,
      is_buy: true,
      is_personal: true,
      client_id: 9001,
    },
    {
      transaction_id: 2,
      character_id: 1002,
      character_name: 'Trader Beta',
      date: '2026-03-30T11:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 6.0,
      quantity: 100,
      is_buy: false,
      is_personal: true,
      client_id: 9002,
    },
  ];

  let threwViolation = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, mixedTxs);
  } catch (err) {
    if (err instanceof CrossCharacterFinancialMappingViolationError) {
      threwViolation = true;
    }
  }
  assert(threwViolation, 'RealizedFinancialOutcomeEngine must reject mixed character transactions array');
  console.log('  [PASS] Test 4: CrossCharacterFinancialMappingViolationError properly enforced.');

  // Test 5: Partial Fleet Data (Unavailable Characters)
  console.log('--- Test 5: Partial Fleet Data Handling ---');
  const resultsWithUnavailable: CharacterFinancialResult[] = [
    {
      characterId: '1001',
      characterName: 'Trader Alpha',
      metrics: metricsA,
      dataHealth: 'fresh',
    },
    {
      characterId: '1003',
      characterName: 'Trader Gamma (Expired)',
      metrics: createMockMetrics(1003, 'Trader Gamma', 0, 0, 0, 0),
      dataHealth: 'unavailable',
      errorMessage: 'Token expired (401)',
    },
  ];

  const partialFleet = FleetFinancialEngine.aggregateFleet(resultsWithUnavailable, scopeFleet);
  assert(partialFleet.hasUnavailableCharacters === true, 'hasUnavailableCharacters should be true');
  assert(partialFleet.unavailableCharacterNames.includes('Trader Gamma (Expired)'), 'Should report Trader Gamma as unavailable');
  assert(partialFleet.participatingCharacterCount === 1, 'Only 1 character should participate in calculation');
  assert(partialFleet.fleetMetrics.total_realized_profit === 50_000_000, 'Profit should equal only valid character');
  console.log('  [PASS] Test 5: Partial fleet data handling validated.');

  // Test 6: Invariant & Immutability Checks
  console.log('--- Test 6: Invariance & Immutability ---');
  const fleetRes = FleetFinancialEngine.aggregateFleet(characterResults, scopeFleet);
  assert(Object.isFrozen(fleetRes), 'FleetFinancialResult must be frozen');
  assert(Object.isFrozen(fleetRes.fleetMetrics), 'fleetMetrics must be frozen');
  console.log('  [PASS] Test 6: Invariance and immutability verified.');

  // Test 7: Fleet consolidated scope permits explicit cross-character economic continuity
  console.log('--- Test 7: Fleet consolidated accounting preserves cross-character economic continuity ---');
  const pilotA_buyTxs: EveCharacterTransaction[] = [
    {
      transaction_id: 88801,
      character_id: 1001,
      character_name: 'Pilot Alpha',
      date: '2026-03-29T10:00:00Z',
      type_id: 280, // Livestock
      location_id: 60003760,
      unit_price: 10_000,
      quantity: 547,
      is_buy: true,
      is_personal: true,
      client_id: 9001,
    },
  ];

  const pilotB_sellTxs: EveCharacterTransaction[] = [
    {
      transaction_id: 88802,
      character_id: 1002,
      character_name: 'Pilot Beta',
      date: '2026-03-30T10:00:00Z',
      type_id: 280, // Livestock
      location_id: 60008494,
      unit_price: 15_000,
      quantity: 547,
      is_buy: false,
      is_personal: true,
      client_id: 9002,
    },
  ];

  const allFleetTxs = [...pilotA_buyTxs, ...pilotB_sellTxs];
  const charFleetConfig = [
    { character_id: 1001, character_name: 'Pilot Alpha', accounting_level: 5, broker_relations_level: 5 },
    { character_id: 1002, character_name: 'Pilot Beta', accounting_level: 5, broker_relations_level: 5 },
  ];

  const fleetConsolidatedResult = TraderAnalyticsService.processFleetConsolidatedTransactions(
    charFleetConfig,
    allFleetTxs
  );

  assert(fleetConsolidatedResult.total_closed_trades === 1, 'Cross-character BUY -> SELL must close the shared economic position');
  assert(fleetConsolidatedResult.has_unmatched_trades === false, 'Fully allocated cross-character sale must not remain unmatched');
  assert(fleetConsolidatedResult.unmatched_trades_count === 0, 'No unmatched trade remains when the shared scope covers the disposal');
  const cycles = fleetConsolidatedResult.recent_trade_cycles;
  assert(cycles.length === 1, 'One consolidated disposal cycle must be produced');
  const cycle = cycles[0];
  assert(cycle.quantity === 547, 'The disposal must consume all 547 acquired units');
  assert(cycle.unmatched_sell_quantity === 0, 'The disposal must have no unmatched quantity');
  assert(cycle.position_lifecycle === 'CLOSED', 'The shared economic position must be closed after full disposal');
  assert(cycle.character_id === 1002, 'Disposal attribution must remain on Pilot Beta');
  assert(cycle.character_name === 'Pilot Beta', 'Disposal character attribution must remain on Pilot Beta');
  console.log('  [PASS] Test 7: Fleet consolidated scope preserves economic continuity while retaining character attribution.');

  console.log('===============================================================');
  console.log('ALL PHASE 3 MULTI-CHARACTER & FLEET FINANCIAL TESTS PASSED (100%)');
  console.log('===============================================================');
}

runFleetFinancialTests();
