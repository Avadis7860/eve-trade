import { useMemo } from 'react';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  RawMarketOrder,
  HistoricalStats,
  InterRegionalOpportunity,
} from '../types';
import { InterRegionalScanner } from '../services/scanner';
import { PortfolioOptimizer } from '../engine/portfolio';
import { MarketDataStore } from '../services/marketDataStore';

export function useTradingOpportunities(
  selectedType: EveTypeDetail,
  hubs: MarketHub[],
  strategy: TradeStrategy,
  config: FinancialConfig,
  orderBooks: Record<number, RawMarketOrder[]>,
  historyCache: Record<number, HistoricalStats>,
  highSecOnly: boolean,
  filterRoute: string,
  sortBy: 'score' | 'profit' | 'roi' | 'profit_day' | 'turnover'
) {
  const opportunities = useMemo(() => {
    const qualities = MarketDataStore.getQualitiesForType(selectedType.type_id, hubs);
    return InterRegionalScanner.scanItemAcrossHubs(
      selectedType,
      hubs,
      strategy,
      config,
      orderBooks,
      historyCache,
      qualities
    );
  }, [selectedType, hubs, strategy, config, orderBooks, historyCache]);

  const sortedOpportunities = useMemo(() => {
    return opportunities
      .filter((opp: InterRegionalOpportunity) => {
        if (highSecOnly && !opp.route.is_highsec_only) return false;
        if (filterRoute !== 'all') {
          const rKey = `${opp.buy_hub.id}_${opp.sell_hub.id}`;
          if (rKey !== filterRoute) return false;
        }
        return true;
      })
      .sort((a: InterRegionalOpportunity, b: InterRegionalOpportunity) => {
        if (sortBy === 'score') return b.scores.overall_score - a.scores.overall_score;
        if (sortBy === 'profit') return b.costs.net_profit - a.costs.net_profit;
        if (sortBy === 'roi') return b.costs.roi - a.costs.roi;
        if (sortBy === 'profit_day') return b.profit_per_day - a.profit_per_day;
        if (sortBy === 'turnover') return a.expected_days_to_sell - b.expected_days_to_sell;
        return 0;
      });
  }, [opportunities, sortBy, filterRoute, highSecOnly]);

  const portfolioSimulation = useMemo(() => {
    return PortfolioOptimizer.optimize(opportunities, config);
  }, [opportunities, config]);

  return {
    opportunities,
    sortedOpportunities,
    portfolioSimulation,
  };
}
