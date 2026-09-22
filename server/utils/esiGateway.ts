import { createHash } from 'crypto';
import {
  fetchEsi,
  EsiFetchOptions,
  EsiFetchResult,
} from './esiClient';
import type {
  EsiGatewayResponse,
  EsiRequest,
  EsiError,
  EsiErrorKind,
} from './esiTypes';

export type EsiTransport = <T = unknown>(
  endpoint: string,
  options?: EsiFetchOptions
) => Promise<EsiFetchResult<T>>;

export type EsiPrincipalContext =
  | { readonly type: 'anonymous' }
  | {
      readonly type: 'character';
      readonly id: number;
      readonly bearerCredential: string;
    };

function emptyMetadata() {
  return {
    cache: {},
    rateLimit: {},
    pagination: {},
  } as const;
}

function canonicalQuery(query: EsiRequest['query']): string {
  if (!query) return '';

  return Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value)))
    .join('&');
}

function appendQuery(path: string, query: EsiRequest['query']): string {
  const encodedQuery = canonicalQuery(query);
  if (!encodedQuery) return path;
  return path + (path.includes('?') ? '&' : '?') + encodedQuery;
}

function principalFingerprint(context: EsiPrincipalContext): string {
  if (context.type === 'anonymous') return 'anonymous';
  return context.type + ':' + context.id + ':' +
    createHash('sha256').update(context.bearerCredential).digest('hex');
}

function mapError(result: EsiFetchResult): EsiError {
  const status = result.status;

  if (result.errorLimitRemain !== undefined && result.errorLimitRemain <= 0) {
    return {
      kind: 'ERROR_LIMIT_EXHAUSTED',
      status,
      message: 'ESI error limit exhausted',
      retryable: false,
      retryAfterSeconds: result.errorLimitReset,
    };
  }

  let kind: EsiErrorKind = 'UNKNOWN';
  if (status === 401) kind = 'AUTHENTICATION';
  else if (status === 403) kind = 'AUTHORIZATION';
  else if (status === 404) kind = 'NOT_FOUND';
  else if (status === 420 || status === 429) kind = 'RATE_LIMITED';
  else if (status === 504 && result.error?.toLowerCase().includes('timed out')) kind = 'TIMEOUT';
  else if (status >= 500) kind = 'TRANSIENT';
  else if (result.error === 'Network request failed') kind = 'NETWORK';

  return {
    kind,
    status,
    message: (result.error || ('ESI request failed with status ' + status)).slice(0, 1000),
    retryable: kind === 'RATE_LIMITED' || kind === 'TRANSIENT' || kind === 'NETWORK',
    retryAfterSeconds: result.retryAfter,
  };
}

export class EsiGateway {
  private readonly transport: EsiTransport;
  private readonly inFlight = new Map<string, Promise<EsiGatewayResponse<unknown>>>();

  constructor(transport: EsiTransport = fetchEsi) {
    this.transport = transport;
  }

  async request<T = unknown>(
    request: EsiRequest,
    context: EsiPrincipalContext = { type: 'anonymous' }
  ): Promise<EsiGatewayResponse<T>> {
    if (!request.path || !request.path.startsWith('/')) {
      return {
        ok: false,
        status: 400,
        data: null,
        error: {
          kind: 'UNKNOWN',
          status: 400,
          message: 'ESI gateway requires a relative path beginning with "/"',
          retryable: false,
        },
        metadata: emptyMetadata(),
      };
    }

    if (context.type === 'character' &&
      (!Number.isInteger(context.id) || context.id <= 0 || !context.bearerCredential)) {
      return {
        ok: false,
        status: 400,
        data: null,
        error: {
          kind: 'UNKNOWN',
          status: 400,
          message: 'Authenticated ESI context is incomplete',
          retryable: false,
        },
        metadata: emptyMetadata(),
      };
    }

    const method = request.method || 'GET';
    const endpoint = appendQuery(request.path, request.query);
    const headers: Record<string, string> = { ...(request.headers || {}) };

    delete headers.authorization;
    delete headers.Authorization;

    if (context.type === 'character') {
      headers.Authorization = 'Bearer ' + context.bearerCredential;
    }

    if (
      request.body !== undefined &&
      !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const transportOptions: EsiFetchOptions = {
      method,
      headers,
      body:
        request.body === undefined
          ? undefined
          : typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body),
      timeoutMs: request.timeoutMs,
      retries: request.retries,
      etag: request.etag,
    };

    const dedupeKey =
      method === 'GET'
        ? principalFingerprint(context) + '|' + method + '|' + endpoint
        : undefined;

    if (dedupeKey) {
      const existing = this.inFlight.get(dedupeKey);
      if (existing) return (await existing) as EsiGatewayResponse<T>;
    }

    const promise = this.execute<T>(endpoint, transportOptions);

    if (!dedupeKey) return promise;

    this.inFlight.set(dedupeKey, promise as Promise<EsiGatewayResponse<unknown>>);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(dedupeKey);
    }
  }

  private async execute<T>(
    endpoint: string,
    options: EsiFetchOptions
  ): Promise<EsiGatewayResponse<T>> {
    const result = await this.transport<T>(endpoint, options);

    if (result.ok) {
      return {
        ok: true,
        status: result.status,
        data: result.data,
        metadata: result.metadata,
      };
    }

    return {
      ok: false,
      status: result.status,
      data: null,
      error: mapError(result),
      metadata: result.metadata,
    };
  }

  clearInFlight(): void {
    this.inFlight.clear();
  }
}

export function createEsiGateway(transport: EsiTransport = fetchEsi): EsiGateway {
  return new EsiGateway(transport);
}
