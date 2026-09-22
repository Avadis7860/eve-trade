import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { MAJOR_MARKET_HUBS } from '../../data/universe';
import { InterRegionalCalculationEngine, CertifiedInterRegionalInputs } from '../interRegionalCalculation';
import { FinancialConfig, RawMarketOrder } from '../../types';
import { readFileSync } from 'node:fs';

function assert(condition:boolean,message:string){if(!condition)throw new Error(`[InterRegionalPurityTest] ${message}`)}
function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v)) as T}

const catalog=CatalogRepository.getInstance(), universe=UniverseRepository.getInstance();
assert(catalog.isReady(),'canonical catalog must be ready');
assert(universe.getIntegrity().isReady,'canonical universe must be ready');

const item=catalog.resolveType(34);
const source=MAJOR_MARKET_HUBS.find(h=>h.id==='jita')!;
const dest=MAJOR_MARKET_HUBS.find(h=>h.id==='amarr')!;
const sourceLocation=universe.resolveCanonicalLocationSync(source.station_id);
const destinationLocation=universe.resolveCanonicalLocationSync(dest.station_id);
const route=universe.getRoute(source.system_id,dest.system_id);

const order=(id:number,region:number,system:number,location:number,price:number,isBuy:boolean):RawMarketOrder=>({
  order_id:id,type_id:34,region_id:region,system_id:system,location_id:location,price,volume_remain:1000,volume_total:1000,
  is_buy_order:isBuy,order_range:'station',issued:'2026-01-01T00:00:00Z',duration:90,min_volume:1
});
const buyOrders=[order(1,source.region_id,source.system_id,source.station_id,10,false)];
const sellOrders=[order(2,dest.region_id,dest.system_id,dest.station_id,20,true)];
const config:FinancialConfig={
  available_capital:1_000_000,broker_fee:.015,sales_tax:.036,enable_transport_costs:false,
  transport_cost_per_m3:0,transport_cost_per_jump:0,max_cargo_m3:50000,min_roi:.01,min_net_profit:1,
  max_days_to_sell:10,max_capital_per_trade:1_000_000,max_portfolio_concentration_type:.35,max_portfolio_concentration_group:.5,
  accounting_level:5,broker_relations_level:5
};
const valid:CertifiedInterRegionalInputs={
  item:item.type!,typeResolution:item,sourceLocation,destinationLocation,route,
  buyHub:source,sellHub:dest,strategy:'immediate',config,buyRegionOrders:buyOrders,sellRegionOrders:sellOrders,
  historyStatsByRegion:{[source.region_id]:{daily_volume_7d_median:1000,daily_volume_30d_median:1000,price_volatility:.01},[dest.region_id]:{daily_volume_7d_median:1000,daily_volume_30d_median:1000,price_volatility:.01}},
  qualitiesByRegion:{},jitaOrders:[],routeBySystemId:{}
};
const a=InterRegionalCalculationEngine.calculate(valid);
const b=InterRegionalCalculationEngine.calculate(clone(valid));
assert(a!==null&&b!==null,'valid certified inputs must calculate');
assert(JSON.stringify(a)===JSON.stringify(b),'identical certified inputs must be deterministic');

CatalogRepository.resetInstance();
UniverseRepository.resetInstance();
const c=InterRegionalCalculationEngine.calculate(valid);
assert(JSON.stringify(a)===JSON.stringify(c),'repository changes after certification must not affect core output');

assert(InterRegionalCalculationEngine.calculate({...valid,typeResolution:{...valid.typeResolution,status:'TYPE_UNKNOWN',is_verified:false,type:undefined}})===null,'unknown catalog must be rejected');
assert(InterRegionalCalculationEngine.calculate({...valid,sourceLocation:{...valid.sourceLocation,status:'LOCATION_UNKNOWN',is_verified:false}})===null,'unknown location must be rejected');
assert(InterRegionalCalculationEngine.calculate({...valid,route:{...valid.route,status:'UNKNOWN',is_verified:false}})===null,'unknown route must be rejected');

const legacyRoute = {
  ...valid.route,
  source: 'static_route_table' as const,
};
assert(
  InterRegionalCalculationEngine.calculate({...valid,route:legacyRoute})===null,
  'legacy static route provenance must never reach the financial core',
);

const nonHighsecRoute = {
  ...valid.route,
  is_highsec_only: false,
};
assert(
  InterRegionalCalculationEngine.calculate({...valid,route:nonHighsecRoute})===null,
  'non-Highsec route must never reach the Highsec trade financial core',
);

assert(InterRegionalCalculationEngine.calculate({...valid,destinationLocation:{...valid.destinationLocation,status:'RESOLVED_STRUCTURE',is_structure:true}})===null,'dynamic/structure location must be rejected');

const coreSource=readFileSync(new URL('../interRegionalCalculation.ts',import.meta.url),'utf8');
assert(!coreSource.includes('CatalogRepository'),'core must not import CatalogRepository');
assert(!coreSource.includes('UniverseRepository'),'core must not import UniverseRepository');
assert(!coreSource.includes('Date.now()')&&!coreSource.includes('new Date('),'core must not depend on wall-clock time');

console.log('InterRegional purity contracts passed.');
