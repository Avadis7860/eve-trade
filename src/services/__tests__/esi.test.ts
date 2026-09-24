import { EsiService } from '../esi';
import { setBackendApiFetchForTesting } from '../backendApiClient';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function run() {
  const assertCollectionState = async (
    label: string,
    response: Response,
    expectedState: import('../esi').EsiCollectionState,
    expectedLength: number,
  ) => {
    setBackendApiFetchForTesting(async () => response);
    const result = await EsiService.fetchCharacterOrders(1001, 'test-token');
    assert(result.state === expectedState, `${label}: expected state ${expectedState}, got ${result.state}`);
    assert(result.data.length === expectedLength, `${label}: expected ${expectedLength} rows, got ${result.data.length}`);
    return result;
  };

  const emptyOrders = await assertCollectionState(
    '200 empty collection',
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    'EMPTY',
    0,
  );
  assert(EsiService.requireUsableCollection(emptyOrders, 'orders').length === 0, 'EMPTY must remain usable as an empty collection');

  await assertCollectionState(
    '200 populated collection',
    new Response(JSON.stringify([{ order_id: '90001' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    'AVAILABLE',
    1,
  );

  await assertCollectionState(
    '206 partial collection',
    new Response(JSON.stringify([{ order_id: '90002' }]), { status: 206, headers: { 'Content-Type': 'application/json' } }),
    'PARTIAL',
    1,
  );

  const unavailable304 = await assertCollectionState(
    '304 not modified',
    new Response(null, { status: 304 }),
    'UNAVAILABLE',
    0,
  );
  let threw = false;
  try {
    EsiService.requireUsableCollection(unavailable304, 'orders');
  } catch (error) {
    threw = String(error).includes('[UNAVAILABLE]') && String(error).includes('HTTP_304');
  }
  assert(threw, 'UNAVAILABLE collections must not be silently consumed');

  const error404 = await assertCollectionState(
    '404 unavailable source',
    new Response(JSON.stringify({ error: 'missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    'ERROR',
    0,
  );
  threw = false;
  try {
    EsiService.requireUsableCollection(error404, 'orders');
  } catch (error) {
    threw = String(error).includes('[ERROR]') && String(error).includes('HTTP_404');
  }
  assert(threw, 'ERROR collections must not be silently consumed');

  setBackendApiFetchForTesting(async () => new Response(JSON.stringify({ error: 'forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  }));
  const transactionsError = await EsiService.fetchCharacterTransactions(1001, 'test-token');
  assert(transactionsError.state === 'ERROR', '403 transactions must remain ERROR');
  assert(transactionsError.data.length === 0, '403 transactions must not fabricate data');

  setBackendApiFetchForTesting(async () => new Response(JSON.stringify([{ transaction_id: 1 }]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const transactionsAvailable = await EsiService.fetchCharacterTransactions(1001, 'test-token');
  assert(transactionsAvailable.state === 'AVAILABLE', 'Transactions payload must classify as AVAILABLE');

  const missingToken = await EsiService.fetchCharacterJournal(1001, '');
  assert(missingToken.state === 'UNAVAILABLE', 'Missing credential must be UNAVAILABLE');
  assert(missingToken.status === 401, 'Missing credential must expose HTTP 401 semantics');

  setBackendApiFetchForTesting(async () => new Response(null, { status: 204 }));
  const historyNoContent = await EsiService.fetchCharacterOrderHistory(1001, 'test-token');
  assert(historyNoContent.state === 'UNAVAILABLE', '204 history must not become EMPTY');
  assert(historyNoContent.status === 204, '204 status must remain visible');

  setBackendApiFetchForTesting(async () => new Response('{invalid-json', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
  const malformedJournal = await EsiService.fetchCharacterJournal(1001, 'test-token');
  assert(malformedJournal.state === 'ERROR', 'Malformed successful JSON must be ERROR');
  assert(malformedJournal.status === 500, 'Malformed backend JSON must surface controlled HTTP 500 semantics');

  let corporationAuthHeaders: string[] = [];
  setBackendApiFetchForTesting(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/character/1001/corporation/orders/history')) {
      corporationAuthHeaders.push(
        (init?.headers as Record<string, string> | undefined)?.Authorization || '',
      );
      return new Response(JSON.stringify([{
        order_id: '92002',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 7,
        volume_remain: 20,
        volume_total: 20,
        is_buy_order: false,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
        state: 'fulfilled',
        completed_at: '2026-09-22T02:00:00Z',
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/character/1001/corporation/orders')) {
      corporationAuthHeaders.push(
        (init?.headers as Record<string, string> | undefined)?.Authorization || '',
      );
      return new Response(JSON.stringify([{
        order_id: '92001',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 6.5,
        volume_remain: 30,
        volume_total: 30,
        is_buy_order: true,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected corporation ESI test request: ' + url);
  });

  // Regression: this is the exact observed CCP corporation-order shape from
  // the real browser E2E. CCP omits optional boolean fields when false, so
  // the service boundary must accept the omitted is_buy_order property.
  setBackendApiFetchForTesting(async (input, init) => {
    const url = String(input);

    // Keep the regression mock focused while still serving the valid 1001
    // corporation request made by the preceding contract scenario.
    if (url.includes('/api/character/1001/corporation/orders')) {
      return new Response(JSON.stringify([{
        order_id: '92001',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 6.5,
        volume_remain: 30,
        volume_total: 30,
        is_buy_order: true,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!url.includes('/api/character/2124224223/corporation/orders')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = init?.headers;
    const authorization =
      headers instanceof Headers
        ? headers.get('Authorization') || ''
        : Array.isArray(headers)
          ? headers.find(([name]) => name.toLowerCase() === 'authorization')?.[1] || ''
          : (headers as Record<string, string> | undefined)?.Authorization ||
            (headers as Record<string, string> | undefined)?.authorization ||
            '';

    assert(
      authorization === 'Bearer corp-token-real',
      'Observed real-payload request must use the supplied credential',
    );

    return new Response(JSON.stringify([{
      duration: 90,
      issued: '2026-09-24T01:16:23Z',
      issued_by: 2124224223,
      location_id: 60003760,
      order_id: 7429091434,
      price: 9286,
      range: 'region',
      region_id: 10000002,
      type_id: 3691,
      volume_remain: 3165,
      volume_total: 3165,
      wallet_division: 1,
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const observedRealCorpOrders = await EsiService.fetchCharacterCorporationOrders(
    2124224223,
    'corp-token-real',
    98830882,
    'The Defense Of Ikuchi',
  );
  assert(
    observedRealCorpOrders.state === 'AVAILABLE',
    'Exact observed CCP corporation payload must remain AVAILABLE after service normalization',
  );
  assert(
    observedRealCorpOrders.data.length === 1,
    'Exact observed CCP corporation payload must produce one normalized order',
  );
  assert(
    observedRealCorpOrders.data[0].order_id === '7429091434',
    'Exact observed order ID must survive the EsiService boundary',
  );
  assert(
    observedRealCorpOrders.data[0].is_buy_order === false,
    'Omitted optional CCP buy flag must normalize to the documented sell form',
  );
  assert(
    observedRealCorpOrders.data[0].ownership?.owner_type === 'corporation' &&
      observedRealCorpOrders.data[0].ownership?.owner_id === 98830882,
    'Exact observed payload must preserve economic corporation ownership',
  );
  assert(
    observedRealCorpOrders.data[0].ownership?.principal_character_id === 2124224223 &&
      observedRealCorpOrders.data[0].ownership?.wallet_division === 1,
    'Exact observed payload must preserve observer and wallet division provenance',
  );

  const corpOrdersResult = await EsiService.fetchCharacterCorporationOrders(
    1001,
    'corp-token-a',
    99001,
    'Trade Operations Corporation',
  );
  assert(corpOrdersResult.state === 'AVAILABLE', 'Corporation orders must be AVAILABLE for a valid payload');
  assert(corpOrdersResult.data.length === 1, 'Corporation order payload must have one row');
  assert(corpOrdersResult.data[0].order_id === '92001', 'Corporation order ID must remain canonical');
  assert(corpOrdersResult.data[0].is_corporation === true, 'Corporation order marker must be explicit');
  assert(corpOrdersResult.data[0].character_id === undefined, 'Corporation order must not expose character ownership');
  assert(corpOrdersResult.data[0].ownership?.owner_type === 'corporation', 'Corporation owner type must be explicit');
  assert(corpOrdersResult.data[0].ownership?.owner_id === 99001, 'Corporation owner ID must be explicit');
  assert(corpOrdersResult.data[0].ownership?.principal_character_id === 1001, 'Observing principal must be preserved');

  setBackendApiFetchForTesting(async (input, init) => {
    const url = String(input);
    if (url.includes('/history')) {
      corporationAuthHeaders.push(
        (init?.headers as Record<string, string> | undefined)?.Authorization || '',
      );
      return new Response(JSON.stringify([{
        order_id: '92002',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 7,
        volume_remain: 20,
        volume_total: 20,
        is_buy_order: false,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
        state: 'fulfilled',
        completed_at: '2026-09-22T02:00:00Z',
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!url.includes('/api/character/1001/corporation/orders')) {
      throw new Error('Unexpected partial corporation order test request: ' + url);
    }
    return new Response(JSON.stringify([
      {
        order_id: '93001',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 6.5,
        volume_remain: 10,
        volume_total: 10,
        is_buy_order: false,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
        issued_by: 1001,
        wallet_division: 1,
      },
      {
        order_id: '93002',
        type_id: 34,
        region_id: 10000002,
        location_id: 60003760,
        price: 6.5,
        volume_remain: 10,
        volume_total: 10,
        is_buy_order: false,
        issued: '2026-09-22T00:00:00Z',
        duration: 90,
        issued_by: 1001,
        wallet_division: 8,
      },
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const partialCorpOrdersResult = await EsiService.fetchCharacterCorporationOrders(
    1001,
    'corp-token-a',
    99001,
    'Trade Operations Corporation',
  );
  assert(partialCorpOrdersResult.state === 'PARTIAL', 'Mixed corporation payload must remain PARTIAL');
  assert(partialCorpOrdersResult.data.length === 1, 'Valid corporation orders must survive partial normalization');
  assert(partialCorpOrdersResult.rejected_count === 1, 'Rejected corporation records must be counted explicitly');
  assert(partialCorpOrdersResult.data[0].ownership?.wallet_division === 1, 'Valid wallet division must survive partial normalization');

  const corpHistoryResult = await EsiService.fetchCharacterCorporationOrderHistory(
    1001,
    'corp-token-a',
    99001,
    'Trade Operations Corporation',
    4,
  );
  assert(corpHistoryResult.state === 'AVAILABLE', 'Corporation order history must be AVAILABLE for a valid payload');
  assert(corpHistoryResult.data[0].state === 'fulfilled', 'Corporation history state must be preserved');
  assert(corpHistoryResult.data[0].ownership?.owner_type === 'corporation', 'History owner type must remain corporation');

  assert(
    corporationAuthHeaders.filter((value) => value === 'Bearer corp-token-a').length === 2,
    'Both corporation requests must use the exact authenticated character credential',
  );

  console.log('=== FRONTEND ESI / BACKEND TRANSPORT CONTRACT TESTS ===');

  let calls = 0;
  setBackendApiFetchForTesting(async (input) => {
    calls++;
    const url = String(input);
    if (url.includes('/api/markets/10000002/orders') && url.includes('page=1')) {
      return new Response(JSON.stringify([{
        order_id: '1', type_id: 34, price: 5, volume_remain: 100, volume_total: 100,
        region_id: 10000002, system_id: 30000142, location_id: 60003760, is_buy_order: false,
        issued: '2026-09-22T00:00:00Z', duration: 90,
      }]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Pages': '2' } });
    }
    if (url.includes('/api/markets/10000002/orders') && url.includes('page=2')) {
      return new Response(JSON.stringify([{
        order_id: '2', type_id: 34, price: 5.5, volume_remain: 50, volume_total: 50,
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