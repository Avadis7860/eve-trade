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

  app.use(express.json());

  // 1. Mount Modular API Routers
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/types', catalogRouter);
  app.use('/api/markets', marketsRouter);
  app.use('/api/character', charactersRouter);
  app.use('/api/universe', universeRouter);

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
