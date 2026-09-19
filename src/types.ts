export interface MarketHub {
  name: string;
  region: string;
  region_id: number;
  solar_system: string;
  system_id: number;
  station: string | null;
  station_id: number | null;
  priority: number;
  hub_type: string;
}

export interface EveType {
  type_id: number;
  name: string;
  group_id?: number;
  category_id?: number;
  volume?: number;
  published?: boolean;
}

export interface PriceLevel {
  price: number;
  volume: number;
  orders: number;
  cumulative: number;
}

export interface Fill {
  filled_quantity: number;
  effective_price: number;
  levels_used: number;
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

export interface FeeBreakdown {
  purchase_cost: number;
  broker_fee: number;
  broker_cost: number;
  gross_revenue: number;
  sales_tax: number;
  sales_tax_cost: number;
  total_cost: number;
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
  captured_at: string;
}

export interface Opportunity {
  type_id: number;
  type_name?: string;
  buy_region_id: number;
  buy_region_name?: string;
  sell_region_id: number;
  sell_region_name?: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  net_profit: number;
  roi: number;
  margin: number;
  capital_required: number;
  computed_at: string;
}

export interface TableCounts {
  market_orders: number;
  types: number;
  solar_systems: number;
  esi_cache: number;
  regions: number;
  stations: number;
  opportunities: number;
}

export interface SyncInfo {
  region_id: number;
  type_id: number;
  side: string;
  captured_at: string;
  expires_at: string;
}

export interface AppSettings {
  default_hub: string;
  available_capital: number;
  broker_fee: number;
  sales_tax: number;
}
