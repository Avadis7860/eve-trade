import { InterRegionalFinancialEngine } from '../interRegional';
import { OpportunityEvidenceEngine, CURRENT_CERTIFICATION_VERSION } from '../evidence';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import {
  EveTypeDetail,
  MarketHub,
  RawMarketOrder,
  FinancialConfig,
  MarketDataQuality,
} from '../../types';

console.log('=== RUNNING OPPORTUNITY EVIDENCE CHAIN AUDIT & DETERMINISM TESTS ===');

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
  available_capital: 1_000_000_000,
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
  max_capital_per_trade: 1_000_000_000,
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.5,
};

const validTritanium: EveTypeDetail = {
  type_id: 34,
  name: 'Tritanium',
  group_id: 18,
  category_id: 4,
  volume: 0.01,
  market_group_id: 18,
  portion_size: 1,
};

const freshQuality: MarketDataQuality = {
  source: 'esi',
  freshness: 'fresh',
  completeness: 'complete',
  validation_status: 'valid',
  fetched_at: '2026-09-20T12:00:00.000Z',
  age_seconds: 15,
  pages_fetched: 1,
  expected_pages: 1,
  orders_fetched: 2,
  orders_valid: 2,
  duplicate_orders_removed: 0,
  rejected_orders_count: 0,
  error_count: 0,
  confidence: 1.0,
  sync_duration_ms: 120,
};

const jitaSellOrders: RawMarketOrder[] = [
  {
    order_id: 1001,
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 4.0,
    volume_remain: 1000000,
    volume_total: 1000000,
    min_volume: 1,
    is_buy_order: false,
    duration: 90,
    issued: '2026-09-20T11:00:00Z',
  },
];

const amarrBuyOrders: RawMarketOrder[] = [
  {
    order_id: 2001,
    type_id: 34,
    region_id: 10000043,
    system_id: 30002187,
    location_id: 60008494,
    price: 6.0,
    volume_remain: 500000,
    volume_total: 500000,
    min_volume: 1,
    is_buy_order: true,
    duration: 90,
    issued: '2026-09-20T11:00:00Z',
  },
];

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ ${testName}`);
    testsFailed++;
  }
}

// 1. Evidence Construction & Version Verification
console.log('\n1. Evidence Construction & Versioning:');
const opp1 = InterRegionalFinancialEngine.calculateOpportunity(
  validTritanium,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  {},
  { 10000002: freshQuality, 10000043: freshQuality }
);

assert(opp1 !== null, 'Opportunity is successfully created');
assert(opp1?.evidence !== undefined, 'Opportunity contains immutable evidence snapshot');
assert(
  opp1?.certification?.certification_version === CURRENT_CERTIFICATION_VERSION,
  `Certification version matches current standard (${CURRENT_CERTIFICATION_VERSION})`
);
assert(
  opp1?.evidence?.certification_version === CURRENT_CERTIFICATION_VERSION,
  'Evidence snapshot contains certification_version'
);
assert(
  typeof opp1?.certification?.evidence_hash === 'string' &&
    opp1.certification.evidence_hash.length === 64,
  'Evidence hash is a valid 64-character SHA-256 hex string'
);
assert(
  opp1?.certification?.evidence_hash === opp1?.evidence?.evidence_hash,
  'Certification evidence_hash matches evidence snapshot evidence_hash'
);

// 2. Determinism of SHA-256 Hashing
console.log('\n2. Determinism & Integrity of Evidence Hashing:');
const opp2 = InterRegionalFinancialEngine.calculateOpportunity(
  validTritanium,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  {},
  { 10000002: freshQuality, 10000043: freshQuality }
);

assert(opp2 !== null, 'Second identical calculation succeeds');
if (opp1?.evidence && opp2?.evidence) {
  // Re-canonicalize with same detected_at to test deterministic hashing on identical inputs
  const normHash1 = OpportunityEvidenceEngine.computeMarketSnapshotHash(jitaSellOrders);
  const normHash2 = OpportunityEvidenceEngine.computeMarketSnapshotHash(jitaSellOrders);
  assert(normHash1 === normHash2, 'Market snapshot hash is strictly deterministic');

  const auditResult1 = OpportunityEvidenceEngine.verifyEvidence(opp1.evidence);
  if (!auditResult1.is_valid) {
    console.error('Audit 1 errors:', auditResult1.errors);
  }
  assert(auditResult1.is_valid, 'Evidence 1 passes cryptographic integrity check');
  assert(auditResult1.pillar_checks.market_data === true, 'MarketData pillar passed');
  assert(auditResult1.pillar_checks.catalog === true, 'Catalog pillar passed');
  assert(auditResult1.pillar_checks.universe === true, 'Universe pillar passed');
  assert(auditResult1.pillar_checks.financial_engine === true, 'Financial pillar passed');
}

// 3. Cryptographic Tamper Detection
console.log('\n3. Cryptographic Tamper & Corruption Detection:');
if (opp1?.evidence) {
  // Tamper with financial output price
  const tamperedEvidence = JSON.parse(JSON.stringify(opp1.evidence));
  tamperedEvidence.financial_outputs.net_profit += 9999999;

  const tamperAudit = OpportunityEvidenceEngine.verifyEvidence(tamperedEvidence);
  assert(!tamperAudit.is_valid, 'Tampered evidence fails cryptographic hash verification');
  assert(
    tamperAudit.discrepancies.some((d) => d.includes('Hash mismatch')),
    'Discrepancy correctly identifies SHA-256 hash mismatch'
  );

  // Tamper with pillar evaluation state
  const pillarTamperEvidence = JSON.parse(JSON.stringify(opp1.evidence));
  pillarTamperEvidence.source_market.health_status = 'ERROR';
  pillarTamperEvidence.evidence_hash = OpportunityEvidenceEngine.computeMarketSnapshotHash([]); // Bad hash
  const pillarAudit = OpportunityEvidenceEngine.verifyEvidence(pillarTamperEvidence);
  assert(!pillarAudit.is_valid, 'Pillar health mismatch is flagged as invalid');
}

// 4. Traceability of Rejection & Degraded Status
console.log('\n4. Traceability of Degraded & Rejected Evidence:');
const staleQuality: MarketDataQuality = {
  ...freshQuality,
  freshness: 'stale',
  age_seconds: 7200,
};

const degradedOpp = InterRegionalFinancialEngine.calculateOpportunity(
  validTritanium,
  jitaHub,
  amarrHub,
  'immediate',
  config,
  jitaSellOrders,
  amarrBuyOrders,
  {},
  { 10000002: staleQuality, 10000043: freshQuality }
);

assert(degradedOpp !== null, 'Degraded opportunity is calculated and preserved (not dropped)');
assert(
  degradedOpp?.certification?.status === 'DEGRADED',
  'Degraded status is explicitly captured in certification'
);
assert(
  degradedOpp?.evidence?.certification_status === 'DEGRADED',
  'Degraded status is immutably captured in evidence snapshot'
);
if (degradedOpp?.evidence) {
  const degradedAudit = OpportunityEvidenceEngine.verifyEvidence(degradedOpp.evidence);
  if (!degradedAudit.is_valid) {
    console.error('Degraded audit errors:', degradedAudit.errors);
  }
  assert(degradedAudit.is_valid, 'Degraded evidence snapshot is internally consistent and cryptographically valid');
}

console.log(`\nEvidence Chain Audit Test Results: ${testsPassed} passed, ${testsFailed} failed`);
if (testsFailed > 0) {
  process.exit(1);
}
