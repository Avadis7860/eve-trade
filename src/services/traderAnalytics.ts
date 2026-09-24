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
  FinancialConfig,
  RealizedFeeBreakdown,
  RealizedFinancialCalculationOptions,
  RealizedFinancialOutcome,
  CapitalRecoverySummary,
  FinancialProvenance,
} from '../types';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import {
  RealizedFinancialOutcomeEngine,
  CrossCharacterFinancialMappingViolationError,
} from '../engine/realizedFinancialOutcome';
import { reconstructPositionLedger } from '../engine/positionLedger';
import { roundIsk, safeDiv } from '../engine/money';

const STORAGE_KEY_PREFIX = 'eve_trader_analytics_';

export class TraderAnalyticsService {
  /**
   * Matches buy and sell transactions chronologically (causal FIFO with RealizedFinancialOutcomeEngine)
   * to compute actual realized P&L cycles for each traded item.
   * Delegated 100% to RealizedFinancialOutcomeEngine as single source of truth.
   * Eliminates any concurrent or secondary financial calculations in TraderAnalyticsService.
   */
  static processTransactions(
    characterId: number,
    characterName: string,
    transactions: EveCharacterTransaction[],
    orderHistory: EveCharacterOrderHistory[] = [],
    journalEntries: EveCharacterJournalEntry[] = [],
    accountingLevel?: number,
    brokerRelationsLevel?: number,
    options?: RealizedFinancialCalculationOptions
  ): TraderPerformanceMetrics {
    // 1. Cross-character isolation: reject foreign transactions immediately
    for (const tx of transactions) {
      const txCharId =
        'character_id' in tx && (tx as any).character_id !== undefined
          ? (tx as any).character_id
          : characterId;
      if (txCharId !== characterId) {
        throw new CrossCharacterFinancialMappingViolationError(
          txCharId,
          characterId,
          tx.transaction_id
        );
      }
    }

    // Sort transactions deterministically: timestamp ASC, transaction_id ASC
    const sortedTx = [...transactions].sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.transaction_id - b.transaction_id
    );

    // Group by type_id & track location metrics
    let totalBuyVolumeIsk = 0;
    let totalSellVolumeIsk = 0;
    let observedFulfilledOrderActivityIsk: number | undefined;
    const locationVolumeMap: Record<number, { name: string; volumeIsk: number; count: number }> = {};
    const txByType: Record<number, EveCharacterTransaction[]> = {};

    for (const tx of sortedTx) {
      const locId = tx.location_id;
      const locName = tx.location_name || UniverseRepository.getInstance().getStationNameSync(locId);
      if (!locationVolumeMap[locId]) {
        locationVolumeMap[locId] = { name: locName, volumeIsk: 0, count: 0 };
      }
      const hasValidEconomicAmount =
        Number.isFinite(tx.unit_price) &&
        tx.unit_price > 0 &&
        Number.isFinite(tx.quantity) &&
        tx.quantity > 0;
      const val = hasValidEconomicAmount ? tx.unit_price * tx.quantity : null;
      if (val !== null) {
        locationVolumeMap[locId].volumeIsk += val;
        if (tx.is_buy) {
          totalBuyVolumeIsk += val;
        } else {
          totalSellVolumeIsk += val;
        }
      }
      locationVolumeMap[locId].count += 1;

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

    let capitalCommittedTotal = 0;
    let cashRecoveredTotal = 0;
    let remainingQuantityTotal = 0;
    let remainingCostBasisTotal = 0;
    let knownCapitalPositions = 0;
    let openCapitalPositions = 0;
    let partialCapitalPositions = 0;
    let closedCapitalPositions = 0;
    let capitalRecoveryPartial = false;
    const capitalRecoveryProvenance = new Map<string, FinancialProvenance>();

    // Determine effective financial configuration
    let effectiveFinancialConfig: Partial<FinancialConfig> | undefined;
    if (options && 'financialConfig' in options) {
      effectiveFinancialConfig = options.financialConfig;
    } else if (accountingLevel !== undefined && brokerRelationsLevel !== undefined) {
      effectiveFinancialConfig = {
        accounting_level: accountingLevel,
        broker_relations_level: brokerRelationsLevel,
        enable_transport_costs: false,
      };
    } else if (accountingLevel === undefined && brokerRelationsLevel === undefined && !options) {
      // Default convenience fallback if omitted completely
      effectiveFinancialConfig = {
        accounting_level: 4,
        broker_relations_level: 4,
        enable_transport_costs: false,
      };
    } else {
      effectiveFinancialConfig = undefined;
    }

    const calcOptions: RealizedFinancialCalculationOptions = {
      financialConfig: effectiveFinancialConfig,
      executionFeeMode: options?.executionFeeMode ?? 'MAKER_MAKER',
      buyLocationProfile: options?.buyLocationProfile,
      sellLocationProfile: options?.sellLocationProfile,
    };

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

      // Delegate calculation 100% to RealizedFinancialOutcomeEngine as sole source of truth
      const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(
        characterId,
        typeId,
        typeTxs,
        calcOptions
      );

      // Position state comes from economic transaction facts. Market-order side
      // and active order observations are intentionally outside this accounting path.
      const positionLedger = reconstructPositionLedger(characterId, typeId, typeTxs);

      if (positionLedger.position.financial_completeness === 'PARTIAL') {
        capitalRecoveryPartial = true;
      }
      if (
        positionLedger.position.capital_committed !== null &&
        positionLedger.position.cash_recovered !== null
      ) {
        capitalCommittedTotal = roundIsk(
          capitalCommittedTotal + positionLedger.position.capital_committed,
        );
        cashRecoveredTotal = roundIsk(
          cashRecoveredTotal + positionLedger.position.cash_recovered,
        );
        remainingQuantityTotal += positionLedger.position.remaining_quantity;
        remainingCostBasisTotal = roundIsk(
          remainingCostBasisTotal + positionLedger.position.remaining_cost_basis,
        );
        knownCapitalPositions += 1;
        for (const lot of positionLedger.position.lots) {
          const provenance = lot.provenance;
          capitalRecoveryProvenance.set(
            `${provenance.source_kind}|${provenance.source_id}|${provenance.principal_scope}`,
            provenance,
          );
        }
        for (const allocation of positionLedger.position.allocations) {
          const provenance = allocation.provenance;
          capitalRecoveryProvenance.set(
            `${provenance.source_kind}|${provenance.source_id}|${provenance.principal_scope}`,
            provenance,
          );
        }

        if (positionLedger.position.lifecycle_status === 'OPEN') {
          openCapitalPositions += 1;
        }
        if (positionLedger.position.lifecycle_status === 'PARTIALLY_REALIZED') {
          partialCapitalPositions += 1;
        }
        if (positionLedger.position.lifecycle_status === 'CLOSED') {
          closedCapitalPositions += 1;
        }
      }

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

      // Group allocations by sell_transaction_id to derive trade cycles directly from engine output
      const allocationsBySellTx: Record<number, typeof outcome.fifo_allocations[number][]> = {};
      for (const alloc of outcome.fifo_allocations) {
        if (!allocationsBySellTx[alloc.sell_transaction_id]) {
          allocationsBySellTx[alloc.sell_transaction_id] = [];
        }
        allocationsBySellTx[alloc.sell_transaction_id].push(alloc);
      }

      const sellTxs = typeTxs.filter((t) => !t.is_buy);
      const matchedSellTxs = sellTxs.filter(
        (tx) => (allocationsBySellTx[tx.transaction_id]?.length ?? 0) > 0
      );
      const numMatched = matchedSellTxs.length;

      const allocatedState = {
        allocatedBuyBrokerFee: 0,
        allocatedSellBrokerFee: 0,
        allocatedSalesTax: 0,
        allocatedTotalFees: 0,
        allocatedNetProfit: 0,
      };

      for (const sellTx of sellTxs) {
        const allocs = allocationsBySellTx[sellTx.transaction_id] || [];
        const matchedQty = allocs.reduce((sum, a) => sum + a.allocated_quantity, 0);
        const unmatchedQty = Math.max(0, sellTx.quantity - matchedQty);

        if (matchedQty === 0 && unmatchedQty === 0) continue;

        if (matchedQty > 0) {
          const matchedIndex = matchedSellTxs.indexOf(sellTx);
          const isLastMatched = matchedIndex === numMatched - 1;

          // Pure projection of the engine's canonical FIFO allocations for this specific sell transaction
          const totalBuyCost = roundIsk(allocs.reduce((sum, a) => sum + a.gross_cost, 0));
          const totalSellRevenue = roundIsk(allocs.reduce((sum, a) => sum + a.gross_revenue, 0));
          const grossProfit = roundIsk(totalSellRevenue - totalBuyCost);

          // Attribute fees and net profit directly from outcome.fees and outcome.net_realized_profit
          // No FeeEngine recalculation — strictly derived via deterministic conservation partitioning
          const {
            cycleBuyBrokerFee,
            cycleSellBrokerFee,
            cycleSalesTax,
            cycleFees,
            netProfit,
          } = TraderAnalyticsService.projectCycleFinancials(
            outcome,
            grossProfit,
            totalBuyCost,
            totalSellRevenue,
            isLastMatched,
            numMatched,
            allocatedState
          );

          const roi = totalBuyCost > 0 ? safeDiv(netProfit, totalBuyCost, 0) : null;
          const isProfitable = netProfit > 0;

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
            buyTxSample
              ? UniverseRepository.getInstance().getStationNameSync(buyTxSample.location_id) || 'Station Inconnue'
              : 'Station Inconnue';
          const sellLocation =
            sellTx.location_name ||
            UniverseRepository.getInstance().getStationNameSync(sellTx.location_id) ||
            'Station Inconnue';

          const cycleCompleteness: FinancialCompleteness =
            unmatchedQty > 0 ? 'PARTIAL' : outcome.financial_completeness;
          const dispositionState = positionLedger.position.disposition_states.find(
            (state) => state.disposition_transaction_id === sellTx.transaction_id,
          );
          const positionLifecycle = dispositionState?.lifecycle_status ?? 'UNKNOWN';
          const positionRemainingQuantity = dispositionState?.remaining_position_quantity;

          const cycleProfitLabel =
            cycleCompleteness === 'UNAVAILABLE'
              ? 'Profit Réalisé (Hors Frais)'
              : cycleCompleteness === 'OBSERVED'
              ? 'Bénéfice Net Réalisé (Certifié)'
              : cycleCompleteness === 'PARTIAL'
              ? 'Bénéfice Réalisé (Partiel)'
              : 'Bénéfice Net Réalisé (Estimé)';

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
            total_buy_cost: totalBuyCost,
            total_sell_revenue: totalSellRevenue,
            gross_profit: grossProfit,
            estimated_fees_paid: cycleFees,
            net_profit: netProfit,
            roi: roi,
            hold_days: Number(holdDays.toFixed(1)),
            is_profitable: isProfitable,
            buy_location: buyLocation,
            sell_location: sellLocation,
            financial_completeness: cycleCompleteness,
            is_net_estimated:
              cycleCompleteness === 'OBSERVED' || cycleCompleteness === 'UNAVAILABLE'
                ? false
                : true,
            realized_profit_label: cycleProfitLabel,
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
            position_lifecycle: positionLifecycle,
            position_remaining_quantity: positionRemainingQuantity,
            is_position_closed: positionLifecycle === 'CLOSED',
            character_id: characterId,
            character_name: characterName,
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
          itemProfitMap[typeId].total_profit = roundIsk(itemProfitMap[typeId].total_profit + netProfit);
          if (positionLifecycle === 'CLOSED') {
          itemProfitMap[typeId].trades_count += 1;
        }
          if (roi !== null) {
            itemProfitMap[typeId].rois.push(roi);
          }
          itemProfitMap[typeId].hold_days_list.push(holdDays);
          itemProfitMap[typeId].total_volume_units += matchedQty;
        } else {
          // Completely unmatched sell: NO prior buy lots matched (orphan/oversold)
          // INVARIANT: No synthetic buy price, cost basis, or fake profit is fabricated.
          const sellLocation =
            sellTx.location_name ||
            UniverseRepository.getInstance().getStationNameSync(sellTx.location_id) ||
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
            total_sell_revenue: 0,
            gross_profit: 0,
            estimated_fees_paid: 0,
            net_profit: 0,
            roi: null,
            hold_days: 0,
            is_profitable: false,
            buy_location: 'Inconnu (Sans Achat Antérieur)',
            sell_location: sellLocation,
            financial_completeness: 'PARTIAL',
            is_net_estimated: outcome.fees.fee_mode === 'UNAVAILABLE' ? false : true,
            realized_profit_label: 'Bénéfice Réalisé (Partiel)',
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
            character_id: characterId,
            character_name: characterName,
          };

          completedCycles.push(cycleRecord);
        }
      }
    }

    // Market-order history is activity/provenance evidence only.
    // Its is_buy_order side must never be converted into economic buy/sell volume:
    // a trader may acquire via someone else's SELL order and later resell via a SELL order.
    if (orderHistory.length > 0) {
      let observedVolume = 0;
      let hasObservedVolume = false;
      for (const order of orderHistory) {
        if (
          order.state === 'fulfilled' &&
          Number.isFinite(order.price) &&
          order.price > 0 &&
          Number.isFinite(order.volume_total) &&
          order.volume_total > 0
        ) {
          observedVolume += order.price * order.volume_total;
          hasObservedVolume = true;
        }
      }
      if (hasObservedVolume) {
        observedFulfilledOrderActivityIsk = roundIsk(observedVolume);
      }
    }

    // Totals & KPI derivation
    totalRealizedProfit = roundIsk(totalRealizedProfit);
    totalRealizedGross = roundIsk(totalRealizedGross);
    totalBrokerFeesPaid = roundIsk(totalBrokerFeesPaid);
    totalSalesTaxPaid = roundIsk(totalSalesTaxPaid);
    totalEstimatedFees = roundIsk(totalEstimatedFees);

    const closedCycles = completedCycles.filter(
      (c) => c.quantity > 0 && c.is_position_closed === true,
    );
    const profitableTrades = closedCycles.filter((c) => c.is_profitable).length;
    const unprofitableTrades = closedCycles.filter((c) => !c.is_profitable).length;
    const totalClosedTrades = closedCycles.length;
    const winRatePct: number | null =
      totalClosedTrades > 0 ? (profitableTrades / totalClosedTrades) * 100 : null;

    const closedRoiCycles = closedCycles.filter((c) => c.roi !== null);
    const avgRealizedRoi =
      closedRoiCycles.length > 0
        ? closedRoiCycles.reduce((acc, c) => c.roi === null ? acc : acc + c.roi, 0) / closedRoiCycles.length
        : null;

    const avgHoldDays =
      totalClosedTrades > 0
        ? closedCycles.reduce((acc, c) => acc + c.hold_days, 0) / totalClosedTrades
        : 0;

    // Helper to derive unified financial completeness, label, and is_net_estimated flag
    const deriveFinancialStatus = (
      cycles: readonly TradeCycleRecord[]
    ): {
      completeness: FinancialCompleteness;
      label: string;
      is_net_estimated: boolean;
    } => {
      if (cycles.length === 0) {
        return {
          completeness: 'UNAVAILABLE',
          label: 'Bénéfice Réalisé — Aucune observation',
          is_net_estimated: false,
        };
      }
      const hasPart = cycles.some((c) => c.financial_completeness === 'PARTIAL');
      const hasUnavail = cycles.some((c) => c.financial_completeness === 'UNAVAILABLE');
      const allObs = cycles.every((c) => c.financial_completeness === 'OBSERVED');

      if (hasPart) {
        return {
          completeness: 'PARTIAL',
          label: 'Bénéfice Réalisé (Partiel)',
          is_net_estimated: !hasUnavail,
        };
      }
      if (hasUnavail) {
        return {
          completeness: 'UNAVAILABLE',
          label: 'Profit Réalisé (Hors Frais)',
          is_net_estimated: false,
        };
      }
      if (allObs) {
        return {
          completeness: 'OBSERVED',
          label: 'Bénéfice Net Réalisé (Certifié)',
          is_net_estimated: false,
        };
      }
      return {
        completeness: 'ESTIMATED',
        label: 'Bénéfice Net Réalisé (Estimé)',
        is_net_estimated: true,
      };
    };

    // Top Profitable Items
    const topProfitableItems = Object.values(itemProfitMap)
      .map((item) => {
        const itemCycles = closedCycles.filter((c) => c.type_id === item.type_id);
        const status = deriveFinancialStatus(itemCycles);
        return {
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
          profit_label: status.label,
          is_net_estimated: status.is_net_estimated,
        };
      })
      .sort((a, b) => b.total_profit - a.total_profit)
      .slice(0, 15);

    // Category Success Rate
    const categorySuccessRate: Record<
      string,
      {
        total_trades: number;
        profit_isk: number;
        win_rate: number;
        avg_roi: number;
        profit_label?: string;
        is_net_estimated?: boolean;
      }
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
      const catCycles = closedCycles.filter((c) => (c.category_name || 'Général') === cat);
      const catWins = catCycles.filter((c) => c.is_profitable).length;
      categorySuccessRate[cat].win_rate =
        catCycles.length > 0 ? (catWins / catCycles.length) * 100 : 0;
      const catRoiCycles = catCycles.filter((c) => c.roi !== null);
      categorySuccessRate[cat].avg_roi =
        catRoiCycles.length > 0
          ? catRoiCycles.reduce((a, b) => b.roi === null ? a : a + b.roi, 0) / catRoiCycles.length
          : 0;
      const status = deriveFinancialStatus(catCycles);
      categorySuccessRate[cat].profit_label = status.label;
      categorySuccessRate[cat].is_net_estimated = status.is_net_estimated;
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

    const capitalRecovery: CapitalRecoverySummary | undefined =
      knownCapitalPositions > 0
        ? Object.freeze({
            scope: 'KNOWN_POSITIONS',
            financial_completeness: capitalRecoveryPartial ? 'PARTIAL' : 'OBSERVED',
            capital_committed: capitalCommittedTotal,
            cash_recovered: cashRecoveredTotal,
            capital_recovery_delta: roundIsk(cashRecoveredTotal - capitalCommittedTotal),
            capital_recovery_ratio:
              capitalCommittedTotal > 0
                ? cashRecoveredTotal / capitalCommittedTotal
                : null,
            provenance: Object.freeze([...capitalRecoveryProvenance.values()]),
            remaining_quantity: remainingQuantityTotal,
            remaining_cost_basis: remainingCostBasisTotal,
            known_position_count: knownCapitalPositions,
            open_position_count: openCapitalPositions,
            partially_realized_position_count: partialCapitalPositions,
            closed_position_count: closedCapitalPositions,
          })
        : undefined;

    // Determine Overall Financial Completeness
    const overallStatus = deriveFinancialStatus(completedCycles);
    const overallCompleteness: FinancialCompleteness = overallStatus.completeness;
    const metricsProfitLabel = overallStatus.label;
    const isNetEstimated = overallStatus.is_net_estimated;

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
      ...(observedFulfilledOrderActivityIsk !== undefined
        ? { observed_fulfilled_order_activity_isk: observedFulfilledOrderActivityIsk }
        : {}),
      total_closed_trades: totalClosedTrades,
      profitable_trades: profitableTrades,
      unprofitable_trades: unprofitableTrades,
      win_rate_pct: winRatePct,
      average_realized_roi: avgRealizedRoi,
      average_realized_roi_scope: 'CLOSING_DISPOSAL_ALLOCATIONS',
      average_hold_days: avgHoldDays,
      ...(capitalRecovery ? { capital_recovery: capitalRecovery } : {}),
      total_broker_fees_paid: totalBrokerFeesPaid,
      total_sales_tax_paid: totalSalesTaxPaid,
      top_profitable_items: topProfitableItems,
      recent_trade_cycles: [...completedCycles]
        .sort((a, b) => {
          const timeA = new Date(a.sell_date || a.buy_date).getTime();
          const timeB = new Date(b.sell_date || b.buy_date).getTime();
          return timeB - timeA || b.cycle_id.localeCompare(a.cycle_id);
        })
        .slice(0, 50),
      activity_by_location: activityByLocation,
      category_success_rate: categorySuccessRate,
      trader_title: traderTitle,
      trader_badge_color: traderBadgeColor,
      calibration_weight:
        winRatePct === null
          ? 1.0
          : Math.min(1.3, Math.max(0.7, 1 + (winRatePct - 50) / 100)),
      // Financial Truth & Completeness metrics (Chantier 3B-4A.2 & Final Gate)
      financial_completeness: overallCompleteness,
      is_net_estimated: isNetEstimated,
      realized_profit_label: metricsProfitLabel,
      execution_fee_mode: calcOptions.executionFeeMode,
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
    accountingLevel?: number,
    brokerRelationsLevel?: number,
    orderHistory: EveCharacterOrderHistory[] = [],
    options?: RealizedFinancialCalculationOptions
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
      brokerRelationsLevel,
      options
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
        historical_avg_roi: null,
        historical_win_rate: null,
        historical_avg_hold_days: null,
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
      historical_avg_roi: null,
      historical_win_rate: null,
      historical_avg_hold_days: null,
      calibration_confidence_boost: 0,
      badge_text: 'Non Négocié',
      badge_type: 'new',
      summary: 'Première analyse pour cet item dans votre profil de trading.',
    };
  }

  /**
   * Deterministic projection helper for cycle-level fee and net profit partitioning.
   * STRICT ARCHITECTURAL INVARIANT:
   * This is strictly a consumer projection and exact conservation partition of the
   * canonical RealizedFinancialOutcome generated by RealizedFinancialOutcomeEngine.
   * TraderAnalyticsService MUST NOT redefine accounting or recalculate fees independently.
   *
   * Uses a local deterministic accumulator state (allocatedState) across sequential cycle iterations
   * to guarantee zero-loss conservation:
   *  - Σ cycle.fees == outcome.fees.estimated_total_fees
   *  - Σ cycle.net_profit == outcome.net_realized_profit
   *
   * Note: Mutates the local accumulator `allocatedState` tracking previously partitioned amounts.
   */
  private static projectCycleFinancials(
    outcome: RealizedFinancialOutcome,
    cycleGrossProfit: number,
    totalBuyCost: number,
    totalSellRevenue: number,
    isLastMatched: boolean,
    numMatched: number,
    allocatedState: {
      allocatedBuyBrokerFee: number;
      allocatedSellBrokerFee: number;
      allocatedSalesTax: number;
      allocatedTotalFees: number;
      allocatedNetProfit: number;
    }
  ): {
    cycleBuyBrokerFee: number;
    cycleSellBrokerFee: number;
    cycleSalesTax: number;
    cycleFees: number;
    netProfit: number;
  } {
    if (outcome.fees.fee_mode === 'UNAVAILABLE') {
      return {
        cycleBuyBrokerFee: 0,
        cycleSellBrokerFee: 0,
        cycleSalesTax: 0,
        cycleFees: 0,
        netProfit: cycleGrossProfit,
      };
    }

    if (numMatched === 1) {
      return {
        cycleBuyBrokerFee: outcome.fees.estimated_buy_broker_fee,
        cycleSellBrokerFee: outcome.fees.estimated_sell_broker_fee,
        cycleSalesTax: outcome.fees.estimated_sales_tax,
        cycleFees: outcome.fees.estimated_total_fees,
        netProfit: outcome.net_realized_profit,
      };
    }

    if (!isLastMatched) {
      const propBuy =
        outcome.realized_acquisition_cost > 0
          ? totalBuyCost / outcome.realized_acquisition_cost
          : 0;
      const propSell =
        outcome.realized_revenue > 0 ? totalSellRevenue / outcome.realized_revenue : 0;
      const cycleBuyBrokerFee = roundIsk(outcome.fees.estimated_buy_broker_fee * propBuy);
      const cycleSellBrokerFee = roundIsk(outcome.fees.estimated_sell_broker_fee * propSell);
      const cycleSalesTax = roundIsk(outcome.fees.estimated_sales_tax * propSell);
      const cycleFees = roundIsk(cycleBuyBrokerFee + cycleSellBrokerFee + cycleSalesTax);
      const netProfit = roundIsk(cycleGrossProfit - cycleFees);

      allocatedState.allocatedBuyBrokerFee += cycleBuyBrokerFee;
      allocatedState.allocatedSellBrokerFee += cycleSellBrokerFee;
      allocatedState.allocatedSalesTax += cycleSalesTax;
      allocatedState.allocatedTotalFees += cycleFees;
      allocatedState.allocatedNetProfit += netProfit;

      return {
        cycleBuyBrokerFee,
        cycleSellBrokerFee,
        cycleSalesTax,
        cycleFees,
        netProfit,
      };
    }

    // Last matched cycle absorbs remainder for exact conservation:
    // Σ cycle.fees == outcome.fees.estimated_total_fees
    // Σ cycle.net_profit == outcome.net_realized_profit
    const cycleBuyBrokerFee = roundIsk(
      outcome.fees.estimated_buy_broker_fee - allocatedState.allocatedBuyBrokerFee
    );
    const cycleSellBrokerFee = roundIsk(
      outcome.fees.estimated_sell_broker_fee - allocatedState.allocatedSellBrokerFee
    );
    const cycleSalesTax = roundIsk(
      outcome.fees.estimated_sales_tax - allocatedState.allocatedSalesTax
    );
    const cycleFees = roundIsk(
      outcome.fees.estimated_total_fees - allocatedState.allocatedTotalFees
    );
    const netProfit = roundIsk(
      outcome.net_realized_profit - allocatedState.allocatedNetProfit
    );

    return {
      cycleBuyBrokerFee,
      cycleSellBrokerFee,
      cycleSalesTax,
      cycleFees,
      netProfit,
    };
  }

  /**
   * Consolidated Multi-Character (Fleet) FIFO Transaction Processing
   * Pools transactions from all connected characters to correctly match cross-character trades
   * (e.g., Pilot A buys Livestock, Pilot B sells Livestock).
   */
  static processFleetConsolidatedTransactions(
    characters: {
      character_id: number;
      character_name: string;
      accounting_level?: number;
      broker_relations_level?: number;
    }[],
    allTransactions: EveCharacterTransaction[],
    orderHistory: EveCharacterOrderHistory[] = [],
    journalEntries: EveCharacterJournalEntry[] = [],
    options?: RealizedFinancialCalculationOptions
  ): TraderPerformanceMetrics {
    const charMap = new Map<
      number,
      {
        character_id: number;
        character_name: string;
        accounting_level: number;
        broker_relations_level: number;
      }
    >();

    for (const c of characters) {
      charMap.set(c.character_id, {
        character_id: c.character_id,
        character_name: c.character_name,
        accounting_level: c.accounting_level ?? 4,
        broker_relations_level: c.broker_relations_level ?? 4,
      });
    }

    // Sort transactions deterministically: timestamp ASC, transaction_id ASC
    const sortedTx = [...allTransactions].sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        a.transaction_id - b.transaction_id
    );

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
      const hasValidEconomicAmount =
        Number.isFinite(tx.unit_price) &&
        tx.unit_price > 0 &&
        Number.isFinite(tx.quantity) &&
        tx.quantity > 0;
      const val = hasValidEconomicAmount ? tx.unit_price * tx.quantity : null;
      if (val !== null) {
        locationVolumeMap[locId].volumeIsk += val;
        if (tx.is_buy) {
          totalBuyVolumeIsk += val;
        } else {
          totalSellVolumeIsk += val;
        }
      }
      locationVolumeMap[locId].count += 1;

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

    for (const [typeIdStr, typeTxs] of Object.entries(txByType)) {
      const typeId = Number(typeIdStr);
      const typeDetail = CatalogRepository.getInstance().getTypeById(typeId);
      const typeName = typeDetail?.name || `Type #${typeId}`;
      const categoryName = typeDetail?.category_name || 'Général';

      const buyTxs = typeTxs.filter((t) => t.is_buy);
      const sellTxs = typeTxs.filter((t) => !t.is_buy);

      // Build unified FIFO lots
      const lots = buyTxs.map((b) => ({
        buy_transaction_id: b.transaction_id,
        character_id: b.character_id,
        character_name:
          b.character_name ||
          (b.character_id !== undefined
            ? charMap.get(b.character_id)?.character_name
            : undefined) ||
          'Pilote inconnu',
        date: b.date,
        location_id: b.location_id,
        location_name:
          b.location_name ||
          UniverseRepository.getInstance().getStationNameSync(b.location_id) ||
          'Station Inconnue',
        unit_price: b.unit_price,
        original_quantity: b.quantity,
        remaining_quantity: b.quantity,
      }));

      for (const sellTx of sellTxs) {
        let sellRemaining = sellTx.quantity;
        const sellUnitPrice = sellTx.unit_price;
        const sellTimeMs = new Date(sellTx.date).getTime();
        const sellCharId = sellTx.character_id;
        const sellCharName =
          sellTx.character_name ||
          (sellCharId !== undefined ? charMap.get(sellCharId)?.character_name : undefined) ||
          'Pilote inconnu';
        const sellLocation =
          sellTx.location_name ||
          UniverseRepository.getInstance().getStationNameSync(sellTx.location_id) ||
          'Station Inconnue';

        const matchedLots: Array<{
          lot: (typeof lots)[0];
          allocatedQuantity: number;
        }> = [];

        for (let i = 0; i < lots.length; i++) {
          const lot = lots[i];
          if (sellRemaining <= 0) break;
          if (lot.remaining_quantity <= 0) continue;

          const buyTimeMs = new Date(lot.date).getTime();
          const isCausallyEligible =
            buyTimeMs < sellTimeMs ||
            (buyTimeMs === sellTimeMs &&
              (lot.character_id !== sellCharId || lot.buy_transaction_id <= sellTx.transaction_id));

          if (!isCausallyEligible) {
            break;
          }

          const allocated = Math.min(lot.remaining_quantity, sellRemaining);
          lot.remaining_quantity -= allocated;
          sellRemaining -= allocated;
          matchedLots.push({ lot, allocatedQuantity: allocated });
        }

        const matchedQty = sellTx.quantity - sellRemaining;
        const unmatchedQty = sellRemaining;

        if (matchedQty > 0) {
          let totalBuyCost = 0;
          let totalWeightedBuyTimeMs = 0;
          const buyCharNames = new Set<string>();
          const buyCharIds = new Set<number>();
          let primaryBuyLocation = '';

          for (const m of matchedLots) {
            const lotCost = roundIsk(m.allocatedQuantity * m.lot.unit_price);
            totalBuyCost += lotCost;
            totalWeightedBuyTimeMs += new Date(m.lot.date).getTime() * m.allocatedQuantity;
            buyCharNames.add(m.lot.character_name);
            if (m.lot.character_id !== undefined) buyCharIds.add(m.lot.character_id);
            if (!primaryBuyLocation) primaryBuyLocation = m.lot.location_name;
          }

          const weightedBuyTimeMs = totalWeightedBuyTimeMs / matchedQty;
          const holdDays = Math.max(0, (sellTimeMs - weightedBuyTimeMs) / (1000 * 60 * 60 * 24));
          const totalSellRevenue = roundIsk(matchedQty * sellUnitPrice);
          const grossProfit = roundIsk(totalSellRevenue - totalBuyCost);

          const sellerInfo =
            (sellCharId !== undefined ? charMap.get(sellCharId) : undefined) || {
              accounting_level: 4,
              broker_relations_level: 4,
            };
          const accountingLevel = sellerInfo.accounting_level;
          const brokerRelationsLevel = sellerInfo.broker_relations_level;

          const salesTaxRate = 0.08 * (1 - 0.11 * accountingLevel);
          const cycleSalesTax = roundIsk(totalSellRevenue * salesTaxRate);

          const brokerFeeRate = 0.03 * (1 - 0.05 * brokerRelationsLevel);
          const cycleBrokerFee = roundIsk(totalSellRevenue * brokerFeeRate);

          const cycleFees = roundIsk(cycleSalesTax + cycleBrokerFee);
          const netProfit = roundIsk(grossProfit - cycleFees);
          const roi = totalBuyCost > 0 ? netProfit / totalBuyCost : 0;
          const isProfitable = netProfit > 0;

          totalRealizedGross = roundIsk(totalRealizedGross + grossProfit);
          totalRealizedProfit = roundIsk(totalRealizedProfit + netProfit);
          totalSalesTaxPaid = roundIsk(totalSalesTaxPaid + cycleSalesTax);
          totalBrokerFeesPaid = roundIsk(totalBrokerFeesPaid + cycleBrokerFee);
          totalEstimatedFees = roundIsk(totalEstimatedFees + cycleFees);

          if (unmatchedQty > 0) {
            hasUnmatchedTrades = true;
            unmatchedTradesCount += 1;
          }

          const buyCharNameStr = Array.from(buyCharNames).join(', ');
          const isCrossCharacter =
            buyCharIds.size > 1 || (buyCharIds.size === 1 && !buyCharIds.has(sellCharId));

          const cycleCompleteness: FinancialCompleteness = unmatchedQty > 0 ? 'PARTIAL' : 'OBSERVED';
          const cycleProfitLabel =
            cycleCompleteness === 'OBSERVED'
              ? 'Bénéfice Net Flotte (Certifié)'
              : 'Bénéfice Flotte (Partiel)';

          const cycleRecord: TradeCycleRecord = {
            cycle_id: `cycle_${sellTx.transaction_id}_${typeId}_fleet`,
            type_id: typeId,
            type_name: typeName,
            category_name: categoryName,
            buy_date: new Date(weightedBuyTimeMs).toISOString(),
            sell_date: sellTx.date,
            quantity: matchedQty,
            avg_buy_price: matchedQty > 0 ? totalBuyCost / matchedQty : 0,
            avg_sell_price: sellUnitPrice,
            total_buy_cost: totalBuyCost,
            total_sell_revenue: totalSellRevenue,
            gross_profit: grossProfit,
            estimated_fees_paid: cycleFees,
            net_profit: netProfit,
            roi: roi,
            hold_days: Number(holdDays.toFixed(1)),
            is_profitable: isProfitable,
            buy_location: primaryBuyLocation,
            sell_location: sellLocation,
            financial_completeness: cycleCompleteness,
            is_net_estimated: false,
            realized_profit_label: cycleProfitLabel,
            fees_breakdown: {
              fee_mode: 'ESTIMATED',
              fee_source: 'CONFIG_ESTIMATE',
              execution_fee_mode: 'TAKER_MAKER',
              estimated_buy_broker_fee: 0,
              estimated_sell_broker_fee: cycleBrokerFee,
              estimated_sales_tax: cycleSalesTax,
              estimated_total_fees: cycleFees,
              is_role_assumed: false,
              notes: Object.freeze([
                `Trade Flotte Consolidé: Vente exécutée par ${sellCharName} (Accounting Lvl ${accountingLevel})`,
              ]),
            },
            unmatched_sell_quantity: unmatchedQty,
            character_id: sellCharId,
            character_name: isCrossCharacter
              ? `${buyCharNameStr} → ${sellCharName}`
              : sellCharName,
            buy_character_name: buyCharNameStr,
            sell_character_name: sellCharName,
            is_cross_character: isCrossCharacter,
          };

          completedCycles.push(cycleRecord);

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
          itemProfitMap[typeId].total_profit = roundIsk(
            itemProfitMap[typeId].total_profit + netProfit
          );
          itemProfitMap[typeId].trades_count += 1;
          itemProfitMap[typeId].rois.push(roi);
          itemProfitMap[typeId].hold_days_list.push(holdDays);
          itemProfitMap[typeId].total_volume_units += matchedQty;
        } else {
          hasUnmatchedTrades = true;
          unmatchedTradesCount += 1;

          const cycleRecord: TradeCycleRecord = {
            cycle_id: `cycle_${sellTx.transaction_id}_${typeId}_fleet`,
            type_id: typeId,
            type_name: typeName,
            category_name: categoryName,
            buy_date: sellTx.date,
            sell_date: sellTx.date,
            quantity: 0,
            avg_buy_price: 0,
            avg_sell_price: sellUnitPrice,
            total_buy_cost: 0,
            total_sell_revenue: 0,
            gross_profit: 0,
            estimated_fees_paid: 0,
            net_profit: 0,
            roi: null,
            hold_days: 0,
            is_profitable: false,
            buy_location: 'Inconnu (Sans Achat Flotte Antérieur)',
            sell_location: sellLocation,
            financial_completeness: 'PARTIAL',
            is_net_estimated: true,
            realized_profit_label: 'Bénéfice Flotte (Partiel)',
            fees_breakdown: {
              fee_mode: 'ESTIMATED',
              fee_source: 'CONFIG_ESTIMATE',
              execution_fee_mode: 'TAKER_MAKER',
              estimated_buy_broker_fee: 0,
              estimated_sell_broker_fee: 0,
              estimated_sales_tax: 0,
              estimated_total_fees: 0,
              is_role_assumed: false,
              notes: Object.freeze([
                'Vente sans achat antérieur couvrant sur l’ensemble des personnages connectés.',
              ]),
            },
            unmatched_sell_quantity: sellTx.quantity,
            character_id: sellCharId,
            character_name: sellCharName,
            sell_character_name: sellCharName,
          };

          completedCycles.push(cycleRecord);
        }
      }
    }

    const totalClosedTrades = completedCycles.filter((c) => c.quantity > 0).length;
    const profitableTrades = completedCycles.filter((c) => c.quantity > 0 && c.is_profitable).length;
    const unprofitableTrades = totalClosedTrades - profitableTrades;
    const winRatePct = totalClosedTrades > 0 ? (profitableTrades / totalClosedTrades) * 100 : 0;
    const legacyRoiCycles = completedCycles.filter((c) => c.quantity > 0 && c.roi !== null);
    const avgRealizedRoi =
      legacyRoiCycles.length > 0
        ? legacyRoiCycles.reduce((acc, c) => c.roi === null ? acc : acc + c.roi, 0) / legacyRoiCycles.length
        : null;
    const avgHoldDays =
      totalClosedTrades > 0
        ? completedCycles.filter((c) => c.quantity > 0).reduce((acc, c) => acc + c.hold_days, 0) /
          totalClosedTrades
        : 0;

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
        profit_label: 'Bénéfice Net Flotte (Certifié)',
        is_net_estimated: false,
      }))
      .sort((a, b) => b.total_profit - a.total_profit)
      .slice(0, 15);

    const categorySuccessRate: Record<
      string,
      {
        total_trades: number;
        profit_isk: number;
        win_rate: number;
        avg_roi: number;
        profit_label?: string;
        is_net_estimated?: boolean;
      }
    > = {};

    for (const c of completedCycles.filter((cy) => cy.quantity > 0)) {
      const cat = c.category_name || 'Général';
      if (!categorySuccessRate[cat]) {
        categorySuccessRate[cat] = { total_trades: 0, profit_isk: 0, win_rate: 0, avg_roi: 0 };
      }
      categorySuccessRate[cat].total_trades += 1;
      categorySuccessRate[cat].profit_isk += c.net_profit;
    }

    for (const cat of Object.keys(categorySuccessRate)) {
      const catCycles = completedCycles.filter(
        (c) => (c.category_name || 'Général') === cat && c.quantity > 0
      );
      const catWins = catCycles.filter((c) => c.is_profitable).length;
      categorySuccessRate[cat].win_rate =
        catCycles.length > 0 ? (catWins / catCycles.length) * 100 : 0;
      const catRoiCycles = catCycles.filter((c) => c.roi !== null);
      categorySuccessRate[cat].avg_roi =
        catRoiCycles.length > 0
          ? catRoiCycles.reduce((a, b) => a + (b.roi ?? 0), 0) / catRoiCycles.length
          : 0;
      categorySuccessRate[cat].profit_label = 'Bénéfice Net Flotte';
      categorySuccessRate[cat].is_net_estimated = false;
    }

    const activityByLocation = Object.entries(locationVolumeMap)
      .map(([idStr, val]) => ({
        location_id: Number(idStr),
        location_name: val.name,
        total_volume_isk: roundIsk(val.volumeIsk),
        transaction_count: val.count,
      }))
      .sort((a, b) => b.total_volume_isk - a.total_volume_isk)
      .slice(0, 8);

    const overallCompleteness: FinancialCompleteness = hasUnmatchedTrades ? 'PARTIAL' : 'OBSERVED';
    const metricsProfitLabel =
      overallCompleteness === 'OBSERVED'
        ? 'Bénéfice Net Flotte (Certifié)'
        : 'Bénéfice Flotte Réalisé (Partiel)';

    let traderTitle = `Flotte Marchande (${characters.length} pilotes)`;
    let traderBadgeColor = 'text-purple-400 bg-purple-500/10 border-purple-500/20';

    if (totalRealizedProfit >= 1_000_000_000) {
      traderTitle = `Armada Commerciale Suprême (${characters.length} pilotes)`;
      traderBadgeColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    } else if (totalRealizedProfit >= 250_000_000) {
      traderTitle = `Syndicat Commercial d'Élite (${characters.length} pilotes)`;
      traderBadgeColor = 'text-purple-300 bg-purple-500/15 border-purple-500/30';
    } else if (totalRealizedProfit >= 50_000_000) {
      traderTitle = `Flotte Marchande Avancée (${characters.length} pilotes)`;
      traderBadgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }

    return {
      character_id: 0,
      character_name: `Flotte Consolidée (${characters.length} pilotes)`,
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
      average_realized_roi_scope: 'CLOSING_DISPOSAL_ALLOCATIONS',
      average_hold_days: avgHoldDays,
      total_broker_fees_paid: totalBrokerFeesPaid,
      total_sales_tax_paid: totalSalesTaxPaid,
      top_profitable_items: topProfitableItems,
      recent_trade_cycles: [...completedCycles]
        .sort((a, b) => {
          const timeA = new Date(a.sell_date || a.buy_date).getTime();
          const timeB = new Date(b.sell_date || b.buy_date).getTime();
          return timeB - timeA || b.cycle_id.localeCompare(a.cycle_id);
        })
        .slice(0, 100),
      activity_by_location: activityByLocation,
      category_success_rate: categorySuccessRate,
      trader_title: traderTitle,
      trader_badge_color: traderBadgeColor,
      calibration_weight: 1.0,
      financial_completeness: overallCompleteness,
      is_net_estimated: false,
      realized_profit_label: metricsProfitLabel,
      execution_fee_mode: 'TAKER_MAKER',
      total_realized_gross: totalRealizedGross,
      total_estimated_fees: totalEstimatedFees,
      has_unmatched_trades: hasUnmatchedTrades,
      unmatched_trades_count: unmatchedTradesCount,
    };
  }
}

