import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { TypeCatalogService } from './src/services/typeCatalog';
import { logEvent } from './server/utils/logger';
import {
  EVE_CLIENT_ID,
  EVE_CALLBACK_URL,
  generateOAuthState,
  validateAndConsumeOAuthState,
  validateRedirectUri,
  renderAuthErrorHtml,
  activeOAuthStates,
  STATE_TTL_MS,
  isAllowedOrigin,
} from './server/utils/authUtils';
import { authRouter, callbackHandler } from './server/routes/auth';
import { catalogRouter } from './server/routes/catalog';
import { marketsRouter } from './server/routes/markets';
import { charactersRouter } from './server/routes/characters';
import { universeRouter } from './server/routes/universe';
import { healthRouter } from './server/routes/health';

const PORT = 3000;

export interface ServerAppOptions {
  includeVite?: boolean;
}

export interface RunningServer {
  app: express.Express;
  server: import('http').Server;
  port: number;
  close: () => Promise<void>;
}

export async function createServerApp(options: ServerAppOptions = {}): Promise<express.Express> {
  const { includeVite = (process.env.NODE_ENV !== 'test') } = options;
  const app = express();

  // Disable identifying Express headers
  app.disable('x-powered-by');

  // Security headers & CORS middleware
  app.use((req, res, next) => {
    // Standard defensive headers (safe in AI Studio iframe environment)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Restrictive Whitelist-Based CORS Policy
    const origin = req.headers.origin;
    if (origin) {
      if (isAllowedOrigin(origin, req)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, If-None-Match');
        res.setHeader('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
          return res.sendStatus(204);
        }
      } else {
        // Unknown or unauthorized origin: refuse CORS headers
        if (req.method === 'OPTIONS') {
          return res.status(403).json({
            error: 'CORS_ORIGIN_NOT_ALLOWED',
            message: 'Origin not allowed by CORS policy',
          });
        }
        // For non-OPTIONS requests from unauthorized origins, proceed without CORS headers
      }
    } else {
      // Absence of Origin header (same-origin, curl, server-to-server)
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
    }

    next();
  });

  // Limit JSON payload size to prevent memory exhaustion
  app.use(express.json({ limit: '1mb' }));

  // 1. Mount Modular API Routers
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/types', catalogRouter);
  app.use('/api/markets', marketsRouter);
  app.use('/api/character', charactersRouter);
  app.use('/api/universe', universeRouter);

  // OAuth callback documents carry validated bearer/refresh tokens and must never be cached.
  app.use(['/auth/callback', '/auth/callback/', '/callback', '/callback/'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // 2. Direct EVE SSO Callback Handlers
  app.get('/auth/callback', callbackHandler);
  app.get('/auth/callback/', callbackHandler);
  app.get('/callback', callbackHandler);
  app.get('/callback/', callbackHandler);

  // In-memory Market Types DB initialization
  const initialCatalog = TypeCatalogService.loadCatalog();
  logEvent('INFO', 'CATALOG', `Type ID Catalog initialized: ${initialCatalog.metadata.status}`, {
    item_count: initialCatalog.metadata.item_count,
    version: initialCatalog.metadata.version,
    checksum: initialCatalog.metadata.checksum.substring(0, 12),
    source: initialCatalog.metadata.source,
    error: initialCatalog.metadata.error,
  });

  // 3. Vite Middleware (dev) / Static file server (prod)
  if (includeVite) {
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
  }

  // 4. Centralized Error Handler (Prevent Stack Leaks)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logEvent('ERROR', 'SERVER', `Unhandled server error on ${req.method} ${req.path}`, {
      message: err?.message || String(err),
      status: err?.status || 500,
    });

    if (res.headersSent) {
      return next(err);
    }

    const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(statusCode).json({
      error: err?.code || 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An internal server error occurred.' : (err?.message || 'Internal server error'),
    });
  });

  return app;
}

export async function startServer(customPort?: number, options: ServerAppOptions = {}): Promise<RunningServer> {
  const app = await createServerApp(options);
  const listenPort = customPort !== undefined ? customPort : PORT;

  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, '0.0.0.0', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr !== null ? addr.port : listenPort;
      logEvent('INFO', 'SERVER', `EVE Trade Server running on http://0.0.0.0:${actualPort}`);
      logEvent('INFO', 'SERVER', `Environment: ${process.env.NODE_ENV || 'development'}`);
      logEvent('INFO', 'SSO', `SSO Status: ${EVE_CLIENT_ID ? 'Client ID configured' : 'EVE_CLIENT_ID missing'}, Callback: ${EVE_CALLBACK_URL || 'Auto-derived'}`);
      logEvent('INFO', 'CATALOG', `Catalog: ${TypeCatalogService.getMetadata().status} (${TypeCatalogService.getMetadata().item_count} items)`);

      resolve({
        app,
        server,
        port: actualPort,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

const isMainModule = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith('server.ts') || 
    process.argv[1].endsWith('server.cjs') || 
    process.argv[1].endsWith('server.js')
  )
);

if (isMainModule && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}

export {
  generateOAuthState,
  validateAndConsumeOAuthState,
  validateRedirectUri,
  renderAuthErrorHtml,
  activeOAuthStates,
  STATE_TTL_MS,
  logEvent,
};
