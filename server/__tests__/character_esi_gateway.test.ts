import { CharacterEsiGateway } from '../gateways/characterEsiGateway';
import type { EsiGatewayResponse } from '../utils/esiTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
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

  await test('wallet request uses the character principal and preserves a negative real balance', async () => {
    let observed: any;
    const fakeGateway = {
      request: async <T>(request: any, context: any): Promise<EsiGatewayResponse<T>> => {
        observed = { request, context };
        return {
          ok: true,
          status: 200,
          data: -12_500_000,
          metadata: { cache: {}, rateLimit: {}, pagination: {} },
        } as EsiGatewayResponse<T>;
      },
    };

    const gateway = new CharacterEsiGateway(fakeGateway);

    const result = await gateway.fetchWallet(2112345678, 'token-main');

    assert(result.ok, 'Wallet request should succeed');
    assert(result.data === -12_500_000, 'Negative wallet balance must remain exact');
    assert(observed.request.path === '/characters/2112345678/wallet/', 'Unexpected wallet path');
    assert(observed.request.query.datasource === 'tranquility', 'Wallet datasource must be explicit');
    assert(observed.context.type === 'character', 'Wallet must use character principal');
    assert(observed.context.id === 2112345678, 'Character principal id must be preserved');
    assert(observed.context.bearerCredential === 'token-main', 'Credential must belong to the principal context');
  });

  await test('character order history uses deterministic query parameters and preserves page', async () => {
    let observed: any;
    const fakeGateway = {
      request: async <T>(request: any): Promise<EsiGatewayResponse<T>> => {
        observed = request;
        return {
          ok: true,
          status: 200,
          data: [{ order_id: 99 }],
          metadata: { cache: {}, rateLimit: {}, pagination: {} },
        } as EsiGatewayResponse<T>;
      },
    };

    const gateway = new CharacterEsiGateway(fakeGateway);
    const result = await gateway.fetchOrderHistory(300000001, 'token-alt', 7);

    assert(result.ok, 'Order history should succeed');
    assert(result.data?.[0]?.order_id === 99, 'Order history payload must be preserved');
    assert(observed.path === '/characters/300000001/orders/history/', 'Unexpected order history path');
    assert(observed.query.page === 7, 'Requested page must be preserved');
  });

  await test('transactions omit from_id when it is not requested', async () => {
    let observed: any;
    const fakeGateway = {
      request: async <T>(request: any): Promise<EsiGatewayResponse<T>> => {
        observed = request;
        return {
          ok: true,
          status: 200,
          data: [],
          metadata: { cache: {}, rateLimit: {}, pagination: {} },
        } as EsiGatewayResponse<T>;
      },
    };

    const gateway = new CharacterEsiGateway(fakeGateway);
    await gateway.fetchTransactions(300000002, 'token-alt');

    assert(observed.query.datasource === 'tranquility', 'Transaction datasource must be present');
    assert(observed.query.from_id === undefined, 'from_id must be absent unless requested');
  });

  await test('two character credentials remain isolated by the principal context', async () => {
    const calls: any[] = [];
    const fakeGateway = {
      request: async <T>(_request: any, context: any): Promise<EsiGatewayResponse<T>> => {
        calls.push(context);
        return {
          ok: true,
          status: 200,
          data: [],
          metadata: { cache: {}, rateLimit: {}, pagination: {} },
        } as EsiGatewayResponse<T>;
      },
    };

    const gateway = new CharacterEsiGateway(fakeGateway);
    await Promise.all([
      gateway.fetchOrders(1001, 'token-A'),
      gateway.fetchOrders(1001, 'token-B'),
    ]);

    assert(calls.length === 2, 'Different character credentials must reach the gateway independently');
    assert(calls[0].bearerCredential !== calls[1].bearerCredential, 'Credentials must remain distinct');
  });

  await test('public character identity stays anonymous and never receives a bearer credential', async () => {
    let observed: any;
    const fakeGateway = {
      request: async <T>(request: any, context: any): Promise<EsiGatewayResponse<T>> => {
        observed = { request, context };
        return {
          ok: true,
          status: 200,
          data: { character_id: 123, corporation_id: 456 },
          metadata: { cache: {}, rateLimit: {}, pagination: {} },
        } as EsiGatewayResponse<T>;
      },
    };

    const gateway = new CharacterEsiGateway(fakeGateway);
    const result = await gateway.fetchPublicIdentity(123);

    assert(result.ok, 'Public identity should succeed');
    assert(result.data?.corporation_id === 456, 'Corporation id must be preserved');
    assert(observed.context.type === 'anonymous', 'Public identity must not use an authenticated principal');
    assert(observed.request.path === '/characters/123/', 'Unexpected public character path');
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
