/**
 * Character HTTP contract suite.
 *
 * Exercises the real Express route -> CharacterEsiGateway -> EsiGateway -> ESI
 * transport boundary with a deterministic offline CCP mock. The suite is
 * intentionally separate from broad API integration tests so regressions in
 * authentication, payload fidelity, metadata, or ESI error semantics cannot
 * hide behind unrelated route coverage.
 */

import assert from 'assert';
import type { EsiGatewayResponse } from '../utils/esiTypes';
import { startServer, RunningServer } from '../../server';
import { setGlobalEsiMock } from '../utils/esiClient';
import { characterEsiGateway } from '../gateways/characterEsiGateway';

const CHARACTER_A = 1001;
const CHARACTER_B = 1002;
const TOKEN_A = 'token-character-a';
const TOKEN_B = 'token-character-b';
const CORPORATION_ID = 99001;

function metadata(overrides: Partial<NonNullable<EsiGatewayResponse<unknown>['metadata']>> = {}) {
  return {
    cache: {
      etag: '"character-contract-etag"',
      expires: 'Tue, 22 Sep 2026 20:00:00 GMT',
      lastModified: 'Tue, 22 Sep 2026 19:00:00 GMT',
      cacheControl: 'private, max-age=60',
      compatibilityDate: '2026-09-22',
      ...(overrides as any).cache,
    },
    rateLimit: {
      errorLimitRemain: 98,
      errorLimitResetSeconds: 44,
      retryAfterSeconds: undefined,
      rateLimitGroup: 'character',
      rateLimitLimit: '100',
      rateLimitRemaining: 97,
      rateLimitUsed: 3,
      ...(overrides as any).rateLimit,
    },
    pagination: {
      xPages: 3,
      ...(overrides as any).pagination,
    },
  };
}

async function readJson(res: Response): Promise<any> {
  return res.json();
}

async function runTests(): Promise<void> {
  console.log('===============================================================');
  console.log('--- CHARACTER HTTP CONTRACT TESTS ---');
  console.log('===============================================================');

  const serverInstance: RunningServer = await startServer(0, { includeVite: false });
  const baseUrl = `http://127.0.0.1:${serverInstance.port}`;
  const observedRequests: Array<{ path: string; search: string; authorization?: string }> = [];

  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      console.log('  [PASS] ' + name);
      testsPassed++;
    } catch (error: unknown) {
      console.error('  [FAIL] ' + name + ': ' + String(error));
      testsFailed++;
      throw error;
    }
  };

  setGlobalEsiMock(async (url, init) => {
    const parsed = new URL(String(url));
    assert.ok(parsed.pathname.startsWith('/latest/'), `Expected ESI latest path, got ${parsed.pathname}`);
    const esiPath = parsed.pathname.replace(/^\/latest(?=\/)/, '');
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    observedRequests.push({ path: esiPath, search: parsed.search, authorization });

    if (esiPath === `/characters/${CHARACTER_A}/orders/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      return new Response(JSON.stringify([{ order_id: 501, type_id: 34, volume_remain: 10 }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"character-contract-etag"',
          Expires: 'Tue, 22 Sep 2026 20:00:00 GMT',
          'Last-Modified': 'Tue, 22 Sep 2026 19:00:00 GMT',
          'Cache-Control': 'private, max-age=60',
          'X-Pages': '3',
          'X-Compatibility-Date': '2026-09-22',
          'x-esi-error-limit-remain': '98',
          'x-esi-error-limit-reset': '44',
          'x-ratelimit-group': 'character',
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '97',
          'x-ratelimit-used': '3',
        },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/orders/history/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      if (parsed.searchParams.get('page') !== '3') return new Response('Wrong page', { status: 400 });
      return new Response(JSON.stringify([{ order_id: 502, status: 'expired' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Pages': '12' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/wallet/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      return new Response(JSON.stringify(-12500000.5), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/skills/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      return new Response(JSON.stringify({
        skills: [{ skill_id: 3300, trained_skill_level: 5 }],
        total_sp: 123456789,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/wallet/transactions/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      if (parsed.searchParams.get('from_id') !== '900') return new Response('Wrong from_id', { status: 400 });
      return new Response(JSON.stringify([{ transaction_id: 900, is_buy: true, quantity: 5 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/wallet/journal/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Unauthorized', { status: 401 });
      return new Response(JSON.stringify([{ id: 700, amount: -42.5 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_A}/`) {
      if (authorization !== undefined) return new Response('Public route received credentials', { status: 500 });
      return new Response(JSON.stringify({
        character_id: CHARACTER_A,
        corporation_id: CORPORATION_ID,
        name: 'Character Alpha',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/characters/${CHARACTER_B}/orders/`) {
      if (authorization !== `Bearer ${TOKEN_B}`) return new Response('Credential isolation failure', { status: 403 });
      return new Response(JSON.stringify([{ order_id: 601 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/corporations/${CORPORATION_ID}/`) {
      return new Response(JSON.stringify({
        name: 'Trade Operations Corporation',
        ticker: 'TOC',
        member_count: 12,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/corporations/${CORPORATION_ID}/wallets/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Corp authorization failure', { status: 403 });
      return new Response(JSON.stringify([
        { division: 1, balance: -2500000 },
        { division: 2, balance: 7500000.25 },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (esiPath === `/corporations/${CORPORATION_ID}/divisions/`) {
      if (authorization !== `Bearer ${TOKEN_A}`) return new Response('Corp authorization failure', { status: 403 });
      return new Response(JSON.stringify({
        wallet: [
          { division: 1, name: 'Trade' },
          { division: 2, name: 'Reserve' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  });

  try {
    await test('all character-owned HTTP routes preserve payloads and use one authenticated principal', async () => {
      const cases = [
        {
          path: `/api/character/${CHARACTER_A}/orders`,
          body: (data: any) => data[0].order_id === 501,
        },
        {
          path: `/api/character/${CHARACTER_A}/orders/history?page=3`,
          body: (data: any) => data[0].order_id === 502,
        },
        {
          path: `/api/character/${CHARACTER_A}/wallet`,
          body: (data: any) => data.balance === -12500000.5,
        },
        {
          path: `/api/character/${CHARACTER_A}/skills`,
          body: (data: any) => data.skills[0].skill_id === 3300,
        },
        {
          path: `/api/character/${CHARACTER_A}/transactions?from_id=900`,
          body: (data: any) => data[0].transaction_id === 900,
        },
        {
          path: `/api/character/${CHARACTER_A}/journal`,
          body: (data: any) => data[0].id === 700,
        },
      ];

      for (const item of cases) {
        const before = observedRequests.length;
        const response = await fetch(baseUrl + item.path, {
          headers: { Authorization: `Bearer ${TOKEN_A}` },
        });

        assert.strictEqual(response.status, 200, `Expected 200 for ${item.path}, got ${response.status}`);
        const body = await readJson(response);
        assert.ok(item.body(body), `Unexpected payload for ${item.path}`);
        assert.strictEqual(
          observedRequests.length,
          before + 1,
          `Expected exactly one ESI request for ${item.path}`,
        );
        assert.strictEqual(
          observedRequests[observedRequests.length - 1].authorization,
          `Bearer ${TOKEN_A}`,
          `Wrong outbound principal for ${item.path}`,
        );
      }
    });

    await test('character route forwards ESI metadata without inventing local values', async () => {
      const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/orders`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('etag'), '"character-contract-etag"');
      assert.strictEqual(response.headers.get('expires'), 'Tue, 22 Sep 2026 20:00:00 GMT');
      assert.strictEqual(response.headers.get('last-modified'), 'Tue, 22 Sep 2026 19:00:00 GMT');
      assert.strictEqual(response.headers.get('cache-control'), 'private, max-age=60');
      assert.strictEqual(response.headers.get('x-pages'), '3');
      assert.strictEqual(response.headers.get('x-compatibility-date'), '2026-09-22');
      assert.strictEqual(response.headers.get('x-esi-error-limit-remain'), '98');
      assert.strictEqual(response.headers.get('x-esi-error-limit-reset'), '44');
      assert.strictEqual(response.headers.get('x-ratelimit-group'), 'character');
      assert.strictEqual(response.headers.get('x-ratelimit-limit'), '100');
      assert.strictEqual(response.headers.get('x-ratelimit-remaining'), '97');
      assert.strictEqual(response.headers.get('x-ratelimit-used'), '3');
    });

    await test('bearer parsing accepts scheme case and repeated whitespace', async () => {
      for (const authorization of [
        `Bearer ${TOKEN_A}`,
        `bearer ${TOKEN_A}`,
        `BEARER ${TOKEN_A}`,
        `Bearer    ${TOKEN_A}`,
      ]) {
        const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/wallet`, {
          headers: { Authorization: authorization },
        });
        assert.strictEqual(response.status, 200, `Expected valid bearer form: ${authorization}`);
      }
    });

    await test('invalid authorization schemes are rejected before ESI is called', async () => {
      const invalid = [
        'Basic dGVzdA==',
        'Token abc',
        'Digest username=test',
        'Bearer',
        'Bearer   ',
        'Bearer\\t',
      ];

      for (const authorization of invalid) {
        const before = observedRequests.length;
        const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/wallet`, {
          headers: { Authorization: authorization },
        });

        assert.strictEqual(response.status, 401, `Expected 401 for ${authorization}`);
        assert.strictEqual(observedRequests.length, before, 'Invalid authorization must not reach ESI');
      }
    });

    await test('character identifiers are validated strictly at the HTTP boundary', async () => {
      for (const id of ['0', '-1', '1.5', 'abc', '001001']) {
        const before = observedRequests.length;
        const response = await fetch(baseUrl + `/api/character/${id}/wallet`, {
          headers: { Authorization: `Bearer ${TOKEN_A}` },
        });
        assert.strictEqual(response.status, 400, `Expected 400 for character id ${id}`);
        const body = await readJson(response);
        assert.strictEqual(body.error, 'INVALID_CHARACTER_ID');
        assert.strictEqual(observedRequests.length, before, 'Invalid character id must not reach ESI');
      }
    });

    await test('credential isolation is preserved across simultaneous characters', async () => {
      const responses = await Promise.all([
        fetch(baseUrl + `/api/character/${CHARACTER_A}/orders`, {
          headers: { Authorization: `Bearer ${TOKEN_A}` },
        }),
        fetch(baseUrl + `/api/character/${CHARACTER_B}/orders`, {
          headers: { Authorization: `Bearer ${TOKEN_B}` },
        }),
      ]);

      assert.strictEqual(responses[0].status, 200);
      assert.strictEqual(responses[1].status, 200);
      assert(observedRequests.some((r) => r.path === `/characters/${CHARACTER_A}/orders/` && r.authorization === `Bearer ${TOKEN_A}`));
      assert(observedRequests.some((r) => r.path === `/characters/${CHARACTER_B}/orders/` && r.authorization === `Bearer ${TOKEN_B}`));
      assert(!observedRequests.some((r) => r.path === `/characters/${CHARACTER_B}/orders/` && r.authorization === `Bearer ${TOKEN_A}`));
    });

    await test('public character identity never forwards the caller credential', async () => {
      const before = observedRequests.length;
      const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/corporation`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      });

      assert.strictEqual(response.status, 200);
      const body = await readJson(response);
      assert.strictEqual(body.corporation_id, CORPORATION_ID);

      const identityCalls = observedRequests.slice(before).filter((r) => r.path === `/characters/${CHARACTER_A}/`);
      assert.strictEqual(identityCalls.length, 1);
      assert.strictEqual(identityCalls[0].authorization, undefined);
    });

    await test('corporation route keeps negative wallet balances intact without changing the legacy path', async () => {
      const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/corporation/wallets`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      });

      assert.strictEqual(response.status, 200);
      const body = await readJson(response);
      assert.strictEqual(body.corporation_id, CORPORATION_ID);
      assert.strictEqual(body.wallets[0].division, 1);
      assert.strictEqual(body.wallets[0].name, 'Trade');
      assert.strictEqual(body.wallets[0].balance, -2500000);
      assert.strictEqual(body.wallets[1].balance, 7500000.25);
    });

    await test('corporation profile returns the resolved corporation information', async () => {
      const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/corporation`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      });
      assert.strictEqual(response.status, 200);
      const body = await readJson(response);
      assert.strictEqual(body.corporation_name, 'Trade Operations Corporation');
      assert.strictEqual(body.ticker, 'TOC');
      assert.strictEqual(body.member_count, 12);
    });

    await test('ESI route failures are never converted to 200 empty data and preserve retry metadata', async () => {
      const original = characterEsiGateway.fetchWallet;
      try {
        const cases = [
          { status: 401, kind: 'AUTHENTICATION', retryAfter: undefined },
          { status: 403, kind: 'AUTHORIZATION', retryAfter: undefined },
          { status: 404, kind: 'NOT_FOUND', retryAfter: undefined },
          { status: 420, kind: 'RATE_LIMITED', retryAfter: 17 },
          { status: 429, kind: 'RATE_LIMITED', retryAfter: 9 },
          { status: 502, kind: 'TRANSIENT', retryAfter: undefined },
          { status: 503, kind: 'TRANSIENT', retryAfter: undefined },
          { status: 504, kind: 'TIMEOUT', retryAfter: undefined },
        ] as const;

        for (const item of cases) {
          characterEsiGateway.fetchWallet = async () => ({
            ok: false,
            status: item.status,
            data: null,
            error: {
              kind: item.kind,
              status: item.status,
              message: `simulated-${item.status}`,
              retryable: item.kind === 'RATE_LIMITED' || item.kind === 'TRANSIENT' || item.kind === 'TIMEOUT',
              retryAfterSeconds: item.retryAfter,
            },
            metadata: metadata({
              rateLimit: {
                retryAfterSeconds: item.retryAfter,
                errorLimitRemain: 11,
                errorLimitResetSeconds: 23,
              },
            }),
          });

          const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/wallet`, {
            headers: { Authorization: `Bearer ${TOKEN_A}` },
          });

          assert.strictEqual(response.status, item.status);
          const body = await readJson(response);
          assert.strictEqual(body.esi_error_kind, item.kind);
          assert.strictEqual(body.errorLimitRemain, 11);
          assert.strictEqual(body.errorLimitReset, 23);

          if (item.retryAfter !== undefined) {
            assert.strictEqual(response.headers.get('retry-after'), String(item.retryAfter));
          }
        }
      } finally {
        characterEsiGateway.fetchWallet = original;
      }
    });

    await test('a successful ESI result without a payload fails closed', async () => {
      const original = characterEsiGateway.fetchWallet;
      try {
        characterEsiGateway.fetchWallet = async () => ({
          ok: true,
          status: 200,
          data: null,
          metadata: metadata(),
        });

        const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/wallet`, {
          headers: { Authorization: `Bearer ${TOKEN_A}` },
        });

        assert.strictEqual(response.status, 502);
        const body = await readJson(response);
        assert.strictEqual(body.error, 'INVALID_ESI_RESPONSE');
      } finally {
        characterEsiGateway.fetchWallet = original;
      }
    });

    await test('304 remains a cache result and does not become a fake null payload', async () => {
      const original = characterEsiGateway.fetchWallet;
      try {
        characterEsiGateway.fetchWallet = async () => ({
          ok: true,
          status: 304,
          data: null,
          metadata: metadata(),
        });

        const response = await fetch(baseUrl + `/api/character/${CHARACTER_A}/wallet`, {
          headers: { Authorization: `Bearer ${TOKEN_A}` },
        });

        assert.strictEqual(response.status, 304);
        const text = await response.text();
        assert.strictEqual(text, '');
      } finally {
        characterEsiGateway.fetchWallet = original;
      }
    });
  } finally {
    setGlobalEsiMock(null);
    await serverInstance.close();
  }

  console.log('===============================================================');
  console.log(`CHARACTER HTTP CONTRACT SUMMARY: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('===============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((error: unknown) => {
  console.error('Fatal character HTTP contract runner error:', error);
  process.exit(1);
});
