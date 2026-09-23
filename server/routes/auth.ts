import express, { Router, Request, Response } from 'express';
import { logEvent } from '../utils/logger';
import {
  EVE_CLIENT_ID,
  EVE_CLIENT_SECRET,
  EVE_CALLBACK_URL,
  getEveSsoMetadata,
  verifyEveAccessToken,
  EVE_SCOPES,
  generateOAuthState,
  validateAndConsumeOAuthState,
  validateRedirectUri,
  renderAuthErrorHtml,
  escapeHtml,
  safeJsonStringify,
  activeOAuthStates,
  getRuntimeConfigStatus,
  assertOAuthRuntimeConfig,
  buildOAuthStateCookie,
  buildOAuthStateCookieClear,
  readOAuthStateCookie,
} from '../utils/authUtils';

export const authRouter = Router();

// 1. Auth configuration endpoint
authRouter.get('/config', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const currentOrigin = `${protocol}://${host}`;

  const runtime = getRuntimeConfigStatus();

  res.json({
    client_id: EVE_CLIENT_ID || null,
    has_client_secret: runtime.clientSecretConfigured,
    callback_url_configured: runtime.callbackConfigured,
    callback_url: runtime.callbackUrl,
    scopes: EVE_SCOPES,
    suggested_redirect_uris: [
      ...(EVE_CALLBACK_URL ? [EVE_CALLBACK_URL] : []),
      `${currentOrigin}/auth/callback`,
    ],
    current_origin: currentOrigin,
  });
});

// 2. Auth URL builder (cryptographically random state, strictly whitelisted redirect_uri)
authRouter.get('/url', async (req: Request, res: Response) => {
  const requestedRedirect = req.query.redirect_uri as string | undefined;
  const { isValid, uri: redirectUri } = validateRedirectUri(requestedRedirect, req);

  if (requestedRedirect && !isValid) {
    logEvent('WARN', 'SSO', 'Unauthorized redirect_uri attempted in /api/auth/url - BLOCKED', {
      attempted: requestedRedirect,
    });
    return res.status(400).json({
      error: 'INVALID_REDIRECT_URI',
      message: 'The requested redirect_uri is not whitelisted. Use the configured EVE_CALLBACK_URL or application host callback.',
    });
  }

  if (!EVE_CLIENT_ID) {
    return res.status(503).json({
      error: 'SSO_NOT_CONFIGURED',
      message: 'EVE_CLIENT_ID is required to start CCP SSO.',
    });
  }

  // Cryptographically secure CSRF state
  const state = generateOAuthState(redirectUri);

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    client_id: EVE_CLIENT_ID,
    scope: EVE_SCOPES,
    state: state,
  });

  const metadata = await getEveSsoMetadata().catch(error => {
    logEvent('ERROR', 'SSO', 'Unable to load CCP SSO metadata', { error: String(error) });
    return null;
  });
  if (!metadata) {
    return res.status(503).json({
      error: 'SSO_METADATA_UNAVAILABLE',
      message: 'Unable to load the official EVE SSO metadata document.',
    });
  }

  const url = metadata.authorization_endpoint +
    (metadata.authorization_endpoint.includes('?') ? '&' : '?') +
    params.toString();
  logEvent('INFO', 'SSO', 'Generated SSO authorization URL', { redirectUri, statePrefix: state.substring(0, 8) });
  res.setHeader('Set-Cookie', buildOAuthStateCookie(state, req));
  res.json({ url, redirect_uri: redirectUri, state });
});

// 3. Exchange authorization code for tokens
authRouter.post('/token', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Request body must be a JSON object' });
  }

  let { code, redirect_uri, state } = req.body;

  // Auto-extract code, state, and redirect_uri if user pasted a full URL
  if (typeof code === 'string' && (code.includes('code=') || code.startsWith('http'))) {
    try {
      const urlObj = new URL(code.trim());
      const extracted = urlObj.searchParams.get('code');
      const extractedState = urlObj.searchParams.get('state');
      if (extracted) {
        code = extracted;
        if (extractedState && !state) {
          state = extractedState;
        }
        if (!redirect_uri) {
          redirect_uri = `${urlObj.origin}${urlObj.pathname}`;
        }
      }
    } catch {
      const match = code.match(/code=([^&]+)/);
      if (match) code = decodeURIComponent(match[1]);
      const stateMatch = code.match(/state=([^&]+)/);
      if (stateMatch && !state) state = decodeURIComponent(stateMatch[1]);
    }
  }

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'MISSING_CODE', message: 'Missing or empty code parameter' });
  }

  if (code.length > 4096) {
    return res.status(400).json({ error: 'CODE_TOO_LONG', message: 'Code parameter exceeds maximum allowed length' });
  }

  // The token exchange endpoint is an auxiliary/manual path but must enforce the same browser binding as the callback.
  const browserState = readOAuthStateCookie(req);
  if (!state || typeof state !== 'string' || !state.trim()) {
    return res.status(400).json({
      error: 'MISSING_STATE',
      message: 'Missing or empty state parameter. OAuth state is mandatory for CSRF protection.',
    });
  }

  if (state.length > 128) {
    return res.status(400).json({ error: 'INVALID_STATE', message: 'State parameter must be a string <= 128 characters' });
  }

  if (browserState !== state.trim()) {
    logEvent('WARN', 'SSO', 'Token exchange browser state cookie mismatch - BLOCKED', {
      statePrefix: state.trim().substring(0, 8),
      browserStatePresent: Boolean(browserState),
    });
    return res.status(400).json({
      error: 'BROWSER_STATE_MISMATCH',
      message: 'The OAuth state does not belong to the browser that initiated the SSO flow.',
    });
  }

  if (redirect_uri !== undefined && (typeof redirect_uri !== 'string' || redirect_uri.length > 2048)) {
    return res.status(400).json({ error: 'INVALID_REDIRECT_URI', message: 'redirect_uri parameter must be a string <= 2048 characters' });
  }

  // Strict redirect_uri whitelist validation
  if (redirect_uri) {
    const { isValid, uri: validatedUri } = validateRedirectUri(redirect_uri, req);
    if (!isValid) {
      logEvent('ERROR', 'SSO', 'Unauthorized redirect_uri attempted in /api/auth/token - BLOCKED', {
        attempted: redirect_uri,
      });
      return res.status(400).json({
        error: 'INVALID_REDIRECT_URI',
        message: 'The provided redirect_uri is not whitelisted. Token exchange blocked.',
      });
    }
    redirect_uri = validatedUri;
  }

  // Mandatory BLOCKING OAuth State Verification & Consumption (single-use anti-replay)
  const stateCheck = validateAndConsumeOAuthState(state.trim(), redirect_uri);
  if (!stateCheck.isValid) {
    logEvent('ERROR', 'SSO', 'OAuth state verification failed during /api/auth/token exchange - BLOCKED', {
      statePrefix: String(state).substring(0, 8),
      error: stateCheck.error,
    });
    const errorCode = stateCheck.error === 'EXPIRED_STATE' ? 'EXPIRED_STATE' : 'INVALID_OR_EXPIRED_STATE';
    return res.status(400).json({
      error: errorCode,
      message: `OAuth state validation failed (${stateCheck.error || 'INVALID'}). Token exchange was blocked for security.`,
    });
  }

  redirect_uri = redirect_uri || stateCheck.redirectUri;
  if (!redirect_uri) {
    return res.status(400).json({
      error: 'MISSING_REDIRECT_URI',
      message: 'The OAuth state is not bound to a redirect URI. Token exchange blocked.',
    });
  }

  try {
    assertOAuthRuntimeConfig();
  } catch (error) {
    logEvent('ERROR', 'SSO', 'Attempted token exchange without complete OAuth runtime configuration', {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({
      error: 'SSO_NOT_CONFIGURED',
      message: 'EVE_CLIENT_ID, EVE_CLIENT_SECRET and EVE_CALLBACK_URL are required for CCP token exchange.',
    });
  }

  try {
    const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.trim(),
    });

    const metadata = await getEveSsoMetadata();
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'eve-trade-interregional/0.2',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      logEvent('WARN', 'SSO', 'Token exchange rejected by CCP', { status: response.status, details: errText });
      return res.status(response.status).json({
        error: 'EVE_SSO_TOKEN_EXCHANGE_FAILED',
        details: errText,
        redirect_uri_used: redirect_uri,
      });
    }

    const tokenData = await response.json();
    if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
      return res.status(502).json({ error: 'INVALID_TOKEN_RESPONSE', message: 'EVE SSO did not return a usable access token.' });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verifyEveAccessToken(tokenData.access_token);
    } catch (error) {
      logEvent('WARN', 'SSO', 'EVE access token validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({
        error: 'INVALID_EVE_SSO_TOKEN',
        message: 'EVE SSO returned an access token that failed signature or claim validation.',
      });
    }

    const parts = String(payload.sub).split(':');
    const parsedCharacterId = Number(parts[parts.length - 1]);
    const characterId = Number.isInteger(parsedCharacterId) ? parsedCharacterId : null;
    const characterName = typeof payload.name === 'string' ? payload.name : null;

    logEvent('INFO', 'SSO', 'Character session authenticated successfully', { characterId, characterName });

    res.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      character_id: characterId,
      character_name: characterName,
      portrait_url: characterId ? `https://images.evetech.net/characters/${characterId}/portrait?size=128` : null,
    });
  } catch (err: unknown) {
    logEvent('ERROR', 'SSO', 'Internal error during token exchange', { error: String(err) });
    res.status(500).json({ error: 'INTERNAL_TOKEN_EXCHANGE_ERROR', message: String(err) });
  }
});

// 4. Refresh token
authRouter.post('/refresh', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Request body must be a JSON object' });
  }

  const { refresh_token, character_id } = req.body;
  if (!refresh_token || typeof refresh_token !== 'string' || !refresh_token.trim()) {
    return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN', message: 'Missing or invalid refresh_token parameter' });
  }

  if (refresh_token.length > 4096) {
    return res.status(400).json({ error: 'REFRESH_TOKEN_TOO_LONG', message: 'refresh_token parameter exceeds maximum allowed length' });
  }

  const expectedCharacterId =
    character_id === undefined || character_id === null || character_id === ''
      ? null
      : Number(character_id);

  if (expectedCharacterId !== null && (!Number.isInteger(expectedCharacterId) || expectedCharacterId <= 0)) {
    return res.status(400).json({ error: 'INVALID_CHARACTER_ID', message: 'character_id must be a positive integer when provided' });
  }

  if (!EVE_CLIENT_ID || !EVE_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'SSO_NOT_CONFIGURED',
      message: 'EVE_CLIENT_ID and EVE_CLIENT_SECRET environment variables are required.',
    });
  }

  try {
    const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token,
    });

    const metadata = await getEveSsoMetadata();
    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'eve-trade-interregional/0.2',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      logEvent('WARN', 'SSO', 'Token refresh rejected by CCP', { status: response.status, details: errText });
      return res.status(response.status).json({ error: 'REFRESH_FAILED', details: errText });
    }

    const tokenData = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
      return res.status(502).json({
        error: 'INVALID_REFRESH_RESPONSE',
        message: 'EVE SSO did not return a usable access token.',
      });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verifyEveAccessToken(tokenData.access_token);
    } catch (error) {
      logEvent('WARN', 'SSO', 'Refreshed EVE access token failed validation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({
        error: 'INVALID_REFRESH_TOKEN_RESPONSE',
        message: 'The refreshed EVE access token failed CCP signature or claim validation.',
      });
    }

    const parts = String(payload.sub).split(':');
    const refreshedCharacterId = Number(parts[parts.length - 1]);
    if (!Number.isInteger(refreshedCharacterId) || refreshedCharacterId <= 0) {
      return res.status(502).json({
        error: 'INVALID_REFRESH_CHARACTER',
        message: 'The refreshed EVE access token does not contain a valid character identity.',
      });
    }

    if (expectedCharacterId !== null && expectedCharacterId !== refreshedCharacterId) {
      logEvent('WARN', 'SSO', 'Refresh token identity mismatch - BLOCKED', {
        expectedCharacterId,
        refreshedCharacterId,
      });
      return res.status(409).json({
        error: 'REFRESH_CHARACTER_MISMATCH',
        message: 'The refreshed token does not belong to the requested character.',
      });
    }

    logEvent('INFO', 'SSO', 'Token refreshed successfully', { characterId: refreshedCharacterId });
    res.json({
      ...tokenData,
      character_id: refreshedCharacterId,
      character_name: typeof payload.name === 'string' ? payload.name : undefined,
    });
  } catch (err: unknown) {
    logEvent('ERROR', 'SSO', 'Internal error during token refresh', { error: String(err) });
    res.status(500).json({ error: 'INTERNAL_REFRESH_ERROR', message: String(err) });
  }
});

// 5. Callback handler for browser redirects and popups
const OAUTH_BROWSER_RESULT_KEY = 'eve_trade_oauth_result_v1';

function renderAuthSuccessHtml(session: Record<string, unknown>): string {
  const sessionJson = safeJsonStringify(session);
  const browserResultJson = safeJsonStringify({
    version: 1,
    createdAt: Date.now(),
    session,
  });

  return [
    '<!DOCTYPE html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <title>EVE SSO — Authentification</title>',
    '    <style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0e1117;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#161821;border:1px solid #262730;padding:28px 32px;border-radius:12px;text-align:center;max-width:440px;box-shadow:0 10px 30px rgba(0,0,0,.6)}.portrait{width:64px;height:64px;border-radius:50%;border:2px solid #00ff88;margin:0 auto 12px;display:block}h2{margin:0 0 8px;font-size:18px;color:#fafafa}p{margin:0;font-size:13px;color:#808495;line-height:1.5}</style>',
    '  </head>',
    '  <body>',
    '    <div class="card">',
    '      <img class="portrait" src="' + (session.portrait_url ? escapeHtml(String(session.portrait_url)) : '') + '" alt="Portrait" />',
    '      <h2>Connexion EVE Online confirmée</h2>',
    '      <p id="status-text">Session validée. Synchronisation avec EVE Trade...</p>',
    '    </div>',
    '    <script>',
    '      const sessionData = ' + sessionJson + ';',
    '      const browserResult = ' + browserResultJson + ';',
    '      if (window.opener) {',
    '        window.opener.postMessage({ type: "OAUTH_AUTH_SUCCESS", provider: "eve_sso", session: sessionData }, window.location.origin);',
    '        setTimeout(() => window.close(), 1000);',
    '      } else {',
    '        try {',
    '          window.localStorage.setItem("' + OAUTH_BROWSER_RESULT_KEY + '", JSON.stringify(browserResult));',
    '          window.location.replace("/");',
    '        } catch (_error) {',
    '          document.getElementById("status-text").textContent = "Session validée, mais le stockage navigateur est indisponible. Relancez la connexion.";',
    '        }',
    '      }',
    '    </script>',
    '  </body>',
    '</html>',
  ].join('\n');
}

function getRequestCallbackUri(req: Request): string {
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const host = req.get('host') || 'localhost:3000';
  const pathname = req.path.replace(/\/+$/, '') || '/';
  return `${protocol}://${host}${pathname}`;
}

export const callbackHandler = async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;
  const errorDesc = req.query.error_description as string;

  if (!state) {
    logEvent('ERROR', 'SSO', 'Callback received without OAuth state parameter - BLOCKED');
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Sécurité CSRF : Jeton State Manquant',
      'La requête d\'autorisation ne contient pas de paramètre state. Connexion bloquée pour protéger votre compte.',
      'MISSING_STATE'
    ));
  }

  const callbackUri = getRequestCallbackUri(req);
  const browserState = readOAuthStateCookie(req);
  if (!browserState || browserState !== state) {
    logEvent('WARN', 'SSO', 'Callback browser state cookie mismatch - BLOCKED', {
      statePrefix: state.substring(0, 8),
      browserStatePresent: Boolean(browserState),
    });
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Sécurité OAuth : navigateur non reconnu',
      'La requête de rappel ne correspond pas au navigateur qui a initié cette connexion SSO.',
      'BROWSER_STATE_MISMATCH'
    ));
  }

  const stateCheck = validateAndConsumeOAuthState(state, callbackUri);
  if (!stateCheck.isValid) {
    logEvent('ERROR', 'SSO', 'Callback received invalid or expired state - BLOCKED', {
      statePrefix: state.substring(0, 8),
      callbackUri,
      error: stateCheck.error,
    });
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      stateCheck.error === 'REDIRECT_URI_MISMATCH'
        ? 'Sécurité OAuth : URL de redirection incompatible'
        : 'Sécurité CSRF : Jeton Invalide ou Expiré',
      stateCheck.error === 'REDIRECT_URI_MISMATCH'
        ? 'La requête de rappel ne correspond pas à l’URL de redirection enregistrée dans le state OAuth.'
        : `Le jeton de sécurité de session est invalide ou a expiré (${stateCheck.error}). Veuillez relancer la connexion SSO.`,
      stateCheck.error || 'INVALID_STATE'
    ));
  }

  res.setHeader('Set-Cookie', buildOAuthStateCookieClear(req));

  if (error) {
    logEvent('WARN', 'SSO', 'Callback received error from CCP SSO', { error, errorDesc });
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml('Autorisation Refusée', errorDesc || error, error));
  }

  if (!code) {
    logEvent('WARN', 'SSO', 'Callback received without authorization code - BLOCKED');
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Code d\'autorisation manquant',
      'Aucun code d\'autorisation n\'a été transmis par EVE Online.',
      'MISSING_CODE'
    ));
  }

  const redirectUri = stateCheck.redirectUri;
  if (!redirectUri) {
    logEvent('ERROR', 'SSO', 'OAuth state had no bound redirect URI - BLOCKED');
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Configuration OAuth invalide',
      'Le flux SSO ne possède pas d\'URL de redirection liée à son état de sécurité.',
      'MISSING_BOUND_REDIRECT_URI'
    ));
  }

  if (!EVE_CLIENT_ID || !EVE_CLIENT_SECRET) {
    logEvent('ERROR', 'SSO', 'Attempted callback exchange without EVE_CLIENT_ID or EVE_CLIENT_SECRET');
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'SSO non configuré',
      'Les paramètres d\'application EVE SSO sont incomplets côté serveur.',
      'SSO_NOT_CONFIGURED'
    ));
  }

  try {
    const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.trim(),
    });

    const metadata = await getEveSsoMetadata();
    const tokenRes = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'eve-trade-interregional/0.2',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      logEvent('WARN', 'SSO', 'Token exchange rejected by CCP', { status: tokenRes.status, details: errText });
      res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderAuthErrorHtml(
        'Échec de l\'authentification EVE SSO',
        `Le serveur EVE SSO a refusé l\'échange du code (HTTP ${tokenRes.status}). Relancez la connexion.`,
        'EVE_SSO_TOKEN_EXCHANGE_FAILED'
      ));
    }

    const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
      logEvent('ERROR', 'SSO', 'CCP token response did not contain a usable access token');
      res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderAuthErrorHtml(
        'Réponse SSO invalide',
        'EVE SSO a répondu sans jeton d\'accès exploitable.',
        'INVALID_TOKEN_RESPONSE'
      ));
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verifyEveAccessToken(tokenData.access_token);
    } catch (error) {
      logEvent('WARN', 'SSO', 'Browser callback access token validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderAuthErrorHtml(
        'Réponse SSO invalide',
        'Le jeton d’accès EVE SSO n’a pas pu être vérifié avec les clés officielles CCP.',
        'INVALID_EVE_SSO_TOKEN'
      ));
    }

    const parts = String(payload.sub).split(':');
    const parsedCharacterId = Number(parts[parts.length - 1]);
    let characterId = Number.isInteger(parsedCharacterId) ? parsedCharacterId : null;
    let characterName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;

    if (!characterId) {
      logEvent('ERROR', 'SSO', 'Token exchange succeeded but character identity could not be established');
      res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderAuthErrorHtml(
        'Identité EVE introuvable',
        'Le jeton SSO a été reçu, mais le personnage EVE n\'a pas pu être identifié.',
        'CHARACTER_IDENTITY_UNAVAILABLE'
      ));
    }

    const exchangedSession: Record<string, unknown> = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: Number(tokenData.expires_in) || 1200,
      character_id: characterId,
      character_name: characterName || `Character #${characterId}`,
      portrait_url: `https://images.evetech.net/characters/${characterId}/portrait?size=128`,
    };

    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthSuccessHtml(exchangedSession));
  } catch (err) {
    logEvent('ERROR', 'SSO', 'Internal error during browser callback token exchange', { error: String(err) });
    res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Échec de l\'authentification EVE SSO',
      'L\'échange du code SSO a échoué côté serveur. Relancez la connexion.',
      'INTERNAL_TOKEN_EXCHANGE_ERROR'
    ));
  }
}