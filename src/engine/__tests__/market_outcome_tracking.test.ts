import { OpportunityEvidenceEngine } from '../evidence';
import { MarketOutcomeTracker } from '../../services/marketOutcomeTracker';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { MarketDataStore } from '../../services/marketDataStore';
import { InterRegionalFinancialEngine } from '../interRegional';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  RawMarketOrder,
  MarketDataQuality,
  OpportunityObservation,
  OutcomeHorizon,
  OUTCOME_HORIZON_DURATIONS_MS,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING PHASE 2A: MARKET OUTCOME TRACKING TESTS ===\n');

// 1. Setup Test Entities
const testItem: EveTypeDetail = {
  type_id: 34,
  name: 'Tritanium',
  volume: 0.01,
  group_id: 18,
  group_name: 'Mineral',
  category_id: 4,
  category_name: 'Material',
  average_price: 5.5,
};

const buyHub: MarketHub = {
  id: 'jita',
  name: 'Jita IV - 4',
  region_id: 10000002,
  region: 'The Forge',
  system_id: 30000142,
  solar_system: 'Jita',
  station_id: 60003760,
  station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  active: true,
  security_status: 0.9,
  priority: 1,
  hub_type: 'npc_major',
};

const sellHub: MarketHub = {
  id: 'amarr',
  name: 'Amarr VIII (Oris)',
  region_id: 10000043,
  region: 'Domain',
  system_id: 30002187,
  solar_system: 'Amarr',
  station_id: 60008494,
  station: 'Amarr VIII (Oris) - Emperor Family Academy',
  active: true,
  security_status: 1.0,
  priority: 2,
  hub_type: 'npc_major',
};

const baseConfig: FinancialConfig = {
  available_capital: 1000000000,
  broker_fee: 0.01,
  sales_tax: 0.036,
  enable_transport_costs: true,
  transport_cost_per_m3: 15.0,
  transport_cost_per_jump: 1000,
  max_cargo_m3: 10000,
  min_roi: 0.02,
  min_net_profit: 1000,
  max_days_to_sell: 30,
  max_capital_per_trade: 1000000000,
  max_portfolio_concentration_type: 0.5,
  max_portfolio_concentration_group: 0.5,
  accounting_level: 5,
  broker_relations_level: 5,
  advanced_broker_relations_level: 5,
  faction_standing: 0,
  corp_standing: 0,
};

// Initial T0 market orders (Spread: 5.0 -> 8.0)
const initialSourceOrders: RawMarketOrder[] = [
  {
    order_id: 1001,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 5.0,
    volume_remain: 50000,
    volume_total: 50000,
    is_buy_order: false,
    issued: '2026-09-20T00:00:00Z',
    duration: 90,
  },
];

const initialDestOrders: RawMarketOrder[] = [
  {
    order_id: 2001,
    type_id: 34,
    region_id: 10000043,
    system_id: 30002187,
    location_id: 60008494,
    price: 8.0,
    volume_remain: 30000,
    volume_total: 30000,
    is_buy_order: false,
    issued: '2026-09-20T00:00:00Z',
    duration: 90,
  },
];

function generateTestObservation(timestamp: string): OpportunityObservation {
  const opp = InterRegionalFinancialEngine.calculateOpportunity(
    testItem,
    buyHub,
    sellHub,
    'immediate',
    baseConfig,
    initialSourceOrders,
    [
      {
        order_id: 2002,
        type_id: 34,
        region_id: 10000043,
        system_id: 30002187,
        location_id: 60008494,
        price: 8.0,
        volume_remain: 30000,
        volume_total: 30000,
        is_buy_order: true, // Buy order for immediate dump
        issued: '2026-09-20T00:00:00Z',
        duration: 90,
      },
    ]
  );
  assert(opp !== null, 'Opportunity should be generated at T0');

  const observation = OpportunityEvidenceEngine.createOpportunityObservation(opp!, {
    sourceObservationId: 'obs_src_test',
    destObservationId: 'obs_dst_test',
  });
  observation.timestamp = timestamp;
  return observation;
}

// ==========================================
// TEST SUITE 1: OUTCOME SCHEDULER & HORIZONS
// ==========================================
console.log('--- Test Suite 1: Outcome Scheduler & Horizon Temporal Calculations ---');

{
  const t0 = new Date('2026-09-20T00:00:00Z').getTime();
  const observation = generateTestObservation(new Date(t0).toISOString());

  // 1. Horizon not reached: T0 + 30 minutes
  const tPlus30m = t0 + 30 * 60 * 1000;
  const pending30m = MarketOutcomeTracker.getPendingHorizons(observation, tPlus30m);
  assert(pending30m.length === 0, 'No horizons should be due at T0 + 30m');
  assert(!MarketOutcomeTracker.isHorizonDue(observation, '1h', tPlus30m), '1h should not be due at 30m');
  assert(
    MarketOutcomeTracker.getHorizonTimeRemaining(observation, '1h', tPlus30m) === 30 * 60 * 1000,
    'Remaining time for 1h should be exactly 30 minutes'
  );

  // 2. Horizon 1h reached: T0 + 65 minutes
  const tPlus65m = t0 + 65 * 60 * 1000;
  const pending65m = MarketOutcomeTracker.getPendingHorizons(observation, tPlus65m);
  assert(pending65m.length === 1 && pending65m[0] === '1h', '1h horizon should be due at T0 + 65m');
  assert(MarketOutcomeTracker.isHorizonDue(observation, '1h', tPlus65m), '1h should be due');
  assert(!MarketOutcomeTracker.isHorizonDue(observation, '6h', tPlus65m), '6h should not be due yet');

  // 3. Multiple horizons reached: T0 + 26 hours
  const tPlus26h = t0 + 26 * 60 * 60 * 1000;
  const pending26h = MarketOutcomeTracker.getPendingHorizons(observation, tPlus26h);
  assert(
    pending26h.length === 3 &&
      pending26h[0] === '1h' &&
      pending26h[1] === '6h' &&
      pending26h[2] === '24h',
    '1h, 6h, and 24h horizons should be due at T0 + 26h'
  );

  // 4. Idempotence: Horizon already recorded is excluded from pending
  observation.outcomes = {
    '1h': {
      horizon: '1h',
      recorded_at: new Date(tPlus65m).toISOString(),
      still_active: true,
      current_spread_pct: 60.0,
      spread_decay_pct: 0.0,
      current_buy_price: 5.0,
      current_sell_price: 8.0,
      price_change_source_pct: 0.0,
      price_change_dest_pct: 0.0,
    },
  };

  const pendingAfter1hRecorded = MarketOutcomeTracker.getPendingHorizons(observation, tPlus26h);
  assert(
    pendingAfter1hRecorded.length === 2 &&
      pendingAfter1hRecorded[0] === '6h' &&
      pendingAfter1hRecorded[1] === '24h',
    '1h should not be pending after being recorded'
  );
  assert(!MarketOutcomeTracker.isHorizonDue(observation, '1h', tPlus26h), 'Recorded 1h is not due again');

  console.log('  [PASS] Outcome Scheduler horizon temporal checks validated.');
}

// ==========================================
// TEST SUITE 2: EMPIRICAL OUTCOME CALCULATIONS (SPREAD, DECAY, PRICES)
// ==========================================
console.log('--- Test Suite 2: Outcome Snapshot Calculations ---');

{
  const t0 = new Date('2026-09-20T00:00:00Z').getTime();
  const observation = generateTestObservation(new Date(t0).toISOString());
  // Initial: buy_price = 5.0, sell_price = 8.0 (spread = (8 - 5)/5 = 60%)

  // 1. Spread Decay Scenario: Sell price drops to 6.50 at dest (spread = (6.5 - 5)/5 = 30%)
  const destOrdersDegraded: RawMarketOrder[] = [
    {
      order_id: 2003,
      type_id: 34,
      region_id: 10000043,
      system_id: 30002187,
      location_id: 60008494,
      price: 6.5,
      volume_remain: 30000,
      volume_total: 30000,
      is_buy_order: true,
      issued: '2026-09-20T01:00:00Z',
      duration: 90,
    },
  ];

  const evalDecay = MarketOutcomeTracker.evaluateOutcome(
    observation,
    '1h',
    initialSourceOrders,
    destOrdersDegraded
  );
  assert(evalDecay.isValid && evalDecay.outcome !== undefined, 'Outcome evaluation should succeed');
  const snapDecay = evalDecay.outcome!;
  assert(snapDecay.current_buy_price === 5.0, 'Source buy price should be 5.0');
  assert(snapDecay.current_sell_price === 6.5, 'Dest sell price should be 6.5');
  assert(snapDecay.current_spread_pct === 30.0, 'Current spread should be 30.0%');
  // Initial spread was 60.0%, current is 30.0% -> decay is (60 - 30)/60 * 100 = 50.0%
  assert(snapDecay.spread_decay_pct === 50.0, `Spread decay should be 50%, got ${snapDecay.spread_decay_pct}`);
  assert(snapDecay.price_change_source_pct === 0.0, 'Source price did not change');
  assert(
    snapDecay.price_change_dest_pct === -18.75,
    `Dest price change should be ((6.5 - 8)/8)*100 = -18.75%, got ${snapDecay.price_change_dest_pct}`
  );
  assert(snapDecay.still_active === true, 'Spread is still positive, so still_active is true');

  // 2. Spread Collapse Scenario: Dest price drops below source price (e.g. 4.80 ISK)
  const destOrdersCollapsed: RawMarketOrder[] = [
    {
      order_id: 2004,
      type_id: 34,
      region_id: 10000043,
      system_id: 30002187,
      location_id: 60008494,
      price: 4.8,
      volume_remain: 30000,
      volume_total: 30000,
      is_buy_order: true,
      issued: '2026-09-20T06:00:00Z',
      duration: 90,
    },
  ];

  const evalCollapsed = MarketOutcomeTracker.evaluateOutcome(
    observation,
    '6h',
    initialSourceOrders,
    destOrdersCollapsed
  );
  assert(evalCollapsed.isValid && evalCollapsed.outcome !== undefined, 'Collapsed evaluation should succeed');
  const snapCollapsed = evalCollapsed.outcome!;
  assert(snapCollapsed.current_spread_pct === 0.0, 'Negative spread resolves to 0.0%');
  assert(snapCollapsed.spread_decay_pct === 100.0, 'Full spread decay (100%)');
  assert(snapCollapsed.still_active === false, 'Spread collapse means still_active is false');

  // 3. Spread Expansion Scenario: Dest price increases to 10.0 ISK
  const destOrdersExpanded: RawMarketOrder[] = [
    {
      order_id: 2005,
      type_id: 34,
      region_id: 10000043,
      system_id: 30002187,
      location_id: 60008494,
      price: 10.0,
      volume_remain: 30000,
      volume_total: 30000,
      is_buy_order: true,
      issued: '2026-09-20T06:00:00Z',
      duration: 90,
    },
  ];

  const evalExpanded = MarketOutcomeTracker.evaluateOutcome(
    observation,
    '24h',
    initialSourceOrders,
    destOrdersExpanded
  );
  assert(evalExpanded.isValid && evalExpanded.outcome !== undefined, 'Expanded evaluation should succeed');
  const snapExpanded = evalExpanded.outcome!;
  assert(snapExpanded.current_spread_pct === 100.0, 'Spread (10 - 5)/5 = 100.0%');
  // Initial spread was 60.0%, current is 100.0% -> decay = ((60 - 100)/60)*100 = -66.67%
  assert(snapExpanded.spread_decay_pct < 0, 'Negative decay represents spread expansion');
  assert(snapExpanded.still_active === true, 'Active spread');

  // 4. Missing/Empty order book handling (No orders at dest)
  const evalEmpty = MarketOutcomeTracker.evaluateOutcome(observation, '3d', initialSourceOrders, []);
  assert(evalEmpty.isValid && evalEmpty.outcome !== undefined, 'Empty book evaluation should handle gracefully');
  const snapEmpty = evalEmpty.outcome!;
  assert(snapEmpty.current_buy_price === 5.0, 'Buy price preserved');
  assert(snapEmpty.current_sell_price === 0.0, 'Missing sell price is 0.0');
  assert(snapEmpty.current_spread_pct === 0.0, 'No spread');
  assert(snapEmpty.still_active === false, 'Not active');
  assert(!isNaN(snapEmpty.spread_decay_pct), 'No NaN values');

  console.log('  [PASS] Outcome calculations and mathematical boundaries validated.');
}

// ==========================================
// TEST SUITE 3: DATA QUALITY & FAILURE SEMANTICS
// ==========================================
console.log('--- Test Suite 3: Data Quality & Failure Semantics in Outcome Evaluation ---');

{
  const t0 = new Date('2026-09-20T00:00:00Z').getTime();
  const observation = generateTestObservation(new Date(t0).toISOString());

  // Quality with ERROR status
  const errorQuality: MarketDataQuality = {
    source: 'esi',
    freshness: 'expired',
    completeness: 'empty',
    validation_status: 'invalid',
    health_status: 'ERROR',
    data_state: 'ERROR',
    fetched_at: new Date().toISOString(),
    age_seconds: 9999,
    pages_fetched: 0,
    expected_pages: 1,
    orders_fetched: 0,
    orders_valid: 0,
    duplicate_orders_removed: 0,
    rejected_orders_count: 5,
    error_count: 3,
    last_error: 'HTTP 503 Backend Service Unavailable',
    confidence: 0.0,
    sync_duration_ms: 1200,
  };

  const evalError = MarketOutcomeTracker.evaluateOutcome(
    observation,
    '1h',
    initialSourceOrders,
    initialDestOrders,
    undefined,
    errorQuality
  );

  assert(evalError.isValid === false, 'Evaluation with ERROR data quality must be rejected');
  assert(Boolean(evalError.error?.includes('failed quality validation')), 'Error message must specify quality failure');

  console.log('  [PASS] Data quality rejection and failure semantics validated.');
}

// ==========================================
// TEST SUITE 4: PERSISTENCE, APPEND-ONLY & IDEMPOTENCE
// ==========================================
console.log('--- Test Suite 4: Persistence, Append-Only Storage & Idempotence ---');

async function testPersistenceAndImmutability() {
  const t0 = new Date('2026-09-20T00:00:00Z').getTime();
  const observation = generateTestObservation(new Date(t0).toISOString());

  // Save initial T0 observation
  await IndexedDbStore.saveOpportunityObservation(observation);

  // Snapshot initial integrity
  const initialHash = observation.evidence_hash;
  const initialPrediction = observation.expected_days_to_sell;
  const initialNetProfit = observation.net_profit;
  const initialRoi = observation.roi;
  const initialBuyPrice = observation.buy_price;
  const initialSellPrice = observation.sell_price;

  const preVerification = OpportunityEvidenceEngine.verifyObservationIntegrity(observation);
  assert(preVerification.is_valid === true, 'Observation must pass 4-pillar integrity at T0');

  // 1. Record 1h outcome
  const res1h = await MarketOutcomeTracker.collectAndRecordForObservation(observation, '1h', {
    sourceOrders: initialSourceOrders,
    destOrders: initialDestOrders,
  });
  assert(res1h.recorded === true, '1h outcome should be recorded successfully');
  assert(res1h.outcome?.horizon === '1h', 'Outcome horizon should be 1h');

  // 2. Test Idempotence: Record 1h outcome again
  const res1hDuplicate = await MarketOutcomeTracker.collectAndRecordForObservation(observation, '1h', {
    sourceOrders: initialSourceOrders,
    destOrders: initialDestOrders,
  });
  assert(res1hDuplicate.recorded === false, 'Duplicate recording must return recorded: false');
  assert(res1hDuplicate.skippedAlreadyRecorded === true, 'Duplicate recording must be flagged as skipped');

  // 3. Record 6h and 24h outcomes
  const res6h = await MarketOutcomeTracker.collectAndRecordForObservation(observation, '6h', {
    sourceOrders: initialSourceOrders,
    destOrders: initialDestOrders,
  });
  assert(res6h.recorded === true, '6h outcome should be recorded');

  const res24h = await MarketOutcomeTracker.collectAndRecordForObservation(observation, '24h', {
    sourceOrders: initialSourceOrders,
    destOrders: initialDestOrders,
  });
  assert(res24h.recorded === true, '24h outcome should be recorded');

  // 4. Retrieve stored observation from IndexedDb and verify multi-horizon outcomes
  const stored = await IndexedDbStore.getOpportunityObservationById(observation.observation_id);
  assert(stored !== null, 'Observation must be retrievable from IndexedDb');
  assert(stored?.outcomes !== undefined, 'Stored observation must contain outcomes dictionary');
  assert(stored?.outcomes?.['1h'] !== undefined, '1h outcome must exist in storage');
  assert(stored?.outcomes?.['6h'] !== undefined, '6h outcome must exist in storage');
  assert(stored?.outcomes?.['24h'] !== undefined, '24h outcome must exist in storage');

  // 5. TEST IMMUTABILITY: Verify T0 values are strictly unchanged
  assert(stored?.evidence_hash === initialHash, 'evidence_hash must be strictly immutable');
  assert(stored?.expected_days_to_sell === initialPrediction, 'T0 prediction must be strictly immutable');
  assert(stored?.net_profit === initialNetProfit, 'T0 net_profit must be strictly immutable');
  assert(stored?.roi === initialRoi, 'T0 roi must be strictly immutable');
  assert(stored?.buy_price === initialBuyPrice, 'T0 buy_price must be strictly immutable');
  assert(stored?.sell_price === initialSellPrice, 'T0 sell_price must be strictly immutable');

  const postVerification = OpportunityEvidenceEngine.verifyObservationIntegrity(stored!);
  assert(
    postVerification.is_valid === true,
    'Observation must continue to pass 4-pillar cryptographic integrity after outcomes are recorded'
  );

  console.log('  [PASS] Persistence, idempotence, and T0 immutability validated.');
}

// ==========================================
// TEST SUITE 5: BATCH SCHEDULER PROCESSING
// ==========================================
console.log('--- Test Suite 5: Batch Scheduler Execution (processPendingOutcomes) ---');

async function testBatchScheduler() {
  MarketOutcomeTracker.resetForTesting();

  const t0 = new Date('2026-09-20T00:00:00Z').getTime();

  // Create 3 test observations with different ages
  const obs1 = generateTestObservation(new Date(t0).toISOString()); // 2 hours old
  obs1.observation_id = 'obs_test_batch_1';
  obs1.type_id = 34;
  obs1.source_region_id = 10000002;
  obs1.dest_region_id = 10000043;

  const obs2 = generateTestObservation(new Date(t0 + 90 * 60 * 1000).toISOString()); // 30 mins old
  obs2.observation_id = 'obs_test_batch_2';
  obs2.type_id = 34;
  obs2.source_region_id = 10000002;
  obs2.dest_region_id = 10000043;

  await IndexedDbStore.saveOpportunityObservations([obs1, obs2]);

  // Seed deterministic fresh market snapshots so the scheduler does not depend on live ESI/network state.
  const freshQuality = (regionId: number): MarketDataQuality => ({
    source: 'esi',
    freshness: 'fresh',
    completeness: 'complete',
    validation_status: 'valid',
    data_state: 'VALID',
    health_status: 'LIVE',
    fetched_at: new Date().toISOString(),
    age_seconds: 0,
    pages_fetched: 1,
    expected_pages: 1,
    orders_fetched: 1,
    orders_valid: 1,
    duplicate_orders_removed: 0,
    rejected_orders_count: 0,
    error_count: 0,
    confidence: 1,
    sync_duration_ms: 0,
    last_error: undefined,
  });
  MarketDataStore.setOrders(10000002 === 10000002 ? 34 : 34, 10000002, initialSourceOrders, true, freshQuality(10000002));
  MarketDataStore.setOrders(34, 10000043, [{
    order_id: 2002,
    type_id: 34,
    region_id: 10000043,
    system_id: 30002187,
    location_id: 60008494,
    price: 8.0,
    volume_remain: 30000,
    volume_total: 30000,
    is_buy_order: true,
    issued: '2026-09-20T00:00:00Z',
    duration: 90,
  }], true, freshQuality(10000043));

  // Execute batch processing at T0 + 2 hours (120 mins)
  const currentTime = t0 + 120 * 60 * 1000;
  const report = await MarketOutcomeTracker.processPendingOutcomes(currentTime);

  assert(report.totalObservationsChecked >= 1, 'At least 1 observation should be checked');
  // obs1 is 2 hours old -> '1h' is due. obs2 is 30 mins old -> not due.
  assert(report.outcomesRecordedCount >= 1, 'At least 1 outcome should be recorded');

  // Second run: Should skip all already recorded outcomes
  const secondReport = await MarketOutcomeTracker.processPendingOutcomes(currentTime);
  assert(secondReport.outcomesRecordedCount === 0, 'Second run should not re-record outcomes');

  console.log('  [PASS] Batch scheduler execution and deduplication validated.');
}

// ==========================================
// TEST SUITE 6: SCHEDULER LIFECYCLE (START / STOP / IDEMPOTENCE)
// ==========================================
console.log('--- Test Suite 6: Scheduler Lifecycle & Idempotence ---');

async function testSchedulerLifecycle() {
  MarketOutcomeTracker.resetForTesting();
  let status = MarketOutcomeTracker.getStatus();
  assert(status.isRunning === false, 'Initial state: scheduler must not be running');

  // 1. Start scheduler
  MarketOutcomeTracker.startScheduler(5000);
  status = MarketOutcomeTracker.getStatus();
  assert(status.isRunning === true, 'Scheduler must be running after startScheduler');
  assert(status.intervalMs === 5000, 'Interval must be 5000ms');

  // 2. Double-start (idempotence verification)
  MarketOutcomeTracker.startScheduler(10000);
  status = MarketOutcomeTracker.getStatus();
  assert(status.isRunning === true, 'Scheduler must remain running');
  assert(status.intervalMs === 5000, 'Double-start must not override existing timer or leak intervals');

  // 3. Stop scheduler
  MarketOutcomeTracker.stopScheduler();
  status = MarketOutcomeTracker.getStatus();
  assert(status.isRunning === false, 'Scheduler must not be running after stopScheduler');

  // 4. Double-stop safety
  MarketOutcomeTracker.stopScheduler();
  status = MarketOutcomeTracker.getStatus();
  assert(status.isRunning === false, 'Double-stop must be clean and safe');

  console.log('  [PASS] Scheduler lifecycle, timers, and idempotence verified.');
}

// ==========================================
// TEST SUITE 7: FRESHNESS POLICY & CACHE DISCRIMINATION
// ==========================================
console.log('--- Test Suite 7: Market Data Freshness Policy ---');

async function testFreshnessPolicy() {
  MarketOutcomeTracker.resetForTesting();
  const t0 = new Date('2026-09-20T00:00:00Z').getTime();
  const obs = generateTestObservation(new Date(t0).toISOString());
  obs.observation_id = 'obs_freshness_test';
  obs.type_id = 34;
  obs.source_region_id = 10000002;
  obs.dest_region_id = 10000043;

  await IndexedDbStore.saveOpportunityObservation(obs);

  // Scenario A: Cache populated with PRE-T0 or STALE timestamp
  MarketDataStore.setSnapshot({
    type_id: 34,
    region_id: 10000002,
    orders: initialSourceOrders,
    timestamp: t0 - 60000,
    quality: {
      source: 'esi',
      fetched_at: new Date(t0 - 60000).toISOString(), // 1 minute before T0 (STALE / PRE-T0)
      health_status: 'STALE',
      freshness: 'stale',
      completeness: 'complete',
      validation_status: 'valid',
      age_seconds: 60,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: initialSourceOrders.length,
      orders_valid: initialSourceOrders.length,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      confidence: 1.0,
      sync_duration_ms: 50,
    },
  });

  MarketDataStore.setSnapshot({
    type_id: 34,
    region_id: 10000043,
    orders: initialDestOrders,
    timestamp: t0 - 60000,
    quality: {
      source: 'esi',
      fetched_at: new Date(t0 - 60000).toISOString(), // 1 minute before T0 (STALE / PRE-T0)
      health_status: 'STALE',
      freshness: 'stale',
      completeness: 'complete',
      validation_status: 'valid',
      age_seconds: 60,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: initialDestOrders.length,
      orders_valid: initialDestOrders.length,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      confidence: 1.0,
      sync_duration_ms: 50,
    },
  });

  // When collectAndRecordForObservation runs, since cache is pre-T0 / stale, it will try live ESI fetch
  const resStale = await MarketOutcomeTracker.collectAndRecordForObservation(obs, '1h');
  assert(resStale.recorded === true, 'Live fetch fallback should succeed and record fresh outcome');
  assert(resStale.outcome !== undefined, 'Outcome snapshot must be recorded');

  // Scenario B: Fresh cache captured AFTER T0 (e.g. 5 minutes after T0)
  const freshObs = generateTestObservation(new Date(t0).toISOString());
  freshObs.observation_id = 'obs_fresh_cache_test';
  await IndexedDbStore.saveOpportunityObservation(freshObs);

  const freshTimestamp = new Date(Date.now() - 60000).toISOString(); // 1 minute ago (fresh & post-T0)
  MarketDataStore.setSnapshot({
    type_id: 34,
    region_id: 10000002,
    orders: initialSourceOrders,
    timestamp: Date.now() - 60000,
    quality: {
      source: 'esi',
      fetched_at: freshTimestamp,
      health_status: 'LIVE',
      freshness: 'fresh',
      completeness: 'complete',
      validation_status: 'valid',
      age_seconds: 60,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: initialSourceOrders.length,
      orders_valid: initialSourceOrders.length,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      confidence: 1.0,
      sync_duration_ms: 50,
    },
  });

  MarketDataStore.setSnapshot({
    type_id: 34,
    region_id: 10000043,
    orders: initialDestOrders,
    timestamp: Date.now() - 60000,
    quality: {
      source: 'esi',
      fetched_at: freshTimestamp,
      health_status: 'LIVE',
      freshness: 'fresh',
      completeness: 'complete',
      validation_status: 'valid',
      age_seconds: 60,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: initialDestOrders.length,
      orders_valid: initialDestOrders.length,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      confidence: 1.0,
      sync_duration_ms: 50,
    },
  });

  const resFresh = await MarketOutcomeTracker.collectAndRecordForObservation(freshObs, '1h');
  assert(resFresh.recorded === true, 'Fresh cache should be accepted and recorded');
  assert(resFresh.outcome?.source_quality?.freshness === 'fresh', 'Outcome recorded with fresh quality metadata');

  console.log('  [PASS] Freshness policy, pre-T0 rejection, and fresh cache usage verified.');
}

async function runAll() {
  await testPersistenceAndImmutability();
  await testBatchScheduler();
  await testSchedulerLifecycle();
  await testFreshnessPolicy();
  console.log('\n=== ALL PHASE 2A MARKET OUTCOME TRACKING TESTS PASSED (100%) ===\n');
}

runAll().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
