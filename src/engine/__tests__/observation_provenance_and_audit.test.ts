import { OpportunityEvidenceEngine } from '../evidence';
import { IndexedDbStore } from '../../services/indexedDbStore';
import { InterRegionalFinancialEngine } from '../interRegional';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  RawMarketOrder,
  MarketDataQuality,
  OpportunityObservation,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('=== RUNNING OBSERVATION PROVENANCE & AUDIT TRAIL TESTS ===\n');

// Mock data setup
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

const config: FinancialConfig = {
  available_capital: 10000000,
  max_cargo_m3: 5000,
  broker_fee: 0.03,
  sales_tax: 0.08,
  enable_transport_costs: true,
  transport_cost_per_m3: 50,
  transport_cost_per_jump: 1000,
  min_roi: 0.05,
  min_net_profit: 10000,
  accounting_level: 5,
  broker_relations_level: 5,
  advanced_broker_relations_level: 5,
  max_days_to_sell: 30,
  max_capital_per_trade: 10000000,
  max_portfolio_concentration_type: 0.5,
  max_portfolio_concentration_group: 0.5,
};

const sourceOrders: RawMarketOrder[] = [
  {
    order_id: 101,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 4.5,
    volume_remain: 100000,
    volume_total: 100000,
    is_buy_order: false,
    duration: 90,
    issued: new Date().toISOString(),
    min_volume: 1,
  },
];

const destOrders: RawMarketOrder[] = [
  {
    order_id: 201,
    type_id: 34,
    region_id: 10000043,
    system_id: 30002187,
    location_id: 60008494,
    price: 7.2,
    volume_remain: 50000,
    volume_total: 50000,
    is_buy_order: true,
    duration: 90,
    issued: new Date().toISOString(),
    min_volume: 1,
  },
];

const qualityMap: Record<number, MarketDataQuality> = {
  10000002: {
    source: 'esi',
    freshness: 'fresh',
    completeness: 'complete',
    validation_status: 'valid',
    data_state: 'VALID',
    health_status: 'LIVE',
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
  },
  10000043: {
    source: 'esi',
    freshness: 'fresh',
    completeness: 'complete',
    validation_status: 'valid',
    data_state: 'VALID',
    health_status: 'LIVE',
    fetched_at: new Date().toISOString(),
    age_seconds: 15,
    pages_fetched: 1,
    expected_pages: 1,
    orders_fetched: 1,
    orders_valid: 1,
    duplicate_orders_removed: 0,
    rejected_orders_count: 0,
    error_count: 0,
    confidence: 1.0,
    sync_duration_ms: 60,
  },
};

async function runObservationTests() {
  console.log('1. Evaluating InterRegionalOpportunity with 4-Pillars certification...');
  const strategy: TradeStrategy = 'immediate';
  const opp = InterRegionalFinancialEngine.calculateOpportunity(
    testItem,
    buyHub,
    sellHub,
    strategy,
    config,
    sourceOrders,
    destOrders,
    {},
    qualityMap
  );

  assert(opp !== null, 'Opportunity must be successfully computed');
  if (!opp) return;

  assert(!!opp.evidence, 'Opportunity must have embedded OpportunityEvidence');
  assert(!!opp.certification, 'Opportunity must have 4-pillars OpportunityCertification');
  assert(opp.certification?.status === 'CERTIFIED', 'Certification status must be CERTIFIED');
  console.log(`✅ Evaluated opportunity with evidence_hash: ${opp.evidence?.evidence_hash}\n`);

  console.log('2. Creating OpportunityObservation snapshot from evaluated opportunity...');
  const observation = OpportunityEvidenceEngine.createOpportunityObservation(opp, {
    sourceObservationId: 'obs_src_10000002_34',
    destObservationId: 'obs_dst_10000043_34',
  });

  assert(!!observation.observation_id, 'Observation must have a unique observation_id');
  assert(observation.opportunity_id === opp.id, 'Observation opportunity_id must match');
  assert(observation.type_id === 34, 'Observation type_id matches');
  assert(observation.source_observation_id === 'obs_src_10000002_34', 'Source observation linked');
  assert(observation.dest_observation_id === 'obs_dst_10000043_34', 'Dest observation linked');
  assert(observation.evidence_hash === opp.evidence?.evidence_hash, 'Evidence hash preserved');
  console.log(`✅ Observation created with ID: ${observation.observation_id}\n`);

  console.log('3. Verifying Cryptographic Integrity and 4-Pillar consistency...');
  const integrityResult = OpportunityEvidenceEngine.verifyObservationIntegrity(observation);
  assert(integrityResult.is_valid, 'Observation must be cryptographically valid');
  assert(integrityResult.pillar_checks.market_data, 'Market data pillar must pass');
  assert(integrityResult.pillar_checks.catalog, 'Catalog pillar must pass');
  assert(integrityResult.pillar_checks.universe, 'Universe pillar must pass');
  assert(integrityResult.pillar_checks.financial_engine, 'Financial engine pillar must pass');
  console.log('✅ 4-Pillar verification passed with zero discrepancies.\n');

  console.log('4. Testing Tamper Detection on Observation Evidence...');
  const tamperedObservation: OpportunityObservation = JSON.parse(JSON.stringify(observation));
  // Alter buy price maliciously
  tamperedObservation.evidence!.financial_outputs.effective_buy_price = 1.0;
  const tamperedResult = OpportunityEvidenceEngine.verifyObservationIntegrity(tamperedObservation);
  assert(!tamperedResult.is_valid, 'Tampered observation MUST fail verification');
  assert(tamperedResult.errors.length > 0, 'Tampered observation must report errors');
  console.log('✅ Tamper detection successfully flagged unauthorized modification.\n');

  console.log('5. Testing Append-Only Persistence and Batch Operations in IndexedDbStore...');
  await IndexedDbStore.saveOpportunityObservation(observation);
  
  const fetched = await IndexedDbStore.getOpportunityObservations(34, 10);
  assert(fetched.length > 0, 'Must retrieve saved observation from store');
  assert(fetched[0].observation_id === observation.observation_id, 'Retrieved observation matches ID');

  const byOppId = await IndexedDbStore.getOpportunityObservationsByOpportunityId(opp.id);
  assert(byOppId.length > 0, 'Must retrieve observation by opportunity_id');
  console.log('✅ Observation persistence and index queries verified.\n');

  console.log('6. Testing Empirical Outcome Tracking Snapshot...');
  // Simulate market shift 1h later: dest price dropped to 6.0
  const updatedDestOrders: RawMarketOrder[] = [
    {
      ...destOrders[0],
      price: 6.0,
    },
  ];

  const outcome = OpportunityEvidenceEngine.createOutcomeSnapshot(
    observation,
    sourceOrders,
    updatedDestOrders,
    '1h'
  );

  assert(outcome.horizon === '1h', 'Horizon matches 1h');
  assert(outcome.still_active, 'Opportunity is still active (positive spread)');
  assert(outcome.current_sell_price === 6.0, 'Dest price updated to 6.0');
  assert(outcome.spread_decay_pct > 0, 'Spread decay measured accurately');
  console.log(`✅ Outcome snapshot computed: decay = ${outcome.spread_decay_pct}%, current spread = ${outcome.current_spread_pct}%\n`);

  console.log('7. Recording Outcome Snapshot in Observation Store...');
  const recorded = await IndexedDbStore.recordOpportunityOutcome(observation.observation_id, outcome);
  assert(recorded, 'Outcome must be successfully recorded on the observation');

  const updatedObs = await IndexedDbStore.getOpportunityObservations(34, 1);
  assert(!!updatedObs[0]?.outcomes?.['1h'], 'Observation contains 1h outcome snapshot');
  assert(updatedObs[0]?.outcomes?.['1h']?.current_sell_price === 6.0, 'Outcome data matches');
  console.log('✅ Outcome snapshot successfully persisted into historical observation.\n');

  console.log('8. Testing Observation Compaction & Pruning...');
  const pruneResult = await IndexedDbStore.pruneOldObservations(30);
  assert(typeof pruneResult.prunedCount === 'number', 'Pruning returns count of pruned records');
  console.log(`✅ Retention compaction executed: ${pruneResult.prunedCount} records pruned.\n`);

  console.log('====================================================');
  console.log('🎉 ALL OBSERVATION PROVENANCE & AUDIT TESTS PASSED 🎉');
  console.log('====================================================\n');
}

runObservationTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});

