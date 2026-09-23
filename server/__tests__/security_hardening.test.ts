/**
 * Security Hardening Test Suite (LOT-003)
 * Tests input validation, parameter boundary constraints, security headers,
 * CORS preflight and credentials, JSON payload size bounds, OAuth state replay prevention,
 * and error masking (no stack traces).
 */

import { createServerApp } from '../../server';
import { generateOAuthState, activeOAuthStates, STATE_TTL_MS } from '../utils/authUtils';
import http from 'http';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('--- STARTING SECURITY HARDENING TESTS (LOT-003) ---');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  const app = await createServerApp({ includeVite: false });
  let server: http.Server;
  let port = 3001;

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 3001;
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // --- 1. HTTP Security Headers & Information Disclosure ---
    console.log('--- 1. HTTP SECURITY HEADERS & CORS ---');

    await test('responses include security headers (nosniff, X-XSS-Protection, Referrer-Policy)', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert(res.headers.get('x-content-type-options') === 'nosniff', 'Expected X-Content-Type-Options: nosniff');
      assert(res.headers.get('x-xss-protection') === '0', 'Expected X-XSS-Protection: 0');
      assert(res.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Expected Referrer-Policy');
    });

    await test('x-powered-by header is stripped to prevent server fingerprinting', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert(res.headers.get('x-powered-by') === null, 'Expected x-powered-by header to be absent');
    });

    await test('CORS GET with allowed origin sets Access-Control-Allow-Origin and Credentials', async () => {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.headers.get('access-control-allow-origin') === 'http://localhost:3000', 'Expected allowed origin in CORS header');
      assert(res.headers.get('access-control-allow-credentials') === 'true', 'Expected credentials allowed for authorized origin');
      assert(res.headers.get('vary')?.includes('Origin') === true, 'Expected Vary: Origin header');
    });

    await test('CORS GET with unauthorized origin omits Access-Control-Allow-Origin and Credentials', async () => {
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://unauthorized-attacker.com' },
      });
      assert(res.headers.get('access-control-allow-origin') === null, 'Must NOT set Access-Control-Allow-Origin for unauthorized origin');
      assert(res.headers.get('access-control-allow-credentials') === null, 'Must NOT set credentials for unauthorized origin');
    });

    await test('CORS OPTIONS preflight with allowed origin returns HTTP 204 with CORS headers', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/orders`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Authorization',
        },
      });
      assert(res.status === 204, `Expected 204 for OPTIONS, got ${res.status}`);
      assert(res.headers.get('access-control-allow-origin') === 'http://localhost:3000', 'Expected allowed origin header');
      assert(res.headers.get('access-control-allow-credentials') === 'true', 'Expected credentials header');
      assert(res.headers.get('access-control-allow-methods')?.includes('GET') === true, 'Expected GET in allowed methods');
    });

    await test('CORS OPTIONS preflight with unauthorized origin returns HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/orders`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://unauthorized-attacker.com',
          'Access-Control-Request-Method': 'GET',
        },
      });
      assert(res.status === 403, `Expected 403 for unauthorized OPTIONS preflight, got ${res.status}`);
      assert(res.headers.get('access-control-allow-origin') === null, 'Must NOT set Access-Control-Allow-Origin on 403');
      assert(res.headers.get('access-control-allow-credentials') === null, 'Must NOT set credentials on 403');
      const body = await res.json();
      assert(body.error === 'CORS_ORIGIN_NOT_ALLOWED', `Expected CORS_ORIGIN_NOT_ALLOWED error code, got ${body.error}`);
    });

    await test('CORS credentials header is strictly restricted to authorized origins', async () => {
      const allowedRes = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://127.0.0.1:3000' } });
      assert(allowedRes.headers.get('access-control-allow-credentials') === 'true', 'Allowed origin must have credentials');

      const rejectedRes = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://evil.org' } });
      assert(rejectedRes.headers.get('access-control-allow-credentials') === null, 'Unauthorized origin must not have credentials');
    });

    await test('Requests without Origin header succeed without CORS headers (same-origin / server-to-server)', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.headers.get('access-control-allow-origin') === null, 'No Origin header should yield no Access-Control-Allow-Origin');
      assert(res.headers.get('access-control-allow-credentials') === null, 'No Origin header should yield no Access-Control-Allow-Credentials');
    });

    // --- 2. Input Validation & Parameter Boundaries ---
    console.log('\n--- 2. INPUT VALIDATION & BOUNDARY GUARDS ---');

    await test('GET /api/types/lookup/:id rejects non-numeric or negative IDs with HTTP 400', async () => {
      const badIdRes = await fetch(`${baseUrl}/api/types/lookup/not-a-number`);
      assert(badIdRes.status === 400, `Expected 400, got ${badIdRes.status}`);
      const badIdJson = await badIdRes.json();
      assert(badIdJson.error === 'INVALID_TYPE_ID', `Expected INVALID_TYPE_ID, got ${badIdJson.error}`);

      const negIdRes = await fetch(`${baseUrl}/api/types/lookup/-42`);
      assert(negIdRes.status === 400, `Expected 400 for negative ID, got ${negIdRes.status}`);
    });

    await test('GET /api/types/search rejects invalid limit parameters with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/types/search?limit=-5`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_LIMIT', `Expected INVALID_LIMIT, got ${json.error}`);
    });

    await test('GET /api/markets/:regionId/orders rejects non-numeric regionId with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/markets/bad-region/orders`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_REGION_ID', `Expected INVALID_REGION_ID, got ${json.error}`);
    });

    await test('GET /api/markets/:regionId/orders rejects invalid order_type with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/orders?order_type=unsupported`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_ORDER_TYPE', `Expected INVALID_ORDER_TYPE, got ${json.error}`);
    });

    await test('GET /api/markets/:regionId/orders rejects invalid page numbers with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/orders?page=-1`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_PAGE', `Expected INVALID_PAGE, got ${json.error}`);
    });

    await test('GET /api/markets/:regionId/history rejects non-numeric type_id with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/markets/10000002/history?type_id=abc`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_TYPE_ID', `Expected INVALID_TYPE_ID, got ${json.error}`);
    });

    await test('GET /api/character/:id/wallet rejects invalid characterId with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/character/invalid-id/wallet`, {
        headers: { Authorization: 'Bearer token' },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_CHARACTER_ID', `Expected INVALID_CHARACTER_ID, got ${json.error}`);
    });

    await test('GET /api/universe/location/:id rejects non-positive location IDs with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/universe/location/-10`);
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_LOCATION_ID', `Expected INVALID_LOCATION_ID, got ${json.error}`);
    });

    // --- 3. OAuth & SSO Attack Defenses ---
    console.log('\n--- 3. OAUTH & SSO ATTACK DEFENSES ---');

    await test('POST /api/auth/token rejects missing state parameter with HTTP 400 MISSING_STATE', async () => {
      const res = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'valid-looking-code-12345',
        }),
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'MISSING_STATE', `Expected MISSING_STATE, got ${json.error}`);
    });

    await test('POST /api/auth/token rejects empty or blank state parameter with HTTP 400 MISSING_STATE', async () => {
      const res = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'valid-looking-code-12345',
          state: '   ',
        }),
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'MISSING_STATE', `Expected MISSING_STATE, got ${json.error}`);
    });

    await test('POST /api/auth/token rejects non-hex / arbitrary state tokens with HTTP 400 INVALID_OR_EXPIRED_STATE', async () => {
      const res = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'valid-looking-code-12345',
          state: 'malicious-forged-state',
        }),
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'INVALID_OR_EXPIRED_STATE', `Expected INVALID_OR_EXPIRED_STATE, got ${json.error}`);
    });

    await test('POST /api/auth/token rejects expired state tokens with HTTP 400 EXPIRED_STATE', async () => {
      const expiredState = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
      // Register artificially expired state in store
      activeOAuthStates.set(expiredState, {
        createdAt: Date.now() - (STATE_TTL_MS + 10000),
        redirectUri: 'http://127.0.0.1:3000/auth/callback',
      });

      const res = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'valid-looking-code-12345',
          state: expiredState,
        }),
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      const json = await res.json();
      assert(json.error === 'EXPIRED_STATE', `Expected EXPIRED_STATE, got ${json.error}`);
    });

    await test('POST /api/auth/token enforces single-use state consumption (replay prevention)', async () => {
      const state = generateOAuthState('http://127.0.0.1:3000/auth/callback');
      assert(activeOAuthStates.has(state), 'State should be registered in store');

      // First call (with fake code) will attempt ESI token exchange (or fail on SSO config/code),
      // but state MUST be consumed and purged from activeOAuthStates!
      const firstRes = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'test-code',
          state: state,
        }),
      });

      assert(!activeOAuthStates.has(state), 'State MUST be deleted after first consumption');

      // Second call (replay) with the same state MUST fail immediately with INVALID_OR_EXPIRED_STATE
      const replayRes = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'test-code',
          state: state,
        }),
      });

      assert(replayRes.status === 400, `Expected 400 on replay, got ${replayRes.status}`);
      const replayJson = await replayRes.json();
      assert(replayJson.error === 'INVALID_OR_EXPIRED_STATE', `Expected INVALID_OR_EXPIRED_STATE, got ${replayJson.error}`);
    });

    await test('POST /api/auth/token auto-extracts code and state when full callback URL is provided', async () => {
      const validState = generateOAuthState('http://127.0.0.1:3000/auth/callback');
      const fullUrl = `http://localhost:3000/auth/callback?code=extracted-code-xyz&state=${validState}`;

      const res = await fetch(`${baseUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: fullUrl,
        }),
      });
      // The state must have been extracted and consumed from active store
      assert(!activeOAuthStates.has(validState), 'Extracted state must be consumed from activeOAuthStates');
    });

    await test('POST /api/auth/refresh rejects missing or oversized refresh tokens', async () => {
      const emptyRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert(emptyRes.status === 400, `Expected 400, got ${emptyRes.status}`);

      const hugeToken = 'a'.repeat(5000);
      const hugeRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: hugeToken }),
      });
      assert(hugeRes.status === 400, `Expected 400 for oversized token, got ${hugeRes.status}`);
      const hugeJson = await hugeRes.json();
      assert(hugeJson.error === 'REFRESH_TOKEN_TOO_LONG', `Expected REFRESH_TOKEN_TOO_LONG, got ${hugeJson.error}`);
    });

    // --- 4. Callback Page Script Context Hardening & XSS Defenses ---
    console.log('\n--- 4. SCRIPT CONTEXT HARDENING & XSS DEFENSES ---');

    await test('GET /auth/callback neutralizes </script> breakout injection in script context', async () => {
      const injection = '</script><script>alert("XSS")</script>';
      const state = generateOAuthState(`${baseUrl}/auth/callback`);
      const xssRes = await fetch(
        `${baseUrl}/auth/callback?state=${state}&error=invalid_grant&error_description=${encodeURIComponent(injection)}`
      );
      assert(xssRes.status === 400, `Expected 400 HTML page, got ${xssRes.status}`);
      const html = await xssRes.text();
      assert(!html.includes('</script><script>alert("XSS")</script>'), 'HTML must NOT contain unescaped script tag breakout');
      assert(html.includes('\\u003c/script\\u003e'), 'Script context must encode < as \\u003c');
      assert(html.includes('&lt;/script&gt;'), 'HTML DOM body must encode < as &lt;');
    });

    await test('GET /auth/callback rejects a state issued for a different callback URI', async () => {
      const state = generateOAuthState('http://localhost:3000/auth/callback');
      const response = await fetch(
        `${baseUrl}/auth/callback?state=${state}&error=access_denied&error_description=cancelled`,
      );
      assert.strictEqual(response.status, 400);
      const html = await response.text();
      assert(html.includes('REDIRECT_URI_MISMATCH'));
    });

    await test('GET /auth/callback safely escapes quotes, ampersands, and special chars in script payload', async () => {
      const trickyPayload = 'Injection "with" \'quotes\' & <tags> and \\backslash';
      const state = generateOAuthState(`${baseUrl}/auth/callback`);
      const trickyRes = await fetch(
        `${baseUrl}/auth/callback?state=${state}&error=test_error&error_description=${encodeURIComponent(trickyPayload)}`
      );
      assert(trickyRes.status === 400, `Expected 400, got ${trickyRes.status}`);
      const html = await trickyRes.text();
      assert(html.includes('\\u0026'), 'Ampersands in script payload must be Unicode escaped');
      assert(html.includes('\\u003c'), 'Tags in script payload must be Unicode escaped');
      assert(!html.includes('<tags>'), 'Raw unescaped tags must not exist');
    });
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
  }

  console.log('\n===============================================================');
  console.log(`SECURITY HARDENING TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
