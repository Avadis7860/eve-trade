import { Router, Request, Response } from 'express';
import { fetchEsi } from '../utils/esiClient';

export const charactersRouter = Router();

// Helper to validate auth header
function getAuthHeader(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header missing' });
    return null;
  }
  return authHeader;
}

// 1. Proxy character orders (active)
charactersRouter.get('/:characterId/orders', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const result = await fetchEsi(`characters/${characterId}/orders/?datasource=tranquility`, {
    headers: { Authorization: authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI orders error', details: result.error });
  }

  res.json(result.data);
});

// 2. Proxy character order history (closed / fulfilled / expired / cancelled orders)
charactersRouter.get('/:characterId/orders/history', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const page = req.query.page || '1';
  const result = await fetchEsi(
    `characters/${characterId}/orders/history/?datasource=tranquility&page=${page}`,
    {
      headers: { Authorization: authHeader },
    }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI order history error', details: result.error });
  }

  res.json(result.data);
});

// 3. Proxy character wallet
charactersRouter.get('/:characterId/wallet', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const result = await fetchEsi<number>(`characters/${characterId}/wallet/?datasource=tranquility`, {
    headers: { Authorization: authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI wallet error', details: result.error });
  }

  res.json({ balance: result.data });
});

// 4. Proxy character skills (for Accounting and Broker Relations)
charactersRouter.get('/:characterId/skills', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const result = await fetchEsi(`characters/${characterId}/skills/?datasource=tranquility`, {
    headers: { Authorization: authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI skills error', details: result.error });
  }

  res.json(result.data);
});

// 5. Proxy character wallet transactions (buy/sell history)
charactersRouter.get('/:characterId/transactions', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const fromIdParam = req.query.from_id ? `&from_id=${encodeURIComponent(String(req.query.from_id))}` : '';
  const result = await fetchEsi(
    `characters/${characterId}/wallet/transactions/?datasource=tranquility${fromIdParam}`,
    {
      headers: { Authorization: authHeader },
    }
  );

  if (result.retryAfter) {
    res.setHeader('Retry-After', String(result.retryAfter));
  }
  if (result.errorLimitRemain !== undefined) {
    res.setHeader('x-esi-error-limit-remain', String(result.errorLimitRemain));
  }
  if (result.errorLimitReset !== undefined) {
    res.setHeader('x-esi-error-limit-reset', String(result.errorLimitReset));
  }

  if (!result.ok) {
    return res.status(result.status).json({
      error: 'ESI transactions error',
      details: result.error,
      retryAfter: result.retryAfter,
      errorLimitRemain: result.errorLimitRemain,
      errorLimitReset: result.errorLimitReset,
    });
  }

  res.json(result.data);
});

// 6. Proxy character wallet journal
charactersRouter.get('/:characterId/journal', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = getAuthHeader(req, res);
  if (!authHeader) return;

  const result = await fetchEsi(
    `characters/${characterId}/wallet/journal/?datasource=tranquility`,
    {
      headers: { Authorization: authHeader },
    }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI wallet journal error', details: result.error });
  }

  res.json(result.data);
});
