import {
  EveCharacterTransaction,
  EveCharacterOrderHistory,
  EveCharacterJournalEntry,
  TraderPerformanceMetrics,
  TradeCycleRecord,
  PersonalCalibrationFit,
  EveTypeDetail,
} from '../types';
import { EVE_TYPES_CATALOG, EVE_CATEGORIES } from '../data/universe';
import { FeeEngine } from '../engine/fee';

const STORAGE_KEY_PREFIX = 'eve_trader_analytics_';

export class TraderAnalyticsService {
  /**
   * Matches buy and sell transactions chronologically (FIFO with weighted average cost)
   * to compute actual realized P&L cycles for each traded item.
   */
  static processTransactions(
    characterId: number,
    characterName: string,
    transactions: EveCharacterTransaction[],
    orderHistory: EveCharacterOrderHistory[] = [],
    journalEntries: EveCharacterJournalEntry[] = [],
    accountingLevel: number = 4,
    brokerRelationsLevel: number = 4
  ): TraderPerformanceMetrics {
    // Sort transactions oldest to newest
    const sortedTx = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Group by type_id
    const inventoryByType: Record<
      number,
      Array<{ date: string; quantity: number; unit_price: number; location_name?: string }>
    > = {};

    const completedCycles: TradeCycleRecord[] = [];
    let totalBuyVolumeIsk = 0;
    let totalSellVolumeIsk = 0;
    const locationVolumeMap: Record<number, { name: string; volumeIsk: number; count: number }> = {};
    const itemProfitMap: Record<
      number,
      {
        type_id: number;
        type_name: string;
        category_name: string;
        total_profit: number;
        trades_count: number;
        rois: number[];
        hold_days_list: number[];
        total_volume_units: number;
      }
    > = {};

    // Estimated broker and tax rates based on skills using official FeeEngine
    const salesTaxRate = FeeEngine.calculateSalesTaxRate(accountingLevel);
    const brokerFeeRate = FeeEngine.calculateNpcBrokerFeeRate(brokerRelationsLevel, 0, 0);

    for (const tx of sortedTx) {
      const typeInfo = EVE_TYPES_CATALOG.find((t) => t.type_id === tx.type_id);
      const typeName = tx.type_name || typeInfo?.name || `Objet #${tx.type_id}`;
      const categoryInfo = typeInfo ? EVE_CATEGORIES.find((c) => c.category_id === typeInfo.category_id) : null;
      const categoryName = categoryInfo?.name || 'Général';

      // Track location metrics
      const locId = tx.location_id;
      const locName = tx.location_name || `Station #${locId}`;
      if (!locationVolumeMap[locId]) {
        locationVolumeMap[locId] = { name: locName, volumeIsk: 0, count: 0 };
      }
      locationVolumeMap[locId].volumeIsk += tx.unit_price * tx.quantity;
      locationVolumeMap[locId].count += 1;

      if (tx.is_buy) {
        // Buy transaction
        totalBuyVolumeIsk += tx.unit_price * tx.quantity;
        if (!inventoryByType[tx.type_id]) {
          inventoryByType[tx.type_id] = [];
        }
        inventoryByType[tx.type_id].push({
          date: tx.date,
          quantity: tx.quantity,
          unit_price: tx.unit_price,
          location_name: tx.location_name,
        });
      } else {
        // Sell transaction
        totalSellVolumeIsk += tx.unit_price * tx.quantity;
        let remainingToMatch = tx.quantity;
        let totalAcquisitionCost = 0;
        let weightedBuyDateMs = 0;
        let matchedUnits = 0;
        let buyLocation = 'Inconnu';

        const inventory = inventoryByType[tx.type_id] || [];

        while (remainingToMatch > 0 && inventory.length > 0) {
          const oldestBatch = inventory[0];
          const matchQty = Math.min(remainingToMatch, oldestBatch.quantity);

          totalAcquisitionCost += matchQty * oldestBatch.unit_price;
          weightedBuyDateMs += new Date(oldestBatch.date).getTime() * matchQty;
          matchedUnits += matchQty;
          buyLocation = oldestBatch.location_name || buyLocation;

          oldestBatch.quantity -= matchQty;
          remainingToMatch -= matchQty;

          if (oldestBatch.quantity <= 0) {
            inventory.shift();
          }
        }

        if (matchedUnits > 0) {
          const avgBuyPrice = totalAcquisitionCost / matchedUnits;
          const avgSellPrice = tx.unit_price;
          const sellRevenue = avgSellPrice * matchedUnits;

          // Compute realistic fees
          const buyBrokerFee = totalAcquisitionCost * brokerFeeRate;
          const sellBrokerFee = sellRevenue * brokerFeeRate;
          const sellTax = sellRevenue * salesTaxRate;
          const totalFees = buyBrokerFee + sellBrokerFee + sellTax;

          const grossProfit = sellRevenue - totalAcquisitionCost;
          const netProfit = grossProfit - totalFees;
          const roi = totalAcquisitionCost > 0 ? netProfit / totalAcquisitionCost : 0;

          const buyTimeMs = weightedBuyDateMs / matchedUnits;
          const sellTimeMs = new Date(tx.date).getTime();
          const holdDays = Math.max(0.05, (sellTimeMs - buyTimeMs) / (1000 * 60 * 60 * 24));

          const isProfitable = netProfit > 0;

          const cycleRecord: TradeCycleRecord = {
            cycle_id: `cycle_${tx.transaction_id}_${tx.type_id}`,
            type_id: tx.type_id,
            type_name: typeName,
            category_name: categoryName,
            buy_date: new Date(buyTimeMs).toISOString(),
            sell_date: tx.date,
            quantity: matchedUnits,
            avg_buy_price: avgBuyPrice,
            avg_sell_price: avgSellPrice,
            total_buy_cost: totalAcquisitionCost,
            total_sell_revenue: sellRevenue,
            gross_profit: grossProfit,
            estimated_fees_paid: totalFees,
            net_profit: netProfit,
            roi: roi,
            hold_days: Number(holdDays.toFixed(1)),
            is_profitable: isProfitable,
            buy_location: buyLocation,
            sell_location: tx.location_name || 'Destination',
          };

          completedCycles.push(cycleRecord);

          // Update Item Profit Map
          if (!itemProfitMap[tx.type_id]) {
            itemProfitMap[tx.type_id] = {
              type_id: tx.type_id,
              type_name: typeName,
              category_name: categoryName,
              total_profit: 0,
              trades_count: 0,
              rois: [],
              hold_days_list: [],
              total_volume_units: 0,
            };
          }
          itemProfitMap[tx.type_id].total_profit += netProfit;
          itemProfitMap[tx.type_id].trades_count += 1;
          itemProfitMap[tx.type_id].rois.push(roi);
          itemProfitMap[tx.type_id].hold_days_list.push(holdDays);
          itemProfitMap[tx.type_id].total_volume_units += matchedUnits;
        }
      }
    }

    // Also include fulfilled orders from orderHistory if transactions array was partially truncated
    if (completedCycles.length === 0 && orderHistory.length > 0) {
      const fulfilledOrders = orderHistory.filter((o) => o.state === 'fulfilled');
      for (const order of fulfilledOrders) {
        const typeInfo = EVE_TYPES_CATALOG.find((t) => t.type_id === order.type_id);
        const typeName = order.type_name || typeInfo?.name || `Item #${order.type_id}`;
        const orderVolIsk = order.price * order.volume_total;
        if (order.is_buy_order) totalBuyVolumeIsk += orderVolIsk;
        else totalSellVolumeIsk += orderVolIsk;
      }
    }

    // Totals & KPI derivation
    const totalRealizedProfit = completedCycles.reduce((acc, c) => acc + c.net_profit, 0);
    const profitableTrades = completedCycles.filter((c) => c.is_profitable).length;
    const unprofitableTrades = completedCycles.filter((c) => !c.is_profitable).length;
    const totalClosedTrades = completedCycles.length;
    const winRatePct = totalClosedTrades > 0 ? (profitableTrades / totalClosedTrades) * 100 : 100;

    const avgRealizedRoi =
      totalClosedTrades > 0
        ? completedCycles.reduce((acc, c) => acc + c.roi, 0) / totalClosedTrades
        : 0;

    const avgHoldDays =
      totalClosedTrades > 0
        ? completedCycles.reduce((acc, c) => acc + c.hold_days, 0) / totalClosedTrades
        : 0;

    const totalBrokerFeesPaid = completedCycles.reduce((acc, c) => acc + c.estimated_fees_paid * 0.6, 0);
    const totalSalesTaxPaid = completedCycles.reduce((acc, c) => acc + c.estimated_fees_paid * 0.4, 0);

    // Top Profitable Items
    const topProfitableItems = Object.values(itemProfitMap)
      .map((item) => ({
        type_id: item.type_id,
        type_name: item.type_name,
        category_name: item.category_name,
        total_profit: item.total_profit,
        trades_count: item.trades_count,
        avg_roi: item.rois.length > 0 ? item.rois.reduce((a, b) => a + b, 0) / item.rois.length : 0,
        avg_hold_days:
          item.hold_days_list.length > 0
            ? item.hold_days_list.reduce((a, b) => a + b, 0) / item.hold_days_list.length
            : 0,
        total_volume_units: item.total_volume_units,
      }))
      .sort((a, b) => b.total_profit - a.total_profit)
      .slice(0, 15);

    // Category Success Rate
    const categorySuccessRate: Record<
      string,
      { total_trades: number; profit_isk: number; win_rate: number; avg_roi: number }
    > = {};

    for (const c of completedCycles) {
      const cat = c.category_name || 'Général';
      if (!categorySuccessRate[cat]) {
        categorySuccessRate[cat] = { total_trades: 0, profit_isk: 0, win_rate: 0, avg_roi: 0 };
      }
      categorySuccessRate[cat].total_trades += 1;
      categorySuccessRate[cat].profit_isk += c.net_profit;
    }

    for (const cat of Object.keys(categorySuccessRate)) {
      const catCycles = completedCycles.filter((c) => (c.category_name || 'Général') === cat);
      const catWins = catCycles.filter((c) => c.is_profitable).length;
      categorySuccessRate[cat].win_rate = catCycles.length > 0 ? (catWins / catCycles.length) * 100 : 0;
      categorySuccessRate[cat].avg_roi =
        catCycles.length > 0 ? catCycles.reduce((a, b) => a + b.roi, 0) / catCycles.length : 0;
    }

    // Location Breakdown
    const activityByLocation = Object.entries(locationVolumeMap)
      .map(([idStr, val]) => ({
        location_id: Number(idStr),
        location_name: val.name,
        total_volume_isk: val.volumeIsk,
        transaction_count: val.count,
      }))
      .sort((a, b) => b.total_volume_isk - a.total_volume_isk)
      .slice(0, 8);

    // Determine Trader Title & Badge
    let traderTitle = 'Négociant Initié';
    let traderBadgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';

    if (totalRealizedProfit >= 1_000_000_000) {
      traderTitle = 'Tycoon Suprême de New Eden';
      traderBadgeColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    } else if (totalRealizedProfit >= 250_000_000) {
      traderTitle = 'Magnat Commercial Régional';
      traderBadgeColor = 'text-purple-300 bg-purple-500/15 border-purple-500/30';
    } else if (totalRealizedProfit >= 50_000_000) {
      traderTitle = 'Capitaine Marchand Vétéran';
      traderBadgeColor = 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30';
    } else if (totalRealizedProfit >= 10_000_000) {
      traderTitle = 'Arbitragiste Agile';
      traderBadgeColor = 'text-green-300 bg-green-500/15 border-green-500/30';
    } else if (totalRealizedProfit < 0) {
      traderTitle = 'Trader en Restructuration';
      traderBadgeColor = 'text-orange-300 bg-orange-500/15 border-orange-500/30';
    }

    const metrics: TraderPerformanceMetrics = {
      character_id: characterId,
      character_name: characterName,
      last_calculated: new Date().toISOString(),
      total_realized_profit: totalRealizedProfit,
      total_buy_volume: totalBuyVolumeIsk,
      total_sell_volume: totalSellVolumeIsk,
      total_turnover: totalBuyVolumeIsk + totalSellVolumeIsk,
      total_closed_trades: totalClosedTrades,
      profitable_trades: profitableTrades,
      unprofitable_trades: unprofitableTrades,
      win_rate_pct: winRatePct,
      average_realized_roi: avgRealizedRoi,
      average_hold_days: avgHoldDays,
      total_broker_fees_paid: totalBrokerFeesPaid,
      total_sales_tax_paid: totalSalesTaxPaid,
      top_profitable_items: topProfitableItems,
      recent_trade_cycles: completedCycles.reverse().slice(0, 50),
      activity_by_location: activityByLocation,
      category_success_rate: categorySuccessRate,
      trader_title: traderTitle,
      trader_badge_color: traderBadgeColor,
      calibration_weight: Math.min(1.3, Math.max(0.7, 1 + (winRatePct - 50) / 100)),
    };

    // Cache metrics in localStorage
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${characterId}`, JSON.stringify(metrics));
    } catch {}

    return metrics;
  }

  /**
   * Retrieves cached trader metrics from storage
   */
  static getCachedMetrics(characterId: number): TraderPerformanceMetrics | null {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${characterId}`);
      if (data) return JSON.parse(data);
    } catch {}
    return null;
  }

  /**
   * Evaluates a trade opportunity against the user's real historical trade track record.
   * Provides adaptive weighting, confidence boosts, and personalized risk badges.
   */
  static calibrateOpportunity(
    typeId: number,
    categoryId: number,
    metrics: TraderPerformanceMetrics | null
  ): PersonalCalibrationFit {
    if (!metrics || metrics.total_closed_trades === 0) {
      return {
        has_personal_history: false,
        total_historical_trades: 0,
        historical_realized_profit: 0,
        historical_avg_roi: 0,
        historical_win_rate: 0,
        historical_avg_hold_days: 0,
        calibration_confidence_boost: 0,
        badge_text: 'Nouvel Horizon',
        badge_type: 'new',
        summary: 'Aucun historique réel enregistré pour ce type d\'article.',
      };
    }

    const itemRecord = metrics.top_profitable_items.find((item) => item.type_id === typeId);
    const categoryInfo = EVE_CATEGORIES.find((c) => c.category_id === categoryId);
    const catName = categoryInfo?.name || '';
    const catRecord = catName ? metrics.category_success_rate[catName] : null;

    if (itemRecord) {
      const isVeryProfitable = itemRecord.total_profit > 10_000_000 && itemRecord.avg_roi > 0.15;
      const isLoss = itemRecord.total_profit < 0;

      if (isLoss) {
        return {
          has_personal_history: true,
          total_historical_trades: itemRecord.trades_count,
          historical_realized_profit: itemRecord.total_profit,
          historical_avg_roi: itemRecord.avg_roi,
          historical_win_rate: 0,
          historical_avg_hold_days: itemRecord.avg_hold_days,
          calibration_confidence_boost: -0.15, // Penalty
          badge_text: `⚠️ Perte Historique (${(itemRecord.total_profit / 1_000_000).toFixed(1)}M ISK)`,
          badge_type: 'caution',
          summary: `Vous avez enregistré une perte nette sur cet item lors de vos sessions passées. Prudence sur les volumes.`,
        };
      }

      return {
        has_personal_history: true,
        total_historical_trades: itemRecord.trades_count,
        historical_realized_profit: itemRecord.total_profit,
        historical_avg_roi: itemRecord.avg_roi,
        historical_win_rate: 100,
        historical_avg_hold_days: itemRecord.avg_hold_days,
        calibration_confidence_boost: isVeryProfitable ? 0.18 : 0.08,
        badge_text: `⭐ Spécialité Prouvée (+${(itemRecord.total_profit / 1_000_000).toFixed(1)}M ISK)`,
        badge_type: 'expert',
        summary: `Déjà réussi avec succès : +${(itemRecord.total_profit / 1_000_000).toFixed(1)}M ISK de profit réel réalisé (${itemRecord.trades_count} flips, ~${itemRecord.avg_hold_days.toFixed(1)}j).`,
      };
    }

    if (catRecord && catRecord.total_trades >= 3) {
      const isCatSolid = catRecord.win_rate >= 75 && catRecord.profit_isk > 0;
      return {
        has_personal_history: true,
        total_historical_trades: catRecord.total_trades,
        historical_realized_profit: catRecord.profit_isk,
        historical_avg_roi: catRecord.avg_roi,
        historical_win_rate: catRecord.win_rate,
        historical_avg_hold_days: metrics.average_hold_days,
        calibration_confidence_boost: isCatSolid ? 0.06 : 0,
        badge_text: `🎯 Catégorie Maîtrisée (${catRecord.win_rate.toFixed(0)}% succès)`,
        badge_type: 'profitable',
        summary: `Catégorie « ${catName} » familière : ${catRecord.win_rate.toFixed(0)}% de taux de réussite sur ${catRecord.total_trades} transactions.`,
      };
    }

    return {
      has_personal_history: false,
      total_historical_trades: 0,
      historical_realized_profit: 0,
      historical_avg_roi: 0,
      historical_win_rate: 0,
      historical_avg_hold_days: metrics.average_hold_days,
      calibration_confidence_boost: 0,
      badge_text: 'Non Négocié',
      badge_type: 'new',
      summary: 'Première analyse pour cet item dans votre profil de trading.',
    };
  }
}
