import { Router, Request, Response } from 'express';

export const marketsRouter = Router();

// In-memory server-side HTTP cache for ESI market orders and histories
interface ServerCacheItem {
  data: any;
  headers: Record<string, string>;
  expiresAt: number;
  etag?: string;
}

const serverEsiCache = new Map<string, ServerCacheItem>();

// Periodic garbage collection of expired items
const cacheGcInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, item] of serverEsiCache.entries()) {
    if (now > item.expiresAt) {
      serverEsiCache.delete(key);
    }
  }
}, 120000);
if (cacheGcInterval && typeof cacheGcInterval.unref === 'function') {
  cacheGcInterval.unref();
}

// 1. Market orders proxy endpoint with pagination & intelligent caching
marketsRouter.get('/:regionId/orders', async (req: Request, res: Response) => {
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

// 2. Market history proxy endpoint with intelligent caching
marketsRouter.get('/:regionId/history', async (req: Request, res: Response) => {
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
