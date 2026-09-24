
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

export type FinancialFeeMode = 'OBSERVED' | 'ESTIMATED' | 'UNAVAILABLE';
export type FinancialFeeSource = 'OBSERVED_TRANSACTION' | 'CONFIG_ESTIMATE' | 'UNAVAILABLE';
export type ExecutionFeeRoleMode = 'TAKER_TAKER' | 'TAKER_MAKER' | 'MAKER_TAKER' | 'MAKER_MAKER' | 'UNKNOWN';

/**
 * Financial completeness classification for realized trade outcomes.
 * Strictly distinguishes between observed transaction facts, config-based estimates,
 * partial executions / inventory deficits, and missing data.
 *
 * Core Principles:
 * - NO DATA ≠ ZERO DATA
 * - ESTIMATE ≠ OBSERVED FACT
 */
export type FinancialCompleteness = 'OBSERVED' | 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE';

export type CapitalRecoveryScope = 'KNOWN_POSITIONS';
export type EconomicOperationRecoveryState = 'NEGATIVE' | 'RECOVERED' | 'POSITIVE';

export interface CapitalRecoverySummary {
  readonly scope: CapitalRecoveryScope;
  readonly provenance: readonly FinancialProvenance[];
  readonly financial_completeness: Extract<FinancialCompleteness, 'OBSERVED' | 'PARTIAL'>;
  readonly capital_committed: number;
  readonly cash_recovered: number;
  readonly capital_recovery_delta: number;
  readonly capital_recovery_ratio: number | null;
  readonly remaining_quantity: number;
  readonly remaining_cost_basis: number;
  readonly known_position_count: number;
  readonly open_position_count: number;
  readonly partially_realized_position_count: number;
  readonly closed_position_count: number;
}

export interface FifoLotRecord {
  readonly lot_id: string;
  readonly provenance: FinancialProvenance; // "lot_{buy_transaction_id}"
  readonly buy_transaction_id: number;
  readonly type_id: number;
  readonly location_id: number;
  readonly timestamp: string;
  readonly original_quantity: number;
  readonly remaining_quantity: number;
  readonly unit_cost: number;
  readonly total_original_cost: number;
  readonly total_remaining_cost: number;
}

export interface FifoAllocationRecord {
  readonly allocation_id: string;
  readonly provenance: FinancialProvenance;
  readonly sell_transaction_id: number;
  readonly buy_transaction_id: number;
  readonly type_id: number;
  readonly allocated_quantity: number;
  readonly buy_unit_price: number;
  readonly sell_unit_price: number;
  readonly buy_timestamp: string;
  readonly sell_timestamp: string;
  readonly hold_duration_ms: number;
  readonly hold_days: number;
  readonly gross_cost: number;
  readonly gross_revenue: number;
  readonly gross_profit: number;
}

export interface RealizedFeeBreakdown {
  readonly fee_mode: FinancialFeeMode;
  readonly fee_source: FinancialFeeSource;
  readonly execution_fee_mode: ExecutionFeeRoleMode;
  readonly estimated_buy_broker_fee: number;
  readonly estimated_sell_broker_fee: number;
  readonly estimated_sales_tax: number;
  readonly estimated_total_fees: number;
  readonly observed_fees_paid?: number;
  readonly is_role_assumed?: boolean;
  readonly notes?: readonly string[];
}

export interface RealizedFinancialOutcome {
  readonly outcome_id: string;
  readonly execution_id: string;
  readonly character_id: number;
  readonly accounting_scope_id: string;
  readonly source_coverage: FinancialSourceCoverage;
  readonly position_disposition_states: readonly PositionDispositionState[];
  /** Real source observation when correlated; absent for direct transaction calculations. */
  readonly observation_id?: string;
  /** Identifies whether the outcome came from a correlated execution record or direct transaction facts. */
  readonly calculation_source: 'EXECUTION_RECORD' | 'TRANSACTION_FACTS';
  readonly opportunity_id?: string;
  readonly type_id: number;

  // Quantities
  readonly total_buy_quantity: number;
  readonly total_sell_quantity: number;
  readonly matched_quantity: number;
  readonly remaining_inventory_quantity: number;
  readonly unmatched_sell_quantity: number;
  readonly has_unmatched_sell_quantity: boolean;

  // Financial Values (Realized based on matched quantity)
  readonly realized_acquisition_cost: number;
  readonly realized_revenue: number;
  readonly gross_realized_profit: number;
  readonly realized_gross: number;

  // Fees & Net (Strict separation of observed facts vs configuration estimates)
  readonly fees: RealizedFeeBreakdown;
  /** Null when the net result cannot be evidenced because required fee inputs are unavailable. */
  readonly net_realized_profit: number | null;
  readonly realized_net_estimated: number | null;
  readonly is_net_estimated: boolean;
  readonly is_financially_complete: boolean;
  readonly financial_completeness: FinancialCompleteness;

  // Ratios & Rates
  readonly roi: number | null;
  readonly margin: number | null;
  readonly profit_per_unit: number | null;

  // Inventory Cost Basis (Unrealized holding cost)
  readonly remaining_inventory_cost_basis: number;

  // Position-level capital recovery. These values are derived from known
  // acquisition lots and causally allocated disposal revenue only. They never
  // replace realized P&L or disposal-level ROI.
  readonly capital_committed: number | null;
  readonly cash_recovered: number | null;
  readonly capital_recovery_delta: number | null;
  readonly capital_recovery_ratio: number | null;

  // Position lifecycle is distinct from transaction/event-level execution status.
  readonly position_lifecycle: PositionLifecycleStatus;
  readonly position_remaining_quantity: number;

  // Temporal & Hold Metrics
  readonly first_buy_at: string | null;
  readonly last_buy_at: string | null;
  readonly first_realized_sell_at: string | null;
  readonly last_realized_sell_at: string | null;
  readonly weighted_buy_timestamp: string | null;
  readonly weighted_sell_timestamp: string | null;
  readonly weighted_hold_ms: number;
  readonly weighted_hold_days: number;

  // Quality & Traceability
  readonly data_state: 'VALID' | 'PARTIAL';
  readonly state_reasons?: readonly string[];
  readonly fifo_allocations: readonly FifoAllocationRecord[];
  readonly remaining_lots: readonly FifoLotRecord[];

  // Versioning
  readonly realized_financial_engine_version: string; // "1.0.0"
}

export interface RealizedFinancialCalculationOptions {
  readonly financialConfig?: Partial<FinancialConfig>;
  readonly buyLocationProfile?: Partial<MarketLocationFeeProfile>;
  readonly sellLocationProfile?: Partial<MarketLocationFeeProfile>;
  readonly executionFeeMode?: ExecutionFeeRoleMode;
  /** Explicit economic accounting scope; characters are reporting/provenance dimensions. */
  readonly accounting_scope_id?: string;
  readonly transactions?: readonly any[]; // Accepts PersistedCharacterTransaction or ExecutionTransactionRef
  readonly now?: () => string;
}

export type PositionLifecycleStatus = 'OPEN' | 'PARTIALLY_REALIZED' | 'CLOSED' | 'UNKNOWN';

export type EconomicOrigin =
  | 'MARKET_ACQUISITION'
  | 'PRODUCTION_OUTPUT'
  | 'INTERNAL_TRANSFER'
  | 'UNKNOWN_ORIGIN';

export type FinancialSourceKind =
  | 'ESI_WALLET_TRANSACTION'
  | 'EXECUTION_TRANSACTION';

export type FinancialSourceCoverage =
  | 'MARKET_TRACEABLE'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type EconomicOwnerType =
  | 'character'
  | 'corporation'
  | 'mixed'
  | 'unknown';

export interface FinancialProvenance {
  readonly source_kind: FinancialSourceKind;
  readonly source_id: string;
  readonly principal_scope: string;
}

export interface AcquisitionLot {
  readonly lot_id: string;
  readonly provenance: FinancialProvenance;
  readonly transaction_id: number;
  readonly type_id: number;
  readonly location_id: number;
  readonly quantity_acquired: number;
  readonly remaining_quantity: number;
  readonly unit_cost: number;
  readonly total_original_cost: number;
  readonly remaining_cost_basis: number;
  readonly acquired_at: string;
  readonly economic_origin: EconomicOrigin;
  readonly economic_owner_type: Exclude<EconomicOwnerType, 'mixed'>;
  readonly economic_owner_id: number | string | null;