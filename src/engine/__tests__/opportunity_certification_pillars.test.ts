import { InterRegionalFinancialEngine } from '../interRegional';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import {
  EveTypeDetail,
  MarketHub,
  RawMarketOrder,
  FinancialConfig,
  MarketDataQuality,
} from '../../types';

console.log('=== RUNNING PHASE 2C: 4-PILLAR OPPORTUNITY CERTIFICATION TESTS ===');

const catalog = CatalogRepository.getInstance();

const jitaHub: MarketHub = {
  id: 'jita',
  name: 'Jita IV-4',
  region: 'The Forge',
  region_id: 10000002,
  solar_system: 'Jita',
  system_id: 30000142,
  station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  station_id: 60003760,
  security_status: 0.9,
  priority: 1,
  active: true,
  hub_type: 'npc_major',
};

const amarrHub: MarketHub = {
  id: 'amarr',
  name: 'Amarr VIII',
  region: 'Domain',
  region_id: 10000043,
  solar_system: 'Amarr',
  system_id: 30002187,
  station: 'Amarr VIII (Oris) - Emperor Family Academy',
  station_id: 60008494,
  security_status: 1.0,
  priority: 2,
  active: true,
  hub_type: 'npc_major',
};

const config: FinancialConfig = {
  available_capital: 500000000,
  broker_fee: 0.01,
  sales_tax: 0.036,
  broker_relations_level: 5,
  accounting_level: 5,
  advanced_broker_relations_level: 5,
  enable_transport_costs: true,
  transport_cost_per_m3: 15.0,
  transport_cost_per_jump: 0,
  max_cargo_m3: 10000,
  min_roi: 0.03,
  min_net_profit: 1000,
  max_days_to_sell: 30,
  max_capital_per_trade: 500000000,
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.50,
};

const tritaniumItem: EveTypeDetail = {
  type_id: 34,
  name: 'Tritanium',
  volume: 0.01,
  group_id: 18,
  category_id: 4,
};

const jitaSellOrders: RawMarketOrder[] = [
  {
    order_id: 1001,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 4.50,
    volume_remain: 1000000,
    volume_total: 1000000,
    min_volume: 1,
    is_buy_order: false,
    order_range: 'region',
    issued: new Date().toISOString(),
    duration: 90,
    captured_at: new Date().toISOString(),
  },
];

const amarrBuyOrders: RawMarketOrder[] = [
  {
    order_id: 2002,
    type_id: 34,
    region_id: 10000043,
    system_id: 30002187,
    location_id: 60008494,
    price: 6.00,
    volume_remain: 1000000,
    volume_total: 1000000,
    min_volume: 1,
    is_buy_order: true,
    order_range: 'station',
    issued: new Date().toISOString(),
    duration: 90,
    captured_at: new Date().toISOString(),
  },
];

const liveQuality: MarketDataQuality = {
  source: 'esi',
  freshness: 'fresh',
  completeness: 'complete',
  data_state: 'VALID',
  health_status: 'LIVE',
  validation_status: 'valid',
  fetched_at: new Date().toISOString(),
  age_seconds: 5,
  pages_fetched: 1,
  expected_pages: 1,
  orders_fetched: 1,
  orders_valid: 1,
  duplicate_orders_removed: 0,
  rejected_orders_count: 0,
  error_count: 0,
  confidence: 1.0,
  sync_duration_ms: 40,
};

// 1. Scenario: All 4 Pillars PASS -> CERTIFIED
console.log('1. Testing All 4 Pillars PASS -> CERTIFIED...');
const oppCertified = InterRegionalFinancialEngine.calculateOpportunity(
  tritaniumItem,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  undefined,
  { 10000002: liveQuality, 10000043: liveQuality },
  jitaSellOrders
);

if (!oppCertified || !oppCertified.certification) throw new Error('oppCertified is null or missing certification');
if (oppCertified.certification.status !== 'CERTIFIED') {
  throw new Error(`Expected CERTIFIED, got ${oppCertified.certification.status}`);
}
if (!oppCertified.certification.is_actionable) {
  throw new Error('Expected is_actionable to be true');
}
const pEval = oppCertified.certification.pillar_evaluations;
if (!pEval || pEval.market_data.status !== 'PASS' || pEval.catalog.status !== 'PASS' || pEval.universe.status !== 'PASS' || pEval.financial_engine.status !== 'PASS') {
  throw new Error('All 4 pillars must be PASS for certified trade');
}
console.log('✅ Scenario 1 (All 4 Pillars PASS) verified.');

// 2. Scenario: MarketData Pillar DEGRADED (STALE) -> DEGRADED
console.log('2. Testing MarketData Pillar DEGRADED (STALE)...');
const staleQuality: MarketDataQuality = {
  ...liveQuality,
  freshness: 'stale',
  health_status: 'STALE',
  data_state: 'STALE',
  age_seconds: 900,
  confidence: 0.65,
};

const oppDegradedMarket = InterRegionalFinancialEngine.calculateOpportunity(
  tritaniumItem,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  undefined,
  { 10000002: staleQuality, 10000043: liveQuality },
  jitaSellOrders
);

if (!oppDegradedMarket || !oppDegradedMarket.certification) throw new Error('oppDegradedMarket is null or missing certification');
if (oppDegradedMarket.certification.status !== 'DEGRADED') {
  throw new Error(`Expected DEGRADED, got ${oppDegradedMarket.certification.status}`);
}
if (oppDegradedMarket.certification.is_actionable) {
  throw new Error('Expected is_actionable to be false for DEGRADED trade');
}
if (oppDegradedMarket.certification.pillar_evaluations?.market_data.status !== 'DEGRADED') {
  throw new Error('MarketData pillar must be DEGRADED');
}
console.log('✅ Scenario 2 (MarketData STALE -> DEGRADED) verified.');

// 3. Scenario: MarketData Pillar FAIL (ERROR) -> REJECTED
console.log('3. Testing MarketData Pillar FAIL (ERROR)...');
const errorQuality: MarketDataQuality = {
  ...liveQuality,
  freshness: 'expired',
  health_status: 'ERROR',
  data_state: 'ERROR',
  age_seconds: 3600,
  confidence: 0.0,
  error_count: 5,
};

const oppRejectedMarket = InterRegionalFinancialEngine.calculateOpportunity(
  tritaniumItem,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  undefined,
  { 10000002: errorQuality, 10000043: liveQuality },
  jitaSellOrders
);

if (!oppRejectedMarket || !oppRejectedMarket.certification) throw new Error('oppRejectedMarket is null or missing certification');
if (oppRejectedMarket.certification.status !== 'REJECTED') {
  throw new Error(`Expected REJECTED, got ${oppRejectedMarket.certification.status}`);
}
if (oppRejectedMarket.certification.is_actionable) {
  throw new Error('Expected is_actionable to be false for REJECTED trade');
}
if (oppRejectedMarket.certification.pillar_evaluations?.market_data.status !== 'FAIL') {
  throw new Error('MarketData pillar must be FAIL');
}
console.log('✅ Scenario 3 (MarketData ERROR -> REJECTED) verified.');

// 4. Scenario: Dynamic catalog type is rejected before financial calculation.
console.log('4. Testing Dynamic Catalog Type -> fail closed...');
catalog.registerCustomType({
  type_id: 99123,
  name: 'Experimental Field Generator',
  volume: 1.0,
  group_id: 50,
  category_id: 6,
});

const dynamicItem: EveTypeDetail = {
  type_id: 99123,
  name: 'Experimental Field Generator',
  volume: 1.0,
  group_id: 50,
  category_id: 6,
};

const dynamicSellOrders: RawMarketOrder[] = [
  {
    ...jitaSellOrders[0],
    order_id: 3001,
    type_id: 99123,
    price: 10000,
  },
];
const dynamicBuyOrders: RawMarketOrder[] = [
  {
    ...amarrBuyOrders[0],
    order_id: 3002,
    type_id: 99123,
    price: 15000,
  },
];

const oppDynamicCatalog = InterRegionalFinancialEngine.calculateOpportunity(
  dynamicItem,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  dynamicSellOrders,
  dynamicBuyOrders,
  undefined,
  { 10000002: liveQuality, 10000043: liveQuality },
  dynamicSellOrders
);

if (oppDynamicCatalog !== null) {
  throw new Error('Dynamic catalog input must be rejected before financial calculation');
}
console.log('✅ Scenario 4 (Dynamic catalog -> rejected) verified.');

// 5. Scenario: Universe Pillar DEGRADED (Lowsec / nullsec route)
console.log('5. Testing Universe Pillar DEGRADED (Lowsec Hub)...');
const nullsecHub: MarketHub = {
  id: '1dq',
  name: '1DQ1-A Keepstar',
  region: 'Delve',
  region_id: 10000060,
  solar_system: '1DQ1-A',
  system_id: 30004759,
  station: '1DQ1-A - 1-st Star Fleet',
  station_id: 1022714498305, // Upwell Structure
  security_status: -0.2,
  priority: 5,
  active: true,
  hub_type: 'citadel',
};

const oppNullsecUniverse = InterRegionalFinancialEngine.calculateOpportunity(
  tritaniumItem,
  jitaHub,
  nullsecHub,
  'immediate',
  config,
  jitaSellOrders,
  [
    {
      ...amarrBuyOrders[0],
      region_id: 10000060,
      system_id: 30004759,
      location_id: 1022714498305,
      price: 10.0,
    },
  ],
  undefined,
  { 10000002: liveQuality, 10000060: liveQuality },
  jitaSellOrders
);

if (oppNullsecUniverse !== null) {
  throw new Error('Non-canonical/non-Highsec universe input must be rejected before financial calculation');
}
console.log('✅ Scenario 5 (Non-Highsec universe -> rejected) verified.');

// 6. Scenario: Financial Engine Pillar FAIL (Negative profit) -> REJECTED
console.log('6. Testing Financial Engine Pillar FAIL (High transport costs -> Net loss)...');
const expensiveTransportConfig: FinancialConfig = {
  ...config,
  transport_cost_per_m3: 50000.0, // Absurd transport fee
};

const oppLossFinancial = InterRegionalFinancialEngine.calculateOpportunity(
  tritaniumItem,
  jitaHub,
  amarrHub,
  'immediate',
  expensiveTransportConfig,
  jitaSellOrders,
  amarrBuyOrders,
  undefined,
  { 10000002: liveQuality, 10000043: liveQuality },
  jitaSellOrders
);

if (!oppLossFinancial || !oppLossFinancial.certification) throw new Error('oppLossFinancial is null or missing certification');
if (oppLossFinancial.certification.status !== 'REJECTED') {
  throw new Error(`Expected REJECTED for net loss trade, got ${oppLossFinancial.certification.status}`);
}
if (oppLossFinancial.certification.is_actionable) {
  throw new Error('Expected is_actionable to be false for net loss trade');
}
if (oppLossFinancial.certification.pillar_evaluations?.financial_engine.status !== 'FAIL') {
  throw new Error('Financial Engine pillar must be FAIL');
}
console.log('✅ Scenario 6 (Financial Net Loss -> REJECTED) verified.');

console.log('🎉 ALL 6 PILLARS & SCENARIOS OF OPPORTUNITY CERTIFICATION PASSED WITH 100% SUCCESS!');
