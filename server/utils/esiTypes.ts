/**
 * Shared ESI gateway contracts.
 *
 * These contracts deliberately describe transport/protocol concerns only.
 * Domain semantics (character, corporation, market, universe) belong to
 * domain-specific gateway adapters.
 */

export type EsiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EsiRequest {
  readonly method?: EsiHttpMethod;
  /** ESI-relative path, e.g. /characters/123/wallet/ */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly etag?: string;
  readonly dedupe?: boolean;
}

export type EsiPrincipalContext =
  | { readonly type: 'anonymous' }
  | {
      readonly type: 'character';
      readonly id: number;
      /**
       * Access credential is intentionally confined to the server-side gateway.
       * It must never be logged, serialized into cache keys, or returned to callers.
       */
      readonly bearerCredential: string;
    };

export interface EsiRetryPolicy {
  readonly maxRetries: number;
  readonly retryableStatuses: readonly number[];
  readonly respectRetryAfter: boolean;
  readonly retryDelayBaseMs: number;
  readonly retryJitterMs: number;
}

export interface EsiPaginationMetadata {
  readonly xPages?: number;
  readonly page?: number;
  readonly fromId?: number;
  readonly nextCursor?: string;
  readonly previousCursor?: string;
}

export interface EsiCacheMetadata {
  readonly etag?: string;
  readonly expires?: string;
  readonly lastModified?: string;
  readonly cacheControl?: string;
  readonly compatibilityDate?: string;
}

export interface EsiRateLimitMetadata {
  readonly retryAfterSeconds?: number;
  readonly errorLimitRemain?: number;
  readonly errorLimitResetSeconds?: number;
  readonly rateLimitGroup?: string;
  readonly rateLimitLimit?: string;
  readonly rateLimitRemaining?: number;
  readonly rateLimitUsed?: number;
}

export interface EsiResponseMetadata {
  readonly cache: EsiCacheMetadata;
  readonly rateLimit: EsiRateLimitMetadata;
  readonly pagination: EsiPaginationMetadata;
}

export type EsiErrorKind =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'ERROR_LIMIT_EXHAUSTED'
  | 'TRANSIENT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export interface EsiError {
  readonly kind: EsiErrorKind;
  readonly status?: number;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

export interface EsiGatewayResponse<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly data: T | null;
  readonly error?: EsiError;
  readonly metadata: EsiResponseMetadata;
}

/**
 * Single compatibility-date contract for the complete ESI application.
 * Update intentionally when the ESI contract is reviewed.
 *
 * CCP documents the date as the application-wide compatibility version.
 */
export const ESI_COMPATIBILITY_DATE =
  process.env.ESI_COMPATIBILITY_DATE?.trim() || '2026-09-22';
