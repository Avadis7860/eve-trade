import { useEffect, useMemo, useState } from 'react';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  RawMarketOrder,
  HistoricalStats,
  InterRegionalOpportunity,
  EveCharacterSession,
  EveCharacterOrder,
} from '../types';
import { InterRegionalScanner } from '../services/scanner';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import { MarketDataStore } from '../services/marketDataStore';
import { buildPortfolioSnapshots, buildProposedAllocationSnapshot } from '../engine/portfolioAggregation';
import type { PortfolioSimulation } from '../types';

export function useTradingOpportunities(
  selectedType: EveTypeDetail,
  hubs: MarketHub[],
  strategy: TradeStrategy,
  config: FinancialConfig,
  orderBooks: Record<number, RawMarketOrder[]>,
  historyCache: Record<number, HistoricalStats>,
  highSecOnly: boolean,
  filterRoute: string,
  sortBy: 'score' | 'profit' | 'roi' | 'profit_day' | 'turnover',
  characters?: EveCharacterSession[],
  portfolioOrders?: EveCharacterOrder[],
) {
  const [universeOpportunities, setUniverseOpportunities] = useState(
    () => GlobalMarketSyncService.getUniverseOpportunities(),
  );
  const [globalSyncProgress, setGlobalSyncProgress] = useState(
    () => GlobalMarketSyncService.getProgress(),
  );

  useEffect(() => {
    const unsubscribeOpportunities = GlobalMarketSyncService.subscribeOpportunities(
      (next) => setUniverseOpportunities(next),
    );
    const unsubscribeProgress = GlobalMarketSyncService.subscribe(
      (progress) => setGlobalSyncProgress(progress),
    );

    return () => {
      unsubscribeOpportunities();
      unsubscribeProgress();
    };
  }, []);

  const opportunities = useMemo(() => {
    const qualities = MarketDataStore.getQualitiesForType(selectedType.type_id, hubs);
    return InterRegionalScanner.scanItemAcrossHubs(
      selectedType,
      hubs,
      strategy,
      config,
      orderBooks,
      historyCache,
      qualities,
      characters,
    );
  }, [selectedType, hubs, strategy, config, orderBooks, historyCache, characters]);

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

  const activeCharacterId =
    characters?.find((character) => character.is_active)?.character_id ?? null;

  const portfolioSnapshots = useMemo(() => {
    return buildPortfolioSnapshots({
      config,
      characters,
      active_character_id: activeCharacterId,
      orders: portfolioOrders,
      universe: universeOpportunities,
      global_sync_progress: globalSyncProgress,
    });
  }, [
    config,
    characters,
    activeCharacterId,
    portfolioOrders,
    universeOpportunities,
    globalSyncProgress,
  ]);

  const [lastReliableSimulation, setLastReliableSimulation] = useState<PortfolioSimulation | null>(null);

  useEffect(() => {
    if (!portfolioSnapshots.proposedAllocation.proposal_blocked) {
      setLastReliableSimulation(portfolioSnapshots.simulation);
    }
  }, [portfolioSnapshots]);

  const proposedAllocationSnapshot = useMemo(() => {
    if (
      portfolioSnapshots.proposedAllocation.proposal_blocked &&
      lastReliableSimulation
    ) {
      return buildProposedAllocationSnapshot(
        portfolioSnapshots.treasury,
        portfolioSnapshots.candidateUniverse,
        lastReliableSimulation,
      );
    }
    return portfolioSnapshots.proposedAllocation;
  }, [
    portfolioSnapshots,
    lastReliableSimulation,
  ]);

  const portfolioSimulation = proposedAllocationSnapshot.simulation;

  return {
    opportunities,
    sortedOpportunities,
    portfolioSimulation,
    universeOpportunities,
    globalSyncProgress,
    portfolioTreasury: portfolioSnapshots.treasury,
    candidateUniverseSnapshot: portfolioSnapshots.candidateUniverse,
    proposedAllocationSnapshot,
    realPortfolioSnapshot: portfolioSnapshots.realPortfolio,
  };
}
