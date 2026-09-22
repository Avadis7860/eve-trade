import { createEsiGateway } from '../utils/esiGateway';
import type { EsiFetchResult } from '../utils/esiClient';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function successfulResult<T>(data: T): EsiFetchResult<T> {
  return {
    ok: true,
    status: 200,
    data,
    metadata: {
      cache: { etag: '"etag-1"' },
      rateLimit: { rateLimitRemaining: 149 },
      pagination: { xPages: 1 },
    },
  };
}

async function runTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      console.log('  [PASS] ' + name);
      passed++;
    } catch (error) {
      console.error('  [FAIL] ' + name + ': ' + String(error));
      failed++;
    }
  }

  await test('builds stable query strings and bearer authorization from principal context', async () => {
    let observedEndpoint = '';
    let observedOptions: any;

    const gateway = createEsiGateway(async (endpoint, options) => {
      observedEndpoint = endpoint;
      observedOptions = options;
      return successfulResult({ wallet: 123 });
    });

    const response = await gateway.request(
      {
        path: '/characters/123/wallet/',
        query: { language: 'en', datasource: 'tranquility' },
      },
      {
        type: 'character',
        id: 123,
        bearerCredential: 'credential-a',
      }
    );

    assert(response.ok, 'Expected gateway response to be successful');
    assert(
      observedEndpoint === '/characters/123/wallet/?datasource=tranquility&language=en',
      'Expected deterministic encoded query string'
    );
    assert(
      observedOptions.headers.Authorization === 'Bearer credential-a',
      'Expected principal-owned bearer authorization'
    );
    assert(observedOptions.method === 'GET', 'Expected default GET method');
  });

  await test('caller headers cannot replace the principal Authorization header', async () => {
    let observedOptions: any;
    const gateway = createEsiGateway(async (_endpoint, options) => {
      observedOptions = options;
      return successfulResult({ ok: true });
    });

    await gateway.request(
      {
        path: '/characters/123/orders/',
        headers: {
          Authorization: 'Bearer untrusted',
          AUTHORIZATION: 'Bearer mixed-case-untrusted',
          'X-Test': 'ok',
        },
      },
      {
        type: 'character',
        id: 123,
        bearerCredential: 'credential-real',
      }
    );

    assert(
      observedOptions.headers.Authorization === 'Bearer credential-real',
      'Principal credential must own Authorization'
    );
    assert(
      observedOptions.headers.AUTHORIZATION === undefined,
      'Mixed-case Authorization header must be removed'
    );
    assert(observedOptions.headers['X-Test'] === 'ok', 'Non-auth headers should survive');
  });

  await test('allows explicit opt-out from GET request coalescing', async () => {
    let calls = 0;

    const gateway = createEsiGateway(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return successfulResult({ ok: true });
    });

    const context = {
      type: 'character' as const,
      id: 123,
      bearerCredential: 'credential-a',
    };

    await Promise.all([
      gateway.request({ path: '/characters/123/skills/', dedupe: false }, context),
      gateway.request({ path: '/characters/123/skills/', dedupe: false }, context),
    ]);

    assert(calls === 2, 'Explicit dedupe:false must issue two requests, got ' + calls);
  });

  await test('deduplicates concurrent GET requests for the same principal and endpoint', async () => {
    let calls = 0;

    const gateway = createEsiGateway(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return successfulResult({ ok: true });
    });

    const context = {
      type: 'character' as const,
      id: 123,
      bearerCredential: 'credential-a',
    };

    const [a, b] = await Promise.all([
      gateway.request({ path: '/characters/123/skills/' }, context),
      gateway.request({ path: '/characters/123/skills/' }, context),
    ]);

    assert(a.ok && b.ok, 'Both coalesced callers should receive success');
    assert(calls === 1, 'Expected one underlying request, got ' + calls);
  });

  await test('does not coalesce GET requests that carry different ETags', async () => {
    let calls = 0;

    const gateway = createEsiGateway(async (_endpoint, options) => {
      calls++;
      return {
        ok: true,
        status: 200,
        data: { etag: options?.etag },
        metadata: { cache: {}, rateLimit: {}, pagination: {} },
      };
    });

    const context = { type: 'character' as const, id: 123, bearerCredential: 'credential-a' };

    await Promise.all([
      gateway.request({ path: '/characters/123/orders/', etag: '"etag-a"' }, context),
      gateway.request({ path: '/characters/123/orders/', etag: '"etag-b"' }, context),
    ]);

    assert(calls === 2, 'Different ETags must not share a request, got ' + calls);
  });

  await test('does not share private requests across different credentials', async () => {
    let calls = 0;

    const gateway = createEsiGateway(async () => {
      calls++;
      return successfulResult({ ok: true });
    });

    await Promise.all([
      gateway.request(
        { path: '/characters/123/wallet/' },
        { type: 'character', id: 123, bearerCredential: 'credential-a' }
      ),
      gateway.request(
        { path: '/characters/123/wallet/' },
        { type: 'character', id: 123, bearerCredential: 'credential-b' }
      ),
    ]);

    assert(calls === 2, 'Expected two isolated private requests, got ' + calls);
  });

  await test('maps authentication, authorization, rate-limit, timeout and transient failures', async () => {
    const statuses = [401, 403, 429, 504, 503];
    const expectedKinds = [
      'AUTHENTICATION',
      'AUTHORIZATION',
      'RATE_LIMITED',
      'TIMEOUT',
      'TRANSIENT',
    ];

    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const gateway = createEsiGateway(async () => ({
        ok: false,
        status,
        data: null,
        error: status === 504 ? 'ESI request timed out' : 'status-' + status,
        metadata: { cache: {}, rateLimit: {}, pagination: {} },
      }));

      const response = await gateway.request({ path: '/test/' });

      assert(response.ok === false, 'Expected failure for ' + status);
      assert(
        response.error?.kind === expectedKinds[i],
        'Expected mapped kind for ' + status
      );
    }
  });

  await test('maps exhausted ESI error budget before generic status handling', async () => {
    const gateway = createEsiGateway(async () => ({
      ok: false,
      status: 503,
      data: null,
      error: 'temporarily unavailable',
      errorLimitRemain: 0,
      errorLimitReset: 30,
      metadata: {
        cache: {},
        rateLimit: {
          errorLimitRemain: 0,
          errorLimitResetSeconds: 30,
        },
        pagination: {},
      },
    }));

    const response = await gateway.request({ path: '/test/' });

    assert(response.error?.kind === 'ERROR_LIMIT_EXHAUSTED', 'Expected error-limit classification');
    assert(response.error?.retryable === false, 'Exhausted error budget must not be retryable');
    assert(response.error?.retryAfterSeconds === 30, 'Expected reset value');
  });

  await test('propagates transport metadata without altering payload', async () => {
    const gateway = createEsiGateway(async () => ({
      ok: true,
      status: 304,
      data: null,
      metadata: {
        cache: { etag: '"etag-x"', expires: 'Tue, 22 Sep 2026 14:00:00 GMT' },
        rateLimit: { errorLimitRemain: 98 },
        pagination: { xPages: 4 },
      },
    }));

    const response = await gateway.request({
      path: '/markets/10000002/orders/',
      etag: '"etag-x"',
    });

    assert(response.ok, '304 should remain a transport-success response');
    assert(response.status === 304, 'Expected 304 status');
    assert(response.data === null, 'Expected 304 payload to remain null');
    assert(response.metadata.cache.etag === '"etag-x"', 'Expected ETag preservation');
    assert(response.metadata.pagination.xPages === 4, 'Expected pagination preservation');
  });

  console.log('\nESI Gateway Core: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
