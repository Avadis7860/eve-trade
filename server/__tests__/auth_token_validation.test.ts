import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

process.env.EVE_CLIENT_ID = 'jwt-test-client';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...(publicKey.export({ format: 'jwk' }) as Record<string, string>),
  kid: 'jwt-test-key',
  alg: 'RS256',
  use: 'sig',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const port = (server.address() as { port: number }).port;
    res.end(JSON.stringify({
      issuer: 'https://login.eveonline.com/',
      authorization_endpoint: `http://127.0.0.1:${port}/authorize`,
      token_endpoint: `http://127.0.0.1:${port}/token`,
      jwks_uri: `http://127.0.0.1:${port}/jwks`,
    }));
    return;
  }
  if (url.pathname === '/jwks') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [publicJwk] }));
    return;
  }
  res.writeHead(404);
  res.end();
});

function makeToken(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'jwt-test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://login.eveonline.com/',
    sub: 'CHARACTER:EVE:42424242',
    name: 'JWT Validation Pilot',
    aud: ['jwt-test-client', 'EVE Online'],
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input, 'ascii'), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
process.env.EVE_SSO_METADATA_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/.well-known/oauth-authorization-server`;

const { verifyEveAccessToken } = await import('../utils/authUtils');

try {
  const valid = await verifyEveAccessToken(makeToken());
  assert.equal(valid.sub, 'CHARACTER:EVE:42424242');

  await assert.rejects(() => verifyEveAccessToken(makeToken({ iss: 'https://evil.example/' })), /EVE_SSO_ISSUER_INVALID/);
  await assert.rejects(() => verifyEveAccessToken(makeToken({ aud: ['jwt-test-client'] })), /EVE_SSO_AUDIENCE_INVALID/);
  await assert.rejects(() => verifyEveAccessToken(makeToken({ exp: Math.floor(Date.now() / 1000) - 1 })), /EVE_SSO_TOKEN_EXPIRED/);

  const tampered = makeToken().split('.');
  tampered[1] = Buffer.from(JSON.stringify({
    iss: 'https://login.eveonline.com/',
    sub: 'CHARACTER:EVE:99999999',
    name: 'Tampered',
    aud: ['jwt-test-client', 'EVE Online'],
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');
  await assert.rejects(() => verifyEveAccessToken(tampered.join('.')), /EVE_SSO_SIGNATURE_INVALID/);

  console.log('auth_token_validation.test.ts: PASS');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}
