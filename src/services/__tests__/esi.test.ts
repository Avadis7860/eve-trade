import { EsiService } from '../esi';
import { setBackendApiFetchForTesting } from '../backendApiClient';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function run() {
  console.log('=== FRONTEND ESI / BACKEND TRANSPORT CONTRACT TESTS ===');

  let calls = 0;
  setBackendApiFetchForTesting(async (input) => {
    calls++;
    const url = String(input);
    if (url.includes('/api/markets/10000002/orders') && url.includes('page=1')) {
      return new Response(JSON.stringify([{
        order_id: 1, type_id: 34, price: 5, volume_remain: 100, volume_total: 100,
        region_id: 10000002, system_id: 30000142, location_id: 60003760, is_buy_order: false,
        issued: '2026-09-22T00:00:00Z', duration: 90,
      }]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Pages': '2' } });
    }
    if (url.includes('/api/markets/10000002/orders') && url.includes('page=2')) {
      return new Response(JSON.stringify([{
        order_id: 2, type_id: 34, price: 5.5, volume_remain: 50, volume_total: 50,
        region_id: 10000002, system_id: 30000142, location_id: 60003760, is_buy_order: true,
        issued: '2026-09-22T00:00:00Z', duration: 90,
      }]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Pages': '2' } });
    }
    throw new Error(`Unexpected backend request: ${url}`);
  });

  try {
    const result = await EsiService.fetchLiveOrdersDetailed(10000002, 34);
    assert(result.orders.length === 2, 'Two paginated backend pages must be aggregated');
    assert(result.quality.pages_fetched === 2, 'Pagination metadata must be preserved');
    assert(result.quality.expected_pages === 2, 'Expected page count must come from X-Pages');
    assert(result.quality.completeness === 'complete', 'All fetched pages must produce complete quality');
    assert(calls === 2, 'Exactly two backend requests are expected');

    const historyMock = async (input: RequestInfo | URL) => {
      const url = String(input);
      assert(url.includes('/api/markets/10000002/history?type_id=34'), 'History must use backend API');
      return new Response(JSON.stringify([{
        date: '2026-09-21', order_count: 10, volume: 1000, highest: 6, lowest: 4, average: 5,
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    setBackendApiFetchForTesting(historyMock);
    const history = await EsiService.fetchMarketHistory(10000002, 34);
    assert(history?.price_median_30d === 5, 'History must be calculated from backend data');

    setBackendApiFetchForTesting(async (input) => {
      const url = String(input);
      assert(url.includes('/api/markets/10000002/orders'), '404 path must still target backend');
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    });
    const empty = await EsiService.fetchLiveOrdersDetailed(10000002, 34);
    assert(empty.orders.length === 0, 'A market 404 remains an empty order book at the service boundary');
    assert(empty.quality.completeness === 'empty', 'Empty market must not become a transport error');

    console.log('✅ Frontend ESI transport contract tests passed.');
  } finally {
    setBackendApiFetchForTesting(null);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});