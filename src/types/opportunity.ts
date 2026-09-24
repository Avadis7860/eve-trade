import type {
  DataState,
  DataHealthStatus,
  MarketDataSource,
  MarketDataFreshness,
  MarketDataCompleteness,
  DataProvenance,
  MarketDataQuality,
  HistoricalStats,
  TradeLiquidityMetrics,
} from './market';
import type {
  TypeResolutionStatus,
  TypeResolutionResult,
  LocationResolutionStatus,
  LocationResolutionResult,
  JumpRoute,
  MarketHub,
} from './universe';
import type {
  TradeStrategy,
  FinancialInputsEvidence,
  FinancialOutputsEvidence,
  ScoreComponents,
  TradeCostBreakdown,
} from './financial';
import type { TradeFleetPlan } from './character';
import type { OpportunityExecutionOutcome } from './execution';

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
  expected_revenue?: number;
  expected_profit?: number;
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

export interface PersonalCalibrationFit {
  has_personal_history: boolean;
  total_historical_trades: number;
  historical_realized_profit: number;
  /** Null when no historical sample exists for the requested item/category. */
  historical_avg_roi: number | null;
  /** Null when no historical sample exists for the requested item/category. */
  historical_win_rate: number | null;
  /** Null when no historical sample exists for the requested item/category. */
  historical_avg_hold_days: number | null;
  calibration_confidence_boost: number; // e.g. +5% to +15%
  badge_text: string;
  badge_type: 'expert' | 'profitable' | 'caution' | 'new';
  summary: string;
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
    overall_freshness: 'fresh' | 'recent' | 'stale' | 'expired' | 'unknown';
    overall_completeness: 'complete' | 'partial' | 'empty' | 'unknown';
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

  // Fleet Multi-Character Ecosystem Execution Plan
  fleet_plan?: TradeFleetPlan;

  detected_at: string;
}

export interface UniverseWideOpportunity extends InterRegionalOpportunity {
  item_name: string;
  item_icon?: string;
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
