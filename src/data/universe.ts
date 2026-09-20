import { MarketHub, JumpRoute, MarketCategory, MarketGroup, EveTypeDetail } from '../types';

export const MAJOR_MARKET_HUBS: MarketHub[] = [
  {
    id: 'jita',
    name: 'Jita (The Forge)',
    region: 'The Forge',
    region_id: 10000002,
    solar_system: 'Jita',
    system_id: 30000142,
    station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    station_id: 60003760,
    security_status: 0.95,
    priority: 1,
    active: true,
    hub_type: 'npc_major',
  },
  {
    id: 'amarr',
    name: 'Amarr (Domain)',
    region: 'Domain',
    region_id: 10000043,
    solar_system: 'Amarr',
    system_id: 30002187,
    station: 'Amarr VIII (Oris) - Emperor Family Academy',
    station_id: 60008494,
    security_status: 1.0,
    priority: 2,
    active: true,
    hub_type: 'npc_major',
  },
  {
    id: 'dodixie',
    name: 'Dodixie (Sinq Laison)',
    region: 'Sinq Laison',
    region_id: 10000032,
    solar_system: 'Dodixie',
    system_id: 30002659,
    station: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
    station_id: 60011866,
    security_status: 0.86,
    priority: 3,
    active: true,
    hub_type: 'npc_major',
  },
  {
    id: 'rens',
    name: 'Rens (Heimatar)',
    region: 'Heimatar',
    region_id: 10000030,
    solar_system: 'Rens',
    system_id: 30002510,
    station: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
    station_id: 60004588,
    security_status: 0.88,
    priority: 4,
    active: true,
    hub_type: 'npc_major',
  },
  {
    id: 'hek',
    name: 'Hek (Metropolis)',
    region: 'Metropolis',
    region_id: 10000042,
    solar_system: 'Hek',
    system_id: 30002053,
    station: 'Hek VIII - Moon 12 - Boundless Creation Factory',
    station_id: 60005686,
    security_status: 0.55,
    priority: 5,
    active: true,
    hub_type: 'npc_minor',
  },
];

export const KNOWN_STATION_NAMES: Record<number, string> = {
  60003760: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  60003761: 'Jita IV - Moon 5 - Caldari Business Tribunal',
  60008494: 'Amarr VIII (Oris) - Emperor Family Academy',
  60011866: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant',
  60004588: 'Rens VI - Moon 8 - Brutor Tribe Treasury',
  60005686: 'Hek VIII - Moon 12 - Boundless Creation Factory',
  60011728: 'Perimeter - Internal Security Testing Ground',
  60001858: 'Oursulaert III - Federal Freight Storage',
  60001861: 'Villore VI - Federal Administration Bureau',
  60009514: 'Stacmon V - Federation Navy Logistic Support',
};

const KNOWN_ROUTES: Record<string, JumpRoute> = {
  '30000142-30002187': { from_system_id: 30000142, to_system_id: 30002187, jumps: 9, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama', 'Niabiken'], gank_risk_level: 'caution' },
  '30002187-30000142': { from_system_id: 30002187, to_system_id: 30000142, jumps: 9, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama', 'Niabiken'], gank_risk_level: 'caution' },
  '30000142-30002659': { from_system_id: 30000142, to_system_id: 30002659, jumps: 15, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30002659-30000142': { from_system_id: 30002659, to_system_id: 30000142, jumps: 15, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30000142-30002510': { from_system_id: 30000142, to_system_id: 30002510, jumps: 25, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30002510-30000142': { from_system_id: 30002510, to_system_id: 30000142, jumps: 25, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30000142-30002053': { from_system_id: 30000142, to_system_id: 30002053, jumps: 17, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30002053-30000142': { from_system_id: 30002053, to_system_id: 30000142, jumps: 17, min_security: 0.5, is_highsec_only: true, chokepoints: ['Uedama'], gank_risk_level: 'caution' },
  '30002187-30002659': { from_system_id: 30002187, to_system_id: 30002659, jumps: 18, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002659-30002187': { from_system_id: 30002659, to_system_id: 30002187, jumps: 18, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002187-30002510': { from_system_id: 30002187, to_system_id: 30002510, jumps: 16, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002510-30002187': { from_system_id: 30002510, to_system_id: 30002187, jumps: 16, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002187-30002053': { from_system_id: 30002187, to_system_id: 30002053, jumps: 18, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002053-30002187': { from_system_id: 30002053, to_system_id: 30002187, jumps: 18, min_security: 0.6, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002659-30002510': { from_system_id: 30002659, to_system_id: 30002510, jumps: 27, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002510-30002659': { from_system_id: 30002510, to_system_id: 30002659, jumps: 27, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002659-30002053': { from_system_id: 30002659, to_system_id: 30002053, jumps: 20, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002053-30002659': { from_system_id: 30002053, to_system_id: 30002659, jumps: 20, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002510-30002053': { from_system_id: 30002510, to_system_id: 30002053, jumps: 9, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
  '30002053-30002510': { from_system_id: 30002053, to_system_id: 30002510, jumps: 9, min_security: 0.5, is_highsec_only: true, gank_risk_level: 'safe' },
};

export function getJumpRoute(fromSystemId: number, toSystemId: number): JumpRoute {
  if (fromSystemId === toSystemId) {
    return {
      from_system_id: fromSystemId,
      to_system_id: toSystemId,
      jumps: 0,
      min_security: 1.0,
      is_highsec_only: true,
      gank_risk_level: 'safe',
    };
  }

  const key = `${fromSystemId}-${toSystemId}`;
  if (KNOWN_ROUTES[key]) {
    return KNOWN_ROUTES[key];
  }

  // Deterministic fallback route
  const hash = Math.abs(fromSystemId * 31 + toSystemId);
  const jumps = (hash % 16) + 4;
  return {
    from_system_id: fromSystemId,
    to_system_id: toSystemId,
    jumps,
    min_security: 0.6,
    is_highsec_only: true,
    gank_risk_level: 'safe',
  };
}

import rawCategories from './categories.json';
import rawGroups from './groups.json';
import rawAllMarketTypes from './allMarketTypes.json';

const categoryIcons: Record<number, string> = {
  4: '💎', // Material & Minerals
  6: '🚀', // Ships
  7: '🛡️', // Ship Modules
  8: '💥', // Ammunition & Charges
  9: '📜', // Blueprints
  11: '⚡', // Entity
  16: '🧠', // Skills
  17: '📦', // Commodities & PLEX
  18: '🤖', // Drones
  20: '💉', // Implants & Boosters
  22: '📡', // Deployables
  23: '🏗️', // Starbase / Structures
  24: '🧪', // Reactions
  25: '🪨', // Asteroids & Ores
  29: '🔮', // Abstract
  30: '👔', // Apparel
  32: '⚙️', // Subsystems
  34: '🏺', // Ancient Relics
  35: '🧭', // Decryptors
  40: '🏛️', // Sovereign Structures
  41: '🪐', // Planetary Commodities
  42: '🏭', // Planetary Customs
  43: '🌿', // Planetary Resources
  63: '🎖️', // Special Edition Assets
  65: '🛰️', // Structures & Citadels
  66: '🔧', // Structure Rigs
  87: '🛸', // Fighters
  91: '🎨', // SKINs
  2118: '🛠️', // Structure Modules
};

const usedCategoryIds = new Set(rawAllMarketTypes.map((t: any) => t.category_id));
const usedGroupIds = new Set(rawAllMarketTypes.map((t: any) => t.group_id));

export const EVE_CATEGORIES: MarketCategory[] = Object.values(rawCategories as Record<string, any>)
  .filter((c: any) => usedCategoryIds.has(c.category_id))
  .map((c: any) => ({
    category_id: c.category_id,
    name: c.name,
    icon: categoryIcons[c.category_id] || '📦',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const EVE_GROUPS: MarketGroup[] = Object.values(rawGroups as Record<string, any>)
  .filter((g: any) => usedGroupIds.has(g.group_id))
  .map((g: any) => ({
    group_id: g.group_id,
    category_id: g.category_id,
    name: g.name,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Verified core catalog referenced directly from canonical data asset.
 * This guarantees a Single Source of Truth (SSOT) and prevents drift.
 */
export const EVE_TYPES_CATALOG: EveTypeDetail[] = rawAllMarketTypes as EveTypeDetail[];

