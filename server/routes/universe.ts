import { Router, Request, Response } from 'express';

export const universeRouter = Router();

// 1. Resolve station or location names from ESI
universeRouter.get('/location/:locationId', async (req: Request, res: Response) => {
  const { locationId } = req.params;
  const locIdNum = Number(locationId);

  // If it's a standard NPC station (ID usually between 60000000 and 64000000)
  if (locIdNum >= 60000000 && locIdNum < 64000000) {
    try {
      const esiRes = await fetch(
        `https://esi.evetech.net/latest/universe/stations/${locIdNum}/?datasource=tranquility`,
        {
          headers: { 'User-Agent': 'eve-trade-interregional/0.2' },
        }
      );
      if (esiRes.ok) {
        const stationData = await esiRes.json();
        return res.json({ location_id: locIdNum, name: stationData.name, system_id: stationData.system_id });
      }
    } catch {}
  }

  // Try universe/structures if auth header is present
  const authHeader = req.headers.authorization;
  if (authHeader && locIdNum > 100000000) {
    try {
      const structRes = await fetch(
        `https://esi.evetech.net/latest/universe/structures/${locIdNum}/?datasource=tranquility`,
        {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'eve-trade-interregional/0.2',
          },
        }
      );
      if (structRes.ok) {
        const structData = await structRes.json();
        return res.json({ location_id: locIdNum, name: structData.name, system_id: structData.solar_system_id });
      }
    } catch {}
  }

  res.json({ location_id: locIdNum, name: `Location #${locIdNum}` });
});
