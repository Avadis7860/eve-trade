import assert from 'node:assert/strict';
import { buildMarketEvidenceBundle, serializeMarketEvidenceBundle } from '../marketEvidence';

const capturedAt = new Date('2026-09-24T00:00:00.000Z');
const runtime = {
  location: {
    pathname: '/trading',
    search: '?item=34',
  },
  navigator: {
    userAgent: 'P0-C-test-browser',
    language: 'fr-BE',
  },
} as Pick<Window, 'location' | 'navigator'>;

const bundle = buildMarketEvidenceBundle(
  'Tritanium',
  34,
  [
    {
      id: 'jita',
      name: 'Jita',
      region: 'The Forge',
      region_id: 10000002,
      solar_system: 'Jita',
      system_id: 30000142,
      station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      station_id: 60003760,
      security_status: 1,
      priority: 1,
      active: true,
      hub_type: 'npc_major',
    },
    {
      id: 'dodixie',
      name: 'Dodixie',
      region: 'Sinq Laison',
      region_id: 10000032,
      solar_system: 'Dodixie',
      system_id: 30002659,
      station: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
      station_id: 60011866,
      security_status: 0.9,
      priority: 2,
      active: false,
      hub_type: 'npc_major',
    },
  ],
  {
    10000002: {
      source: 'esi',
      freshness: 'fresh',
      completeness: 'complete',
      validation_status: 'valid',
      health_status: 'ERROR',
      data_state: 'ERROR',
      fetched_at: '2026-09-23T23:59:59.000Z',
      age_seconds: 1,
      pages_fetched: 1,
      expected_pages: 1,
      orders_fetched: 12,
      orders_valid: 12,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 1,
      last_error: 'Market API returned HTTP 429',
      confidence: 1,
      sync_duration_ms: 42,
      last_http_status: 429,
      cache_status: 'MISS',
      esi_error_limit_remaining: 91,
      esi_error_limit_reset_seconds: 42,
      retry_after_seconds: 7,
    },
  },
);

assert.equal(bundle.schema_version, 'p0-c-1');
assert.equal(bundle.captured_at_utc, capturedAt.toISOString());
assert.equal(bundle.type.id, 34);
assert.equal(bundle.type.name, 'Tritanium');
assert.equal(bundle.application.url_path, '/trading?item=34');
assert.equal(bundle.application.user_agent, 'P0-C-test-browser');
assert.equal(bundle.application.language, 'fr-BE');
assert.equal(bundle.request_template.path_pattern, '/api/markets/:regionId/orders?type_id=:typeId&page=:page');
assert.equal(bundle.hubs.length, 1);
assert.deepEqual(bundle.hubs[0], {
  hub_name: 'Jita',
  region_id: 10000002,
  health_status: 'ERROR',
  source: 'esi',
  freshness: 'fresh',
  data_state: 'ERROR',
  completeness: 'complete',
  validation_status: 'valid',
  fetched_at: '2026-09-23T23:59:59.000Z',
  age_seconds: 1,
  pages_fetched: 1,
  expected_pages: 1,
  orders_fetched: 12,
  orders_valid: 12,
  error_count: 1,
  last_error: 'Market API returned HTTP 429',
  http_status: 429,
  cache_status: 'MISS',
  esi_error_limit_remaining: 91,
  esi_error_limit_reset_seconds: 42,
  retry_after_seconds: 7,
});
assert.equal(bundle.comparison.same_request_from_controlled_environment, 'not_recorded');

const serialized = serializeMarketEvidenceBundle(bundle);
assert.ok(serialized.endsWith('\n'));
assert.ok(serialized.includes('"schema_version": "p0-c-1"'));
assert.ok(!serialized.includes('Authorization'));
assert.ok(!serialized.includes('Bearer'));
assert.ok(!serialized.includes('access_token'));

console.log('Market P0-C evidence bundle tests passed.');
