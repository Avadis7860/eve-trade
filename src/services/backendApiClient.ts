export type BackendFetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BackendApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  headers: Headers;
}

const defaultFetch: BackendFetchFn = (input, init) => fetch(input, init);
let activeFetch: BackendFetchFn = defaultFetch;

/**
 * Central frontend -> backend HTTP boundary.
 *
 * This client intentionally contains no ESI policy: retries, ETags, rate limits,
 * pagination semantics and upstream error handling belong to the server ESI layer.
 */
export async function fetchBackendApi<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<BackendApiResult<T>> {
  const response = await activeFetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  let data: T | null = null;

  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      data = (await response.json()) as T;
    } else {
      const text = await response.text();
      if (text) {
        throw new Error(`Backend API returned non-JSON response (HTTP ${response.status})`);
      }
    }
  }

  return { ok: response.ok, status: response.status, data, headers: response.headers };
}

/**
 * Deterministic transport injection for unit/contract tests.
 */
export function setBackendApiFetchForTesting(mockFetch: BackendFetchFn | null): void {
  activeFetch = mockFetch || defaultFetch;
}