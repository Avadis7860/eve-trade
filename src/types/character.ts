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