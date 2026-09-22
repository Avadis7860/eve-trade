import { Router, Request, Response } from 'express';
import { fetchEsi } from '../utils/esiClient';

export const charactersRouter = Router();

// Helper to validate characterId and auth header
function validateCharacterParams(req: Request, res: Response): { characterId: number; authHeader: string } | null {
  const { characterId } = req.params;
  const numId = Number(characterId);
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({ error: 'INVALID_CHARACTER_ID', message: 'characterId must be a positive integer' });
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.trim()) {
    res.status(401).json({ error: 'Authorization header missing' });
    return null;
  }

  return { characterId: numId, authHeader: authHeader.trim() };
}

// 1. Proxy character orders (active)
charactersRouter.get('/:characterId/orders', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  const result = await fetchEsi(`characters/${params.characterId}/orders/?datasource=tranquility`, {
    headers: { Authorization: params.authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI orders error', details: result.error });
  }

  res.json(result.data);
});

// 2. Proxy character order history (closed / fulfilled / expired / cancelled orders)
charactersRouter.get('/:characterId/orders/history', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  let page = '1';
  if (req.query.page !== undefined) {
    const numPage = Number(req.query.page);
    if (!Number.isInteger(numPage) || numPage < 1 || numPage > 1000) {
      return res.status(400).json({ error: 'INVALID_PAGE', message: 'page must be an integer between 1 and 1000' });
    }
    page = String(numPage);
  }

  const result = await fetchEsi(
    `characters/${params.characterId}/orders/history/?datasource=tranquility&page=${page}`,
    {
      headers: { Authorization: params.authHeader },
    }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI order history error', details: result.error });
  }

  res.json(result.data);
});

// 3. Proxy character wallet
charactersRouter.get('/:characterId/wallet', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  const result = await fetchEsi<number>(`characters/${params.characterId}/wallet/?datasource=tranquility`, {
    headers: { Authorization: params.authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI wallet error', details: result.error });
  }

  res.json({ balance: result.data });
});

// 4. Proxy character skills (for Accounting and Broker Relations)
charactersRouter.get('/:characterId/skills', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  const result = await fetchEsi(`characters/${params.characterId}/skills/?datasource=tranquility`, {
    headers: { Authorization: params.authHeader },
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI skills error', details: result.error });
  }

  res.json(result.data);
});

// 5. Proxy character wallet transactions (buy/sell history)
charactersRouter.get('/:characterId/transactions', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  let fromIdParam = '';
  if (req.query.from_id !== undefined) {
    const numFromId = Number(req.query.from_id);
    if (!Number.isInteger(numFromId) || numFromId <= 0) {
      return res.status(400).json({ error: 'INVALID_FROM_ID', message: 'from_id must be a positive integer' });
    }
    fromIdParam = `&from_id=${numFromId}`;
  }

  const result = await fetchEsi(
    `characters/${params.characterId}/wallet/transactions/?datasource=tranquility${fromIdParam}`,
    {
      headers: { Authorization: params.authHeader },
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
  const params = validateCharacterParams(req, res);
  if (!params) return;

  const result = await fetchEsi(
    `characters/${params.characterId}/wallet/journal/?datasource=tranquility`,
    {
      headers: { Authorization: params.authHeader },
    }
  );

  if (!result.ok) {
    return res.status(result.status).json({ error: 'ESI wallet journal error', details: result.error });
  }

  res.json(result.data);
});

// 7. Proxy character corporation profile
charactersRouter.get('/:characterId/corporation', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  // 1. Fetch character public info to get corporation_id
  const charRes = await fetchEsi<{ corporation_id?: number; name?: string }>(
    `characters/${params.characterId}/?datasource=tranquility`
  );

  if (!charRes.ok || !charRes.data?.corporation_id) {
    return res.status(charRes.status || 500).json({
      error: 'FAILED_TO_RESOLVE_CORPORATION',
      details: charRes.error,
    });
  }

  const corporationId = charRes.data.corporation_id;

  // 2. Fetch corporation public info
  const corpRes = await fetchEsi<{ name?: string; ticker?: string; member_count?: number }>(
    `corporations/${corporationId}/?datasource=tranquility`
  );

  res.json({
    character_id: params.characterId,
    corporation_id: corporationId,
    corporation_name: corpRes.ok && corpRes.data?.name ? corpRes.data.name : `Corporation #${corporationId}`,
    ticker: corpRes.ok && corpRes.data?.ticker ? corpRes.data.ticker : undefined,
    member_count: corpRes.ok ? corpRes.data?.member_count : undefined,
  });
});

// 8. Proxy corporation wallet divisions and balances
charactersRouter.get('/:characterId/corporation/wallets', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  // 1. Resolve corporation_id
  const charRes = await fetchEsi<{ corporation_id?: number }>(
    `characters/${params.characterId}/?datasource=tranquility`
  );

  if (!charRes.ok || !charRes.data?.corporation_id) {
    return res.status(404).json({ error: 'CHARACTER_OR_CORP_NOT_FOUND', details: charRes.error });
  }

  const corporationId = charRes.data.corporation_id;

  // 2. Fetch corporation wallets using character auth token
  const walletRes = await fetchEsi<Array<{ division: number; balance: number }>>(
    `corporations/${corporationId}/wallets/?datasource=tranquility`,
    {
      headers: { Authorization: params.authHeader },
    }
  );

  if (!walletRes.ok) {
    return res.status(walletRes.status).json({
      error: 'CORP_WALLET_ACCESS_DENIED',
      message: 'Character does not have Director or Accountant role in Corporation or scope not granted.',
      corporation_id: corporationId,
      status: walletRes.status,
      details: walletRes.error,
    });
  }

  // 3. Optionally fetch division names
  const divisionsRes = await fetchEsi<{
    wallet?: Array<{ division: number; name: string }>;
  }>(`corporations/${corporationId}/divisions/?datasource=tranquility`, {
    headers: { Authorization: params.authHeader },
  });

  const divisionNameMap = new Map<number, string>();
  if (divisionsRes.ok && divisionsRes.data?.wallet) {
    for (const d of divisionsRes.data.wallet) {
      if (d.division && d.name) {
        divisionNameMap.set(d.division, d.name);
      }
    }
  }

  const wallets = (walletRes.data || []).map((w) => ({
    division: w.division,
    name: divisionNameMap.get(w.division) || (w.division === 1 ? 'Master (Division 1)' : `Division ${w.division}`),
    balance: w.balance,
  }));

  res.json({
    corporation_id: corporationId,
    wallets,
  });
});
