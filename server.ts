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

  // 5. Proxy character orders (active)
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

  // 5b. Proxy character order history (closed / fulfilled / expired / cancelled orders)
  app.get('/api/character/:characterId/orders/history', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const page = req.query.page || '1';
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/orders/history/?datasource=tranquility&page=${page}`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI order history error', details: errText });
      }

      const history = await response.json();
      res.json(history);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch order history from ESI', message: String(err) });
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

  // 7b. Proxy character wallet transactions (buy/sell history)
  app.get('/api/character/:characterId/transactions', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/wallet/transactions/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI transactions error', details: errText });
      }

      const transactions = await response.json();
      res.json(transactions);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch transactions from ESI', message: String(err) });
    }
  });

  // 7c. Proxy character wallet journal
  app.get('/api/character/:characterId/journal', async (req, res) => {
    const { characterId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header missing' });
    }

    try {
      const response = await fetch(
        `https://esi.evetech.net/latest/characters/${characterId}/wallet/journal/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'ESI wallet journal error', details: errText });
      }

      const journal = await response.json();
      res.json(journal);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to fetch journal from ESI', message: String(err) });
    }
  });

  // 7d. Resolve station or location names from ESI
  app.get('/api/universe/location/:locationId', async (req, res) => {
    const { locationId } = req.params;
    const locIdNum = Number(locationId);

    // If it's a standard NPC station (ID usually between 60000000 and 64000000)
    if (locIdNum >= 60000000 && locIdNum < 64000000) {
      try {
        const esiRes = await fetch(
          `https://esi.evetech.net/latest/universe/stations/${locIdNum}/?datasource=tranquility`,
          {
            headers: { 'User-Agent': 'eve-trade-interregional/0.2' },
          }
        );
        if (esiRes.ok) {
          const stationData = await esiRes.json();
          return res.json({ location_id: locIdNum, name: stationData.name, system_id: stationData.system_id });
        }
      } catch {}
    }

    // Try universe/structures if auth header is present
    const authHeader = req.headers.authorization;
    if (authHeader && locIdNum > 100000000) {
      try {
        const structRes = await fetch(
          `https://esi.evetech.net/latest/universe/structures/${locIdNum}/?datasource=tranquility`,
          {
            headers: {
              'Authorization': authHeader,
              'User-Agent': 'eve-trade-interregional/0.2',
            },
          }
        );
        if (structRes.ok) {
          const structData = await structRes.json();
          return res.json({ location_id: locIdNum, name: structData.name, system_id: structData.solar_system_id });
        }
      } catch {}
    }

    res.json({ location_id: locIdNum, name: `Location #${locIdNum}` });
  });

  // In-memory server-side HTTP cache for ESI market orders and histories
  interface ServerCacheItem {
    data: any;
    headers: Record<string, string>;
    expiresAt: number;
    etag?: string;
  }
  const serverEsiCache = new Map<string, ServerCacheItem>();

  // Periodic garbage collection of expired items
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of serverEsiCache.entries()) {
      if (now > item.expiresAt) {
        serverEsiCache.delete(key);
      }
    }
  }, 120000);

  // 7e. Market orders proxy endpoint with pagination & intelligent caching
  app.get('/api/markets/:regionId/orders', async (req, res) => {
    const { regionId } = req.params;
    const typeId = req.query.type_id ? String(req.query.type_id) : undefined;
    const page = req.query.page ? String(req.query.page) : '1';
    const orderType = req.query.order_type ? String(req.query.order_type) : 'all';

    let url = `https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=${orderType}&page=${page}`;
    if (typeId) {
      url += `&type_id=${typeId}`;
    }

    const now = Date.now();
    const cached = serverEsiCache.get(url);
    if (cached && now < cached.expiresAt) {
      for (const [hKey, hVal] of Object.entries(cached.headers)) {
        res.setHeader(hKey, hVal);
      }
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached.data);
    }

    try {
      const fetchHeaders: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
      };
      if (cached?.etag) {
        fetchHeaders['If-None-Match'] = cached.etag;
      }

      const response = await fetch(url, { headers: fetchHeaders });

      // If ESI returned 304 Not Modified, refresh TTL and return cached data
      if (response.status === 304 && cached) {
        const expiresHeader = response.headers.get('expires');
        const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : now + 180000;
        cached.expiresAt = Math.max(now + 60000, expiresAt);
        res.setHeader('X-Cache-Status', 'REVALIDATED');
        return res.json(cached.data);
      }

      // Forward ESI pagination and rate limit headers
      const xPages = response.headers.get('x-pages');
      const xRemain = response.headers.get('x-esi-error-limit-remain');
      const xReset = response.headers.get('x-esi-error-limit-reset');
      const etag = response.headers.get('etag') || undefined;
      const expiresHeader = response.headers.get('expires');
      const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : now + 180000;

      const fwdHeaders: Record<string, string> = {};
      if (xPages) { res.setHeader('X-Pages', xPages); fwdHeaders['X-Pages'] = xPages; }
      if (xRemain) { res.setHeader('X-ESI-Error-Limit-Remain', xRemain); fwdHeaders['X-ESI-Error-Limit-Remain'] = xRemain; }
      if (xReset) { res.setHeader('X-ESI-Error-Limit-Reset', xReset); fwdHeaders['X-ESI-Error-Limit-Reset'] = xReset; }

      if (!response.ok) {
        return res.status(response.status).json({
          error: `ESI error ${response.status}`,
          status: response.status,
        });
      }

      const data = await response.json();

      // Store in server cache with real CCP ESI expiration
      serverEsiCache.set(url, {
        data,
        headers: fwdHeaders,
        expiresAt: Math.max(now + 60000, expiresAt),
        etag,
      });

      res.setHeader('X-Cache-Status', 'MISS');
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to proxy market orders', message: String(err) });
    }
  });

  // 7f. Market history proxy endpoint with intelligent caching
  app.get('/api/markets/:regionId/history', async (req, res) => {
    const { regionId } = req.params;
    const typeId = req.query.type_id ? String(req.query.type_id) : undefined;

    if (!typeId) {
      return res.status(400).json({ error: 'type_id is required' });
    }

    const url = `https://esi.evetech.net/latest/markets/${regionId}/history/?datasource=tranquility&type_id=${typeId}`;
    const now = Date.now();
    const cached = serverEsiCache.get(url);
    if (cached && now < cached.expiresAt) {
      res.setHeader('X-Cache-Status', 'HIT');
      return res.json(cached.data);
    }

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `ESI error ${response.status}` });
      }

      const data = await response.json();
      const expiresHeader = response.headers.get('expires');
      // Market history updates once per day at downtime (11:00 UTC)
      const expiresAt = expiresHeader ? new Date(expiresHeader).getTime() : now + 1800000;

      serverEsiCache.set(url, {
        data,
        headers: {},
        expiresAt: Math.max(now + 300000, expiresAt),
      });

      res.setHeader('X-Cache-Status', 'MISS');
      res.json(data);
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to proxy market history', message: String(err) });
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

  // 10. Fast search across market types with live ESI fallback
  app.get('/api/types/search', async (req, res) => {
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

    // Dynamic ESI universe resolution if local results are few and query length >= 3
    if (results.length < 5 && query.length >= 3) {
      try {
        const esiRes = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
          },
          body: JSON.stringify([query]),
        });

        if (esiRes.ok) {
          const idData = await esiRes.json();
          if (idData.inventory_types && Array.isArray(idData.inventory_types)) {
            for (const item of idData.inventory_types) {
              if (!results.some((r) => r.type_id === item.id)) {
                try {
                  const typeRes = await fetch(
                    `https://esi.evetech.net/latest/universe/types/${item.id}/?datasource=tranquility&language=en`,
                    { headers: { 'User-Agent': 'eve-trade-interregional/0.2' } }
                  );
                  if (typeRes.ok) {
                    const tData = await typeRes.json();
                    if (tData.published) {
                      const newType = {
                        type_id: tData.type_id,
                        name: tData.name,
                        group_id: tData.group_id,
                        category_id: 0,
                        volume: tData.volume || 1.0,
                        average_price: 0,
                        adjusted_price: 0,
                      };
                      results.push(newType);
                      loadedMarketTypes.push(newType);
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch (err) {
        console.warn('ESI universe/ids dynamic resolution error:', err);
      }
    }

    res.json(results);
  });

  // 9. Callback route for EVE SSO OAuth popup and redirect
  const callbackHandler = async (req: express.Request, res: express.Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;
    const errorDesc = req.query.error_description as string;

    let exchangedSession: any = null;
    let exchangeError: string | null = null;

    if (code) {
      try {
        const host = req.get('host') || `localhost:${PORT}`;
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const redirectUri = `${protocol}://${host}${req.path}`;
        
        const basicAuth = Buffer.from(`${EVE_CLIENT_ID}:${EVE_CLIENT_SECRET}`).toString('base64');
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code: code.trim(),
          redirect_uri: redirectUri,
        });

        const tokenRes = await fetch('https://login.eveonline.com/v2/oauth/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Host': 'login.eveonline.com',
            'User-Agent': 'eve-trade-interregional/0.2',
          },
          body: params.toString(),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
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
            } catch {}
          }

          if (characterId) {
            exchangedSession = {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_in: tokenData.expires_in,
              character_id: characterId,
              character_name: characterName || `Character #${characterId}`,
              portrait_url: `https://images.evetech.net/characters/${characterId}/portrait?size=128`,
            };
          }
        }
      } catch (err) {
        console.warn('Direct token exchange during callback failed, falling back to client exchange:', err);
        exchangeError = String(err);
      }
    }

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
              border-radius: 12px;
              text-align: center;
              max-width: 440px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
            }
            .spinner {
              width: 38px;
              height: 38px;
              border: 3px solid rgba(255, 75, 75, 0.2);
              border-top-color: #ff4b4b;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            h2 { margin: 0 0 8px; font-size: 18px; color: #fafafa; }
            p { margin: 0; font-size: 13px; color: #808495; line-height: 1.5; }
            .portrait {
              width: 64px;
              height: 64px;
              border-radius: 50%;
              border: 2px solid #00ff88;
              margin: 0 auto 12px;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="card">
            ${exchangedSession?.portrait_url ? `<img class="portrait" src="${exchangedSession.portrait_url}" alt="Portrait" />` : '<div class="spinner"></div>'}
            <h2>${exchangedSession ? `Bienvenue, ${exchangedSession.character_name} !` : 'Connexion EVE Online SSO'}</h2>
            <p id="status-text">${
              exchangedSession
                ? 'Session validée avec succès ! Synchronisation avec EVE Trade...'
                : (error ? `Erreur SSO : ${errorDesc || error}` : 'Échange du jeton avec CCP EVE SSO...')
            }</p>
          </div>
          <script>
            const sessionData = ${JSON.stringify(exchangedSession)};
            const code = ${JSON.stringify(code || null)};
            const state = ${JSON.stringify(state || null)};
            const error = ${JSON.stringify(error || null)};
            const errorDesc = ${JSON.stringify(errorDesc || null)};

            const payload = {
              type: 'OAUTH_AUTH_SUCCESS',
              provider: 'eve_sso',
              code: code,
              state: state,
              session: sessionData,
              token: sessionData ? sessionData.access_token : null,
              refresh_token: sessionData ? sessionData.refresh_token : null,
              character_id: sessionData ? sessionData.character_id : null,
              character_name: sessionData ? sessionData.character_name : null,
              error: error,
              errorDescription: errorDesc
            };

            // If session was obtained, save directly in localStorage for backup
            if (sessionData && sessionData.character_id) {
              try {
                const now = Date.now();
                const fullSession = {
                  ...sessionData,
                  expires_at: now + ((sessionData.expires_in || 1200) * 1000),
                  last_sync: new Date().toISOString(),
                  is_active: true
                };
                // Update linked characters in localStorage
                let chars = [];
                try {
                  const existing = localStorage.getItem('eve_linked_characters');
                  if (existing) chars = JSON.parse(existing);
                } catch(e) {}
                if (!Array.isArray(chars)) chars = [];
                const idx = chars.findIndex(c => c.character_id === fullSession.character_id);
                if (idx >= 0) {
                  chars[idx] = { ...chars[idx], ...fullSession };
                } else {
                  chars = chars.map(c => ({ ...c, is_active: false })).concat([fullSession]);
                }
                localStorage.setItem('eve_linked_characters', JSON.stringify(chars));
                localStorage.setItem('eve_active_character_id', String(fullSession.character_id));
                localStorage.setItem('eve_char_session', JSON.stringify(fullSession));
              } catch (e) {
                console.warn('Failed local storage write in callback:', e);
              }
            }

            // Transmit to opener if popup
            if (window.opener) {
              window.opener.postMessage(payload, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              // Direct navigation fallback
              setTimeout(() => {
                window.location.href = '/?logged_in=' + (sessionData?.character_id || '1');
              }, 1000);
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
