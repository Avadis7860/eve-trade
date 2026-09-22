import { CharacterEsiGateway } from '../gateways/characterEsiGateway';
import type { EsiGatewayResponse, EsiRequest, EsiPrincipalContext } from '../utils/esiTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function okResult<T>(data: T): EsiGatewayResponse<T> {
  return {
    ok: true,
    status: 200,
    data,
    metadata: {
      cache: {
        etag: '"character-etag"',
        expires: 'Tue, 22 Sep 2026 20:00:00 GMT',
        lastModified: 'Tue, 22 Sep 2026 19:00:00 GMT',
        cacheControl: 'public, max-age=60',
        compatibilityDate: '2026-09-22',
      },
      rateLimit: {
        errorLimitRemain: 99,
        errorLimitResetSeconds: 42,
        rateLimitGroup: 'character',
        rateLimitLimit: '100',
        rateLimitRemaining: 98,
        rateLimitUsed: 2,
      },
      pagination: { xPages: 7 },
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
    } catch (err: unknown) {
      console.error('  [FAIL] ' + name);
      console.error('         ' + String(err));
      failed++;
    }
  }

  const calls: Array<{ request: EsiRequest; context: EsiPrincipalContext }> = [];
  const fakeGateway = {
    request: async <T>(request: EsiRequest, context: EsiPrincipalContext): Promise<EsiGatewayResponse<T>> => {
      calls.push({ request, context });
      let data: unknown;
      if (request.path.includes('/wallet/') && request.path.includes('transactions')) data = [{ transaction_id: 123 }];
      else if (request.path.includes('/journal/')) data = [{ id: 456 }];
      else if (request.path.includes('/orders/history/')) data = [{ order_id: 99 }];
      else if (request.path.includes('/orders/')) data = [{ order_id: 88 }];
      else if (request.path.includes('/skills/')) data = { skills: [{ skill_id: 3300 }] };
      else if (request.path.includes('/wallet/')) data = -12_500_000;
      else data = { character_id: 123, corporation_id: 456 };
      return okResult(data) as EsiGatewayResponse<T>;
    },
  };

  const gateway = new CharacterEsiGateway(fakeGateway);

  await test('active orders use the authenticated character principal and exact ESI path', async () => {
    calls.length = 0;
    const result = await gateway.fetchOrders(2112345678, 'token-main');

    assert(result.ok, 'Orders request should succeed');
    assert(result.data?.[0]?.order_id === 88, 'Order payload must be preserved');
    assert(calls.length === 1, 'Expected exactly one gateway request');
    assert(calls[0].request.path === '/characters/2112345678/orders/', 'Unexpected orders path');
    assert(calls[0].request.query?.datasource === 'tranquility', 'Orders datasource must be explicit');
    assert(calls[0].context.type === 'character', 'Orders must use a character principal');
  });

  await test('order history preserves the requested page', async () => {
    calls.length = 0;
    const result = await gateway.fetchOrderHistory(300000001, 'token-alt', 7);

    assert(result.ok, 'Order history should succeed');
    assert(result.data?.[0]?.order_id === 99, 'Order history payload must be preserved');
    assert(calls[0].request.path === '/characters/300000001/orders/history/', 'Unexpected history path');
    assert(calls[0].request.query?.page === 7, 'Requested page must be preserved');
  });

  await test('order history defaults to page 1', async () => {
    calls.length = 0;
    await gateway.fetchOrderHistory(300000001, 'token-alt');

    assert(calls[0].request.query?.page === 1, 'Default order history page must be 1');
  });

  await test('wallet preserves negative and decimal ISK values exactly', async () => {
    calls.length = 0;
    const result = await gateway.fetchWallet(2112345678, 'token-main');

    assert(result.ok, 'Wallet request should succeed');
    assert(result.data === -12_500_000, 'Negative wallet balance must remain exact');
    assert(calls[0].request.path === '/characters/2112345678/wallet/', 'Unexpected wallet path');
    assert(calls[0].context.type === 'character', 'Wallet must use character principal');
    assert(calls[0].context.type === 'character' && calls[0].context.bearerCredential === 'token-main', 'Wallet credential must remain principal-owned');
  });

  await test('skills use the authenticated character principal and preserve payload', async () => {
    calls.length = 0;
    const result = await gateway.fetchSkills(300000002, 'token-alt');

    assert(result.ok, 'Skills request should succeed');
    assert((result.data as any)?.skills?.[0]?.skill_id === 3300, 'Skills payload must be preserved');
    assert(calls[0].request.path === '/characters/300000002/skills/', 'Unexpected skills path');
  });

  await test('transactions omit from_id unless explicitly requested', async () => {
    calls.length = 0;
    await gateway.fetchTransactions(300000002, 'token-alt');
    assert(calls[0].request.query?.datasource === 'tranquility', 'Transaction datasource must be explicit');
    assert(calls[0].request.query?.from_id === undefined, 'from_id must be absent unless requested');

    calls.length = 0;
    await gateway.fetchTransactions(300000002, 'token-alt', 987654321);
    assert(calls[0].request.query?.from_id === 987654321, 'Requested from_id must be preserved');
  });

  await test('journal uses the character wallet journal endpoint', async () => {
    calls.length = 0;
    const result = await gateway.fetchJournal(300000002, 'token-alt');

    assert(result.ok, 'Journal request should succeed');
    assert(result.data?.[0]?.id === 456, 'Journal payload must be preserved');
    assert(calls[0].request.path === '/characters/300000002/wallet/journal/', 'Unexpected journal path');
    assert(calls[0].context.type === 'character', 'Journal must use character principal');
  });

  await test('two character credentials remain isolated by principal context', async () => {
    calls.length = 0;
    await Promise.all([
      gateway.fetchOrders(1001, 'token-A'),
      gateway.fetchOrders(1001, 'token-B'),
    ]);

    assert(calls.length === 2, 'Different credentials must reach the gateway independently');
    assert(calls[0].context.type === 'character' && calls[1].context.type === 'character', 'Both requests must be authenticated');
    assert(calls[0].context.bearerCredential !== calls[1].context.bearerCredential, 'Credentials must remain distinct');
  });

  await test('public character identity is anonymous and never receives a bearer credential', async () => {
    calls.length = 0;
    const result = await gateway.fetchPublicIdentity(123);

    assert(result.ok, 'Public identity should succeed');
    assert(result.data?.corporation_id === 456, 'Corporation id must be preserved');
    assert(calls[0].context.type === 'anonymous', 'Public identity must use the anonymous principal');
    assert(calls[0].request.path === '/characters/123/', 'Unexpected public identity path');
  });

  await test('gateway metadata and downstream errors are passed through unchanged', async () => {
    const response: EsiGatewayResponse<unknown> = {
      ok: false,
      status: 429,
      data: null,
      error: {
        kind: 'RATE_LIMITED',
        status: 429,
        message: 'slow down',
        retryable: true,
        retryAfterSeconds: 17,
      },
      metadata: {
        cache: { etag: '"error-etag"', compatibilityDate: '2026-09-22' },
        rateLimit: { errorLimitRemain: 12, errorLimitResetSeconds: 9, retryAfterSeconds: 17 },
        pagination: { xPages: 4 },
      },
    };

    const errorGateway = new CharacterEsiGateway({
      request: async <T>(_request: EsiRequest, _context: EsiPrincipalContext) => response as EsiGatewayResponse<T>,
    });

    const result = await errorGateway.fetchWallet(123, 'token');

    assert(result.ok === false, 'Gateway error must remain a failure');
    assert(result.status === 429, 'Gateway status must be preserved');
    assert(result.error?.kind === 'RATE_LIMITED', 'Gateway error kind must be preserved');
    assert(result.error?.retryAfterSeconds === 17, 'Retry-After must be preserved');
    assert(result.metadata.rateLimit.errorLimitRemain === 12, 'Error-limit metadata must be preserved');
    assert(result.metadata.pagination.xPages === 4, 'Pagination metadata must be preserved');
  });

  console.log('\n===============================================================');
  console.log('CHARACTER ESI GATEWAY TEST SUMMARY: ' + passed + ' passed, ' + failed + ' failed.');
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((err: unknown) => {
  console.error('Fatal character gateway test runner error:', err);
  process.exit(1);
});
