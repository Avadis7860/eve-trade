import crypto from 'crypto';
import express from 'express';

export const EVE_CLIENT_ID = process.env.EVE_CLIENT_ID || '';
export const EVE_CLIENT_SECRET = process.env.EVE_CLIENT_SECRET || '';
export const EVE_CALLBACK_URL = process.env.EVE_CALLBACK_URL?.trim() || '';

export const EVE_SCOPES = [
  'esi-markets.read_character_orders.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-skills.read_skills.v1',
  'publicData',
].join(' ');

export interface OAuthStateEntry {
  createdAt: number;
  redirectUri?: string;
}

export const activeOAuthStates = new Map<string, OAuthStateEntry>();
export const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function generateOAuthState(redirectUri?: string): string {
  const now = Date.now();
  for (const [key, val] of activeOAuthStates.entries()) {
    if (now - val.createdAt > STATE_TTL_MS) {
      activeOAuthStates.delete(key);
    }
  }
  const state = crypto.randomBytes(32).toString('hex');
  activeOAuthStates.set(state, { createdAt: now, redirectUri });
  return state;
}

export function validateAndConsumeOAuthState(state: string | undefined): { isValid: boolean; error?: string } {
  if (!state) {
    return { isValid: false, error: 'MISSING_STATE' };
  }
  const entry = activeOAuthStates.get(state);
  if (!entry) {
    return { isValid: false, error: 'INVALID_OR_EXPIRED_STATE' };
  }
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    activeOAuthStates.delete(state);
    return { isValid: false, error: 'EXPIRED_STATE' };
  }
  activeOAuthStates.delete(state); // One-time token use
  return { isValid: true };
}

export function validateRedirectUri(candidate: string | undefined, req: express.Request): { isValid: boolean; uri: string } {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultUri = EVE_CALLBACK_URL || `${protocol}://${host}/auth/callback`;

  if (!candidate || !candidate.trim()) {
    return { isValid: true, uri: defaultUri };
  }

  const trimmed = candidate.trim();

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

export function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString('binary')
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function renderAuthErrorHtml(title: string, message: string, errorCode: string): string {
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
          <h2>${title}</h2>
          <p>${message}</p>
          <div class="code">CODE: ${errorCode}</div>
          <div>
            <button onclick="window.close()">Fermer la fenêtre</button>
          </div>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'OAUTH_AUTH_ERROR',
              provider: 'eve_sso',
              error: '${errorCode}',
              errorDescription: '${message.replace(/'/g, "\\'")}'
            }, '*');
          }
        </script>
      </body>
    </html>
  `;
}
