"""Tests for app.esi.market (sections 6, 12, 16: order book sync + TTL)."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import load_config
from app.db import Database
from app.esi.client import EsiClient
from app.esi.market import MarketSync
from tests.fake_esi import REGION_ID, STATION_ID, SYSTEM_ID, TYPE_ID, FakeEsi, order


@pytest.fixture
def db(tmp_path: Path) -> Database:
    return Database(tmp_path / "market.db")


@pytest.fixture
def fake() -> FakeEsi:
    return FakeEsi()


def make_sync(db: Database, fake: FakeEsi, config) -> MarketSync:
    client = EsiClient(config.esi, transport=fake.transport(),
                       base_backoff_seconds=0.0)
    return MarketSync(db, client, config)


class TestOrderFetching:
    async def test_fetch_region_orders_requests_every_page(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)], [order(2)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            orders = await sync.fetch_region_orders(REGION_ID, TYPE_ID)
        assert [o["order_id"] for o in orders] == [1, 2]
        assert fake.requests[0].url.params["order_type"] == "all"
        assert fake.requests[0].url.params["type_id"] == str(TYPE_ID)

    async def test_fetch_region_orders_without_type_filter(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(7)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            orders = await sync.fetch_region_orders(REGION_ID)
        assert "type_id" not in fake.requests[0].url.params
        assert orders[0]["order_id"] == 7

    async def test_empty_region_book_is_an_empty_list(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.fetch_region_orders(REGION_ID, TYPE_ID) == []

    async def test_fetch_history_and_prices(self, db, fake, tmp_config_path):
        fake.history[(REGION_ID, TYPE_ID)] = [{"date": "2026-09-18", "highest": 4.2,
                                              "lowest": 3.8, "average": 4.0,
                                              "order_count": 10, "volume": 5000}]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            history = await sync.fetch_history(REGION_ID, TYPE_ID)
            prices = await sync.fetch_prices()
        assert history[0]["average"] == 4.0
        assert prices[0]["adjusted_price"] == 4.1
class TestToRow:
    def test_esi_order_is_mapped_to_the_db_columns(self):
        row = MarketSync.to_row(order(11, price=4.5, volume_remain=250, is_buy=True),
                                REGION_ID, "2026-09-19T00:00:00Z")
        assert row["order_id"] == 11
        assert row["type_id"] == TYPE_ID
        assert row["price"] == pytest.approx(4.5)
        assert row["volume_remain"] == 250
        assert row["volume_total"] == 260
        assert row["is_buy_order"] == 1
        assert row["order_range"] == "region"  # ESI calls it "range"
        assert row["location_id"] == STATION_ID
        assert row["system_id"] == SYSTEM_ID
        assert row["captured_at"] == "2026-09-19T00:00:00Z"

    def test_missing_optional_fields_do_not_crash(self):
        row = MarketSync.to_row({"order_id": 1, "type_id": TYPE_ID}, REGION_ID, "t")
        assert row["price"] == 0.0 and row["system_id"] == 0 and row["order_range"] == ""


class TestSyncTypeOrders:
    async def test_orders_are_persisted_with_sync_metadata(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1, price=3.9),
                                              order(2, is_buy=True, price=3.5)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            stored = await sync.sync_type_orders(REGION_ID, TYPE_ID)
        assert stored == 2
        rows = db.fetchall("SELECT * FROM market_orders WHERE region_id=? AND type_id=?",
                           (REGION_ID, TYPE_ID))
        assert {r["order_id"] for r in rows} == {1, 2}
        assert {r["is_buy_order"] for r in rows} == {0, 1}
        assert sync.is_fresh(REGION_ID, TYPE_ID) is True

    async def test_second_sync_within_ttl_is_skipped(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.sync_type_orders(REGION_ID, TYPE_ID) == 1
            before = len(fake.requests)
            assert await sync.sync_type_orders(REGION_ID, TYPE_ID) is None
        assert len(fake.requests) == before  # TTL honoured, no extra traffic

    async def test_force_refetches_within_ttl(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.sync_type_orders(REGION_ID, TYPE_ID)
            fake.orders[(REGION_ID, TYPE_ID)] = [[order(1), order(2)]]
            assert await sync.sync_type_orders(REGION_ID, TYPE_ID, force=True) == 2

    async def test_stale_orders_are_replaced_not_merged(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1), order(2), order(3)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.sync_type_orders(REGION_ID, TYPE_ID)
            fake.orders[(REGION_ID, TYPE_ID)] = [[order(3)]]  # 1 and 2 expired
            await sync.sync_type_orders(REGION_ID, TYPE_ID, force=True)
        rows = db.fetchall("SELECT order_id FROM market_orders WHERE type_id=?", (TYPE_ID,))
        assert [r["order_id"] for r in rows] == [3]

    async def test_orders_are_scoped_per_type(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)]]
        fake.orders[(REGION_ID, 35)] = [[order(2, type_id=35)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.sync_type_orders(REGION_ID, TYPE_ID)
            await sync.sync_type_orders(REGION_ID, 35)
        assert db.fetchone("SELECT type_id FROM market_orders WHERE order_id=1")["type_id"] == TYPE_ID
        assert db.fetchone("SELECT type_id FROM market_orders WHERE order_id=2")["type_id"] == 35

    async def test_sync_orders_reports_per_type_result(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1), order(2)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            result = await sync.sync_orders(REGION_ID, [TYPE_ID, 999999])
        assert result == {TYPE_ID: 2, 999999: 0}


class TestBulkRegionSync:
    async def test_bulk_persists_every_type_and_page(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, None)] = [
            [order(1), order(2, type_id=35, is_buy=True)],
            [order(3, type_id=36)],
        ]
        progress = []
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            stored = await sync.sync_region_orders_bulk(
                REGION_ID, progress=lambda p, n, total: progress.append((p, n, total)))
        assert stored == 3
        assert sorted(db.traded_type_ids(REGION_ID)) == [34, 35, 36]
        meta = db.region_sync_status(REGION_ID)
        assert meta["page_count"] == 2 and meta["order_count"] == 3
        assert sync.region_fresh(REGION_ID) is True
        # page 2 was flushed on arrival (progress sees it), no full buffering
        assert progress == [(1, 2, 2), (2, 1, 3)]

    async def test_bulk_within_ttl_is_skipped_then_force_refetches(self, db, fake,
                                                                  tmp_config_path):
        fake.orders[(REGION_ID, None)] = [[order(1)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.sync_region_orders_bulk(REGION_ID) == 1
            before = len(fake.requests)
            assert await sync.sync_region_orders_bulk(REGION_ID) is None
            assert len(fake.requests) == before
            fake.orders[(REGION_ID, None)] = [[order(1), order(2)]]
            assert await sync.sync_region_orders_bulk(REGION_ID, force=True) == 2

    async def test_bulk_replaces_stale_orders_of_the_whole_region(self, db, fake,
                                                                  tmp_config_path):
        fake.orders[(REGION_ID, None)] = [[order(1), order(2, type_id=35)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.sync_region_orders_bulk(REGION_ID)
            # overnight: order 2 is gone from ESI, order 3 appeared
            fake.orders[(REGION_ID, None)] = [[order(1), order(3, type_id=36)]]
            await sync.sync_region_orders_bulk(REGION_ID, force=True)
        remaining = {r["order_id"] for r in
                     db.fetchall("SELECT order_id FROM market_orders")}
        assert remaining == {1, 3}

    async def test_bulk_on_empty_region_clears_the_book(self, db, fake, tmp_config_path):
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)]]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.sync_type_orders(REGION_ID, TYPE_ID)  # stale per-type data
            fake.orders[(REGION_ID, None)] = []  # region-wide: nothing on the market
            assert await sync.sync_region_orders_bulk(REGION_ID, force=True) == 0
        assert db.fetchall("SELECT * FROM market_orders WHERE region_id=?", (REGION_ID,)) == []
        assert sync.region_fresh(REGION_ID) is True