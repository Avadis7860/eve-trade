import { Router, Request, Response } from 'express';
import { TypeCatalogService } from '../../src/services/typeCatalog';
import { EVE_CLIENT_ID, EVE_CLIENT_SECRET, EVE_CALLBACK_URL, activeOAuthStates } from '../utils/authUtils';

export const healthRouter = Router();

healthRouter.get('/health', (req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());
  const catalogMeta = TypeCatalogService.getMetadata();
  const ssoConfigured = Boolean(EVE_CLIENT_ID && EVE_CLIENT_SECRET);

  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let httpCode = 200;

  if (catalogMeta.status === 'CATALOG_LOADED') {
    healthStatus = 'healthy';
    httpCode = 200;
  } else if (catalogMeta.status === 'CATALOG_FALLBACK_CORE') {
    healthStatus = 'degraded';
    httpCode = 200;
  } else {
    healthStatus = 'unhealthy';
    httpCode = 503;
  }

  res.status(httpCode).json({
    status: healthStatus,
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSec,
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    catalog: catalogMeta,
    sso: {
      configured: ssoConfigured,
      client_id_present: Boolean(EVE_CLIENT_ID),
      client_secret_present: Boolean(EVE_CLIENT_SECRET),
      callback_url: EVE_CALLBACK_URL || null,
      active_oauth_states_count: activeOAuthStates.size,
    },
  });
});
