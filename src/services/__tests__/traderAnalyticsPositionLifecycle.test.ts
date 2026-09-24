import { EveCharacterTransaction } from '../../types';
import { TraderAnalyticsService } from '../traderAnalytics';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function tx(
  transaction_id: number,
  is_buy: boolean,
  quantity: number,
  unit_price: number,
  date: string,
): EveCharacterTransaction {
  return {
    transaction_id,
    character_id: 1001,
    character_name: 'Test Trader',
    date,
    type_id: 34,
    type_name: 'Tritanium',
    location_id: 60003760,
    location_name: 'Jita 4-4',
    unit_price,
    quantity,
    is_buy,
    is_personal: true,
    client_id: 9001,
  };
}

function run() {
  console.log('=== FIN-002 POSITION-BASED ANALYTICS TESTS ===');

  const metrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [
      tx(100, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(200, false, 1, 140, '2026-09-21T10:00:00Z'),
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER' },
  );

  assert(metrics.total_realized_profit !== null && metrics.total_realized_profit > 0, 'the disposed unit may produce realized profit');
  assert(metrics.realized_profit_scope === 'DISPOSAL_ALLOCATIONS', 'total realized profit is disposal-scoped');
  assert(metrics.top_profitable_items.length === 0, 'partial positions must not enter top profitable items');
  assert(Object.keys(metrics.category_success_rate).length === 0, 'partial positions must not enter category success statistics');
  assert(metrics.total_closed_trades === 0, 'a partial disposal must not count as a closed trade');
  assert(metrics.win_rate_pct === null, 'win rate must be unavailable when no position is fully closed');
  assert(metrics.profitable_trades === 0, 'a partially realized position must not count as a profitable closed trade');
  assert(
    TraderAnalyticsService.calibrateOpportunity(34, 4, metrics).historical_avg_roi === null,
    'personal calibration ROI must remain unavailable without historical sample',
  );
  assert(
    TraderAnalyticsService.calibrateOpportunity(34, 4, metrics).historical_win_rate === null,
    'personal calibration win rate must remain unavailable without historical sample',
  );
  assert(
    TraderAnalyticsService.calibrateOpportunity(34, 4, metrics).historical_avg_hold_days === null,
    'personal calibration hold time must remain unavailable without historical sample',
  );
  assert(metrics.recent_trade_cycles.length === 1, 'the realized disposal remains visible as an event');
  assert(metrics.recent_trade_cycles[0].realized_result_scope === 'DISPOSAL_ALLOCATION', 'cycle result is disposal-scoped');
  assert(
    metrics.recent_trade_cycles[0].position_lifecycle === 'PARTIALLY_REALIZED',
    'the sale event must retain the partial position lifecycle',
  );
  assert(
    metrics.recent_trade_cycles[0].position_remaining_quantity === 9_999,
    'the sale event must expose the remaining 9,999 units',
  );
  assert(
    metrics.recent_trade_cycles[0].is_position_closed === false,
    'the partial sale event must not be marked closed',
  );
  assert(metrics.recent_trade_cycles[0].operation_id !== undefined, 'partial disposal must expose its economic operation identity');
  assert(metrics.recent_trade_cycles[0].operation_recovery_delta === -999_860, 'analytics must expose cumulative operation recovery delta');
  assert(metrics.recent_trade_cycles[0].operation_recovery_state === 'NEGATIVE', 'analytics must expose negative recovery state');


  const progressiveMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [
      tx(250, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(260, false, 7_143, 140, '2026-09-21T10:00:00Z'),
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER' },
  );
  const progressiveCycle = progressiveMetrics.recent_trade_cycles[0];
  assert(progressiveCycle.position_lifecycle === 'PARTIALLY_REALIZED', 'progressive recovery must not close the position');
  assert(progressiveCycle.operation_recovery_delta === 20, 'operation recovery must reach +20 ISK');
  assert(progressiveCycle.operation_recovery_state === 'POSITIVE', 'positive recovery must be visible before closure');
  assert(progressiveCycle.position_remaining_quantity === 2_857, 'progressive recovery must keep remaining exposure visible');

  const closedMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [
      tx(300, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(400, false, 10_000, 140, '2026-09-21T10:00:00Z'),
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER' },
  );

  assert(closedMetrics.total_closed_trades === 1, 'a fully disposed position must count as one closed trade');
  assert(closedMetrics.profitable_trades === 1, 'a fully disposed profitable position must count as profitable');
  assert(closedMetrics.average_realized_roi_scope === 'CLOSED_POSITIONS', 'average realized ROI is closed-position scoped');
  assert(closedMetrics.recent_trade_cycles[0].position_net_profit !== undefined, 'closed cycle exposes whole-position result');
  assert(closedMetrics.recent_trade_cycles[0].position_total_quantity === 10_000, 'closed cycle exposes whole-position quantity');
  assert(closedMetrics.recent_trade_cycles[0].position_is_profitable === true, 'closed position profitability comes from whole-position result');

  const closedThenPartialMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [
      tx(310, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(320, false, 10_000, 140, '2026-09-21T10:00:00Z'),
      tx(330, true, 10_000, 100, '2026-09-22T10:00:00Z'),
      tx(340, false, 1, 50, '2026-09-23T10:00:00Z'),
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER' },
  );

  const categoryStats = Object.values(closedThenPartialMetrics.category_success_rate);
  assert(categoryStats.length === 1, 'category statistics should contain the traded category');
  assert(categoryStats[0].total_trades === 1, 'category total_trades must count closed positions, not partial disposals');
  assert(
    categoryStats[0].profit_isk === closedThenPartialMetrics.recent_trade_cycles.find((cycle) => cycle.cycle_id === 'cycle_320_34')?.position_net_profit,
    'category profit must use the cumulative closed-position result only',
  );

  const multiDisposalMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [
      tx(500, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(501, false, 1, 140, '2026-09-21T10:00:00Z'),
      tx(502, false, 9_999, 90, '2026-09-22T10:00:00Z'),
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER' },
  );
  assert(multiDisposalMetrics.total_closed_trades === 1, 'multiple disposals of one position count as one closure');
  assert(multiDisposalMetrics.profitable_trades === 0, 'whole-position loss must override a positive partial disposal');
  const firstDisposal = multiDisposalMetrics.recent_trade_cycles.find((cycle) => cycle.cycle_id === 'cycle_501_34');
  const closingDisposal = multiDisposalMetrics.recent_trade_cycles.find((cycle) => cycle.cycle_id === 'cycle_502_34');
  assert(firstDisposal?.is_profitable === true, 'positive partial disposal remains a visible sub-result');
  assert(firstDisposal?.position_net_profit === undefined, 'partial disposal must not publish whole-position result');
  assert(closingDisposal?.position_net_profit !== undefined, 'closing disposal publishes cumulative whole-position result');
  assert((closingDisposal?.position_net_profit ?? 0) < 0, 'cumulative whole-position result must be negative');
  assert(closingDisposal?.position_total_quantity === 10_000, 'closing disposal exposes the full position quantity');
  assert(closingDisposal?.position_is_profitable === false, 'whole-position profitability must be negative');

  const orderOnlyMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [],
    [{
      order_id: '7429091434',
      type_id: 34,
      type_name: 'Tritanium',
      region_id: 10000002,
      location_id: 60003760,
      price: 140,
      volume_remain: 0,
      volume_total: 1,
      is_buy_order: false,
      issued: '2026-09-20T10:00:00Z',
      duration: 90,
      state: 'fulfilled',
    }],
    [],
    5,
    5,
  );

  assert(orderOnlyMetrics.total_buy_volume === 0, 'order side must not create accounting buy volume without a transaction fact');
  assert(orderOnlyMetrics.total_sell_volume === 0, 'order side must not create accounting sell volume without a transaction fact');
  assert(
    orderOnlyMetrics.observed_fulfilled_order_activity_isk === 140,
    'fulfilled order history must remain available as observation-only activity',
  );

  let crossCharacterImplicitScopeRejected = false;
  try {
    TraderAnalyticsService.processTransactions(
      1001,
      'Test Trader A',
      [
        tx(610, true, 10_000, 100, '2026-09-20T10:00:00Z'),
        { ...tx(620, false, 1, 140, '2026-09-20T11:00:00Z'), character_id: 1002, character_name: 'Test Trader B' },
      ],
      [],
      [],
      5,
      5,
      { executionFeeMode: 'TAKER_TAKER' },
    );
  } catch (error) {
    crossCharacterImplicitScopeRejected = String(error).includes('explicit accounting_scope_id');
  }
  assert(
    crossCharacterImplicitScopeRejected,
    'multi-character transaction sets must not silently inherit a character accounting scope',
  );

  let foreignCharacterImplicitScopeRejected = false;
  try {
    TraderAnalyticsService.processTransactions(
      1001,
      'Test Trader A',
      [
        { ...tx(630, true, 10, 100, '2026-09-20T10:00:00Z'), character_id: 1002, character_name: 'Test Trader B' },
      ],
      [],
      [],
      5,
      5,
      { executionFeeMode: 'TAKER_TAKER' },
    );
  } catch (error) {
    foreignCharacterImplicitScopeRejected = String(error).includes('different character');
  }
  assert(
    foreignCharacterImplicitScopeRejected,
    'a foreign single-character transaction set must not inherit the reporting character scope',
  );

  const crossCharacterMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader A',
    [
      tx(600, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      { ...tx(700, false, 1, 140, '2026-09-20T11:00:00Z'), character_id: 1002, character_name: 'Test Trader B' },
    ],
    [],
    [],
    5,
    5,
    { executionFeeMode: 'TAKER_TAKER', accounting_scope_id: 'ecosystem:test' },
  );
  assert(crossCharacterMetrics.total_closed_trades === 0, 'cross-character partial lifecycle must remain open');
  assert(crossCharacterMetrics.recent_trade_cycles[0].character_id === 1002, 'disposal remains attributed to character B');
  assert(crossCharacterMetrics.recent_trade_cycles[0].position_remaining_quantity === 9_999, 'shared position keeps 9,999 units');

  const orphanMetrics = TraderAnalyticsService.processTransactions(
    1001,
    'Test Trader',
    [tx(500, false, 1, 140, '2026-09-22T10:00:00Z')],
    [],
    [],
    5,
    5,
  );
  const orphanCycle = orphanMetrics.recent_trade_cycles[0];
  assert(orphanCycle.roi === null, 'An orphan sale must expose ROI as unavailable rather than 0%');
  assert(orphanCycle.financial_completeness === 'PARTIAL', 'An orphan sale remains financially PARTIAL');
  assert(orphanMetrics.average_realized_roi === null, 'Average realized ROI must be unavailable without a closed-position denominator');

  console.log('[PASS] FIN-002 position-based analytics semantics validated.');
}

run();