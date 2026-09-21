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

export type TypeResolutionStatus = 'RESOLVED_CATALOG' | 'RESOLVED_DYNAMIC' | 'RESOLVED_ESI' | 'TYPE_UNKNOWN';

export interface TypeResolutionResult {
  status: TypeResolutionStatus;
  type?: EveTypeDetail;
  type_id: number;
  name: string;
  volume: number;
  group_id: number;
  category_id: number;
  source: 'catalog_ready' | 'fallback_core' | 'custom_type' | 'esi_lookup' | 'none';
  catalog_version: string;
  catalog_checksum: string;
  is_verified: boolean;
  confidence: number;
  error?: string;
}

export type LocationResolutionStatus =
  | 'RESOLVED_HUB'
  | 'RESOLVED_STATION'
  | 'RESOLVED_STRUCTURE'
  | 'RESOLVED_ESI'
  | 'LOCATION_FALLBACK'
  | 'LOCATION_UNKNOWN';

export interface LocationResolutionResult {
  status: LocationResolutionStatus;
  location_id: number;
  name: string;
  system_id?: number;
  system_name?: string;
  region_id?: number;
  region_name?: string;
  security_status?: number;
  is_structure: boolean;
  is_hub: boolean;
  hub_id?: string;
  source: 'hub' | 'static_npc' | 'structure_cache' | 'esi_resolved' | 'fallback';
  is_verified: boolean;
  confidence: number;
  error?: string;
}

export type SystemResolutionStatus = 'RESOLVED_SYSTEM' | 'SYSTEM_UNKNOWN';

export interface SystemResolutionResult {
  status: SystemResolutionStatus;
  system_id: number;
  name: string;
  region_id?: number;
  region_name?: string;
  security_status?: number;
  is_verified: boolean;
  confidence: number;
  source: 'static_universe' | 'hub' | 'inferred' | 'fallback';
  error?: string;
}

export type RegionResolutionStatus = 'RESOLVED_REGION' | 'REGION_UNKNOWN';

export interface RegionResolutionResult {
  status: RegionResolutionStatus;
  region_id: number;
  name: string;
  is_verified: boolean;
  confidence: number;
  source: 'static_universe' | 'hub' | 'fallback';
  error?: string;
}

export interface OpportunityCertification {
  status: 'CERTIFIED' | 'DEGRADED' | 'REJECTED';
  is_actionable: boolean;
  certification_version: string;
  evidence_hash?: string;
  evidence?: OpportunityEvidence;
  data_state_source: DataState;
  data_state_dest: DataState;
  health_state_source?: DataHealthStatus;
  health_state_dest?: DataHealthStatus;
  catalog_status?: TypeResolutionStatus;
  universe_status_source?: LocationResolutionStatus;
  universe_status_dest?: LocationResolutionStatus;
  financial_status?: 'VIABLE' | 'DEGRADED' | 'UNVIABLE';
  confidence: number;
  warnings: string[];
  blocking_reasons: string[];
  certified_at: string;
  pillar_evaluations?: {
    market_data: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      health_source: DataHealthStatus;
      health_dest: DataHealthStatus;
      detail: string;
    };
    catalog: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      type_id: number;
      status_code: TypeResolutionStatus;
      detail: string;
    };
    universe: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      source_station_id: number;
      dest_station_id: number;
      detail: string;
    };
    financial_engine: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      net_profit: number;
      roi: number;
      detail: string;
    };
  };
}

export interface MarketSnapshotReference {
  type_id: number;
  region_id: number;
  timestamp: number;
  orders_count: number;
  health_status: DataHealthStatus;
  data_state: DataState;
  market_hash?: string;
  source: MarketDataSource;
  freshness: MarketDataFreshness;
  completeness: MarketDataCompleteness;
  confidence: number;
  age_seconds: number;
  observation_id?: string;
}

export interface FinancialInputsEvidence {
  available_capital: number;
  max_cargo_m3: number;
  broker_fee: number;
  sales_tax: number;
  enable_transport_costs: boolean;
  transport_cost_per_m3: number;
  transport_cost_per_jump: number;
  min_roi: number;
  min_net_profit: number;
  unit_volume: number;
  strategy: TradeStrategy;
  accounting_level?: number;
  broker_relations_level?: number;
  advanced_broker_relations_level?: number;
}

export interface FinancialOutputsEvidence {
  quantity: number;
  effective_buy_price: number;
  effective_sell_price: number;
  gross_purchase_cost: number;
  buy_broker_fee_cost: number;
  transport_cost: number;
  total_acquisition_cost: number;
  gross_revenue: number;
  sales_tax_cost: number;
  sell_broker_fee_cost: number;
  total_exit_fees: number;
  net_revenue: number;
  net_profit: number;
  profit_per_unit: number;
  roi: number;
  margin: number;
  capital_locked: number;
  bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market';
  is_viable: boolean;
}

export interface OpportunityEvidence {
  opportunity_id: string;
  detected_at: string;
  certification_version: string;
  certification_status: 'CERTIFIED' | 'DEGRADED' | 'REJECTED';
  is_actionable: boolean;
  type_id: number;
  source_market: MarketSnapshotReference;
  dest_market: MarketSnapshotReference;
  source_market_provenance?: DataProvenance;
  dest_market_provenance?: DataProvenance;
  source_market_hash?: string;
  dest_market_hash?: string;
  source_observation_id?: string;
  dest_observation_id?: string;
  catalog_version: string;
  catalog_checksum: string;
  type_resolution: TypeResolutionResult;
  source_location_resolution: LocationResolutionResult;
  dest_location_resolution: LocationResolutionResult;
  route_resolution: JumpRoute;
  financial_inputs: FinancialInputsEvidence;
  financial_outputs: FinancialOutputsEvidence;
  strategy: TradeStrategy;
  confidence: number;
  warnings: string[];
  blocking_reasons: string[];
  pillar_evaluations: {
    market_data: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      health_source: DataHealthStatus;
      health_dest: DataHealthStatus;
      detail: string;
    };
    catalog: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      type_id: number;
      status_code: TypeResolutionStatus;
      detail: string;
    };
    universe: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      source_station_id: number;
      dest_station_id: number;
      detail: string;
    };
    financial_engine: {
      status: 'PASS' | 'DEGRADED' | 'FAIL';
      net_profit: number;
      roi: number;
      detail: string;
    };
  };
  evidence_hash: string;
}

export interface OpportunityProvenance {
  source_market_provenance?: DataProvenance;
  dest_market_provenance?: DataProvenance;
  jita_benchmark_provenance?: DataProvenance;
  type_resolution: TypeResolutionResult;
  source_location_resolution?: LocationResolutionResult;
  dest_location_resolution?: LocationResolutionResult;
  route_resolution?: JumpRoute;
  catalog_version: string;
  catalog_checksum: string;
  calculation_timestamp: string;
}

export interface MarketDataSnapshot {
  type_id: number;
  region_id: number;
  orders: RawMarketOrder[];
  timestamp: number;
  quality: MarketDataQuality;
  history?: HistoricalStats;
}

export interface MarketCategory {
  category_id: number;
  name: string;
  icon?: string;
}

export interface MarketGroup {
  group_id: number;
  category_id: number;
  name: string;
}

export interface EveTypeDetail {
  type_id: number;
  group_id: number;
  group_name?: string;
  category_id: number;
  category_name?: string;
  market_group_id?: number;
  name: string;
  volume: number; // in m³
  packaged_volume?: number;
  base_price?: number;
  portion_size?: number;
  description?: string;
  average_price?: number;
  adjusted_price?: number;
}

export interface MarketHub {
  id: string;
  name: string;
  region: string;
  region_id: number;
  solar_system: string;
  system_id: number;
  station: string;
  station_id: number;
  security_status: number;
  priority: number;
  active: boolean;
  hub_type: 'npc_major' | 'npc_minor' | 'citadel';
}

export interface JumpRoute {
  from_system_id: number;
  to_system_id: number;
  jumps: number;
  min_security: number;
  is_highsec_only: boolean;
  chokepoints?: string[];
  gank_risk_level?: 'safe' | 'caution' | 'dangerous';
}

export type TradeStrategy = 'immediate' | 'relist';
export type ExecutionScenario = 'taker_taker' | 'taker_maker' | 'maker_taker' | 'maker_maker';

export interface FeeRateResolution {
  sales_tax_rate: number;
  sales_tax_source: 'skills_game_mechanics' | 'user_override';
  sales_tax_official_calculated: number;
  broker_fee_rate: number;
  broker_fee_source: 'skills_standings_mechanics' | 'upwell_mechanics' | 'user_override';
  broker_fee_official_calculated: number;
  relist_fee_rate: number;
  scc_surcharge_rate?: number;
  structure_owner_fee_rate?: number;
  description: string;
}

export interface ScenarioFinancialResult {
  scenario: ExecutionScenario;
  quantity: number;
  effective_buy_price: number;
  effective_sell_price: number;
  gross_purchase_cost: number;
  buy_broker_fee_cost: number;
  transport_cost: number;
  total_acquisition_cost: number;
  gross_revenue: number;
  sales_tax_cost: number;
  sell_broker_fee_cost: number;
  relist_fee_cost: number;
  total_exit_fees: number;
  net_revenue: number;
  net_profit: number;
  profit_per_unit: number;
  roi: number;
  margin: number;
  capital_locked: number;
  is_profitable: boolean;
  fee_resolution?: FeeRateResolution;
}

export interface FinancialConfig {
  available_capital: number;
  broker_fee: number;      // e.g. 0.0145 (1.45%)
  sales_tax: number;       // e.g. 0.035 (3.5%)
  enable_transport_costs: boolean; // Explicit toggle: true or false (default false if user wants 0 ISK transport)
  transport_cost_per_m3: number; // ISK per m³ (can be 0)
  transport_cost_per_jump: number; // ISK per jump (can be 0)
  collateral_fee_pct?: number; // Collateral percentage (e.g. 0.01 = 1%)
  transport_fixed_fee?: number; // Base fixed logistics fee per haul
  max_cargo_m3: number;    // Cargo capacity in m³ (e.g. 5000 for transport, 60000 for DST)
  min_roi: number;         // Minimum ROI (e.g. 0.02)
  min_net_profit: number;  // Minimum ISK profit
  max_days_to_sell: number;
  max_capital_per_trade: number;
  max_portfolio_concentration_type: number; // e.g. 0.35 (max 35% in one type)
  max_portfolio_concentration_group: number; // e.g. 0.50 (max 50% in one group)
  
  // EVE Character Skill & Standing simulation parameters
  accounting_level?: number;                // 0 to 5
  broker_relations_level?: number;          // 0 to 5
  advanced_broker_relations_level?: number; // 0 to 5
  faction_standing?: number;                // -10.0 to 10.0
  corp_standing?: number;                   // -10.0 to 10.0
  custom_broker_fee_pct?: number;           // Override broker fee (e.g. 1.0% in Citadel)
  custom_sales_tax_pct?: number;            // Override sales tax (e.g. 3.6%)
  use_custom_fees?: boolean;
  is_alpha_clone?: boolean;                 // Clamps skills to Alpha clone caps (Acc 3, BR 3, AdvBR 0)
  exclude_citadels?: boolean;               // Filter out player structures/Upwell citadels with docking ACL risks
  max_market_participation_pct?: number;    // Cap trade volume at fraction of daily volume (e.g. 0.25 = 25%)
  avoid_chokepoints?: boolean;              // Flag or avoid high-risk lowsec/gank chokepoints
  trader_profile?: 'balanced' | 'highsec_daytrader' | 'station_trader' | 'heavy_hauler';
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

export interface PriceLevel {
  price: number;
  volume: number;
  orders: number;
  cumulative: number;
  order_ids?: number[];
  location_ids?: number[];
  min_volume_max?: number;
}

export interface ExecutionLevelConsumption {
  price: number;
  volume_taken: number;
  volume_available_at_level: number;
  orders_at_level: number;
}

export interface ExecutionFill {
  requested_quantity: number;
  filled_quantity: number;
  effective_price: number;
  top_of_book_price?: number;
  total_cost_or_revenue: number;
  slippage_pct: number;
  slippage_isk?: number;
  levels_exhausted: number;
  remaining_book_liquidity?: number;
  levels_consumed_detail?: ExecutionLevelConsumption[];
}

export interface RelistMarketContext {
  is_estimated_execution: boolean;
  current_lowest_sell: number;
  suggested_relist_price: number;
  orders_ahead: number;
  volume_ahead: number;
  historical_daily_volume: number;
  historical_volume_7d_median: number;
  historical_volume_30d_median?: number;
  volume_trend?: 'increasing' | 'stable' | 'decreasing';
  expected_capturable_volume_per_day: number;
  expected_days_to_sell: number;
  expected_revenue: number;
  expected_profit: number;
  competition_density?: 'low' | 'moderate' | 'high' | 'intense';
}

export interface OpportunityExplanation {
  why_detected: string;
  why_this_quantity: {
    tradable_quantity: number;
    bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market';
    capital_limit_units: number;
    cargo_limit_units: number;
    source_available_units: number;
    dest_available_units: number;
    summary: string;
  };
  why_this_price: {
    source_top_of_book: number;
    source_effective_price: number;
    source_slippage_pct: number;
    source_levels_consumed: number;
    dest_top_of_book: number;
    dest_effective_price: number;
    dest_slippage_pct: number;
    dest_levels_consumed: number;
    summary: string;
  };
  why_this_profit: {
    gross_purchase: number;
    buy_broker_fee: number;
    transport_cost: number;
    gross_revenue: number;
    sales_tax: number;
    sell_broker_fee: number;
    net_profit: number;
    roi_pct: number;
    margin_pct: number;
    summary: string;
  };
  why_this_delay: {
    strategy: TradeStrategy;
    expected_days_to_sell: number;
    capturable_volume_per_day: number;
    daily_market_volume: number;
    orders_ahead: number;
    volume_ahead: number;
    summary: string;
  };
  why_this_confidence: {
    overall_confidence: number;
    source_freshness: string;
    dest_freshness: string;
    jita_verified: boolean;
    jita_spread_pct: number;
    is_anomalous: boolean;
    anomaly_reasons: string[];
    summary: string;
  };
  why_rejected?: {
    is_viable: boolean;
    rejection_reasons: string[];
  };
}

export interface TradeCostBreakdown {
  purchase_cost: number;
  buy_broker_fee: number;
  transport_cost: number;
  total_acquisition_cost: number;
  gross_revenue: number;
  sales_tax: number;
  sell_broker_fee: number;
  total_exit_fees: number;
  net_revenue: number;
  net_profit: number;
  profit_per_unit: number;
  roi: number;
  margin: number;
  capital_locked: number;
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

export interface ScoreComponents {
  profit_score: number;       // 0-100
  roi_score: number;          // 0-100
  liquidity_score: number;    // 0-100
  volume_score: number;       // 0-100
  turnover_score: number;     // 0-100
  capturability_score: number;// 0-100
  competition_score: number;  // 0-100
  transport_score: number;    // 0-100
  stability_score: number;    // 0-100
  overall_score: number;      // 0-100 (weighted sum)
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

export interface DetailedCostBreakdown {
  gross_purchase_cost: number;
  buy_broker_fee_cost: number;
  transport_cost: number;
  total_acquisition_cost: number;
  gross_revenue: number;
  sales_tax_cost: number;
  sell_broker_fee_cost: number;
  total_exit_fees: number;
  net_revenue: number;
  net_profit: number;
  profit_per_unit: number;
  roi: number;
  margin: number;
}

export interface InterRegionalOpportunity {
  id: string;
  type_id: number;
  type_name: string;
  group_id: number;
  group_name: string;
  category_id: number;
  category_name: string;
  unit_volume: number;
  
  buy_hub: MarketHub;
  sell_hub: MarketHub;
  strategy: TradeStrategy;
  route: JumpRoute;
  
  // Pricing
  best_buy_order_price: number;
  best_sell_order_price: number;
  top_of_book_buy_price?: number;
  top_of_book_sell_price?: number;
  effective_buy_price: number;
  effective_sell_price: number;
  spread_pct: number;
  
  // Volumes & Constraints
  quantity_tradable: number;
  bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market';
  total_cargo_volume: number;
  
  // Financials
  costs: TradeCostBreakdown;
  capturable_profit: number;
  profit_per_day: number;
  expected_days_to_sell: number;
  
  // Liquidity & Metrics
  liquidity: TradeLiquidityMetrics;
  history?: HistoricalStats;
  
  // Scoring
  scores: ScoreComponents;
  
  // Jita Price Benchmark (Source of Truth for Reliability)
  jita_price_benchmark?: {
    jita_sell_price: number;
    jita_buy_price: number;
    buy_vs_jita_pct: number;  // Price diff vs Jita (negative = bought cheaper than Jita!)
    sell_vs_jita_pct: number; // Price diff vs Jita (positive = sold higher than Jita!)
    is_jita_verified: boolean;
    reliability_assessment: string;
  };

  // Anomaly & Rejection Flagging
  is_anomalous: boolean;
  anomaly_reasons: string[];
  rejection_reasons: string[];
  is_viable: boolean;
  
  // Real Character History & Calibration Fit
  personal_fit?: PersonalCalibrationFit;

  // Data Quality & Veracity tracking
  data_quality?: {
    buy_hub_quality?: MarketDataQuality;
    sell_hub_quality?: MarketDataQuality;
    overall_confidence: number;
    overall_freshness: 'fresh' | 'recent' | 'stale' | 'expired';
    overall_completeness: 'complete' | 'partial' | 'empty';
    is_verified_esi: boolean;
    confidence_score: number;
    status_label?: string;
  };

  // Relist Strategy & Estimated Future Execution details
  relist_context?: RelistMarketContext;

  // Complete Audit & Explicability Rationale
  explanation?: OpportunityExplanation;

  // Statistical Prediction & Dynamic Feature Engineering
  prediction?: PredictionForecast;
  features?: MarketFeatureVector;

  // Phase 1 Certification & Traceable Provenance Contract
  certification?: OpportunityCertification;
  provenance?: OpportunityProvenance;
  evidence?: OpportunityEvidence;

  detected_at: string;
}

export interface PortfolioPosition {
  opportunity: InterRegionalOpportunity;
  allocated_capital: number;
  allocated_quantity: number;
  expected_profit: number;
  expected_daily_profit: number;
  share_of_portfolio: number;
}

export interface PortfolioSimulation {
  total_capital_available: number;
  total_capital_invested: number;
  total_expected_profit: number;
  total_expected_daily_profit: number;
  weighted_roi: number;
  positions: PortfolioPosition[];
  diversification: {
    by_category: Record<string, number>;
    by_group: Record<string, number>;
    by_route: Record<string, number>;
  };
}

export interface RecordedTradeExecution {
  id: string;
  opportunity_id: string;
  timestamp: string;
  type_id: number;
  type_name: string;
  from_hub: string;
  to_hub: string;
  strategy: TradeStrategy;
  predicted_buy_price: number;
  predicted_sell_price: number;
  predicted_quantity: number;
  predicted_net_profit: number;
  predicted_days_to_sell: number;
  
  // Real observed outcome
  actual_quantity_bought?: number;
  actual_buy_price?: number;
  actual_quantity_sold?: number;
  actual_sell_price?: number;
  actual_net_profit?: number;
  actual_days_to_sell?: number;
  status: 'planned' | 'in_transit' | 'active_orders' | 'completed' | 'cancelled';
  notes?: string;
}

// Backward compatibility interfaces for earlier prototype components & legacy engines
export interface EveType {
  type_id: number;
  name: string;
  volume?: number;
  group_id?: number;
  category_id?: number;
  published?: boolean;
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

export interface FeeBreakdown {
  purchase_cost: number;
  broker_fee: number;
  broker_cost: number;
  gross_revenue: number;
  sales_tax: number;
  sales_tax_cost: number;
  total_cost: number;
}

export interface ProfitResult {
  quantity: number;
  purchase_cost: number;
  broker_cost: number;
  gross_revenue: number;
  sales_tax_cost: number;
  total_cost: number;
  net_profit: number;
  profit_per_unit: number;
  roi: number;
  margin: number;
  is_profitable: boolean;
}

export interface QuantityResult {
  max_affordable_quantity: number;
  market_available_volume: number;
  max_trade_quantity: number;
  capital_required: number;
}

export interface Fill {
  filled_quantity: number;
  effective_price: number;
  levels_used: number;
}

export interface Opportunity {
  type_id: number;
  type_name: string;
  buy_region_id: number;
  buy_region_name: string;
  sell_region_id: number;
  sell_region_name: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  gross_cost?: number;
  capital_required?: number;
  net_profit: number;
  margin: number;
  roi: number;
  profit_per_jump?: number;
  jumps?: number;
  cargo_volume?: number;
  bottleneck?: string;
  score?: number;
  computed_at?: string;
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

export type SessionAuthStatus =
  | 'SESSION_VALID'
  | 'SESSION_EXPIRING'
  | 'SESSION_REFRESHING'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_CORRUPTED';

export interface EveCharacterSession {
  session_version?: number; // Version 2
  character_id: number;
  character_name: string;
  portrait_url: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp in milliseconds
  wallet_balance?: number;
  accounting_skill?: number;
  broker_relations_skill?: number;
  location_name?: string;
  ship_name?: string;
  active_orders_count?: {
    buy_orders: number;
    sell_orders: number;
    total: number;
  };
  last_sync?: string;
  last_validated_at?: string;
  is_active?: boolean;
  is_token_expired?: boolean;
  auth_status?: SessionAuthStatus;
  auth_error?: string;
}

export interface GlobalSyncProgress {
  is_running: boolean;
  is_paused: boolean;
  total_items: number;
  completed_items: number;
  successful_items: number;
  failed_items: number;
  current_item_name?: string;
  current_category_name?: string;
  total_orders_fetched: number;
  total_opportunities_found: number;
  percent: number;
  elapsed_seconds: number;
  estimated_remaining_seconds: number;
  error_count: number;
  last_updated: string;
}

export interface UniverseWideOpportunity extends InterRegionalOpportunity {
  item_name: string;
  item_icon?: string;
}

export interface EveCharacterOrder {
  order_id: number;
  type_id: number;
  type_name?: string;
  region_id: number;
  region_name?: string;
  location_id: number;
  location_name?: string;
  price: number;
  volume_remain: number;
  volume_total: number;
  is_buy_order: boolean;
  issued: string;
  duration: number;
  escrow?: number;
  is_corporation?: boolean;
  market_competition?: {
    highest_buy?: number;
    lowest_sell?: number;
    is_outbid: boolean;
    price_diff_percent: number;
    competing_volume?: number;
  };
}

export interface EveCharacterTransaction {
  transaction_id: number;
  date: string;
  type_id: number;
  type_name?: string;
  location_id: number;
  location_name?: string;
  unit_price: number;
  quantity: number;
  is_buy: boolean;
  is_personal: boolean;
  client_id: number;
  client_name?: string;
  journal_ref_id?: number;
}

export interface EveRegionInfo {
  region_id: number;
  name: string;
  description?: string;
  faction?: string;
  is_highsec?: boolean;
}

export interface EveCharacterOrderHistory {
  order_id: number;
  type_id: number;
  type_name?: string;
  region_id: number;
  region_name?: string;
  location_id: number;
  location_name?: string;
  price: number;
  volume_remain: number;
  volume_total: number;
  is_buy_order: boolean;
  issued: string;
  duration: number;
  escrow?: number;
  state: 'cancelled' | 'expired' | 'fulfilled' | 'open';
  completed_at?: string;
}

export interface EveCharacterJournalEntry {
  id: number;
  date: string;
  ref_type: string;
  amount: number;
  balance: number;
  description?: string;
  reason?: string;
  context_id?: number;
  context_id_type?: string;
}

export interface TradeCycleRecord {
  cycle_id: string;
  type_id: number;
  type_name: string;
  category_name?: string;
  buy_date: string;
  sell_date: string;
  quantity: number;
  avg_buy_price: number;
  avg_sell_price: number;
  total_buy_cost: number;
  total_sell_revenue: number;
  gross_profit: number;
  estimated_fees_paid: number;
  net_profit: number;
  roi: number; // e.g. 0.25 = +25%
  hold_days: number;
  is_profitable: boolean;
  buy_location?: string;
  sell_location?: string;
}

export interface TraderPerformanceMetrics {
  character_id: number;
  character_name: string;
  last_calculated: string;
  total_realized_profit: number; // in ISK
  total_buy_volume: number; // in ISK
  total_sell_volume: number; // in ISK
  total_turnover: number; // in ISK
  total_closed_trades: number;
  profitable_trades: number;
  unprofitable_trades: number;
  win_rate_pct: number; // 0 - 100
  average_realized_roi: number; // e.g. 0.22 = 22%
  average_hold_days: number;
  total_broker_fees_paid: number;
  total_sales_tax_paid: number;
  top_profitable_items: Array<{
    type_id: number;
    type_name: string;
    category_name?: string;
    total_profit: number;
    trades_count: number;
    avg_roi: number;
    avg_hold_days: number;
    total_volume_units: number;
  }>;
  recent_trade_cycles: TradeCycleRecord[];
  activity_by_location: Array<{
    location_id: number;
    location_name: string;
    total_volume_isk: number;
    transaction_count: number;
  }>;
  category_success_rate: Record<string, {
    total_trades: number;
    profit_isk: number;
    win_rate: number;
    avg_roi: number;
  }>;
  trader_title: string;
  trader_badge_color: string;
  calibration_weight: number;
}

export type OrderAdvisorAction = 'keep' | 'lower_price' | 'cancel' | 'relocate';

export interface OrderAdvisorRecommendation {
  order_id: number;
  type_id: number;
  type_name: string;
  is_buy_order: boolean;
  order_price: number;
  volume_remain: number;
  volume_total: number;
  location_name: string;
  region_name: string;
  action: OrderAdvisorAction;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  headline: string;
  summary: string;
  reasoning: string;

  // Option 1: Lower Price
  suggested_new_price?: number;
  price_delta_percent?: number;
  estimated_profit_if_lowered?: number;
  estimated_roi_if_lowered?: number;
  estimated_days_to_sell_after_cut?: number;
  retained_profit_isk?: number;

  // Option 2: Relocate to better market
  suggested_relocate_hub?: {
    hub_id: string;
    hub_name: string;
    region_name: string;
    station_name: string;
    jumps: number;
    is_highsec: boolean;
    current_best_sell_price: number;
    daily_volume: number;
    estimated_extra_profit_isk: number;
    net_profit_after_transport_and_relist: number;
    estimated_roi: number;
  };

  // Option 3: Cancel
  cancel_reason?: 'dead_volume' | 'severe_crash_under_cost' | 'capital_inefficiency';
  opportunity_cost_per_day?: number;
  capital_locked: number;

  // Competition analysis
  market_snapshot?: {
    current_lowest_sell: number;
    current_highest_buy: number;
    orders_ahead: number;
    volume_ahead: number;
    my_price_rank: number;
    daily_velocity: number;
  };
}

export interface PersonalCalibrationFit {
  has_personal_history: boolean;
  total_historical_trades: number;
  historical_realized_profit: number;
  historical_avg_roi: number;
  historical_win_rate: number;
  historical_avg_hold_days: number;
  calibration_confidence_boost: number; // e.g. +5% to +15%
  badge_text: string;
  badge_type: 'expert' | 'profitable' | 'caution' | 'new';
  summary: string;
}

// ==========================================
// OBSERVATION STORE & PREDICTION ENGINE TYPES
// ==========================================

export interface MarketObservation {
  observation_id: string;
  observation_hash: string;
  type_id: number;
  region_id: number;
  captured_at: string;
  source: 'esi_market_orders' | 'esi_market_history';
  best_buy_price?: number;
  best_sell_price?: number;
  weighted_buy_price?: number;
  weighted_sell_price?: number;
  buy_volume_visible?: number;
  sell_volume_visible?: number;
  spread_absolute?: number;
  spread_pct?: number;
  order_count_buy?: number;
  order_count_sell?: number;
  market_history_volume?: number;
  market_history_average_price?: number;
  data_age_seconds: number;
  esi_pages_fetched?: number;
  esi_pages_expected?: number;
  confidence: number;
}

export type OutcomeHorizon = '1h' | '6h' | '24h' | '3d' | '7d';

export const OUTCOME_HORIZONS: readonly OutcomeHorizon[] = ['1h', '6h', '24h', '3d', '7d'] as const;

export const OUTCOME_HORIZON_DURATIONS_MS: Record<OutcomeHorizon, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export interface OpportunityOutcomeSnapshot {
  horizon: OutcomeHorizon;
  recorded_at: string;
  still_active: boolean;
  current_spread_pct: number;
  spread_decay_pct: number;
  current_buy_price: number;
  current_sell_price: number;
  price_change_source_pct: number;
  price_change_dest_pct: number;
  realized_net_profit?: number;
  actual_hold_days?: number;
  prediction_error_pct?: number;
  source_quality?: MarketDataQuality;
  dest_quality?: MarketDataQuality;
  source_orders_count?: number;
  dest_orders_count?: number;
}

export interface MarketOutcomeProcessReport {
  totalObservationsChecked: number;
  dueObservationsCount: number;
  outcomesRecordedCount: number;
  skippedAlreadyRecordedCount: number;
  failedCount: number;
  errors: Array<{ observationId: string; horizon: OutcomeHorizon; error: string }>;
  recordedSnapshots: Array<{ observationId: string; horizon: OutcomeHorizon; snapshot: OpportunityOutcomeSnapshot }>;
}

export interface OutcomeCollectionResult {
  recorded: boolean;
  skippedAlreadyRecorded?: boolean;
  outcome?: OpportunityOutcomeSnapshot;
  error?: string;
}

export interface OpportunityObservation {
  observation_id: string;
  opportunity_id: string;
  timestamp: string;
  type_id: number;
  type_name: string;
  source_region_id: number;
  dest_region_id: number;
  source_hub_id: string;
  dest_hub_id: string;
  strategy: TradeStrategy;
  buy_price: number;
  sell_price: number;
  quantity: number;
  net_profit: number;
  roi: number;
  expected_days_to_sell: number;
  capturable_profit: number;
  profit_per_day: number;
  overall_score: number;
  liquidity_score: number;
  stability_score: number;
  data_confidence: number;
  is_anomalous: boolean;
  anomaly_reasons?: string[];
  bottleneck: string;
  
  // Phase 2C Audit & Verifiable Evidence Snapshot
  certification?: OpportunityCertification;
  evidence?: OpportunityEvidence;
  evidence_hash?: string;
  certification_version?: string;

  // Provenance & Snapshot links for fast audit
  source_market_hash?: string;
  dest_market_hash?: string;
  source_observation_id?: string;
  dest_observation_id?: string;
  catalog_version?: string;
  catalog_checksum?: string;
  route_jumps?: number;
  route_is_highsec?: boolean;
  
  // Future outcome tracking
  outcomes?: Record<string, OpportunityOutcomeSnapshot>; // '1h' | '6h' | '24h' | '3d' | '7d'
  realized?: boolean;
  realized_profit?: number;
  actual_hold_days?: number;
  prediction_error_pct?: number;

  // Phase 2B Execution Outcome Tracking
  execution_outcome?: OpportunityExecutionOutcome;
}

export interface MarketFeatureVector {
  spread_momentum_1h: number;        // Rate of change of spread over 1h (negative = compressing)
  spread_momentum_24h: number;       // Rate of change of spread over 24h
  volume_acceleration_7d_30d: number; // Ratio 7d volume / 30d baseline (> 1.0 = accelerating)
  competition_velocity_orders: number;// Change in orders ahead per hour
  depth_velocity_volume: number;      // Change in visible volume at top of book
  spread_persistence_ratio: number;  // Fraction of time window spread remained positive (0.0 to 1.0)
  volatility_zscore: number;         // Price deviation in standard deviations from median
  observations_count: number;        // Number of immutable observations used
}

export interface PredictionForecast {
  survival_probability: number;          // 0 to 100% (probability spread remains profitable during expectedDaysToSell)
  profit_realization_probability: number;// 0 to 100% (probability trader captures projected net profit)
  expected_realized_profit: number;      // ISK: capturable_profit * profit_realization_probability
  prediction_confidence: number;         // 0 to 100% (statistical certitude based on history depth & observation consistency)
  risk_level: 'low' | 'moderate' | 'elevated' | 'speculative';
  estimated_turnover_hours: number;
  key_drivers: string[];
  limiting_factors: string[];
}

// ==========================================
// TYPE ID CATALOG HARDENING & METADATA TYPES
// ==========================================

export type TypeCatalogStatus =
  | 'CATALOG_UNAVAILABLE'
  | 'CATALOG_LOADING'
  | 'CATALOG_DEGRADED'
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
  source: 'filesystem' | 'fallback_core' | 'esi_synced' | 'indexeddb' | 'server' | 'uninitialized';
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

// ==========================================
// PHASE 2B: EXECUTION OUTCOME TRACKING TYPES
// ==========================================

export type ExecutionStatus =
  | 'PLANNED'
  | 'BUY_PARTIAL'
  | 'BUY_FILLED'
  | 'SELL_PARTIAL'
  | 'CLOSED'
  | 'ABANDONED'
  | 'AMBIGUOUS';

export type CorrelationMatchLevel =
  | 'DIRECT_MATCH'
  | 'STRONG_MATCH'
  | 'PROBABLE_MATCH'
  | 'AMBIGUOUS'
  | 'UNMATCHED';

export interface ExecutionTransactionRef {
  readonly transaction_id: number;
  readonly order_id?: number;
  readonly character_id?: number;
  readonly type_id: number;
  readonly location_id: number;
  readonly is_buy: boolean;
  readonly quantity: number;
  readonly unit_price: number;
  readonly timestamp: string;
  readonly opportunity_id?: string;
  readonly observation_id?: string;
}

export interface PersistedCharacterTransaction {
  readonly transaction_id: number;
  readonly character_id: number;

  readonly type_id: number;
  readonly location_id: number;

  readonly is_buy: boolean;
  readonly quantity: number;
  readonly unit_price: number;

  readonly timestamp: string; // ISO-8601 UTC date of the EVE transaction event

  readonly is_personal?: boolean;
  readonly client_id?: number;
  readonly client_name?: string;
  readonly type_name?: string;
  readonly location_name?: string;
  readonly journal_ref_id?: number;

  // Provenance & Audit Metadata
  readonly first_seen_at: string; // ISO-8601 UTC when locally ingested
  readonly last_seen_at: string;  // ISO-8601 UTC when last observed in ESI
  readonly source: 'ESI';
  readonly source_endpoint: string; // e.g. "/characters/{character_id}/wallet/transactions/"
  readonly ingestion_version: string; // "1.0.0"

  readonly data_state: 'VALID' | 'PARTIAL' | 'INVALID';
  readonly validation_errors?: readonly string[];
}

// ==========================================
// PHASE 2B: ESI EXECUTION INGESTION TYPES
// ==========================================

export type CharacterTransactionSyncStoppedReason =
  | 'NO_MORE_DATA'
  | 'ANCHOR_REACHED'
  | 'NO_NEW_DATA'
  | 'MAX_PAGES_GUARD'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'VALIDATION_ERROR';

export interface CharacterTransactionSyncSummary {
  readonly character_id: number;
  readonly started_at: string;
  readonly completed_at: string;
  readonly duration_ms: number;

  readonly pages_fetched: number;
  readonly transactions_received: number;
  readonly transactions_valid: number;
  readonly transactions_invalid: number;
  readonly transactions_new: number;
  readonly transactions_existing: number;
  readonly duplicates_removed: number;

  readonly pagination_completed: boolean;
  readonly stopped_reason: CharacterTransactionSyncStoppedReason;

  readonly error_count: number;
  readonly errors: readonly string[];

  readonly latest_transaction_id?: number;
  readonly oldest_transaction_id?: number;
  readonly last_known_transaction_id_before_sync?: number;

  readonly data_state: DataState;
  readonly health_status: DataHealthStatus;
}

export interface EsiWalletTransactionResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly data: any[] | null;
  readonly error?: string;
  readonly retryAfterSeconds?: number;
  readonly errorLimitRemain?: number;
  readonly errorLimitReset?: number;
  readonly headers?: Record<string, string>;
}

export interface EsiWalletClientAdapter {
  fetchWalletTransactions(
    characterId: number,
    accessToken: string,
    options?: {
      from_id?: number;
      signal?: AbortSignal;
    }
  ): Promise<EsiWalletTransactionResponse>;
}

export interface CharacterTransactionSyncOptions {
  readonly maxPages?: number;
  readonly fullHistory?: boolean;
  readonly now?: () => string;
  readonly esiAdapter?: EsiWalletClientAdapter;
  readonly retryOnTransientError?: boolean;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  readonly sleepFn?: (ms: number) => Promise<void>;
  readonly maxWaitRetryAfterMs?: number;
}

export interface CorrelationCriterionResult {
  readonly criterion: 'IDENTITY' | 'DIRECTION' | 'LOCATION' | 'TEMPORAL' | 'PRICE' | 'QUANTITY' | 'ORDER_REF' | 'DIRECT_LINK';
  readonly passed: boolean;
  readonly score: number; // 0 to 1 normalized score for internal comparison
  readonly weight: number;
  readonly reason: string;
}

export interface TransactionCorrelationCandidate {
  readonly observation_id: string;
  readonly opportunity_id: string;
  readonly match_level: CorrelationMatchLevel;
  readonly total_score: number; // Internal ranking metric (0 to 100)
  readonly criteria: readonly CorrelationCriterionResult[];
  readonly reasons: readonly string[];
}

export interface TransactionCorrelationResult {
  readonly transaction_id: number;
  readonly candidate_observation_ids: readonly string[];
  readonly selected_observation_id: string | null;
  readonly match_level: CorrelationMatchLevel;
  readonly reasons: readonly string[];
  readonly candidates: readonly TransactionCorrelationCandidate[];
  readonly confidence_score: number; // 0 to 1
  readonly direct_matched_by?: 'TRANSACTION_OPPORTUNITY_REF' | 'TRANSACTION_OBSERVATION_REF' | 'EXPLICIT_MAPPING';
}

export interface CorrelationEngineOptions {
  readonly strong_price_tolerance_pct?: number; // default 0.02 (2%)
  readonly probable_price_tolerance_pct?: number; // default 0.10 (10%)
  readonly pre_observation_leeway_ms?: number; // default 600_000 (10 min)
  readonly max_buy_window_ms?: number; // default 86_400_000 (24h)
  readonly max_sell_window_ms?: number; // default 7 * 86_400_000 (7d)
  readonly ambiguity_score_threshold?: number; // default 5.0 (points)
  readonly direct_mappings?: Readonly<Record<number, string>>; // transaction_id -> observation_id or opportunity_id
  readonly location_resolver?: (locationId: number) => { region_id?: number; system_id?: number; station_id?: number } | undefined;
}

export interface OpportunityExecutionOutcome {
  readonly execution_status: ExecutionStatus;
  readonly match_level: CorrelationMatchLevel;

  readonly planned_quantity: number;

  readonly executed_buy_quantity: number;
  readonly executed_sell_quantity: number;
  readonly remaining_inventory_quantity: number;

  readonly buy_fill_ratio: number;
  readonly sell_fill_ratio: number;

  readonly vwap_buy_price: number | null;
  readonly vwap_sell_price: number | null;

  readonly first_buy_at: string | null;
  readonly last_buy_at: string | null;
  readonly first_sell_at: string | null;
  readonly last_sell_at: string | null;

  readonly buy_transactions: readonly ExecutionTransactionRef[];
  readonly sell_transactions: readonly ExecutionTransactionRef[];

  readonly linked_order_ids: readonly number[];
  readonly candidate_observation_ids: readonly string[];

  readonly has_inventory_inconsistency?: boolean;
  readonly inconsistency_reasons?: readonly string[];
}

export interface ExecutionOutcomeCalculationOptions {
  readonly match_level?: CorrelationMatchLevel;
  readonly candidate_observation_ids?: readonly string[];
  readonly force_status?: ExecutionStatus;
  readonly linked_order_ids?: readonly number[];
}
