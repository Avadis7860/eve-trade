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
}

export type TradeStrategy = 'immediate' | 'relist';

export interface FinancialConfig {
  available_capital: number;
  broker_fee: number;      // e.g. 0.0145 (1.45%)
  sales_tax: number;       // e.g. 0.035 (3.5%)
  enable_transport_costs: boolean; // Explicit toggle: true or false (default false if user wants 0 ISK transport)
  transport_cost_per_m3: number; // ISK per m³ (can be 0)
  transport_cost_per_jump: number; // ISK per jump (can be 0)
  collateral_fee_pct?: number; // Collateral percentage (e.g. 0.01 = 1%)
  max_cargo_m3: number;    // Cargo capacity in m³ (e.g. 5000 for transport, 60000 for DST)
  min_roi: number;         // Minimum ROI (e.g. 0.02)
  min_net_profit: number;  // Minimum ISK profit
  max_days_to_sell: number;
  max_capital_per_trade: number;
  max_portfolio_concentration_type: number; // e.g. 0.35 (max 35% in one type)
  max_portfolio_concentration_group: number; // e.g. 0.50 (max 50% in one group)
  
  // EVE Character Skill & Standing simulation parameters
  accounting_level?: number;        // 0 to 5
  broker_relations_level?: number;  // 0 to 5
  faction_standing?: number;        // -10.0 to 10.0
  corp_standing?: number;           // -10.0 to 10.0
  custom_broker_fee_pct?: number;   // Override broker fee (e.g. 1.0% in Citadel)
  use_custom_fees?: boolean;
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
  daily_volume_7d_avg: number;
  daily_volume_7d_median: number;
  daily_volume_30d_avg: number;
  daily_volume_30d_median: number;
  daily_order_count_avg: number;
  price_median_30d: number;
  price_volatility: number;
  volume_trend: 'increasing' | 'stable' | 'decreasing';
}

export interface PriceLevel {
  price: number;
  volume: number;
  orders: number;
  cumulative: number;
}

export interface ExecutionFill {
  requested_quantity: number;
  filled_quantity: number;
  effective_price: number;
  total_cost_or_revenue: number;
  slippage_pct: number;
  levels_exhausted: number;
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

export interface EveCharacterSession {
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
  is_active?: boolean;
  is_token_expired?: boolean;
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


