import { FeeEngine } from '../fee';
import { ProfitEngine } from '../profit';
import { ExecutionScenario, FinancialConfig } from '../../types';
import { roundIsk } from '../money';
import { InterRegionalFinancialEngine } from '../interRegional';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FinancialEngineTest] Assertion Failed: ${message}`);
  }
}

function assertClose(actual: number, expected: number, delta: number = 0.01, message: string = '') {
  if (Math.abs(actual - expected) > delta) {
    throw new Error(`[FinancialEngineTest] Value mismatch: expected ${expected}, got ${actual} (diff: ${Math.abs(actual - expected)} > ${delta}). ${message}`);
  }
}

export function runFinancialEngineTests() {
  console.log('=== RUNNING COMPREHENSIVE FINANCIAL ENGINE TESTS ===');

  // =========================================================================
  // 1. OFFICIAL CCP FORMULAS TESTS
  // =========================================================================
  console.log('1. Testing Official CCP Fee Formulas...');

  // 1.1 Sales Tax (8.0% base, -11% per Accounting level)
  assertClose(FeeEngine.calculateSalesTaxRate(0), 0.0800, 1e-4, 'Sales tax Level 0 = 8.00%');
  assertClose(FeeEngine.calculateSalesTaxRate(1), 0.0712, 1e-4, 'Sales tax Level 1 = 7.12%');
  assertClose(FeeEngine.calculateSalesTaxRate(2), 0.0624, 1e-4, 'Sales tax Level 2 = 6.24%');
  assertClose(FeeEngine.calculateSalesTaxRate(3), 0.0536, 1e-4, 'Sales tax Level 3 = 5.36%');
  assertClose(FeeEngine.calculateSalesTaxRate(4), 0.0448, 1e-4, 'Sales tax Level 4 = 4.48%');
  assertClose(FeeEngine.calculateSalesTaxRate(5), 0.0360, 1e-4, 'Sales tax Level 5 = 3.60%');

  // Clamping test for Accounting level
  assertClose(FeeEngine.calculateSalesTaxRate(-2), 0.0800, 1e-4, 'Clamped negative level to 0');
  assertClose(FeeEngine.calculateSalesTaxRate(10), 0.0360, 1e-4, 'Clamped excessive level to 5');

  // 1.2 NPC Broker Fee (3.0% base - 0.3%*BR - 0.03%*FS - 0.02%*CS, min 1.0%)
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(0, 0, 0), 0.0300, 1e-4, 'NPC Broker Fee 0 skills/standings = 3.00%');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(1, 0, 0), 0.0270, 1e-4, 'NPC Broker Fee BR 1 = 2.70%');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(5, 0, 0), 0.0150, 1e-4, 'NPC Broker Fee BR 5 = 1.50%');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(5, 5.0, 5.0), 0.0125, 1e-4, 'NPC Broker Fee BR 5 + 5.0 standings = 1.25%');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(5, 10.0, 10.0), 0.0100, 1e-4, 'NPC Broker Fee BR 5 + 10.0 standings = 1.00% (cap)');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(5, 20.0, 20.0), 0.0100, 1e-4, 'NPC Broker Fee clamped at 1.00% min');
  assertClose(FeeEngine.calculateNpcBrokerFeeRate(0, -10.0, -10.0), 0.0350, 1e-4, 'NPC Broker Fee negative standings = 3.50%');

  // 1.3 Upwell Citadel Fee (SCC surcharge + owner fee)
  const upwellL0 = FeeEngine.calculateUpwellBrokerFeeRate(0, 0.01, 0.015);
  assertClose(upwellL0.scc_surcharge_rate, 0.015, 1e-4, 'SCC Surcharge at BR 0 is 1.50%');
  assertClose(upwellL0.total_rate, 0.025, 1e-4, 'Upwell total at BR 0 with 1.0% owner fee is 2.50%');

  const upwellL5 = FeeEngine.calculateUpwellBrokerFeeRate(5, 0.01, 0.015);
  assertClose(upwellL5.scc_surcharge_rate, 0.0075, 1e-4, 'SCC Surcharge at BR 5 is 0.75%');
  assertClose(upwellL5.total_rate, 0.0175, 1e-4, 'Upwell total at BR 5 with 1.0% owner fee is 1.75%');

  // 1.4 Advanced Broker Relations (Relist Fee Discount: 5% discount per level)
  const relistL0 = FeeEngine.calculateRelistFeeRate(0.015, 0);
  assertClose(relistL0, 0.015, 1e-4, 'Relist rate with Adv BR 0 is 1.50%');
  const relistL5 = FeeEngine.calculateRelistFeeRate(0.015, 5);
  assertClose(relistL5, 0.01125, 1e-4, 'Relist rate with Adv BR 5 is 1.50% * 0.75 = 1.125%');

  console.log('✅ Official CCP Fee Formulas verified.');

  // =========================================================================
  // 2. FEE RATE RESOLUTION TESTS (Game Mechanics vs User Overrides)
  // =========================================================================
  console.log('2. Testing Fee Rate Resolution...');

  const baseConfig: Partial<FinancialConfig> = {
    accounting_level: 5,
    broker_relations_level: 5,
    advanced_broker_relations_level: 5,
    faction_standing: 0.0,
    corp_standing: 0.0,
  };

  const resMechanics = FeeEngine.resolveRates({ config: baseConfig });
  assert(resMechanics.sales_tax_source === 'skills_game_mechanics', 'Source should be skills_game_mechanics');
  assertClose(resMechanics.sales_tax_rate, 0.036, 1e-4, 'Sales tax should resolve to 3.6%');
  assertClose(resMechanics.broker_fee_rate, 0.015, 1e-4, 'Broker fee should resolve to 1.5%');

  // User override
  const overrideConfig: Partial<FinancialConfig> = {
    ...baseConfig,
    use_custom_fees: true,
    custom_sales_tax_pct: 2.5,
    custom_broker_fee_pct: 0.8,
  };
  const resOverride = FeeEngine.resolveRates({ config: overrideConfig });
  assert(resOverride.sales_tax_source === 'user_override', 'Source should be user_override');
  assertClose(resOverride.sales_tax_rate, 0.025, 1e-4, 'Override sales tax 2.5%');
  assertClose(resOverride.broker_fee_rate, 0.008, 1e-4, 'Override broker fee 0.8%');

  console.log('✅ Fee Rate Resolution verified.');

  // =========================================================================
  // 3. TRANSPORT LOGISTICS INVARIANT TESTS
  // =========================================================================
  console.log('3. Testing Transport Logistics Invariants...');

  const transportDisabledConfig: Partial<FinancialConfig> = {
    enable_transport_costs: false,
    transport_cost_per_m3: 850,
    transport_cost_per_jump: 50000,
    collateral_fee_pct: 0.01,
  };
  const zeroTransport = FeeEngine.calculateTransportCost(transportDisabledConfig, 5000, 15, 100_000_000);
  assert(zeroTransport === 0.0, `Transport cost MUST be strictly 0.00 ISK when disabled, got ${zeroTransport}`);

  const transportEnabledConfig: Partial<FinancialConfig> = {
    enable_transport_costs: true,
    transport_cost_per_m3: 500,
    transport_cost_per_jump: 10000,
    collateral_fee_pct: 0.005,
    transport_fixed_fee: 25000,
  };
  // 100 m3 * 500 = 50,000 ISK
  // 10 jumps * 10,000 = 100,000 ISK
  // 1,000,000 * 0.005 = 5,000 ISK
  // Fixed = 25,000 ISK
  // Total = 180,000 ISK
  const calcTransport = FeeEngine.calculateTransportCost(transportEnabledConfig, 100, 10, 1_000_000);
  assertClose(calcTransport, 180000, 1.0, 'Transport cost calculated correctly');

  console.log('✅ Transport Logistics verified.');

  // =========================================================================
  // 4. SCENARIO A: TAKER BUY -> TAKER SELL
  // =========================================================================
  console.log('4. Testing Scenario A (Taker Buy -> Taker Sell)...');
  // Buy 100 units at 10,000 ISK (Taker = 0% broker)
  // Sell 100 units at 15,000 ISK (Taker = 0% broker, 3.6% sales tax)
  const scenarioA = ProfitEngine.calculateScenario({
    scenario: 'taker_taker',
    quantity: 100,
    effective_buy_price: 10000,
    effective_sell_price: 15000,
    config: {
      accounting_level: 5,
      broker_relations_level: 5,
      enable_transport_costs: false,
    },
  });

  assert(scenarioA.scenario === 'taker_taker', 'Scenario matches A');
  assertClose(scenarioA.gross_purchase_cost, 1_000_000, 1.0, 'Gross purchase = 1,000,000 ISK');
  assertClose(scenarioA.buy_broker_fee_cost, 0.0, 1e-4, 'Taker Buy broker fee is strictly 0 ISK');
  assertClose(scenarioA.total_acquisition_cost, 1_000_000, 1.0, 'Total acquisition = 1,000,000 ISK');

  assertClose(scenarioA.gross_revenue, 1_500_000, 1.0, 'Gross revenue = 1,500,000 ISK');
  assertClose(scenarioA.sales_tax_cost, 54_000, 1.0, 'Sales tax 3.6% on 1.5M = 54,000 ISK');
  assertClose(scenarioA.sell_broker_fee_cost, 0.0, 1e-4, 'Taker Sell broker fee is strictly 0 ISK');
  assertClose(scenarioA.total_exit_fees, 54_000, 1.0, 'Exit fees = 54,000 ISK');

  assertClose(scenarioA.net_revenue, 1_446_000, 1.0, 'Net revenue = 1,446,000 ISK');
  assertClose(scenarioA.net_profit, 446_000, 1.0, 'Net profit = 446,000 ISK');
  assertClose(scenarioA.profit_per_unit, 4_460, 1.0, 'Profit per unit = 4,460 ISK');
  assertClose(scenarioA.roi, 0.446, 1e-4, 'ROI = 44.60%');
  assertClose(scenarioA.margin, 446000 / 1500000, 1e-4, 'Margin = 29.73%');
  assert(scenarioA.is_profitable === true, 'Trade is profitable');

  console.log('✅ Scenario A verified.');

  // =========================================================================
  // 5. SCENARIO B: TAKER BUY -> MAKER SELL / RELIST
  // =========================================================================
  console.log('5. Testing Scenario B (Taker Buy -> Maker Sell)...');
  // Buy 100 units at 10,000 ISK (Taker = 0% broker)
  // Sell 100 units at 15,000 ISK (Maker = 1.5% broker, 3.6% sales tax)
  const scenarioB = ProfitEngine.calculateScenario({
    scenario: 'taker_maker',
    quantity: 100,
    effective_buy_price: 10000,
    effective_sell_price: 15000,
    config: {
      accounting_level: 5,
      broker_relations_level: 5,
      enable_transport_costs: false,
    },
  });

  assert(scenarioB.scenario === 'taker_maker', 'Scenario matches B');
  assertClose(scenarioB.buy_broker_fee_cost, 0.0, 1e-4, 'Taker Buy broker fee is 0 ISK');
  assertClose(scenarioB.total_acquisition_cost, 1_000_000, 1.0, 'Acquisition = 1,000,000 ISK');

  assertClose(scenarioB.gross_revenue, 1_500_000, 1.0, 'Gross revenue = 1,500,000 ISK');
  assertClose(scenarioB.sales_tax_cost, 54_000, 1.0, 'Sales tax = 54,000 ISK');
  assertClose(scenarioB.sell_broker_fee_cost, 22_500, 1.0, 'Sell Maker broker fee 1.5% on 1.5M = 22,500 ISK');
  assertClose(scenarioB.total_exit_fees, 76_500, 1.0, 'Total exit fees = 76,500 ISK');

  assertClose(scenarioB.net_revenue, 1_423_500, 1.0, 'Net revenue = 1,423,500 ISK');
  assertClose(scenarioB.net_profit, 423_500, 1.0, 'Net profit = 423,500 ISK');
  assertClose(scenarioB.roi, 0.4235, 1e-4, 'ROI = 42.35%');

  console.log('✅ Scenario B verified.');

  // =========================================================================
  // 6. SCENARIO C: MAKER BUY -> TAKER SELL
  // =========================================================================
  console.log('6. Testing Scenario C (Maker Buy -> Taker Sell)...');
  // Buy 100 units at 10,000 ISK (Maker = 1.5% broker on purchase = 15,000 ISK)
  // Sell 100 units at 15,000 ISK (Taker = 0% broker, 3.6% sales tax = 54,000 ISK)
  const scenarioC = ProfitEngine.calculateScenario({
    scenario: 'maker_taker',
    quantity: 100,
    effective_buy_price: 10000,
    effective_sell_price: 15000,
    config: {
      accounting_level: 5,
      broker_relations_level: 5,
      enable_transport_costs: false,
    },
  });

  assert(scenarioC.scenario === 'maker_taker', 'Scenario matches C');
  assertClose(scenarioC.gross_purchase_cost, 1_000_000, 1.0, 'Purchase cost = 1,000,000 ISK');
  assertClose(scenarioC.buy_broker_fee_cost, 15_000, 1.0, 'Maker Buy broker fee 1.5% on 1.0M = 15,000 ISK');
  assertClose(scenarioC.total_acquisition_cost, 1_015_000, 1.0, 'Total acquisition = 1,015,000 ISK');

  assertClose(scenarioC.gross_revenue, 1_500_000, 1.0, 'Gross revenue = 1,500,000 ISK');
  assertClose(scenarioC.sell_broker_fee_cost, 0.0, 1e-4, 'Taker Sell broker fee is 0 ISK');
  assertClose(scenarioC.sales_tax_cost, 54_000, 1.0, 'Sales tax = 54,000 ISK');
  assertClose(scenarioC.total_exit_fees, 54_000, 1.0, 'Total exit fees = 54,000 ISK');

  assertClose(scenarioC.net_revenue, 1_446_000, 1.0, 'Net revenue = 1,446,000 ISK');
  assertClose(scenarioC.net_profit, 431_000, 1.0, 'Net profit = 431,000 ISK');
  assertClose(scenarioC.roi, 431000 / 1015000, 1e-4, 'ROI = 42.46%');

  console.log('✅ Scenario C verified.');

  // =========================================================================
  // 7. SCENARIO D: MAKER BUY -> MAKER SELL
  // =========================================================================
  console.log('7. Testing Scenario D (Maker Buy -> Maker Sell)...');
  // Buy 100 units at 10,000 ISK (Maker = 1.5% broker = 15,000 ISK)
  // Sell 100 units at 15,000 ISK (Maker = 1.5% broker = 22,500 ISK, Sales Tax = 54,000 ISK)
  const scenarioD = ProfitEngine.calculateScenario({
    scenario: 'maker_maker',
    quantity: 100,
    effective_buy_price: 10000,
    effective_sell_price: 15000,
    config: {
      accounting_level: 5,
      broker_relations_level: 5,
      enable_transport_costs: false,
    },
  });

  assert(scenarioD.scenario === 'maker_maker', 'Scenario matches D');
  assertClose(scenarioD.buy_broker_fee_cost, 15_000, 1.0, 'Maker Buy broker fee = 15,000 ISK');
  assertClose(scenarioD.total_acquisition_cost, 1_015_000, 1.0, 'Acquisition = 1,015,000 ISK');

  assertClose(scenarioD.gross_revenue, 1_500_000, 1.0, 'Gross revenue = 1,500,000 ISK');
  assertClose(scenarioD.sell_broker_fee_cost, 22_500, 1.0, 'Sell Maker broker fee = 22,500 ISK');
  assertClose(scenarioD.sales_tax_cost, 54_000, 1.0, 'Sales tax = 54,000 ISK');
  assertClose(scenarioD.total_exit_fees, 76_500, 1.0, 'Total exit fees = 76,500 ISK');

  assertClose(scenarioD.net_revenue, 1_423_500, 1.0, 'Net revenue = 1,423,500 ISK');
  assertClose(scenarioD.net_profit, 408_500, 1.0, 'Net profit = 408,500 ISK');
  assertClose(scenarioD.roi, 408500 / 1015000, 1e-4, 'ROI = 40.25%');

  console.log('✅ Scenario D verified.');

  // =========================================================================
  // 8. BOUNDARY & EDGE CASE TESTS
  // =========================================================================
  console.log('8. Testing Boundary & Edge Cases...');

  // 8.1 Zero quantity
  const zeroQty = ProfitEngine.calculateScenario({
    scenario: 'taker_taker',
    quantity: 0,
    effective_buy_price: 10000,
    effective_sell_price: 15000,
    config: baseConfig,
  });
  assert(zeroQty.quantity === 0, 'Zero quantity preserved');
  assert(zeroQty.total_acquisition_cost === 0, 'Zero cost');
  assert(zeroQty.net_profit === 0, 'Zero profit');
  assert(zeroQty.roi === 0, 'Zero ROI without NaN');
  assert(zeroQty.is_profitable === false, 'Not profitable');

  // 8.2 Zero price
  const zeroPrice = ProfitEngine.calculateScenario({
    scenario: 'taker_taker',
    quantity: 100,
    effective_buy_price: 0,
    effective_sell_price: 0,
    config: baseConfig,
  });
  assert(zeroPrice.net_profit === 0, 'Zero price handled safely');
  assert(zeroPrice.is_profitable === false, 'Not profitable');

  // 8.3 Unprofitable trade / Negative ROI
  const losingTrade = ProfitEngine.calculateScenario({
    scenario: 'taker_taker',
    quantity: 100,
    effective_buy_price: 10000,
    effective_sell_price: 9000, // Sold at loss
    config: baseConfig,
  });
  assert(losingTrade.net_profit < 0, 'Net profit is negative');
  assert(losingTrade.roi < 0, 'ROI is negative');
  assert(losingTrade.margin < 0, 'Margin is negative');
  assert(losingTrade.is_profitable === false, 'is_profitable is false');

  // 8.4 Multi-billion ISK values without precision loss
  const largeTrade = ProfitEngine.calculateScenario({
    scenario: 'taker_maker',
    quantity: 50,
    effective_buy_price: 2_500_000_000, // 2.5B per unit = 125B purchase
    effective_sell_price: 3_200_000_000, // 3.2B per unit = 160B gross
    config: baseConfig,
  });
  assertClose(largeTrade.gross_purchase_cost, 125_000_000_000, 1.0, '125B purchase cost');
  assertClose(largeTrade.gross_revenue, 160_000_000_000, 1.0, '160B gross revenue');
  assert(Number.isFinite(largeTrade.net_profit), 'Profit is finite');
  assert(largeTrade.net_profit > 0, 'Profit is positive');

  // 8.5 Micro-isk values (fractions of ISK)
  const microTrade = ProfitEngine.calculateScenario({
    scenario: 'taker_taker',
    quantity: 1_000_000,
    effective_buy_price: 0.12,
    effective_sell_price: 0.18,
    config: baseConfig,
  });
  assertClose(microTrade.gross_purchase_cost, 120_000, 0.01, 'Micro-isk purchase calculation');
  assertClose(microTrade.gross_revenue, 180_000, 0.01, 'Micro-isk gross revenue');

  // 8.6 Cargo capacity scaling & synchronization test
  console.log('8.6 Testing Dynamic Cargo & Volume Synchronization...');
  const smallCargoConfig: Partial<FinancialConfig> = {
    ...baseConfig,
    available_capital: 10_000_000_000,
    max_cargo_m3: 1000, // 1,000 m³ (e.g. Frigate / Fast Transport)
  };
  const largeCargoConfig: Partial<FinancialConfig> = {
    ...baseConfig,
    available_capital: 10_000_000_000,
    max_cargo_m3: 35000, // 35,000 m³ (e.g. Deep Space Transport)
  };

  const dummyRoute = {
    from_system_id: 30000142,
    to_system_id: 30002187,
    source_system_id: 30000142,
    dest_system_id: 30002187,
    jumps: 9,
    is_highsec_only: true,
    min_security: 0.9,
    chokepoints: [],
  };

  // Heavy commodity: 50 m³ per unit, 10,000 ISK buy price, 50,000 units available
  const smallCargoRes = InterRegionalFinancialEngine.determineTradableQuantity(
    10000,
    50, // 50 m³ per unit
    50000,
    50000,
    dummyRoute,
    smallCargoConfig
  );
  assert(smallCargoRes.quantity === 20, `Small cargo capped at 20 units (1000m³ / 50m³ = 20), got ${smallCargoRes.quantity}`);
  assert(smallCargoRes.bottleneck === 'cargo', `Bottleneck is cargo, got ${smallCargoRes.bottleneck}`);
  assert(smallCargoRes.totalCargoVolume === 1000, `Cargo volume is 1000m³, got ${smallCargoRes.totalCargoVolume}`);

  const largeCargoRes = InterRegionalFinancialEngine.determineTradableQuantity(
    10000,
    50, // 50 m³ per unit
    50000,
    50000,
    dummyRoute,
    largeCargoConfig
  );
  assert(largeCargoRes.quantity === 700, `Large cargo capped at 700 units (35000m³ / 50m³ = 700), got ${largeCargoRes.quantity}`);
  assert(largeCargoRes.bottleneck === 'cargo', `Bottleneck is cargo, got ${largeCargoRes.bottleneck}`);
  assert(largeCargoRes.totalCargoVolume === 35000, `Cargo volume is 35000m³, got ${largeCargoRes.totalCargoVolume}`);

  // 8.7 Corporation Treasury & Division Resolution Tests
  console.log('8.7 Testing Corporate Treasury & Multi-Division Resolution...');
  const corpConfig: Partial<FinancialConfig> = {
    ...baseConfig,
    treasury_source_mode: 'corporation',
    // Division balances come from the observed ESI wallet snapshot below.
    corporation_wallet_source: 'esi',
    corporation_wallet_division: 1,
    corporation_name: 'Starlight Holdings Inc.',
    corporation_wallet_balance: 5_000_000_000,
    corporation_divisions: [
      { division: 1, name: 'Master Operations', balance: 5_000_000_000 },
      { division: 2, name: 'Hauling Fund', balance: 750_000_000 },
      { division: 3, name: 'Speculation', balance: 12_000_000_000 },
    ],
  };

  const corpTradableDiv1 = InterRegionalFinancialEngine.determineTradableQuantity(
    100_000_000, // 100M ISK per unit
    1, // 1 m³
    1000,
    1000,
    dummyRoute,
    corpConfig
  );
  assert(corpTradableDiv1.quantity === 50, `Division 1 capital (5B) allows 50 units @ 100M, got ${corpTradableDiv1.quantity}`);
  assert(corpTradableDiv1.bottleneck === 'capital', `Bottleneck is capital, got ${corpTradableDiv1.bottleneck}`);

  // Switch to Division 2 (750M balance)
  const corpConfigDiv2: Partial<FinancialConfig> = {
    ...corpConfig,
    corporation_wallet_division: 2,
  };
  const corpTradableDiv2 = InterRegionalFinancialEngine.determineTradableQuantity(
    100_000_000, // 100M ISK per unit
    1, // 1 m³
    1000,
    1000,
    dummyRoute,
    corpConfigDiv2
  );
  assert(corpTradableDiv2.quantity === 7, `Division 2 capital (750M) allows 7 units @ 100M, got ${corpTradableDiv2.quantity}`);

  console.log('✅ All Boundary & Edge Cases passed.');

  console.log('✅ All Boundary & Edge Cases passed.');
  console.log('🎉 ALL COMPREHENSIVE FINANCIAL ENGINE TESTS PASSED WITH 100% SUCCESS!');
}

runFinancialEngineTests();
