import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { InterRegionalFinancialEngine } from '../interRegional';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { MarketDataStore } from '../../services/marketDataStore';
import {
  EveTypeDetail,
  MarketHub,
  RawMarketOrder,
  FinancialConfig,
  MarketDataQuality,
  DataState,
} from '../../types';

console.log('=== RUNNING DATA CONTRACTS, PROVENANCE & CERTIFICATION TESTS ===');

// --- 1. Testing CatalogRepository.resolveType Contract ---
console.log('1. Testing CatalogRepository.resolveType...');
const catalog = CatalogRepository.getInstance();

// 1.1 Known static item in the verified bundled catalog
const resolvedTritInitial = catalog.resolveType(34);
if (resolvedTritInitial.status !== 'RESOLVED_CATALOG') {
  throw new Error(`Expected Tritanium (34) status to be RESOLVED_CATALOG, got ${resolvedTritInitial.status}`);
}
if (!resolvedTritInitial.type || resolvedTritInitial.name !== 'Tritanium' || resolvedTritInitial.volume !== 0.01) {
  throw new Error(`Invalid metadata returned for Tritanium: ${resolvedTritInitial.name}, ${resolvedTritInitial.volume}`);
}
if (resolvedTritInitial.source !== 'catalog_ready' || resolvedTritInitial.confidence !== 1.0 || !resolvedTritInitial.is_verified) {
  throw new Error(`Expected canonical catalog source and full verification in initial state, got ${resolvedTritInitial.source} / ${resolvedTritInitial.confidence}`);
}

const resolvedTrit = catalog.resolveType(34);
if (!resolvedTrit.type || resolvedTrit.name !== 'Tritanium') {
  throw new Error('Type resolution failed for Tritanium');
}

// 1.2 Unknown item
const resolvedUnknown = catalog.resolveType(999999999);
if (resolvedUnknown.status !== 'TYPE_UNKNOWN') {
  throw new Error(`Expected non-existent item status to be TYPE_UNKNOWN, got ${resolvedUnknown.status}`);
}
if (resolvedUnknown.is_verified || resolvedUnknown.confidence !== 0.0 || resolvedUnknown.type !== undefined) {
  throw new Error('TYPE_UNKNOWN contract failed: must not return verified type');
}

// 1.3 Dynamic item resolution
catalog.registerCustomType({
  type_id: 88888,
  name: 'Experimental Polymer Unit',
  volume: 2.5,
  group_id: 334,
  category_id: 11,
});

const resolvedDynamic = catalog.resolveType(88888);
if (resolvedDynamic.status !== 'RESOLVED_DYNAMIC') {
  throw new Error(`Expected dynamic item status to be RESOLVED_DYNAMIC, got ${resolvedDynamic.status}`);
}
if (resolvedDynamic.is_verified || resolvedDynamic.confidence !== 0 || !resolvedDynamic.type) {
  throw new Error('RESOLVED_DYNAMIC contract failed for dynamic item: dynamic resolution must remain unverified');
}
console.log('✅ CatalogRepository.resolveType passed all contract tests.');

// --- 2. Testing DataState & Quality Transitions in MarketDataStore ---
console.log('2. Testing DataState & Quality Transitions in MarketDataStore...');

const sampleOrders: RawMarketOrder[] = [
  {
    order_id: 1001,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 4.50,
    volume_remain: 100000,
    volume_total: 100000,
    min_volume: 1,
    is_buy_order: false,
    order_range: 'region',
    issued: new Date().toISOString(),
    duration: 90,
    captured_at: new Date().toISOString(),
  },
];

// Valid fresh state
MarketDataStore.setOrders(34, 10000002, sampleOrders, true);
const freshSnap = MarketDataStore.getSnapshot(34, 10000002);
if (!freshSnap || freshSnap.quality.data_state !== 'VALID') {
  throw new Error(`Expected fresh snapshot data_state to be VALID, got ${freshSnap?.quality.data_state}`);
}

// Empty state (EMPTY != ZERO or ERROR)
MarketDataStore.setOrders(34, 10000032, [], true);
const emptySnap = MarketDataStore.getSnapshot(34, 10000032);
if (!emptySnap || emptySnap.quality.data_state !== 'EMPTY') {
  throw new Error(`Expected empty snapshot data_state to be EMPTY, got ${emptySnap?.quality.data_state}`);
}

// Error state (ERROR != EMPTY)
const errorQuality: MarketDataQuality = {
  source: 'unavailable',
  freshness: 'expired',
  completeness: 'empty',
  validation_status: 'invalid',
  data_state: 'ERROR',
  fetched_at: new Date().toISOString(),
  age_seconds: 0,
  pages_fetched: 0,
  expected_pages: 1,
  orders_fetched: 0,
  orders_valid: 0,
  duplicate_orders_removed: 0,
  rejected_orders_count: 0,
  error_count: 1,
  last_error: 'ESI HTTP 502 Bad Gateway',
  confidence: 0,
  sync_duration_ms: 100,
};
MarketDataStore.setOrders(34, 10000043, [], true, errorQuality);
const errorSnap = MarketDataStore.getSnapshot(34, 10000043);
if (!errorSnap || errorSnap.quality.data_state !== 'ERROR') {
  throw new Error(`Expected error snapshot data_state to be ERROR, got ${errorSnap?.quality.data_state}`);
}
console.log('✅ MarketDataStore DataState transitions verified.');

// --- 3. Testing OpportunityCertification & OpportunityProvenance ---
console.log('3. Testing OpportunityCertification and Provenance Engine...');

const item: EveTypeDetail = {
  type_id: 34,
  name: 'Tritanium',
  volume: 0.01,
  group_id: 18,
  category_id: 4,
};

const jitaHub: MarketHub = {
  id: 'jita',
  name: 'Jita 4-4',
  region: 'The Forge',
  region_id: 10000002,
  solar_system: 'Jita',
  system_id: 30000142,
  station: 'Jita IV - Moon 4 - Assembly Plant',
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
  available_capital: 1000000000,
  broker_fee: 0.01,
  sales_tax: 0.036,
  enable_transport_costs: true,
  transport_cost_per_m3: 1.0,
  transport_cost_per_jump: 10000,
  collateral_fee_pct: 0.005,
  transport_fixed_fee: 50000,
  max_cargo_m3: 60000,
  min_roi: 0.02,
  min_net_profit: 50000,
  max_days_to_sell: 7,
  max_capital_per_trade: 500000000,
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.50,
};

// 3.1 Certified viable trade
const jitaSellOrders: RawMarketOrder[] = [
  {
    order_id: 2001,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 4.00,
    volume_remain: 10000000,
    volume_total: 10000000,
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
    volume_remain: 5000000,
    volume_total: 5000000,
    min_volume: 1,
    is_buy_order: true,
    order_range: 'station',
    issued: new Date().toISOString(),
    duration: 90,
    captured_at: new Date().toISOString(),
  },
];

const buyQuality: MarketDataQuality = {
  source: 'esi',
  freshness: 'fresh',
  completeness: 'complete',
  data_state: 'VALID',
  validation_status: 'valid',
  fetched_at: new Date().toISOString(),
  age_seconds: 10,
  pages_fetched: 1,
  expected_pages: 1,
  orders_fetched: 1,
  orders_valid: 1,
  duplicate_orders_removed: 0,
  rejected_orders_count: 0,
  error_count: 0,
  confidence: 1.0,
  sync_duration_ms: 50,
};

const sellQuality: MarketDataQuality = {
  ...buyQuality,
};

const oppCertified = InterRegionalFinancialEngine.calculateOpportunity(
  item,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  {
    10000043: {
      type_id: 34,
      region_id: 10000043,
      daily_volume_7d_avg: 2000000,
      daily_volume_7d_median: 2000000,
      daily_volume_30d_avg: 2000000,
      daily_volume_30d_median: 2000000,
      daily_order_count_avg: 50,
      price_7d_avg: 5.80,
      price_30d_avg: 5.70,
      price_median_30d: 5.75,
      price_volatility: 0.05,
      volume_trend: 'stable',
      is_live_esi: true,
    },
  },
  { 10000002: buyQuality, 10000043: sellQuality },
  jitaSellOrders
);

if (!oppCertified) {
  throw new Error('calculateOpportunity returned null for valid arbitrage parameters');
}

if (!oppCertified.certification || !oppCertified.provenance) {
  throw new Error('Opportunity is missing certification or provenance contract objects');
}

if (oppCertified.certification.status !== 'CERTIFIED') {
  console.error('Blocking reasons:', oppCertified.certification.blocking_reasons);
  console.error('Warnings:', oppCertified.certification.warnings);
  throw new Error(`Expected certification status CERTIFIED, got ${oppCertified.certification.status}`);
}
if (!oppCertified.certification.is_actionable) {
  throw new Error('Expected actionable flag to be true for certified opportunity');
}
if (oppCertified.certification.data_state_source !== 'VALID' || oppCertified.certification.data_state_dest !== 'VALID') {
  throw new Error('Data states on certification must be VALID');
}
if (oppCertified.provenance.type_resolution.status !== 'RESOLVED_CATALOG') {
  throw new Error('Provenance type resolution must be RESOLVED_CATALOG');
}
if (!oppCertified.provenance.source_market_provenance || !oppCertified.provenance.dest_market_provenance) {
  throw new Error('Provenance must contain source and dest market provenance records');
}

// 3.2 Degraded trade with partial / stale source data
const staleBuyQuality: MarketDataQuality = {
  ...buyQuality,
  freshness: 'stale',
  data_state: 'STALE',
  age_seconds: 700,
  confidence: 0.7,
};

const oppDegraded = InterRegionalFinancialEngine.calculateOpportunity(
  item,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  undefined,
  { 10000002: staleBuyQuality, 10000043: sellQuality },
  jitaSellOrders
);

if (!oppDegraded) {
  throw new Error('calculateOpportunity returned null for degraded opportunity test');
}
if (!oppDegraded.certification) {
  throw new Error('oppDegraded.certification is missing');
}
if (oppDegraded.certification.status !== 'DEGRADED') {
  throw new Error(`Expected DEGRADED certification status for stale source data, got ${oppDegraded.certification.status}`);
}
if (oppDegraded.certification.is_actionable) {
  throw new Error('Expected actionable flag to be false for DEGRADED opportunity');
}
if (oppDegraded.certification.data_state_source !== 'STALE') {
  throw new Error(`Expected data_state_source to be STALE, got ${oppDegraded.certification.data_state_source}`);
}

console.log('✅ OpportunityCertification & Provenance verified.');

// --- 4. Testing IndexedDbStore Write Audit ---
console.log('4. Testing IndexedDbStore Storage Write Audit Tracking...');
const writeRecord = IndexedDbStore.getLastWriteStatus();
if (!['IDLE', 'WRITE_SUCCESS', 'WRITE_FAILED', 'WRITE_PENDING'].includes(writeRecord.status)) {
  throw new Error(`Invalid storage write status: ${writeRecord.status}`);
}

console.log('✅ IndexedDbStore storage write audit contract verified.');
console.log('🎉 ALL DATA CONTRACTS, PROVENANCE & CERTIFICATION TESTS PASSED SUCCESSFULLY!');
