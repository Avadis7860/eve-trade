
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
  /** Null when the net result is unavailable; gross_profit remains separately observable. */
  net_profit: number | null;
  roi: number | null; // null when the ROI denominator is unavailable
  hold_days: number;
  /** Null when profitability cannot be determined from available financial evidence. */
  is_profitable: boolean | null;
  buy_location?: string;
  sell_location?: string;
  financial_completeness?: FinancialCompleteness;
  /**
   * Source lineage coverage is independent from fee/configuration completeness.
   * MARKET_TRACEABLE means the economic cost lineage is fully attributable to
   * known market acquisition lots; it does not imply that fees are observed.
   */
  source_coverage?: import('./financial').FinancialSourceCoverage;
  is_net_estimated?: boolean;
  realized_profit_label?: string;
  fees_breakdown?: RealizedFeeBreakdown;
  unmatched_sell_quantity?: number;
  /**
   * Position-level lifecycle. A sale-sized financial allocation can be realized
   * while the underlying acquisition position remains open.
   */
  position_lifecycle?: import('./financial').PositionLifecycleStatus;
  /** Cycle-level realized result scope: only the quantity allocated by this disposal. */
  realized_result_scope?: 'DISPOSAL_ALLOCATION';
  /** Whole-position result, available only once the economic position is closed and reconciled. */
  position_net_profit?: number;
  /** Total quantity acquired in the closed economic position segment. */
  position_total_quantity?: number;
  /** Whole-position ROI, unavailable until the position closes with a valid acquisition-cost basis. */
  position_roi?: number | null;
  /** Whole-position profitability, distinct from the disposal result. */
  position_is_profitable?: boolean;
  /** Whole-position weighted hold duration, available on a reconciled closure. */
  position_hold_days?: number;
  /** Remaining quantity of the economic position immediately after this disposal. */
  position_remaining_quantity?: number;
  operation_id?: string;
  operation_capital_committed?: number;
  operation_cash_recovered?: number;
  operation_recovery_delta?: number;
  operation_recovery_ratio?: number | null;
  operation_recovery_state?: EconomicOperationRecoveryState;
  operation_quantity_acquired?: number;
  /** True only when the underlying position reached zero remaining quantity. */
  is_position_closed?: boolean;
  character_id?: number;
  character_name?: string;}

export interface TraderPerformanceMetrics {
  character_id: number;
  character_name: string;
  last_calculated: string;
  /** Net result summed across realized disposal allocations, including partial positions. */
  /** Null when at least one included financial result cannot be evidenced as net. */
  total_realized_profit: number | null; // in ISK
  /** Explicit economic scope of total_realized_profit. */
  realized_profit_scope?: 'DISPOSAL_ALLOCATIONS';
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
  /** ROI sample is based on whole positions that reached closure. */
  average_realized_roi_scope: 'CLOSED_POSITIONS';
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