import type { DataHealthStatus } from './market';
import type { TreasuryCapitalStatus, TreasurySourceMode } from './financial';
import type { EveCharacterOrder, EveCharacterSession } from './character';
import type { GlobalSyncProgress, InterRegionalOpportunity, UniverseWideOpportunity } from './opportunity';
import type { PortfolioSimulation } from './execution';

export type PortfolioUniverseCoverage = 'FULL' | 'BOUNDED' | 'PARTIAL' | 'UNKNOWN';

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
  code: PortfolioUnallocatedReasonCode;
  amount?: number;
  count?: number;
  detail: string;
}

export interface PortfolioTreasurySnapshot {
  source_mode: TreasurySourceMode;
  source_kind: 'OBSERVED_ESI' | 'MANUAL' | 'UNAVAILABLE';
  source_id: string;
  principal_scope: string;
  label: string;
  treasury_cash: number | null;
  policy_reserve: number;
  reserve_configured: boolean;
  allocation_budget: number | null;
  capital_status: TreasuryCapitalStatus;
  data_health: DataHealthStatus;
  is_simulation: boolean;
}

export interface PortfolioOrderExposureSnapshot {
  order_count: number;
  buy_order_count: number;
  sell_order_count: number;
  buy_escrow: number | null;
  buy_obligation: number | null;
  uncovered_buy_obligation: number | null;
  sell_exposure: number | null;
  data_health: DataHealthStatus;
  missing_escrow_count: number;
  missing_provenance_count: number;
  scoped_order_ids: string[];
  /** Corporation-owned orders known in the observed feed but not attributable to the selected treasury division. */
  unresolved_corporation_order_count: number;
  unresolved_corporation_order_ids: string[];
  unresolved_corporation_order_notional: number | null;
}

export interface PortfolioCandidateUniverseSnapshot {
  candidate_count: number;
  coverage: PortfolioUniverseCoverage;
  state: PortfolioUniverseState;
  data_health: DataHealthStatus;
  detected_at: string | null;
  selected_item_is_navigation_only: true;
  candidates: UniverseWideOpportunity[];
}

export interface PortfolioCapitalProvenance {
  source_kind: 'OBSERVED_ESI' | 'MANUAL' | 'UNAVAILABLE';
  source_id: string;
  principal_scope: string;
}

export interface PortfolioPositionRationale {
  rationale: string[];
  expected_profit_basis: 'EXPECTED_REALIZED_PROFIT' | 'CAPTURABLE_PROFIT';
  forecast_supported: boolean;
}

export interface PortfolioRealInventorySnapshot {
  coverage: 'UNKNOWN' | 'PARTIAL';
  quantity: number | null;
  location_known: boolean;
  market_value: number | null;
  cost_basis: number | null;
}

export interface RealPortfolioSnapshot {
  treasury: PortfolioTreasurySnapshot;
  orders: PortfolioOrderExposureSnapshot;
  inventory: PortfolioRealInventorySnapshot;
  data_health: DataHealthStatus;
  freshness: DataHealthStatus;
  is_authoritative_net_worth: false;
}

export interface ProposedAllocationSnapshot {
  treasury: PortfolioTreasurySnapshot;
  candidate_universe: PortfolioCandidateUniverseSnapshot;
  simulation: PortfolioSimulation;
  data_health: DataHealthStatus;
  freshness: DataHealthStatus;
  proposal_blocked: boolean;
  unallocated_capital: number | null;
  unallocated_within_budget: number | null;
  reserve_locked: number;
  unallocated_reasons: PortfolioUnallocatedReason[];
  position_rationales: Record<string, PortfolioPositionRationale>;
}

export interface PortfolioAggregationInput {
  config: import('./financial').FinancialConfig;
  characters?: EveCharacterSession[];
  active_character_id?: number | null;
  orders?: EveCharacterOrder[];
  universe?: UniverseWideOpportunity[];
  global_sync_progress?: GlobalSyncProgress;
}

export interface AllocationUniverseResolution {
  opportunities: InterRegionalOpportunity[];
  source: 'GLOBAL_UNIVERSE';
  selected_item_type_id?: number;
}
