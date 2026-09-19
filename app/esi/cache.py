"""HTTP response cache backing for the ESI client (section 16).

A small protocol + two implementations.  ``SqliteCache`` persists responses in
the ``esi_cache`` table (TTL + ETag) so re-runs never re-fetch fresh data.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Protocol


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """ISO-8601 UTC timestamp used by every sync / snapshot write."""
    return now_utc().isoformat()


def _parse_expiry(value: str) -> datetime:
    """Parse a stored ISO timestamp, tolerating naive (legacy) values."""
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass(frozen=True, slots=True)
class CacheEntry:
    body: str
    etag: Optional[str]


class Cache(Protocol):
    async def get(self, key: str) -> Optional[CacheEntry]: ...
    async def get_stale(self, key: str) -> Optional[CacheEntry]:
        """Return the entry even when expired (used for ETag revalidation)."""
    async def set(self, key: str, body: str, etag: Optional[str],
                  ttl_seconds: float) -> None: ...
    async def invalidate(self, key: str) -> None: ...


class NullCache:
    """No caching — every request hits the network (tests / fresh pulls)."""

    async def get(self, key: str) -> Optional[CacheEntry]:
        return None

    async def get_stale(self, key: str) -> Optional[CacheEntry]:
        return None

    async def set(self, key: str, body: str, etag: Optional[str],
                  ttl_seconds: float) -> None:
        return None

    async def invalidate(self, key: str) -> None:
        return None


class SqliteCache:
    """Async cache backed by Database.esi_cache (read/write off the event loop)."""

    def __init__(self, db):
        self._db = db

    async def get(self, key: str) -> Optional[CacheEntry]:
        row = await asyncio.to_thread(self._db.cache_get, key)
        if not row:
            return None
        if _parse_expiry(row["expires_at"]) <= now_utc():
            return None  # stale -> ignore (still available via get_stale)
        return CacheEntry(body=row["body"], etag=row["etag"])

    async def get_stale(self, key: str) -> Optional[CacheEntry]:
        """Return the stored entry regardless of its TTL (for ``If-None-Match``)."""
        row = await asyncio.to_thread(self._db.cache_get, key)
        if not row:
            return None
        return CacheEntry(body=row["body"], etag=row["etag"])

    async def set(self, key: str, body: str, etag: Optional[str],
                  ttl_seconds: float) -> None:
        expires = (now_utc() + timedelta(seconds=ttl_seconds)).isoformat()
        captured = now_utc().isoformat()
        await asyncio.to_thread(self._db.cache_set, key, body, etag, captured, expires)

    async def invalidate(self, key: str) -> None:
        await asyncio.to_thread(self._db.cache_invalidate, key)
