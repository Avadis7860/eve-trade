import { EveTypeDetail, MarketHub, TradeStrategy, FinancialConfig, RawMarketOrder, HistoricalStats, MarketDataQuality, JumpRoute } from '../types';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { CertifiedInterRegionalInputs } from '../engine/interRegionalCalculation';

export class InterRegionalResolver {
  static resolve(
    item:EveTypeDetail,buyHub:MarketHub,sellHub:MarketHub,strategy:TradeStrategy,config:FinancialConfig,
    buyRegionOrders:RawMarketOrder[]=[],sellRegionOrders:RawMarketOrder[]=[],
    historyStatsByRegion:Record<number,HistoricalStats>={},qualitiesByRegion:Record<number,MarketDataQuality>={},
    jitaOrders:RawMarketOrder[]=[]
  ):CertifiedInterRegionalInputs|null {
    if(buyHub.id===sellHub.id)return null;
    const catalog=CatalogRepository.getInstance();
    const typeResolution=catalog.resolveType(item.type_id);
    if(!catalog.isReady()||typeResolution.status!=='RESOLVED_CATALOG'||typeResolution.is_verified!==true||!typeResolution.type)return null;
    const universe=UniverseRepository.getInstance();
    const sourceLocation=universe.resolveCanonicalLocationSync(buyHub.station_id);
    const destinationLocation=universe.resolveCanonicalLocationSync(sellHub.station_id);
    if(sourceLocation.status==='LOCATION_UNKNOWN'||destinationLocation.status==='LOCATION_UNKNOWN'||
      sourceLocation.is_verified!==true||destinationLocation.is_verified!==true||
      sourceLocation.is_structure===true||destinationLocation.is_structure===true||
      sourceLocation.system_id!==buyHub.system_id||destinationLocation.system_id!==sellHub.system_id||
      sourceLocation.region_id!==buyHub.region_id||destinationLocation.region_id!==sellHub.region_id)return null;
    const route=universe.getRoute(sourceLocation.system_id!,destinationLocation.system_id!);
    if(route.status!=='KNOWN'||route.is_verified!==true||!Number.isFinite(route.jumps)||route.jumps<0)return null;
    const routeBySystemId:Record<number,JumpRoute>={};
    const systems=new Set<number>();
    for(const order of sellRegionOrders)if(order.is_buy_order&&order.system_id>0)systems.add(order.system_id);
    for(const systemId of systems)routeBySystemId[systemId]=universe.getRoute(systemId,destinationLocation.system_id!);
    return {item:typeResolution.type,typeResolution,sourceLocation,destinationLocation,route,buyHub,sellHub,strategy,config,buyRegionOrders,sellRegionOrders,historyStatsByRegion,qualitiesByRegion,jitaOrders,routeBySystemId};
  }
}
