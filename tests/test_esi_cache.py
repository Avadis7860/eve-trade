"""Tests for app.esi.cache (section 16: TTL + ETag storage)."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import load_config
from app.db import Database
from app.esi.cache import CacheEntry, NullCache, SqliteCache
from app.esi.client import EsiClient
from tests.fake_esi import TYPE_ID, FakeEsi


@pytest.fixture
def db(tmp_path: Path) -> Database:
    return Database(tmp_path / "cache.db")


class TestNullCache:
    async def test_everything_is_a_miss_and_writes_are_noops(self):
        cache = NullCache()
        await cache.set("/x/", "{}", '"etag"', 60)
        assert await cache.get("/x/") is None
        assert await cache.get_stale("/x/") is None
        await cache.invalidate("/x/")  # must not raise


class TestSqliteCache:
    async def test_round_trip(self, db: Database):
        cache = SqliteCache(db)
        await cache.set("/universe/types/34/", '{"type_id":34}', '"abc"', 300)
        entry = await cache.get("/universe/types/34/")
        assert entry == CacheEntry(body='{"type_id":34}', etag='"abc"')

    async def test_expired_entry_is_a_miss_but_still_stale_readable(self, db: Database):
        cache = SqliteCache(db)
        await cache.set("/x/", "{}", '"abc"', ttl_seconds=0)
        assert await cache.get("/x/") is None
        assert (await cache.get_stale("/x/")).etag == '"abc"'

    async def test_invalidate_removes_the_entry(self, db: Database):
        cache = SqliteCache(db)
        await cache.set("/x/", "{}", '"abc"', 300)
        await cache.invalidate("/x/")
        assert await cache.get("/x/") is None
        assert await cache.get_stale("/x/") is None

    async def test_entry_without_etag_is_stored(self, db: Database):
        cache = SqliteCache(db)
        await cache.set("/x/", "{}", None, 300)
        assert (await cache.get("/x/")).etag is None

    async def test_client_uses_the_sqlite_cache_end_to_end(self, db, tmp_config_path):
        fake = FakeEsi()
        config = load_config(tmp_config_path)
        client = EsiClient(config.esi, SqliteCache(db), transport=fake.transport())
        async with client:
            first = await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
            second = await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
        assert first == second
        assert len(fake.requests) == 1  # served from the DB-backed cache