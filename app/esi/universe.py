"""Universe reference-data sync (sections 5, 7 & 16).

ESI only exposes universe data as *ids plus detail endpoints*: a region lists
its constellations, a constellation lists its systems, a system lists its
stations — names live on the detail documents.  That structure is exactly why
hub resolution follows the ``region -> constellation -> system -> station``
chain instead of hardcoding ids (guessed ids were demonstrably wrong during
live validation).

Everything is fetched through the cached :class:`~app.esi.client.EsiClient`
with the long ``universe_ttl`` so a second sync costs almost nothing.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Iterable, Optional

from app.config import AppConfig, MarketHub, persist_settings
from app.db import Database
from app.esi.cache import utc_now_iso
from app.esi.client import EsiClient, EsiNotFoundError

log = logging.getLogger(__name__)


class UniverseSync:
    """Populates the static universe tables from ESI and resolves hub ids."""

    def __init__(self, db: Database, client: EsiClient, config: AppConfig) -> None:
        self.db = db
        self.client = client
        self.config = config
        self.ttl = config.sync.universe_ttl_seconds
        self.highsec_threshold = config.high_sec_threshold

    # -- helpers -----------------------------------------------------------
    @staticmethod
    async def _gather(coros: Iterable[Any], batch_size: int = 50) -> list[Any]:
        """``asyncio.gather`` in bounded batches (avoids 10k pending tasks)."""
        pending = list(coros)
        results: list[Any] = []
        for i in range(0, len(pending), batch_size):
            results.extend(await asyncio.gather(*pending[i:i + batch_size]))
        return results

    # -- regions -----------------------------------------------------------
    async def region_ids(self) -> list[int]:
        return await self.client.get_paged("/universe/regions/", ttl=self.ttl)

    async def find_region_id(self, name: str) -> Optional[int]:
        """Resolve a region *name* to its id (cache first, then ESI)."""
        cached = self.db.resolve_region_id(name)
        if cached is not None:
            return cached
        for region_id in await self.region_ids():
            detail = await self.client.get_json(f"/universe/regions/{region_id}/",
                                                ttl=self.ttl)
            self._store_region(region_id, detail)
            if detail.get("name") == name:
                return region_id
        return None

    def _store_region(self, region_id: int, detail: dict) -> None:
        self.db.upsert_region(region_id, str(detail.get("name") or region_id),
                              str(detail.get("description") or ""))

    async def sync_region(self, region_id: int, *, with_systems: bool = True,
                          with_stations: bool = False) -> dict:
        """Region detail, then its constellations (and optionally their systems)."""
        detail = await self.client.get_json(f"/universe/regions/{region_id}/",
                                            ttl=self.ttl)
        self._store_region(region_id, detail)
        if with_systems:
            for constellation_id in detail.get("constellations", []):
                await self.sync_constellation(constellation_id,
                                              with_stations=with_stations)
        log.info("Region %s (%s): %d constellations cached", region_id,
                 detail.get("name"), len(detail.get("constellations", [])))
        return detail

    async def sync_constellation(self, constellation_id: int, *,
                                 with_stations: bool = False) -> dict:
        c = await self.client.get_json(f"/universe/constellations/{constellation_id}/",
                                       ttl=self.ttl)
        self.db.upsert_constellation(constellation_id,
                                     str(c.get("name") or constellation_id),
                                     int(c.get("region_id") or 0))
        await self._gather(self.sync_system(sid, with_stations=with_stations)
                           for sid in c.get("systems", []))
        return c

    # -- systems / stations ------------------------------------------------
    async def sync_system(self, system_id: int, *, with_stations: bool = False) -> Optional[dict]:
        """System detail -> ``solar_systems`` row (region via its constellation).

        ESI's system document carries no ``region_id``, so it is read back from
        the constellation row written by :meth:`sync_constellation`.
        """
        try:
            s = await self.client.get_json(f"/universe/systems/{system_id}/",
                                           ttl=self.ttl)
        except EsiNotFoundError:
            return None
        security = float(s.get("security_status") or 0.0)
        constellation_id = int(s.get("constellation_id") or 0)
        row = self.db.fetchone(
            "SELECT region_id FROM constellations WHERE constellation_id=?",
            (constellation_id,))
        region_id = int(row["region_id"]) if row else 0
        self.db.upsert_system(system_id, str(s.get("name") or system_id), region_id,
                              constellation_id, security,
                              security >= self.highsec_threshold)
        if with_stations:
            for station_id in s.get("stations", []):
                await self.sync_station(station_id)
        return s

    async def sync_station(self, station_id: int) -> Optional[dict]:
        try:
            st = await self.client.get_json(f"/universe/stations/{station_id}/",
                                            ttl=self.ttl)
        except EsiNotFoundError:  # player-owned / removed station
            return None
        self.db.upsert_station(station_id, str(st.get("name") or station_id),
                               int(st.get("system_id") or 0), st.get("type_id"),
                               has_market=True)
        return st

    # -- types / groups / categories (section 7 taxonomy) ------------------
    async def sync_type(self, type_id: int) -> Optional[dict]:
        """Type detail + its group and category (so browsing works from day one)."""
        try:
            t = await self.client.get_json(f"/universe/types/{type_id}/", ttl=self.ttl)
        except EsiNotFoundError:
            return None
        group_id = int(t.get("group_id") or 0)
        category_id = await self._ensure_group(group_id)
        packaged = t.get("packaged_volume")
        self.db.upsert_type(dict(
            type_id=type_id,
            name=str(t.get("name") or type_id),
            group_id=group_id,
            category_id=category_id,
            volume=float(t.get("volume") or 0.0),
            packaged_volume=float(packaged) if packaged is not None else None,
            portion_size=int(t.get("portion_size") or 1),
            published=int(bool(t.get("published", True))),
            market_group_id=t.get("market_group_id"),
            fetched_at=utc_now_iso(),
        ))
        return t

    async def _ensure_group(self, group_id: int) -> Optional[int]:
        row = self.db.fetchone("SELECT category_id FROM groups WHERE group_id=?",
                               (group_id,))
        if row is None:
            g = await self.client.get_json(f"/universe/groups/{group_id}/", ttl=self.ttl)
            await self._ensure_category(g.get("category_id"))
            self.db.upsert_group(group_id, str(g.get("name") or group_id),
                                 int(g.get("category_id") or 0), utc_now_iso())
            row = self.db.fetchone("SELECT category_id FROM groups WHERE group_id=?",
                                   (group_id,))
        return row["category_id"] if row else None

    async def _ensure_category(self, category_id: Optional[int]) -> None:
        if not category_id:
            return
        exists = self.db.fetchone(
            "SELECT category_id FROM categories WHERE category_id=?", (category_id,))
        if exists:
            return
        c = await self.client.get_json(f"/universe/categories/{category_id}/", ttl=self.ttl)
        self.db.upsert_category(int(category_id), str(c.get("name") or category_id),
                                utc_now_iso())

    async def sync_types(self, type_ids: Iterable[int], *, batch_size: int = 100) -> int:
        """Fetch many types (concurrently, in batches); returns the count stored."""
        ids = [int(t) for t in type_ids]
        stored = 0
        for i in range(0, len(ids), batch_size):
            results = await asyncio.gather(
                *(self.sync_type(t) for t in ids[i:i + batch_size]))
            stored += sum(1 for r in results if r is not None)
        return stored

    async def all_type_ids(self) -> list[int]:
        return await self.client.get_paged("/universe/types/", ttl=self.ttl)

    # -- bulk / lazy type catalog (EMB-style browsing) ----------------------
    async def enrich_type_names(self, type_ids: Iterable[int], *,
                                batch_size: int = 1000) -> int:
        """Fill ``types.name`` for many ids via ``POST /universe/names/``.

        The endpoint takes a *raw JSON array* of ids (max 1000 per call,
        verified live) and answers ``[{category, id, name}]``; unknown ids are
        simply omitted.  This is the cheap bulk path (~20 requests for ~10k
        traded types) — group/category tagging happens separately via
        :meth:`tag_group_members`.
        """
        ids = sorted({int(t) for t in type_ids})
        stored = 0
        for i in range(0, len(ids), batch_size):
            batch = ids[i:i + batch_size]
            entries = await self.client.post_json("/universe/names/", batch,
                                                  ttl=self.ttl)
            rows = [dict(type_id=int(e["id"]), name=str(e["name"]),
                         fetched_at=utc_now_iso())
                    for e in (entries or []) if isinstance(e, dict)
                    and "id" in e and "name" in e]
            self.db.upsert_type_names(rows)
            stored += len(rows)
        return stored

    async def tag_group_members(self, group_id: int) -> int:
        """Tag a group's member types with ``group_id`` / ``category_id``.

        One cached request (``/universe/groups/{id}/`` lists its ``types``) —
        no per-type fetches.  Name-only rows inserted by
        :meth:`enrich_type_names` thereby join the taxonomy tree lazily, as the
        user browses groups.
        """
        g = await self.client.get_json(f"/universe/groups/{group_id}/", ttl=self.ttl)
        category_id = await self._ensure_group(group_id)
        members = [int(t) for t in g.get("types", [])]
        return self.db.set_types_group(group_id, category_id, members)

    # -- hub resolution (section 5) ----------------------------------------
    async def sync_hub_regions(self, *, with_stations: bool = True) -> dict[str, int]:
        """Cache the taxonomy (systems + stations) of every configured hub region."""
        resolved: dict[str, int] = {}
        for hub in self.config.market_hubs:
            region_id = hub.region_id or await self.find_region_id(hub.region)
            if region_id is None:
                log.warning("Region %r (hub %s) not found on ESI", hub.region, hub.name)
                continue
            await self.sync_region(region_id, with_stations=with_stations)
            resolved[hub.name] = region_id
        return resolved

    async def sync_hub_stations(self) -> int:
        """Fetch station details for the *hub systems* only.

        A full region sweep would spend thousands of requests on stations nobody
        trades at; hub resolution only needs the systems that host a hub, so the
        hub bootstrap stays cheap.  Returns the number of hub systems refreshed.
        """
        refreshed = 0
        for hub in self.config.market_hubs:
            if hub.system_id is None:
                row = self.db.resolve_system_in_region(hub.solar_system, hub.region_id)
                if row is None:
                    log.warning("Hub %s: system %r missing from the cache; run a "
                                "region sync first", hub.name, hub.solar_system)
                    continue
                hub.system_id = int(row["system_id"])
            await self.sync_system(hub.system_id, with_stations=True)
            refreshed += 1
        return refreshed

    def resolve_hubs(self, *, persist: bool = False) -> list[MarketHub]:
        """Fill ``region_id`` / ``system_id`` / ``station_id`` from the cache.

        Delegates to :meth:`app.db.Database.resolve_hub_locations` and only adds
        the operator-facing warnings (an unresolved hub means its region/system
        names are not in the cache yet, so :meth:`sync_hubs` must run first).
        """
        for hub in self.config.market_hubs:
            self.db.resolve_hub_locations(hub)
            if hub.region_id is None:
                log.warning("Hub %s: region %r not found in the cache; run "
                            "sync_universe.py --hubs first", hub.name, hub.region)
            elif hub.system_id is None:
                log.warning("Hub %s: system %r not found in region %s",
                            hub.name, hub.solar_system, hub.region_id)
            elif hub.station and hub.station_id is None:
                log.warning("Hub %s: station %r not found in system %s",
                            hub.name, hub.station, hub.system_id)
        if persist:
            persist_settings(self.config)
        return list(self.config.market_hubs)

    async def sync_hubs(self, *, with_stations: bool = True,
                        persist: bool = True, all_stations: bool = False) -> list[MarketHub]:
        """One-shot hub bootstrap: sync the regions, then resolve names -> ids.

        Order matters and is deliberate:

        1. sync every hub region (systems only) so names can be resolved,
        2. resolve ``region_id`` / ``system_id`` from the freshly cached rows,
        3. fetch the stations of just those hub systems,
        4. resolve ``station_id`` and (optionally) persist the ids to
           ``config.yaml`` so later runs need no network at all.

        ``all_stations=True`` additionally sweeps every station of every hub
        region (a complete station catalogue, but thousands of requests).
        """
        await self.sync_hub_regions(with_stations=all_stations)
        self.resolve_hubs()
        if with_stations:
            await self.sync_hub_stations()
        return self.resolve_hubs(persist=persist)
