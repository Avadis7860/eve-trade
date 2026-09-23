import { EsiService } from '../../services/esi';
import { MarketDataStore } from '../../services/marketDataStore';
import { setBackendApiFetchForTesting } from '../../services/backendApiClient';
import { InterRegionalScanner } from '../../services/scanner';
import { RawMarketOrder, MarketHub, EveTypeDetail, FinancialConfig, MarketDataQuality } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

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
  max_days_to_sell: 7,
  max_capital_per_trade: 200000000,
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.50,
};

async function runQualityTests() {
  console.log('--- RUNNING MARKET DATA QUALITY & AUDIT TESTS ---');

  // 1. Test validateOrder in EsiService
  console.log('1. Testing EsiService order validation...');
  const validOrder: RawMarketOrder = {
    order_id: '1001',
    type_id: 34,
    location_id: 60003760,
    system_id: 30000142,
    region_id: 10000002,
    price: 4.85,
    volume_remain: 100000,
    volume_total: 200000,
    is_buy_order: false,
    duration: 90,
    issued: new Date().toISOString(),
    order_range: 'region',
    min_volume: 1,
  };

  assert(EsiService.validateOrder(validOrder, 10000002, 34).isValid, 'Valid order must pass validation');

  // Test corrupted orders
  assert(!EsiService.validateOrder({ ...validOrder, price: 0 }, 10000002, 34).isValid, 'Price 0 must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, price: -5 }, 10000002, 34).isValid, 'Negative price must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, price: NaN }, 10000002, 34).isValid, 'NaN price must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, volume_remain: 0 }, 10000002, 34).isValid, 'volume_remain 0 must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, volume_remain: -10 }, 10000002, 34).isValid, 'Negative volume_remain must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, order_id: '0' }, 10000002, 34).isValid, 'order_id 0 must fail validation');
  assert(!EsiService.validateOrder({ ...validOrder, order_id: '-1' }, 10000002, 34).isValid, 'Negative order_id must fail validation');
  assert(!EsiService.validateOrder(null, 10000002, 34).isValid, 'null order must fail validation');
  assert(!EsiService.validateOrder(undefined, 10000002, 34).isValid, 'undefined order must fail validation');

  console.log('✅ EsiService order validation passed all edge cases.');

  // 2. Test MarketDataStore Snapshot & Stale Cache Logic
  console.log('2. Testing MarketDataStore snapshots & quality tracking...');
  const sampleQuality: MarketDataQuality = {
    source: 'esi',
    freshness: 'fresh',
    completeness: 'complete',
    validation_status: 'valid',
    fetched_at: new Date().toISOString(),
    age_seconds: 5,
    pages_fetched: 2,
    expected_pages: 2,
    orders_fetched: 150,
    orders_valid: 150,
    duplicate_orders_removed: 0,
    rejected_orders_count: 0,
    error_count: 0,
    confidence: 1.0,
    sync_duration_ms: 120,
  };

  MarketDataStore.setOrders(34, 10000002, [validOrder], true, sampleQuality);
  const snapshot = MarketDataStore.getSnapshot(34, 10000002);
  assert(snapshot !== null, 'Snapshot should be stored in MarketDataStore');
  assert(snapshot!.orders.length === 1, 'Snapshot should contain 1 order');
  assert(snapshot!.quality.confidence === 1.0, 'Confidence should be 1.0');
  assert(snapshot!.quality.freshness === 'fresh', 'Freshness should be fresh');

  // Verify degradation on age
  const staleQuality: MarketDataQuality = {
    ...sampleQuality,
    fetched_at: new Date(Date.now() - 900 * 1000).toISOString(), // 15 minutes ago
    age_seconds: 900,
  };
  MarketDataStore.setOrders(35, 10000002, [validOrder], true, staleQuality);
  const degradedQuality = MarketDataStore.getQuality(35, 10000002);
  assert(degradedQuality !== null, 'Quality should exist');
  assert(degradedQuality!.freshness === 'stale', '15 minutes old data must degrade to stale');
  assert(degradedQuality!.confidence < 1.0, 'Stale data must have lower confidence score');

  const expiredQuality: MarketDataQuality = {
    ...sampleQuality,
    fetched_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
    age_seconds: 3600,
  };
  MarketDataStore.setOrders(36, 10000002, [validOrder], true, expiredQuality);
  const expQuality = MarketDataStore.getQuality(36, 10000002);
  assert(expQuality !== null, 'Expired quality should exist');
  assert(expQuality!.freshness === 'expired', '1 hour old data must degrade to expired');

  // A valid empty ESI snapshot is also cacheable; it must not trigger a refetch loop.
  const emptyCacheQuality: MarketDataQuality = {
    ...sampleQuality,
    completeness: 'empty',
    orders_fetched: 0,
    orders_valid: 0,
    data_state: 'EMPTY',
    health_status: 'LIVE',
  };
  MarketDataStore.setOrders(38, 10000002, [], true, emptyCacheQuality);

  let emptyCacheCalls = 0;
  setBackendApiFetchForTesting(async () => {
    emptyCacheCalls++;
    throw new Error('A valid empty ESI snapshot must be served from cache');
  });
  const emptyCacheResult = await MarketDataStore.fetchLiveItemData(38, [{
    id: 'empty-cache-jita',
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
  }], false);
  assert(emptyCacheCalls === 0, 'A valid empty ESI snapshot must remain eligible for five-minute caching');
  assert(emptyCacheResult.successCount === 1, 'A cached empty ESI snapshot counts as a successful synchronized hub');
  setBackendApiFetchForTesting(null);

  // A failed/partial snapshot must not become a five-minute "healthy" cache.
  // Otherwise the UI can remain empty even after ESI becomes reachable again.
  const recoveryHub: MarketHub = {
    id: 'recovery-jita',
    name: 'Recovery Jita',
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
  const failedQuality: MarketDataQuality = {
    ...sampleQuality,
    completeness: 'empty',
    validation_status: 'invalid',
    data_state: 'ERROR',
    health_status: 'ERROR',
    error_count: 1,
    orders_fetched: 0,
    orders_valid: 0,
    fetched_at: new Date().toISOString(),
    age_seconds: 0,
    last_error: 'HTTP 503',
  };
  MarketDataStore.setOrders(37, recoveryHub.region_id, [], true, failedQuality);

  let recoveryMarketCalls = 0;
  setBackendApiFetchForTesting(async (input) => {
    const url = String(input);
    if (url.includes('/api/markets/' + recoveryHub.region_id + '/orders')) {
      recoveryMarketCalls++;
      return new Response(JSON.stringify([{ ...validOrder, type_id: 37, order_id: '37001' }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Pages': '1',
        },
      });
    }
    if (url.includes('/api/markets/' + recoveryHub.region_id + '/history')) {
      return new Response(JSON.stringify([{
        date: '2026-09-22',
        order_count: 10,
        volume: 500,
        average: 50,
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected recovery request: ' + url);
  });

  const recovery = await MarketDataStore.fetchLiveItemData(37, [recoveryHub], false);
  assert(recoveryMarketCalls === 1, 'An ERROR snapshot must not suppress a new market request');
  assert(recovery.orderBooks[recoveryHub.region_id]?.length === 1, 'Recovered ESI orders must replace the failed empty state');
  assert(recovery.qualities[recoveryHub.region_id]?.health_status === 'LIVE', 'Recovered complete ESI data must return to LIVE');
  assert(recovery.qualities[recoveryHub.region_id]?.last_http_status === 200, 'Market quality must preserve final HTTP status');
  assert(recovery.qualities[recoveryHub.region_id]?.cache_status === undefined, 'Mock response without cache header should not invent a cache state');

  console.log('✅ Failed market snapshot recovery / cache gate passed.');

  // A transport/parse exception must degrade an older usable snapshot to explicit STALE cache.
  MarketDataStore.setOrders(40, recoveryHub.region_id, [validOrder], true, {
    ...sampleQuality,
    fetched_at: new Date().toISOString(),
    age_seconds: 0,
    data_state: 'VALID',
    health_status: 'LIVE',
  });
  setBackendApiFetchForTesting(async () => {
    throw new Error('network unavailable');
  });
  const exceptionFallback = await MarketDataStore.fetchLiveItemData(40, [recoveryHub], true);
  assert(exceptionFallback.orderBooks[recoveryHub.region_id]?.length === 1, 'Transport exception must preserve the previous usable order book');
  assert(exceptionFallback.qualities[recoveryHub.region_id]?.source === 'cache', 'Transport exception fallback must identify cache source');
  assert(exceptionFallback.qualities[recoveryHub.region_id]?.health_status === 'STALE', 'Transport exception fallback must be explicitly STALE');
  assert(exceptionFallback.qualities[recoveryHub.region_id]?.data_state === 'STALE', 'Transport exception fallback must be explicitly STALE data');
  setBackendApiFetchForTesting(null);

  console.log('✅ MarketDataStore snapshot & cache degradation passed.');

  // 3. Test Scanner with Quality Metadata
  console.log('3. Testing InterRegionalScanner with DataQuality metadata...');
  const testHubs: MarketHub[] = [
    {
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
    },
    {
      id: 'amarr',
      name: 'Amarr VIII',
      region: 'Domain',
      region_id: 10000043,
      solar_system: 'Amarr',
      system_id: 30002187,
      station: 'Amarr VIII (Oris) - Emperor Family Academy',
      station_id: 60008494,
      security_status: 0.9,
      priority: 2,
      active: true,
      hub_type: 'npc_major',
    },
  ];

  const testItem: EveTypeDetail = {
    type_id: 34,
    name: 'Tritanium',
    volume: 0.01,
    group_id: 18,
    category_id: 4,
  };

  const jitaSellOrder: RawMarketOrder = {
    order_id: '2001',
    type_id: 34,
    location_id: 60003760,
    system_id: 30000142,
    region_id: 10000002,
    price: 4.0,
    volume_remain: 100000,
    volume_total: 100000,
    is_buy_order: false,
    duration: 90,
    issued: new Date().toISOString(),
    order_range: 'region',
    min_volume: 1,
  };

  const amarrBuyOrder: RawMarketOrder = {
    order_id: '2002',
    type_id: 34,
    location_id: 60008494,
    system_id: 30002187,
    region_id: 10000043,
    price: 5.5,
    volume_remain: 50000,
    volume_total: 50000,
    is_buy_order: true,
    duration: 90,
    issued: new Date().toISOString(),
    order_range: 'region',
    min_volume: 1,
  };

  const orderBooks = {
    10000002: [jitaSellOrder],
    10000043: [amarrBuyOrder],
  };

  const qualities = {
    10000002: sampleQuality,
    10000043: sampleQuality,
  };

  const opps = InterRegionalScanner.scanItemAcrossHubs(
    testItem,
    testHubs,
    'immediate',
    testConfig,
    orderBooks,
    undefined,
    qualities
  );

  assert(opps.length > 0, 'Should find at least 1 opportunity between Jita and Amarr');
  const opp = opps[0];
  if (opp.costs.net_profit <= 0) {
    console.log('Opp costs debug:', JSON.stringify(opp.costs, null, 2));
  }
  assert(opp.data_quality !== undefined, 'Opportunity must contain data_quality metadata');
  assert(opp.data_quality!.confidence_score === 1.0, 'Opportunity confidence score should be 1.0 for fresh ESI data');
  assert(opp.data_quality!.is_verified_esi === true, 'Opportunity should be marked verified ESI');
  assert(opp.data_quality!.overall_freshness === 'fresh', 'Freshness should be fresh');
  assert(opp.costs.net_profit > 0, `Net profit should be positive, got ${opp.costs.net_profit}`);

  console.log('✅ InterRegionalScanner data quality verification passed.');

  // 4. Test Anomaly Detection with Partial or Stale Data
  console.log('4. Testing Anomaly Flagging on Degraded Market Data...');
  const partialQuality: MarketDataQuality = {
    ...sampleQuality,
    completeness: 'partial',
    pages_fetched: 1,
    expected_pages: 3,
    confidence: 0.33,
  };

  const partialQualities = {
    10000002: partialQuality,
    10000043: sampleQuality,
  };

  const partialOpps = InterRegionalScanner.scanItemAcrossHubs(
    testItem,
    testHubs,
    'immediate',
    testConfig,
    orderBooks,
    undefined,
    partialQualities
  );

  assert(partialOpps.length > 0, 'Opportunity should still be generated');
  const partialOpp = partialOpps[0];
  assert(partialOpp.is_anomalous === true, 'Opportunity with partial market data MUST be flagged as anomalous');
  assert(partialOpp.anomaly_reasons.some((r) => r.includes('partielles') || r.includes('incomplètes')), 'Anomaly reason must indicate incomplete/partial data');
  assert(partialOpp.data_quality!.overall_completeness === 'partial', 'Overall completeness must be partial');
  assert(partialOpp.data_quality!.confidence_score <= 0.33, 'Confidence score must be penalized');

  console.log('✅ Anomaly detection on partial market data verified.');

  // 5. Test Missing / Empty Hub Orders (No Ghost Opportunities)
  console.log('5. Testing zero-order & missing data behavior...');
  const emptyOrderBooks = {
    10000002: [],
    10000043: [],
  };

  const emptyOpps = InterRegionalScanner.scanItemAcrossHubs(
    testItem,
    testHubs,
    'immediate',
    testConfig,
    emptyOrderBooks,
    undefined,
    qualities
  );

  assert(emptyOpps.length === 0, 'Empty order book MUST produce 0 opportunities (no ghost trades)');

  console.log('✅ Empty book safety verified.');

  console.log('🎉 ALL MARKET DATA QUALITY & AUDIT TESTS PASSED SUCCESSFULLY!');
}

runQualityTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
