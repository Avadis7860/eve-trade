"""Regional market data sync (sections 6, 12 & 16).

Orders are the *hot* data: short TTL, regional scope, one cheap request per
``(region, type)`` because ``/markets/{region}/orders/`` accepts a ``type_id``
filter.  Every sync records its freshness in ``order_sync_meta`` so the
analysis layer can decide "cache hit vs re-fetch" without touching the network.

The DB rows are keyed by ``order_id`` and the previous snapshot for the same
``(region, type)`` is cleared first, so expired orders disappear instead of
lingering as phantom liquidity.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from app.config import AppConfig
from app.db import Database
from app.esi.cache import now_utc, utc_now_iso
from app.esi.client import EsiClient

log = logging.getLogger(__name__)

SIDE_ALL = "all"


class MarketSync:
    """Fetches regional order books / history and persists them."""

    def __init__(self, db: Database, client: EsiClient, config: AppConfig) -> None:
        self.db = db
        self.client = client
        self.config = config
        self.orders_ttl = config.sync.market_orders_ttl_seconds
        self.history_ttl = config.sync.market_history_ttl_seconds

    # -- fetch -------------------------------------------------------------
    async def fetch_region_orders(self, region_id: int,
                                  type_id: Optional[int] = None) -> list[dict]:
        """All pages of ``/markets/{region_id}/orders/`` (optionally filtered)."""
        params: dict[str, Any] = {"order_type": "all"}
        if type_id is not None:
            params["type_id"] = int(type_id)
        orders = await self.client.get_paged(f"/markets/{region_id}/orders/", params,
                                             ttl=self.orders_ttl)
        return [o for o in orders if isinstance(o, dict)]

    async def fetch_history(self, region_id: int, type_id: int) -> list[dict]:
        return await self.client.get_paged(f"/markets/{region_id}/history/",
                                           {"type_id": int(type_id)},
                                           ttl=self.history_ttl)

    async def fetch_prices(self) -> list[dict]:
        """Cluster-wide adjusted/average prices (``/markets/prices/``)."""
        return await self.client.get_json("/markets/prices/", ttl=self.orders_ttl)

    # -- persistence -------------------------------------------------------
    @staticmethod
    def to_row(order: dict, region_id: int, captured_at: str) -> dict:
        """Normalise an ESI order document into a ``market_orders`` row."""
        return dict(
            order_id=int(order["order_id"]),
            type_id=int(order["type_id"]),
            region_id=int(region_id),
            system_id=int(order.get("system_id") or 0),
            location_id=int(order.get("location_id") or 0),
            price=float(order.get("price") or 0.0),
            volume_remain=int(order.get("volume_remain") or 0),
            volume_total=int(order.get("volume_total") or 0),
            is_buy_order=int(bool(order.get("is_buy_order"))),
            order_range=str(order.get("range") or ""),
            issued=str(order.get("issued") or ""),
            duration=int(order.get("duration") or 0),
            captured_at=captured_at,
        )

    def is_fresh(self, region_id: int, type_id: int, side: str = SIDE_ALL) -> bool:
        """True when the stored snapshot for ``(region, type)`` is still within TTL."""
        row = self.db.order_sync_status(region_id, type_id, side)
        if not row:
            return False
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires > now_utc()

    async def sync_type_orders(self, region_id: int, type_id: int, *,
                               force: bool = False) -> Optional[int]:
        """Refresh one ``(region, type)`` book.

        Returns the number of orders stored, or ``None`` when the cached
        snapshot was still fresh and ``force`` was not set.
        """
        if not force and self.is_fresh(region_id, type_id):
            return None
        orders = await self.fetch_region_orders(region_id, type_id)
        captured = utc_now_iso()
        expires = (now_utc() + timedelta(seconds=self.orders_ttl)).isoformat()
        self.db.clear_region_type_orders(region_id, type_id)  # drop stale orders
        rows = [self.to_row(o, region_id, captured) for o in orders]
        if rows:
            self.db.upsert_orders(rows)
        self.db.set_order_sync_meta(region_id, type_id, SIDE_ALL, captured, expires)
        log.info("Synced %d orders for type %s in region %s", len(rows), type_id,
                 region_id)
        return len(rows)

    async def sync_orders(self, region_id: int, type_ids: Iterable[int], *,
                          force: bool = False) -> dict[int, Optional[int]]:
        """Sequential per-type refresh (polite to ESI); see section 18."""
        return {int(t): await self.sync_type_orders(region_id, int(t), force=force)
                for t in type_ids}

    # -- bulk full-region sync (the efficient enrichment path) --------------
    def region_fresh(self, region_id: int) -> bool:
        """True when a full-region snapshot is still within TTL."""
        row = self.db.region_sync_status(region_id)
        if not row:
            return False
        expires = datetime.fromisoformat(row["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires > now_utc()

    async def sync_region_orders_bulk(self, region_id: int, *, force: bool = False,
                                      progress: Optional[Any] = None) -> Optional[int]:
        """Pull **every** order in a region in one paginated pass.

        ``GET /markets/{region_id}/orders/`` without ``type_id`` returns all
        books at once (verified live: The Forge => hundreds of pages), which is
        orders of magnitude cheaper than one request per type.  Pages are
        flushed to the DB as they arrive (constant memory), then anything
        captured *before* this snapshot is purged (closed/expired orders) and
        the region-level freshness meta is written.

        Returns the number of orders stored, or ``None`` when the cached
        snapshot was still fresh and ``force`` was not set.
        """
        if not force and self.region_fresh(region_id):
            return None
        captured = utc_now_iso()
        expires = (now_utc() + timedelta(seconds=self.orders_ttl)).isoformat()
        stored = 0
        pages = 0
        async for page, orders in self.client.iter_pages(
                f"/markets/{region_id}/orders/", {"order_type": "all"},
                ttl=self.orders_ttl):
            rows = [self.to_row(o, region_id, captured) for o in orders
                    if isinstance(o, dict)]
            if rows:
                self.db.upsert_orders(rows)
                stored += len(rows)
            pages = page
            if progress is not None:
                progress(page, len(rows), stored)
        # Same ``captured_at`` for the whole snapshot: purge anything older.
        self.db.purge_stale_region_orders(region_id, captured)
        self.db.set_region_sync_meta(region_id, captured, expires, pages, stored)
        log.info("Bulk-synced %s region: %d orders over %d page(s)", region_id,
                 stored, pages)
        return stored