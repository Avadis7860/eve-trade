import { Router, Request, Response } from 'express';

export const charactersRouter = Router();

// 1. Proxy character orders (active)
charactersRouter.get('/:characterId/orders', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/orders/?datasource=tranquility`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI orders error', details: errText });
    }

    const orders = await response.json();
    res.json(orders);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch orders from ESI', message: String(err) });
  }
});

// 2. Proxy character order history (closed / fulfilled / expired / cancelled orders)
charactersRouter.get('/:characterId/orders/history', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const page = req.query.page || '1';
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/orders/history/?datasource=tranquility&page=${page}`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI order history error', details: errText });
    }

    const history = await response.json();
    res.json(history);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch order history from ESI', message: String(err) });
  }
});

// 3. Proxy character wallet
charactersRouter.get('/:characterId/wallet', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/wallet/?datasource=tranquility`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI wallet error', details: errText });
    }

    const balance = await response.json();
    res.json({ balance });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch wallet from ESI', message: String(err) });
  }
});

// 4. Proxy character skills (for Accounting and Broker Relations)
charactersRouter.get('/:characterId/skills', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/skills/?datasource=tranquility`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI skills error', details: errText });
    }

    const skills = await response.json();
    res.json(skills);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch skills from ESI', message: String(err) });
  }
});

// 5. Proxy character wallet transactions (buy/sell history)
charactersRouter.get('/:characterId/transactions', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/wallet/transactions/?datasource=tranquility`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI transactions error', details: errText });
    }

    const transactions = await response.json();
    res.json(transactions);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch transactions from ESI', message: String(err) });
  }
});

// 6. Proxy character wallet journal
charactersRouter.get('/:characterId/journal', async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/wallet/journal/?datasource=tranquility`,
      {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'eve-trade-interregional/0.2',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'ESI wallet journal error', details: errText });
    }

    const journal = await response.json();
    res.json(journal);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch journal from ESI', message: String(err) });
  }
});
