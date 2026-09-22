import type { EveTypeDetail } from './universe';

export type MarketDataSource = 'esi' | 'cache' | 'mock' | 'unavailable' | 'esi_paginated' | 'indexeddb' | 'memory';
export type MarketDataFreshness = 'fresh' | 'recent' | 'stale' | 'expired' | 'unknown';
export type MarketDataCompleteness = 'complete' | 'partial' | 'empty' | 'corrupted' | 'unknown';
export type MarketDataValidationStatus = 'valid' | 'suspicious' | 'invalid' | 'unvalidated';

/**
 * Phase 2B Failure Semantics — Canonical Data Health States.
 * Imposes strict failure categories: LIVE | CACHE | STALE | PARTIAL | UNKNOWN | ERROR.
 * Completely replaces silent catch {} and empty fallbacks.
 */
export type DataHealthStatus = 'LIVE' | 'CACHE' | 'STALE' | 'PARTIAL' | 'UNKNOWN' | 'ERROR';

export type DataState = 'VALID' | 'PARTIAL' | 'STALE' | 'EMPTY' | 'ERROR' | 'UNKNOWN' | 'LIVE' | 'CACHE';

export interface DataProvenance {
  source: MarketDataSource;
  freshness: MarketDataFreshness;
  data_state: DataState;
  health_status?: DataHealthStatus;
  completeness: MarketDataCompleteness;
  validation_status: MarketDataValidationStatus;
  fetched_at: string;
  age_seconds: number;
  catalog_version?: string;
  catalog_checksum?: string;
  pages_fetched?: number;
  expected_pages?: number;
  orders_fetched?: number;
  orders_valid?: number;
  duplicate_orders_removed?: number;
  rejected_orders_count?: number;
  error_count?: number;
  last_error?: string;
  confidence: number; // 0.0 to 1.0
  sync_duration_ms?: number;
}

export interface MarketDataQuality {
  source: MarketDataSource;
  freshness: MarketDataFreshness;
  completeness: MarketDataCompleteness;
  validation_status: MarketDataValidationStatus;
  data_state?: DataState;
  health_status?: DataHealthStatus;
  fetched_at: string;
  age_seconds: number;
  pages_fetched: number;
  expected_pages: number;
  orders_fetched: number;
  orders_valid: number;
  duplicate_orders_removed: number;
  rejected_orders_count: number;
  error_count: number;
  last_error?: string;
  confidence: number; // 0.0 to 1.0
  sync_duration_ms: number;
}

export interface RawMarketOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  system_id: number;
  location_id: number;
  price: number;
  volume_remain: number;
  volume_total: number;
  min_volume?: number;
  is_buy_order: boolean;
  order_range?: string;
  issued: string;
  duration: number;
  captured_at?: string;
}

export interface DailyMarketHistory {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  order_count: number;
  volume: number;
}

export interface HistoricalStats {
  type_id?: number;
  region_id?: number;
  daily_volume_7d_avg?: number;
  daily_volume_7d_median: number;
  daily_volume_30d_avg?: number;
  daily_volume_30d_median?: number;
  daily_order_count_avg?: number;
  price_median_30d?: number;
  price_7d_avg?: number;
  price_30d_avg?: number;
  price_volatility: number;
  volume_trend?: 'increasing' | 'stable' | 'decreasing';
  is_live_esi?: boolean;
}

export interface MarketDataSnapshot {
  type_id: number;
  region_id: number;
  orders: RawMarketOrder[];
  timestamp: number;
  quality: MarketDataQuality;
  history?: HistoricalStats;
}

export interface PriceLevel {
  price: number;
  volume: number;
  orders: number;
  cumulative: number;
  order_ids?: number[];
  location_ids?: number[];
  min_volume_max?: number;
}

export interface MarketLocationFeeProfile {
  location_id: number;
  location_name: string;
  is_citadel: boolean;
  is_player_structure?: boolean;
  location_type?: 'npc_station' | 'citadel';
  base_broker_fee_rate?: number;
  scc_surcharge_rate?: number;
  relist_fee_rate?: number;
  effective_broker_fee_rate: number;
  tax_rate?: number;
}

export interface TradeLiquidityMetrics {
  buy_hub_depth_volume: number;
  sell_hub_depth_volume: number;
  daily_volume_source: number;
  daily_volume_dest: number;
  turnover_ratio: number;
  expected_days_to_sell: number;
  volume_exhaustion_pct: number;
}

export interface TableCounts {
  raw_orders?: number;
  market_orders?: number;
  order_book_depth?: number;
  opportunities?: number;
  types?: number;
  solar_systems?: number;
  regions?: number;
  stations?: number;
  esi_cache?: number;
}

export interface AppSettings {
  default_hub?: string;
  broker_fee: number;
  sales_tax: number;
  available_capital: number;
  transport_cost_per_m3?: number;
  transport_cost_per_jump?: number;
  max_cargo_m3?: number;
  min_roi?: number;
  min_net_profit?: number;
  max_days_to_sell?: number;
  max_capital_per_trade?: number;
  max_portfolio_concentration_type?: number;
  max_portfolio_concentration_group?: number;
}

export interface Fill {
  filled_quantity: number;
  effective_price: number;
  levels_used: number;
}

export type TypeCatalogStatus =
  | 'CATALOG_UNAVAILABLE'
  | 'CATALOG_LOADING'
  | 'CATALOG_DEGRADED'
  | 'CATALOG_PARTIAL'
  | 'CATALOG_READY'
  | 'CATALOG_CORRUPTED'
  | 'CATALOG_EMPTY'
  | 'CATALOG_LOADED'
  | 'CATALOG_FALLBACK_CORE';

export interface TypeCatalogMetadata {
  version: string;
  checksum: string;
  item_count: number;
  status: TypeCatalogStatus;
  loaded_at: string;
  source: 'filesystem' | 'canonical_asset' | 'fallback_core' | 'esi_synced' | 'indexeddb' | 'server' | 'uninitialized';
  error?: string;
  file_path?: string;
  minimum_expected_count?: number;
  expected_count?: number;
  is_degraded?: boolean;
}

export interface TypeCatalogResponse {
  metadata: TypeCatalogMetadata;
  types: EveTypeDetail[];
}
