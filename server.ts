import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const EVE_CLIENT_ID = process.env.EVE_CLIENT_ID || '790ee291d084cb5bc36adff8163b538';
const EVE_CLIENT_SECRET = process.env.EVE_CLIENT_SECRET || 'eat_tBVLi6jORbnrpX9Lj2o0FFoQakoLvpQ_18xtI3';
const EVE_SCOPES = [
  'esi-markets.read_character_orders.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-skills.read_skills.v1',
  'publicData',
].join(' ');

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to parse JWT payload from EVE SSO v2
  function parseJwt(token: string) {
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

  // 1. Auth configuration endpoint
  app.get('/api/auth/config', (req, res) => {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const currentOrigin = `${protocol}://${host}`;

    res.json({
      client_id: EVE_CLIENT_ID,
      has_client_secret: Boolean(EVE_CLIENT_SECRET),
      scopes: EVE_SCOPES,
      suggested_redirect_uris: [
        `${currentOrigin}/auth/callback`,
        'http://localhost:8000/callback',
        `${currentOrigin}/callback`,
      ],
      current_origin: currentOrigin,
    });
  });

  // 2. Auth URL builder
  app.get('/api/auth/url', (req, res) => {
    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const defaultRedirect = `${protocol}://${host}/auth/callback`;
    const redirectUri = (req.query.redirect_uri as string) || defaultRedirect;
    const state = (req.query.state as string) || Math.random().toString(36).substring(2, 15);

    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri,
      client_id: EVE_CLIENT_ID,
      scope: EVE_SCOPES,
      state: state,
    });

    const url = `https://login.eveonline.com/v2/oauth/authorize/?${params.toString()}`;
    res.json({ url, redirect_uri: redirectUri, state });
  });

  // 3. Exchange authorization code for tokens
  app.post('/api/auth/token', async (req, res) => {
    let { code, redirect_uri } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    // Auto-extract code and redirect_uri if user pasted a full URL
    // e.g. "http://localhost:8000/callback?code=abc...&state=xyz"
    if (typeof code === 'string' && (code.includes('code=') || code.startsWith('http'))) {
      try {
        const urlObj = new URL(code.trim());
        const extracted = urlObj.searchParams.get('code');
        if (extracted) {
          code = extracted;
          // If no custom redirect_uri was sent, use the base URL from the pasted URL
          if (!redirect_uri || redirect_uri === 'http://localhost:8000/callback') {
            redirect_uri = `${urlObj.origin}${urlObj.pathname}`;
          }
        }
      } catch {
        const match = code.match(/code=([^&]+)/);
        if (match) code = decodeURIComponent(match[1]);
      }
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

      const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
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
        return res.status(response.status).json({
          error: 'EVE SSO token exchange failed',
          details: errText,
          redirect_uri_used: redirect_uri,
        });
      }

      const tokenData = await response.json();
      const payload = parseJwt(tokenData.access_token);

      let characterId: number | null = null;
      let characterName: string | null = null;

      if (payload && payload.sub) {
        // sub is typically "CHARACTER:EVE:2112345678"
        const parts = payload.sub.split(':');
        characterId = Number(parts[parts.length - 1]);
        characterName = payload.name || null;
      }

      // If parsing failed, verify via ESI /oauth/verify
      if (!characterId) {
        try {
          const verifyRes = await fetch('https://login.eveonline.com/oauth/verify', {
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
        } catch {
          // Ignore secondary failure
        }
      }

      res.json({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        character_id: characterId,
        character_name: characterName,
        portrait_url: characterId ? `https://images.evetech.net/characters/${characterId}/portrait?size=128` : null,
      });
    } catch (err: unknown) {
      console.error('Token exchange error:', err);
      res.status(500).json({ error: 'Internal server error exchanging token', message: String(err) });
    }
  });

  // 4. Refresh token
  app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Missing refresh_token' });
    }

    try {
      const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token,
      });

      const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
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
        return res.status(response.status).json({ error: 'Refresh failed', details: errText });
      }

      const tokenData = await response.json();
      res.json(tokenData);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Internal server error refreshing token', message: String(err) });
    }
  });

  // 5. Proxy character orders
  app.get('/api/character/:characterId/orders', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/orders/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI orders error', details: errText });
      }

      const orders = await response.json();
      res.json(orders);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch orders from ESI', message: String(err) });
    }
  });

  // 6. Proxy character wallet
  app.get('/api/character/:characterId/wallet', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/wallet/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI wallet error', details: errText });
      }

      const balance = await response.json();
      res.json({ balance });
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch wallet from ESI', message: String(err) });
    }
  });

  // 7. Proxy character skills (for Accounting and Broker Relations)
  app.get('/api/character/:characterId/skills', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/skills/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI skills error', details: errText });
      }

      const skills = await response.json();
      res.json(skills);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch skills from ESI', message: String(err) });
    }
  });

  // In-memory Market Types DB (15,801 tradeable types)
  let loadedMarketTypes: Array<{
    type_id: number;
    name: string;
    group_id: number;
    category_id: number;
    volume: number;
    average_price: number;
    adjusted_price: number;
  }> = [];

  try {
    const typesFilePath = path.join(process.cwd(), 'src', 'data', 'allMarketTypes.json');
    if (fs.existsSync(typesFilePath)) {
      loadedMarketTypes = JSON.parse(fs.readFileSync(typesFilePath, 'utf-8'));
      console.log(`[Market DB] Loaded ${loadedMarketTypes.length} market types into memory.`);
    }
  } catch (err) {
    console.warn('[Market DB] Could not preload allMarketTypes.json:', err);
  }

  // 8. Universal ESI Type Lookup / Search
  app.get('/api/types/lookup/:id', async (req, res) => {
    const { id } = req.params;
    const numId = Number(id);

    // First check local in-memory DB of 15,801 types
    const local = loadedMarketTypes.find((t) => t.type_id === numId);
    if (local) {
      return res.json({
        type_id: local.type_id,
        name: local.name,
        group_id: local.group_id,
        category_id: local.category_id,
        volume: local.volume,
        average_price: local.average_price,
        adjusted_price: local.adjusted_price,
      });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/universe/types/${id}/?datasource=tranquility&language=en`,
        {
          headers: { 'User-Agent': 'eve-trade-interregional/0.2' },
        }
      );
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Type not found in ESI' });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to lookup type in ESI', message: String(err) });
    }
  });

  // 9. All 15,801 tradeable market types endpoint
  app.get('/api/types/all', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(loadedMarketTypes);
  });

  // 10. Fast search across all 15,801 types
  app.get('/api/types/search', (req, res) => {
    const query = ((req.query.q as string) || '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    if (!query) {
      return res.json(loadedMarketTypes.slice(0, limit));
    }

    const isNumeric = /^\d+$/.test(query);
    if (isNumeric) {
      const numId = Number(query);
      const exact = loadedMarketTypes.find((t) => t.type_id === numId);
      if (exact) return res.json([exact]);
    }

    const results: typeof loadedMarketTypes = [];
    for (const t of loadedMarketTypes) {
      if (t.name.toLowerCase().includes(query) || String(t.type_id) === query) {
        results.push(t);
        if (results.length >= limit) break;
      }
    }

    res.json(results);
  });

  // 9. Callback route for EVE SSO OAuth popup and redirect
  const callbackHandler = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>EVE SSO — Authentification</title>
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
              border: 1px solid #262730;
              padding: 28px 32px;
              border-radius: 10px;
              text-align: center;
              max-width: 420px;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            }
            .spinner {
              width: 36px;
              height: 36px;
              border: 3px solid rgba(255, 75, 75, 0.2);
              border-top-color: #ff4b4b;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            h2 { margin: 0 0 8px; font-size: 18px; color: #fafafa; }
            p { margin: 0; font-size: 13px; color: #808495; line-height: 1.5; }
            .code-box {
              background: #0e1117;
              border: 1px solid #31333f;
              border-radius: 6px;
              padding: 8px 12px;
              margin: 16px 0;
              font-family: monospace;
              font-size: 12px;
              word-break: break-all;
              color: #00ff88;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Connexion EVE Online SSO</h2>
            <p id="status-text">Validation du jeton d'autorisation...</p>
            <div id="code-display" style="display: none;" class="code-box"></div>
          </div>
          <script>
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            const error = urlParams.get('error');
            const errorDesc = urlParams.get('error_description');

            if (code) {
              document.getElementById('status-text').innerText = 'Jeton reçu ! Synchronisation avec EVE Trade...';
            } else if (error) {
              document.getElementById('status-text').innerText = 'Erreur EVE SSO : ' + (errorDesc || error);
              document.getElementById('status-text').style.color = '#ff4b4b';
            }

            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_AUTH_SUCCESS',
                provider: 'eve_sso',
                code: code,
                state: state,
                error: error,
                errorDescription: errorDesc
              }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              // Direct navigation fallback
              if (code) {
                sessionStorage.setItem('eve_sso_pending_code', code);
                window.location.href = '/?eve_sso_code=' + encodeURIComponent(code);
              }
            }
          </script>
        </body>
      </html>
    `);
  };

  app.get('/auth/callback', callbackHandler);
  app.get('/auth/callback/', callbackHandler);
  app.get('/callback', callbackHandler);
  app.get('/callback/', callbackHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EVE Trade Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
