"""Async ESI HTTP client (section 18).

Design goals, all driven by ``config.yaml`` (the ``esi:`` block):

* **Pagination** — ESI list endpoints advertise ``X-Pages``; ``get_paged``
  walks every page once and never requests past the last one (a request for
  ``page = X-Pages + 1`` answers ``404``).
* **Caching** — every response is keyed by URL + query string and stored with a
  TTL.  ``ETag`` revalidation turns an expired entry into a cheap ``304``
  instead of a full re-download.
* **Rate-limit hygiene** — bounded concurrency, a small delay between requests
  and honouring ``Retry-After`` / ``X-ESI-Error-Limit-*``.
* **Retries** — transient network errors and ``5xx`` are retried with
  exponential backoff; persistent ``420/429`` raise ``EsiRateLimitError`` so the
  caller can back off the whole sync instead of hammering ESI.

The transport is injectable (``httpx.MockTransport``) which keeps the unit tests
network-free.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional

import httpx

from app.config import EsiSettings
from app.esi.cache import Cache, CacheEntry, NullCache

log = logging.getLogger(__name__)

# Status codes that mean "slow down" rather than "your request is wrong"
RATE_LIMIT_STATUSES = frozenset({420, 429})


class EsiError(Exception):
    """A non-recoverable ESI failure (bad request, retries exhausted, ...)."""

    def __init__(self, message: str, status: Optional[int] = None,
                 url: Optional[str] = None) -> None:
        super().__init__(message)
        self.status = status
        self.url = url


class EsiNotFoundError(EsiError):
    """``404`` — the resource does not exist (empty order book, unknown id)."""


class EsiRateLimitError(EsiError):
    """ESI throttling (``420`` / ``429``) that persisted beyond ``max_retries``."""


@dataclass(frozen=True, slots=True)
class EsiResponse:
    """One ESI response: parsed body plus the metadata we care about.

    ``pages_known`` records whether ``X-Pages`` was actually present.  ESI does
    echo it on ``304`` responses (verified live), but :meth:`EsiClient.get_paged`
    stays correct even if it ever stops doing so.
    """

    body: Any
    status: int = 200
    etag: Optional[str] = None
    pages: int = 1
    pages_known: bool = False
    cached: bool = False


class EsiClient:
    """Cache-aware, retrying, politely rate-limited ESI client."""

    def __init__(
        self,
        settings: EsiSettings,
        cache: Optional[Cache] = None,
        *,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        default_ttl: float = 300.0,
        max_retry_after_seconds: float = 60.0,
        base_backoff_seconds: float = 0.5,
        max_pages_without_header: int = 50,
    ) -> None:
        self._settings = settings
        self._cache: Cache = cache if cache is not None else NullCache()
        self._transport = transport
        self.default_ttl = default_ttl
        # A server-requested wait longer than this is treated as "give up now".
        self.max_retry_after_seconds = max_retry_after_seconds
        self.base_backoff_seconds = base_backoff_seconds
        # Safety valve when a paginated endpoint omits ``X-Pages``.
        self.max_pages_without_header = max_pages_without_header
        self._client: Optional[httpx.AsyncClient] = None
        self._semaphore = asyncio.Semaphore(settings.max_concurrent)
        self._delay_lock = asyncio.Lock()
        self._last_request_at = 0.0
        self._error_limit_remain = 100
        self._error_limit_reset = 0.0

    # -- lifecycle ---------------------------------------------------------
    async def __aenter__(self) -> "EsiClient":
        self._ensure_client()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            # httpx merges base_url + path naively: the base *must* end in "/".
            base = self._settings.base_url.rstrip("/") + "/"
            self._client = httpx.AsyncClient(
                base_url=base,
                timeout=self._settings.timeout_seconds,
                headers={
                    "User-Agent": self._settings.user_agent,
                    "Accept": "application/json",
                },
                transport=self._transport,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # -- public API --------------------------------------------------------
    async def get(self, path: str, params: Optional[Mapping[str, Any]] = None, *,
                  ttl: Optional[float] = None, cache: bool = True,
                  allow_fresh_hit: bool = True) -> EsiResponse:
        """Fetch one (non-paginated) resource.

        ``allow_fresh_hit=False`` forces a conditional request even for a fresh
        cache entry — used by :meth:`get_paged` to read the *current* page count
        from the response headers.
        """
        ttl = self.default_ttl if ttl is None else ttl
        key = self._cache_key(path, params)

        if cache and allow_fresh_hit:
            fresh = await self._cache.get(key)
            if fresh is not None:
                return EsiResponse(body=json.loads(fresh.body), etag=fresh.etag,
                                   cached=True)

        stale: Optional[CacheEntry] = await self._cache.get_stale(key) if cache else None
        headers = {"If-None-Match": stale.etag} if stale and stale.etag else None

        resp = await self._request(path, params, headers=headers)

        if resp.status_code == 304 and stale is not None:
            await self._cache.set(key, stale.body, stale.etag, ttl)
            return EsiResponse(body=json.loads(stale.body), status=304,
                               etag=stale.etag, pages=_page_count(resp),
                               pages_known=_has_pages_header(resp), cached=True)

        if resp.status_code == 404:
            raise EsiNotFoundError(_error_message(resp), 404, str(resp.request.url))
        if resp.status_code >= 400:
            raise EsiError(_error_message(resp), resp.status_code, str(resp.request.url))

        body = _parse_json(resp)
        etag = resp.headers.get("etag")
        if cache:
            await self._cache.set(key, resp.text, etag, ttl)
        return EsiResponse(body=body, status=resp.status_code, etag=etag,
                           pages=_page_count(resp),
                           pages_known=_has_pages_header(resp))

    async def get_json(self, path: str, params: Optional[Mapping[str, Any]] = None, *,
                       ttl: Optional[float] = None, cache: bool = True) -> Any:
        """As :meth:`get`, returning only the parsed body."""
        resp = await self.get(path, params, ttl=ttl, cache=cache)
        return resp.body

    async def post_json(self, path: str, payload: Any, *,
                        ttl: Optional[float] = None, cache: bool = True) -> Any:
        """POST a JSON body and return the parsed response (cached by payload).

        Used for ``POST /universe/names/`` (bulk id -> name resolution), whose
        request body is a *raw JSON array* of ids (verified live — ``{"ids":
        [...]}`` is rejected).  The cache key folds the payload in so different
        batches never collide.
        """
        ttl = self.default_ttl if ttl is None else ttl
        digest = hashlib.sha1(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        key = f"{path}#post#{digest}"
        if cache:
            fresh = await self._cache.get(key)
            if fresh is not None:
                return json.loads(fresh.body)
        stale: Optional[CacheEntry] = await self._cache.get_stale(key) if cache else None
        resp = await self._request(path, method="POST", json_body=payload)
        if resp.status_code == 304 and stale is not None:
            return json.loads(stale.body)
        if resp.status_code == 404:
            raise EsiNotFoundError(_error_message(resp), 404, str(resp.request.url))
        if resp.status_code >= 400:
            raise EsiError(_error_message(resp), resp.status_code, str(resp.request.url))
        body = _parse_json(resp)
        if cache:
            await self._cache.set(key, resp.text, resp.headers.get("etag"), ttl)
        return body

    async def get_paged(self, path: str, params: Optional[Mapping[str, Any]] = None, *,
                        ttl: Optional[float] = None, cache: bool = True) -> list[Any]:
        """Fetch every page of a paginated ESI list endpoint (materialised)."""
        items: list[Any] = []
        async for _, chunk in self.iter_pages(path, params, ttl=ttl, cache=cache):
            items.extend(chunk)
        return items

    async def iter_pages(self, path: str, params: Optional[Mapping[str, Any]] = None, *,
                         ttl: Optional[float] = None, cache: bool = True):
        """Stream a paginated ESI list endpoint page by page.

        Yields ``(page_number, items)`` so bulk consumers (full-region order
        books, ~10⁵–10⁶ rows) can persist each page instead of accumulating
        everything in memory.  Page 1 is always revalidated so the page count
        comes from a live response; later pages are served from cache while
        still fresh.  A ``404`` means "no data" (empty market) — and, past the
        final page, is also how ESI answers an out-of-range ``page`` parameter.
        """
        params = dict(params or {})
        try:
            first = await self.get(path, {**params, "page": 1}, ttl=ttl,
                                   cache=cache, allow_fresh_hit=False)
        except EsiNotFoundError:
            return
        first_body = list(first.body or [])
        if first_body:
            yield 1, first_body
        if first.pages_known:
            pages = range(2, first.pages + 1)
        else:
            # No ``X-Pages``: probe forward until ESI answers 404 (out of range).
            pages = range(2, self.max_pages_without_header + 1)
        previous = first.body
        for page in pages:
            try:
                more = await self.get_json(path, {**params, "page": page},
                                           ttl=ttl, cache=cache)
            except EsiNotFoundError:  # past the last page / result set shrank
                break
            if more == previous:
                # Server ignores ``page`` and repeats itself -> never duplicate.
                break
            if not more:
                break
            yield page, more
            previous = more

    # -- request plumbing --------------------------------------------------
    async def _request(self, path: str, params: Optional[Mapping[str, Any]] = None,
                       headers: Optional[Mapping[str, str]] = None, *,
                       method: str = "GET",
                       json_body: Optional[Any] = None) -> httpx.Response:
        client = self._ensure_client()
        full_params = dict(params or {})
        full_params.setdefault("datasource", self._settings.datasource)
        attempt = 0
        while True:
            await self._throttle()
            async with self._semaphore:
                try:
                    if method == "GET":
                        resp = await client.get(path, params=full_params,
                                                headers=headers)
                    else:
                        resp = await client.request(method, path, json=json_body,
                                                    params=full_params, headers=headers)
                except httpx.TransportError as exc:
                    if attempt >= self._settings.max_retries:
                        raise EsiError(f"Network failure for {path}: {exc}") from exc
                    log.warning("ESI network error for %s (attempt %d): %s",
                                path, attempt + 1, exc)
                    await self._backoff(attempt, None)
                    attempt += 1
                    continue
            self._note_error_limit(resp)
            if resp.status_code in RATE_LIMIT_STATUSES:
                wait = _retry_after(resp)
                url = str(resp.request.url)
                if attempt >= self._settings.max_retries:
                    raise EsiRateLimitError(
                        f"ESI rate limit persisted after {attempt + 1} attempts "
                        f"({path}); asked to wait {wait}s", resp.status_code, url)
                if wait is not None and wait > self.max_retry_after_seconds:
                    raise EsiRateLimitError(
                        f"ESI asked to wait {wait}s (> {self.max_retry_after_seconds}s) "
                        f"for {path}", resp.status_code, url)
                log.warning("ESI rate limit (HTTP %d) on %s; waiting %ss",
                            resp.status_code, path, wait)
                await self._backoff(attempt, wait)
                attempt += 1
                continue
            if resp.status_code >= 500:
                if attempt >= self._settings.max_retries:
                    raise EsiError(
                        f"ESI server error HTTP {resp.status_code} for {path}",
                        resp.status_code, str(resp.request.url))
                await self._backoff(attempt, None)
                attempt += 1
                continue
            return resp

    async def _throttle(self) -> None:
        """Polite pacing: minimum delay between calls + error-limit back-off."""
        if self._error_limit_remain <= 0 and self._error_limit_reset > 0:
            wait = min(self._error_limit_reset, self.max_retry_after_seconds)
            log.warning("ESI error limit exhausted; sleeping %.1fs", wait)
            await asyncio.sleep(wait)
            self._error_limit_remain = 100
            self._error_limit_reset = 0.0
        delay = self._settings.request_delay_seconds
        if delay <= 0:
            return
        async with self._delay_lock:
            wait = self._last_request_at + delay - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request_at = time.monotonic()

    async def _backoff(self, attempt: int, retry_after: Optional[float]) -> None:
        if retry_after is not None:
            await asyncio.sleep(retry_after)
            return
        factor = self._settings.retry_backoff_factor ** attempt
        await asyncio.sleep(self.base_backoff_seconds * factor)

    def _note_error_limit(self, resp: httpx.Response) -> None:
        remain = resp.headers.get("x-esi-error-limit-remain")
        reset = resp.headers.get("x-esi-error-limit-reset")
        if remain is not None:
            try:
                self._error_limit_remain = int(remain)
            except ValueError:
                pass
        if reset is not None:
            try:
                self._error_limit_reset = float(reset)
            except ValueError:
                pass

    @staticmethod
    def _cache_key(path: str, params: Optional[Mapping[str, Any]]) -> str:
        items = sorted((str(k), str(v)) for k, v in (params or {}).items())
        qs = "&".join(f"{k}={v}" for k, v in items)
        return f"{path}?{qs}" if qs else path


# -- module helpers --------------------------------------------------------
def _parse_json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError as exc:
        raise EsiError(
            f"Non-JSON ESI response (HTTP {resp.status_code}): {resp.text[:120]!r}",
            resp.status_code, str(resp.request.url)) from exc


def _error_message(resp: httpx.Response) -> str:
    detail = ""
    try:
        payload = resp.json()
        if isinstance(payload, dict) and "error" in payload:
            detail = f": {payload['error']}"
    except ValueError:
        detail = f": {resp.text[:120]!r}"
    return f"HTTP {resp.status_code} for {resp.request.url}{detail}"


def _has_pages_header(resp: httpx.Response) -> bool:
    return resp.headers.get("x-pages") is not None


def _page_count(resp: httpx.Response) -> int:
    raw = resp.headers.get("x-pages")
    try:
        return max(1, int(raw)) if raw else 1
    except ValueError:
        return 1


def _retry_after(resp: httpx.Response) -> Optional[float]:
    raw = resp.headers.get("retry-after")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None