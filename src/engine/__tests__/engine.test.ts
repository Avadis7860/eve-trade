import { FeeEngine, FeeCalculator } from '../fee';
import { PriceLadderEngine, PriceLadder } from '../ladder';
import { TradableQuantityEngine } from '../quantity';
import { ProfitEngine } from '../profit';
import { OpportunityScoringEngine } from '../scoring';
import { InterRegionalFinancialEngine } from '../interRegional';
import { RawMarketOrder, MarketHub, EveTypeDetail, FinancialConfig } from '../../types';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { MAJOR_MARKET_HUBS } from '../../data/universe';
import { getEveTickSize, roundToEveTick } from '../money';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runAllTests() {
  console.log('--- RUNNING ENGINE UNIT TESTS ---');

  // 1. FeeEngine tests
  console.log('1. Testing FeeEngine...');
  // Sales tax by accounting level
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(0) - 0.08) < 1e-6, 'Sales Tax at level 0 should be 8.00%');
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(1) - 0.0712) < 1e-6, 'Sales Tax at level 1 should be 7.12%');
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(2) - 0.0624) < 1e-6, 'Sales Tax at level 2 should be 6.24%');
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(3) - 0.0536) < 1e-6, 'Sales Tax at level 3 should be 5.36%');
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(4) - 0.0448) < 1e-6, 'Sales Tax at level 4 should be 4.48%');
  assert(Math.abs(FeeEngine.calculateSalesTaxRate(5) - 0.0360) < 1e-6, 'Sales Tax at level 5 should be 3.60%');

  // NPC Broker fee
  const npcBase = FeeEngine.calculateNpcBrokerFeeRate(0, 0, 0);
  assert(Math.abs(npcBase - 0.03) < 1e-6, 'NPC Broker fee with 0 skills/standings should be 3.00%');
  const npcMaxSkills = FeeEngine.calculateNpcBrokerFeeRate(5, 0, 0);
  assert(Math.abs(npcMaxSkills - 0.015) < 1e-6, 'NPC Broker fee with Level 5 BR should be 1.50%');
  const npcMaxAll = FeeEngine.calculateNpcBrokerFeeRate(5, 10, 10);
  assert(Math.abs(npcMaxAll - 0.01) < 1e-6, 'NPC Broker fee with max skills & standings should cap at 1.00%');

  // Structure Broker fee
  const structureFee = FeeEngine.calculateStructureBrokerFeeRate(0.01, 0.005);
  assert(Math.abs(structureFee - 0.015) < 1e-6, 'Structure Broker fee with 1.0% base + 0.5% SCC surcharge should be 1.50%');

  // Relist Fee
  const relistFee = FeeEngine.calculateRelistFeeRate(0.015, 5);
  assert(Math.abs(relistFee - 0.01125) < 1e-6, 'Relist Fee with 5 levels of Adv BR should be 1.5% * (1 - 0.25) = 1.125%');

  console.log('✅ FeeEngine passed all assertions.');

  // 2. PriceLadderEngine tests
  console.log('2. Testing PriceLadderEngine...');
  const emptyLadder = PriceLadderEngine.buildBuyLadder([], 100);
  assert(emptyLadder.fulfilled_quantity === 0 && emptyLadder.levels.length === 0, 'Empty orders should produce 0 fill');

  const testSellOrders: RawMarketOrder[] = [
    { order_id: 1, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 5.0, volume_remain: 100, volume_total: 100, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
    { order_id: 2, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 5.0, volume_remain: 200, volume_total: 200, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
    { order_id: 3, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 6.0, volume_remain: 300, volume_total: 300, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
  ];

  // Consume 250 units (all at price 5.0 across orders 1 & 2)
  const ladder250 = PriceLadderEngine.buildBuyLadder(testSellOrders, 250);
  assert(ladder250.fulfilled_quantity === 250, 'Ladder should fulfill requested 250 units');
  assert(ladder250.effective_average_price === 5.0, 'Average price for 250 units should be exactly 5.0');
  assert(ladder250.slippage_percent === 0, 'Slippage for level 1 should be 0%');

  // Consume 400 units (300 at 5.0, 100 at 6.0)
  const ladder400 = PriceLadderEngine.buildBuyLadder(testSellOrders, 400);
  assert(ladder400.fulfilled_quantity === 400, 'Ladder should fulfill 400 units');
  // Total cost = (300 * 5) + (100 * 6) = 1500 + 600 = 2100 => avg = 2100 / 400 = 5.25
  assert(Math.abs(ladder400.effective_average_price - 5.25) < 1e-6, 'Weighted avg price should be 5.25');
  assert(ladder400.top_of_book_price === 5.0, 'Top of book price should be 5.0');
  assert(Math.abs(ladder400.slippage_amount - 0.25) < 1e-6, 'Slippage amount should be 0.25');
  assert(Math.abs(ladder400.slippage_percent - 5.0) < 1e-6, 'Slippage percent should be 5.0%');

  console.log('✅ PriceLadderEngine passed all assertions.');

  // 3. TradableQuantityEngine tests
  console.log('3. Testing TradableQuantityEngine...');
  const qtyLimit = TradableQuantityEngine.calculateTradableQuantity({
    capital_limit: 1000,
    cargo_limit_m3: 100,
    unit_volume_m3: 2,
    source_available_units: 500,
    dest_available_units: 300,
    estimated_unit_buy_price: 10,
  });
  // Capital allows 1000 / 10 = 100 units
  // Cargo allows 100 / 2 = 50 units
  // Source allows 500
  // Dest allows 300
  // Min is 50 units
  assert(qtyLimit.tradable_quantity === 50, `Expected 50 units tradable, got ${qtyLimit.tradable_quantity}`);
  assert(qtyLimit.bottleneck === 'cargo', `Expected bottleneck 'cargo', got ${qtyLimit.bottleneck}`);

  console.log('✅ TradableQuantityEngine passed all assertions.');

  // 4. ProfitEngine tests
  console.log('4. Testing ProfitEngine...');
  const breakdown = ProfitEngine.calculateBreakdown({
    quantity: 100,
    effective_buy_price: 1000,
    effective_sell_price: 1500,
    unit_volume: 1,
    jumps: 10,
    config: {
      enable_transport_costs: true,
      transport_cost_per_m3: 10,
      transport_cost_per_jump: 50000,
      collateral_fee_pct: 0.01,
      broker_fee: 0.015,
      sales_tax: 0.036,
    },
    strategy: 'relist',
    buy_fee_profile: {
      location_id: 60003760,
      location_name: 'Jita IV - 4',
      location_type: 'npc_station',
      base_broker_fee_rate: 0.03,
      effective_broker_fee_rate: 0.015,
      scc_surcharge_rate: 0,
      relist_fee_rate: 0.01125,
      is_player_structure: false,
    },
    sell_fee_profile: {
      location_id: 60008494,
      location_name: 'Amarr VIII',
      location_type: 'npc_station',
      base_broker_fee_rate: 0.03,
      effective_broker_fee_rate: 0.015,
      scc_surcharge_rate: 0,
      relist_fee_rate: 0.01125,
      is_player_structure: false,
    },
  });

  // Gross purchase = 100 * 1000 = 100,000
  assert(breakdown.gross_purchase_cost === 100000, 'Gross purchase cost should be 100,000');
  // Taker buy broker fee = 0
  assert(breakdown.buy_broker_fee_cost === 0, 'Taker buy broker fee should be 0');
  // Transport: m3 (100 * 10 = 1000) + jumps (10 * 50000 = 500,000) + collateral (100,000 * 0.01 = 1000) = 502,000
  assert(breakdown.transport_cost === 502000, `Transport cost should be 502,000, got ${breakdown.transport_cost}`);
  // Total acquisition = 100,000 + 502,000 = 602,000
  assert(breakdown.total_acquisition_cost === 602000, `Total acquisition cost should be 602,000, got ${breakdown.total_acquisition_cost}`);
  // Gross revenue = 100 * 1500 = 150,000
  assert(breakdown.gross_revenue === 150000, 'Gross revenue should be 150,000');
  // Sales tax = 150,000 * 0.036 = 5,400
  assert(breakdown.sales_tax_cost === 5400, 'Sales tax should be 5,400');
  // Sell broker fee (Relist maker) = 150,000 * 0.015 = 2,250
  assert(breakdown.sell_broker_fee_cost === 2250, 'Sell broker fee should be 2,250');
  // Total exit fees = 5,400 + 2,250 = 7,650
  assert(breakdown.total_exit_fees === 7650, 'Total exit fees should be 7,650');
  // Net revenue = 150,000 - 7,650 = 142,350
  assert(breakdown.net_revenue === 142350, 'Net revenue should be 142,350');
  // Net profit = 142,350 - 602,000 = -459,650 (negative due to large transport cost on small volume)
  assert(breakdown.net_profit === -459650, 'Net profit should be -459,650');

  console.log('✅ ProfitEngine passed all assertions.');

  // 5. InterRegional Hub Order Filtering Tests
  console.log('5. Testing Hub Location Filtering & Arbitrage...');
  const jitaHub = MAJOR_MARKET_HUBS.find((h) => h.id === 'jita')!;
  const amarrHub = MAJOR_MARKET_HUBS.find((h) => h.id === 'amarr')!;

  const testType: EveTypeDetail = {
    type_id: 34,
    name: 'Tritanium',
    description: 'Basic mineral',
    volume: 0.01,
    group_id: 18,
    group_name: 'Mineral',
    category_id: 4,
    category_name: 'Material',
    average_price: 5.5,
  };

  const sampleRegionalOrders: Record<number, RawMarketOrder[]> = {
    // The Forge (10000002) - Jita
    10000002: [
      // Sell order at Jita 4-4 station
      { order_id: 101, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 4.5, volume_remain: 1000000, volume_total: 1000000, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
      // Sell order at remote station in The Forge (should NOT be accessible at Jita 4-4!)
      { order_id: 102, type_id: 34, location_id: 60003761, system_id: 30000143, region_id: 10000002, price: 2.0, volume_remain: 5000000, volume_total: 5000000, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
    ],
    // Domain (10000043) - Amarr
    10000043: [
      // Sell orders at Amarr VIII station for relist competition
      { order_id: 201, type_id: 34, location_id: 60008494, system_id: 30002187, region_id: 10000043, price: 6.5, volume_remain: 500000, volume_total: 500000, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
      // Buy order with region-wide range (accessible from Amarr)
      { order_id: 202, type_id: 34, location_id: 60008494, system_id: 30002187, region_id: 10000043, price: 5.8, volume_remain: 200000, volume_total: 200000, is_buy_order: true, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 },
    ],
  };

  const testConfig: FinancialConfig = {
    available_capital: 500000000,
    enable_transport_costs: false,
    broker_fee: 0.015,
    sales_tax: 0.036,
    transport_cost_per_m3: 0,
    transport_cost_per_jump: 0,
    max_cargo_m3: 50000,
    min_roi: 0.02,
    min_net_profit: 10000,
    max_days_to_sell: 10,
    max_capital_per_trade: 200000000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
    accounting_level: 5,
    broker_relations_level: 5,
    corp_standing: 0,
    faction_standing: 0,
  };

  // Explicit Phase 2.6 preconditions: the fixture must exercise a verified canonical path.
  const catalogRepository = CatalogRepository.getInstance();
  assert(catalogRepository.isReady(), `Catalog precondition failed: ${JSON.stringify(catalogRepository.getMetadata())}`);

  const universeRepository = UniverseRepository.getInstance();
  assert(universeRepository.getIntegrity().isReady, `Universe precondition failed: ${JSON.stringify(universeRepository.getIntegrity())}`);

  const sourceResolution = universeRepository.resolveLocationSync(jitaHub.station_id);
  const destinationResolution = universeRepository.resolveLocationSync(amarrHub.station_id);
  assert(sourceResolution.is_verified, `Source location precondition failed: ${JSON.stringify(sourceResolution)}`);
  assert(destinationResolution.is_verified, `Destination location precondition failed: ${JSON.stringify(destinationResolution)}`);

  const fixtureRoute = universeRepository.getRoute(jitaHub.system_id, amarrHub.system_id);
  assert(
    fixtureRoute.status === 'KNOWN' && fixtureRoute.is_verified === true && fixtureRoute.jumps >= 0,
    `Route precondition failed: ${JSON.stringify(fixtureRoute)}`
  );

  const oppRelist = InterRegionalFinancialEngine.calculateOpportunity(
    testType,
    jitaHub,
    amarrHub,
    'relist',
    testConfig,
    sampleRegionalOrders[10000002],
    sampleRegionalOrders[10000043],
    { 10000002: { type_id: 34, region_id: 10000002, daily_volume_7d_median: 10000000, daily_volume_30d_median: 10000000, price_7d_avg: 4.5, price_30d_avg: 4.5, price_volatility: 0.02, is_live_esi: true }, 10000043: { type_id: 34, region_id: 10000043, daily_volume_7d_median: 5000000, daily_volume_30d_median: 5000000, price_7d_avg: 6.5, price_30d_avg: 6.5, price_volatility: 0.02, is_live_esi: true } }
  );

  assert(oppRelist !== null, 'Should produce a valid opportunity');
  // Buy price should be 4.5 (from Jita 4-4 station, NOT 2.0 from remote station 60003761!)
  assert(oppRelist!.top_of_book_buy_price === 4.5, `Expected top of book buy price 4.5, got ${oppRelist!.top_of_book_buy_price}`);
  assert(oppRelist!.effective_buy_price === 4.5, `Expected effective buy price 4.5, got ${oppRelist!.effective_buy_price}`);
  // Sell price for relist should undercut 6.5 by 0.01 => 6.49
  assert(Math.abs(oppRelist!.effective_sell_price - 6.49) < 1e-6, `Expected relist price 6.49, got ${oppRelist!.effective_sell_price}`);
  assert(oppRelist!.costs.net_profit > 0, 'Opportunity should be profitable');
  assert(oppRelist!.is_viable, 'Opportunity should be marked viable');

  console.log('✅ InterRegional Hub filtering passed all assertions.');

  // 6. Testing CCP Tick Sizes, Alpha Clone Caps & Min Volume Enforcement
  console.log('6. Testing CCP Tick Sizes, Alpha Clone Caps & Min Volume Enforcement...');

  // EVE Tick size: 4 significant figures, minimum floor 0.01 ISK
  assert(getEveTickSize(0.05) === 0.01, 'Tick size for 0.05 should be 0.01 (EVE minimum centisk floor)');
  assert(getEveTickSize(4.5) === 0.01, 'Tick size for 4.5 should be 0.01');
  assert(getEveTickSize(123456) === 100, 'Tick size for 123456 should be 100');
  assert(roundToEveTick(123456) === 123500, `Round 123456 to tick: expected 123500, got ${roundToEveTick(123456)}`);

  // Alpha Clone fee caps (capped at Level 3: 5.36% sales tax, 2.1% base broker fee)
  const alphaConfig: FinancialConfig = {
    ...testConfig,
    is_alpha_clone: true,
    accounting_level: 5, // user passed 5, but Alpha clone caps at 3
    broker_relations_level: 5, // user passed 5, but Alpha clone caps at 3
    sales_tax: undefined as any,
    broker_fee: undefined as any,
  };
  const alphaResolution = FeeEngine.resolveRates({ config: alphaConfig });
  assert(Math.abs(alphaResolution.sales_tax_rate - 0.0536) < 1e-6, `Alpha sales tax must be capped at 5.36%, got ${alphaResolution.sales_tax_rate}`);
  assert(Math.abs(alphaResolution.broker_fee_rate - 0.0210) < 1e-6, `Alpha broker fee must be capped at 2.10%, got ${alphaResolution.broker_fee_rate}`);

  // Min Volume execution check (selling into buy orders with min_volume)
  const levelsWithMinVol = [
    { price: 100, volume: 50, orders: 1, cumulative: 50, min_volume_max: 200 }, // min volume 200 > target 50
    { price: 90, volume: 100, orders: 1, cumulative: 150, min_volume_max: 1 },
  ];
  const fillMinVol = PriceLadder.simulateExecution(levelsWithMinVol, 50, true);
  assert(fillMinVol.filled_quantity === 50, 'Should fill 50 from second level');
  assert(fillMinVol.effective_price === 90, `Should execute at 90 skipping level with min_vol 200, got ${fillMinVol.effective_price}`);

  console.log('✅ CCP Tick Sizes, Alpha Clone Caps & Min Volume Enforcement passed all assertions.');
  console.log('ALL ENGINE UNIT TESTS COMPLETED SUCCESSFULLY!');
}

runAllTests();
