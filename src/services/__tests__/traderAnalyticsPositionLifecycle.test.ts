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

  assert(metrics.total_realized_profit > 0, 'the disposed unit may produce realized profit');
  assert(metrics.total_closed_trades === 0, 'a partial disposal must not count as a closed trade');
  assert(metrics.win_rate_pct === null, 'win rate must be unavailable when no position is fully closed');
  assert(metrics.profitable_trades === 0, 'a partially realized position must not count as a profitable closed trade');
  assert(metrics.recent_trade_cycles.length === 1, 'the realized disposal remains visible as an event');
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

  console.log('[PASS] FIN-002 position-based analytics semantics validated.');
}

run();
