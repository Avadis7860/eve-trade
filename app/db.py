"""Persistent cache / database layer (section 16).

SQLite file database holding:
  * static universe data (regions / systems / stations / types / groups /
    categories) — fetched once, TTL ~never;
  * live market orders + best-price snapshots — short TTL;
  * computed trading opportunities — history (section 24).

The layer is **synchronous** (sqlite3, WAL, thread-safe) so it is trivially
unit-testable.  Async callers (FastAPI / analysis service) wrap calls with
``asyncio.to_thread``.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

from app.config import get_settings


SCHEMA: str = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories (category_id INTEGER PRIMARY KEY, name TEXT, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS groups (group_id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS types (type_id INTEGER PRIMARY KEY, name TEXT, group_id INTEGER,
    category_id INTEGER, volume REAL, packaged_volume REAL, portion_size INTEGER,
    published INTEGER, market_group_id INTEGER, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS regions (region_id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT);
CREATE TABLE IF NOT EXISTS constellations (constellation_id INTEGER PRIMARY KEY, name TEXT, region_id INTEGER);
CREATE TABLE IF NOT EXISTS solar_systems (system_id INTEGER PRIMARY KEY, name TEXT, region_id INTEGER,
    constellation_id INTEGER, security_status REAL, is_highsec INTEGER);
CREATE TABLE IF NOT EXISTS stations (station_id INTEGER PRIMARY KEY, name TEXT, system_id INTEGER,
    type_id INTEGER, has_market INTEGER);
CREATE TABLE IF NOT EXISTS market_orders (order_id INTEGER PRIMARY KEY, type_id INTEGER, region_id INTEGER,
    system_id INTEGER, location_id INTEGER, price REAL, volume_remain INTEGER, volume_total INTEGER,
    is_buy_order INTEGER, order_range TEXT, issued TEXT, duration INTEGER, captured_at TEXT);
CREATE TABLE IF NOT EXISTS order_sync_meta (region_id INTEGER, type_id INTEGER, side TEXT,
        captured_at TEXT, expires_at TEXT, PRIMARY KEY(region_id, type_id, side));
CREATE TABLE IF NOT EXISTS region_order_sync (region_id INTEGER PRIMARY KEY,
        captured_at TEXT, expires_at TEXT, page_count INTEGER, order_count INTEGER);
CREATE TABLE IF NOT EXISTS esi_cache (key TEXT PRIMARY KEY, body TEXT, etag TEXT,
    expires_at TEXT, captured_at TEXT);
CREATE TABLE IF NOT EXISTS market_snapshots (type_id INTEGER, region_id INTEGER, side TEXT, best_price REAL,
    ladder_json TEXT, total_available INTEGER, order_count INTEGER,
    captured_at TEXT, expires_at TEXT, PRIMARY KEY(type_id, region_id, side));
CREATE TABLE IF NOT EXISTS opportunities (type_id INTEGER, buy_region_id INTEGER, sell_region_id INTEGER,
    buy_price REAL, sell_price REAL, quantity INTEGER, net_profit REAL, roi REAL,
    margin REAL, capital_required REAL, computed_at TEXT,
    PRIMARY KEY(type_id, buy_region_id, sell_region_id));
CREATE INDEX IF NOT EXISTS idx_orders_type_region_side
    ON market_orders (type_id, region_id, is_buy_order);
CREATE INDEX IF NOT EXISTS idx_orders_region_captured
    ON market_orders (region_id, captured_at);
"""


class Database:
    """Thin, thread-safe SQLite access. One connection per operation."""

    _lock = threading.Lock()

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(str(self.path), timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            yield conn
        finally:
            conn.close()

    def _initialize(self) -> None:
        with self._lock, self.connect() as conn:
            conn.executescript(SCHEMA)

    def execute(self, query: str, params: tuple = ()) -> int:
        with self._lock, self.connect() as conn:
            return conn.execute(query, params).rowcount

    def executemany(self, query: str, params: Iterable[tuple | dict]) -> int:
        with self._lock, self.connect() as conn:
            return conn.executemany(query, list(params)).rowcount

    def fetchone(self, query: str, params: tuple = ()) -> dict | None:
        with self._lock, self.connect() as conn:
            row = conn.execute(query, params).fetchone()
            return dict(row) if row else None

    def fetchall(self, query: str, params: tuple = ()) -> list[dict]:
        with self._lock, self.connect() as conn:
            return [dict(r) for r in conn.execute(query, params).fetchall()]

    # -- meta ------------------------------------------------------------
    def get_meta(self, key: str) -> str | None:
        row = self.fetchone("SELECT value FROM meta WHERE key=?", (key,))
        return row["value"] if row else None

    def set_meta(self, key: str, value: str) -> None:
        self.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    # -- universe static data --------------------------------------------
    def upsert_category(self, category_id: int, name: str, fetched_at: str = "") -> None:
        self.execute(
            "INSERT INTO categories(category_id,name,fetched_at) VALUES(?,?,?) "
            "ON CONFLICT(category_id) DO UPDATE SET name=excluded.name",
            (category_id, name, fetched_at))

    def upsert_group(self, group_id: int, name: str, category_id: int, fetched_at: str = "") -> None:
        self.execute(
            "INSERT INTO groups(group_id,name,category_id,fetched_at) VALUES(?,?,?,?) "
            "ON CONFLICT(group_id) DO UPDATE SET name=excluded.name, category_id=excluded.category_id",
            (group_id, name, category_id, fetched_at))

    def upsert_type(self, row: dict) -> None:
        self.execute("""INSERT INTO types(type_id,name,group_id,category_id,volume,
            packaged_volume,portion_size,published,market_group_id,fetched_at)
            VALUES(:type_id,:name,:group_id,:category_id,:volume,
            :packaged_volume,:portion_size,:published,:market_group_id,:fetched_at)
            ON CONFLICT(type_id) DO UPDATE SET name=excluded.name,
            group_id=excluded.group_id, category_id=excluded.category_id,
            volume=excluded.volume, portion_size=excluded.portion_size,
            published=excluded.published, market_group_id=excluded.market_group_id""", row)

    def upsert_type_names(self, rows: Iterable[dict]) -> int:
        """Bulk name enrichment (POST /universe/names): name only, keep metadata.

        Unknown ids get a minimal row (published=1 — they come from live market
        data) so search works immediately; the lazy group/category enrichment
        (``upsert_type`` / ``set_types_group``) fills the rest later.
        """
        rows = list(rows)
        if not rows:
            return 0
        return self.executemany(
            """INSERT INTO types(type_id,name,published,fetched_at)
               VALUES(:type_id,:name,1,:fetched_at)
               ON CONFLICT(type_id) DO UPDATE SET name=excluded.name""", rows)

    # -- type catalog: search & taxonomy browsing (EMB-style) ----------------
    def search_types(self, query: str, limit: int = 50) -> list[dict]:
        """Published types by name (case-insensitive substring), with taxonomy labels."""
        like = f"%{query.strip()}%"
        return self.fetchall(
            """SELECT t.type_id, t.name, t.group_id, g.name AS group_name,
                      c.name AS category_name
               FROM types t
               LEFT JOIN groups g ON g.group_id = t.group_id
               LEFT JOIN categories c ON c.category_id = t.category_id
               WHERE t.published=1 AND t.name LIKE ?
               ORDER BY t.name LIMIT ?""", (like, limit))

    def type_names(self, type_ids: list[int]) -> dict[int, str]:
        """Id -> name map (chunked); missing ids are simply absent."""
        out: dict[int, str] = {}
        for i in range(0, len(type_ids), 500):
            chunk = [int(t) for t in type_ids[i:i + 500]]
            placeholders = ",".join("?" * len(chunk))
            for r in self.fetchall(
                    f"SELECT type_id, name FROM types WHERE type_id IN ({placeholders})",
                    tuple(chunk)):
                out[int(r["type_id"])] = r["name"]
        return out

    def set_types_group(self, group_id: int, category_id: int | None,
                        type_ids: list[int]) -> int:
        """Attach types to a group/category (lazy taxonomy tagging, bulk)."""
        total = 0
        for i in range(0, len(type_ids), 500):
            chunk = [int(t) for t in type_ids[i:i + 500]]
            placeholders = ",".join("?" * len(chunk))
            total += self.execute(
                f"UPDATE types SET group_id=?, category_id=? WHERE type_id IN ({placeholders})",
                (group_id, category_id, *chunk))
        return total

    def browse_categories(self) -> list[dict]:
        return self.fetchall(
            """SELECT c.category_id, c.name, COUNT(g.group_id) AS group_count
               FROM categories c LEFT JOIN groups g ON g.category_id = c.category_id
               GROUP BY c.category_id ORDER BY c.name""")

    def browse_groups(self, category_id: int) -> list[dict]:
        return self.fetchall(
            """SELECT g.group_id, g.name, COUNT(t.type_id) AS type_count
               FROM groups g LEFT JOIN types t ON t.group_id = g.group_id
               WHERE g.category_id=?
               GROUP BY g.group_id ORDER BY g.name""", (category_id,))

    def types_in_group(self, group_id: int) -> list[dict]:
        return self.fetchall(
            "SELECT type_id, name FROM types WHERE group_id=? AND published=1 "
            "ORDER BY name", (group_id,))

    def catalog_coverage(self, region_id: int | None = None) -> dict[str, int]:
        """How many traded types have a name (drives the 'run --names' hint)."""
        traded = len(self.traded_type_ids(region_id))
        if not traded:
            return {"traded": 0, "named": 0, "groups": 0, "categories": 0}
        placeholders = ",".join("?" * min(traded, 500))
        params: tuple = tuple(self.traded_type_ids(region_id))
        named = 0
        for i in range(0, len(params), 500):
            chunk = params[i:i + 500]
            ph = ",".join("?" * len(chunk))
            row = self.fetchone(
                f"SELECT COUNT(*) AS n FROM types WHERE type_id IN ({ph}) AND name IS NOT NULL",
                tuple(chunk))
            named += int(row["n"]) if row else 0
        groups = int(self.fetchone("SELECT COUNT(*) AS n FROM groups")["n"])
        categories = int(self.fetchone("SELECT COUNT(*) AS n FROM categories")["n"])
        return {"traded": traded, "named": named, "groups": groups,
                "categories": categories}

    def upsert_region(self, region_id: int, name: str, description: str = "") -> None:
        self.execute(
            "INSERT INTO regions(region_id,name,description) VALUES(?,?,?) "
            "ON CONFLICT(region_id) DO UPDATE SET name=excluded.name",
            (region_id, name, description))

    def upsert_constellation(self, cid: int, name: str, region_id: int) -> None:
        self.execute(
            "INSERT INTO constellations(constellation_id,name,region_id) VALUES(?,?,?) "
            "ON CONFLICT(constellation_id) DO UPDATE SET name=excluded.name, region_id=excluded.region_id",
            (cid, name, region_id))

    def upsert_system(self, system_id: int, name: str, region_id: int,
                      constellation_id: int, security_status: float, is_highsec: bool) -> None:
        self.execute("""INSERT INTO solar_systems(system_id,name,region_id,constellation_id,
            security_status,is_highsec) VALUES(?,?,?,?,?,?)
            ON CONFLICT(system_id) DO UPDATE SET name=excluded.name,
            region_id=excluded.region_id, security_status=excluded.security_status,
            is_highsec=excluded.is_highsec""",
            (system_id, name, region_id, constellation_id, security_status, int(is_highsec)))

    def upsert_station(self, station_id: int, name: str, system_id: int,
                       type_id: int | None = None, has_market: bool = True) -> None:
        self.execute(
            "INSERT INTO stations(station_id,name,system_id,type_id,has_market) VALUES(?,?,?,?,?) "
            "ON CONFLICT(station_id) DO UPDATE SET name=excluded.name, system_id=excluded.system_id, has_market=excluded.has_market",
            (station_id, name, system_id, type_id, int(has_market)))

    def resolve_region_id(self, name: str) -> int | None:
        row = self.fetchone("SELECT region_id FROM regions WHERE name=?", (name,))
        return row["region_id"] if row else None

    def resolve_system_by_name(self, name: str) -> dict | None:
        return self.fetchone(
            "SELECT system_id, name, region_id, security_status, is_highsec "
            "FROM solar_systems WHERE name=?", (name,))

    def resolve_station_by_name(self, name: str) -> dict | None:
        return self.fetchone("SELECT station_id, name, system_id FROM stations WHERE name=?",
                             (name,))

    # -- hub resolution ---------------------------------------------------
    def resolve_system_in_region(self, name: str, region_id: int | None) -> dict | None:
        """Region-scoped system lookup (system names may repeat across regions)."""
        if region_id:
            row = self.fetchone(
                "SELECT system_id, name, region_id, security_status, is_highsec "
                "FROM solar_systems WHERE name=? AND region_id=?", (name, region_id))
            if row:
                return row
        return self.resolve_system_by_name(name)

    def resolve_station_in_system(self, name: str, system_id: int) -> dict | None:
        return self.fetchone(
            "SELECT station_id, name, system_id FROM stations WHERE name=? AND system_id=?",
            (name, system_id))

    def resolve_hub_locations(self, hub) -> None:
        """Fill region_id/system_id/station_id on a MarketHub from the cache.

        Lookups are scoped (region -> system -> station) because system and
        station names are not globally unique; unresolvable fields stay ``None``
        so region-level analysis can still run as a graceful fallback.
        """
        hub.region_id = self.resolve_region_id(hub.region) or hub.region_id
        sysrow = self.resolve_system_in_region(hub.solar_system, hub.region_id)
        if sysrow:
            hub.system_id = sysrow["system_id"]
            if hub.region_id is None:
                hub.region_id = sysrow["region_id"]
        if hub.station and hub.system_id:
            st = self.resolve_station_in_system(hub.station, hub.system_id)
            if st:
                hub.station_id = st["station_id"]

    def list_highsec_regions(self) -> list[dict]:
        return self.fetchall(
            "SELECT DISTINCT r.region_id, r.name FROM regions r "
            "JOIN solar_systems s ON s.region_id=r.region_id WHERE s.is_highsec=1")

    # -- market orders ----------------------------------------------------
    def upsert_orders(self, orders: Iterable[dict]) -> None:
        rows = list(orders)
        if not rows:
            return
        self.executemany("""INSERT INTO market_orders(order_id,type_id,region_id,system_id,location_id,
            price,volume_remain,volume_total,is_buy_order,order_range,issued,duration,captured_at)
            VALUES(:order_id,:type_id,:region_id,:system_id,:location_id,
            :price,:volume_remain,:volume_total,:is_buy_order,:order_range,
            :issued,:duration,:captured_at)
            ON CONFLICT(order_id) DO UPDATE SET price=excluded.price,
            volume_remain=excluded.volume_remain, captured_at=excluded.captured_at""", rows)

    def clear_region_type_orders(self, region_id: int, type_id: int) -> None:
        self.execute("DELETE FROM market_orders WHERE region_id=? AND type_id=?",
                     (region_id, type_id))

    def get_orders(self, region_id: int, type_id: int, side: str) -> list[dict]:
        is_buy = 1 if side == "buy" else 0
        order = "DESC" if side == "buy" else "ASC"
        return self.fetchall(
            "SELECT * FROM market_orders WHERE region_id=? AND type_id=? AND is_buy_order=? "
            "ORDER BY price " + order, (region_id, type_id, is_buy))

    # -- order sync metadata (freshness / TTL) ---------------------------
    def order_sync_status(self, region_id: int, type_id: int, side: str) -> dict | None:
        return self.fetchone(
            "SELECT captured_at, expires_at FROM order_sync_meta "
            "WHERE region_id=? AND type_id=? AND side=?", (region_id, type_id, side))

    def set_order_sync_meta(self, region_id: int, type_id: int, side: str,
                            captured_at: str, expires_at: str) -> None:
        self.execute("""INSERT INTO order_sync_meta(region_id,type_id,side,captured_at,expires_at)
            VALUES(?,?,?,?,?) ON CONFLICT(region_id,type_id,side) DO UPDATE SET
            captured_at=excluded.captured_at, expires_at=excluded.expires_at""",
            (region_id, type_id, side, captured_at, expires_at))

    # -- bulk (full-region) sync meta --------------------------------------
    def region_sync_status(self, region_id: int) -> dict | None:
        return self.fetchone("SELECT * FROM region_order_sync WHERE region_id=?",
                             (region_id,))

    def set_region_sync_meta(self, region_id: int, captured_at: str, expires_at: str,
                             page_count: int, order_count: int) -> None:
        self.execute("""INSERT INTO region_order_sync(region_id,captured_at,expires_at,
            page_count,order_count) VALUES(?,?,?,?,?)
            ON CONFLICT(region_id) DO UPDATE SET captured_at=excluded.captured_at,
            expires_at=excluded.expires_at, page_count=excluded.page_count,
            order_count=excluded.order_count""",
            (region_id, captured_at, expires_at, page_count, order_count))

    def purge_stale_region_orders(self, region_id: int, before_iso: str) -> int:
        """Delete the region's orders captured before the new bulk snapshot.

        A full-region pull replaces *every* book in the region, so anything
        captured earlier is a closed/expired order (phantom liquidity).
        """
        return self.execute(
            "DELETE FROM market_orders WHERE region_id=? AND captured_at<?",
            (region_id, before_iso))

    # -- cross-region reads (scanner / dashboard) ---------------------------
    def traded_type_ids(self, region_id: int | None = None) -> list[int]:
        """Distinct type ids present in the local order book (optionally per region)."""
        sql = "SELECT DISTINCT type_id AS type_id FROM market_orders"
        params: tuple = ()
        if region_id is not None:
            sql += " WHERE region_id=?"
            params = (region_id,)
        return [int(r["type_id"]) for r in self.fetchall(sql + " ORDER BY type_id", params)]

    def region_book_summary(self, region_id: int, type_ids: list[int]) -> dict[int, dict]:
        """Best sell/buy + total volumes for several types in one region (chunked IN)."""
        out: dict[int, dict] = {}
        for i in range(0, len(type_ids), 500):
            chunk = [int(t) for t in type_ids[i:i + 500]]
            placeholders = ",".join("?" * len(chunk))
            rows = self.fetchall(
                f"""SELECT type_id,
                       MIN(CASE WHEN is_buy_order=0 THEN price END) AS best_sell,
                       MAX(CASE WHEN is_buy_order=1 THEN price END) AS best_buy,
                       SUM(CASE WHEN is_buy_order=0 THEN volume_remain ELSE 0 END) AS sell_volume,
                       SUM(CASE WHEN is_buy_order=1 THEN volume_remain ELSE 0 END) AS buy_volume,
                       COUNT(*) AS order_count
                FROM market_orders WHERE region_id=? AND type_id IN ({placeholders})
                GROUP BY type_id""", (region_id, *chunk))
            for r in rows:
                out[int(r["type_id"])] = r
        return out

    def per_region_book_summary(self, type_id: int) -> list[dict]:
        """The same summary, for one type across every cached region."""
        return self.fetchall(
            """SELECT region_id,
                   MIN(CASE WHEN is_buy_order=0 THEN price END) AS best_sell,
                   MAX(CASE WHEN is_buy_order=1 THEN price END) AS best_buy,
                   SUM(CASE WHEN is_buy_order=0 THEN volume_remain ELSE 0 END) AS sell_volume,
                   SUM(CASE WHEN is_buy_order=1 THEN volume_remain ELSE 0 END) AS buy_volume,
                   COUNT(*) AS order_count
            FROM market_orders WHERE type_id=? GROUP BY region_id ORDER BY region_id""",
            (type_id,))

    # -- snapshots --------------------------------------------------------
    def upsert_snapshot(self, row: dict) -> None:
        self.execute("""INSERT INTO market_snapshots(type_id,region_id,side,best_price,ladder_json,
            total_available,order_count,captured_at,expires_at)
            VALUES(:type_id,:region_id,:side,:best_price,:ladder_json,
            :total_available,:order_count,:captured_at,:expires_at)
            ON CONFLICT(type_id,region_id,side) DO UPDATE SET best_price=excluded.best_price,
            ladder_json=excluded.ladder_json, total_available=excluded.total_available,
            order_count=excluded.order_count, captured_at=excluded.captured_at,
            expires_at=excluded.expires_at""", row)

    def get_snapshot(self, type_id: int, region_id: int, side: str) -> dict | None:
        return self.fetchone("SELECT * FROM market_snapshots WHERE type_id=? AND region_id=? AND side=?",
                             (type_id, region_id, side))

    # -- opportunities ----------------------------------------------------
    def save_opportunities(self, rows: Iterable[dict]) -> int:
        rows = list(rows)
        if not rows:
            return 0
        self.executemany("""INSERT INTO opportunities(type_id,buy_region_id,sell_region_id,buy_price,
            sell_price,quantity,net_profit,roi,margin,capital_required,computed_at)
            VALUES(:type_id,:buy_region_id,:sell_region_id,:buy_price,:sell_price,
            :quantity,:net_profit,:roi,:margin,:capital_required,:computed_at)
            ON CONFLICT(type_id,buy_region_id,sell_region_id) DO UPDATE SET buy_price=excluded.buy_price,
            sell_price=excluded.sell_price, quantity=excluded.quantity, net_profit=excluded.net_profit,
            roi=excluded.roi, margin=excluded.margin, capital_required=excluded.capital_required,
            computed_at=excluded.computed_at""", rows)
        return len(rows)

    def get_opportunities(self, limit: int = 200, offset: int = 0) -> list[dict]:
        return self.fetchall("SELECT * FROM opportunities ORDER BY net_profit DESC LIMIT ? OFFSET ?",
                             (limit, offset))

    def get_opportunity(self, type_id: int, buy_region_id: int, sell_region_id: int) -> dict | None:
        return self.fetchone("SELECT * FROM opportunities WHERE type_id=? AND buy_region_id=? AND sell_region_id=?",
                             (type_id, buy_region_id, sell_region_id))

    # -- esi HTTP cache --------------------------------------------------
    def cache_get(self, key: str) -> dict | None:
        row = self.fetchone(
            "SELECT body, etag, expires_at FROM esi_cache WHERE key=?", (key,))
        return row

    def cache_set(self, key: str, body: str, etag: str | None,
                  captured_at: str, expires_at: str) -> None:
        self.execute(
            """INSERT INTO esi_cache(key,body,etag,expires_at,captured_at)
               VALUES(?,?,?,?,?)
               ON CONFLICT(key) DO UPDATE SET body=excluded.body, etag=excluded.etag,
               expires_at=excluded.expires_at, captured_at=excluded.captured_at""",
            (key, body, etag, expires_at, captured_at))

    def cache_invalidate(self, key: str) -> None:
        self.execute("DELETE FROM esi_cache WHERE key=?", (key,))


_db: "Database | None" = None


def get_db() -> Database:
    """Application-wide Database singleton (path from config)."""
    global _db
    if _db is None:
        _db = Database(get_settings().database.resolved_path)
    return _db


def set_db(db: Database) -> None:
    """Override the singleton (used by tests / re-init)."""
    global _db
    _db = db
