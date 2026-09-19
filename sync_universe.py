"""Universe / hub sync CLI (sections 5 & 16).

Examples::

    python sync_universe.py --hubs                       # regions + systems + hub ids
    python sync_universe.py --hubs --no-stations         # region/system ids only
    python sync_universe.py --hubs --all-stations        # full station catalogue too
    python sync_universe.py --region "The Forge" --with-stations
    python sync_universe.py --hubs --types 34,35,36      # also cache type metadata

Resolved ``region_id`` / ``system_id`` / ``station_id`` values are written back
to ``config.yaml`` (``--no-persist`` opts out), so subsequent runs resolve hubs
straight from the local cache with no network access.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from app.config import get_settings
from app.db import Database
from app.esi.cache import SqliteCache
from app.esi.client import EsiClient, EsiError
from app.esi.universe import UniverseSync


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sync EVE universe data (sections 5/16).")
    p.add_argument("--region", action="append", default=None, metavar="NAME",
                   help="region name to sync by name (repeatable)")
    p.add_argument("--hubs", action="store_true",
                   help="sync every configured hub region and resolve its ids")
    p.add_argument("--with-stations", action="store_true",
                   help="also fetch station details (required for station_id)")
    p.add_argument("--all-stations", action="store_true",
                   help="also cache every station in the synced hub regions (slow)")
    p.add_argument("--no-stations", action="store_true",
                   help="with --hubs: resolve region/system ids only (no station_id)")
    p.add_argument("--resolve-hubs", action="store_true",
                   help="resolve hub ids from the local cache only (no ESI traffic)")
    p.add_argument("--types", default=None, metavar="ID,ID",
                   help="comma-separated type_ids to cache the metadata for")
    p.add_argument("--no-persist", action="store_true",
                   help="do not write resolved hub ids back to config.yaml")
    p.add_argument("--verbose", "-v", action="store_true")
    return p


async def run(args: argparse.Namespace) -> int:
    config = get_settings(reload=True)
    db = Database(config.database.resolved_path)
    cache = SqliteCache(db)
    sync = UniverseSync(db, EsiClient(config.esi, cache), config)

    if args.resolve_hubs:
        hubs = sync.resolve_hubs(persist=not args.no_persist)
        print(f"{'hub':<10} {'region_id':>10} {'system_id':>10} {'station_id':>11} {'region':22}")
        for hub in hubs:
            print(f"{hub.name:<10} {_fmt(hub.region_id):>10} "
                  f"{_fmt(hub.system_id):>10} {_fmt(hub.station_id):>11} {_fmt(hub.region):22}")
        if args.types:
            type_ids = [int(t) for t in str(args.types).split(",") if t.strip()]
            async with sync.client:  # sync_types needs the HTTP client
                stored = await sync.sync_types(type_ids)
            print(f"cached {stored}/{len(type_ids)} type(s)")
        return 0

    async with sync.client:
        if args.hubs:
            hubs = await sync.sync_hubs(
                with_stations=not args.no_stations,
                persist=not args.no_persist,
                all_stations=args.all_stations)
            print(f"{'hub':<10} {'region_id':>10} {'system_id':>10} {'station_id':>11} {'region':22}")
            for hub in hubs:
                print(f"{hub.name:<10} {_fmt(hub.region_id):>10} "
                      f"{_fmt(hub.system_id):>10} {_fmt(hub.station_id):>11} {_fmt(hub.region):22}")

        for region in args.region or []:
            region_id = await sync.find_region_id(region)
            if region_id is None:
                print(f"! region {region!r} not found", file=sys.stderr)
                continue
            await sync.sync_region(region_id,
                                   with_stations=args.with_stations or args.all_stations)
            print(f"synced region {region} ({region_id})")

        if args.types:
            type_ids = [int(t) for t in str(args.types).split(",") if t.strip()]
            stored = await sync.sync_types(type_ids)
            print(f"cached {stored}/{len(type_ids)} type(s)")

        if not (args.hubs or args.region or args.types):
            build_parser().print_help()
            return 2

        if not args.hubs and args.region:
            # A region sync may have made hub names resolvable for the first time.
            sync.resolve_hubs(persist=not args.no_persist)
    return 0


def _fmt(value: int | None) -> str:
    return "-" if value is None else str(value)


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