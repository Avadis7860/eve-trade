"""Tests for app.esi.universe (sections 5, 7, 16: universe sync + hub ids)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from app.config import get_settings, load_config
from app.db import Database
from app.esi.client import EsiClient, EsiError
from app.esi.universe import UniverseSync
from tests.fake_esi import (
    AMARR_STATION_ID,
    AMARR_SYSTEM_ID,
    CATEGORY_ID,
    CONSTELLATION_ID,
    DOMAIN_ID,
    GROUP_ID,
    REGION_ID,
    STATION_ID,
    STATION_NAME,
    SYSTEM_ID,
    TYPE_ID,
    FakeEsi,
    order,
)


@pytest.fixture
def db(tmp_path: Path) -> Database:
    return Database(tmp_path / "universe.db")


@pytest.fixture
def fake() -> FakeEsi:
    return FakeEsi()


def make_sync(db: Database, fake: FakeEsi, config) -> UniverseSync:
    client = EsiClient(config.esi, transport=fake.transport(),
                       base_backoff_seconds=0.0)
    return UniverseSync(db, client, config)


class TestRegionSync:
    async def test_sync_region_caches_constellations_and_systems(self, db, fake,
                                                                 tmp_config_path):
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_region(REGION_ID)

        assert db.resolve_region_id("The Forge") == REGION_ID
        row = db.fetchone("SELECT * FROM constellations WHERE constellation_id=?",
                          (CONSTELLATION_ID,))
        assert row["name"] == "Kimotoro" and row["region_id"] == REGION_ID

        jita = db.fetchone("SELECT * FROM solar_systems WHERE system_id=?", (SYSTEM_ID,))
        # region_id is not in ESI's system document: it must come from the constellation
        assert jita["region_id"] == REGION_ID
        assert jita["constellation_id"] == CONSTELLATION_ID
        assert jita["is_highsec"] == 1  # 0.9459 >= high_sec_threshold 0.5
        assert db.resolve_system_by_name("Perimeter")["region_id"] == REGION_ID

    async def test_sync_region_with_stations(self, db, fake, tmp_config_path):
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_region(REGION_ID, with_stations=True)
        row = db.fetchone("SELECT * FROM stations WHERE station_id=?", (STATION_ID,))
        assert row["name"] == STATION_NAME and row["system_id"] == SYSTEM_ID
        assert row["has_market"] == 1

    async def test_find_region_id_prefers_the_cache(self, db, fake, tmp_config_path):
        db.upsert_region(REGION_ID, "The Forge", "")
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.find_region_id("The Forge") == REGION_ID
        assert fake.requests == []  # no network at all

    async def test_find_region_id_scans_esi_when_uncached(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.find_region_id("The Forge") == REGION_ID
            assert await sync.find_region_id("Nowhere") is None

    async def test_unknown_system_is_skipped(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.sync_system(999999) is None
            assert await sync.sync_station(999999) is None
class TestTypeSync:
    async def test_sync_type_stores_taxonomy_chain(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            doc = await sync.sync_type(TYPE_ID)
        assert doc["name"] == "Tritanium"
        row = db.fetchone("SELECT * FROM types WHERE type_id=?", (TYPE_ID,))
        assert (row["name"], row["group_id"], row["category_id"]) == (
            "Tritanium", GROUP_ID, CATEGORY_ID)
        assert row["volume"] == pytest.approx(0.01)
        assert row["published"] == 1
        assert db.fetchone("SELECT name FROM groups WHERE group_id=?", (GROUP_ID,))["name"] == "Mineral"
        assert db.fetchone("SELECT name FROM categories WHERE category_id=?",
                           (CATEGORY_ID,))["name"] == "Material"

    async def test_group_and_category_are_fetched_once_per_type(self, db, fake,
                                                                tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.sync_types([TYPE_ID, TYPE_ID]) == 2
        # group/category are cached in the DB, so both type calls share them
        assert fake.request_count("/universe/groups/") == 1
        assert fake.request_count("/universe/categories/") == 1

    async def test_unknown_type_returns_none(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.sync_type(999999) is None
            assert await sync.sync_types([999999, 999998]) == 0

    async def test_all_type_ids_are_paged(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            assert await sync.all_type_ids() == [TYPE_ID]
        # X-Pages came from the response, so no probing request was needed
        assert [r.url.params.get("page") for r in fake.requests] == ["1"]


class TestTypeCatalog:
    async def test_enrich_type_names_uses_post_names(self, db, fake, tmp_config_path):
        fake.known_names.update({34: "Tritanium", 35: "Pyerite", 37: "Isogen"})
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            stored = await sync.enrich_type_names([37, 35, 999999, 34])
        assert stored == 3  # unknown ids are omitted by ESI
        names = db.type_names([34, 35, 37])
        assert names == {34: "Tritanium", 35: "Pyerite", 37: "Isogen"}
        body = json.loads(fake.requests[0].content)
        assert body == [34, 35, 37, 999999]  # raw array, sorted; unknown ids sent too
        assert fake.post_count("/universe/names/") == 1

    async def test_enrich_type_names_is_cached_and_chunked(self, db, fake, tmp_config_path):
        from app.esi.cache import SqliteCache

        fake.known_names = {i: f"Type {i}" for i in range(1, 1201)}
        config = load_config(tmp_config_path)
        client = EsiClient(config.esi, SqliteCache(db), transport=fake.transport(),
                           base_backoff_seconds=0.0)
        sync = UniverseSync(db, client, config)
        async with sync.client:
            assert await sync.enrich_type_names(range(1, 1201)) == 1200
            assert fake.post_count("/universe/names/") == 2  # 1000 + 200
            before = fake.post_count("/universe/names/")
            assert await sync.enrich_type_names(range(1, 1201)) == 1200
            assert fake.post_count("/universe/names/") == before  # served from cache

    async def test_post_names_rejects_oversized_batches(self, db, fake, tmp_config_path):
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            with pytest.raises(EsiError):
                await sync.client.post_json("/universe/names/", list(range(1500)))

    async def test_tag_group_members_attaches_taxonomy_without_per_type_fetches(
            self, db, fake, tmp_config_path):
        fake.known_names.update({34: "Tritanium", 35: "Pyerite"})
        fake.groups[GROUP_ID]["types"] = [34, 35]
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.enrich_type_names([34, 35])
            tagged = await sync.tag_group_members(GROUP_ID)
        assert tagged == 2
        for type_id in (34, 35):
            row = db.fetchone("SELECT * FROM types WHERE type_id=?", (type_id,))
            assert row["group_id"] == GROUP_ID
            assert row["category_id"] == CATEGORY_ID
        assert db.fetchone("SELECT name FROM groups WHERE group_id=?",
                           (GROUP_ID,))["name"] == "Mineral"
        # browsing helpers see them now
        assert [g["name"] for g in db.browse_categories()] == ["Material"]
        assert db.browse_groups(CATEGORY_ID)[0]["type_count"] == 2

    async def test_search_types_finds_by_name(self, db, fake, tmp_config_path):
        fake.known_names.update({34: "Tritanium", 35: "Pyerite"})
        sync = make_sync(db, fake, load_config(tmp_config_path))
        async with sync.client:
            await sync.enrich_type_names([34, 35])
        hits = db.search_types("trit")
        assert [h["type_id"] for h in hits] == [34]
        assert hits[0]["group_name"] is None  # not tagged yet

    async def test_catalog_coverage_counts_named_traded(self, db, fake, tmp_config_path):
        from app.esi.market import MarketSync
        fake.orders[(REGION_ID, None)] = [[order(1), order(2, type_id=35)]]
        fake.known_names = {34: "Tritanium"}
        config = load_config(tmp_config_path)
        market = MarketSync(db, EsiClient(config.esi, transport=fake.transport(),
                                          base_backoff_seconds=0.0), config)
        sync = make_sync(db, fake, config)
        async with market.client:
            await market.sync_region_orders_bulk(REGION_ID)
            await sync.enrich_type_names([34])
        coverage = db.catalog_coverage(REGION_ID)
        assert coverage["traded"] == 2 and coverage["named"] == 1


class TestHubResolution:
    async def test_sync_hubs_resolves_names_to_ids(self, db, fake, tmp_config_path):
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            hubs = await sync.sync_hubs(persist=False)
        by_name = {h.name: h for h in hubs}
        assert by_name["Jita"].region_id == REGION_ID
        assert by_name["Jita"].system_id == SYSTEM_ID
        assert by_name["Jita"].station_id == STATION_ID
        assert by_name["Amarr"].region_id == DOMAIN_ID
        assert by_name["Amarr"].system_id == AMARR_SYSTEM_ID
        # Amarr declares no station in the test config -> stays None, no crash
        assert by_name["Amarr"].station_id is None

    async def test_resolved_ids_are_persisted_and_reused_offline(self, db, fake,
                                                                 tmp_config_path):
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_hubs(persist=True)
        written = yaml.safe_load(tmp_config_path.read_text(encoding="utf-8"))
        hubs = {h["name"]: h for h in written["market_hubs"]}
        assert hubs["Jita"]["region_id"] == REGION_ID
        assert hubs["Jita"]["system_id"] == SYSTEM_ID
        assert hubs["Jita"]["station_id"] == STATION_ID

        # A later run reading that config resolves from the ids alone.
        fresh = load_config(tmp_config_path)
        offline_fake = FakeEsi()
        offline = make_sync(db, offline_fake, fresh)
        assert offline.resolve_hubs() == list(fresh.market_hubs)
        assert offline_fake.requests == []

    async def test_hub_bootstrap_only_fetches_stations_for_hub_systems(self, db, fake,
                                                                      tmp_config_path):
        """Station details are expensive, so only hub systems are swept by default."""
        fake.stations[999] = {"station_id": 999, "name": "Perimeter VI - Test",
                              "system_id": 30000140, "type_id": 52678}
        fake.systems[30000140]["stations"] = [999]
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_hubs(persist=False)
        fetched = {r.url.path.rsplit("/", 2)[-2] for r in fake.requests
                   if "/universe/stations/" in r.url.path}
        assert fetched == {str(STATION_ID), str(AMARR_STATION_ID)}  # not the 999 one

    async def test_all_stations_sweeps_the_whole_region(self, db, fake, tmp_config_path):
        fake.stations[999] = {"station_id": 999, "name": "Perimeter VI - Test",
                              "system_id": 30000140, "type_id": 52678}
        fake.systems[30000140]["stations"] = [999]
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_hubs(persist=False, all_stations=True)
        assert db.fetchone("SELECT station_id FROM stations WHERE station_id=999")

    async def test_no_stations_leaves_station_id_unset(self, db, fake, tmp_config_path):
        config = load_config(tmp_config_path)
        sync = make_sync(db, fake, config)
        async with sync.client:
            hubs = await sync.sync_hubs(with_stations=False, persist=False)
        by_name = {h.name: h for h in hubs}
        assert by_name["Jita"].system_id == SYSTEM_ID
        assert by_name["Jita"].station_id is None
        assert fake.request_count("/universe/stations/") == 0

    async def test_missing_hub_names_warn_and_leave_ids_unset(self, db, fake,
                                                              tmp_config_path):
        config = load_config(tmp_config_path)
        config.market_hubs.append(
            config.market_hubs[0].model_copy(update={"name": "Nowhere", "region": "Nope",
                                                    "solar_system": "Void"}))
        sync = make_sync(db, fake, config)
        async with sync.client:
            await sync.sync_region(REGION_ID, with_stations=True)
        hubs = {h.name: h for h in sync.resolve_hubs()}
        assert hubs["Nowhere"].region_id is None and hubs["Nowhere"].system_id is None
        assert hubs["Jita"].station_id == STATION_ID  # real hubs still resolve