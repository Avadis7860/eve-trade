"""Market order sync CLI (sections 6, 12 & 16).

Order books are the hot data (short TTL, refreshed per ``(region, type)``)::

    python sync_market.py --hub Jita --types 34,35,36
    python sync_market.py --hub Jita --from-db --limit 200
    python sync_market.py --hub Jita --types 34 --force     # ignore the TTL
    python sync_market.py --prices                          # cluster-wide prices

Hub ids come from ``config.yaml`` / the local cache, so run ``sync_universe.py
--hubs --with-stations`` once first.  Re-running inside the TTL is a no-op (no
ESI traffic) unless ``--force`` is given.

Type *names* in the summary come from the local ``types`` table (fill it with
``python sync_universe.py --types 34,35,36``); ids that are not cached yet are
shown as ``?`` and everything else still works.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from app.config import get_settings
from app.db import Database
from app.engine.money import round_money
from app.esi.cache import SqliteCache
from app.esi.client import EsiClient, EsiError
from app.esi.market import MarketSync

PAGE_HEADER = (f"{'type_id':>9} {'name':<28} {'best sell':>12} {'best buy':>12} "
               f"{'sell vol':>9} {'buy vol':>9}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sync EVE market orders (sections 6/12/16).")
    p.add_argument("--hub", default=None, metavar="NAME",
                   help="configured hub to sync (defaults to default_hub)")
    p.add_argument("--types", default=None, metavar="ID,ID",
                   help="comma-separated type_ids to sync")
    p.add_argument("--from-db", action="store_true",
                   help="sync every type already cached in the local database")
    p.add_argument("--limit", type=int, default=200,
                   help="max types to sync with --from-db (default 200)")
    p.add_argument("--force", action="store_true",
                   help="ignore the TTL and re-fetch everything")
    p.add_argument("--prices", action="store_true",
                   help="also fetch /markets/prices/ (adjusted + average prices)")
    p.add_argument("--verbose", "-v", action="store_true")
    return p


def _type_ids(db: Database, args: argparse.Namespace) -> list[int]:
    ids: list[int] = []
    if args.types:
        ids.extend(int(t) for t in str(args.types).split(",") if t.strip())
    if args.from_db:
        rows = db.fetchall("SELECT type_id FROM types WHERE published=1 "
                           "ORDER BY type_id LIMIT ?", (max(1, args.limit),))
        ids.extend(int(r["type_id"]) for r in rows)
    return list(dict.fromkeys(ids))  # de-dup, keep order


async def run(args: argparse.Namespace) -> int:
    config = get_settings(reload=True)
    db = Database(config.database.resolved_path)
    sync = MarketSync(db, EsiClient(config.esi, SqliteCache(db)), config)
    precision = config.fees.currency_precision
    hub_name = args.hub or config.default_hub

    try:
        hub = config.get_hub(hub_name)
    except KeyError:
        print(f"! unknown hub {hub_name!r}; configured: "
              f"{[h.name for h in config.market_hubs]}", file=sys.stderr)
        return 2

    async with sync.client:
        if args.prices:
            prices = await sync.fetch_prices()
            print(f"fetched {len(prices)} cluster price entries")

        if hub.region_id is None:
            await _bootstrap_hub(sync, hub)
        if hub.region_id is None:
            print(f"! hub {hub.name!r} has no region_id — run "
                  f"`python sync_universe.py --hubs --with-stations` first",
                  file=sys.stderr)
            return 1

        type_ids = _type_ids(db, args)
        if not type_ids:
            print("! no type ids: pass --types and/or --from-db", file=sys.stderr)
            return 2

        print(f"region {hub.region} ({hub.region_id}) — {len(type_ids)} type(s)")
        results = await sync.sync_orders(hub.region_id, type_ids, force=args.force)
        refreshed = sum(1 for n in results.values() if n is not None)
        print(f"refreshed {refreshed} type(s), "
              f"{len(results) - refreshed} served from the local TTL cache")
        _print_books(db, hub.region_id, results, precision)
    return 0


async def _bootstrap_hub(sync: MarketSync, hub) -> None:
    """Resolve ``hub.region_id`` straight from ESI when the local cache is empty."""
    from app.esi.universe import UniverseSync

    region_id = await UniverseSync(sync.db, sync.client, sync.config).find_region_id(
        hub.region)
    if region_id is not None:
        hub.region_id = region_id


def _print_books(db: Database, region_id: int, results: dict[int, int | None],
                 precision: int) -> None:
    """Show the top of the (already stored) book for every synced type."""
    print(PAGE_HEADER)
    for type_id, stored in results.items():
        row = db.fetchone("SELECT name FROM types WHERE type_id=?", (type_id,))
        name = row["name"] if row else "?"
        sells = db.get_orders(region_id, type_id, "sell")
        buys = db.get_orders(region_id, type_id, "buy")
        best_sell = min((o["price"] for o in sells), default=None)
        best_buy = max((o["price"] for o in buys), default=None)
        sell_vol = sum(o["volume_remain"] for o in sells[:1])
        buy_vol = sum(o["volume_remain"] for o in buys[:1])
        note = "  (cached)" if stored is None else ""
        print(f"{type_id:>9} {name[:28]:<28} "
              f"{_isk(best_sell, precision):>12} {_isk(best_buy, precision):>12} "
              f"{sell_vol:>9} {buy_vol:>9}{note}")


def _isk(value: float | None, precision: int) -> str:
    if value is None:
        return "-"
    return f"{round_money(value, precision):,.{precision}f}"


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s %(name)s: %(message)s")
    # httpx logs every request at INFO; keep our own output readable.
    logging.getLogger("httpx").setLevel(logging.DEBUG if args.verbose else logging.WARNING)
    try:
        return asyncio.run(run(args))
    except EsiError as exc:
        print(f"ESI error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())