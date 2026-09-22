import { Router, Request, Response } from 'express';
import { characterEsiGateway, setCharacterRetryAfter } from '../gateways/characterEsiGateway';
import { corporationEsiGateway } from '../gateways/corporationEsiGateway';
import type { EsiGatewayResponse, EsiResponseMetadata } from '../utils/esiTypes';

export const charactersRouter = Router();

interface CharacterAuthParams {
  readonly characterId: number;
  readonly bearerCredential: string;
}

// Character-owned authenticated routes accept only a Bearer credential.
// The raw Authorization header never crosses into the ESI gateway: the gateway
// reconstructs the outbound header from the principal context.
function validateCharacterId(req: Request, res: Response): number | null {
  const rawId = req.params.characterId;
  const numId = Number(rawId);
  if (!Number.isInteger(numId) || numId <= 0 || String(numId) !== String(rawId).trim()) {
    res.status(400).json({
      error: 'INVALID_CHARACTER_ID',
      message: 'characterId must be a positive integer',
    });
    return null;
  }
  return numId;
}

function validateCharacterParams(req: Request, res: Response): CharacterAuthParams | null {
  const numId = validateCharacterId(req, res);
  if (numId === null) return null;

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.trim()) {
    res.status(401).json({ error: 'Authorization header missing' });
    return null;
  }

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
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
  result: Pick<EsiGatewayResponse<unknown>, 'status' | 'error' | 'metadata'>,
  label: string,
) {
  sendCharacterMetadata(res, result.metadata);

  return res.status(result.status || 500).json({
    error: label,
    details: result.error?.message,
    esi_error_kind: result.error?.kind,
    retryAfter: result.error?.retryAfterSeconds,
    errorLimitRemain: result.metadata.rateLimit.errorLimitRemain,
    errorLimitReset: result.metadata.rateLimit.errorLimitResetSeconds,
  });
}

function sendCharacterMetadata(res: Response, metadata: EsiResponseMetadata): void {
  const cache = metadata.cache;
  const rateLimit = metadata.rateLimit;
  const pagination = metadata.pagination;

  if (cache.etag !== undefined) res.setHeader('ETag', cache.etag);
  if (cache.expires !== undefined) res.setHeader('Expires', cache.expires);
  if (cache.lastModified !== undefined) res.setHeader('Last-Modified', cache.lastModified);
  if (cache.cacheControl !== undefined) res.setHeader('Cache-Control', cache.cacheControl);
  if (cache.compatibilityDate !== undefined) {
    res.setHeader('X-Compatibility-Date', cache.compatibilityDate);
  }

  if (pagination.xPages !== undefined) res.setHeader('X-Pages', String(pagination.xPages));

  if (rateLimit.rateLimitGroup !== undefined) {
    res.setHeader('X-RateLimit-Group', rateLimit.rateLimitGroup);
  }
  if (rateLimit.rateLimitLimit !== undefined) {
    res.setHeader('X-RateLimit-Limit', rateLimit.rateLimitLimit);
  }
  if (rateLimit.rateLimitRemaining !== undefined) {
    res.setHeader('X-RateLimit-Remaining', String(rateLimit.rateLimitRemaining));
  }
  if (rateLimit.rateLimitUsed !== undefined) {
    res.setHeader('X-RateLimit-Used', String(rateLimit.rateLimitUsed));
  }

  setCharacterRetryAfter(res, metadata);
}

function sendCharacterSuccess<T>(
  res: Response,
  result: Pick<EsiGatewayResponse<T>, 'status' | 'data' | 'metadata'>,
  payload: unknown = result.data,
) {
  sendCharacterMetadata(res, result.metadata);

  // A 304 has no response body and must remain a transport-level cache result.
  if (result.status === 304) {
    return res.status(304).end();
  }

  // Character routes are fail-loud: a source-side 2xx without a payload is not
  // represented as fake zero/null business data.
  if (result.data === null) {
    return res.status(502).json({
      error: 'INVALID_ESI_RESPONSE',
      message: 'ESI returned no payload for a successful character request',
    });
  }

  return res.status(result.status || 200).json(payload);
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI orders error');
    }

    return sendCharacterSuccess(res, result);
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI order history error');
    }

    return sendCharacterSuccess(res, result);
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI wallet error');
    }

    return sendCharacterSuccess(res, result, { balance: result.data });
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI skills error');
    }

    return sendCharacterSuccess(res, result);
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI transactions error');
    }

    return sendCharacterSuccess(res, result);
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

    if (!result.ok) {
      return sendCharacterError(res, result, 'ESI wallet journal error');
    }

    return sendCharacterSuccess(res, result);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'ESI wallet journal gateway error', message: String(err) });
  }
});

// 7. Proxy character corporation profile
charactersRouter.get('/:characterId/corporation', async (req: Request, res: Response) => {
  const characterId = validateCharacterId(req, res);
  if (characterId === null) return;

  try {
    const charRes = await characterEsiGateway.fetchPublicIdentity(characterId);
    if (!charRes.ok || !charRes.data?.corporation_id) {
      return sendCharacterError(res, charRes, 'FAILED_TO_RESOLVE_CORPORATION');
    }

    const corporationId = charRes.data.corporation_id;
    const corpRes = await corporationEsiGateway.fetchProfile(corporationId);

    if (!corpRes.ok) {
      return sendCharacterError(res, corpRes, 'ESI corporation profile error');
    }

    return sendCharacterSuccess(res, corpRes, {
      character_id: characterId,
      corporation_id: corporationId,
      corporation_name: corpRes.data?.name,
      ticker: corpRes.data?.ticker,
      member_count: corpRes.data?.member_count,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'ESI corporation profile gateway error',
      message: String(err),
    });
  }
});

// 8. Proxy corporation wallet divisions and balances
charactersRouter.get('/:characterId/corporation/wallets', async (req: Request, res: Response) => {
  const params = validateCharacterParams(req, res);
  if (!params) return;

  const charRes = await characterEsiGateway.fetchPublicIdentity(params.characterId);
  if (!charRes.ok || !charRes.data?.corporation_id) {
    return res.status(404).json({ error: 'CHARACTER_OR_CORP_NOT_FOUND', details: charRes.error?.message });
  }

  const corporationId = charRes.data.corporation_id;

  const walletRes = await corporationEsiGateway.fetchWallets(
    corporationId,
    params.characterId,
    params.bearerCredential,
  );

  if (!walletRes.ok) {
    return sendCharacterError(res, walletRes, 'CORP_WALLET_ACCESS_DENIED');
  }

  const divisionsRes = await corporationEsiGateway.fetchDivisions(
    corporationId,
    params.characterId,
    params.bearerCredential,
  );

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

  return sendCharacterSuccess(res, walletRes, {
    corporation_id: corporationId,
    wallets,
  });
});
