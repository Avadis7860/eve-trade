import { InterRegionalFinancialEngine } from '../engine/interRegional';
import { TradingFleetEngine } from '../engine/fleet';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  InterRegionalOpportunity,
  RawMarketOrder,
  HistoricalStats,
  MarketDataQuality,
  EveCharacterSession,
} from '../types';

export class InterRegionalScanner {
  /**
   * Evaluates all directed pairs (Hub A -> Hub B)
   * for a given EveTypeDetail and TradeStrategy.
   * Delegates single-trade calculation entirely to InterRegionalFinancialEngine.
   */
  static scanItemAcrossHubs(
    item: EveTypeDetail,
    hubs: MarketHub[],
    strategy: TradeStrategy,
    config: FinancialConfig,
    orderBooks: Record<number, RawMarketOrder[]>,
    historyStats?: Record<number, HistoricalStats>,
    qualities?: Record<number, MarketDataQuality>,
    characters?: EveCharacterSession[]
  ): InterRegionalOpportunity[] {
    const opportunities: InterRegionalOpportunity[] = [];
    const activeHubs = hubs.filter((h) => h.active);
    const jitaOrders = orderBooks[10000002] || [];
    const historyMap = historyStats || {};
    const qualityMap = qualities || {};

    // Analyze every directed combination: fromHub !== toHub
    for (let i = 0; i < activeHubs.length; i++) {
      for (let j = 0; j < activeHubs.length; j++) {
        if (i === j) continue;
        const buyHub = activeHubs[i];
        const sellHub = activeHubs[j];

        const buyRegionOrders = orderBooks[buyHub.region_id] || [];
        const sellRegionOrders = orderBooks[sellHub.region_id] || [];

        const opp = InterRegionalFinancialEngine.calculateOpportunity(
          item,
          buyHub,
          sellHub,
          strategy,
          config,
          buyRegionOrders,
          sellRegionOrders,
          historyMap,
          qualityMap,
          jitaOrders
        );

        if (opp) {
          if (characters && characters.length > 0) {
            opp.fleet_plan = TradingFleetEngine.resolveFleetPlan(opp, characters, config);
          }
          opportunities.push(opp);
        }
      }
    }

    return opportunities;
  }

  /**
   * Scans an entire list of types across all active hubs.
   */
  static scanCatalog(
    items: EveTypeDetail[],
    hubs: MarketHub[],
    strategy: TradeStrategy,
    config: FinancialConfig,
    orderBooks: Record<number, RawMarketOrder[]>,
    historyStats?: Record<number, HistoricalStats>,
    qualities?: Record<number, MarketDataQuality>,
    characters?: EveCharacterSession[]
  ): InterRegionalOpportunity[] {
    const all: InterRegionalOpportunity[] = [];
    for (const item of items) {
      const opps = this.scanItemAcrossHubs(item, hubs, strategy, config, orderBooks, historyStats, qualities, characters);
      all.push(...opps);
    }
    return all.sort((a, b) => b.scores.overall_score - a.scores.overall_score);
  }
}
