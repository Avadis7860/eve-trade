export type TypeResolutionStatus = 'RESOLVED_CATALOG' | 'RESOLVED_DYNAMIC' | 'RESOLVED_ESI' | 'TYPE_UNKNOWN';

export interface EveTypeDetail {
  type_id: number;
  group_id: number;
  group_name?: string;
  category_id: number;
  category_name?: string;
  market_group_id?: number;
  name: string;
  volume: number; // in m³
  packaged_volume?: number;
  base_price?: number;
  portion_size?: number;
  description?: string;
  average_price?: number;
  adjusted_price?: number;
}

export interface TypeResolutionResult {
  status: TypeResolutionStatus;
  type?: EveTypeDetail;
  type_id: number;
  name: string;
  volume: number;
  group_id: number;
  category_id: number;
  source: 'catalog_ready' | 'fallback_core' | 'custom_type' | 'esi_lookup' | 'none';
  catalog_version: string;
  catalog_checksum: string;
  is_verified: boolean;
  confidence: number;
  error?: string;
}

export type LocationResolutionStatus =
  | 'RESOLVED_HUB'
  | 'RESOLVED_STATION'
  | 'RESOLVED_STRUCTURE'
  | 'RESOLVED_ESI'
  | 'LOCATION_FALLBACK'
  | 'LOCATION_UNKNOWN';

export interface LocationResolutionResult {
  status: LocationResolutionStatus;
  location_id: number;
  name: string;
  system_id?: number;
  system_name?: string;
  region_id?: number;
  region_name?: string;
  security_status?: number;
  is_structure: boolean;
  is_hub: boolean;
  hub_id?: string;
  source: 'hub' | 'static_npc' | 'structure_cache' | 'esi_resolved' | 'fallback';
  is_verified: boolean;
  confidence: number;
  error?: string;
}

export type SystemResolutionStatus = 'RESOLVED_SYSTEM' | 'SYSTEM_UNKNOWN';

export interface SystemResolutionResult {
  status: SystemResolutionStatus;
  system_id: number;
  name: string;
  region_id?: number;
  region_name?: string;
  security_status?: number;
  is_verified: boolean;
  confidence: number;
  source: 'static_universe' | 'hub' | 'inferred' | 'fallback';
  error?: string;
}

export type RegionResolutionStatus = 'RESOLVED_REGION' | 'REGION_UNKNOWN';

export interface RegionResolutionResult {
  status: RegionResolutionStatus;
  region_id: number;
  name: string;
  is_verified: boolean;
  confidence: number;
  source: 'static_universe' | 'hub' | 'fallback';
  error?: string;
}

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
  chokepoints?: string[];
  gank_risk_level?: 'safe' | 'caution' | 'dangerous';
}

export interface EveType {
  type_id: number;
  name: string;
  volume?: number;
  group_id?: number;
  category_id?: number;
  published?: boolean;
}

export interface EveRegionInfo {
  region_id: number;
  name: string;
  description?: string;
  faction?: string;
  is_highsec?: boolean;
}
