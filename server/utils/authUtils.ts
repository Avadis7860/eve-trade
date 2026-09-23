import crypto from 'crypto';
import express from 'express';
import {
  ESI_RUNTIME_CONFIG,
} from '../config/environment';

// Canonical server-side runtime configuration. Values are resolved once here;
// consumers must not read EVE_* process variables directly.
export const EVE_CLIENT_ID = ESI_RUNTIME_CONFIG.clientId;
export const EVE_CLIENT_SECRET = ESI_RUNTIME_CONFIG.clientSecret;
export const EVE_CALLBACK_URL = ESI_RUNTIME_CONFIG.callbackUrl;

// Upstream EVE SSO endpoints. Production defaults remain CCP; local E2E can
// point these boundaries at deterministic fixtures without changing the flow.
export const EVE_SSO_METADATA_URL = ESI_RUNTIME_CONFIG.metadataUrl;

export { getRuntimeConfigStatus, assertOAuthRuntimeConfig } from '../config/environment';

export const EVE_SCOPES = [
  'esi-markets.read_character_orders.v1',
  'esi-markets.read_corporation_orders.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-corporations.read_divisions.v1',
  'esi-skills.read_skills.v1',
  'publicData',
].join(' ');

export interface OAuthStateEntry {
  createdAt: number;
  redirectUri?: string;
}

export const activeOAuthStates = new Map<string, OAuthStateEntry>();
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const configuredStateTtlMs = Number(process.env.E2E_OAUTH_STATE_TTL_MS);
export const STATE_TTL_MS =
  Number.isFinite(configuredStateTtlMs) && configuredStateTtlMs >= 1000
    ? configuredStateTtlMs
    : DEFAULT_STATE_TTL_MS; // 10 minutes in production; shortened only by deterministic E2E harness
export const MAX_ACTIVE_STATES = 5000; // Limit memory consumption under high load

// Periodic cleanup of expired OAuth states
const stateGcInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of activeOAuthStates.entries()) {
    if (now - val.createdAt > STATE_TTL_MS) {
      activeOAuthStates.delete(key);
    }
  }
}, 60000);
if (stateGcInterval && typeof stateGcInterval.unref === 'function') {
  stateGcInterval.unref();
}

/**
 * Escapes characters for safe HTML interpolation
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Safely serializes data to JSON for embedding within inline <script> tags.
 * Neutralizes '</script>' and script-breaking characters by encoding '<', '>', '&'
 * as Unicode escapes (\u003c, \u003e, \u0026) and escaping line/paragraph separators.
 */
export function safeJsonStringify(val: any): string {
  if (val === undefined) return 'null';
  return JSON.stringify(val)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Validates whether an incoming HTTP Origin header is authorized for CORS.
 * Enforces strict origin checking against:
 * 1. Current request host origin (same-host origin, both http and https)
 * 2. Explicitly configured EVE_CALLBACK_URL origin
 * 3. Whitelisted environment origins (ALLOWED_ORIGINS or CORS_ORIGIN)
 * 4. Standard local development origins (localhost:3000, 127.0.0.1:3000, localhost:5173, localhost:8000)
 */
export function isAllowedOrigin(origin: string | undefined, req?: express.Request): boolean {
  if (!origin || typeof origin !== 'string') return false;

  const trimmed = origin.trim().replace(/\/+$/, '');
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    const normalized = `${parsed.protocol}//${parsed.host}`;

    // 1. Current request host origin (same-host origin)
    if (req) {
      const host = req.get('host');
      if (host) {
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        if (
          normalized === `${protocol}://${host}` ||
          normalized === `http://${host}` ||
          normalized === `https://${host}`
        ) {
          return true;
        }
      }
    }

    // 2. Configured EVE_CALLBACK_URL origin
    if (EVE_CALLBACK_URL) {
      try {
        const cbOrigin = new URL(EVE_CALLBACK_URL).origin;
        if (normalized === cbOrigin) {
          return true;
        }
      } catch {}
    }

    // 3. Configured environment origins (ALLOWED_ORIGINS or CORS_ORIGIN, comma-separated)
    const envOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN;
    if (envOrigins) {
      const list = envOrigins.split(',').map((s) => s.trim().replace(/\/+$/, ''));
      for (const item of list) {
        if (!item) continue;
        try {
          if (normalized === new URL(item).origin) {
            return true;
          }
        } catch {}
      }
    }

    // 4. Default allowed local development origins
    const defaultAllowed = new Set<string>([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://0.0.0.0:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8000',
      'http://127.0.0.1:8000',
    ]);

    if (defaultAllowed.has(normalized)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function generateOAuthState(redirectUri?: string): string {
  const now = Date.now();

  // Purge expired states
  for (const [key, val] of activeOAuthStates.entries()) {
    if (now - val.createdAt > STATE_TTL_MS) {
      activeOAuthStates.delete(key);
    }
  }

  // Enforce capacity bounds (evict oldest if full)
  if (activeOAuthStates.size >= MAX_ACTIVE_STATES) {
    const oldestKey = activeOAuthStates.keys().next().value;
    if (oldestKey) {
      activeOAuthStates.delete(oldestKey);
    }
  }

  const state = crypto.randomBytes(32).toString('hex');
  activeOAuthStates.set(state, { createdAt: now, redirectUri });
  return state;
}

export function validateAndConsumeOAuthState(
  state: string | undefined,
  expectedRedirectUri?: string
): { isValid: boolean; error?: string; redirectUri?: string } {
  if (!state || typeof state !== 'string') {
    return { isValid: false, error: 'MISSING_STATE' };
  }

  const trimmedState = state.trim();

  // Strict format validation: 64-character hex string
  if (!/^[0-9a-fA-F]{64}$/.test(trimmedState)) {
    return { isValid: false, error: 'INVALID_OR_EXPIRED_STATE' };
  }

  const entry = activeOAuthStates.get(trimmedState);
  if (!entry) {
    return { isValid: false, error: 'INVALID_OR_EXPIRED_STATE' };
  }

  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    activeOAuthStates.delete(trimmedState);
    return { isValid: false, error: 'EXPIRED_STATE' };
  }

  // One-time consumption: delete state immediately to prevent replay
  activeOAuthStates.delete(trimmedState);

  // If redirectUri was bound at generation time, verify match if expectedRedirectUri is supplied
  if (expectedRedirectUri && entry.redirectUri) {
    const normalizedExpected = expectedRedirectUri.trim();
    const normalizedStored = entry.redirectUri.trim();
    if (normalizedExpected !== normalizedStored) {
      return { isValid: false, error: 'REDIRECT_URI_MISMATCH', redirectUri: entry.redirectUri };
    }
  }

  return { isValid: true, redirectUri: entry.redirectUri };
}

export function validateRedirectUri(candidate: string | undefined, req: express.Request): { isValid: boolean; uri: string } {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultUri = EVE_CALLBACK_URL || `${protocol}://${host}/auth/callback`;

  if (!candidate || typeof candidate !== 'string' || !candidate.trim()) {
    return { isValid: true, uri: defaultUri };
  }

  const trimmed = candidate.trim();

  // Prevent overly long or malicious URIs
  if (trimmed.length > 2048) {
    return { isValid: false, uri: defaultUri };
  }

  // Whitelisted exact URIs
  const allowedExact = new Set<string>([
    defaultUri,
    `${protocol}://${host}/auth/callback`,
    `${protocol}://${host}/callback`,
    'http://localhost:8000/callback',
    'http://localhost:3000/auth/callback',
    'http://localhost:3000/callback',
  ]);
  if (EVE_CALLBACK_URL) {
    allowedExact.add(EVE_CALLBACK_URL);
  }

  if (allowedExact.has(trimmed)) {
    return { isValid: true, uri: trimmed };
  }

  // Origin-matching callback checks
  try {
    const parsed = new URL(trimmed);
    const parsedOrigin = `${parsed.protocol}//${parsed.host}`;
    const serverOrigin = `${protocol}://${host}`;
    if (parsedOrigin === serverOrigin && (parsed.pathname === '/auth/callback' || parsed.pathname === '/callback')) {
      return { isValid: true, uri: trimmed };
    }
  } catch {}

  return { isValid: false, uri: defaultUri };
}


export interface EveSsoMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let cachedEveSsoMetadata: { expiresAt: number; value: EveSsoMetadata } | null = null;
let cachedEveJwks: { expiresAt: number; keys: EveJwksKey[]; jwksUri: string } | null = null;
const EVE_SSO_CACHE_TTL_MS = 5 * 60 * 1000;
const EVE_SSO_FETCH_TIMEOUT_MS = 5_000;
const EVE_EXPECTED_ISSUERS = new Set([
  'https://login.eveonline.com/',
  'https://login.eveonline.com',
  'login.eveonline.com',
]);

type EveJwtHeader = { alg?: string; kid?: string; typ?: string };
type EveJwksKey = {
  alg?: string;
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  use?: string;
};

function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EVE_SSO_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function validateSsoMetadata(metadata: EveSsoMetadata): EveSsoMetadata {
  for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof metadata[field] !== 'string' || metadata[field].length === 0) {
      throw new Error(`EVE_SSO_METADATA_INVALID_${field.toUpperCase()}`);
    }
    new URL(metadata[field]);
  }
  if (!EVE_EXPECTED_ISSUERS.has(metadata.issuer)) {
    throw new Error('EVE_SSO_METADATA_ISSUER_INVALID');
  }
  return metadata;
}

export async function getEveSsoMetadata(forceRefresh = false): Promise<EveSsoMetadata> {
  const now = Date.now();
  if (!forceRefresh && cachedEveSsoMetadata && cachedEveSsoMetadata.expiresAt > now) {
    return cachedEveSsoMetadata.value;
  }
  const metadata = validateSsoMetadata(
    await fetchJsonWithTimeout<EveSsoMetadata>(EVE_SSO_METADATA_URL)
  );
  cachedEveSsoMetadata = { expiresAt: now + EVE_SSO_CACHE_TTL_MS, value: metadata };
  return metadata;
}

async function fetchEveJwks(forceRefresh = false): Promise<{ expiresAt: number; keys: EveJwksKey[]; jwksUri: string }> {
  const now = Date.now();
  if (!forceRefresh && cachedEveJwks && cachedEveJwks.expiresAt > now) {
    return cachedEveJwks;
  }
  const metadata = await getEveSsoMetadata(forceRefresh);
  const jwks = await fetchJsonWithTimeout<{ keys?: EveJwksKey[] }>(metadata.jwks_uri);
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new Error('EVE_SSO_JWKS_EMPTY');
  }
  cachedEveJwks = { expiresAt: now + EVE_SSO_CACHE_TTL_MS, keys: jwks.keys, jwksUri: metadata.jwks_uri };
  return cachedEveJwks;
}

/**
 * Verifies an EVE SSO access-token JWT using the signing keys advertised by CCP.
 * Official contract: metadata -> JWKS -> RS256 signature -> issuer/audience/expiration.
 * See https://developers.eveonline.com/docs/services/sso/.
 */
export async function verifyEveAccessToken(token: string): Promise<Record<string, unknown>> {
  if (!token || typeof token !== 'string') throw new Error('EVE_SSO_TOKEN_MISSING');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('EVE_SSO_TOKEN_MALFORMED');

  let header: EveJwtHeader;
  let payload: Record<string, unknown>;
  let signature: Buffer;
  try {
    header = decodeBase64UrlJson<EveJwtHeader>(parts[0]);
    payload = decodeBase64UrlJson<Record<string, unknown>>(parts[1]);
    signature = Buffer.from(parts[2], 'base64url');
  } catch {
    throw new Error('EVE_SSO_TOKEN_MALFORMED');
  }

  if (header.alg !== 'RS256' || !header.kid || signature.length === 0) {
    throw new Error('EVE_SSO_TOKEN_UNSUPPORTED_ALGORITHM');
  }

  const loadKey = async (forceRefresh: boolean): Promise<EveJwksKey> => {
    const jwks = await fetchEveJwks(forceRefresh);
    const key = jwks.keys.find(item =>
      item.kid === header.kid &&
      item.alg === header.alg &&
      item.kty === 'RSA' &&
      typeof item.n === 'string' &&
      typeof item.e === 'string'
    );
    if (!key) throw new Error('EVE_SSO_SIGNING_KEY_NOT_FOUND');
    return key;
  };

  let key: EveJwksKey;
  try {
    key = await loadKey(false);
  } catch (error) {
    if (!String(error).includes('EVE_SSO_SIGNING_KEY_NOT_FOUND')) throw error;
    cachedEveJwks = null;
    key = await loadKey(true);
  }

  const publicKey = crypto.createPublicKey({
    key: key as JsonWebKey,
    format: 'jwk',
  });
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'),
    publicKey,
    signature
  );
  if (!verified) throw new Error('EVE_SSO_SIGNATURE_INVALID');

  if (typeof payload.iss !== 'string' || !EVE_EXPECTED_ISSUERS.has(payload.iss)) {
    throw new Error('EVE_SSO_ISSUER_INVALID');
  }
  if (!Array.isArray(payload.aud) || !payload.aud.includes(EVE_CLIENT_ID) || !payload.aud.includes('EVE Online')) {
    throw new Error('EVE_SSO_AUDIENCE_INVALID');
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('EVE_SSO_TOKEN_EXPIRED');
  }
  if (typeof payload.sub !== 'string' || !/^CHARACTER:EVE:\\d+$/.test(payload.sub)) {
    throw new Error('EVE_SSO_SUBJECT_INVALID');
  }

  return payload;
}

export function renderAuthErrorHtml(title: string, message: string, errorCode: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeCode = escapeHtml(errorCode);

  const payloadJson = safeJsonStringify({
    type: 'OAUTH_AUTH_ERROR',
    provider: 'eve_sso',
    error: errorCode,
    errorDescription: message,
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>EVE SSO — Erreur de Sécurité</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0e1117;
            color: #fafafa;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: #161821;
            border: 1px solid rgba(255, 75, 75, 0.4);
            padding: 28px 32px;
            border-radius: 12px;
            text-align: center;
            max-width: 440px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          }
          .icon {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(255, 75, 75, 0.15);
            border: 2px solid #ff4b4b;
            color: #ff4b4b;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            font-weight: bold;
            margin: 0 auto 16px;
          }
          h2 { margin: 0 0 8px; font-size: 18px; color: #ff6b6b; }
          p { margin: 0 0 16px; font-size: 13px; color: #a0a4b5; line-height: 1.5; }
          .code { font-family: monospace; font-size: 11px; color: #ff8888; background: #261618; padding: 4px 8px; border-radius: 4px; display: inline-block; }
          button {
            margin-top: 18px;
            background: #262730;
            color: #fafafa;
            border: 1px solid #3a3d4d;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✕</div>
          <h2>${safeTitle}</h2>
          <p>${safeMessage}</p>
          <div class="code">CODE: ${safeCode}</div>
          <div>
            <button onclick="window.close()">Fermer la fenêtre</button>
          </div>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage(${payloadJson}, window.location.origin);
          }
        </script>
      </body>
    </html>
  `;
}
