import { PriceLadder } from '../engine/ladder';
import { InterRegionalFinancialEngine } from '../engine/interRegional';
import { OpportunityScoringEngine } from '../engine/scoring';
import { EVE_TYPES_CATALOG, EVE_GROUPS, EVE_CATEGORIES, MAJOR_MARKET_HUBS, getJumpRoute } from '../data/universe';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  FinancialConfig,
  InterRegionalOpportunity,
  RawMarketOrder,
  HistoricalStats,
} from '../types';

export class InterRegionalScanner {
  /**
   * Evaluates all directed pairs (Hub A -> Hub B)
   * for a given EveTypeDetail and TradeStrategy.
   * Leverages Jita (The Forge, region 10000002) as the universal benchmark hub of reliability.
   */
  static scanItemAcrossHubs(
    item: EveTypeDetail,
    hubs: MarketHub[],
    strategy: TradeStrategy,
    config: FinancialConfig,
    orderBooks: Record<number, RawMarketOrder[]>,
    historyStats?: Record<number, HistoricalStats>
  ): InterRegionalOpportunity[] {
    const opportunities: InterRegionalOpportunity[] = [];
    const activeHubs = hubs.filter((h) => h.active);

    const group = EVE_GROUPS.find((g) => g.group_id === item.group_id);
    const category = EVE_CATEGORIES.find((c) => c.category_id === item.category_id);

    // Identify Jita Benchmark orders (The Forge - Region 10000002)
    const jitaOrders = orderBooks[10000002] || [];
    const jitaSellOrders = jitaOrders.filter((o) => !o.is_buy_order && o.price > 0);
    const jitaBuyOrders = jitaOrders.filter((o) => o.is_buy_order && o.price > 0);
    const jitaSellLadders = PriceLadder.aggregate(jitaSellOrders, false);
    const jitaBuyLadders = PriceLadder.aggregate(jitaBuyOrders, true);

    const jitaLowestSell = jitaSellLadders.length > 0 ? jitaSellLadders[0].price : 0;
    const jitaHighestBuy = jitaBuyLadders.length > 0 ? jitaBuyLadders[0].price : 0;

    // Analyze every combination: fromHub !== toHub
    for (let i = 0; i < activeHubs.length; i++) {
      for (let j = 0; j < activeHubs.length; j++) {
        if (i === j) continue; // Skip identical hub (intra-hub)
        const buyHub = activeHubs[i];
        const sellHub = activeHubs[j];

        const buyOrders = orderBooks[buyHub.region_id] || [];
        const sellOrders = orderBooks[sellHub.region_id] || [];

        // Source: we buy from Sell Orders on buyHub (order books ascending)
        const sourceSellOrders = buyOrders
          .filter((o) => !o.is_buy_order && o.price > 0 && o.volume_remain > 0);

        // Destination: sell immediately to Buy Orders OR relist at Sell Orders
        const destBuyOrders = sellOrders
          .filter((o) => o.is_buy_order && o.price > 0 && o.volume_remain > 0);
        const destSellOrders = sellOrders
          .filter((o) => !o.is_buy_order && o.price > 0 && o.volume_remain > 0);

        const sourceLadders = PriceLadder.aggregate(sourceSellOrders, false); // lowest price first
        if (sourceLadders.length === 0) continue;

        let destLadders = PriceLadder.aggregate(destBuyOrders, true); // highest buy price first

        // For relist strategy: assume execution at the current lowest sell price (or undercut by 0.01 ISK)
        if (strategy === 'relist') {
          const lowestDestSell = PriceLadder.aggregate(destSellOrders, false);
          if (lowestDestSell.length > 0) {
            const relistPrice = Math.max(0.01, lowestDestSell[0].price - 0.01);
            // Virtual absorption level based on estimated daily destination volume
            const histDest = historyStats ? historyStats[sellHub.region_id] : undefined;
            const absorbVol = Math.max(10, histDest?.daily_volume_7d_median || 500);
            destLadders = [
              {
                price: relistPrice,
                volume: absorbVol,
                orders: 1,
                cumulative: absorbVol,
              },
            ];
          }
        }

        if (destLadders.length === 0) continue;

        const bestSourceSellPrice = sourceLadders[0].price;
        const bestDestSellTargetPrice = destLadders[0].price;

        // Skip obvious negative gross spreads early
        if (bestDestSellTargetPrice <= bestSourceSellPrice) continue;

        const totalSourceVolume = sourceLadders.reduce((acc, l) => acc + l.volume, 0);
        const totalDestVolume = destLadders.reduce((acc, l) => acc + l.volume, 0);

        const route = getJumpRoute(buyHub.system_id, sellHub.system_id);

        // Calculate maximum tradable quantity with multi-constraints
        const { quantity, bottleneck, totalCargoVolume } = InterRegionalFinancialEngine.determineTradableQuantity(
          bestSourceSellPrice,
          item.volume,
          totalSourceVolume,
          totalDestVolume,
          route,
          config
        );

        if (quantity <= 0) continue;

        // Execution fill at average weighted prices
        const buyFill = InterRegionalFinancialEngine.simulateFill(sourceLadders, quantity);
        const sellFill = InterRegionalFinancialEngine.simulateFill(destLadders, quantity);

        if (buyFill.filled_quantity <= 0 || sellFill.filled_quantity <= 0) continue;

        const actualQuantity = Math.min(buyFill.filled_quantity, sellFill.filled_quantity);
        const costs = InterRegionalFinancialEngine.computeCostsAndProfit(
          buyFill,
          sellFill,
          actualQuantity,
          item.volume,
          route,
          strategy,
          config
        );

        // Liquidity metrics
        const destHistory = historyStats ? historyStats[sellHub.region_id] : undefined;
        const dailyDestVol = destHistory?.daily_volume_7d_median || Math.max(1, totalDestVolume * 0.5);

        const liquidityMetrics = {
          buy_hub_depth_volume: totalSourceVolume,
          sell_hub_depth_volume: totalDestVolume,
          daily_volume_source: historyStats?.[buyHub.region_id]?.daily_volume_7d_median || totalSourceVolume,
          daily_volume_dest: dailyDestVol,
          turnover_ratio: dailyDestVol > 0 ? quantity / dailyDestVol : 1,
          expected_days_to_sell: dailyDestVol > 0 ? Math.max(0.2, quantity / dailyDestVol) : 7,
          volume_exhaustion_pct: totalSourceVolume > 0 ? (quantity / totalSourceVolume) * 100 : 100,
        };

        // Scoring & Anomaly Detection
        const evaluation = OpportunityScoringEngine.evaluate(
          costs,
          liquidityMetrics,
          destHistory,
          route.jumps,
          route.is_highsec_only,
          config
        );

        // Jita Reliability Assessment: Compare buy price and sell target against Jita market truth
        let jitaReliabilityAssessment = 'Aucune donnée Jita';
        let buyVsJitaPct = 0;
        let sellVsJitaPct = 0;
        let isJitaVerified = false;

        if (jitaLowestSell > 0) {
          isJitaVerified = true;
          buyVsJitaPct = ((buyFill.effective_price - jitaLowestSell) / jitaLowestSell) * 100;
          sellVsJitaPct = ((sellFill.effective_price - jitaLowestSell) / jitaLowestSell) * 100;

          if (buyHub.id === 'jita') {
            jitaReliabilityAssessment = `Source officielle Jita. Revente régionale à +${sellVsJitaPct.toFixed(1)}% du prix Jita.`;
          } else if (sellHub.id === 'jita') {
            jitaReliabilityAssessment = `Arbitrage retour vers Jita. Acheté à ${buyVsJitaPct.toFixed(1)}% du spot Jita.`;
          } else {
            // Both are regional hubs
            if (buyFill.effective_price < jitaLowestSell * 0.7) {
              jitaReliabilityAssessment = `Attention: Prix d'achat suspect (${Math.abs(buyVsJitaPct).toFixed(1)}% sous Jita). Vérifier la liquidité.`;
            } else if (sellFill.effective_price > jitaLowestSell * 1.5) {
              jitaReliabilityAssessment = `Prime régionale forte (+${sellVsJitaPct.toFixed(1)}% vs Jita). Rotation potentiellement plus lente.`;
            } else {
              jitaReliabilityAssessment = `Cohérent avec le cours de référence Jita (${sellVsJitaPct >= 0 ? '+' : ''}${sellVsJitaPct.toFixed(1)}% vs Jita).`;
            }
          }
        }

        const oppId = `${item.type_id}_${buyHub.id}_${sellHub.id}_${strategy}`;

        opportunities.push({
          id: oppId,
          type_id: item.type_id,
          type_name: item.name,
          group_id: item.group_id,
          group_name: group?.name || `Groupe ${item.group_id}`,
          category_id: item.category_id,
          category_name: category?.name || `Catégorie ${item.category_id}`,
          unit_volume: item.volume,

          buy_hub: buyHub,
          sell_hub: sellHub,
          strategy,
          route,

          best_buy_order_price: bestSourceSellPrice,
          best_sell_order_price: bestDestSellTargetPrice,
          effective_buy_price: buyFill.effective_price,
          effective_sell_price: sellFill.effective_price,
          spread_pct: bestSourceSellPrice > 0 ? (bestDestSellTargetPrice - bestSourceSellPrice) / bestSourceSellPrice : 0,

          quantity_tradable: quantity,
          bottleneck,
          total_cargo_volume: totalCargoVolume,

          costs,
          capturable_profit: evaluation.capturableProfit,
          profit_per_day: evaluation.profitPerDay,
          expected_days_to_sell: evaluation.expectedDaysToSell,

          liquidity: liquidityMetrics,
          history: destHistory,

          scores: evaluation.scores,

          jita_price_benchmark: {
            jita_sell_price: jitaLowestSell,
            jita_buy_price: jitaHighestBuy,
            buy_vs_jita_pct: buyVsJitaPct,
            sell_vs_jita_pct: sellVsJitaPct,
            is_jita_verified: isJitaVerified,
            reliability_assessment: jitaReliabilityAssessment,
          },

          is_anomalous: evaluation.isAnomalous,
          anomaly_reasons: evaluation.anomalyReasons,
          rejection_reasons: evaluation.rejectionReasons,
          is_viable: evaluation.isViable,

          detected_at: new Date().toISOString(),
        });
      }
    }

    return opportunities;
  }

  /**
   * Scans an entire list of types or an entire group/category.
   */
  static scanCatalog(
    items: EveTypeDetail[],
    hubs: MarketHub[],
    strategy: TradeStrategy,
    config: FinancialConfig,
    orderBooks: Record<number, RawMarketOrder[]>,
    historyStats?: Record<number, HistoricalStats>
  ): InterRegionalOpportunity[] {
    const all: InterRegionalOpportunity[] = [];
    for (const item of items) {
      const opps = this.scanItemAcrossHubs(item, hubs, strategy, config, orderBooks, historyStats);
      all.push(...opps);
    }
    return all.sort((a, b) => b.scores.overall_score - a.scores.overall_score);
  }
}
