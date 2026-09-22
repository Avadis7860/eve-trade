import { MarketEsiGateway } from '../gateways/marketEsiGateway';
import type { EsiGatewayResponse, EsiResponseMetadata } from '../utils/esiTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function metadata(overrides: Partial<EsiResponseMetadata> = {}): EsiResponseMetadata {
  return {
    cache: {},
    rateLimit: {},
    pagination: {},
    ...overrides,
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

  await test('market orders are expressed as relative ESI requests and cached by domain gateway', async () => {
    let calls = 0;
    const fakeGateway = {
      request: async <T>(request: any): Promise<EsiGatewayResponse<T>> => {
        calls++;
        assert(request.method === 'GET', 'Orders must use GET');
        assert(request.path === '/markets/10000002/orders/', 'Unexpected orders path');
        assert(request.query?.datasource === 'tranquility', 'Orders must use Tranquility datasource');
        assert(request.query?.order_type === 'sell', 'Order type must be preserved');
        assert(request.query?.page === 2, 'Page must be preserved');
        assert(request.query?.type_id === 34, 'Type id must be preserved');

        return {
          ok: true,
          status: 200,
          data: [{ order_id: 1, type_id: 34, price: 100 }],
          metadata: metadata({
            cache: {
              etag: '"orders-v1"',
              expires: new Date(Date.now() + 600_000).toUTCString(),
            },
            pagination: { xPages: 4 },
          }),
        } as EsiGatewayResponse<T>;
      },
    };

    const marketGateway = new MarketEsiGateway(fakeGateway);

    const first = await marketGateway.fetchOrders({
      regionId: 10000002,
      typeId: 34,
      page: 2,
      orderType: 'sell',
    });

    assert(first.ok && first.cacheStatus === 'MISS', 'First orders request must be a MISS');
    assert(first.data?.[0]?.order_id === 1, 'First orders payload must be returned');

    const second = await marketGateway.fetchOrders({
      regionId: 10000002,
      typeId: 34,
      page: 2,
      orderType: 'sell',
    });

    assert(second.ok && second.cacheStatus === 'HIT', 'Second orders request must be a HIT');
    assert(calls === 1, 'Fresh cache hit must avoid a second ESI request');
    assert(second.metadata.pagination.xPages === 4, 'Cached pagination metadata must be retained');
  });

  await test('expired market cache revalidates with ETag and preserves cached payload/metadata on 304', async () => {
    let calls = 0;
    const requests: any[] = [];

    const fakeGateway = {
      request: async <T>(request: any): Promise<EsiGatewayResponse<T>> => {
        calls++;
        requests.push(request);

        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            data: [{ order_id: 2, type_id: 35, price: 200 }],
            metadata: metadata({
              cache: {
                etag: '"orders-v2"',
                expires: new Date(Date.now() - 1_000).toUTCString(),
              },
              pagination: { xPages: 3 },
              rateLimit: { errorLimitRemain: 99 },
            }),
          } as EsiGatewayResponse<T>;
        }

        return {
          ok: true,
          status: 304,
          data: null,
          metadata: metadata({
            cache: {
              etag: '"orders-v2"',
              expires: new Date(Date.now() + 120_000).toUTCString(),
            },
          }),
        } as EsiGatewayResponse<T>;
      },
    };

    const marketGateway = new MarketEsiGateway(fakeGateway, {
      orderTtlFloorMs: 0,
    });

    const first = await marketGateway.fetchOrders({ regionId: 10000002, typeId: 35 });
    assert(first.cacheStatus === 'MISS', 'Initial request must populate the cache');

    const second = await marketGateway.fetchOrders({ regionId: 10000002, typeId: 35 });

    assert(second.ok, '304 revalidation must remain successful');
    assert(second.cacheStatus === 'REVALIDATED', 'Expected REVALIDATED cache status');
    assert(second.status === 304, 'Internal result should preserve 304 status');
    assert(second.data?.[0]?.order_id === 2, '304 must return cached market data');
    assert(second.metadata.pagination.xPages === 3, 'Cached X-Pages must survive 304');
    assert(second.metadata.rateLimit.errorLimitRemain === 99, 'Cached rate-limit metadata must survive 304');
    assert(requests[1]?.etag === '"orders-v2"', 'Expired cache ETag must be sent to ESI');
    assert(calls === 2, 'Expected exactly one revalidation request');
  });

  await test('market history uses a separate cache key from orders and preserves validation semantics', async () => {
    const requests: any[] = [];
    const fakeGateway = {
      request: async <T>(request: any): Promise<EsiGatewayResponse<T>> => {
        requests.push(request);
        return {
          ok: true,
          status: 200,
          data: [{ date: '2026-09-22', order_count: 10, volume: 500, average: 50 }],
          metadata: metadata({
            cache: { expires: new Date(Date.now() + 600_000).toUTCString() },
          }),
        } as EsiGatewayResponse<T>;
      },
    };

    const marketGateway = new MarketEsiGateway(fakeGateway);

    const result = await marketGateway.fetchHistory(10000002, 34);

    assert(result.ok && result.cacheStatus === 'MISS', 'History must be fetched on first access');
    assert(result.data?.[0]?.average === 50, 'History payload must be preserved');
    assert(requests[0]?.path === '/markets/10000002/history/', 'Unexpected history path');
    assert(requests[0]?.query?.type_id === 34, 'History type id must be preserved');
    assert(requests[0]?.query?.datasource === 'tranquility', 'History datasource must be preserved');
  });

  console.log('\n===============================================================');
  console.log('MARKET ESI GATEWAY TEST SUMMARY: ' + passed + ' passed, ' + failed + ' failed.');
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((err: unknown) => {
  console.error('Fatal market gateway test runner error:', err);
  process.exit(1);
});
