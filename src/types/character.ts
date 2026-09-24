import type {
  CorporationWalletDivisionInfo,
  FinancialCompleteness,
  RealizedFeeBreakdown,
  ExecutionFeeRoleMode,
  TreasurySourceMode,
  CapitalRecoverySummary,
} from './financial';
import type { OrderId } from './order';

export type SessionAuthStatus =
  | 'SESSION_VALID'
  | 'SESSION_EXPIRING'
  | 'SESSION_REFRESHING'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_CORRUPTED';

export type FleetRole = 'buyer' | 'seller' | 'hauler' | 'all_rounder' | 'scout';
export type FleetCalculationMode = 'active_character' | 'fleet_consolidated';

export interface FleetCharacterSummary {
  character_id: number;
  character_name: string;
  portrait_url: string;
  assigned_hub_id?: string;
  assigned_hub_name?: string;
  assigned_station_id?: number;
  fleet_role: FleetRole;
  wallet_balance?: number;
  accounting_skill: number;
  broker_relations_skill: number;
  advanced_broker_relations_skill?: number;
  ship_cargo_capacity_m3?: number;
  is_active?: boolean;
}

export interface TradeFleetStep {
  step_number: number;
  phase: 'BUY' | 'HAUL' | 'SELL';
  title: string;
  assigned_character?: FleetCharacterSummary;
  location_id: number;
  location_name: string;
  action_summary: string;
  fees_summary?: string;
  details: {
    quantity?: number;
    unit_price?: number;
    total_isk?: number;
    fee_rate_pct?: number;
    fee_cost?: number;
    cargo_volume_m3?: number;
    cargo_capacity_m3?: number;
    cargo_utilization_pct?: number;
    jumps?: number;
    route_security?: string;
    has_sufficient_wallet?: boolean;
    wallet_deficit_isk?: number;
  };
}

export interface TradeFleetPlan {
  is_fleet_enabled: boolean;
  fleet_size: number;
  buyer_character?: FleetCharacterSummary;
  hauler_character?: FleetCharacterSummary;
  seller_character?: FleetCharacterSummary;
  steps: TradeFleetStep[];
  is_cross_character: boolean; // True if buyer !== seller or dedicated hauler used
  total_fleet_capital_available: number;
  buyer_wallet_balance?: number;
  buyer_has_sufficient_capital: boolean;
  buyer_capital_deficit: number;
  hauler_cargo_capacity_m3: number;
  hauler_cargo_sufficient: boolean;
  notes: string[];
}

export interface TradingFleetOverview {
  total_characters: number;
  active_character_id: number | null;
  consolidated_wallet_balance: number;
  total_active_orders_count: number;
  total_buy_orders_count: number;
  total_sell_orders_count: number;
  total_escrow_locked: number;
  characters: FleetCharacterSummary[];
  hub_coverage: Record<string, FleetCharacterSummary[]>; // hub_id -> characters stationed there
  treasury_source_mode?: TreasurySourceMode;
  effective_trading_capital?: number;
  corporation_wallet_division?: number;
  corporation_wallet_balance?: number;
  corporation_name?: string;
  treasury_label?: string;
}

export interface EveCharacterSession {
  session_version?: number; // Version 2
  character_id: number;
  character_name: string;
  portrait_url: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp in milliseconds
  wallet_balance?: number;
  corporation_id?: number;
  corporation_name?: string;
  corporation_ticker?: string;
  corporation_wallets?: CorporationWalletDivisionInfo[];
  accounting_skill?: number;
  broker_relations_skill?: number;
  advanced_broker_relations_skill?: number;
  location_name?: string;
  ship_name?: string;
  assigned_hub_id?: string; // e.g. "jita", "amarr", "dodixie", "rens", "hek"
  assigned_hub_name?: string;
  assigned_station_id?: number;
  fleet_role?: FleetRole;
  ship_cargo_capacity_m3?: number; // e.g. 5000, 60000, 350000
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

export type OrderOwnerType = 'character' | 'corporation';

export interface OrderOwnership {
  /** Character whose credential supplied the primary observation in this view/snapshot. In aggregates this is deterministic, not the sole observer. */
  principal_character_id: number;
  /** All linked characters whose credentials independently observed this same order. */
  observed_by_character_ids?: readonly number[];
  /** Economic/legal owner represented by the order payload. */
  owner_type: OrderOwnerType;
  /** EVE entity ID matching owner_type: character_id or corporation_id. */
  owner_id: number;
  owner_name?: string;
  corporation_id?: number;
  corporation_name?: string;
  /** Character who issued the order when ESI exposes issuer provenance. */
  issuer_character_id?: number;
  issuer_character_name?: string;
  /** Corporation wallet division funding this order, when applicable. */
  wallet_division?: number;
}

export interface MarketOrder {
  order_id: OrderId;
  /**
   * Backward-compatible character-owner projection.
   * Must be undefined for corporation-owned orders; use ownership as authority.
   */
  character_id?: number;
  character_name?: string;
  type_id: number;
  type_name?: string;
  region_id: number;
  region_name?: string;
  location_id: number;
  location_name?: string;
  price: number;
  volume_remain: number;
  volume_total: number;
  /**
   * Side of this observed market order. This is NOT the accounting direction
   * of a trader transaction that may have interacted with the order.
   */
  is_buy_order: boolean;
  issued: string;
  duration: number;
  escrow?: number;
  /** Canonical ownership/provenance; legacy snapshots may omit this during migration. */
  ownership?: OrderOwnership;
  /** @deprecated Use ownership.owner_type === 'corporation'. */
  is_corporation?: boolean;
  market_competition?: {
    highest_buy?: number;
    lowest_sell?: number;
    is_outbid: boolean;
    price_diff_percent: number;
    competing_volume?: number;
  };
}

/** Backward-compatible name retained while consumers migrate to the canonical MarketOrder contract. */
export type EveCharacterOrder = MarketOrder;

/**
 * Phase 2 — Order Scoping & Multi-Character Context Contracts
 */
export type OrderScope =
  | {
      type: 'active_character';
    }
  | {
      type: 'character';
      characterId: string;
    }
  | {
      type: 'fleet';
    }
  | {
      type: 'corporation';
      corporationId: string;
    };

export interface OrderCharacterContext {
  characterId: string;
  characterName: string;
}

export interface OrderCorporationContext {
  corporationId: string;
  corporationName?: string;
}

export interface OrderSelectionContext {
  activeCharacterId: string;
  fleetCharacterIds: string[];
  corporationIds: string[];
}

export interface OrderCollection {
  orders: EveCharacterOrder[];
  characters: OrderCharacterContext[];
  corporations?: OrderCorporationContext[];
  scope: OrderScope;
}

export interface EveCharacterTransaction {
  transaction_id: number;
  character_id?: number;
  character_name?: string;
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

export interface EveCharacterOrderHistory {
  order_id: OrderId;
  /** Canonical ownership/provenance; legacy snapshots may omit this during migration. */
  ownership?: OrderOwnership;
  /** Backward-compatible character-owner projection; undefined for corporation-owned orders. */
  character_id?: number;
  character_name?: string;
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
  /** @deprecated Use ownership.owner_type === 'corporation'. */
  is_corporation?: boolean;
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
  roi: number | null; // null when the ROI denominator is unavailable
  hold_days: number;
  is_profitable: boolean;
  buy_location?: string;
  sell_location?: string;
  financial_completeness?: FinancialCompleteness;
  is_net_estimated?: boolean;
  realized_profit_label?: string;
  fees_breakdown?: RealizedFeeBreakdown;
  unmatched_sell_quantity?: number;
  /**
   * Position-level lifecycle. A sale-sized financial allocation can be realized
   * while the underlying acquisition position remains open.
   */
  position_lifecycle?: import('./financial').PositionLifecycleStatus;
  /** Remaining quantity of the economic position immediately after this disposal. */
  position_remaining_quantity?: number;
  /** True only when the underlying position reached zero remaining quantity. */
  is_position_closed?: boolean;
  character_id?: number;
  character_name?: string;
  buy_character_id?: number;
  buy_character_name?: string;
  sell_character_id?: number;
  sell_character_name?: string;
  is_cross_character?: boolean;
  cross_character_hint?: string;
}

/**
 * Phase 3 — Multi-Character Performance & Fleet Financial Contracts
 */
export type PerformanceScope =
  | {
      type: 'active_character';
    }
  | {
      type: 'character';
      characterId: string;
    }
  | {
      type: 'fleet';
    };

export interface CharacterFinancialResult {
  characterId: string;
  characterName: string;
  metrics?: TraderPerformanceMetrics;
  dataHealth: 'fresh' | 'stale' | 'unavailable';
  errorMessage?: string;
}

export type FleetFinancialStatus = 'complete' | 'partial' | 'empty';

export interface FleetFinancialResult {
  readonly scope: PerformanceScope;
  readonly fleetMetrics: TraderPerformanceMetrics;
  readonly characterResults: readonly CharacterFinancialResult[];
  readonly status: FleetFinancialStatus;
  readonly hasUnavailableCharacters: boolean;
  readonly unavailableCharacterNames: readonly string[];
  readonly participatingCharacterCount: number;
  readonly totalCharacterCount: number;
}

export interface TraderPerformanceMetrics {
  character_id: number;
  character_name: string;
  last_calculated: string;
  total_realized_profit: number; // in ISK
  total_buy_volume: number; // in ISK
  total_sell_volume: number; // in ISK
  total_turnover: number; // in ISK
  /**
   * Fulfilled market-order activity observed from order history.
   * This is market/order evidence only and never an accounting buy/sell direction.
   */
  observed_fulfilled_order_activity_isk?: number;
  total_closed_trades: number;
  profitable_trades: number;
  unprofitable_trades: number;
  /** Null when no position has been fully closed in the current financial observation set. */
  win_rate_pct: number | null; // 0 - 100 when a closed-position sample exists
  /** Null when no fully closed position provides a valid acquisition-cost denominator. */
  average_realized_roi: number | null; // Disposal-closing ROI; denominator = allocated acquisition cost
  average_realized_roi_scope: 'CLOSING_DISPOSAL_ALLOCATIONS';
  average_hold_days: number;
  /** Position/whole-operation progress; never a substitute for realized P&L. */
  capital_recovery?: CapitalRecoverySummary;
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
    profit_label?: string;
    is_net_estimated?: boolean;
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
    profit_label?: string;
    is_net_estimated?: boolean;
  }>;
  trader_title: string;
  trader_badge_color: string;
  calibration_weight: number;
  // Financial truth & completeness metrics (Chantier 3B-4A.2)
  financial_completeness?: FinancialCompleteness;
  is_net_estimated?: boolean;
  realized_profit_label?: string;
  execution_fee_mode?: ExecutionFeeRoleMode;
  total_realized_gross?: number;
  total_estimated_fees?: number;
  has_unmatched_trades?: boolean;
  unmatched_trades_count?: number;
}

export type OrderAdvisorAction = 'keep' | 'lower_price' | 'cancel' | 'relocate';

export interface OrderAdvisorRecommendation {
  order_id: OrderId;
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
