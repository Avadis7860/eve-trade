import { Router, Request, Response } from 'express';
import { characterEsiGateway, setCharacterRetryAfter } from '../gateways/characterEsiGateway';

export const charactersRouter = Router();

interface CharacterAuthParams {
  readonly characterId: number;
  readonly bearerCredential: string;
}

// Character-owned authenticated routes accept only a Bearer credential.
// The raw Authorization header never crosses into the ESI gateway: the gateway
// reconstructs the outbound header from the principal context.
function validateCharacterParams(req: Request, res: Response): CharacterAuthParams | null {
  const numId = Number(req.params.characterId);
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({
      error: 'INVALID_CHARACTER_ID',
      message: 'characterId must be a positive integer',
    });
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.trim()) {
    res.status(401).json({ error: 'Authorization header missing' });
    return null;
  }

  const match = authHeader.trim().match(/^Bearer\\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    res.status(401).json({
      error: 'INVALID_AUTHORIZATION',
      message: 'Authorization header must use the Bearer scheme',
    });
    return null;
  }

  return {
    characterId: numId,
    bearerCredential: match[1].trim(),
  };
}

function sendCharacterError(
  res: Response,
  result: { status: number; error?: { kind: string; message: string; retryAfterSeconds?: number } },
  label: string,
) {
  return res.status(result.status || 500).json({
    error: label,
    details: result.error?.message,
    esi_error_kind: result.error?.kind,
    retryAfter: result.error?.retryAfterSeconds,
  });
}

function sendMetadata(res: Response, result: { metadata: ReturnType<typeof characterEsiGateway.fetchOrders> extends Promise<infer T> ? T extends { metadata: infer M } ? M : never : never }) {
  setCharacterRetryAfter(res, result.metadata);
}

// 1. Proxy character orders (active)
charactersRouter.get('/:characterId/orders', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  try {
    const result = await characterEsiGateway.fetchOrders(
      params.characterId,
      params.bearerCredential,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI orders error');
    }

    return res.json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI orders gateway error', message: String(err) });
  }
});

// 2. Proxy character order history
charactersRouter.get('/:characterId/orders/history', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  let page = 1;
  if (req.query.page !== undefined) {
    const numPage = Number(req.query.page);
    if (!Number.isInteger(numPage) || numPage < 1 || numPage > 1000) {
      return res.status(400).json({
        error: 'INVALID_PAGE',
        message: 'page must be an integer between 1 and 1000',
      });
    }
    page = numPage;
  }

  try {
    const result = await characterEsiGateway.fetchOrderHistory(
      params.characterId,
      params.bearerCredential,
      page,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI order history error');
    }

    return res.json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI order history gateway error', message: String(err) });
  }
});

// 3. Proxy character wallet. Balance is returned unchanged, including negative ISK.
charactersRouter.get('/:characterId/wallet', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  try {
    const result = await characterEsiGateway.fetchWallet(
      params.characterId,
      params.bearerCredential,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI wallet error');
    }

    return res.json({ balance: result.data });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI wallet gateway error', message: String(err) });
  }
});

// 4. Proxy character skills
charactersRouter.get('/:characterId/skills', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  try {
    const result = await characterEsiGateway.fetchSkills(
      params.characterId,
      params.bearerCredential,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI skills error');
    }

    return res.json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI skills gateway error', message: String(err) });
  }
});

// 5. Proxy character wallet transactions (buy/sell history)
charactersRouter.get('/:characterId/transactions', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  let fromId: number | undefined;
  if (req.query.from_id !== undefined) {
    const numFromId = Number(req.query.from_id);
    if (!Number.isInteger(numFromId) || numFromId <= 0) {
      return res.status(400).json({
        error: 'INVALID_FROM_ID',
        message: 'from_id must be a positive integer',
      });
    }
    fromId = numFromId;
  }

  try {
    const result = await characterEsiGateway.fetchTransactions(
      params.characterId,
      params.bearerCredential,
      fromId,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return res.status(result.status).json({
        error: 'ESI transactions error',
        details: result.error?.message,
        esi_error_kind: result.error?.kind,
        retryAfter: result.error?.retryAfterSeconds,
        errorLimitRemain: result.metadata.rateLimit.errorLimitRemain,
        errorLimitReset: result.metadata.rateLimit.errorLimitResetSeconds,
      });
    }

    return res.json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI transactions gateway error', message: String(err) });
  }
});

// 6. Proxy character wallet journal
charactersRouter.get('/:characterId/journal', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  try {
    const result = await characterEsiGateway.fetchJournal(
      params.characterId,
      params.bearerCredential,
    );

    sendMetadata(res, result);
    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI wallet journal error');
    }

    return res.json(result.data);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI wallet journal gateway error', message: String(err) });
  }
});

// 7. Character corporation identity remains in the corporation topology phase.
charactersRouter.get('/:characterId/corporation', async (req: Request, res: Response) => {
  const numId = Number(req.params.characterId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({
      error: 'INVALID_CHARACTER_ID',
      message: 'characterId must be a positive integer',
    });
  }

  const charRes = await characterEsiGateway.fetchPublicIdentity(numId);
  if (!charRes.ok || !charRes.data?.corporation_id) {
    return res.status(charRes.status || 500).json({
      error: 'FAILED_TO_RESOLVE_CORPORATION',
      details: charRes.error?.message,
      esi_error_kind: charRes.error?.kind,
    });
  }

  const corporationId = charRes.data.corporation_id;

  // Corporation public information remains intentionally outside Phase 4.4.
  // It will be owned by CorporationEsiGateway in the corporation topology phase.
  return res.json({
    character_id: numId,
    corporation_id: corporationId,
  });
});

// 8. Corporation wallet divisions remain in the corporation wallet phase.
charactersRouter.get('/:characterId/corporation/wallets', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  return res.status(501).json({
    error: 'CORPORATION_WALLET_MIGRATION_PENDING',
    message: 'Corporation wallet access is handled by the corporation ESI gateway phase.',
  });
});
