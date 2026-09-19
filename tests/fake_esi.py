"""A tiny in-memory stand-in for the ESI endpoints used by ``app.esi.*``.

Tests drive :class:`~app.esi.client.EsiClient` with
``httpx.MockTransport(fake.handle)`` so nothing ever touches the network.  The
handler answers with a stable ``ETag`` per body and honours ``If-None-Match``
(``304``) exactly like ESI, which lets the tests exercise cache revalidation.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

import httpx

REGION_ID = 10000002
CONSTELLATION_ID = 20000020
SYSTEM_ID = 30000142
OTHER_SYSTEM_ID = 30000140
STATION_ID = 60003760
TYPE_ID = 34
GROUP_ID = 18
CATEGORY_ID = 4
STATION_NAME = "Jita IV - Moon 4 - Caldari Navy Assembly Plant"

# A second region so hub resolution / multi-hub flows can be exercised
DOMAIN_ID = 10000043
THRONE_WORLDS_ID = 20000322
AMARR_SYSTEM_ID = 30002187
AMARR_STATION_ID = 60008494
AMARR_STATION_NAME = "Amarr VIII (Oris) - Emperor Family Academy"


class FakeEsi:
    """Deterministic subset of the ESI universe / market endpoints."""

    def __init__(self) -> None:
        self.regions: dict[int, dict] = {
            REGION_ID: {"region_id": REGION_ID, "name": "The Forge",
                        "description": "The greater the State becomes...",
                        "constellations": [CONSTELLATION_ID]},
            DOMAIN_ID: {"region_id": DOMAIN_ID, "name": "Domain",
                        "description": "The heart of the Amarr Empire",
                        "constellations": [THRONE_WORLDS_ID]},
        }
        self.constellations: dict[int, dict] = {
            CONSTELLATION_ID: {"constellation_id": CONSTELLATION_ID, "name": "Kimotoro",
                               "region_id": REGION_ID,
                               "systems": [SYSTEM_ID, OTHER_SYSTEM_ID]},
            THRONE_WORLDS_ID: {"constellation_id": THRONE_WORLDS_ID,
                               "name": "Throne Worlds", "region_id": DOMAIN_ID,
                               "systems": [AMARR_SYSTEM_ID]},
        }
        self.systems: dict[int, dict] = {
            SYSTEM_ID: {"system_id": SYSTEM_ID, "name": "Jita",
                        "constellation_id": CONSTELLATION_ID,
                        "security_status": 0.9459131360054016,
                        "stations": [STATION_ID]},
            OTHER_SYSTEM_ID: {"system_id": OTHER_SYSTEM_ID, "name": "Perimeter",
                              "constellation_id": CONSTELLATION_ID,
                              "security_status": 0.879, "stations": []},
            AMARR_SYSTEM_ID: {"system_id": AMARR_SYSTEM_ID, "name": "Amarr",
                              "constellation_id": THRONE_WORLDS_ID,
                              "security_status": 0.949, "stations": [AMARR_STATION_ID]},
        }
        self.stations: dict[int, dict] = {
            STATION_ID: {"station_id": STATION_ID, "name": STATION_NAME,
                         "system_id": SYSTEM_ID, "type_id": 52678},
            AMARR_STATION_ID: {"station_id": AMARR_STATION_ID,
                               "name": AMARR_STATION_NAME,
                               "system_id": AMARR_SYSTEM_ID, "type_id": 52678},
        }
        self.types: dict[int, dict] = {
            TYPE_ID: {"type_id": TYPE_ID, "name": "Tritanium", "group_id": GROUP_ID,
                      "volume": 0.01, "packaged_volume": 0.01, "portion_size": 1,
                      "published": True, "market_group_id": 1857},
        }
        self.groups: dict[int, dict] = {
            GROUP_ID: {"group_id": GROUP_ID, "name": "Mineral",
                       "category_id": CATEGORY_ID, "types": [TYPE_ID]},
        }
        self.categories: dict[int, dict] = {
            CATEGORY_ID: {"category_id": CATEGORY_ID, "name": "Material",
                          "groups": [GROUP_ID]},
        }
        # (region_id, type_id) -> list of pages; an absent key means 404 (empty book)
        # key (region_id, None) = full-region book (no ``type_id`` filter)
        self.orders: dict[tuple[int, int | None], list[list[dict]]] = {}
        self.history: dict[tuple[int, int], list[dict]] = {}
        self.prices: list[dict] = [{"type_id": TYPE_ID, "adjusted_price": 4.1,
                                    "average_price": 3.9}]
        # ids answerable by POST /universe/names/ (defaults to the type table)
        self.known_names: dict[int, str] = {}
        # observability
        self.requests: list[httpx.Request] = []
        self.not_modified = 0

    # -- transport ---------------------------------------------------------
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        parts = [p for p in request.url.path.split("/") if p]
        if parts and parts[0] == "latest":
            parts = parts[1:]
        if request.method == "POST":
            return self._route_post(request, parts)
        return self._route(request, parts)

    def request_count(self, needle: str) -> int:
        return sum(1 for r in self.requests if needle in r.url.path)

    def post_count(self, needle: str) -> int:
        return sum(1 for r in self.requests
                   if needle in r.url.path and r.method == "POST")

    # -- POST endpoints ------------------------------------------------------
    def _route_post(self, request: httpx.Request, parts: list[str]) -> httpx.Response:
        if parts == ["universe", "names"]:
            try:
                ids = json.loads(request.content or b"null")
            except ValueError:
                ids = None
            if not isinstance(ids, list) or not ids or len(ids) > 1000:
                return httpx.Response(400, json={
                    "error": "Invalid body JSON type, 'ids' is required"},
                    request=request)
            entries = [{"category": "inventory_type", "id": int(i),
                        "name": self.known_names[int(i)]}
                       for i in ids if int(i) in self.known_names]
            return self._json(request, entries)
        return httpx.Response(404, json={"error": "not found"}, request=request)

    # -- routing -----------------------------------------------------------
    def _route(self, request: httpx.Request, parts: list[str]) -> httpx.Response:
        missing = httpx.Response(404, json={"error": "not found"}, request=request)
        if not parts or parts[0] not in ("universe", "markets"):
            return missing
        if parts[0] == "universe":
            return self._route_universe(request, parts[1:], missing)
        return self._route_markets(request, parts[1:], missing)

    def _route_universe(self, request: httpx.Request, parts: list[str],
                        missing: httpx.Response) -> httpx.Response:
        section = parts[0] if parts else ""
        ident = int(parts[1]) if len(parts) > 1 else None
        if section == "regions":
            if ident is None:
                return self._json(request, sorted(self.regions),
                                  headers={"x-pages": "1"})
            return self._lookup(request, self.regions, ident, missing)
        if section == "constellations":
            return self._lookup(request, self.constellations, ident, missing)
        if section == "systems":
            if ident is None:
                return self._json(request, sorted(self.systems))
            return self._lookup(request, self.systems, ident, missing)
        if section == "stations":
            return self._lookup(request, self.stations, ident, missing)
        if section == "types":
            if ident is None:
                return self._json(request, sorted(self.types),
                                  headers={"x-pages": "1"})
            return self._lookup(request, self.types, ident, missing)
        if section == "groups":
            return self._lookup(request, self.groups, ident, missing)
        if section == "categories":
            return self._lookup(request, self.categories, ident, missing)
        return missing

    def _route_markets(self, request: httpx.Request, parts: list[str],
                       missing: httpx.Response) -> httpx.Response:
        if parts and parts[0] == "prices":
            return self._json(request, self.prices)
        if len(parts) != 2 or not parts[0].isdigit():
            return missing
        region_id = int(parts[0])
        resource = parts[1]
        raw_type = request.url.params.get("type_id")
        type_id = int(raw_type) if raw_type else None
        if resource == "orders":
            if type_id is not None:
                key: tuple[int, int | None] = (region_id, type_id)
            else:
                # full-region book; fall back to the single-type fixture for
                # legacy tests that only populate (region_id, TYPE_ID)
                key = (region_id, None)
                if key not in self.orders:
                    key = (region_id, TYPE_ID)
            pages = self.orders.get(key)
            if pages is None:
                return missing
            page = int(request.url.params.get("page") or 1)
            if page > len(pages):
                return missing  # ESI answers 404 past the last page
            return self._json(request, pages[page - 1],
                              headers={"x-pages": str(len(pages))})
        if resource == "history":
            rows = self.history.get((region_id, type_id))
            if rows is None:
                return missing
            return self._json(request, rows)
        return missing

    def _lookup(self, request: httpx.Request, table: dict[int, dict],
                ident: Optional[int], missing: httpx.Response) -> httpx.Response:
        if ident is None or ident not in table:
            return missing
        return self._json(request, table[ident])

    # -- response plumbing -------------------------------------------------
    def _json(self, request: httpx.Request, body: Any, *,
              headers: Optional[dict[str, str]] = None,
              status: int = 200) -> httpx.Response:
        hdrs = dict(headers or {})
        etag = hdrs.setdefault("etag", self._etag(body))
        if request.headers.get("if-none-match") == etag:
            self.not_modified += 1
            return httpx.Response(304, request=request, headers=hdrs)
        return httpx.Response(status, json=body, headers=hdrs, request=request)

    @staticmethod
    def _etag(body: Any) -> str:
        digest = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]
        return f'"{digest}"'


def order(order_id: int, *, type_id: int = TYPE_ID, price: float = 3.9,
          volume_remain: int = 1000, is_buy: bool = False,
          location_id: int = STATION_ID, system_id: int = SYSTEM_ID) -> dict:
    """An ESI order document (note: ``range``, not ``order_range``)."""
    return dict(order_id=order_id, type_id=type_id, price=price,
                volume_remain=volume_remain, volume_total=volume_remain + 10,
                is_buy_order=is_buy, location_id=location_id, system_id=system_id,
                range="region", issued="2026-09-18T00:00:00Z", duration=90,
                min_volume=1)