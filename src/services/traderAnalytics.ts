import {
  EveCharacterTransaction,
  EveCharacterOrderHistory,
  EveCharacterJournalEntry,
  TraderPerformanceMetrics,
  TradeCycleRecord,
  PersonalCalibrationFit,
  EveTypeDetail,
  CharacterExecutionRecord,
  FinancialCompleteness,
} from '../types';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { FeeEngine } from '../engine/fee';
import { RealizedFinancialOutcomeEngine } from '../engine/realizedFinancialOutcome';
import { roundIsk, safeDiv } from '../engine/money';

const STORAGE_KEY_PREFIX = 'eve_trader_analytics_';

export class TraderAnalyticsService {
  /**
   * Matches buy and sell transactions chronologically (causal FIFO with RealizedFinancialOutcomeEngine)
   * to compute actual realized P&L cycles for each traded item.
   * Delegated 100% to RealizedFinancialOutcomeEngine as single source of truth.
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
    // Sort transactions deterministically: timestamp ASC, transaction_id ASC
    const sortedTx = [...transactions].sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.transaction_id - b.transaction_id
    );

    // Group by type_id & track location metrics
    let totalBuyVolumeIsk = 0;
    let totalSellVolumeIsk = 0;
    const locationVolumeMap: Record<number, { name: string; volumeIsk: number; count: number }> = {};
    const txByType: Record<number, EveCharacterTransaction[]> = {};

    for (const tx of sortedTx) {
      const locId = tx.location_id;
      const locName = tx.location_name || UniverseRepository.getInstance().getStationNameSync(locId);
      if (!locationVolumeMap[locId]) {
        locationVolumeMap[locId] = { name: locName, volumeIsk: 0, count: 0 };
      }
      const val =
        (Number.isFinite(tx.unit_price) ? Math.max(0, tx.unit_price) : 0) *
        (Number.isFinite(tx.quantity) ? Math.max(0, tx.quantity) : 0);
      locationVolumeMap[locId].volumeIsk += val;
      locationVolumeMap[locId].count += 1;

      if (tx.is_buy) {
        totalBuyVolumeIsk += val;
      } else {
        totalSellVolumeIsk += val;
      }

      if (!txByType[tx.type_id]) {
        txByType[tx.type_id] = [];
      }
      txByType[tx.type_id].push(tx);
    }

    const completedCycles: TradeCycleRecord[] = [];
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

    let totalRealizedGross = 0;
    let totalRealizedProfit = 0;
    let totalBrokerFeesPaid = 0;
    let totalSalesTaxPaid = 0;
    let totalEstimatedFees = 0;
    let hasUnmatchedTrades = false;
    let unmatchedTradesCount = 0;
    let hasPartial = false;
    let hasUnavailable = false;

    // Rates via FeeEngine for cycle decomposition
    const salesTaxRate = FeeEngine.calculateSalesTaxRate(accountingLevel);
    const brokerFeeRate = FeeEngine.calculateNpcBrokerFeeRate(brokerRelationsLevel, 0, 0);

    for (const [typeIdStr, typeTxs] of Object.entries(txByType)) {
      const typeId = Number(typeIdStr);
      const typeInfo = CatalogRepository.getInstance().getTypeById(typeId);
      const sampleTx = typeTxs[0];
      const typeName =
        sampleTx?.type_name ||
        typeInfo?.name ||
        CatalogRepository.getInstance().getTypeName(typeId);
      const categoryInfo = typeInfo ? CatalogRepository.getInstance().getCategory(typeInfo.category_id) : null;
      const categoryName = typeInfo?.category_name || categoryInfo?.name || 'Général';

      // Delegate calculation to RealizedFinancialOutcomeEngine
      const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(
        characterId,
        typeId,
        typeTxs,
        {
          financialConfig: {
            accounting_level: accountingLevel,
            broker_relations_level: brokerRelationsLevel,
            enable_transport_costs: false,
          },
          executionFeeMode: 'MAKER_MAKER',
        }
      );

      totalRealizedGross += outcome.gross_realized_profit;
      totalRealizedProfit += outcome.net_realized_profit;
      totalBrokerFeesPaid +=
        outcome.fees.estimated_buy_broker_fee + outcome.fees.estimated_sell_broker_fee;
      totalSalesTaxPaid += outcome.fees.estimated_sales_tax;
      totalEstimatedFees += outcome.fees.estimated_total_fees;

      if (outcome.financial_completeness === 'PARTIAL' || outcome.has_unmatched_sell_quantity) {
        hasPartial = true;
        hasUnmatchedTrades = true;
        unmatchedTradesCount += 1;
      }
      if (outcome.financial_completeness === 'UNAVAILABLE') {
        hasUnavailable = true;
      }

      // Group allocations by sell_transaction_id to produce completed trade cycles
      const allocationsBySellTx: Record<number, typeof outcome.fifo_allocations[number][]> = {};
      for (const alloc of outcome.fifo_allocations) {
        if (!allocationsBySellTx[alloc.sell_transaction_id]) {
          allocationsBySellTx[alloc.sell_transaction_id] = [];
        }
        allocationsBySellTx[alloc.sell_transaction_id].push(alloc);
      }

      const sellTxs = typeTxs.filter((t) => !t.is_buy);
      for (const sellTx of sellTxs) {
        const allocs = allocationsBySellTx[sellTx.transaction_id] || [];
        const matchedQty = allocs.reduce((sum, a) => sum + a.allocated_quantity, 0);
        const unmatchedQty = Math.max(0, sellTx.quantity - matchedQty);

        if (matchedQty === 0 && unmatchedQty === 0) continue;

        if (matchedQty > 0) {
          const totalBuyCost = allocs.reduce((sum, a) => sum + a.gross_cost, 0);
          const totalSellRevenue = allocs.reduce((sum, a) => sum + a.gross_revenue, 0);
          const grossProfit = totalSellRevenue - totalBuyCost;

          // Fees for this specific cycle calculated using FeeEngine rates (Maker assumption for station trading)
          const cycleBuyBrokerFee = FeeEngine.brokerCost(totalBuyCost, brokerFeeRate);
          const cycleSellBrokerFee = FeeEngine.brokerCost(totalSellRevenue, brokerFeeRate);
          const cycleSalesTax = FeeEngine.salesTaxCost(totalSellRevenue, salesTaxRate);
          const cycleFees = roundIsk(cycleBuyBrokerFee + cycleSellBrokerFee + cycleSalesTax);
          const netProfit = roundIsk(grossProfit - cycleFees);
          const roi = totalBuyCost > 0 ? safeDiv(netProfit, totalBuyCost, 0) : 0;

          const weightedBuyTimeMs =
            allocs.reduce(
              (sum, a) => sum + new Date(a.buy_timestamp).getTime() * a.allocated_quantity,
              0
            ) / matchedQty;
          const sellTimeMs = new Date(sellTx.date).getTime();
          const holdDays = Math.max(0.05, (sellTimeMs - weightedBuyTimeMs) / (1000 * 60 * 60 * 24));

          const buyTxSample = typeTxs.find(
            (t) => t.transaction_id === allocs[0].buy_transaction_id && t.is_buy
          );
          const buyLocation =
            buyTxSample?.location_name ||
            UniverseRepository.getInstance().getStationNameSync(buyTxSample?.location_id || 0) ||
            'Station Inconnue';
          const sellLocation =
            sellTx.location_name ||
            UniverseRepository.getInstance().getStationNameSync(sellTx.location_id || 0) ||
            'Station Inconnue';

          const isProfitable = netProfit > 0;
          const cycleCompleteness: FinancialCompleteness =
            unmatchedQty > 0 ? 'PARTIAL' : outcome.financial_completeness;

          const cycleRecord: TradeCycleRecord = {
            cycle_id: `cycle_${sellTx.transaction_id}_${typeId}`,
            type_id: typeId,
            type_name: typeName,
            category_name: categoryName,
            buy_date: new Date(weightedBuyTimeMs).toISOString(),
            sell_date: sellTx.date,
            quantity: matchedQty,
            avg_buy_price: matchedQty > 0 ? totalBuyCost / matchedQty : 0,
            avg_sell_price: matchedQty > 0 ? totalSellRevenue / matchedQty : 0,
            total_buy_cost: roundIsk(totalBuyCost),
            total_sell_revenue: roundIsk(totalSellRevenue),
            gross_profit: roundIsk(grossProfit),
            estimated_fees_paid: cycleFees,
            net_profit: netProfit,
            roi: roi,
            hold_days: Number(holdDays.toFixed(1)),
            is_profitable: isProfitable,
            buy_location: buyLocation,
            sell_location: sellLocation,
            financial_completeness: cycleCompleteness,
            is_net_estimated: outcome.is_net_estimated,
            fees_breakdown: {
              fee_mode: outcome.fees.fee_mode,
              fee_source: outcome.fees.fee_source,
              execution_fee_mode: outcome.fees.execution_fee_mode,
              estimated_buy_broker_fee: cycleBuyBrokerFee,
              estimated_sell_broker_fee: cycleSellBrokerFee,
              estimated_sales_tax: cycleSalesTax,
              estimated_total_fees: cycleFees,
              is_role_assumed: outcome.fees.is_role_assumed,
              notes: outcome.fees.notes,
            },
            unmatched_sell_quantity: unmatchedQty,
          };

          completedCycles.push(cycleRecord);

          // Update Item Profit Map
          if (!itemProfitMap[typeId]) {
            itemProfitMap[typeId] = {
              type_id: typeId,
              type_name: typeName,
              category_name: categoryName,
              total_profit: 0,
              trades_count: 0,
              rois: [],
              hold_days_list: [],
              total_volume_units: 0,
            };
          }
          itemProfitMap[typeId].total_profit += netProfit;
          itemProfitMap[typeId].trades_count += 1;
          itemProfitMap[typeId].rois.push(roi);
          itemProfitMap[typeId].hold_days_list.push(holdDays);
          itemProfitMap[typeId].total_volume_units += matchedQty;
        } else {
          // completely unmatched sell: NO prior buy lots matched
          const sellLocation =
            sellTx.location_name ||
            UniverseRepository.getInstance().getStationNameSync(sellTx.location_id || 0) ||
            'Station Inconnue';

          const cycleRecord: TradeCycleRecord = {
            cycle_id: `cycle_${sellTx.transaction_id}_${typeId}`,
            type_id: typeId,
            type_name: typeName,
            category_name: categoryName,
            buy_date: sellTx.date,
            sell_date: sellTx.date,
            quantity: 0,
            avg_buy_price: 0,
            avg_sell_price: sellTx.unit_price,
            total_buy_cost: 0,
            total_sell_revenue: roundIsk(sellTx.quantity * sellTx.unit_price),
            gross_profit: 0,
            estimated_fees_paid: 0,
            net_profit: 0,
            roi: 0,
            hold_days: 0,
            is_profitable: false,
            buy_location: 'Inconnu (Sans Achat Antérieur)',
            sell_location: sellLocation,
            financial_completeness: 'PARTIAL',
            is_net_estimated: true,
            fees_breakdown: {
              fee_mode: outcome.fees.fee_mode,
              fee_source: outcome.fees.fee_source,
              execution_fee_mode: outcome.fees.execution_fee_mode,
              estimated_buy_broker_fee: 0,
              estimated_sell_broker_fee: 0,
              estimated_sales_tax: 0,
              estimated_total_fees: 0,
              is_role_assumed: outcome.fees.is_role_assumed,
              notes: Object.freeze([
                'Vente sans achat antérieur couvrant. Coût et profit non calculables sans inventaire préalable.',
              ]),
            },
            unmatched_sell_quantity: sellTx.quantity,
          };

          completedCycles.push(cycleRecord);
        }
      }
    }

    // Also include fulfilled orders from orderHistory if transactions array was partially truncated
    if (completedCycles.length === 0 && orderHistory.length > 0) {
      const fulfilledOrders = orderHistory.filter((o) => o.state === 'fulfilled');
      for (const order of fulfilledOrders) {
        const orderVolIsk = order.price * order.volume_total;
        if (order.is_buy_order) totalBuyVolumeIsk += orderVolIsk;
        else totalSellVolumeIsk += orderVolIsk;
      }
    }

    // Totals & KPI derivation
    totalRealizedProfit = roundIsk(totalRealizedProfit);
    totalRealizedGross = roundIsk(totalRealizedGross);
    totalBrokerFeesPaid = roundIsk(totalBrokerFeesPaid);
    totalSalesTaxPaid = roundIsk(totalSalesTaxPaid);
    totalEstimatedFees = roundIsk(totalEstimatedFees);

    const closedCycles = completedCycles.filter((c) => c.quantity > 0);
    const profitableTrades = closedCycles.filter((c) => c.is_profitable).length;
    const unprofitableTrades = closedCycles.filter((c) => !c.is_profitable).length;
    const totalClosedTrades = closedCycles.length;
    const winRatePct = totalClosedTrades > 0 ? (profitableTrades / totalClosedTrades) * 100 : 100;

    const avgRealizedRoi =
      totalClosedTrades > 0
        ? closedCycles.reduce((acc, c) => acc + c.roi, 0) / totalClosedTrades
        : 0;

    const avgHoldDays =
      totalClosedTrades > 0
        ? closedCycles.reduce((acc, c) => acc + c.hold_days, 0) / totalClosedTrades
        : 0;

    // Top Profitable Items
    const topProfitableItems = Object.values(itemProfitMap)
      .map((item) => ({
        type_id: item.type_id,
        type_name: item.type_name,
        category_name: item.category_name,
        total_profit: roundIsk(item.total_profit),
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
      categorySuccessRate[cat].win_rate =
        catCycles.length > 0 ? (catWins / catCycles.length) * 100 : 0;
      categorySuccessRate[cat].avg_roi =
        catCycles.length > 0 ? catCycles.reduce((a, b) => a + b.roi, 0) / catCycles.length : 0;
    }

    // Location Breakdown
    const activityByLocation = Object.entries(locationVolumeMap)
      .map(([idStr, val]) => ({
        location_id: Number(idStr),
        location_name: val.name,
        total_volume_isk: roundIsk(val.volumeIsk),
        transaction_count: val.count,
      }))
      .sort((a, b) => b.total_volume_isk - a.total_volume_isk)
      .slice(0, 8);

    // Determine Overall Financial Completeness
    let overallCompleteness: FinancialCompleteness = 'ESTIMATED';
    if (hasPartial) {
      overallCompleteness = 'PARTIAL';
    } else if (hasUnavailable) {
      overallCompleteness = 'UNAVAILABLE';
    } else if (
      completedCycles.length > 0 &&
      completedCycles.every((c) => c.financial_completeness === 'OBSERVED')
    ) {
      overallCompleteness = 'OBSERVED';
    }

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
      total_buy_volume: roundIsk(totalBuyVolumeIsk),
      total_sell_volume: roundIsk(totalSellVolumeIsk),
      total_turnover: roundIsk(totalBuyVolumeIsk + totalSellVolumeIsk),
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
      // Financial Truth & Completeness metrics (Chantier 3B-4A.2)
      financial_completeness: overallCompleteness,
      total_realized_gross: totalRealizedGross,
      total_estimated_fees: totalEstimatedFees,
      has_unmatched_trades: hasUnmatchedTrades,
      unmatched_trades_count: unmatchedTradesCount,
    };

    // Cache metrics in localStorage
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${characterId}`, JSON.stringify(metrics));
    } catch {}

    return metrics;
  }

  /**
   * Computes TraderPerformanceMetrics directly from correlated CharacterExecutionRecords.
   * Leverages RealizedFinancialOutcomeEngine as the canonical source of truth.
   */
  static processExecutionRecords(
    characterId: number,
    characterName: string,
    records: readonly CharacterExecutionRecord[],
    accountingLevel: number = 4,
    brokerRelationsLevel: number = 4,
    orderHistory: EveCharacterOrderHistory[] = []
  ): TraderPerformanceMetrics {
    const allTxs: EveCharacterTransaction[] = [];
    for (const rec of records) {
      for (const tx of rec.execution_outcome.buy_transactions) {
        allTxs.push({
          transaction_id: tx.transaction_id,
          date: tx.timestamp,
          type_id: tx.type_id,
          location_id: tx.location_id,
          unit_price: tx.unit_price,
          quantity: tx.quantity,
          is_buy: true,
          is_personal: true,
          client_id: 0,
        });
      }
      for (const tx of rec.execution_outcome.sell_transactions) {
        allTxs.push({
          transaction_id: tx.transaction_id,
          date: tx.timestamp,
          type_id: tx.type_id,
          location_id: tx.location_id,
          unit_price: tx.unit_price,
          quantity: tx.quantity,
          is_buy: false,
          is_personal: true,
          client_id: 0,
        });
      }
    }

    return this.processTransactions(
      characterId,
      characterName,
      allTxs,
      orderHistory,
      [],
      accountingLevel,
      brokerRelationsLevel
    );
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
    const categoryInfo = CatalogRepository.getInstance().getCategory(categoryId);
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
