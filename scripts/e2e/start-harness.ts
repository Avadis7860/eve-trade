import http from 'node:http';
import crypto from 'node:crypto';

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

type MarketControlMode = 'live' | 'error' | 'partial';
type OperationsDecisionScenario = 'default' | 'keep' | 'adjust' | 'relocate' | 'cancel';

interface MarketControl {
  mode: MarketControlMode;
  errorStatus: 401 | 403 | 429 | 500;
}

let nextAuthControl: NextAuthControl = { character: 'alpha' };
let marketControl: MarketControl = { mode: 'live', errorStatus: 401 };
let operationsDecisionScenario: OperationsDecisionScenario = 'default';
type MarketEsiGatewayInstance = typeof import('../../server/gateways/marketEsiGateway').marketEsiGateway;
let marketEsiGatewayControl: MarketEsiGatewayInstance | null = null;

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

const E2E_CLIENT_ID = 'e2e-deterministic-client';
const E2E_KEY_ID = 'e2e-sso-key';
const { privateKey: e2eSigningKey, publicKey: e2ePublicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const e2ePublicJwk = {
  ...(e2ePublicKey.export({ format: 'jwk' }) as Record<string, string>),
  kid: E2E_KEY_ID,
  alg: 'RS256',
  use: 'sig',
};

function makeJwt(character: CharacterFixture): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: E2E_KEY_ID }));
  const payload = base64Url(JSON.stringify({
    iss: 'https://login.eveonline.com/',
    sub: `CHARACTER:EVE:${character.id}`,
    name: character.name,
    aud: [E2E_CLIENT_ID, 'EVE Online'],
    scp: ['esi-markets.read_character_orders.v1'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 1200,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), e2eSigningKey).toString('base64url');
  return `${signingInput}.${signature}`;
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
    marketControl = { mode: 'live', errorStatus: 401 };
    operationsDecisionScenario = 'default';
    marketEsiGatewayControl?.clearCache();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/__control__/operations') {
    let body: unknown = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: 'INVALID_CONTROL_PAYLOAD' });
    }

    const control = body as { scenario?: OperationsDecisionScenario };
    const scenario =
      control.scenario === 'keep' ||
      control.scenario === 'adjust' ||
      control.scenario === 'relocate' ||
      control.scenario === 'cancel'
        ? control.scenario
        : control.scenario === 'default'
          ? 'default'
          : null;

    if (!scenario) {
      return json(res, 400, { error: 'INVALID_OPERATIONS_SCENARIO' });
    }

    operationsDecisionScenario = scenario;
    marketEsiGateway.clearCache();
    return json(res, 200, { ok: true, operations: { scenario } });
  }

  if (req.method === 'POST' && url.pathname === '/__control__/market') {
    let body: unknown = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: 'INVALID_CONTROL_PAYLOAD' });
    }

    const control = body as Partial<MarketControl>;
    const mode =
      control.mode === 'error' || control.mode === 'partial' || control.mode === 'live'
        ? control.mode
        : null;
    if (!mode) {
      return json(res, 400, { error: 'INVALID_MARKET_MODE' });
    }

    const status =
      control.errorStatus === 403 || control.errorStatus === 429 || control.errorStatus === 500
        ? control.errorStatus
        : 401;

    marketControl = { mode, errorStatus: status };
    marketEsiGateway.clearCache();
    return json(res, 200, { ok: true, market: marketControl });
  }

  if (req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
    return json(res, 200, {
      issuer: 'https://login.eveonline.com/',
      authorization_endpoint: `http://127.0.0.1:${MOCK_PORT}/v2/oauth/authorize/`,
      token_endpoint: `http://127.0.0.1:${MOCK_PORT}/v2/oauth/token`,
      jwks_uri: `http://127.0.0.1:${MOCK_PORT}/oauth/jwks`,
    });
  }

  if (req.method === 'GET' && url.pathname === '/oauth/jwks') {
    return json(res, 200, { keys: [e2ePublicJwk] });
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

  const preCompatibilityMatch = url.pathname.match(/^\/markets\/(\d+)\/orders\/$/);
  if (preCompatibilityMatch && req.method === 'GET') {
    const regionId = Number(preCompatibilityMatch[1]);
    const typeId = Number(url.searchParams.get('type_id') || 0);
    const page = Number(url.searchParams.get('page') || 1);

    if (marketControl.mode === 'error') {
      return json(
        res,
        marketControl.errorStatus,
        { error: 'E2E_CONTROLLED_MARKET_FAILURE', region_id: regionId, type_id: typeId, page },
        {
          'X-Cache-Status': 'MISS',
          'X-Pages': '1',
          'X-ESI-Error-Limit-Remain': '91',
          'X-ESI-Error-Limit-Reset': '42',
          ...(marketControl.errorStatus === 429 ? { 'Retry-After': '7' } : {}),
        },
      );
    }

    if (marketControl.mode === 'partial' && page > 1) {
      return json(
        res,
        401,
        { error: 'E2E_CONTROLLED_MARKET_PARTIAL_FAILURE', region_id: regionId, type_id: typeId, page },
        {
          'X-Cache-Status': 'MISS',
          'X-Pages': '2',
          'X-ESI-Error-Limit-Remain': '90',
          'X-ESI-Error-Limit-Reset': '41',
        },
      );
    }

    const currentOrderPrice =
      operationsDecisionScenario === 'keep' ? 100 :
      operationsDecisionScenario === 'adjust' ? 100 :
      operationsDecisionScenario === 'relocate' ? 100 :
      operationsDecisionScenario === 'cancel' ? 100 :
      (typeId === 34 ? 100 : 200);
    const currentOrderVolume =
      operationsDecisionScenario === 'relocate' ? 100_000 :
      operationsDecisionScenario === 'cancel' ? 1_000 :
      (typeId === 34 ? 10 : 20);
    const currentCompetingSellPrice =
      operationsDecisionScenario === 'keep' ? 101 :
      operationsDecisionScenario === 'adjust' ? 95 :
      operationsDecisionScenario === 'cancel' ? 10 :
      operationsDecisionScenario === 'relocate' ? 110 :
      (typeId === 34 ? 95 : 195);
    const regionalOrders =
      operationsDecisionScenario === 'relocate' && regionId === 10000043
        ? [
            {
              order_id: 9401,
              type_id: typeId,
              region_id: regionId,
              system_id: 30002187,
              location_id: 60008494,
              price: 200,
              volume_remain: 100_000,
              volume_total: 100_000,
              min_volume: 1,
              is_buy_order: false,
              range: 'region',
              issued: '2026-09-23T00:00:00.000Z',
              duration: 90,
            },
          ]
        : [
            {
              order_id: typeId === 34 ? 501 : 601,
              type_id: typeId,
              region_id: regionId,
              system_id: 30000142,
              location_id: 60003760,
              price: currentOrderPrice,
              volume_remain: currentOrderVolume,
              volume_total: currentOrderVolume,
              min_volume: 1,
              is_buy_order: false,
              range: 'region',
              issued: '2026-09-23T00:00:00.000Z',
              duration: 90,
            },
            {
              order_id: typeId === 34 ? 502 : 602,
              type_id: typeId,
              region_id: regionId,
              system_id: 30000142,
              location_id: 60003760,
              price: currentCompetingSellPrice,
              volume_remain: 25,
              volume_total: 25,
              min_volume: 1,
              is_buy_order: false,
              range: 'region',
              issued: '2026-09-23T00:00:00.000Z',
              duration: 90,
            },
            {
              order_id: typeId === 34 ? 503 : 603,
              type_id: typeId,
              region_id: regionId,
              system_id: 30000142,
              location_id: 60003760,
              price: 90,
              volume_remain: 100,
              volume_total: 100,
              min_volume: 1,
              is_buy_order: true,
              range: 'region',
              issued: '2026-09-23T00:00:00.000Z',
              duration: 90,
            },
          ];

    if (marketControl.mode === 'partial') {
      return json(
        res,
        200,
        regionalOrders,
        {
          'X-Cache-Status': 'MISS',
          'X-Pages': '2',
          'X-ESI-Error-Limit-Remain': '92',
          'X-ESI-Error-Limit-Reset': '43',
        },
      );
    }

    return json(
      res,
      200,
      regionalOrders,
      {
        'X-Cache-Status': 'MISS',
        'X-Pages': '1',
        'X-ESI-Error-Limit-Remain': '93',
        'X-ESI-Error-Limit-Reset': '44',
      },
    );
  }

  const marketHistoryMatch = url.pathname.match(/^\/markets\/(\d+)\/history\/$/);
  if (marketHistoryMatch && req.method === 'GET') {
    const regionId = Number(marketHistoryMatch[1]);
    const volume = operationsDecisionScenario === 'cancel' && regionId === 10000002 ? 0.1 : 10;
    const history = Array.from({ length: 30 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      order_count: operationsDecisionScenario === 'cancel' && regionId === 10000002 ? 2 : 25,
      volume,
      average: regionId === 10000043 ? 200 : 100,
      highest: regionId === 10000043 ? 205 : 105,
      lowest: regionId === 10000043 ? 195 : 95,
    }));
    return json(res, 200, history);
  }

  const compatibilityDate = req.headers['x-compatibility-date'];
  if (!compatibilityDate || Array.isArray(compatibilityDate)) {
    return json(res, 400, { error: 'MISSING_COMPATIBILITY_DATE' });
  }

  const esiPath = url.pathname;
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
    const orderTypeId = fixture === fixtures.alpha ? 34 : 35;
    const orderVolume =
      operationsDecisionScenario === 'relocate' ? 100_000 :
      operationsDecisionScenario === 'cancel' ? 1_000 :
      (fixture === fixtures.alpha ? 10 : 20);

    return json(res, 200, [
      {
        order_id: fixture === fixtures.alpha ? 501 : 601,
        type_id: orderTypeId,
        region_id: 10000002,
        system_id: 30000142,
        location_id: 60003760,
        price: fixture === fixtures.alpha ? 100 : 200,
        volume_remain: orderVolume,
        volume_total: orderVolume,
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

process.env.EVE_SSO_METADATA_URL = `http://127.0.0.1:${MOCK_PORT}/.well-known/oauth-authorization-server`;
process.env.ESI_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`;
process.env.E2E_OAUTH_STATE_TTL_MS = process.env.E2E_OAUTH_STATE_TTL_MS || '10000';
process.env.EVE_CLIENT_ID = process.env.EVE_CLIENT_ID || E2E_CLIENT_ID;
process.env.EVE_CLIENT_SECRET = process.env.EVE_CLIENT_SECRET || 'e2e-deterministic-secret';
process.env.EVE_CALLBACK_URL = process.env.EVE_CALLBACK_URL || `http://127.0.0.1:${APP_PORT}/auth/callback`;

const { marketEsiGateway } = await import('../../server/gateways/marketEsiGateway');
marketEsiGatewayControl = marketEsiGateway;

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
