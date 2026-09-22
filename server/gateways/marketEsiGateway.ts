import { createEsiGateway, EsiGateway } from '../utils/esiGateway';
import type {
  EsiGatewayResponse,
  EsiResponseMetadata,
} from '../utils/esiTypes';

export type MarketCacheStatus = 'HIT' | 'MISS' | 'REVALIDATED';

export type MarketEsiResponse<T> = EsiGatewayResponse<T> & {
  readonly cacheStatus: MarketCacheStatus;
};

interface MarketCacheEntry<T> {
  readonly data: T;
  readonly metadata: EsiResponseMetadata;
  readonly expiresAt: number;
  readonly etag?: string;
}

interface MarketCacheOptions {
  readonly maxEntries?: number;
  readonly orderTtlFloorMs?: number;
  readonly historyTtlFloorMs?: number;
}

const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_ORDER_TTL_FLOOR_MS = 60_000;
const DEFAULT_HISTORY_TTL_FLOOR_MS = 300_000;
const DEFAULT_ORDER_TTL_MS = 180_000;
const DEFAULT_HISTORY_TTL_MS = 1_800_000;

function emptyMetadata(): EsiResponseMetadata {
  return {
    cache: {},
    rateLimit: {},
    pagination: {},
  };
}

function expirationFromMetadata(
  metadata: EsiResponseMetadata,
  now: number,
  fallbackTtlMs: number,
  floorMs: number,
): number {
  const expiresAt = metadata.cache.expires
    ? new Date(metadata.cache.expires).getTime()
    : now + fallbackTtlMs;

  return Math.max(now + floorMs, Number.isFinite(expiresAt) ? expiresAt : now + fallbackTtlMs);
}

function mergeRevalidatedMetadata(
  cached: MarketCacheEntry<unknown>,
  responseMetadata: EsiResponseMetadata,
): EsiResponseMetadata {
  return {
    cache: {
      ...cached.metadata.cache,
      ...responseMetadata.cache,
      etag: responseMetadata.cache.etag || cached.etag || cached.metadata.cache.etag,
    },
    rateLimit: {
      ...cached.metadata.rateLimit,
      ...responseMetadata.rateLimit,
    },
    pagination: {
      ...cached.metadata.pagination,
      ...responseMetadata.pagination,
    },
  };
}

export function mergeMarketEsi304CacheEntry<T>(
  cached: MarketCacheEntry<T>,
  response: EsiGatewayResponse<T>,
  now: number,
  floorMs: number,
): MarketCacheEntry<T> {
  const metadata = mergeRevalidatedMetadata(cached, response.metadata);
  const refreshedExpiry = expirationFromMetadata(
    metadata,
    now,
    floorMs,
    floorMs,
  );

  return {
    ...cached,
    metadata,
    expiresAt: refreshedExpiry,
    etag: metadata.cache.etag || cached.etag,
  };
}

export class MarketEsiGateway {
  private readonly gateway: Pick<EsiGateway, 'request'>;
  private readonly cache = new Map<string, MarketCacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly orderTtlFloorMs: number;
  private readonly historyTtlFloorMs: number;

  constructor(
    gateway: Pick<EsiGateway, 'request'> = createEsiGateway(),
    options: MarketCacheOptions = {},
  ) {
    this.gateway = gateway;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.orderTtlFloorMs = options.orderTtlFloorMs ?? DEFAULT_ORDER_TTL_FLOOR_MS;
    this.historyTtlFloorMs = options.historyTtlFloorMs ?? DEFAULT_HISTORY_TTL_FLOOR_MS;
  }

  async fetchOrders(params: {
    regionId: number;
    typeId?: number;
    page?: number;
    orderType?: 'all' | 'buy' | 'sell';
  }): Promise<MarketEsiResponse<any[]>> {
    const page = params.page ?? 1;
    const orderType = params.orderType ?? 'all';
    const query: Record<string, string | number> = {
      datasource: 'tranquility',
      order_type: orderType,
      page,
    };

    if (params.typeId !== undefined) query.type_id = params.typeId;

    const cacheKey = this.buildCacheKey('/markets/' + params.regionId + '/orders/', query);
    const now = Date.now();
    const cached = this.getFresh(cacheKey, now);

    if (cached) {
      return {
        ok: true,
        status: 200,
        data: cached.data as any[],
        metadata: cached.metadata,
        cacheStatus: 'HIT',
      };
    }

    const response = await this.gateway.request<any[]>({
      method: 'GET',
      path: '/markets/' + params.regionId + '/orders/',
      query,
      etag: this.getStale(cacheKey)?.etag,
    });

    if (!response.ok) {
      return {
        ...response,
        cacheStatus: 'MISS',
      };
    }

    if (response.status === 304) {
      const stale = this.getStale(cacheKey);
      if (stale) {
        const refreshed = mergeMarketEsi304CacheEntry(
          stale as MarketCacheEntry<any[]>,
          response as EsiGatewayResponse<any[]>,
          now,
          this.orderTtlFloorMs,
        );
        this.set(cacheKey, refreshed);
        return {
          ok: true,
          status: 304,
          data: refreshed.data,
          metadata: refreshed.metadata,
          cacheStatus: 'REVALIDATED',
        };
      }
    }

    if (response.data === null) {
      return {
        ...response,
        cacheStatus: 'MISS',
      };
    }

    const entry: MarketCacheEntry<any[]> = {
      data: response.data,
      metadata: response.metadata,
      expiresAt: expirationFromMetadata(
        response.metadata,
        now,
        DEFAULT_ORDER_TTL_MS,
        this.orderTtlFloorMs,
      ),
      etag: response.metadata.cache.etag,
    };
    this.set(cacheKey, entry);

    return {
      ...response,
      data: entry.data,
      cacheStatus: 'MISS',
    };
  }

  async fetchHistory(
    regionId: number,
    typeId: number,
  ): Promise<MarketEsiResponse<any[]>> {
    const query = {
      datasource: 'tranquility',
      type_id: typeId,
    };
    const cacheKey = this.buildCacheKey('/markets/' + regionId + '/history/', query);
    const now = Date.now();
    const cached = this.getFresh(cacheKey, now);

    if (cached) {
      return {
        ok: true,
        status: 200,
        data: cached.data as any[],
        metadata: cached.metadata,
        cacheStatus: 'HIT',
      };
    }

    const response = await this.gateway.request<any[]>({
      method: 'GET',
      path: '/markets/' + regionId + '/history/',
      query,
      etag: this.getStale(cacheKey)?.etag,
    });

    if (!response.ok) {
      return {
        ...response,
        cacheStatus: 'MISS',
      };
    }

    if (response.status === 304) {
      const stale = this.getStale(cacheKey);
      if (stale) {
        const refreshed = mergeMarketEsi304CacheEntry(
          stale as MarketCacheEntry<any[]>,
          response as EsiGatewayResponse<any[]>,
          now,
          this.historyTtlFloorMs,
        );
        this.set(cacheKey, refreshed);
        return {
          ok: true,
          status: 304,
          data: refreshed.data,
          metadata: refreshed.metadata,
          cacheStatus: 'REVALIDATED',
        };
      }
    }

    if (response.data === null) {
      return {
        ...response,
        cacheStatus: 'MISS',
      };
    }

    const entry: MarketCacheEntry<any[]> = {
      data: response.data,
      metadata: response.metadata,
      expiresAt: expirationFromMetadata(
        response.metadata,
        now,
        DEFAULT_HISTORY_TTL_MS,
        this.historyTtlFloorMs,
      ),
      etag: response.metadata.cache.etag,
    };
    this.set(cacheKey, entry);

    return {
      ...response,
      data: entry.data,
      cacheStatus: 'MISS',
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  private buildCacheKey(
    path: string,
    query: Record<string, string | number | boolean>,
  ): string {
    return path + '?' + Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => key + '=' + encodeURIComponent(String(value)))
      .join('&');
  }

  private getFresh(key: string, now: number): MarketCacheEntry<unknown> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (now >= entry.expiresAt) return undefined;
    return entry;
  }

  private getStale(key: string): MarketCacheEntry<unknown> | undefined {
    return this.cache.get(key);
  }

  private set(key: string, entry: MarketCacheEntry<unknown>): void {
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, entry);
  }
}

export const marketEsiGateway = new MarketEsiGateway();
