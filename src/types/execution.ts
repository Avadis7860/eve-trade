import type { DataState, DataHealthStatus, MarketLocationFeeProfile } from './market';
import type {
  TradeStrategy,
  FinancialConfig,
  ExecutionFeeRoleMode,
  RealizedFinancialOutcome,
} from './financial';
import type { InterRegionalOpportunity, OpportunityObservation } from './opportunity';
import type { PersistedCharacterTransaction } from './character';
import type { OrderId } from './order';

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

export interface PortfolioPosition {
  opportunity: InterRegionalOpportunity;
  allocated_capital: number;
  allocated_quantity: number;
  expected_profit: number;
  expected_daily_profit: number;
  share_of_portfolio: number;
  /** Prospective metrics stay separate from realized financial truth. */
  expected_realized_profit?: number;
  projected_net_profit?: number;
  capturable_profit?: number;
  projected_roi?: number;
  profit_per_day?: number;
  expected_days_to_sell?: number;
  data_confidence?: number | null;
  prediction_confidence?: number | null;
  profit_realization_probability?: number | null;
  risk_fronts?: string[];
  concentration_contribution?: {
    type_share: number;
    group_share: number;
    category_share: number;
    route_share: number;
  };
  rationale?: import('./portfolio').PortfolioPositionRationale;
  capital_provenance?: import('./portfolio').PortfolioCapitalProvenance;
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
  /** UX-03 aggregation metadata; omitted only for legacy callers. */
  allocation_budget?: number | null;
  policy_reserve?: number;
  unallocated_capital?: number | null;
  unallocated_reasons?: import('./portfolio').PortfolioUnallocatedReason[];
  candidate_coverage?: import('./portfolio').PortfolioUniverseCoverage;
  data_health?: DataHealthStatus;
  freshness?: DataHealthStatus;
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
  readonly order_id?: OrderId;
  readonly character_id?: number;
  readonly type_id: number;
  readonly location_id: number;
  /**
   * Economic transaction direction from the trader's accounting perspective.
   * This is deliberately different from MarketOrder.is_buy_order.
   */
  readonly is_buy: boolean;
  readonly quantity: number;
  readonly unit_price: number;
  readonly timestamp: string;
  readonly opportunity_id?: string;
  readonly observation_id?: string;
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
  readonly character_id?: number;
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

  readonly linked_order_ids: readonly OrderId[];
  readonly candidate_observation_ids: readonly string[];

  readonly has_inventory_inconsistency?: boolean;
  readonly inconsistency_reasons?: readonly string[];
}

export interface ExecutionOutcomeCalculationOptions {
  readonly match_level?: CorrelationMatchLevel;
  readonly candidate_observation_ids?: readonly string[];
  readonly force_status?: ExecutionStatus;
  readonly linked_order_ids?: readonly OrderId[];
}

// ==========================================
// PHASE 2B: CHARACTER-SCOPED EXECUTION TRACKING (CHANTIER 3B-3)
// ==========================================

export interface CharacterExecutionRecord {
  readonly execution_id: string; // Deterministic format: "exec_{character_id}_{observation_id}"
  readonly character_id: number;
  readonly observation_id: string;
  readonly opportunity_id: string;

  readonly execution_outcome: OpportunityExecutionOutcome;

  readonly match_level: CorrelationMatchLevel;
  readonly transaction_ids: readonly number[]; // Explicit list of linked transaction IDs

  readonly first_correlated_at: string; // ISO UTC when first attributed
  readonly last_updated_at: string;     // ISO UTC when last recomputed/updated

  readonly correlation_engine_version: string; // "1.0.0"

  readonly data_state: 'VALID' | 'PARTIAL' | 'AMBIGUOUS';
  readonly validation_errors?: readonly string[];

  /**
   * Deterministic Realized Financial Outcome calculated by RealizedFinancialOutcomeEngine (Chantier 3B-4A).
   * Optional posterior derivation preserving backward compatibility.
   */
  readonly realized_financial_outcome?: RealizedFinancialOutcome;
}

/**
 * UnassignedTransactionRecord represents an EPHEMERAL in-run diagnostic artifact
 * indicating a transaction that could not be attributed to an execution during this specific tracking run
 * (e.g. AMBIGUOUS match or UNMATCHED).
 * 
 * IMPORTANT ARCHITECTURAL INVARIANT (CHANTIER 3B-3.1):
 * This is an ephemeral in-memory diagnostic produced per-run. It is NOT a durable persisted record,
 * object store, or historical ledger table.
 */
export interface UnassignedTransactionRecord {
  readonly transaction_id: number;
  readonly character_id: number;
  readonly reason: string;
  readonly match_level: CorrelationMatchLevel;
  readonly candidate_observation_ids: readonly string[];
}

export interface ExecutionTrackingSummary {
  readonly character_id: number;
  readonly started_at: string;
  readonly completed_at: string;
  readonly duration_ms: number;

  readonly transactions_considered: number;
  readonly transactions_correlated: number;

  readonly direct_matches: number;
  readonly strong_matches: number;
  readonly probable_matches: number;
  readonly ambiguous_matches: number;
  readonly unmatched_transactions: number;

  readonly execution_records_created: number;
  readonly execution_records_updated: number;
  readonly execution_records_deleted?: number;

  readonly execution_records: readonly CharacterExecutionRecord[];
  /**
   * Ephemeral run-time diagnostic results of unassigned transactions.
   * Note: This is NOT stored in any durable table.
   */
  readonly unassigned_transactions: readonly UnassignedTransactionRecord[];

  readonly errors: readonly string[];
}

export interface ExecutionTrackingOptions {
  readonly transactions?: readonly PersistedCharacterTransaction[];
  readonly observations?: readonly OpportunityObservation[];
  readonly directMappings?: Readonly<Record<number, string>>; // transaction_id -> observation_id or opportunity_id
  readonly correlationOptions?: CorrelationEngineOptions;
  readonly now?: () => string; // Deterministic clock injection
  readonly forceRecompute?: boolean;

  // Optional financial outcome derivation (Chantier 3B-4A)
  readonly computeFinancialOutcome?: boolean;
  readonly financialConfig?: Partial<FinancialConfig>;
  readonly buyLocationProfile?: Partial<MarketLocationFeeProfile>;
  readonly sellLocationProfile?: Partial<MarketLocationFeeProfile>;
  readonly executionFeeMode?: ExecutionFeeRoleMode;
}
