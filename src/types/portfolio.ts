import type {
  DataHealthStatus,
  DataProvenance,
  DataState,
  MarketDataFreshness,
} from './market';
import type {
  CurrentPosition,
  EconomicOriginCoverage,
  FinancialCompleteness,
  FinancialHistoryCoverage,
  FinancialSourceCoverage,
  RealizedFinancialOutcome,
  TreasuryResolution,
} from './financial';
import type {
  EveCharacterOrder,
  OrderOwnership,
  OrderScope,
  OrderSelectionContext,
} from './character';
import type { OrderId } from './order';
import type { UniverseWideOpportunity } from './opportunity';

/**
 * Portfolio-specific treasury provenance.
 *
 * This deliberately does not reuse FinancialProvenance: its source-kind vocabulary
 * belongs to financial transaction provenance, while this object describes the
 * source of the resolved treasury/capital view.
 */
export type PortfolioTreasurySourceKind =
  | 'OBSERVED_ESI'
  | 'MANUAL'
  | 'UNAVAILABLE';

export interface PortfolioTreasuryProvenance {
  readonly source_kind: PortfolioTreasurySourceKind;
  readonly source_id: string;
  readonly principal_scope: string;
}

export interface PortfolioTreasurySnapshot {
  readonly resolution: TreasuryResolution;
  readonly provenance: PortfolioTreasuryProvenance;
  /**
   * Observed source cash when available. This is not necessarily identical to
   * the effective trading capital in the resolution.
   */
  readonly treasury_cash: number | null;
  /**
   * Capital eligible for a new proposal after applying only policies actually
   * represented by the current contract.
   */
  readonly allocation_budget: number | null;
  readonly is_simulation: boolean;
  readonly health: DataHealthStatus;
  readonly data_state: DataState;
}

export interface PortfolioOrderExposureSnapshot {
  readonly order_count: number;
  readonly buy_order_count: number;
  readonly sell_order_count: number;
  readonly buy_escrow: number | null;
  readonly buy_obligation: number | null;
  readonly uncovered_buy_obligation: number | null;
  readonly sell_exposure: number | null;
  readonly missing_escrow_count: number;
  readonly missing_provenance_count: number;
  readonly scoped_order_ids: readonly OrderId[];
  readonly unresolved_corporation_order_count: number;
  readonly unresolved_corporation_order_ids: readonly OrderId[];
  readonly unresolved_corporation_order_notional: number | null;
  readonly health: DataHealthStatus;
  readonly data_state: DataState;
}

export type PortfolioUniverseCoverage =
  | 'FULL'
  | 'BOUNDED'
  | 'PARTIAL'
  | 'UNKNOWN';

export type PortfolioUniverseState =
  | 'READY'
  | 'EMPTY'
  | 'UNKNOWN'
  | 'STALE'
  | 'PARTIAL'
  | 'ERROR'
  | 'CACHE';

export type PortfolioUnallocatedReasonCode =
  | 'RESERVE'
  | 'NO_ELIGIBLE_OPPORTUNITY'
  | 'MINIMUM_TRADE_SIZE'
  | 'POLICY_LIMIT'
  | 'CONCENTRATION_LIMIT'
  | 'DATA_ISSUE'
  | 'INSUFFICIENT_CAPITAL'
  | 'ROUTE_SECURITY_CONSTRAINT'
  | 'NO_TRUSTWORTHY_PREDICTION';

export interface PortfolioUnallocatedReason {
  readonly code: PortfolioUnallocatedReasonCode;
  readonly amount?: number;
  readonly count?: number;
  readonly detail: string;
}

export interface PortfolioCandidateUniverseSnapshot {
  readonly candidate_count: number;
  readonly coverage: PortfolioUniverseCoverage;
  readonly state: PortfolioUniverseState;
  readonly health: DataHealthStatus;
  readonly data_state: DataState;
  /**
   * Candidate freshness is meaningful for the market-derived proposal universe.
   * Financial/treasury freshness remains source-specific elsewhere.
   */
  readonly freshness: MarketDataFreshness;
  readonly detected_at: string | null;
  /** Selected catalog context is navigation only and never constrains candidates. */
  readonly selected_item_is_navigation_only: true;
  readonly candidates: readonly UniverseWideOpportunity[];
}

export interface PortfolioPositionRationale {
  readonly rationale: readonly string[];
  readonly expected_profit_basis:
    | 'EXPECTED_REALIZED_PROFIT'
    | 'CAPTURABLE_PROFIT';
  readonly forecast_supported: boolean;
}

export interface PortfolioRealInventorySnapshot {
  /**
   * Character Assets is a future source. Current main does not provide
   * authoritative physical quantity/location coverage.
   */
  readonly coverage: 'UNKNOWN' | 'PARTIAL';
  readonly quantity: number | null;
  readonly location_known: boolean;
  readonly market_value: number | null;
  readonly cost_basis: number | null;
  readonly source_boundary: 'NEW_SOURCE';
}

export interface PortfolioDataQuality {
  readonly health: DataHealthStatus;
  readonly data_state: DataState;
  readonly history_coverage?: FinancialHistoryCoverage;
  readonly economic_origin_coverage?: EconomicOriginCoverage;
  readonly source_coverage?: FinancialSourceCoverage;
  readonly financial_completeness?: FinancialCompleteness;
  readonly market_provenance?: DataProvenance;
}

/**
 * Economic exposure already observed or reconstructed by Financial Truth.
 *
 * The model composes canonical domain records instead of redefining them.
 */
export interface RealPortfolioSnapshot {
  readonly accounting_scope_id: string;
  readonly treasury: PortfolioTreasurySnapshot;
  readonly orders: {
    readonly records: readonly EveCharacterOrder[];
    readonly ownership: readonly OrderOwnership[];
    readonly exposure: PortfolioOrderExposureSnapshot;
  };
  readonly positions: readonly CurrentPosition[];
  readonly realized_outcomes: readonly RealizedFinancialOutcome[];
  readonly inventory: PortfolioRealInventorySnapshot;
  readonly quality: PortfolioDataQuality;
  /** False until authoritative physical inventory coverage exists. */
  readonly is_authoritative_net_worth: false;
}

/**
 * A prospective capital-deployment position. It is intentionally independent
 * from Financial Truth realized outcomes.
 */
export interface ProposedAllocationPosition {
  readonly opportunity: UniverseWideOpportunity;
  readonly allocated_capital: number;
  readonly allocated_quantity: number;
  readonly projected_net_profit: number | null;
  readonly projected_roi: number | null;
  readonly expected_daily_profit: number | null;
  readonly expected_days_to_sell: number | null;
  readonly capital_provenance: PortfolioTreasuryProvenance;
  readonly data_confidence: number | null;
  readonly prediction_confidence: number | null;
  readonly rationale: PortfolioPositionRationale;
}

export interface ProposedAllocationSnapshot {
  readonly accounting_scope_id: string;
  readonly treasury: PortfolioTreasurySnapshot;
  readonly candidate_universe: PortfolioCandidateUniverseSnapshot;
  readonly positions: readonly ProposedAllocationPosition[];
  readonly allocated_capital: number | null;
  readonly unallocated_capital: number | null;
  readonly unallocated_reasons: readonly PortfolioUnallocatedReason[];
  readonly proposal_blocked: boolean;
  readonly quality: PortfolioDataQuality;
}

export interface PortfolioSnapshot {
  readonly real: RealPortfolioSnapshot;
  readonly proposed: ProposedAllocationSnapshot;
}

/**
 * Explicit input boundary for Portfolio Aggregation.
 *
 * Every upstream source is resolved before entering the aggregator. The
 * aggregator only composes canonical records and source-quality state.
 */
export interface PortfolioAggregationInput {
  readonly accounting_scope_id: string;
  readonly treasury: PortfolioTreasurySnapshot;

  /**
   * Order scope is deliberately independent from treasury scope.
   */
  readonly order_scope: OrderScope;
  readonly order_selection_context: OrderSelectionContext;
  readonly orders: readonly EveCharacterOrder[];
  readonly orders_health: DataHealthStatus;
  readonly orders_data_state: DataState;

  /**
   * Financial Truth records are already reconstructed by their canonical
   * engines. The collection state is explicit so an empty array is not
   * interpreted as an authoritative empty portfolio.
   */
  readonly positions: readonly CurrentPosition[];
  readonly realized_outcomes: readonly RealizedFinancialOutcome[];
  readonly financial_health: DataHealthStatus;
  readonly financial_data_state: DataState;

  /**
   * Global opportunity acquisition is complete before composition. Coverage,
   * health, state and freshness travel with the snapshot.
   */
  readonly candidate_universe: PortfolioCandidateUniverseSnapshot;
}

/**
 * Backward-compatible implementation-facing name retained for consumers that
 * already reference the generic Portfolio composition context.
 */
export type PortfolioCompositionContext = PortfolioAggregationInput;
