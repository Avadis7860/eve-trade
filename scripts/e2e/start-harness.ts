import http from 'node:http';

type CharacterKey = 'alpha' | 'beta';

interface CharacterFixture {
  readonly id: number;
  readonly name: string;
  readonly corporationId: number;
  readonly corporationName: string;
  readonly token: string;
  readonly refreshToken: string;
}

const APP_PORT = Number(process.env.E2E_APP_PORT || 3000);
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 43123);

interface NextAuthControl {
  character: CharacterKey;
  errorCode?: string;
  errorDescription?: string;
  delayMs?: number;
}

let nextAuthControl: NextAuthControl = { character: 'alpha' };

const fixtures: Record<CharacterKey, CharacterFixture> = {
  alpha: {
    id: 1001,
    name: 'E2E Character Alpha',
    corporationId: 99001,
    corporationName: 'E2E Trade Alpha',
    token: 'e2e-access-alpha',
    refreshToken: 'e2e-refresh-alpha',
  },
  beta: {
    id: 1002,
    name: 'E2E Character Beta',
    corporationId: 99002,
    corporationName: 'E2E Trade Beta',
    token: 'e2e-access-beta',
    refreshToken: 'e2e-refresh-beta',
  },
};

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function makeJwt(character: CharacterFixture): string {
  return [
    base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    base64Url(JSON.stringify({
      sub: `CHARACTER:EVE:${character.id}`,
      name: character.name,
    })),
    'e2e-signature',
  ].join('.');
}

const accessTokens: Record<CharacterKey, string> = {
  alpha: makeJwt(fixtures.alpha),
  beta: makeJwt(fixtures.beta),
};

const refreshToCharacter = new Map<string, CharacterKey>([
  [fixtures.alpha.refreshToken, 'alpha'],
  [fixtures.beta.refreshToken, 'beta'],
]);

function json(res: http.ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function redirect(res: http.ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16384) {
        reject(new Error('E2E mock request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function characterFromCode(code: string | null): CharacterKey | null {
  if (code === 'e2e-code-alpha') return 'alpha';
  if (code === 'e2e-code-beta') return 'beta';
  return null;
}

function characterFromAuthorization(value: string | undefined): CharacterKey | null {
  if (!value) return null;
  if (value === `Bearer ${accessTokens.alpha}`) return 'alpha';
  if (value === `Bearer ${accessTokens.beta}`) return 'beta';
  if (value === `Bearer ${fixtures.alpha.token}`) return 'alpha';
  if (value === `Bearer ${fixtures.beta.token}`) return 'beta';
  return null;
}

function resolveCharacterById(id: number): CharacterFixture | null {
  if (id === fixtures.alpha.id) return fixtures.alpha;
  if (id === fixtures.beta.id) return fixtures.beta;
  return null;
}

async function handleMock(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1:' + MOCK_PORT);

  if (req.method === 'POST' && url.pathname === '/__control__/next-auth') {
    let body: unknown = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: 'INVALID_CONTROL_PAYLOAD' });
    }

    const control = body as Partial<NextAuthControl>;
    const character =
      control.character === 'beta' ? 'beta' :
      control.character === 'alpha' ? 'alpha' : null;
    if (!character) {
      return json(res, 400, { error: 'INVALID_CHARACTER' });
    }

    const delayMs = Number.isFinite(control.delayMs)
      ? Math.min(Math.max(Number(control.delayMs), 0), 10_000)
      : 0;

    nextAuthControl = {
      character,
      errorCode: typeof control.errorCode === 'string' && control.errorCode.trim()
        ? control.errorCode.trim()
        : undefined,
      errorDescription: typeof control.errorDescription === 'string' && control.errorDescription.trim()
        ? control.errorDescription.trim()
        : undefined,
      delayMs,
    };
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/__control__/reset') {
    nextAuthControl = { character: 'alpha' };
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'eve-trade-e2e-mock' });
  }

  if (req.method === 'GET' && url.pathname === '/v2/oauth/authorize/') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (!redirectUri || !state) {
      return json(res, 400, { error: 'MISSING_OAUTH_PARAMETERS' });
    }

    const control = nextAuthControl;
    nextAuthControl = { character: 'alpha' };

    if (control.delayMs) {
      await new Promise(resolve => setTimeout(resolve, control.delayMs));
    }

    const key = control.character;
    const callback = new URL(redirectUri);
    callback.searchParams.set('state', state);

    if (control.errorCode) {
      callback.searchParams.set('error', control.errorCode);
      callback.searchParams.set(
        'error_description',
        control.errorDescription || 'E2E deterministic OAuth failure',
      );
    } else {
      callback.searchParams.set('code', 'e2e-code-' + key);
    }
    return redirect(res, callback.toString());
  }

  if (req.method === 'POST' && url.pathname === '/v2/oauth/token') {
    const body = new URLSearchParams(await readBody(req));
    const grantType = body.get('grant_type');

    if (grantType === 'authorization_code') {
      const character = characterFromCode(body.get('code'));
      if (!character) return json(res, 400, { error: 'INVALID_GRANT' });
      const fixture = fixtures[character];
      return json(res, 200, {
        access_token: accessTokens[character],
        refresh_token: fixture.refreshToken,
        token_type: 'Bearer',
        expires_in: 1200,
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = body.get('refresh_token');
      const character = refreshToken ? refreshToCharacter.get(refreshToken) : undefined;
      if (!character) return json(res, 400, { error: 'INVALID_REFRESH_TOKEN' });
      const fixture = fixtures[character];
      return json(res, 200, {
        access_token: accessTokens[character],
        refresh_token: fixture.refreshToken,
        token_type: 'Bearer',
        expires_in: 1200,
      });
    }

    return json(res, 400, { error: 'UNSUPPORTED_GRANT' });
  }

  if (req.method === 'GET' && url.pathname === '/oauth/verify') {
    const character = characterFromAuthorization(req.headers.authorization);
    if (!character) return json(res, 401, { error: 'INVALID_TOKEN' });
    const fixture = fixtures[character];
    return json(res, 200, {
      CharacterID: fixture.id,
      CharacterName: fixture.name,
    });
  }

  if (!url.pathname.startsWith('/latest/')) {
    return json(res, 404, { error: 'NOT_FOUND' });
  }

  const esiPath = url.pathname.slice('/latest'.length);
  const authCharacter = characterFromAuthorization(req.headers.authorization);

  const characterMatch = esiPath.match(/^\/characters\/(\d+)\/$/);
  if (characterMatch && req.method === 'GET') {
    const fixture = resolveCharacterById(Number(characterMatch[1]));
    if (!fixture) return json(res, 404, { error: 'CHARACTER_NOT_FOUND' });
    return json(res, 200, {
      character_id: fixture.id,
      corporation_id: fixture.corporationId,
      name: fixture.name,
    });
  }

  const corpMatch = esiPath.match(/^\/corporations\/(\d+)\/$/);
  if (corpMatch && req.method === 'GET') {
    const corpId = Number(corpMatch[1]);
    const fixture = Object.values(fixtures).find(item => item.corporationId === corpId);
    if (!fixture) return json(res, 404, { error: 'CORPORATION_NOT_FOUND' });
    return json(res, 200, {
      corporation_id: fixture.corporationId,
      name: fixture.corporationName,
      ticker: fixture === fixtures.alpha ? 'E2EA' : 'E2EB',
      member_count: 2,
    });
  }

  const privateCharacterMatch = esiPath.match(
    /^\/characters\/(\d+)\/(orders|skills|wallet|wallet\/transactions|wallet\/journal)\/$/,
  );
  if (privateCharacterMatch && req.method === 'GET') {
    const characterId = Number(privateCharacterMatch[1]);
    const fixture = resolveCharacterById(characterId);
    if (!fixture || !authCharacter || authCharacter !== (fixture === fixtures.alpha ? 'alpha' : 'beta')) {
      return json(res, 403, { error: 'CHARACTER_CREDENTIAL_ISOLATION_FAILURE' });
    }

    const resource = privateCharacterMatch[2];
    if (resource === 'wallet') return json(res, 200, 1234567.5);
    if (resource === 'skills') {
      return json(res, 200, {
        skills: [
          { skill_id: 3443, active_skill_level: 5 },
          { skill_id: 3444, active_skill_level: 5 },
        ],
        total_sp: 123456789,
      });
    }
    if (resource === 'wallet/transactions') return json(res, 200, []);
    if (resource === 'wallet/journal') return json(res, 200, []);
    return json(res, 200, [
      {
        order_id: fixture === fixtures.alpha ? 501 : 601,
        type_id: fixture === fixtures.alpha ? 34 : 35,
        region_id: 10000002,
        system_id: 30000142,
        location_id: 60003760,
        price: fixture === fixtures.alpha ? 100 : 200,
        volume_remain: fixture === fixtures.alpha ? 10 : 20,
        volume_total: fixture === fixtures.alpha ? 10 : 20,
        min_volume: 1,
        is_buy_order: false,
        range: 'region',
        issued: '2026-09-23T00:00:00.000Z',
        duration: 90,
      },
    ], { 'X-Pages': '1' });
  }

  const corpOrdersMatch = esiPath.match(/^\/corporations\/(\d+)\/orders\/$/);
  if (corpOrdersMatch && req.method === 'GET') {
    const corpId = Number(corpOrdersMatch[1]);
    const fixture = Object.values(fixtures).find(item => item.corporationId === corpId);
    const expected = fixture ? (fixture === fixtures.alpha ? 'alpha' : 'beta') : null;
    if (!fixture || !authCharacter || authCharacter !== expected) {
      return json(res, 403, { error: 'CORPORATION_CREDENTIAL_ISOLATION_FAILURE' });
    }
    return json(res, 200, [
      {
        order_id: fixture === fixtures.alpha ? 71001 : 72001,
        type_id: fixture === fixtures.alpha ? 34 : 35,
        region_id: 10000002,
        system_id: 30000142,
        location_id: 60003760,
        price: fixture === fixtures.alpha ? 99 : 199,
        volume_remain: 5,
        volume_total: 5,
        is_buy_order: false,
        issued: '2026-09-23T00:00:00.000Z',
        duration: 90,
        is_corporation: true,
      },
    ], { 'X-Pages': '1' });
  }

  const corpHistoryMatch = esiPath.match(/^\/corporations\/(\d+)\/orders\/history\/$/);
  if (corpHistoryMatch && req.method === 'GET') {
    const corpId = Number(corpHistoryMatch[1]);
    const fixture = Object.values(fixtures).find(item => item.corporationId === corpId);
    const expected = fixture ? (fixture === fixtures.alpha ? 'alpha' : 'beta') : null;
    if (!fixture || !authCharacter || authCharacter !== expected) {
      return json(res, 403, { error: 'CORPORATION_CREDENTIAL_ISOLATION_FAILURE' });
    }
    return json(res, 200, []);
  }

  return json(res, 404, { error: 'UNMOCKED_ESI_ROUTE', path: esiPath });
}

const mockServer = http.createServer((req, res) => {
  handleMock(req, res).catch(error => {
    console.error('[E2E-MOCK] request failure', error);
    if (!res.headersSent) json(res, 500, { error: 'MOCK_INTERNAL_ERROR' });
    else res.end();
  });
});

await new Promise<void>((resolve, reject) => {
  mockServer.once('error', reject);
  mockServer.listen(MOCK_PORT, '127.0.0.1', () => resolve());
});

process.env.EVE_SSO_AUTHORIZE_URL = `http://127.0.0.1:${MOCK_PORT}/v2/oauth/authorize/`;
process.env.EVE_SSO_TOKEN_URL = `http://127.0.0.1:${MOCK_PORT}/v2/oauth/token`;
process.env.EVE_SSO_VERIFY_URL = `http://127.0.0.1:${MOCK_PORT}/oauth/verify`;
process.env.ESI_BASE_URL = `http://127.0.0.1:${MOCK_PORT}/latest`;
process.env.E2E_OAUTH_STATE_TTL_MS = process.env.E2E_OAUTH_STATE_TTL_MS || '1000';
process.env.EVE_CLIENT_ID = process.env.EVE_CLIENT_ID || 'e2e-deterministic-client';
process.env.EVE_CLIENT_SECRET = process.env.EVE_CLIENT_SECRET || 'e2e-deterministic-secret';
process.env.EVE_CALLBACK_URL = process.env.EVE_CALLBACK_URL || `http://127.0.0.1:${APP_PORT}/auth/callback`;

const { startServer } = await import('../../server.ts');
const appServer = await startServer(APP_PORT);

console.log(`E2E_HARNESS_READY http://127.0.0.1:${APP_PORT}`);
console.log(`E2E_MOCK_READY http://127.0.0.1:${MOCK_PORT}`);

async function shutdown(): Promise<void> {
  await Promise.all([
    new Promise<void>(resolve => appServer.close(() => resolve())),
    new Promise<void>(resolve => mockServer.close(() => resolve())),
  ]);
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
