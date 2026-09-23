import {
  DataHealthStatus,
  DataState,
  MarketDataQuality,
} from '../types';

/**
 * Phase 2B — Failure Semantics Module (Pure Engine).
 * Imposes deterministic failure states: LIVE | CACHE | STALE | PARTIAL | UNKNOWN | ERROR.
 * Completely replaces silent fallbacks, return [] and return 0.
 */
export class FailureSemantics {
  /**
   * Evaluates the canonical health state from quality attributes.
   *
   * LIVE: Directly fetched from live upstream ESI, age < 120s, complete or uncorrupted.
   * CACHE: Retrieved from local memory or IndexedDB, fresh / recent (< 600s).
   * STALE: Age > 600s or explicitly flagged as stale/expired.
   * PARTIAL: Paginated data truncated or incomplete pages fetched.
   * UNKNOWN: Data was never requested, uninitialized or absent.
   * ERROR: Upstream network failure, HTTP 4xx/5xx, invalid payload, or error_count > 0.
   */
  static evaluateHealth(quality?: Partial<MarketDataQuality> | null): DataHealthStatus {
    if (!quality) return 'UNKNOWN';

    // 1. Explicit fatal errors
    if (
      quality.health_status === 'ERROR' ||
      quality.data_state === 'ERROR' ||
      quality.source === 'unavailable' ||
      quality.validation_status === 'invalid'
    ) {
      return 'ERROR';
    }

    // 2. Corrupted data is an error
    if (quality.completeness === 'corrupted') {
      return 'ERROR';
    }

    // 3. Partial data remains distinct from a fatal transport error.
    // A usable page set plus a failed later page is PARTIAL, even when error_count > 0.
    if (
      quality.health_status === 'PARTIAL' ||
      quality.data_state === 'PARTIAL' ||
      quality.completeness === 'partial' ||
      (quality.expected_pages !== undefined &&
        quality.pages_fetched !== undefined &&
        quality.expected_pages > 1 &&
        quality.pages_fetched < quality.expected_pages)
    ) {
      return 'PARTIAL';
    }

    // A non-partial observation carrying an error count is fatal.
    if (quality.error_count !== undefined && quality.error_count > 0) {
      return 'ERROR';
    }

    // 4. Stale data (TTL expired)
    const age = quality.age_seconds ?? 0;
    if (
      quality.health_status === 'STALE' ||
      quality.data_state === 'STALE' ||
      quality.freshness === 'stale' ||
      quality.freshness === 'expired' ||
      age > 600
    ) {
      return 'STALE';
    }

    // 5. Unknown data
    if (
      quality.health_status === 'UNKNOWN' ||
      quality.data_state === 'UNKNOWN' ||
      quality.freshness === 'unknown' ||
      quality.completeness === 'unknown'
    ) {
      return 'UNKNOWN';
    }

    // 6. Cache data
    if (
      quality.health_status === 'CACHE' ||
      quality.source === 'cache' ||
      quality.source === 'indexeddb' ||
      quality.source === 'memory'
    ) {
      return 'CACHE';
    }

    // 7. Live ESI data
    if (quality.source === 'esi' || quality.source === 'esi_paginated') {
      return 'LIVE';
    }

    return 'CACHE';
  }

  /**
   * Deterministic mapping to legacy DataState for backward-compatibility.
   */
  static healthToDataState(health: DataHealthStatus, orderCount: number = 0): DataState {
    switch (health) {
      case 'LIVE':
      case 'CACHE':
        return orderCount === 0 ? 'EMPTY' : 'VALID';
      case 'STALE':
        return 'STALE';
      case 'PARTIAL':
        return 'PARTIAL';
      case 'ERROR':
        return 'ERROR';
      case 'UNKNOWN':
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Evaluates if a given health state is legally actionable for trade execution.
   */
  static isActionable(health: DataHealthStatus): boolean {
    return health === 'LIVE' || health === 'CACHE';
  }

  /**
   * Generates a standardized error quality descriptor with complete provenance.
   */
  static createErrorQuality(error: string, syncDurationMs: number = 0): MarketDataQuality {
    return {
      source: 'unavailable',
      freshness: 'expired',
      completeness: 'empty',
      validation_status: 'invalid',
      data_state: 'ERROR',
      health_status: 'ERROR',
      fetched_at: new Date().toISOString(),
      age_seconds: 0,
      pages_fetched: 0,
      expected_pages: 0,
      orders_fetched: 0,
      orders_valid: 0,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 1,
      last_error: error,
      confidence: 0.0,
      sync_duration_ms: syncDurationMs,
    };
  }

  /**
   * Generates a standardized unknown quality descriptor.
   */
  static createUnknownQuality(reason: string = 'No market sync performed'): MarketDataQuality {
    return {
      source: 'unavailable',
      freshness: 'unknown',
      completeness: 'unknown',
      validation_status: 'unvalidated',
      data_state: 'UNKNOWN',
      health_status: 'UNKNOWN',
      fetched_at: new Date(0).toISOString(),
      age_seconds: 999999,
      pages_fetched: 0,
      expected_pages: 0,
      orders_fetched: 0,
      orders_valid: 0,
      duplicate_orders_removed: 0,
      rejected_orders_count: 0,
      error_count: 0,
      last_error: reason,
      confidence: 0.0,
      sync_duration_ms: 0,
    };
  }
}
