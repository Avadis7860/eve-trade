/**
 * ESI Client - Centralized Server-Side Acquisition Layer for CCP EVE Swagger Interface
 * Implements exponential backoff with jitter, retry on transient 5xx errors,
 * rate limit inspection (x-esi-error-limit-remain), Retry-After honoring,
 * and deterministic mock injection for testing.
 */

import { logEvent } from './logger';
import { ESI_COMPATIBILITY_DATE } from './esiTypes';
import type { EsiResponseMetadata } from './esiTypes';

export type EsiFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EsiFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  etag?: string;
  customFetch?: EsiFetchFn;
  /** Overrides the application-wide ESI compatibility date for tests or controlled migrations. */
  compatibilityDate?: string;
}

export interface EsiFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  etag?: string;
  expires?: string;
  errorLimitRemain?: number;
  errorLimitReset?: number;
  retryAfter?: number;
  xPages?: string;
  lastModified?: string;
  cacheControl?: string;
  compatibilityDate?: string;
  rateLimitGroup?: string;
  rateLimitLimit?: string;
  rateLimitRemaining?: number;
  rateLimitUsed?: number;
  retryAfterSeconds?: number;
  metadata: EsiResponseMetadata;
}

const DEFAULT_USER_AGENT = 'eve-trade-interregional/0.3 (https://github.com/eve-trade)';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;

let globalMockFetch: EsiFetchFn | null = null;

/**
 * Configure a global mock fetch function for deterministic offline testing
 */
export function setGlobalEsiMock(mockFn: EsiFetchFn | null): void {
  globalMockFetch = mockFn;
}

export function getGlobalEsiMock(): EsiFetchFn | null {
  return globalMockFetch;
}

export async function fetchEsi<T = unknown>(
  endpoint: string,
  options: EsiFetchOptions = {}
): Promise<EsiFetchResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = MAX_RETRIES,
    etag,
    customFetch,
    compatibilityDate = ESI_COMPATIBILITY_DATE,
    headers = {},
    ...restOptions
  } = options;

  const activeFetch: EsiFetchFn = customFetch || globalMockFetch || fetch;

  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://esi.evetech.net/latest${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'application/json',
    'X-Compatibility-Date': compatibilityDate,
    ...(headers as Record<string, string>),
  };

  if (etag) {
    requestHeaders['If-None-Match'] = etag;
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await activeFetch(url, {
        ...restOptions,
        headers: requestHeaders,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const remainHeader = response.headers.get('x-esi-error-limit-remain');
      const resetHeader = response.headers.get('x-esi-error-limit-reset');
      const retryAfterHeader = response.headers.get('retry-after');
      const responseEtag = response.headers.get('etag') || undefined;
      const responseExpires = response.headers.get('expires') || undefined;
      const lastModified = response.headers.get('last-modified') || undefined;
      const cacheControl = response.headers.get('cache-control') || undefined;
      const responseCompatibilityDate = response.headers.get('x-compatibility-date') || compatibilityDate;
      const xPages = response.headers.get('x-pages') || undefined;
      const rateLimitGroup = response.headers.get('x-ratelimit-group') || undefined;
      const rateLimitLimit = response.headers.get('x-ratelimit-limit') || undefined;
      const rateLimitRemainingHeader = response.headers.get('x-ratelimit-remaining');
      const rateLimitUsedHeader = response.headers.get('x-ratelimit-used');

      const errorLimitRemain = remainHeader ? parseInt(remainHeader, 10) : undefined;
      const errorLimitReset = resetHeader ? parseInt(resetHeader, 10) : undefined;
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      const rateLimitRemaining = rateLimitRemainingHeader ? parseInt(rateLimitRemainingHeader, 10) : undefined;
      const rateLimitUsed = rateLimitUsedHeader ? parseInt(rateLimitUsedHeader, 10) : undefined;

      const metadata: EsiResponseMetadata = {
        cache: {
          etag: responseEtag,
          expires: responseExpires,
          lastModified,
          cacheControl,
          compatibilityDate: responseCompatibilityDate,
        },
        rateLimit: {
          retryAfterSeconds: retryAfter,
          errorLimitRemain,
          errorLimitResetSeconds: errorLimitReset,
          rateLimitGroup,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitUsed,
        },
        pagination: {
          xPages: xPages ? parseInt(xPages, 10) : undefined,
        },
      };

      // Handle 304 Not Modified
      if (response.status === 304) {
        return {
          ok: true,
          status: 304,
          data: null,
          etag: responseEtag,
          expires: responseExpires,
          errorLimitRemain,
          errorLimitReset,
          retryAfter,
          xPages,
          lastModified,
          cacheControl,
          compatibilityDate: responseCompatibilityDate,
          rateLimitGroup,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitUsed,
          retryAfterSeconds: retryAfter,
          metadata,
        };
      }

      // ESI Error Limit Budget Enforcement:
      // If error budget is exhausted (remain <= 0), NEVER retry to avoid IP bans / 420 lockouts
      if (errorLimitRemain !== undefined && errorLimitRemain <= 0) {
        logEvent('ERROR', 'ESI', 'ESI error limit exhausted (remain <= 0). Aborting retries immediately.', {
          status: response.status,
          resetSeconds: errorLimitReset,
        });
        const errText = await response.text().catch(() => 'ESI error limit exhausted');
        return {
          ok: false,
          status: response.status,
          data: null,
          error: errText,
          etag: responseEtag,
          expires: responseExpires,
          errorLimitRemain,
          errorLimitReset,
          retryAfter,
          xPages,
          lastModified,
          cacheControl,
          compatibilityDate: responseCompatibilityDate,
          rateLimitGroup,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitUsed,
          retryAfterSeconds: retryAfter,
          metadata,
        };
      }

      // Handle 429 Too Many Requests or 420 Enhance Your Calm
      if ((response.status === 429 || response.status === 420) && attempt < retries) {
        const backoffSeconds = Math.min(Math.max(retryAfter || 1, 1), 5);
        if (retryAfter && retryAfter > 5) {
          // If server requested delay > 5s, do not block backend process; return 429 to caller
          logEvent('WARN', 'ESI', `ESI rate limited (429/420) with long Retry-After (${retryAfter}s). Returning to caller.`);
          const errText = await response.text().catch(() => 'Rate limited');
          return {
            ok: false,
            status: response.status,
            data: null,
            error: errText,
            etag: responseEtag,
            expires: responseExpires,
            errorLimitRemain,
            errorLimitReset,
            retryAfter,
            xPages,
          };
        }

        attempt++;
        const jitter = Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoffSeconds * 1000 + jitter));
        continue;
      }

      // Handle transient server errors (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        attempt++;
        const jitter = Math.random() * 200;
        const delay = Math.pow(2, attempt) * 400 + jitter;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown ESI error');
        return {
          ok: false,
          status: response.status,
          data: null,
          error: errText,
          etag: responseEtag,
          expires: responseExpires,
          errorLimitRemain,
          errorLimitReset,
          retryAfter,
          xPages,
          lastModified,
          cacheControl,
          compatibilityDate: responseCompatibilityDate,
          rateLimitGroup,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitUsed,
          retryAfterSeconds: retryAfter,
          metadata,
        };
      }

      const data = (await response.json()) as T;
      return {
        ok: true,
        status: response.status,
        data,
        etag: responseEtag,
        expires: responseExpires,
        errorLimitRemain,
        errorLimitReset,
        retryAfter,
        xPages,
        lastModified,
        cacheControl,
        compatibilityDate: responseCompatibilityDate,
        rateLimitGroup,
        rateLimitLimit,
        rateLimitRemaining,
        rateLimitUsed,
        retryAfterSeconds: retryAfter,
        metadata,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = err;

      // Check if aborted due to timeout
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      if (isAbort) {
        // Do not retry on explicit timeout
        break;
      }

      if (attempt < retries) {
        attempt++;
        const jitter = Math.random() * 200;
        const delay = Math.pow(2, attempt) * 400 + jitter;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  const isAbort = lastError instanceof Error && (lastError.name === 'AbortError' || lastError.message.includes('aborted'));
  return {
    ok: false,
    status: isAbort ? 504 : 500,
    data: null,
    error: isAbort ? 'ESI request timed out' : String(lastError || 'Network request failed'),
    metadata: {
      cache: { compatibilityDate },
      rateLimit: {},
      pagination: {},
    },
  };
}
