/**
 * API Integration Test Suite — EVE Trade Backend Routes
 * Validates real HTTP execution, status codes, response shapes, error contracts,
 * parameter validation, and security constraints across Express routers.
 */

import assert from 'assert';
import http from 'node:http';

process.env.EVE_CLIENT_ID = process.env.EVE_CLIENT_ID || 'e2e-api-test-client';
process.env.EVE_CLIENT_SECRET = process.env.EVE_CLIENT_SECRET || 'e2e-api-test-secret';
process.env.EVE_CALLBACK_URL = process.env.EVE_CALLBACK_URL || 'http://localhost:3000/auth/callback';

const ssoFixture = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
    const body = JSON.stringify({
      issuer: 'https://login.eveonline.com/',
      authorization_endpoint: 'http://127.0.0.1/oauth/authorize',
      token_endpoint: 'http://127.0.0.1/oauth/token',
      jwks_uri: 'http://127.0.0.1/oauth/jwks',
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

await new Promise((resolve, reject) => {
  ssoFixture.once('error', reject);
  ssoFixture.listen(0, '127.0.0.1', () => resolve());
});

const ssoFixtureAddress = ssoFixture.address();
if (!ssoFixtureAddress || typeof ssoFixtureAddress === 'string') {
  throw new Error('Unable to determine SSO fixture port');
}
process.env.EVE_SSO_METADATA_URL = 'http://127.0.0.1:' + ssoFixtureAddress.port + '/.well-known/oauth-authorization-server';

const { startServer } = await import('../../server');
const { TypeCatalogService } = await import('../../src/services/typeCatalog');

async function runApiIntegrationTests() {
  console.log('===============================================================');
  console.log('--- STARTING EVE TRADE API HTTP INTEGRATION TESTS (LOT-002) ---');
  console.log('===============================================================');

  // Launch test server on dynamic port (0) without Vite dev middleware
  const serverInstance: RunningServer = await startServer(0, { includeVite: false });
  const baseUrl = `http://127.0.0.1:${serverInstance.port}`;
  console.log(`[TEST HARNESS] Server listening on dynamic port: ${serverInstance.port}`);

  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      testsPassed++;
    } catch (err: unknown) {
      console.error(`  [FAIL] ${name}:`, err);
      testsFailed++;
      throw err;
    }
  }

  try {
    // -----------------------------------------------------------------
    // 1. /api/health — Health & Observability Contract
    // -----------------------------------------------------------------
    console.log('\n--- 1. ROUTE /api/health ---');

    await test('GET /api/health returns HTTP 200 and healthy status under nominal catalog', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.status, 'healthy', `Expected status "healthy", got "${data.status}"`);
      assert.strictEqual(typeof data.uptime_seconds, 'number', 'Expected uptime_seconds to be a number');
      assert.ok(data.uptime_seconds >= 0, 'uptime_seconds must be >= 0');
      assert.ok(data.timestamp, 'timestamp must be present');
      assert.ok(data.environment, 'environment must be present');

      // Memory inspection
      assert.ok(data.memory, 'memory block must be present');
      assert.strictEqual(typeof data.memory.rss_mb, 'number');
      assert.strictEqual(typeof data.memory.heap_used_mb, 'number');
      assert.strictEqual(typeof data.memory.heap_total_mb, 'number');

      // Catalog contract
      assert.ok(data.catalog, 'catalog metadata must be present');
      assert.strictEqual(data.catalog.status, 'CATALOG_READY', 'Catalog status must be CATALOG_READY');
      assert.strictEqual(data.catalog.item_count, 20526, 'Item count must be 20526');
      assert.strictEqual(data.catalog.is_degraded, false, 'is_degraded must be false');

      // SSO contract & security check
      assert.ok(data.sso, 'sso block must be present');
      assert.strictEqual(typeof data.sso.configured, 'boolean');
      assert.strictEqual(typeof data.sso.client_id_present, 'boolean');
      assert.strictEqual(typeof data.sso.client_secret_present, 'boolean');
      assert.strictEqual(typeof data.sso.active_oauth_states_count, 'number');

      // Strict security: ensure raw secrets are NEVER exposed in response
      const rawText = JSON.stringify(data);
      assert.ok(!rawText.includes('client_secret:'), 'Raw client_secret key must never appear in response');
      if (process.env.EVE_CLIENT_SECRET && process.env.EVE_CLIENT_SECRET.length > 5) {
        assert.ok(!rawText.includes(process.env.EVE_CLIENT_SECRET), 'Client secret value must never leak in response');
      }
    });

    await test('GET /api/health returns HTTP 200 degraded when catalog is in fallback core', async () => {
      const originalGetMetadata = TypeCatalogService.getMetadata;
      try {
        const nominalMeta = originalGetMetadata.call(TypeCatalogService);
        TypeCatalogService.getMetadata = () => ({
          ...nominalMeta,
          status: 'CATALOG_FALLBACK_CORE',
          item_count: 53,
          is_degraded: true,
        });

        const res = await fetch(`${baseUrl}/api/health`);
        assert.strictEqual(res.status, 200, `Expected HTTP 200 for fallback core, got ${res.status}`);
        const data = await res.json() as any;
        assert.strictEqual(data.status, 'degraded', `Expected status "degraded", got "${data.status}"`);
      } finally {
        TypeCatalogService.getMetadata = originalGetMetadata;
      }
    });

    await test('GET /api/health returns HTTP 503 unhealthy when catalog is corrupted or unavailable', async () => {
      const originalGetMetadata = TypeCatalogService.getMetadata;
      try {
        const nominalMeta = originalGetMetadata.call(TypeCatalogService);
        TypeCatalogService.getMetadata = () => ({
          ...nominalMeta,
          status: 'CATALOG_CORRUPTED',
          item_count: 0,
          error: 'Simulated catalog corruption for regression testing',
        });

        const res = await fetch(`${baseUrl}/api/health`);
        assert.strictEqual(res.status, 503, `Expected HTTP 503 for corrupted catalog, got ${res.status}`);
        const data = await res.json() as any;
        assert.strictEqual(data.status, 'unhealthy', `Expected status "unhealthy", got "${data.status}"`);
      } finally {
        TypeCatalogService.getMetadata = originalGetMetadata;
      }
    });

    // -----------------------------------------------------------------
    // 2. /api/types — Type Catalog Contract & Search
    // -----------------------------------------------------------------
    console.log('\n--- 2. ROUTE /api/types ---');

    await test('GET /api/types/status returns HTTP 200 and valid catalog metadata', async () => {
      const res = await fetch(`${baseUrl}/api/types/status`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.status, 'CATALOG_READY');
      assert.strictEqual(data.item_count, 20526);
      assert.ok(data.checksum, 'checksum must be present');
      assert.ok(data.version, 'version must be present');
    });

    await test('GET /api/types/all returns HTTP 200 with { metadata, types } and headers', async () => {
      const res = await fetch(`${baseUrl}/api/types/all`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      // Check authoritative response headers
      assert.strictEqual(res.headers.get('x-catalog-status'), 'CATALOG_READY');
      assert.strictEqual(res.headers.get('x-catalog-count'), '20526');
      assert.ok(res.headers.get('x-catalog-version'));
      assert.ok(res.headers.get('x-catalog-checksum'));

      const data = await res.json() as any;
      assert.ok(data.metadata, 'Response must contain metadata');
      assert.ok(Array.isArray(data.types), 'Response must contain types array');
      assert.strictEqual(data.types.length, 20526, 'Types array must contain 20526 items');

      // Validate item shape on sample
      const sample = data.types[0];
      assert.strictEqual(typeof sample.type_id, 'number', 'type_id must be a number');
      assert.strictEqual(typeof sample.name, 'string', 'name must be a string');
      assert.strictEqual(typeof sample.volume, 'number', 'volume must be a number');
    });

    await test('GET /api/types/all?format=flat returns raw array format', async () => {
      const res = await fetch(`${baseUrl}/api/types/all?format=flat`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.ok(Array.isArray(data), 'Response must directly be an array');
      assert.strictEqual(data.length, 20526);
    });

    await test('GET /api/types/all rejects non-ready canonical catalog state', async () => {
      const originalGetMetadata = TypeCatalogService.getMetadata;
      const originalGetTypes = TypeCatalogService.getTypes;
      try {
        const nominalMeta = originalGetMetadata.call(TypeCatalogService);
        TypeCatalogService.getMetadata = () => ({
          ...nominalMeta,
          status: 'CATALOG_PARTIAL',
          item_count: 20000,
          is_degraded: true,
        });
        TypeCatalogService.getTypes = () => new Array(20000).fill(null);

        const res = await fetch(`${baseUrl}/api/types/all`);
        assert.strictEqual(res.status, 503, `Expected HTTP 503 for partial catalog, got ${res.status}`);

        const data = await res.json() as any;
        assert.strictEqual(data.error, 'CATALOG_NOT_READY');
        assert.deepStrictEqual(data.types, []);
      } finally {
        TypeCatalogService.getMetadata = originalGetMetadata;
        TypeCatalogService.getTypes = originalGetTypes;
      }
    });

    await test('GET /api/types/lookup/:id resolves canonical type (Tritanium #34)', async () => {
      const res = await fetch(`${baseUrl}/api/types/lookup/34`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.type_id, 34);
      assert.strictEqual(data.name, 'Tritanium');
      assert.strictEqual(data.volume, 0.01);
    });

    await test('GET /api/types/search?q=trit returns matching item results', async () => {
      const res = await fetch(`${baseUrl}/api/types/search?q=trit`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any[];
      assert.ok(Array.isArray(data), 'Search results must be an array');
      assert.ok(data.length > 0, 'Must return at least 1 match');
      const hasTritanium = data.some((t) => t.type_id === 34 && t.name === 'Tritanium');
      assert.ok(hasTritanium, 'Tritanium must be present in search results');
    });

    // -----------------------------------------------------------------
    // 3. /api/markets — Parameter Validation & Error Handling
    // -----------------------------------------------------------------
    console.log('\n--- 3. ROUTE /api/markets ---');

    await test('GET /api/markets/:regionId/history rejects with HTTP 400 when type_id is missing', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/history`);
      assert.strictEqual(res.status, 400, `Expected HTTP 400 when type_id is omitted, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.error, 'type_id is required');
    });

    // -----------------------------------------------------------------
    // 4. /api/auth — Configuration & Security Validation
    // -----------------------------------------------------------------
    console.log('\n--- 4. ROUTE /api/auth ---');

    await test('GET /api/auth/config returns public OAuth configuration without leaking secrets', async () => {
      const res = await fetch(`${baseUrl}/api/auth/config`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(typeof data.has_client_secret, 'boolean');
      assert.ok(data.scopes, 'scopes must be present');
      assert.ok(Array.isArray(data.suggested_redirect_uris), 'suggested_redirect_uris must be an array');
      assert.ok(!('client_secret' in data), 'client_secret field must not exist in config');
    });

    await test('GET /api/auth/url generates valid CSRF state and auth URL', async () => {
      const res = await fetch(`${baseUrl}/api/auth/url`);
      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);

      const data = await res.json() as any;
      assert.ok(data.url, 'url must be present');
      assert.ok(data.state, 'state must be present');
      assert.strictEqual(typeof data.state, 'string');
      assert.strictEqual(data.state.length, 64, 'state must be 64-character hex string (32 bytes)');
    });

    await test('GET /api/auth/url blocks unauthorized external redirect_uri with HTTP 400', async () => {
      const untrustedRedirect = 'https://untrusted-external-site.com/steal-token';
      const res = await fetch(`${baseUrl}/api/auth/url?redirect_uri=${encodeURIComponent(untrustedRedirect)}`);
      assert.strictEqual(res.status, 400, `Expected HTTP 400 for unauthorized redirect_uri, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.error, 'INVALID_REDIRECT_URI');
    });

    // -----------------------------------------------------------------
    // 5. /api/character — Auth Enforcement Guards
    // -----------------------------------------------------------------
    console.log('\n--- 5. ROUTE /api/character ---');

    await test('GET /api/character/:id/orders rejects with HTTP 401 when Authorization header is absent', async () => {
      const res = await fetch(`${baseUrl}/api/character/12345/orders`);
      assert.strictEqual(res.status, 401, `Expected HTTP 401, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.error, 'Authorization header missing');
    });

    await test('GET /api/character/:id/wallet rejects with HTTP 401 when Authorization header is absent', async () => {
      const res = await fetch(`${baseUrl}/api/character/12345/wallet`);
      assert.strictEqual(res.status, 401, `Expected HTTP 401, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.error, 'Authorization header missing');
    });

    // -----------------------------------------------------------------
    // 6. /api/universe — Universe & Location Resolution
    // -----------------------------------------------------------------
    console.log('\n--- 6. ROUTE /api/universe ---');

    await test('GET /api/universe/location/:id rejects unknown locations explicitly', async () => {
      const res = await fetch(`${baseUrl}/api/universe/location/999999999`);
      assert.strictEqual(res.status, 404, `Expected HTTP 404 for unknown location, got ${res.status}`);

      const data = await res.json() as any;
      assert.strictEqual(data.error, 'LOCATION_UNKNOWN');
      assert.strictEqual(data.location_id, 999999999);
    });

    console.log('\n===============================================================');
    console.log(`ALL API INTEGRATION TESTS PASSED: ${testsPassed} passed, ${testsFailed} failed.`);
    console.log('===============================================================');
  } finally {
    console.log('[TEST HARNESS] Shutting down test server...');
    await serverInstance.close();
    await new Promise<void>(resolve => ssoFixture.close(() => resolve()));
    console.log('[TEST HARNESS] Server successfully closed.');
  }
}

runApiIntegrationTests().catch((err) => {
  console.error('[FATAL] API Integration tests encountered an uncaught error:', err);
  process.exit(1);
});
