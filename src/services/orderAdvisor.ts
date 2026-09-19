import {
  EveCharacterOrder,
  OrderAdvisorRecommendation,
  RawMarketOrder,
  MarketHub,
  HistoricalStats,
  FinancialConfig,
} from '../types';
import { MAJOR_MARKET_HUBS, getJumpRoute, EVE_TYPES_CATALOG } from '../data/universe';
import { MarketDataStore } from './marketDataStore';
import { FeeEngine } from '../engine/fee';

export class OrderAdvisorService {
  /**
   * Analyzes an active character order against real market conditions and produces
   * an actionable recommendation: Lower Price (with profit preserved), Relocate (haul arbitrage), or Cancel.
   */
  static analyzeOrder(
    order: EveCharacterOrder,
    allRegionalOrders: Record<number, RawMarketOrder[]>,
    historyStatsByRegion: Record<number, HistoricalStats> = {},
    config?: Partial<FinancialConfig>
  ): OrderAdvisorRecommendation {
    const typeInfo = EVE_TYPES_CATALOG.find((t) => t.type_id === order.type_id);
    const typeName = order.type_name || typeInfo?.name || `Objet #${order.type_id}`;
    const unitVolume = typeInfo?.volume || 0.1;

    const safeConfig: Partial<FinancialConfig> = config || {};
    const feeRes = FeeEngine.resolveRates({ config: safeConfig });
    const salesTaxRate = feeRes.sales_tax_rate;
    const brokerFeeRate = feeRes.broker_fee_rate;

    // Estimate original acquisition cost baseline (or 75% of current price as conservative heuristic)
    const estimatedUnitCost = order.is_buy_order
      ? order.price
      : order.price * 0.72; // Conservative standard markup assumption

    const myRegionId = order.region_id;
    // Look in provided orders array, or fallback directly to centralized MarketDataStore
    const myRegionOrders =
      allRegionalOrders[myRegionId] ||
      MarketDataStore.getOrders(order.type_id, myRegionId) ||
      [];

    // Filter relevant market orders in the same region
    const competingOrders = myRegionOrders.filter(
      (o) => o.type_id === order.type_id && o.is_buy_order === order.is_buy_order && o.order_id !== order.order_id
    );

    const localHistory =
      MarketDataStore.getHistory(order.type_id, myRegionId) ||
      historyStatsByRegion[myRegionId];
    const dailyLocalVolume = localHistory?.daily_volume_7d_median || 10;

    // BUY ORDER ANALYSIS
    if (order.is_buy_order) {
      const highestBuyInRegion = competingOrders.length > 0
        ? Math.max(...competingOrders.map((o) => o.price))
        : 0;

      const isOutbid = highestBuyInRegion > order.price;
      const priceDeltaPct = highestBuyInRegion > 0 ? ((highestBuyInRegion - order.price) / order.price) * 100 : 0;

      if (!isOutbid) {
        return {
          order_id: order.order_id,
          type_id: order.type_id,
          type_name: typeName,
          is_buy_order: true,
          order_price: order.price,
          volume_remain: order.volume_remain,
          volume_total: order.volume_total,
          location_name: order.location_name || 'Station Locale',
          region_name: order.region_name || 'Région',
          action: 'keep',
          urgency: 'low',
          headline: 'Meilleure Offre d\'Achat Active (Top Buyer)',
          summary: `Votre ordre est au sommet du carnet d'ordres d'achat.`,
          reasoning: `Aucun acheteur ne propose un prix plus attractif dans cette région. Le flux d'approvisionnement est optimal.`,
          capital_locked: order.escrow || order.price * order.volume_remain,
        };
      }

      // If outbid on buy order
      const suggestedNewBuyPrice = Number((highestBuyInRegion + 0.01).toFixed(2));
      return {
        order_id: order.order_id,
        type_id: order.type_id,
        type_name: typeName,
        is_buy_order: true,
        order_price: order.price,
        volume_remain: order.volume_remain,
        volume_total: order.volume_total,
        location_name: order.location_name || 'Station Locale',
        region_name: order.region_name || 'Région',
        action: 'lower_price', // Adjust price
        urgency: priceDeltaPct > 5 ? 'high' : 'medium',
        headline: `Surpassé de ${priceDeltaPct.toFixed(1)}% sur l'achat`,
        summary: `Rehausser l'offre d'achat à ${(suggestedNewBuyPrice).toLocaleString()} ISK pour capter les flux de vente.`,
        reasoning: `Un acheteur concurrent propose ${highestBuyInRegion.toLocaleString()} ISK. Vos fonds en séquestre ne travaillent pas.`,
        suggested_new_price: suggestedNewBuyPrice,
        price_delta_percent: priceDeltaPct,
        capital_locked: order.escrow || order.price * order.volume_remain,
      };
    }

    // SELL ORDER ANALYSIS
    const sellOrders = competingOrders.filter((o) => !o.is_buy_order && o.price > 0);
    const sortedSellOrders = [...sellOrders].sort((a, b) => a.price - b.price);

    const lowestSellInRegion = sortedSellOrders.length > 0 ? sortedSellOrders[0].price : order.price;
    const isUndercut = lowestSellInRegion < order.price;

    const ordersAhead = sortedSellOrders.filter((o) => o.price < order.price).length;
    const volumeAhead = sortedSellOrders
      .filter((o) => o.price < order.price)
      .reduce((sum, o) => sum + o.volume_remain, 0);

    const myPriceRank = ordersAhead + 1;
    const capitalLocked = order.price * order.volume_remain;

    const market_snapshot = {
      current_lowest_sell: lowestSellInRegion,
      current_highest_buy: 0,
      orders_ahead: ordersAhead,
      volume_ahead: volumeAhead,
      my_price_rank: myPriceRank,
      daily_velocity: dailyLocalVolume,
    };

    // 1. Check if Market is COMPLETELY DEAD (Candidate for CANCEL)
    if (dailyLocalVolume <= 0.2 && ordersAhead > 0) {
      return {
        order_id: order.order_id,
        type_id: order.type_id,
        type_name: typeName,
        is_buy_order: false,
        order_price: order.price,
        volume_remain: order.volume_remain,
        volume_total: order.volume_total,
        location_name: order.location_name || 'Station Locale',
        region_name: order.region_name || 'Région',
        action: 'cancel',
        urgency: 'high',
        headline: 'Marché Inactif : Annulation Recommandée',
        summary: `Volume local nul (~${dailyLocalVolume.toFixed(1)} unité/jour). L'ordre ne se vendra pas dans un délai raisonnable.`,
        reasoning: `Le volume transactionnel de cette région est mort. Il y a ${volumeAhead} unités moins chères devant vous. Annulez cet ordre pour libérer ${(capitalLocked / 1_000_000).toFixed(1)}M ISK et les redéployer sur un marché porteur.`,
        cancel_reason: 'dead_volume',
        capital_locked: capitalLocked,
        opportunity_cost_per_day: capitalLocked * 0.015, // ~1.5% daily opportunity cost
        market_snapshot,
      };
    }

    // 2. Check if a RELOCATE to another Hub is significantly more lucrative
    let bestRelocateCandidate: {
      hub: MarketHub;
      bestSellPrice: number;
      dailyVol: number;
      netProfitGain: number;
      roi: number;
      jumps: number;
    } | null = null;

    for (const targetHub of MAJOR_MARKET_HUBS.filter((h) => h.active)) {
      if (targetHub.region_id === myRegionId) continue; // Skip same region

      const targetRegionalOrders =
        allRegionalOrders[targetHub.region_id] ||
        MarketDataStore.getOrders(order.type_id, targetHub.region_id) ||
        [];

      const targetOrders = targetRegionalOrders.filter(
        (o) => o.type_id === order.type_id && !o.is_buy_order && o.price > 0
      );

      if (targetOrders.length === 0) continue;

      const targetLowestSell = Math.min(...targetOrders.map((o) => o.price));
      const targetHist =
        MarketDataStore.getHistory(order.type_id, targetHub.region_id) ||
        historyStatsByRegion[targetHub.region_id];
      const targetDailyVol = targetHist?.daily_volume_7d_median || 20;

      // Price must be at least 8% higher than our current price (or at least 15% above local lowest sell)
      if (targetLowestSell > order.price * 1.08 && targetDailyVol >= 5) {
        // Compute logistics and fee friction
        const myHubMatch = MAJOR_MARKET_HUBS.find((h) => h.region_id === myRegionId);
        const sourceSystemId = myHubMatch ? myHubMatch.system_id : 30000142;
        const route = getJumpRoute(sourceSystemId, targetHub.system_id);

        const totalM3 = unitVolume * order.volume_remain;
        const targetGross = targetLowestSell * order.volume_remain;
        const transportCost = FeeEngine.calculateTransportCost(
          safeConfig,
          totalM3,
          route.jumps,
          targetGross
        );
        const relistBrokerFee = FeeEngine.brokerCost(targetGross, brokerFeeRate);
        const targetSalesTax = FeeEngine.salesTaxCost(targetGross, salesTaxRate);

        const targetNetRevenue = targetGross - transportCost - relistBrokerFee - targetSalesTax;
        const currentGross = lowestSellInRegion * order.volume_remain;
        const currentExpectedRevenue = currentGross - FeeEngine.salesTaxCost(currentGross, salesTaxRate) - FeeEngine.brokerCost(currentGross, brokerFeeRate);

        const netGainIsk = targetNetRevenue - currentExpectedRevenue;

        if (netGainIsk > 1_500_000 && (!bestRelocateCandidate || netGainIsk > bestRelocateCandidate.netProfitGain)) {
          bestRelocateCandidate = {
            hub: targetHub,
            bestSellPrice: targetLowestSell,
            dailyVol: targetDailyVol,
            netProfitGain: netGainIsk,
            roi: (netGainIsk / capitalLocked) * 100,
            jumps: route.jumps,
          };
        }
      }
    }

    if (bestRelocateCandidate && bestRelocateCandidate.netProfitGain > 3_000_000) {
      return {
        order_id: order.order_id,
        type_id: order.type_id,
        type_name: typeName,
        is_buy_order: false,
        order_price: order.price,
        volume_remain: order.volume_remain,
        volume_total: order.volume_total,
        location_name: order.location_name || 'Station Locale',
        region_name: order.region_name || 'Région',
        action: 'relocate',
        urgency: 'high',
        headline: `Déplacer vers ${bestRelocateCandidate.hub.name} (+${(bestRelocateCandidate.netProfitGain / 1_000_000).toFixed(1)}M ISK Net)`,
        summary: `Le cours sur ${bestRelocateCandidate.hub.name} (${bestRelocateCandidate.hub.region}) est à ${bestRelocateCandidate.bestSellPrice.toLocaleString()} ISK avec une forte rotation (${bestRelocateCandidate.dailyVol.toFixed(0)}/jour).`,
        reasoning: `Après déduction des frais de transport (${bestRelocateCandidate.jumps} sauts High-Sec) et des taxes de réémission, le bénéfice net supplémentaire s'élève à +${(bestRelocateCandidate.netProfitGain / 1_000_000).toFixed(2)}M ISK.`,
        suggested_relocate_hub: {
          hub_id: bestRelocateCandidate.hub.id,
          hub_name: bestRelocateCandidate.hub.name,
          region_name: bestRelocateCandidate.hub.region,
          station_name: bestRelocateCandidate.hub.station,
          jumps: bestRelocateCandidate.jumps,
          is_highsec: true,
          current_best_sell_price: bestRelocateCandidate.bestSellPrice,
          daily_volume: bestRelocateCandidate.dailyVol,
          estimated_extra_profit_isk: bestRelocateCandidate.netProfitGain,
          net_profit_after_transport_and_relist: bestRelocateCandidate.netProfitGain,
          estimated_roi: bestRelocateCandidate.roi,
        },
        capital_locked: capitalLocked,
        market_snapshot,
      };
    }

    // 3. If Undercut -> Check if Lowering the Price Preserves Profit
    if (isUndercut) {
      const suggestedNewSellPrice = Math.max(0.01, lowestSellInRegion - 0.01);
      const priceCutPct = ((order.price - suggestedNewSellPrice) / order.price) * 100;

      // Net profit calculation at new price
      const netUnitRevenue = suggestedNewSellPrice * (1 - salesTaxRate - brokerFeeRate);
      const retainedNetProfitUnit = netUnitRevenue - estimatedUnitCost;
      const retainedTotalNetProfit = retainedNetProfitUnit * order.volume_remain;
      const retainedRoiPct = estimatedUnitCost > 0 ? (retainedNetProfitUnit / estimatedUnitCost) * 100 : 15;

      const estimatedDaysAfterCut = dailyLocalVolume > 0
        ? Math.max(0.2, order.volume_remain / dailyLocalVolume)
        : 3;

      if (retainedTotalNetProfit > 0 && retainedRoiPct >= 4) {
        return {
          order_id: order.order_id,
          type_id: order.type_id,
          type_name: typeName,
          is_buy_order: false,
          order_price: order.price,
          volume_remain: order.volume_remain,
          volume_total: order.volume_total,
          location_name: order.location_name || 'Station Locale',
          region_name: order.region_name || 'Région',
          action: 'lower_price',
          urgency: priceCutPct > 4 ? 'high' : 'medium',
          headline: `Ajuster le Prix à ${suggestedNewSellPrice.toLocaleString()} ISK (-${priceCutPct.toFixed(1)}%)`,
          summary: `Repassez 1er vendeur tout en préservant +${(retainedTotalNetProfit / 1_000_000).toFixed(2)}M ISK (+${retainedRoiPct.toFixed(1)}% ROI) de bénéfice net.`,
          reasoning: `${ordersAhead} ordre(s) concurrents (${volumeAhead} unités) vous devancent. Cet ajustement minime de 0.01 ISK sous le marché local réenclenche la vente immédiate tout en protégeant votre marge bénéficiaire.`,
          suggested_new_price: suggestedNewSellPrice,
          price_delta_percent: -priceCutPct,
          estimated_profit_if_lowered: retainedTotalNetProfit,
          estimated_roi_if_lowered: retainedRoiPct,
          estimated_days_to_sell_after_cut: Number(estimatedDaysAfterCut.toFixed(1)),
          retained_profit_isk: retainedTotalNetProfit,
          capital_locked: capitalLocked,
          market_snapshot,
        };
      } else {
        // Price cut would eat all profit or incur severe loss -> Cancel to avoid dumping
        return {
          order_id: order.order_id,
          type_id: order.type_id,
          type_name: typeName,
          is_buy_order: false,
          order_price: order.price,
          volume_remain: order.volume_remain,
          volume_total: order.volume_total,
          location_name: order.location_name || 'Station Locale',
          region_name: order.region_name || 'Région',
          action: 'cancel',
          urgency: 'high',
          headline: 'Annuler : Concurrence Destructrice de Marge',
          summary: `S\'aligner sur le cours actuel (${lowestSellInRegion.toLocaleString()} ISK) anéantirait votre bénéfice net.`,
          reasoning: `Le marché local a été cassé par des ventes au rabais. S\'aligner provoquerait une perte nette. Annulez cet ordre pour récupérer les marchandises et les vendre sur un autre hub ou attendre une reprise des cours.`,
          cancel_reason: 'severe_crash_under_cost',
          capital_locked: capitalLocked,
          market_snapshot,
        };
      }
    }

    // 4. Default: Position is Optimal / Keep
    return {
      order_id: order.order_id,
      type_id: order.type_id,
      type_name: typeName,
      is_buy_order: false,
      order_price: order.price,
      volume_remain: order.volume_remain,
      volume_total: order.volume_total,
      location_name: order.location_name || 'Station Locale',
      region_name: order.region_name || 'Région',
      action: 'keep',
      urgency: 'low',
      headline: 'Position Optimale (1er Vendeur)',
      summary: `Votre offre est la plus compétitive du marché local (${dailyLocalVolume.toFixed(0)} ventes/jour).`,
      reasoning: `Vous êtes en tête de gondole. Aucune action n\'est requise, la rotation naturelle des stocks s\'exécute.`,
      capital_locked: capitalLocked,
      market_snapshot,
    };
  }
}
