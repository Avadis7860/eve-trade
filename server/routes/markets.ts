import { Router, Request, Response } from 'express';
import { fetchEsi } from '../utils/esiClient';

export const marketsRouter = Router();

// In-memory server-side HTTP cache for ESI market orders and histories
interface ServerCacheItem {
  data: any;
  headers: Record<string, string>;
  expiresAt: number;
  etag?: string;
}

// Memory-bounded FIFO (First-In, First-Out based on insertion order) cache capped at MAX_CACHE_ENTRIES with TTL-based expiration
const serverEsiCache = new Map<string, ServerCacheItem>();
const MAX_CACHE_ENTRIES = 5000;

function setServerCache(key: string, item: ServerCacheItem) {
  if (serverEsiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = serverEsiCache.keys().next().value;
    if (oldestKey) serverEsiCache.delete(oldestKey);
  }
  serverEsiCache.set(key, item);
}

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
  const numRegionId = Number(regionId);
  if (!Number.isInteger(numRegionId) || numRegionId <= 0) {
    return res.status(400).json({ error: 'INVALID_REGION_ID', message: 'regionId must be a positive integer' });
  }

  let typeId: string | undefined = undefined;
  if (req.query.type_id !== undefined) {
    const numTypeId = Number(req.query.type_id);
    if (!Number.isInteger(numTypeId) || numTypeId <= 0) {
      return res.status(400).json({ error: 'INVALID_TYPE_ID', message: 'type_id must be a positive integer' });
    }
    typeId = String(numTypeId);
  }

  let page = '1';
  if (req.query.page !== undefined) {
    const numPage = Number(req.query.page);
    if (!Number.isInteger(numPage) || numPage < 1 || numPage > 1000) {
      return res.status(400).json({ error: 'INVALID_PAGE', message: 'page must be an integer between 1 and 1000' });
    }
    page = String(numPage);
  }

  let orderType = 'all';
  if (req.query.order_type !== undefined) {
    const ot = String(req.query.order_type).toLowerCase();
    if (!['all', 'buy', 'sell'].includes(ot)) {
      return res.status(400).json({ error: 'INVALID_ORDER_TYPE', message: 'order_type must be all, buy, or sell' });
    }
    orderType = ot;
  }

  let url = `https://esi.evetech.net/latest/markets/${numRegionId}/orders/?datasource=tranquility&order_type=${orderType}&page=${page}`;
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
    const result = await fetchEsi<any[]>(url, {
      etag: cached?.etag,
    });

    // If ESI returned 304 Not Modified, refresh TTL and return cached data
    if (result.status === 304 && cached) {
      const expiresAt = result.expires ? new Date(result.expires).getTime() : now + 180000;
      cached.expiresAt = Math.max(now + 60000, expiresAt);
      res.setHeader('X-Cache-Status', 'REVALIDATED');
      return res.json(cached.data);
    }

    // Forward ESI pagination and rate limit headers
    const fwdHeaders: Record<string, string> = {};
    if (result.xPages) {
      res.setHeader('X-Pages', result.xPages);
      fwdHeaders['X-Pages'] = result.xPages;
    }
    if (result.errorLimitRemain !== undefined) {
      const remainStr = String(result.errorLimitRemain);
      res.setHeader('X-ESI-Error-Limit-Remain', remainStr);
      fwdHeaders['X-ESI-Error-Limit-Remain'] = remainStr;
    }
    if (result.errorLimitReset !== undefined) {
      const resetStr = String(result.errorLimitReset);
      res.setHeader('X-ESI-Error-Limit-Reset', resetStr);
      fwdHeaders['X-ESI-Error-Limit-Reset'] = resetStr;
    }

    if (!result.ok || !result.data) {
      return res.status(result.status).json({
        error: `ESI error ${result.status}`,
        status: result.status,
      });
    }

    const expiresAt = result.expires ? new Date(result.expires).getTime() : now + 180000;

    // Store in server cache with real CCP ESI expiration
    setServerCache(url, {
      data: result.data,
      headers: fwdHeaders,
      expiresAt: Math.max(now + 60000, expiresAt),
      etag: result.etag,
    });

    res.setHeader('X-Cache-Status', 'MISS');
    res.json(result.data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to proxy market orders', message: String(err) });
  }
});

// 2. Market history proxy endpoint with intelligent caching
marketsRouter.get('/:regionId/history', async (req: Request, res: Response) => {
  const { regionId } = req.params;
  const numRegionId = Number(regionId);
  if (!Number.isInteger(numRegionId) || numRegionId <= 0) {
    return res.status(400).json({ error: 'INVALID_REGION_ID', message: 'regionId must be a positive integer' });
  }

  const typeId = req.query.type_id ? String(req.query.type_id) : undefined;
  if (!typeId) {
    return res.status(400).json({ error: 'type_id is required' });
  }

  const numTypeId = Number(typeId);
  if (!Number.isInteger(numTypeId) || numTypeId <= 0) {
    return res.status(400).json({ error: 'INVALID_TYPE_ID', message: 'type_id must be a positive integer' });
  }

  const url = `https://esi.evetech.net/latest/markets/${numRegionId}/history/?datasource=tranquility&type_id=${numTypeId}`;
  const now = Date.now();
  const cached = serverEsiCache.get(url);
  if (cached && now < cached.expiresAt) {
    res.setHeader('X-Cache-Status', 'HIT');
    return res.json(cached.data);
  }

  try {
    const result = await fetchEsi<any[]>(url);

    if (!result.ok || !result.data) {
      return res.status(result.status).json({ error: `ESI error ${result.status}` });
    }

    const expiresAt = result.expires ? new Date(result.expires).getTime() : now + 1800000;

    setServerCache(url, {
      data: result.data,
      headers: {},
      expiresAt: Math.max(now + 300000, expiresAt),
    });

    res.setHeader('X-Cache-Status', 'MISS');
    res.json(result.data);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to proxy market history', message: String(err) });
  }
});
