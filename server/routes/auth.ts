import express, { Router, Request, Response } from 'express';
import { logEvent } from '../utils/logger';
import {
  EVE_CLIENT_ID,
  EVE_CLIENT_SECRET,
  EVE_CALLBACK_URL,
  EVE_SSO_AUTHORIZE_URL,
  EVE_SSO_TOKEN_URL,
  EVE_SSO_VERIFY_URL,
  EVE_SCOPES,
  generateOAuthState,
  validateAndConsumeOAuthState,
  validateRedirectUri,
  parseJwt,
  renderAuthErrorHtml,
  escapeHtml,
  safeJsonStringify,
  activeOAuthStates,
} from '../utils/authUtils';

export const authRouter = Router();

// 1. Auth configuration endpoint
authRouter.get('/config', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const currentOrigin = `${protocol}://${host}`;

  res.json({
    client_id: EVE_CLIENT_ID,
    has_client_secret: Boolean(EVE_CLIENT_SECRET),
    callback_url_configured: Boolean(EVE_CALLBACK_URL),
    callback_url: EVE_CALLBACK_URL || null,
    scopes: EVE_SCOPES,
    suggested_redirect_uris: [
      ...(EVE_CALLBACK_URL ? [EVE_CALLBACK_URL] : []),
      `${currentOrigin}/auth/callback`,
      'http://localhost:8000/callback',
      `${currentOrigin}/callback`,
    ],
    current_origin: currentOrigin,
  });
});

// 2. Auth URL builder (cryptographically random state, strictly whitelisted redirect_uri)
authRouter.get('/url', (req: Request, res: Response) => {
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

  // Cryptographically secure CSRF state
  const state = generateOAuthState(redirectUri);

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    client_id: EVE_CLIENT_ID,
    scope: EVE_SCOPES,
    state: state,
  });

  const url = `${EVE_SSO_AUTHORIZE_URL}${EVE_SSO_AUTHORIZE_URL.includes('?') ? '&' : '?'}${params.toString()}`;
  logEvent('INFO', 'SSO', 'Generated SSO authorization URL', { redirectUri, statePrefix: state.substring(0, 8) });
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
        if (!redirect_uri || redirect_uri === 'http://localhost:8000/callback') {
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

  // Mandatory OAuth State Validation
  if (!state || typeof state !== 'string' || !state.trim()) {
    return res.status(400).json({
      error: 'MISSING_STATE',
      message: 'Missing or empty state parameter. OAuth state is mandatory for CSRF protection.',
    });
  }

  if (state.length > 128) {
    return res.status(400).json({ error: 'INVALID_STATE', message: 'State parameter must be a string <= 128 characters' });
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

  if (!EVE_CLIENT_ID || !EVE_CLIENT_SECRET) {
    logEvent('ERROR', 'SSO', 'Attempted token exchange without EVE_CLIENT_ID or EVE_CLIENT_SECRET configured');
    return res.status(500).json({
      error: 'SSO_NOT_CONFIGURED',
      message: 'EVE_CLIENT_ID and EVE_CLIENT_SECRET environment variables are required.',
    });
  }

  try {
    const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.trim(),
    });
    if (redirect_uri) {
      params.append('redirect_uri', redirect_uri.trim());
    }

    const response = await fetch(EVE_SSO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'login.eveonline.com',
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
    const payload = parseJwt(tokenData.access_token);

    let characterId: number | null = null;
    let characterName: string | null = null;

    if (payload && payload.sub) {
      const parts = payload.sub.split(':');
      characterId = Number(parts[parts.length - 1]);
      characterName = payload.name || null;
    }

    if (!characterId) {
      try {
        const verifyRes = await fetch(EVE_SSO_VERIFY_URL, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          characterId = verifyData.CharacterID;
          characterName = verifyData.CharacterName;
        }
      } catch {}
    }

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

  const { refresh_token } = req.body;
  if (!refresh_token || typeof refresh_token !== 'string' || !refresh_token.trim()) {
    return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN', message: 'Missing or invalid refresh_token parameter' });
  }

  if (refresh_token.length > 4096) {
    return res.status(400).json({ error: 'REFRESH_TOKEN_TOO_LONG', message: 'refresh_token parameter exceeds maximum allowed length' });
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

    const response = await fetch(EVE_SSO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'login.eveonline.com',
        'User-Agent': 'eve-trade-interregional/0.2',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      logEvent('WARN', 'SSO', 'Token refresh rejected by CCP', { status: response.status, details: errText });
      return res.status(response.status).json({ error: 'REFRESH_FAILED', details: errText });
    }

    const tokenData = await response.json();
    logEvent('INFO', 'SSO', 'Token refreshed successfully');
    res.json(tokenData);
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
    '        setTimeout(() => window.close(), 250);',
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

  const stateCheck = validateAndConsumeOAuthState(state);
  if (!stateCheck.isValid) {
    logEvent('ERROR', 'SSO', 'Callback received invalid or expired state - BLOCKED', {
      statePrefix: state.substring(0, 8),
      error: stateCheck.error,
    });
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderAuthErrorHtml(
      'Sécurité CSRF : Jeton Invalide ou Expiré',
      `Le jeton de sécurité de session est invalide ou a expiré (${stateCheck.error}). Veuillez relancer la connexion SSO.`,
      stateCheck.error || 'INVALID_STATE'
    ));
  }

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
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch(EVE_SSO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'login.eveonline.com',
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

    const payload = parseJwt(tokenData.access_token);
    let characterId: number | null = null;
    let characterName: string | null = null;

    if (payload && payload.sub) {
      const parts = String(payload.sub).split(':');
      const parsedCharacterId = Number(parts[parts.length - 1]);
      if (Number.isInteger(parsedCharacterId) && parsedCharacterId > 0) characterId = parsedCharacterId;
      if (typeof payload.name === 'string' && payload.name.trim()) characterName = payload.name.trim();
    }

    if (!characterId) {
      try {
        const verifyRes = await fetch(EVE_SSO_VERIFY_URL, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json() as { CharacterID?: number; CharacterName?: string };
          const verifiedId = Number(verifyData.CharacterID);
          if (Number.isInteger(verifiedId) && verifiedId > 0) characterId = verifiedId;
          if (typeof verifyData.CharacterName === 'string' && verifyData.CharacterName.trim()) characterName = verifyData.CharacterName.trim();
        }
      } catch (verifyError) {
        logEvent('WARN', 'SSO', 'Character verification request failed after token exchange', { error: String(verifyError) });
      }
    }

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