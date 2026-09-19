"""Tests for app.esi.client (section 18: pagination, caching, rate limits)."""
from __future__ import annotations

import httpx
import pytest

from app.config import EsiSettings
from app.esi.cache import CacheEntry
from app.esi.client import (
    EsiClient,
    EsiError,
    EsiNotFoundError,
    EsiRateLimitError,
)
from tests.fake_esi import REGION_ID, TYPE_ID, FakeEsi, order


class MemoryCache:
    """In-memory Cache protocol implementation with an injectable clock."""

    def __init__(self, now: float = 1000.0) -> None:
        self.entries: dict[str, tuple[str, str | None, float]] = {}
        self.now = now

    async def get(self, key: str) -> CacheEntry | None:
        item = self.entries.get(key)
        if item is None or item[2] <= self.now:
            return None
        return CacheEntry(body=item[0], etag=item[1])

    async def get_stale(self, key: str) -> CacheEntry | None:
        item = self.entries.get(key)
        return None if item is None else CacheEntry(body=item[0], etag=item[1])

    async def set(self, key: str, body: str, etag: str | None,
                  ttl_seconds: float) -> None:
        self.entries[key] = (body, etag, self.now + ttl_seconds)

    async def invalidate(self, key: str) -> None:
        self.entries.pop(key, None)


def settings(**over) -> EsiSettings:
    base = dict(base_url="https://esi.evetech.net/latest", datasource="tranquility",
                user_agent="eve-trade/test", max_concurrent=4,
                request_delay_seconds=0.0, timeout_seconds=5.0, max_retries=2,
                retry_backoff_factor=1.0)
    base.update(over)
    return EsiSettings(**base)


def make_client(fake: FakeEsi, cache=None, **kw) -> EsiClient:
    kw.setdefault("max_retry_after_seconds", 0.05)
    kw.setdefault("base_backoff_seconds", 0.0)
    return EsiClient(settings(**kw.pop("settings", {})), cache,
                     transport=fake.transport(), **kw)


class TestRequestBasics:
    async def test_get_json_and_datasource_param(self):
        fake = FakeEsi()
        async with make_client(fake) as client:
            body = await client.get_json(f"/universe/types/{TYPE_ID}/")
        assert body["name"] == "Tritanium"
        assert fake.requests[0].url.params["datasource"] == "tranquility"
        assert fake.requests[0].headers["user-agent"] == "eve-trade/test"

    async def test_404_raises_not_found(self):
        fake = FakeEsi()
        async with make_client(fake) as client:
            with pytest.raises(EsiNotFoundError) as exc:
                await client.get("/universe/types/999999999/")
        assert exc.value.status == 404

    async def test_500_is_retried_then_raises(self):
        attempts = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            attempts["n"] += 1
            return httpx.Response(502, json={"error": "boom"}, request=request)

        client = EsiClient(settings(), transport=httpx.MockTransport(handler),
                           base_backoff_seconds=0.0)
        async with client:
            with pytest.raises(EsiError, match="server error"):
                await client.get("/universe/types/34/")
        assert attempts["n"] == 3  # initial try + max_retries

    async def test_retry_after_is_honoured(self):
        attempts: list[str | None] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request.headers.get("retry-after"))
            if len(attempts) == 1:
                return httpx.Response(420, headers={"Retry-After": "0"}, request=request)
            return httpx.Response(200, json={"ok": True}, request=request)

        client = EsiClient(settings(), transport=httpx.MockTransport(handler))
        async with client:
            assert await client.get_json("/markets/prices/") == {"ok": True}
        assert len(attempts) == 2

    async def test_long_retry_after_gives_up_immediately(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, headers={"Retry-After": "600"}, request=request)

        client = EsiClient(settings(), transport=httpx.MockTransport(handler))
        async with client:
            with pytest.raises(EsiRateLimitError, match="asked to wait"):
                await client.get("/markets/prices/")

    async def test_transport_error_is_retried(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("no route to host", request=request)

        client = EsiClient(settings(max_retries=1), transport=httpx.MockTransport(handler),
                           base_backoff_seconds=0.0)
        async with client:
            with pytest.raises(EsiError, match="Network failure"):
                await client.get("/universe/types/34/")


class TestPagination:
    async def test_walks_every_page_and_stops_at_last(self):
        fake = FakeEsi()
        fake.orders[(REGION_ID, TYPE_ID)] = [
            [order(1), order(2)], [order(3)], [order(4), order(5), order(6)],
        ]
        async with make_client(fake) as client:
            orders = await client.get_paged(f"/markets/{REGION_ID}/orders/",
                                            {"order_type": "all", "type_id": TYPE_ID})
        assert [o["order_id"] for o in orders] == [1, 2, 3, 4, 5, 6]
        # page 1,2,3 only — page 4 would 404 and must never be requested
        pages = [r.url.params.get("page") for r in fake.requests]
        assert pages == ["1", "2", "3"]

    async def test_empty_book_returns_empty_list(self):
        fake = FakeEsi()
        async with make_client(fake) as client:
            assert await client.get_paged(f"/markets/{REGION_ID}/orders/",
                                          {"type_id": 999}) == []

    async def test_paged_cache_hit_costs_one_conditional_request(self):
        fake = FakeEsi()
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)], [order(2)]]
        cache = MemoryCache()
        async with make_client(fake, cache) as client:
            first = await client.get_paged(f"/markets/{REGION_ID}/orders/",
                                           {"type_id": TYPE_ID})
            before = len(fake.requests)
            second = await client.get_paged(f"/markets/{REGION_ID}/orders/",
                                            {"type_id": TYPE_ID})
        assert first == second
        # page 1 is revalidated (304), page 2 comes straight from the cache
        assert len(fake.requests) - before == 1
        assert fake.not_modified == 1

    async def test_paged_fallback_never_duplicates_repeated_pages(self):
        """A server that ignores ``page`` and omits ``X-Pages`` must not duplicate."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[{"order_id": 1}], request=request)

        client = EsiClient(settings(), transport=httpx.MockTransport(handler))
        async with client:
            items = await client.get_paged(f"/markets/{REGION_ID}/orders/")
        assert items == [{"order_id": 1}]

    async def test_paged_stops_on_empty_page(self):
        pages = {"1": [{"order_id": 1}], "2": []}

        def handler(request: httpx.Request) -> httpx.Response:
            page = str(request.url.params.get("page"))
            return httpx.Response(200, json=pages.get(page, []), request=request)

        client = EsiClient(settings(), transport=httpx.MockTransport(handler))
        async with client:
            items = await client.get_paged(f"/markets/{REGION_ID}/orders/")
        assert items == [{"order_id": 1}]


class TestCaching:
    async def test_fresh_hit_skips_network(self):
        fake = FakeEsi()
        cache = MemoryCache()
        async with make_client(fake, cache) as client:
            await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
            resp = await client.get(f"/universe/types/{TYPE_ID}/", ttl=60)
        assert resp.cached is True and resp.body["name"] == "Tritanium"
        assert len(fake.requests) == 1

    async def test_expired_entry_revalidates_with_etag(self):
        fake = FakeEsi()
        cache = MemoryCache()
        async with make_client(fake, cache) as client:
            await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
            cache.now += 120  # entry is now stale
            resp = await client.get(f"/universe/types/{TYPE_ID}/", ttl=60)
        assert resp.status == 304 and resp.cached is True
        assert fake.requests[1].headers["if-none-match"] == resp.etag

    async def test_cache_disabled_always_refetches(self):
        fake = FakeEsi()
        cache = MemoryCache()
        async with make_client(fake, cache) as client:
            await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
            await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60, cache=False)
        assert len(fake.requests) == 2
        # cache=False must not *write* either: only the first call's entry is there
        assert len(cache.entries) == 1

    async def test_paged_falls_back_to_404_probing_without_x_pages(self):
        fake = FakeEsi()
        fake.orders[(REGION_ID, TYPE_ID)] = [[order(1)], [order(2)]]

        original = fake._json

        def strip_x_pages(request, body, **kw):
            headers = dict(kw.pop("headers", None) or {})
            headers.pop("x-pages", None)
            return original(request, body, headers=headers, **kw)

        fake._json = strip_x_pages
        async with make_client(fake) as client:
            orders = await client.get_paged(f"/markets/{REGION_ID}/orders/",
                                            {"type_id": TYPE_ID})
        assert [o["order_id"] for o in orders] == [1, 2]
        # page 3 was probed and answered 404, which ended the walk
        assert [r.url.params.get("page") for r in fake.requests] == ["1", "2", "3"]

    async def test_cache_key_includes_query_params(self):
        fake = FakeEsi()
        cache = MemoryCache()
        async with make_client(fake, cache) as client:
            await client.get_json(f"/universe/types/{TYPE_ID}/", ttl=60)
            await client.get_json(f"/universe/types/{TYPE_ID}/", {"language": "de"}, ttl=60)
        assert len(fake.requests) == 2
        assert EsiClient._cache_key("/x/", {"b": 2, "a": 1}) == "/x/?a=1&b=2"