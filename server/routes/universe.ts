import { Router, Request, Response } from 'express';
import { fetchEsi } from '../utils/esiClient';

export const universeRouter = Router();

// 1. Resolve station or location names from ESI
universeRouter.get('/location/:locationId', async (req: Request, res: Response) => {
  const { locationId } = req.params;
  const locIdNum = Number(locationId);

  // If it's a standard NPC station (ID usually between 60000000 and 64000000)
  if (locIdNum >= 60000000 && locIdNum < 64000000) {
    const result = await fetchEsi<{ name: string; system_id: number }>(
      `universe/stations/${locIdNum}/?datasource=tranquility`
    );
    if (result.ok && result.data) {
      return res.json({ location_id: locIdNum, name: result.data.name, system_id: result.data.system_id });
    }
  }

  // Try universe/structures if auth header is present
  const authHeader = req.headers.authorization;
  if (authHeader && locIdNum > 100000000) {
    const structResult = await fetchEsi<{ name: string; solar_system_id: number }>(
      `universe/structures/${locIdNum}/?datasource=tranquility`,
      {
        headers: { Authorization: authHeader },
      }
    );
    if (structResult.ok && structResult.data) {
      return res.json({
        location_id: locIdNum,
        name: structResult.data.name,
        system_id: structResult.data.solar_system_id,
      });
    }
  }

  res.json({ location_id: locIdNum, name: `Location #${locIdNum}` });
});
