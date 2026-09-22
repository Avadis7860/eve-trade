import { Router, Request, Response } from 'express';
import { TypeCatalogService } from '../../src/services/typeCatalog';
import { logEvent } from '../utils/logger';
import { EveTypeDetail } from '../../src/types';
import { fetchEsi } from '../utils/esiClient';

export const catalogRouter = Router();

// Dynamic ESI discovery registry - completely isolated from the immutable canonical catalog
const dynamicTypesRegistry = new Map<number, EveTypeDetail>();

const getMarketTypes = () => TypeCatalogService.getTypes();

// 1. Universal ESI Type Lookup / Search
catalogRouter.get('/lookup/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const numId = Number(id);

  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'INVALID_TYPE_ID', message: 'Type ID must be a positive integer' });
  }

  // First check local canonical catalog
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

  // Check dynamic discovery registry
  const dynamic = dynamicTypesRegistry.get(numId);
  if (dynamic) {
    return res.json(dynamic);
  }

  try {
    const result = await fetchEsi<EveTypeDetail>(
      `universe/types/${numId}/?datasource=tranquility&language=en`
    );
    if (!result.ok || !result.data) {
      return res.status(result.status).json({ error: 'Type not found in ESI' });
    }
    res.json(result.data);
  } catch (err: unknown) {
    logEvent('ERROR', 'ESI', `Type lookup failed for ${id}`, { error: String(err) });
    res.status(500).json({ error: 'Failed to lookup type in ESI', message: String(err) });
  }
});

// 2. Type catalog status and health endpoint
catalogRouter.get('/status', (req: Request, res: Response) => {
  res.json(TypeCatalogService.getMetadata());
});

// 3. All tradeable market types endpoint with strict architectural contract
// INVARIANT: Response always contains { metadata, types } with canonical checksum and count
catalogRouter.get('/all', (req: Request, res: Response) => {
  const meta = TypeCatalogService.getMetadata();
  const types = TypeCatalogService.getTypes();

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Catalog-Status', meta.status);
  res.setHeader('X-Catalog-Version', meta.version);
  res.setHeader('X-Catalog-Checksum', meta.checksum);
  res.setHeader('X-Catalog-Count', String(meta.item_count));

  // The /all endpoint is a canonical data boundary. A non-READY catalog must
  // never be exposed as a successful canonical payload, even in legacy flat mode.
  if (meta.status === 'CATALOG_CORRUPTED') {
    logEvent('ERROR', 'CATALOG', 'Rejecting corrupted catalog response', meta);
    return res.status(500).json({ error: 'CATALOG_CORRUPTED', metadata: meta, types: [] });
  }

  if (meta.status !== 'CATALOG_READY') {
    logEvent('WARN', 'CATALOG', 'Rejecting non-ready catalog response', meta);
    return res.status(503).json({ error: 'CATALOG_NOT_READY', metadata: meta, types: [] });
  }

  // Canonical contract: { metadata, types }
  // Legacy flat mode remains available only for an already canonical READY dataset.
  if (req.query.format === 'flat') {
    return res.json(types);
  }

  return res.json({ metadata: meta, types });
});

// 4. Fast search across market types with live ESI fallback
catalogRouter.get('/search', async (req: Request, res: Response) => {
  const rawQ = req.query.q;
  if (rawQ !== undefined && typeof rawQ !== 'string') {
    return res.status(400).json({ error: 'INVALID_QUERY', message: 'Query parameter q must be a string' });
  }
  const query = ((rawQ as string) || '').trim().slice(0, 100).toLowerCase();

  const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 100;
  if (isNaN(rawLimit) || rawLimit <= 0) {
    return res.status(400).json({ error: 'INVALID_LIMIT', message: 'Limit must be a positive number' });
  }
  const limit = Math.min(Math.floor(rawLimit), 500);
  const types = getMarketTypes();

  if (!query) {
    return res.json(types.slice(0, limit));
  }

  const isNumeric = /^\d+$/.test(query);
  if (isNumeric) {
    const numId = Number(query);
    const exact = types.find((t) => t.type_id === numId) || dynamicTypesRegistry.get(numId);
    if (exact) return res.json([exact]);
  }

  const results: EveTypeDetail[] = [];
  for (const t of types) {
    if (t.name.toLowerCase().includes(query) || String(t.type_id) === query) {
      results.push(t);
      if (results.length >= limit) break;
    }
  }

  // Also search dynamic types
  for (const d of dynamicTypesRegistry.values()) {
    if (results.length >= limit) break;
    if (d.name.toLowerCase().includes(query) || String(d.type_id) === query) {
      if (!results.some((r) => r.type_id === d.type_id)) {
        results.push(d);
      }
    }
  }

  // Dynamic ESI universe resolution if local results are few and query length >= 3
  if (results.length < 5 && query.length >= 3) {
    try {
      const esiRes = await fetchEsi<{ inventory_types?: Array<{ id: number; name: string }> }>(
        'universe/ids/?datasource=tranquility&language=en',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([query]),
        }
      );

      if (esiRes.ok && esiRes.data) {
        const idData = esiRes.data;
        if (idData.inventory_types && Array.isArray(idData.inventory_types)) {
          for (const item of idData.inventory_types) {
            if (!results.some((r) => r.type_id === item.id)) {
              try {
                const typeRes = await fetchEsi<any>(
                  `universe/types/${item.id}/?datasource=tranquility&language=en`
                );
                if (typeRes.ok && typeRes.data) {
                  const tData = typeRes.data;
                  if (tData.published) {
                    const newType: EveTypeDetail = {
                      type_id: tData.type_id,
                      name: tData.name,
                      group_id: tData.group_id,
                      category_id: 0,
                      volume: tData.volume || 1.0,
                      average_price: 0,
                      adjusted_price: 0,
                    };
                    results.push(newType);
                    // Register into dynamic registry without mutating canonical catalog SSOT
                    dynamicTypesRegistry.set(newType.type_id, newType);
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
