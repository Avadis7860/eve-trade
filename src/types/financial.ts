import type { MarketLocationFeeProfile } from './market';

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

export type TreasurySourceMode = 'corporation' | 'fleet_consolidated' | 'active_character' | 'manual_budget';
export type CorporationWalletSource = 'esi' | 'manual' | 'unavailable';
export type TreasuryCapitalStatus = 'observed_esi' | 'manual' | 'unavailable';

export interface CorporationWalletDivisionInfo {
  division: number; // 1 to 7
  name: string;     // e.g. "Master (Division 1)", "Trading Division", etc.
  balance: number;  // ISK balance
}

export interface TreasuryResolution {
  source_mode: TreasurySourceMode;
  effective_capital: number;
  label: string;
  division?: number;
  division_name?: string;
  corporation_name?: string;
  is_corporation: boolean;
  capital_status: TreasuryCapitalStatus;
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
  /** Explicit policy reserve withheld before Proposed Allocation. Undefined means no reserve policy configured. */
  policy_reserve?: number;
  
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
  fleet_calculation_mode?: 'active_character' | 'fleet_consolidated';
  fleet_consolidated_capital?: number;

  // Treasury & Corporation Wallet configuration
  treasury_source_mode?: TreasurySourceMode; // 'corporation' | 'fleet_consolidated' | 'active_character' | 'manual_budget'
  corporation_wallet_division?: number;      // 1 to 7 (division number, default 1)
  corporation_wallet_balance?: number;       // Last selected division balance (observed or manual)
  corporation_wallet_source?: CorporationWalletSource;
  corporation_id?: number;
  corporation_name?: string;
  corporation_divisions?: CorporationWalletDivisionInfo[];
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

export interface CapitalRecoverySummary {
  readonly scope: CapitalRecoveryScope;
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
  readonly lot_id: string; // "lot_{buy_transaction_id}"
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
  readonly observation_id: string;
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
  readonly net_realized_profit: number;
  readonly realized_net_estimated: number | null;
  readonly is_net_estimated: boolean;
  readonly is_financially_complete: boolean;
  readonly financial_completeness: FinancialCompleteness;

  // Ratios & Rates
  readonly roi: number;
  readonly margin: number;
  readonly profit_per_unit: number;

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
  readonly transactions?: readonly any[]; // Accepts PersistedCharacterTransaction or ExecutionTransactionRef
  readonly now?: () => string;
}

export type PositionLifecycleStatus = 'OPEN' | 'PARTIALLY_REALIZED' | 'CLOSED' | 'UNKNOWN';

export type FinancialSourceKind =
  | 'ESI_WALLET_TRANSACTION'
  | 'EXECUTION_TRANSACTION';

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
  readonly economic_owner_type: 'character';
  readonly economic_owner_id: number;
  readonly related_order_id?: import('./order').OrderId;
  readonly status: PositionLifecycleStatus;
}

export interface DisposalAllocation {
  readonly allocation_id: string;
  readonly disposition_transaction_id: number;
  readonly acquisition_lot_id: string;
  readonly acquisition_transaction_id: number;
  readonly provenance: FinancialProvenance;
  readonly allocated_quantity: number;
  readonly acquisition_unit_cost: number;
  readonly disposal_unit_price: number;
  readonly acquisition_cost: number;
  readonly disposal_revenue: number;
  readonly gross_realized_profit: number;
  readonly acquired_at: string;
  readonly disposed_at: string;
}

export interface PositionDispositionState {
  readonly disposition_transaction_id: number;
  readonly disposed_quantity: number;
  readonly unmatched_quantity: number;
  readonly remaining_position_quantity: number;
  readonly lifecycle_status: PositionLifecycleStatus;
}

export interface CurrentPosition {
  readonly position_id: string;
  readonly type_id: number;
  readonly economic_owner_type: 'character';
  readonly economic_owner_id: number;
  readonly quantity_acquired: number;
  readonly quantity_disposed: number;
  readonly remaining_quantity: number;
  readonly remaining_cost_basis: number;
  readonly realized_gross_profit: number;

  // Position-level capital recovery, kept separate from realized P&L.
  readonly capital_committed: number | null;
  readonly cash_recovered: number | null;
  readonly capital_recovery_delta: number | null;
  readonly capital_recovery_ratio: number | null;

  readonly lifecycle_status: PositionLifecycleStatus;
  readonly financial_completeness: FinancialCompleteness;
  readonly lots: readonly AcquisitionLot[];
  readonly allocations: readonly DisposalAllocation[];
  readonly disposition_states: readonly PositionDispositionState[];
  readonly unmatched_disposition_quantity: number;
  readonly invalid_transaction_ids: readonly number[];
}

export interface PositionLedgerResult {
  readonly character_id: number;
  readonly type_id: number;
  readonly principal_scope: string;
  readonly position: CurrentPosition;
}
