import type { DataHealthStatus, MarketDataQuality, MarketHub } from '../types';

export interface MarketEvidenceHub {
  hub_name: string;
  region_id: number;
  health_status: DataHealthStatus;
  source: MarketDataQuality['source'];
  freshness: MarketDataQuality['freshness'];
  data_state?: MarketDataQuality['data_state'];
  completeness: MarketDataQuality['completeness'];
  validation_status: MarketDataQuality['validation_status'];
  fetched_at: string;
  age_seconds: number;
  pages_fetched: number;
  expected_pages: number;
  orders_fetched: number;
  orders_valid: number;
  error_count: number;
  last_error?: string;
  http_status?: number;
  cache_status?: MarketDataQuality['cache_status'];
  esi_error_limit_remaining?: number;
  esi_error_limit_reset_seconds?: number;
  retry_after_seconds?: number;
}

export interface MarketEvidenceBundle {
  schema_version: 'p0-c-1';
  captured_at_utc: string;
  type: {
    id?: number;
    name: string;
  };
  application: {
    url_path: string;
    user_agent: string;
    language: string;
    timezone: string;
  };
  request_template: {
    method: 'GET';
    path_pattern: string;
  };
  hubs: MarketEvidenceHub[];
  comparison: {
    same_request_from_controlled_environment: 'not_recorded';
  };
}

function resolveHealth(quality?: MarketDataQuality): DataHealthStatus {
  if (!quality) return 'UNKNOWN';
  if (quality.health_status) return quality.health_status;
  if (quality.error_count > 0 && quality.orders_valid === 0) return 'ERROR';
  if (quality.completeness === 'partial') return 'PARTIAL';
  if (quality.source === 'cache' || quality.source === 'indexeddb') return 'CACHE';
  if (quality.freshness === 'stale' || quality.freshness === 'expired') return 'STALE';
  if (quality.source === 'esi' && quality.validation_status === 'valid') return 'LIVE';
  return 'UNKNOWN';
}

export function buildMarketEvidenceBundle(
  typeName: string,
  typeId: number | undefined,
  hubs: MarketHub[],
  qualities: Record<number, MarketDataQuality>,
  runtime: Pick<Window, 'location' | 'navigator'> = window,
  capturedAt = new Date(),
): MarketEvidenceBundle {
  const activeHubs = hubs.filter((hub) => hub.active);
  const capturedAtUtc = new Date(capturedAt).toISOString();

  return {
    schema_version: 'p0-c-1',
    captured_at_utc: capturedAtUtc,
    type: {
      ...(typeId !== undefined ? { id: typeId } : {}),
      name: typeName,
    },
    application: {
      url_path: runtime.location.pathname + runtime.location.search,
      user_agent: runtime.navigator.userAgent,
      language: runtime.navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    request_template: {
      method: 'GET',
      path_pattern: '/api/markets/:regionId/orders?type_id=:typeId&page=:page',
    },
    hubs: activeHubs.map((hub) => {
      const quality = qualities[hub.region_id];
      return {
        hub_name: hub.name,
        region_id: hub.region_id,
        health_status: resolveHealth(quality),
        source: quality?.source ?? 'unavailable',
        freshness: quality?.freshness ?? 'unknown',
        ...(quality?.data_state ? { data_state: quality.data_state } : {}),
        completeness: quality?.completeness ?? 'unknown',
        validation_status: quality?.validation_status ?? 'unvalidated',
        fetched_at: quality?.fetched_at ?? capturedAtUtc,
        age_seconds: quality?.age_seconds ?? 0,
        pages_fetched: quality?.pages_fetched ?? 0,
        expected_pages: quality?.expected_pages ?? 0,
        orders_fetched: quality?.orders_fetched ?? 0,
        orders_valid: quality?.orders_valid ?? 0,
        error_count: quality?.error_count ?? 0,
        ...(quality?.last_error ? { last_error: quality.last_error } : {}),
        ...(quality?.last_http_status !== undefined ? { http_status: quality.last_http_status } : {}),
        ...(quality?.cache_status ? { cache_status: quality.cache_status } : {}),
        ...(quality?.esi_error_limit_remaining !== undefined
          ? { esi_error_limit_remaining: quality.esi_error_limit_remaining }
          : {}),
        ...(quality?.esi_error_limit_reset_seconds !== undefined
          ? { esi_error_limit_reset_seconds: quality.esi_error_limit_reset_seconds }
          : {}),
        ...(quality?.retry_after_seconds !== undefined
          ? { retry_after_seconds: quality.retry_after_seconds }
          : {}),
      };
    }),
    comparison: {
      same_request_from_controlled_environment: 'not_recorded',
    },
  };
}

export function serializeMarketEvidenceBundle(bundle: MarketEvidenceBundle): string {
  return JSON.stringify(bundle, null, 2) + '\n';
}
