import { PriceLadderEngine } from '../ladder';
import { InterRegionalFinancialEngine } from '../interRegional';
import { TradableQuantityEngine } from '../quantity';
import { MAJOR_MARKET_HUBS } from '../../data/universe';
import {
  EveTypeDetail,
  FinancialConfig,
  RawMarketOrder,
  MarketHub,
  HistoricalStats,
  MarketDataQuality,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runExecutionSimulationTests() {
  console.log('=== RUNNING EXECUTION SIMULATION & ORDER BOOK TESTS ===');

  const jitaHub = MAJOR_MARKET_HUBS.find((h) => h.id === 'jita')!;
  const amarrHub = MAJOR_MARKET_HUBS.find((h) => h.id === 'amarr')!;

  const testTritanium: EveTypeDetail = {
    type_id: 34,
    name: 'Tritanium',
    volume: 0.01,
    group_id: 18,
    category_id: 4,
    portion_size: 1,
  };

  const testCruiser: EveTypeDetail = {
    type_id: 624,
    name: 'Caracal',
    volume: 10000.0,
    group_id: 26,
    category_id: 6,
    portion_size: 1,
  };

  const baseConfig: FinancialConfig = {
    broker_fee: 0.02,
    sales_tax: 0.036,
    available_capital: 1000000000,
    max_capital_per_trade: 500000000,
    max_cargo_m3: 5000,
    enable_transport_costs: true,
    transport_cost_per_m3: 15.0,
    transport_cost_per_jump: 100.0,
    min_roi: 0.02,
    min_net_profit: 10000,
    max_days_to_sell: 14,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
    accounting_level: 5,
    broker_relations_level: 5,
    advanced_broker_relations_level: 5,
    faction_standing: 0,
    corp_standing: 0,
  };

  // 1. Multi-Level Order Book Aggregation and Execution Simulation
  console.log('1. Testing Multi-Level Order Book Aggregation and Execution Simulation...');
  const rawOrders: RawMarketOrder[] = [
    {
      order_id: '101',
      type_id: 34,
      system_id: 30000142,
      region_id: 10000002,
      location_id: 60003760,
      price: 5.0,
      volume_remain: 1000,
      volume_total: 1000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
      order_range: 'region',
    },
    {
      order_id: '102',
      type_id: 34,
      system_id: 30000142,
      region_id: 10000002,
      location_id: 60003760,
      price: 5.0,
      volume_remain: 2500,
      volume_total: 3000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
      order_range: 'region',
    },
    {
      order_id: '103',
      type_id: 34,
      system_id: 30000142,
      region_id: 10000002,
      location_id: 60003760,
      price: 5.5,
      volume_remain: 5000,
      volume_total: 5000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
      order_range: 'region',
    },
  ];

  const levels = PriceLadderEngine.aggregate(rawOrders, false);
  assert(levels.length === 2, 'Should aggregate 3 orders into 2 price levels');
  assert(levels[0].price === 5.0, 'Best price should be 5.0');
  assert(levels[0].volume === 3500, 'Volume at 5.0 should be 3500');
  assert(levels[0].orders === 2, 'Order count at 5.0 should be 2');
  assert(levels[0].order_ids?.length === 2, 'Order IDs should be preserved');

  // Multi-level slippage simulation
  const sellLevels = [
    { price: 100, volume: 10, orders: 1, cumulative: 10 },
    { price: 110, volume: 20, orders: 1, cumulative: 30 },
    { price: 120, volume: 30, orders: 1, cumulative: 60 },
  ];

  // Request 25 units: 10 @ 100 + 15 @ 110 = 2650 ISK, avg price = 2650 / 25 = 106 ISK
  const fill = PriceLadderEngine.simulateExecution(sellLevels, 25, false);
  assert(fill.filled_quantity === 25, 'Filled quantity must equal 25');
  assert(fill.effective_price === 106, 'Effective average price must be 106 ISK');
  assert(fill.top_of_book_price === 100, 'Top of book must be 100 ISK');
  assert(fill.total_cost_or_revenue === 2650, 'Total cost must be 2650 ISK');
  assert(fill.levels_exhausted === 2, 'Must exhaust 2 book levels');
  assert(fill.slippage_isk === 6, 'Slippage ISK must be 6 ISK');
  assert(Math.abs(fill.slippage_pct - 0.06) < 1e-4, 'Slippage pct must be 6%');
  assert(fill.remaining_book_liquidity === 35, 'Remaining liquidity must be 35 units');
  assert(fill.levels_consumed_detail?.length === 2, 'Consumed detail must have 2 entries');

  console.log('✅ Multi-Level Order Book Aggregation and Execution Simulation verified.');

  // 2. Spatial & Hub Accessibility Rules
  console.log('2. Testing Spatial & Hub Accessibility Rules...');
  const spatialOrders: RawMarketOrder[] = [
    {
      order_id: '201',
      type_id: 34,
      system_id: jitaHub.system_id,
      region_id: jitaHub.region_id,
      location_id: jitaHub.station_id,
      price: 5.0,
      volume_remain: 10000,
      volume_total: 10000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
    },
    {
      order_id: '202',
      type_id: 34,
      system_id: 30000144, // Perimeter
      region_id: jitaHub.region_id,
      location_id: 60003761, // Remote station
      price: 4.0, // Cheaper but remote
      volume_remain: 10000,
      volume_total: 10000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
    },
  ];

  const sourceAccessible = InterRegionalFinancialEngine.filterAccessibleOrdersForHub(
    spatialOrders,
    jitaHub,
    true,
    false
  );
  assert(sourceAccessible.length === 1, 'Only 1 order must be accessible at source hub station');
  assert(sourceAccessible[0].order_id === '201', 'Accessible order must be 201');

  console.log('✅ Spatial & Hub Accessibility Rules verified.');

  // 3. Multi-Constraint Quantity Resolution
  console.log('3. Testing Multi-Constraint Quantity Resolution & Bottlenecks...');
  const cargoRes = InterRegionalFinancialEngine.determineTradableQuantity(
    10000000,
    testCruiser.volume, // 10,000 m3
    100,
    100,
    { from_system_id: jitaHub.system_id, to_system_id: amarrHub.system_id, jumps: 9, is_highsec_only: true, min_security: 0.5 },
    { ...baseConfig, max_cargo_m3: 5000 }
  );
  assert(cargoRes.quantity === 0, 'Cannot trade 10,000 m3 item with 5,000 m3 cargo capacity');
  assert(cargoRes.bottleneck === 'cargo', 'Bottleneck must be cargo');

  const capRes = InterRegionalFinancialEngine.determineTradableQuantity(
    5000000,
    0.01,
    100000,
    100000,
    { from_system_id: jitaHub.system_id, to_system_id: amarrHub.system_id, jumps: 9, is_highsec_only: true, min_security: 0.5 },
    { ...baseConfig, available_capital: 50000000, max_capital_per_trade: 25000000, enable_transport_costs: false }
  );
  assert(capRes.quantity === 5, '25M / 5M = 5 units max');
  assert(capRes.bottleneck === 'capital', 'Bottleneck must be capital');

  console.log('✅ Multi-Constraint Quantity Resolution verified.');

  // 4. Relist Market Context & Execution Simulation
  console.log('4. Testing Relist Market Context & Execution Simulation...');
  const destSellLevels = [
    { price: 100.0, volume: 500, orders: 3, cumulative: 500 },
    { price: 105.0, volume: 1000, orders: 5, cumulative: 1500 },
  ];
  const destHistory: HistoricalStats = {
    type_id: 34,
    region_id: amarrHub.region_id,
    daily_volume_7d_median: 1000,
    daily_volume_30d_median: 1000,
    volume_trend: 'stable',
    price_volatility: 0.10,
    price_median_30d: 100,
    daily_order_count_avg: 50,
  };
  const relist = InterRegionalFinancialEngine.computeCapturableVolumeAndRelistContext(
    destSellLevels,
    destHistory,
    200,
    80.0,
    baseConfig
  );
  assert(relist.suggestedRelistPrice === 99.99, 'Relist price should undercut lowest sell by 0.01');
  assert(relist.relistContext.is_estimated_execution === true, 'Relist must be flagged as estimated execution');
  assert(relist.expectedCapturableVolumePerDay > 0, 'Expected capturable volume must be > 0');
  assert(relist.expectedDaysToSell > 0, 'Expected days to sell must be > 0');

  console.log('✅ Relist Market Context verified.');

  // 5. Hard Rejections & Score Protection
  console.log('5. Testing Hard Rejection Logic...');
  const unviableResult = InterRegionalFinancialEngine.evaluateHardRejection(
    100,
    {
      purchase_cost: 1000000,
      buy_broker_fee: 20000,
      transport_cost: 50000,
      total_acquisition_cost: 1070000,
      gross_revenue: 1050000,
      sales_tax: 37800,
      sell_broker_fee: 21000,
      total_exit_fees: 58800,
      net_revenue: 991200,
      net_profit: -78800,
      profit_per_unit: -788,
      roi: -0.0736,
      margin: -0.0795,
      capital_locked: 1070000,
    },
    1.0,
    baseConfig,
    [{ price: 10000, volume: 100, orders: 1, cumulative: 100 }],
    [{ price: 10500, volume: 100, orders: 1, cumulative: 100 }]
  );
  assert(unviableResult.is_viable === false, 'Negative net profit must be hard-rejected');
  assert(unviableResult.rejection_reasons.some((r) => r.includes('négatif')), 'Must state negative net profit reason');

  console.log('✅ Hard Rejection Logic verified.');

  // 6. Explicability Rationale Generation
  console.log('6. Testing Explicability Rationale Generation...');
  const buyRegionOrders: RawMarketOrder[] = [
    {
      order_id: '401',
      type_id: 34,
      system_id: jitaHub.system_id,
      region_id: jitaHub.region_id,
      location_id: jitaHub.station_id,
      price: 5.0,
      volume_remain: 100000,
      volume_total: 100000,
      min_volume: 1,
      is_buy_order: false,
      duration: 90,
      issued: new Date().toISOString(),
    },
  ];
  const sellRegionOrders: RawMarketOrder[] = [
    {
      order_id: '402',
      type_id: 34,
      system_id: amarrHub.system_id,
      region_id: amarrHub.region_id,
      location_id: amarrHub.station_id,
      price: 7.0,
      volume_remain: 50000,
      volume_total: 50000,
      min_volume: 1,
      is_buy_order: true,
      duration: 90,
      issued: new Date().toISOString(),
      order_range: 'station',
    },
  ];

  const opp = InterRegionalFinancialEngine.calculateOpportunity(
    testTritanium,
    jitaHub,
    amarrHub,
    'immediate',
    baseConfig,
    buyRegionOrders,
    sellRegionOrders,
    {},
    {},
    buyRegionOrders
  );

  assert(opp !== null, 'Opportunity must be detected');
  assert(opp?.explanation !== undefined, 'Opportunity explanation must be defined');
  assert(Boolean(opp?.explanation?.why_detected.includes('Tritanium')), 'Explanation must include item name');
  assert(opp?.explanation?.why_this_quantity.bottleneck !== undefined, 'Why quantity must have bottleneck');
  assert(opp?.explanation?.why_this_price.source_effective_price === 5.0, 'Source price must match 5.0');
  assert((opp?.explanation?.why_this_profit.net_profit ?? 0) > 0, 'Net profit must be positive');
  assert(opp?.explanation?.why_this_delay.strategy === 'immediate', 'Delay strategy must be immediate');
  assert(
    (opp?.explanation?.why_this_confidence.overall_confidence ?? 0) === 0,
    'Missing market quality must not receive fabricated confidence'
  );

  console.log('✅ Explicability Rationale Generation verified.');
  console.log('🎉 ALL EXECUTION SIMULATION & ORDER BOOK TESTS PASSED WITH 100% SUCCESS!');
}

runExecutionSimulationTests();
