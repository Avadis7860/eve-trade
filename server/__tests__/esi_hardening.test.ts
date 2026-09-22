/**
 * ESI Hardening & Mock Testing Suite (LOT-003)
 * Tests resilience, retries, exponential backoff, rate limiting,
 * Retry-After signals, timeout aborts, and offline mock injection.
 */

import { fetchEsi, setGlobalEsiMock, EsiFetchResult } from '../utils/esiClient';
import { mergeEsi304CacheEntry } from '../routes/markets';
import { createServerApp, RunningServer } from '../../server';
import http from 'http';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('--- STARTING ESI HARDENING & MOCK TESTS (LOT-003) ---');
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

  // --- 1. ESI Client Retries on 5xx Errors ---
  console.log('--- 1. ESI RETRIES & TRANSIENT ERRORS ---');

  await test('fetchEsi retries on 502/503/504 and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount < 2) {
        return new Response('Bad Gateway', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      return new Response(JSON.stringify({ solar_system_id: 30000142, name: 'Jita' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await fetchEsi<{ name: string }>('/universe/systems/30000142/', {
      customFetch: mockFetch,
      retries: 2,
    });

    assert(res.ok === true, 'Expected result to be ok');
    assert(res.status === 200, 'Expected status 200');
    assert(res.data?.name === 'Jita', 'Expected data.name to be Jita');
    assert(callCount === 2, `Expected 2 calls (1 retry), got ${callCount}`);
  });

  await test('fetchEsi fails gracefully after exceeding max retries on persistent 503', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response('Service Unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    };

    const res = await fetchEsi('/status/', {
      customFetch: mockFetch,
      retries: 2,
    });

    assert(res.ok === false, 'Expected result to not be ok');
    assert(res.status === 503, `Expected status 503, got ${res.status}`);
    assert(callCount === 3, `Expected 3 total calls (initial + 2 retries), got ${callCount}`);
  });

  await test('fetchEsi does NOT retry on non-retryable 4xx errors (400, 401, 403, 404)', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Character not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await fetchEsi('/characters/999999999/', {
      customFetch: mockFetch,
      retries: 2,
    });

    assert(res.ok === false, 'Expected result to not be ok');
    assert(res.status === 404, 'Expected status 404');
    assert(callCount === 1, `Expected exactly 1 call without retrying, got ${callCount}`);
  });

  await test('fetchEsi correctly handles 304 Not Modified and preserves etag/expires/x-pages', async () => {
    const mockFetch = async (url: any, init: any) => {
      assert((init?.headers as any)['If-None-Match'] === '"abc123etag"', 'Expected If-None-Match header');
      return new Response(null, {
        status: 304,
        headers: {
          etag: '"abc123etag"',
          expires: 'Wed, 21 Oct 2026 07:28:00 GMT',
          'x-pages': '5',
        },
      });
    };

    const res = await fetchEsi('/markets/10000002/orders/', {
      customFetch: mockFetch,
      etag: '"abc123etag"',
    });

    assert(res.ok === true, 'Expected result.ok === true for 304');
    assert(res.status === 304, 'Expected status 304');
    assert(res.data === null, 'Expected data null on 304');
    assert(res.etag === '"abc123etag"', 'Expected etag preserved');
    assert(res.expires === 'Wed, 21 Oct 2026 07:28:00 GMT', 'Expected expires preserved');
    assert(res.xPages === '5', 'Expected xPages preserved');
  });

  // --- 2. Rate Limiting and Error Limit Budget ---
  console.log('\n--- 2. RATE LIMITING & ERROR BUDGET ENFORCEMENT ---');

  await test('fetchEsi halts retries immediately when x-esi-error-limit-remain <= 0', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response('Blocked', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain',
          'x-esi-error-limit-remain': '0',
          'x-esi-error-limit-reset': '60',
        },
      });
    };

    const res = await fetchEsi('/universe/types/34/', {
      customFetch: mockFetch,
      retries: 3,
    });

    assert(res.ok === false, 'Expected result to be false');
    assert(res.errorLimitRemain === 0, 'Expected errorLimitRemain to be 0');
    assert(res.errorLimitReset === 60, 'Expected errorLimitReset to be 60');
    assert(callCount === 1, `Expected immediate abort without retrying (callCount=1), got ${callCount}`);
  });

  await test('fetchEsi captures and respects Retry-After on 429 rate limit', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Content-Type': 'text/plain',
            'retry-after': '1',
          },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await fetchEsi('/markets/10000002/orders/', {
      customFetch: mockFetch,
      retries: 1,
    });

    assert(res.ok === true, 'Expected result to be ok after backoff');
    assert(res.status === 200, 'Expected status 200');
    assert(callCount === 2, `Expected 2 calls, got ${callCount}`);
  });

  await test('fetchEsi handles timeout abort cleanly with status 504', async () => {
    const mockFetch = async (url: any, init: any) => {
      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const res = await fetchEsi('/markets/slow-endpoint/', {
      customFetch: mockFetch,
      timeoutMs: 50,
      retries: 0,
    });

    assert(res.ok === false, 'Expected failure on timeout');
    assert(res.status === 504, `Expected status 504 for timeout abort, got ${res.status}`);
    assert(res.error?.includes('timed out') === true, 'Expected timeout error message');
  });

  // --- 3. Offline Global Mock Injection for Server Endpoints ---
  console.log('\n--- 3. DETERMINISTIC OFFLINE SERVER TESTING WITH GLOBAL MOCK ---');

  const app = await createServerApp({ includeVite: false });
  let server: http.Server;
  let testPort: number;

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      testPort = typeof addr === 'object' && addr ? addr.port : 3001;
      resolve();
    });
  });

  try {
    await test('server /api/universe/location/:id resolves station correctly via global mock ESI', async () => {
      setGlobalEsiMock(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/universe/stations/60003760/')) {
          return new Response(
            JSON.stringify({
              station_id: 60003760,
              name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
              system_id: 30000142,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const res = await fetch(`http://127.0.0.1:${testPort}/api/universe/location/60003760`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.location_id === 60003760, 'Expected location_id 60003760');
      assert(body.name === 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', 'Expected station name match');
      assert(body.system_id === 30000142, 'Expected system_id 30000142');
    });

    await test('server /api/markets/:regionId/orders proxies via global mock ESI with cache headers', async () => {
      setGlobalEsiMock(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/markets/10000002/orders/')) {
          return new Response(
            JSON.stringify([
              { order_id: 987654, type_id: 34, price: 5.5, volume_remain: 100000, is_buy_order: false },
            ]),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-pages': '1',
                'x-esi-error-limit-remain': '99',
                'x-esi-error-limit-reset': '50',
                'expires': new Date(Date.now() + 60000).toUTCString(),
              },
            }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const res = await fetch(`http://127.0.0.1:${testPort}/api/markets/10000002/orders?type_id=34`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.headers.get('x-pages') === '1', 'Expected X-Pages header');
      assert(res.headers.get('x-cache-status') === 'MISS', 'Expected MISS on first call');
      const body = await res.json();
      assert(Array.isArray(body), 'Expected array of orders');
      assert(body[0]?.order_id === 987654, 'Expected mock order_id 987654');

      // Second call should hit the server cache
      const cachedRes = await fetch(`http://127.0.0.1:${testPort}/api/markets/10000002/orders?type_id=34`);
      assert(cachedRes.status === 200, `Expected 200, got ${cachedRes.status}`);
      assert(cachedRes.headers.get('x-cache-status') === 'HIT', 'Expected HIT on second call');
    });

    await test('market cache revalidation preserves pagination metadata from cached state', async () => {
      const refreshed = mergeEsi304CacheEntry(
        {
          data: [{ order_id: 1, type_id: 35, price: 10 }],
          headers: { 'X-Pages': '3', 'X-ESI-Error-Limit-Remain': '99' },
          expiresAt: 0,
          etag: '"orders-etag"',
        },
        {
          etag: '"orders-etag"',
          expires: new Date(Date.now() + 120000).toUTCString(),
        },
        Date.now(),
      );
      assert(refreshed.headers['X-Pages'] === '3', 'Cached X-Pages must survive a 304 without pagination headers');
      assert(refreshed.headers['X-ESI-Error-Limit-Remain'] === '99', 'Cached rate-limit metadata must survive 304');
      assert(refreshed.etag === '"orders-etag"', 'ETag must survive revalidation');
      assert(refreshed.data[0]?.order_id === 1, 'Cached market data must survive revalidation');
      assert(refreshed.expiresAt > Date.now(), 'Revalidated cache entry must receive a future expiration');
    });
    await test('server /api/markets/:regionId/history proxies via global mock ESI', async () => {
      setGlobalEsiMock(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/markets/10000002/history/')) {
          return new Response(
            JSON.stringify([
              { date: '2026-09-20', order_count: 50, volume: 1000, highest: 6.0, lowest: 5.0, average: 5.5 },
            ]),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'expires': new Date(Date.now() + 60000).toUTCString(),
              },
            }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const res = await fetch(`http://127.0.0.1:${testPort}/api/markets/10000002/history?type_id=34`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(Array.isArray(body), 'Expected array of history entries');
      assert(body[0]?.average === 5.5, 'Expected average 5.5');
    });

    await test('server /api/types/lookup/:id proxies via global mock ESI for non-canonical types', async () => {
      setGlobalEsiMock(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/universe/types/99999999/')) {
          return new Response(
            JSON.stringify({
              type_id: 99999999,
              name: 'Experimental Quantum Disruptor',
              group_id: 123,
              published: true,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const res = await fetch(`http://127.0.0.1:${testPort}/api/types/lookup/99999999`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.type_id === 99999999, 'Expected type_id 99999999');
      assert(body.name === 'Experimental Quantum Disruptor', 'Expected name match');
    });

    await test('server /api/character/:id/wallet proxies with authorization via global mock', async () => {
      setGlobalEsiMock(async (url, init) => {
        const auth = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
        if (auth !== 'Bearer test-secret-token') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        return new Response(JSON.stringify(125000000.5), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const res = await fetch(`http://127.0.0.1:${testPort}/api/character/2112345678/wallet`, {
        headers: { Authorization: 'Bearer test-secret-token' },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.balance === 125000000.5, `Expected balance 125000000.5, got ${body.balance}`);
    });
  } finally {
    setGlobalEsiMock(null);
    await new Promise<void>((res) => server.close(() => res()));
  }

  console.log('\n===============================================================');
  console.log(`ESI HARDENING TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
