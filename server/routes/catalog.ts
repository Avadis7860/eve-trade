import { Router, Request, Response } from 'express';
import { TypeCatalogService } from '../../src/services/typeCatalog';
import { logEvent } from '../utils/logger';

export const catalogRouter = Router();

const getMarketTypes = () => TypeCatalogService.getTypes();

// 1. Universal ESI Type Lookup / Search
catalogRouter.get('/lookup/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const numId = Number(id);

  // First check local in-memory DB of types
  const local = getMarketTypes().find((t) => t.type_id === numId);
  if (local) {
    return res.json({
      type_id: local.type_id,
      name: local.name,
      group_id: local.group_id,
      category_id: local.category_id,
      volume: local.volume,
      average_price: local.average_price,
      adjusted_price: local.adjusted_price,
    });
  }

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/universe/types/${id}/?datasource=tranquility&language=en`,
      {
        headers: { 'User-Agent': 'eve-trade-interregional/0.2' },
      }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Type not found in ESI' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    logEvent('ERROR', 'ESI', `Type lookup failed for ${id}`, { error: String(err) });
    res.status(500).json({ error: 'Failed to lookup type in ESI', message: String(err) });
  }
});

// 2. Type catalog status and health endpoint
catalogRouter.get('/status', (req: Request, res: Response) => {
  res.json(TypeCatalogService.getMetadata());
});

// 3. All tradeable market types endpoint with validation headers
catalogRouter.get('/all', (req: Request, res: Response) => {
  const meta = TypeCatalogService.getMetadata();
  const types = TypeCatalogService.getTypes();

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Catalog-Status', meta.status);
  res.setHeader('X-Catalog-Version', meta.version);
  res.setHeader('X-Catalog-Checksum', meta.checksum);
  res.setHeader('X-Catalog-Count', String(meta.item_count));

  if (meta.status === 'CATALOG_CORRUPTED' && types.length === 0) {
    logEvent('ERROR', 'CATALOG', 'Serving empty corrupted catalog response', meta);
    return res.status(500).json({ error: 'CATALOG_CORRUPTED', metadata: meta, types: [] });
  }
  if (meta.status === 'CATALOG_UNAVAILABLE' && types.length === 0) {
    logEvent('ERROR', 'CATALOG', 'Serving unavailable catalog response', meta);
    return res.status(503).json({ error: 'CATALOG_UNAVAILABLE', metadata: meta, types: [] });
  }

  if (req.query.include_metadata === 'true') {
    return res.json({ metadata: meta, types });
  }
  res.json(types);
});

// 4. Fast search across market types with live ESI fallback
catalogRouter.get('/search', async (req: Request, res: Response) => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const types = getMarketTypes();

  if (!query) {
    return res.json(types.slice(0, limit));
  }

  const isNumeric = /^\d+$/.test(query);
  if (isNumeric) {
    const numId = Number(query);
    const exact = types.find((t) => t.type_id === numId);
    if (exact) return res.json([exact]);
  }

  const results: typeof types = [];
  for (const t of types) {
    if (t.name.toLowerCase().includes(query) || String(t.type_id) === query) {
      results.push(t);
      if (results.length >= limit) break;
    }
  }

  // Dynamic ESI universe resolution if local results are few and query length >= 3
  if (results.length < 5 && query.length >= 3) {
    try {
      const esiRes = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'eve-trade-interregional/0.2 (+https://github.com/avadis/eve-trade)',
        },
        body: JSON.stringify([query]),
      });

      if (esiRes.ok) {
        const idData = await esiRes.json();
        if (idData.inventory_types && Array.isArray(idData.inventory_types)) {
          for (const item of idData.inventory_types) {
            if (!results.some((r) => r.type_id === item.id)) {
              try {
                const typeRes = await fetch(
                  `https://esi.evetech.net/latest/universe/types/${item.id}/?datasource=tranquility&language=en`,
                  { headers: { 'User-Agent': 'eve-trade-interregional/0.2' } }
                );
                if (typeRes.ok) {
                  const tData = await typeRes.json();
                  if (tData.published) {
                    const newType = {
                      type_id: tData.type_id,
                      name: tData.name,
                      group_id: tData.group_id,
                      category_id: 0,
                      volume: tData.volume || 1.0,
                      average_price: 0,
                      adjusted_price: 0,
                    };
                    results.push(newType);
                    getMarketTypes().push(newType);
                  }
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('ESI universe/ids dynamic resolution error:', err);
    }
  }

  res.json(results);
});
