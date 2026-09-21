/**
 * ESI Client - Centralized Server-Side Acquisition Layer for CCP EVE Swagger Interface
 * Implements exponential backoff with jitter, retry on transient 5xx errors,
 * rate limit inspection (x-esi-error-limit-remain), and strict timeout aborts.
 */

export interface EsiFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  etag?: string;
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
}

const DEFAULT_USER_AGENT = 'eve-trade-interregional/0.3 (https://github.com/eve-trade)';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;

export async function fetchEsi<T = unknown>(
  endpoint: string,
  options: EsiFetchOptions = {}
): Promise<EsiFetchResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = MAX_RETRIES,
    etag,
    headers = {},
    ...restOptions
  } = options;

  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://esi.evetech.net/latest${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'application/json',
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
      const response = await fetch(url, {
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

      const errorLimitRemain = remainHeader ? parseInt(remainHeader, 10) : undefined;
      const errorLimitReset = resetHeader ? parseInt(resetHeader, 10) : undefined;
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

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
        };
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
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      lastError = err;

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

  const isAbort = lastError instanceof Error && lastError.name === 'AbortError';
  return {
    ok: false,
    status: isAbort ? 504 : 500,
    data: null,
    error: isAbort ? 'ESI request timed out' : String(lastError || 'Network request failed'),
  };
}
