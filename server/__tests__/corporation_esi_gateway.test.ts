import { CorporationEsiGateway } from '../gateways/corporationEsiGateway';
import type { CorporationProfile } from '../gateways/corporationEsiGateway';
import type { EsiGatewayResponse, EsiPrincipalContext, EsiRequest } from '../utils/esiTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function metadata(): EsiGatewayResponse<unknown>['metadata'] {
  return {
    cache: {
      etag: '"corp-etag"',
      expires: 'Tue, 22 Sep 2026 20:00:00 GMT',
      lastModified: 'Tue, 22 Sep 2026 19:00:00 GMT',
      cacheControl: 'private, max-age=60',
      compatibilityDate: '2026-09-22',
    },
    rateLimit: {
      errorLimitRemain: 93,
      errorLimitResetSeconds: 41,
      retryAfterSeconds: 13,
      rateLimitGroup: 'corporation',
      rateLimitLimit: '100',
      rateLimitRemaining: 92,
      rateLimitUsed: 8,
    },
    pagination: { xPages: 2 },
  };
}

function okResult<T>(data: T, status = 200): EsiGatewayResponse<T> {
  return {
    ok: true,
    status,
    data,
    metadata: metadata(),
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
    } catch (err: unknown) {
      console.error('  [FAIL] ' + name);
      console.error('         ' + String(err));
      failed++;
    }
  }

  const calls: Array<{ request: EsiRequest; context: EsiPrincipalContext }> = [];
  const fakeGateway = {
    request: async <T>(
      request: EsiRequest,
      context: EsiPrincipalContext,
    ): Promise<EsiGatewayResponse<T>> => {
      calls.push({ request, context });

      if (request.path.includes('/wallets/')) {
        return okResult([
          { division: 1, balance: -2_500_000 },
          { division: 2, balance: 7_500_000.25 },
        ]) as EsiGatewayResponse<T>;
      }

      if (request.path.includes('/divisions/')) {
        return okResult({
          wallet: [
            { division: 1, name: 'Trade' },
            { division: 2, name: 'Reserve' },
          ],
        }) as EsiGatewayResponse<T>;
      }

      return okResult({
        corporation_id: 99001,
        name: 'Trade Operations Corporation',
        ticker: 'TOC',
        member_count: 12,
      }) as EsiGatewayResponse<T>;
    },
  };

  const gateway = new CorporationEsiGateway(fakeGateway);

  await test('profile uses the public corporation endpoint with no credentials', async () => {
    calls.length = 0;

    const result = await gateway.fetchProfile(99001);

    assert(result.ok, 'Profile request should succeed');
    assert(result.data?.name === 'Trade Operations Corporation', 'Profile payload must be preserved');
    assert(calls.length === 1, 'Expected exactly one gateway request');
    assert(calls[0].request.path === '/corporations/99001/', 'Unexpected corporation profile path');
    assert(calls[0].request.query?.datasource === 'tranquility', 'Profile datasource must be explicit');
    assert(calls[0].context.type === 'anonymous', 'Profile must use anonymous principal');
  });

  await test('wallets use the authenticated character principal and preserve negative/decimal balances', async () => {
    calls.length = 0;

    const result = await gateway.fetchWallets(99001, 1001, 'token-character-a');

    assert(result.ok, 'Wallet request should succeed');
    assert(result.data?.[0]?.balance === -2_500_000, 'Negative balance must remain factual');
    assert(result.data?.[1]?.balance === 7_500_000.25, 'Decimal balance must remain factual');
    assert(calls[0].request.path === '/corporations/99001/wallets/', 'Unexpected wallet path');
    assert(calls[0].request.query?.datasource === 'tranquility', 'Wallet datasource must be explicit');
    assert(calls[0].context.type === 'character', 'Wallets must use a character principal');
    assert(
      calls[0].context.type === 'character' &&
        calls[0].context.id === 1001 &&
        calls[0].context.bearerCredential === 'token-character-a',
      'Wallet principal must contain the exact character credential',
    );
  });

  await test('divisions use the same authenticated character principal', async () => {
    calls.length = 0;

    const result = await gateway.fetchDivisions(99001, 1001, 'token-character-a');

    assert(result.ok, 'Divisions request should succeed');
    assert(result.data?.wallet?.[0]?.name === 'Trade', 'Division payload must be preserved');
    assert(calls[0].request.path === '/corporations/99001/divisions/', 'Unexpected divisions path');
    assert(calls[0].context.type === 'character', 'Divisions must use a character principal');
    assert(
      calls[0].context.type === 'character' &&
        calls[0].context.id === 1001 &&
        calls[0].context.bearerCredential === 'token-character-a',
      'Divisions must retain the authenticated character principal',
    );
  });

  await test('metadata and downstream errors are passed through unchanged', async () => {
    const response: EsiGatewayResponse<unknown> = {
      ok: false,
      status: 403,
      data: null,
      error: {
        kind: 'AUTHORIZATION',
        status: 403,
        message: 'corporation wallet access denied',
        retryable: false,
      },
      metadata: metadata(),
    };

    const errorGateway = new CorporationEsiGateway({
      request: async <T>(_request: EsiRequest, _context: EsiPrincipalContext) =>
        response as EsiGatewayResponse<T>,
    });

    const result = await errorGateway.fetchWallets(99001, 1001, 'token-character-a');

    assert(!result.ok, 'Error result should remain failed');
    assert(result.status === 403, 'Status should remain 403');
    assert(result.error?.kind === 'AUTHORIZATION', 'Error kind should remain AUTHORIZATION');
    assert(result.metadata.cache.etag === '"corp-etag"', 'Metadata must remain intact');
    assert(result.metadata.rateLimit.retryAfterSeconds === 13, 'Rate-limit metadata must remain intact');
  });

  await test('two characters in the same corporation remain distinct principals', async () => {
    calls.length = 0;

    await Promise.all([
      gateway.fetchWallets(99001, 1001, 'token-A'),
      gateway.fetchWallets(99001, 1002, 'token-B'),
    ]);

    assert(calls.length === 2, 'Different character principals must not coalesce');
    const contexts = calls.map((call) => call.context);
    if (contexts.some((context) => context.type !== 'character')) {
      throw new Error('All wallet requests must use character principals');
    }

    const ids = contexts.map((context) => context.type === 'character' ? context.id : 0);
    const credentials = contexts.map((context) =>
      context.type === 'character' ? context.bearerCredential : ''
    );

    assert(ids.includes(1001) && ids.includes(1002), 'Both character ids must remain distinct');
    assert(credentials.includes('token-A') && credentials.includes('token-B'), 'Both credentials must remain distinct');
  });

  await test('304 and null successful payloads stay transport-level results', async () => {
    const emptySuccess: EsiGatewayResponse<CorporationProfile> = {
      ok: true,
      status: 200,
      data: null,
      metadata: metadata(),
    };
    const nullGateway = new CorporationEsiGateway({
      request: async <T>(_request: EsiRequest, _context: EsiPrincipalContext) =>
        emptySuccess as EsiGatewayResponse<T>,
    });

    const emptyResult = await nullGateway.fetchProfile(99001);
    assert(emptyResult.ok, 'Transport success must remain successful at gateway level');
    assert(emptyResult.status === 200, 'Successful status must be preserved');
    assert(emptyResult.data === null, 'Null upstream payload must remain null at the gateway boundary');

    const notModified: EsiGatewayResponse<CorporationProfile> = {
      ok: true,
      status: 304,
      data: null,
      metadata: metadata(),
    };
    const gateway = new CorporationEsiGateway({
      request: async <T>(_request: EsiRequest, _context: EsiPrincipalContext) =>
        notModified as EsiGatewayResponse<T>,
    });

    const result = await gateway.fetchProfile(99001);
    assert(result.ok, '304 should remain a successful transport result');
    assert(result.status === 304, '304 status must be preserved');
    assert(result.data === null, '304 must have no payload');
  });

  await test('corporation requests cover representative ESI failure statuses without remapping', async () => {
    for (const status of [401, 403, 404, 420, 429, 502, 503, 504]) {
      const response: EsiGatewayResponse<unknown> = {
        ok: false,
        status,
        data: null,
        error: {
          kind: status === 401
            ? 'AUTHENTICATION'
            : status === 403
              ? 'AUTHORIZATION'
              : status === 404
                ? 'NOT_FOUND'
                : status === 420 || status === 429
                  ? 'RATE_LIMITED'
                  : 'TRANSIENT',
          status,
          message: `simulated-${status}`,
          retryable: status === 420 || status === 429 || status >= 500,
        },
        metadata: metadata(),
      };

      const errorGateway = new CorporationEsiGateway({
        request: async <T>(_request: EsiRequest, _context: EsiPrincipalContext) =>
          response as EsiGatewayResponse<T>,
      });

      const result = await errorGateway.fetchWallets(99001, 1001, 'token-character-a');
      assert(result.status === status, `Status ${status} must be preserved`);
      assert(result.error?.status === status, `Error status ${status} must be preserved`);
    }
  });

  console.log(`\nCorporation ESI gateway contract: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
