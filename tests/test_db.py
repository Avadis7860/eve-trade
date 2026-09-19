"""Tests for app.db (SQLite data layer, section 16)."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.db import Database


@pytest.fixture
def db(tmp_path: Path) -> Database:
    return Database(tmp_path / "test.db")


def _type_row(**over):
    base = dict(
        type_id=34, name="Tritanium", group_id=18, category_id=18,
        volume=0.01, packaged_volume=0.01, portion_size=1, published=1,
        market_group_id=1857, fetched_at="2026-01-01T00:00:00Z",
    )
    base.update(over)
    return base


def _order_row(**over):
    base = dict(order_id=1, type_id=34, region_id=10000002, system_id=30000142,
                location_id=60003760, price=3.9, volume_remain=1000,
                volume_total=1000, is_buy_order=0, order_range="region",
                issued="2026-01-01", duration=90, captured_at="2026-09-19T00:00:00Z")
    base.update(over)
    return base


class TestSchema:
    def test_tables_created(self, db: Database):
        names = {r["name"] for r in db.fetchall("SELECT name FROM sqlite_master WHERE type='table'")}
        assert {"regions", "solar_systems", "stations", "types", "market_orders",
                "market_snapshots", "opportunities", "meta"}.issubset(names)


class TestUniverseDao:
    def test_round_trip_type(self, db: Database):
        db.upsert_type(_type_row())
        row = db.fetchone("SELECT * FROM types WHERE type_id=34")
        assert row["name"] == "Tritanium"
        assert row["group_id"] == 18

    def test_upsert_type_is_idempotent(self, db: Database):
        db.upsert_type(_type_row(name="Tritanium"))
        db.upsert_type(_type_row(name="Tritanium renamed"))
        row = db.fetchone("SELECT name FROM types WHERE type_id=34")
        assert row["name"] == "Tritanium renamed"

    def test_regions_and_resolution(self, db: Database):
        db.upsert_region(10000002, "The Forge")
        db.upsert_system(30000142, "Jita", 10000002, 20000020, 0.946, True)
        assert db.resolve_region_id("The Forge") == 10000002
        sys = db.resolve_system_by_name("Jita")
        assert sys["system_id"] == 30000142
        assert sys["is_highsec"] == 1

    def test_resolves_system_scoped_to_its_region(self, db: Database):
        """System names repeat across regions, so the lookup is region-scoped."""
        db.upsert_region(10000002, "The Forge")
        db.upsert_region(10000033, "Domain")
        db.upsert_system(30000142, "Jita", 10000002, 20000020, 0.946, True)
        db.upsert_system(30002187, "Amarr", 10000033, 20000019, 0.946, True)

        assert db.resolve_system_in_region("Jita", 10000002)["system_id"] == 30000142
        # a name that is not in the given region -> falls back to a global lookup
        assert db.resolve_system_in_region("Jita", 10000033)["system_id"] == 30000142
        assert db.resolve_system_in_region("Nowhere", 10000002) is None
        assert db.resolve_system_in_region("Jita", None)["system_id"] == 30000142

    def test_resolves_station_scoped_to_its_system(self, db: Database):
        db.upsert_station(60003760, "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
                          30000142, 52678, has_market=True)
        db.upsert_station(60008494, "Amarr VIII (Oris) - Emperor Family Academy",
                          30002187, 52678, has_market=True)

        station = db.resolve_station_in_system(
            "Jita IV - Moon 4 - Caldari Navy Assembly Plant", 30000142)
        assert station["station_id"] == 60003760
        assert station["system_id"] == 30000142
        # same-ish name wrong system -> no match (no cross-system leakage)
        assert db.resolve_station_in_system(
            "Jita IV - Moon 4 - Caldari Navy Assembly Plant", 30002187) is None

    def test_resolve_hub_locations_fills_ids_from_the_cache(self, db: Database):
        """``resolve_hub_locations`` drives the whole name -> id chain (section 5)."""
        from app.config import MarketHub

        db.upsert_region(10000002, "The Forge")
        db.upsert_system(30000142, "Jita", 10000002, 20000020, 0.946, True)
        db.upsert_station(60003760, "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
                          30000142, 52678, has_market=True)

        hub = MarketHub(name="Jita", region="The Forge", solar_system="Jita",
                        station="Jita IV - Moon 4 - Caldari Navy Assembly Plant")
        db.resolve_hub_locations(hub)
        assert (hub.region_id, hub.system_id, hub.station_id) == (
            10000002, 30000142, 60003760)

    def test_resolve_hub_locations_leaves_unknown_names_unset(self, db: Database):
        from app.config import MarketHub

        hub = MarketHub(name="Nowhere", region="Nope", solar_system="Void")
        db.resolve_hub_locations(hub)
        assert (hub.region_id, hub.system_id) == (None, None)

    def test_highsec_regions(self, db: Database):
        db.upsert_region(10000002, "The Forge")
        db.upsert_region(10000003, "Lonetrek")
        db.upsert_system(30000142, "Jita", 10000002, 1, 0.946, True)
        db.upsert_system(30000001, "LowSecSys", 10000003, 2, 0.25, False)
        hs = {r["name"] for r in db.list_highsec_regions()}
        assert "The Forge" in hs
        assert "Lonetrek" not in hs


class TestMarketOrdersDao:
    def test_upsert_and_get_orders(self, db: Database):
        db.upsert_orders([
            _order_row(order_id=1, price=3.9, volume_remain=1000),
            _order_row(order_id=2, price=4.1, volume_remain=500),
        ])
        sells = db.get_orders(10000002, 34, "sell")
        assert sells[0]["price"] == 3.9
        assert len(sells) == 2

    def test_clear_region_type_orders(self, db: Database):
        db.upsert_orders([_order_row()])
        db.clear_region_type_orders(10000002, 34)
        assert db.get_orders(10000002, 34, "sell") == []


class TestSyncMetaAndSnapshots:
    def test_meta_roundtrip(self, db: Database):
        db.set_meta("last_full_sync", "ts1")
        assert db.get_meta("last_full_sync") == "ts1"
        assert db.get_meta("missing") is None

    def test_order_sync_status(self, db: Database):
        db.set_order_sync_meta(10000002, 34, "sell", "c", "e")
        row = db.order_sync_status(10000002, 34, "sell")
        assert row["captured_at"] == "c"
        assert row["expires_at"] == "e"

    def test_snapshot_roundtrip(self, db: Database):
        snap = dict(type_id=34, region_id=10000002, side="sell", best_price=3.9,
                    ladder_json='[{"price":3.9,"volume":1000}]', total_available=1000,
                    order_count=2, captured_at="now", expires_at="later")
        db.upsert_snapshot(snap)
        row = db.get_snapshot(34, 10000002, "sell")
        assert row["best_price"] == 3.9
        assert row["order_count"] == 2


class TestOpportunities:
    def test_save_and_get(self, db: Database):
        rows = [dict(type_id=34, buy_region_id=10000002, sell_region_id=10000003,
                     buy_price=3.9, sell_price=5.0, quantity=500, net_profit=455_000,
                     roi=0.4, margin=0.2, capital_required=500 * 3.9 * 1.0145,
                     computed_at="2026-09-19T00:00:00Z")]
        n = db.save_opportunities(rows)
        assert n == 1
        assert len(db.get_opportunities()) == 1
