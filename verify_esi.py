"""Live sanity check of the ESI layer against the real Tranquility API.

    python verify_esi.py            # full check (network required)
    python verify_esi.py --quick    # hub + cache checks only

Everything runs against a throw-away SQLite database in a temp directory, so
your real ``data/eve_trade.db`` and ``config.yaml`` are never touched.  Exits
non-zero if an assertion fails, which makes it usable as a smoke test.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import tempfile
from pathlib import Path

from app.config import get_settings
from app.db import Database
from app.esi.cache import SqliteCache
from app.esi.client import EsiClient, EsiError
from app.esi.market import MarketSync
from app.esi.universe import UniverseSync

TRITANIUM = 34
JITA_STATION_ID = 60003760


def _ok(label: str, detail: str = "") -> None:
    print(f"  OK  {label}{' -> ' + detail if detail else ''}")


async def check_cache_and_pagination(client: EsiClient) -> None:
    """Compare a fresh fetch with a cache hit and an ETag revalidation."""
    path = "/universe/types/34/"
    first = await client.get(path, ttl=0.05)
    hit = await client.get(path, ttl=0.05)
    await asyncio.sleep(0.1)  # let the 50 ms TTL lapse
    revalidated = await client.get(path, ttl=60.0)
    if not (first.body == hit.body == revalidated.body):
        raise AssertionError("cached bodies differ from the fetched body")
    _ok("cache hit", f"cached={hit.cached}")
    _ok("ETag revalidation", f"status={revalidated.status}")

    regions = await client.get_paged("/universe/regions/", ttl=60.0)
    if len(regions) < 100:
        raise AssertionError(f"expected >100 regions, got {len(regions)}")
    _ok("pagination", f"{len(regions)} regions over X-Pages")


async def check_universe_and_hubs(db: Database, syncer: UniverseSync) -> None:
    config = syncer.config
    # Only The Forge is synced here, so resolve just the hub that lives in it;
    # the other hubs would log "region not found" warnings for no good reason.
    jita_hub = config.default_hub_obj
    if jita_hub is None or jita_hub.name != "Jita":
        raise AssertionError("config.default_hub must be Jita for this check")
    config.market_hubs = [jita_hub]

    region_id = await syncer.find_region_id("The Forge")
    await syncer.sync_region(region_id, with_stations=True)
    jita = db.resolve_system_in_region("Jita", region_id)
    hub = next((h for h in syncer.resolve_hubs() if h.name == "Jita"), None)
    if hub is None or hub.station_id != JITA_STATION_ID:
        raise AssertionError(f"hub resolution failed: {hub}")
    _ok("hub Jita", f"region={hub.region_id} system={hub.system_id} "
                    f"station={hub.station_id}")
    _ok("system Jita", f"security={jita['security_status']:.3f} "
                       f"highsec={bool(jita['is_highsec'])}")
    stored = await syncer.sync_types([TRITANIUM])
    name = db.fetchone("SELECT name FROM types WHERE type_id=?", (TRITANIUM,))["name"]
    _ok("type metadata", f"{stored} type(s), {TRITANIUM}={name}")


async def check_market(db: Database, market: MarketSync, region_id: int) -> None:
    stored = await market.sync_type_orders(region_id, TRITANIUM)
    book = db.fetchall("SELECT is_buy_order, price FROM market_orders "
                       "WHERE region_id=? AND type_id=?", (region_id, TRITANIUM))
    sells = [r["price"] for r in book if not r["is_buy_order"]]
    buys = [r["price"] for r in book if r["is_buy_order"]]
    if stored is None or not sells or not buys:
        raise AssertionError(f"unexpected order book: {stored=} {len(sells)=} {len(buys)=}")
    _ok("order book", f"{len(sells)} sell / {len(buys)} buy, best sell "
                      f"{min(sells)} ISK, best buy {max(buys)} ISK")
    if await market.sync_type_orders(region_id, TRITANIUM) is not None:
        raise AssertionError("TTL cache miss: the second sync re-fetched")
    _ok("TTL cache", "second sync served from the local snapshot")


async def run(quick: bool) -> int:
    config = get_settings(reload=True)
    db = Database(Path(tempfile.mkdtemp()) / "verify.db")
    client = EsiClient(config.esi, SqliteCache(db))
    try:
        async with client:
            print("ESI layer (%s)" % config.esi.base_url)
            await check_cache_and_pagination(client)
            if quick:
                return 0
            syncer = UniverseSync(db, client, config)
            await check_universe_and_hubs(db, syncer)
            region_id = db.resolve_region_id("The Forge")
            await check_market(db, MarketSync(db, client, config), region_id)
    except (AssertionError, EsiError) as exc:
        print(f"  FAIL {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print("All ESI checks passed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Verify the ESI layer against live ESI.")
    p.add_argument("--quick", action="store_true",
                   help="only check caching / pagination (skips universe + market)")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.ERROR)  # keep library chatter out of the report
    return asyncio.run(run(args.quick))


if __name__ == "__main__":
    raise SystemExit(main())