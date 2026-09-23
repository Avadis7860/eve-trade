import { Router, Request, Response } from 'express';
import { marketEsiGateway } from '../gateways/marketEsiGateway';
import type { EsiResponseMetadata } from '../utils/esiTypes';

export const marketsRouter = Router();

function forwardMarketMetadata(res: Response, metadata: EsiResponseMetadata) {
  const pages = metadata.pagination.xPages;
  if (pages !== undefined) res.setHeader('X-Pages', String(pages));

  const errorLimitRemain = metadata.rateLimit.errorLimitRemain;
  if (errorLimitRemain !== undefined) {
    res.setHeader('X-ESI-Error-Limit-Remain', String(errorLimitRemain));
  }

  const errorLimitReset = metadata.rateLimit.errorLimitResetSeconds;
  if (errorLimitReset !== undefined) {
    res.setHeader('X-ESI-Error-Limit-Reset', String(errorLimitReset));
  }

  const retryAfter = metadata.rateLimit.retryAfterSeconds;
  if (retryAfter !== undefined) {
    res.setHeader('Retry-After', String(retryAfter));
  }
}

function sendMarketError(
  res: Response,
  result: {
    status: number;
    error?: { kind: string };
    metadata: EsiResponseMetadata;
    cacheStatus: 'HIT' | 'MISS' | 'REVALIDATED';
  },
) {
  forwardMarketMetadata(res, result.metadata);
  res.setHeader('X-Cache-Status', result.cacheStatus);

  return res.status(result.status).json({
    error: result.error?.kind || 'ESI_ERROR',
    status: result.status,
  });
}

// Market orders proxy: validation and HTTP contract stay here; ESI transport/cache policy
// belongs to MarketEsiGateway -> EsiGateway -> fetchEsi.
marketsRouter.get('/:regionId/orders', async (req: Request, res: Response) => {
  const regionId = Number(req.params.regionId);
  if (!Number.isInteger(regionId) || regionId <= 0) {
    return res.status(400).json({
      error: 'INVALID_REGION_ID',
      message: 'regionId must be a positive integer',
    });
  }

  let typeId: number | undefined;
  if (req.query.type_id !== undefined) {
    const parsed = Number(req.query.type_id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({
        error: 'INVALID_TYPE_ID',
        message: 'type_id must be a positive integer',
      });
    }
    typeId = parsed;
  }

  let page = 1;
  if (req.query.page !== undefined) {
    const parsed = Number(req.query.page);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      return res.status(400).json({
        error: 'INVALID_PAGE',
        message: 'page must be an integer between 1 and 1000',
      });
    }
    page = parsed;
  }

  let orderType: 'all' | 'buy' | 'sell' = 'all';
  if (req.query.order_type !== undefined) {
    const normalized = String(req.query.order_type).toLowerCase();
    if (!['all', 'buy', 'sell'].includes(normalized)) {
      return res.status(400).json({
        error: 'INVALID_ORDER_TYPE',
        message: 'order_type must be all, buy, or sell',
      });
    }
    orderType = normalized as typeof orderType;
  }

  try {
    const result = await marketEsiGateway.fetchOrders({
      regionId,
      typeId,
      page,
      orderType,
    });

    if (!result.ok || !result.data) {
      return sendMarketError(res, result);
    }

    forwardMarketMetadata(res, result.metadata);
    res.setHeader('X-Cache-Status', result.cacheStatus);
    return res.status(200).json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'MARKET_GATEWAY_FAILURE',
      message: process.env.NODE_ENV === 'production'
        ? 'Failed to proxy market orders'
        : String(err),
    });
  }
});

// Market history proxy.
marketsRouter.get('/:regionId/history', async (req: Request, res: Response) => {
  const regionId = Number(req.params.regionId);
  if (!Number.isInteger(regionId) || regionId <= 0) {
    return res.status(400).json({
      error: 'INVALID_REGION_ID',
      message: 'regionId must be a positive integer',
    });
  }

  if (req.query.type_id === undefined) {
    return res.status(400).json({ error: 'type_id is required' });
  }

  const typeId = Number(req.query.type_id);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    return res.status(400).json({
      error: 'INVALID_TYPE_ID',
      message: 'type_id must be a positive integer',
    });
  }

  try {
    const result = await marketEsiGateway.fetchHistory(regionId, typeId);

    if (!result.ok || !result.data) {
      return sendMarketError(res, result);
    }

    forwardMarketMetadata(res, result.metadata);
    res.setHeader('X-Cache-Status', result.cacheStatus);
    return res.status(200).json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'MARKET_GATEWAY_FAILURE',
      message: process.env.NODE_ENV === 'production'
        ? 'Failed to proxy market history'
        : String(err),
    });
  }
});
