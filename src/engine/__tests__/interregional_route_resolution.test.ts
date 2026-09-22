import assert from 'node:assert/strict';
import { InterRegionalResolver } from '../../services/interRegionalResolver';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { MAJOR_MARKET_HUBS } from '../../data/universe';

const catalog = CatalogRepository.getInstance();
const universe = UniverseRepository.getInstance();
const item = catalog.resolveType(34).type;
assert(item, 'canonical test item must resolve');

const jita = MAJOR_MARKET_HUBS.find((hub) => hub.id === 'jita')!;
const amarr = MAJOR_MARKET_HUBS.find((hub) => hub.id === 'amarr')!;

const destinationBuyOrder = {
  order_id: 880001,
  type_id: item.type_id,
  region_id: amarr.region_id,
  system_id: jita.system_id,
  location_id: 60003761,
  price: 20,
  volume_remain: 1000,
  volume_total: 1000,
  is_buy_order: true,
  order_range: '9',
  min_volume: 1,
  issued: '2026-09-22T00:00:00Z',
  duration: 90,
};

const resolved = InterRegionalResolver.resolve(
  item,
  jita,
  amarr,
  'immediate',
  {
    available_capital: 1_000_000,
    broker_fee: 0.0145,
    sales_tax: 0.035,
    enable_transport_costs: false,
    transport_cost_per_m3: 0,
    transport_cost_per_jump: 0,
    max_cargo_m3: 50_000,
    min_roi: 0.01,
    min_net_profit: 1,
    max_days_to_sell: 14,
    max_capital_per_trade: 1_000_000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.5,
  },
  [],
  [destinationBuyOrder],
);

assert(resolved, 'Jita -> Amarr must resolve through canonical graph certification');
assert.equal(resolved.route.source, 'canonical_graph');
assert.equal(resolved.route.is_highsec_only, true);
assert.equal(resolved.route.jumps, 9);
assert.equal(resolved.route.provenance?.source, 'sde_canonical');
assert.equal(resolved.routeBySystemId[jita.system_id]?.source, 'canonical_graph');
assert.equal(resolved.routeBySystemId[jita.system_id]?.jumps, 9);

const filteredAtNine = resolved.sellRegionOrders.filter(() => true);
assert.equal(filteredAtNine.length, 1);

const tooShortRange = { ...destinationBuyOrder, order_id: 880002, order_range: '8' };
const resolvedTooShort = InterRegionalResolver.resolve(
  item,
  jita,
  amarr,
  'immediate',
  {
    available_capital: 1_000_000, broker_fee: 0.0145, sales_tax: 0.035, enable_transport_costs: false,
    transport_cost_per_m3: 0, transport_cost_per_jump: 0, max_cargo_m3: 50_000, min_roi: 0.01,
    min_net_profit: 1, max_days_to_sell: 14, max_capital_per_trade: 1_000_000,
    max_portfolio_concentration_type: 0.35, max_portfolio_concentration_group: 0.5,
  },
  [],
  [tooShortRange],
);
assert(resolvedTooShort, 'resolver must still certify the main trade route');
assert.equal(resolvedTooShort.routeBySystemId[jita.system_id]?.jumps, 9);
assert.equal(resolvedTooShort.routeBySystemId[jita.system_id]?.status, 'KNOWN');

console.log('interregional_route_resolution.test.ts: OK');