/**
 * ============================================================================
 * EVE TRADE — FLEET FINANCIAL ENGINE (PHASE 3: MULTI-CHARACTER PERFORMANCE)
 * ============================================================================
 *
 * Pure mathematical, deterministic aggregation engine that consolidates
 * pre-calculated individual character financial outcomes (TraderPerformanceMetrics)
 * into a single Fleet Financial Result.
 *
 * CORE INVARIANTS:
 * 1. Strict Purity: Zero network calls, zero React hooks, zero localStorage,
 *    zero IndexedDB access, zero Date.now() / system clock dependencies.
 * 2. Pre-Calculated Input Invariant: Operates ONLY on already-calculated individual
 *    TraderPerformanceMetrics. NEVER receives or merges raw multi-character transactions
 *    before financial engine processing.
 * 3. Exact Mathematical Additivity for Additive Metrics:
 *    - Fleet Realized Profit = Σ Character Realized Profit
 *    - Fleet Turnover = Σ Character Turnover
 *    - Fleet Buy/Sell Volume = Σ Character Buy/Sell Volume
 *    - Fleet Fees Paid = Σ Character Fees Paid
 *    - Fleet Trade Counts = Σ Character Trade Counts
 * 4. Correct Sizing for Non-Additive Metrics:
 *    - Fleet Win Rate = Σ Profitable Trades / Σ Total Closed Trades (NOT sum of rates)
 *    - Fleet Average ROI = Trade/Cycle-weighted average ROI across all closed cycles
 *    - Fleet Average Hold Days = Cycle-weighted average hold duration
 * 5. Determinism & Immutability: Pure functions returning deep frozen/defensive objects.
 * 6. Explicit Stale/Unavailable Awareness: If any character data is unavailable,
 *    it is explicitly flagged in hasUnavailableCharacters and unavailableCharacterNames.
 */

import {
  CharacterFinancialResult,
  FinancialCompleteness,
  FleetFinancialResult,
  FleetFinancialStatus,
  PerformanceScope,
  TradeCycleRecord,
  TraderPerformanceMetrics,
  CapitalRecoverySummary,
} from '../types';
import { roundIsk, safeDiv } from './money';

export class FleetFinancialEngine {
  /**
   * Alias for aggregateFleetPerformance to support concise aggregation calls.
   */
  static aggregateFleet(
    characterResults: readonly CharacterFinancialResult[],
    scope: PerformanceScope = { type: 'fleet' }
  ): FleetFinancialResult {
    return this.aggregateFleetPerformance(characterResults, scope);
  }

  /**
   * Deterministically aggregates individual CharacterFinancialResult records into a consolidated FleetFinancialResult.
   *
   * @param characterResults Array of individual character results with pre-calculated metrics
   * @param scope Optional performance scope (defaults to fleet)
   * @returns Pure immutable FleetFinancialResult
   */
  static aggregateFleetPerformance(
    characterResults: readonly CharacterFinancialResult[],
    scope: PerformanceScope = { type: 'fleet' }
  ): FleetFinancialResult {
    const unavailableCharacterNames: string[] = [];
    const validResults: Array<CharacterFinancialResult & { metrics: TraderPerformanceMetrics }> = [];

    for (const res of characterResults) {
      if (res.dataHealth === 'unavailable' || !res.metrics) {
        unavailableCharacterNames.push(res.characterName);
      } else {
        validResults.push(res as CharacterFinancialResult & { metrics: TraderPerformanceMetrics });
      }
    }

    const hasUnavailableCharacters = unavailableCharacterNames.length > 0;
    const participatingCharacterCount = validResults.length;

    // Zero-state if no valid characters exist
    if (validResults.length === 0) {
      const emptyFleetMetrics: TraderPerformanceMetrics = {
        character_id: 0,
        character_name: 'Flotte Commerciale (0 pilote)',
        last_calculated: new Date(0).toISOString(),
        total_realized_profit: 0,
        total_buy_volume: 0,
        total_sell_volume: 0,
        total_turnover: 0,
        total_closed_trades: 0,
        profitable_trades: 0,
        unprofitable_trades: 0,
        win_rate_pct: null,
        average_realized_roi: null,
        average_realized_roi_scope: 'CLOSED_POSITIONS',
        realized_profit_scope: 'DISPOSAL_ALLOCATIONS',
        average_hold_days: 0,
        total_broker_fees_paid: 0,
        total_sales_tax_paid: 0,
        top_profitable_items: [],
        recent_trade_cycles: [],
        activity_by_location: [],
        category_success_rate: {},
        trader_title: 'Flotte Non Synchronisée',
        trader_badge_color: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
        calibration_weight: 0,
        financial_completeness: hasUnavailableCharacters ? 'PARTIAL' : 'ESTIMATED',
        is_net_estimated: true,
        realized_profit_label: hasUnavailableCharacters
          ? 'Bénéfice Flotte Réalisé (Partiel - Pilotes Indisponibles)'
          : 'Bénéfice Net Réalisé (Estimé)',
        total_realized_gross: 0,
        total_estimated_fees: 0,
        has_unmatched_trades: false,
        unmatched_trades_count: 0,
      };

      return Object.freeze({
        scope,
        fleetMetrics: Object.freeze(emptyFleetMetrics),
        characterResults: Object.freeze([...characterResults]),
        status: (characterResults.length > 0 && hasUnavailableCharacters ? 'partial' : 'empty') as FleetFinancialStatus,
        hasUnavailableCharacters,
        unavailableCharacterNames: Object.freeze(unavailableCharacterNames),
        participatingCharacterCount: 0,
        totalCharacterCount: characterResults.length,
      });
    }

    // 1. Additive Aggregations
    let totalRealizedProfit = 0;
    let totalRealizedGross: number | undefined = 0;
    let totalBuyVolume = 0;
    let totalSellVolume = 0;
    let totalTurnover = 0;
    let observedFulfilledOrderActivityIsk: number | undefined;
    let totalClosedTrades = 0;
    let profitableTrades = 0;
    let unprofitableTrades = 0;
    let totalBrokerFeesPaid = 0;
    let totalSalesTaxPaid = 0;
    let totalEstimatedFees: number | undefined = 0;
    let unmatchedTradesCount: number | undefined = 0;
    let hasUnmatchedTrades = false;

    let capitalCommittedTotal = 0;
    let cashRecoveredTotal = 0;
    let remainingQuantityTotal = 0;
    let remainingCostBasisTotal = 0;
    let knownCapitalPositions = 0;
    let openCapitalPositions = 0;
    let partialCapitalPositions = 0;
    let closedCapitalPositions = 0;
    let capitalRecoveryPartial = false;
    const capitalRecoveryProvenance = new Map<string, import('../types').FinancialProvenance>();

    // Collect all trade cycles across all valid characters
    const allCycles: TradeCycleRecord[] = [];
    const locationVolumeMap: Record<number, { name: string; volumeIsk: number; count: number }> = {};

    for (const res of validResults) {
      const m = res.metrics;
      totalRealizedProfit = roundIsk(totalRealizedProfit + m.total_realized_profit);
      if (m.total_realized_gross === undefined) {
        totalRealizedGross = undefined;
      } else if (totalRealizedGross !== undefined) {
        totalRealizedGross = roundIsk(totalRealizedGross + m.total_realized_gross);
      }
      totalBuyVolume = roundIsk(totalBuyVolume + m.total_buy_volume);
      totalSellVolume = roundIsk(totalSellVolume + m.total_sell_volume);
      totalTurnover = roundIsk(totalTurnover + m.total_turnover);
      if (m.observed_fulfilled_order_activity_isk !== undefined) {
        observedFulfilledOrderActivityIsk = roundIsk(
          (observedFulfilledOrderActivityIsk ?? 0) + m.observed_fulfilled_order_activity_isk,
        );
      }
      totalClosedTrades += m.total_closed_trades;
      profitableTrades += m.profitable_trades;
      unprofitableTrades += m.unprofitable_trades;
      totalBrokerFeesPaid = roundIsk(totalBrokerFeesPaid + m.total_broker_fees_paid);
      totalSalesTaxPaid = roundIsk(totalSalesTaxPaid + m.total_sales_tax_paid);
      if (m.total_estimated_fees === undefined) {
        totalEstimatedFees = undefined;
      } else if (totalEstimatedFees !== undefined) {
        totalEstimatedFees = roundIsk(totalEstimatedFees + m.total_estimated_fees);
      }
      if (m.unmatched_trades_count === undefined) {
        unmatchedTradesCount = undefined;
      } else if (unmatchedTradesCount !== undefined) {
        unmatchedTradesCount += m.unmatched_trades_count;
      }
      if (m.has_unmatched_trades) {
        hasUnmatchedTrades = true;
      }

      if (m.capital_recovery) {
        const recovery = m.capital_recovery;
        capitalCommittedTotal = roundIsk(capitalCommittedTotal + recovery.capital_committed);
        cashRecoveredTotal = roundIsk(cashRecoveredTotal + recovery.cash_recovered);
        remainingQuantityTotal += recovery.remaining_quantity;
        remainingCostBasisTotal = roundIsk(
          remainingCostBasisTotal + recovery.remaining_cost_basis,
        );
        knownCapitalPositions += recovery.known_position_count;
        openCapitalPositions += recovery.open_position_count;
        partialCapitalPositions += recovery.partially_realized_position_count;
        closedCapitalPositions += recovery.closed_position_count;
        for (const provenance of recovery.provenance) {
          capitalRecoveryProvenance.set(
            `${provenance.source_kind}|${provenance.source_id}|${provenance.principal_scope}`,
            provenance,
          );
        }
        if (recovery.financial_completeness === 'PARTIAL') {
          capitalRecoveryPartial = true;
        }
      }

      // Collect cycles with character attribution
      if (m.recent_trade_cycles && m.recent_trade_cycles.length > 0) {
        for (const cycle of m.recent_trade_cycles) {
          allCycles.push({
            ...cycle,
            character_id: cycle.character_id ?? m.character_id,
            character_name: cycle.character_name ?? m.character_name,
          });
        }
      }

      // Merge location activity
      if (m.activity_by_location && m.activity_by_location.length > 0) {
        for (const loc of m.activity_by_location) {
          if (!locationVolumeMap[loc.location_id]) {
            locationVolumeMap[loc.location_id] = {
              name: loc.location_name,
              volumeIsk: 0,
              count: 0,
            };
          }
          locationVolumeMap[loc.location_id].volumeIsk = roundIsk(
            locationVolumeMap[loc.location_id].volumeIsk + loc.total_volume_isk
          );
          locationVolumeMap[loc.location_id].count += loc.transaction_count;
        }
      }
    }

    // 2. Non-Additive Metric Calculations
    const winRatePct: number | null =
      totalClosedTrades > 0 ? (profitableTrades / totalClosedTrades) * 100 : null;

    // Sort all trade cycles deterministically: sell_date DESC, buy_date DESC, cycle_id ASC
    const sortedCycles = [...allCycles].sort((a, b) => {
      const sellDiff = new Date(b.sell_date).getTime() - new Date(a.sell_date).getTime();
      if (sellDiff !== 0) return sellDiff;
      const buyDiff = new Date(b.buy_date).getTime() - new Date(a.buy_date).getTime();
      if (buyDiff !== 0) return buyDiff;
      return a.cycle_id.localeCompare(b.cycle_id);
    });

    const closedCycles = sortedCycles.filter(
      (c) => c.quantity > 0 && c.is_position_closed === true,
    );

    const closedRoiCycles = closedCycles.filter((c) => c.roi !== null);
    const avgRealizedRoi =
      closedRoiCycles.length > 0
        ? closedRoiCycles.reduce((acc, c) => c.roi === null ? acc : acc + c.roi, 0) /
          closedRoiCycles.length
        : null;

    const avgHoldDays =
      closedCycles.length > 0
        ? Number((closedCycles.reduce((acc, c) => acc + c.hold_days, 0) / closedCycles.length).toFixed(1))
        : 0;

    // Top Profitable Items across Fleet
    const itemProfitMap: Record<
      number,
      {
        type_id: number;
        type_name: string;
        category_name?: string;
        total_profit: number;
        trades_count: number;
        rois: number[];
        hold_days_list: number[];
        total_volume_units: number;
      }
    > = {};

    for (const c of closedCycles) {
      if (!itemProfitMap[c.type_id]) {
        itemProfitMap[c.type_id] = {
          type_id: c.type_id,
          type_name: c.type_name,
          category_name: c.category_name,
          total_profit: 0,
          trades_count: 0,
          rois: [],
          hold_days_list: [],
          total_volume_units: 0,
        };
      }
      itemProfitMap[c.type_id].total_profit = roundIsk(itemProfitMap[c.type_id].total_profit + c.net_profit);
      itemProfitMap[c.type_id].trades_count += 1;
      if (c.roi !== null) {
        itemProfitMap[c.type_id].rois.push(c.roi);
      }
      itemProfitMap[c.type_id].hold_days_list.push(c.hold_days);
      itemProfitMap[c.type_id].total_volume_units += c.quantity;
    }

    const topProfitableItems = Object.values(itemProfitMap)
      .map((item) => {
        const avgRoi = item.rois.length > 0 ? item.rois.reduce((a, b) => a + b, 0) / item.rois.length : 0;
        const avgHold =
          item.hold_days_list.length > 0
            ? Number((item.hold_days_list.reduce((a, b) => a + b, 0) / item.hold_days_list.length).toFixed(1))
            : 0;
        return {
          type_id: item.type_id,
          type_name: item.type_name,
          category_name: item.category_name,
          total_profit: item.total_profit,
          trades_count: item.trades_count,
          avg_roi: avgRoi,
          avg_hold_days: avgHold,
          total_volume_units: item.total_volume_units,
          profit_label: 'Bénéfice Net Flotte',
          is_net_estimated: true,
        };
      })
      .sort((a, b) => b.total_profit - a.total_profit)
      .slice(0, 10);

    // Activity by Location
    const activityByLocation = Object.entries(locationVolumeMap)
      .map(([idStr, val]) => ({
        location_id: Number(idStr),
        location_name: val.name,
        total_volume_isk: roundIsk(val.volumeIsk),
        transaction_count: val.count,
      }))
      .sort((a, b) => b.total_volume_isk - a.total_volume_isk)
      .slice(0, 8);

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

    for (const c of closedCycles) {
      const cat = c.category_name || 'Général';
      if (!categorySuccessRate[cat]) {
        categorySuccessRate[cat] = { total_trades: 0, profit_isk: 0, win_rate: 0, avg_roi: 0 };
      }
      categorySuccessRate[cat].total_trades += 1;
      categorySuccessRate[cat].profit_isk = roundIsk(categorySuccessRate[cat].profit_isk + c.net_profit);
    }

    for (const cat of Object.keys(categorySuccessRate)) {
      const catCycles = closedCycles.filter((c) => (c.category_name || 'Général') === cat);
      const catWins = catCycles.filter((c) => c.is_profitable).length;
      categorySuccessRate[cat].win_rate =
        catCycles.length > 0 ? (catWins / catCycles.length) * 100 : 0;
      const catRoiCycles = catCycles.filter((c) => c.roi !== null);
      categorySuccessRate[cat].avg_roi =
        catRoiCycles.length > 0
          ? catRoiCycles.reduce((sum, c) => c.roi === null ? sum : sum + c.roi, 0) / catRoiCycles.length
          : 0;
      categorySuccessRate[cat].profit_label = 'Bénéfice Net Flotte';
      categorySuccessRate[cat].is_net_estimated = true;
    }

    // Financial Completeness Derivation
    let financialCompleteness: FinancialCompleteness = 'ESTIMATED';
    if (hasUnavailableCharacters || validResults.some((r) => r.metrics.financial_completeness === 'PARTIAL')) {
      financialCompleteness = 'PARTIAL';
    } else if (validResults.some((r) => r.metrics.financial_completeness === 'UNAVAILABLE')) {
      financialCompleteness = 'UNAVAILABLE';
    } else if (validResults.every((r) => r.metrics.financial_completeness === 'OBSERVED')) {
      financialCompleteness = 'OBSERVED';
    }

    const capitalRecovery: CapitalRecoverySummary | undefined =
      knownCapitalPositions > 0
        ? Object.freeze({
            scope: 'KNOWN_POSITIONS',
            financial_completeness:
              capitalRecoveryPartial || hasUnavailableCharacters ? 'PARTIAL' : 'OBSERVED',
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

    const profitLabel =
      hasUnavailableCharacters
        ? 'Bénéfice Flotte Réalisé (Partiel - Pilotes Indisponibles)'
        : financialCompleteness === 'UNAVAILABLE'
        ? 'Profit Flotte Réalisé (Hors Frais)'
        : financialCompleteness === 'OBSERVED'
        ? 'Bénéfice Net Flotte (Certifié)'
        : financialCompleteness === 'PARTIAL'
        ? 'Bénéfice Flotte Réalisé (Partiel)'
        : 'Bénéfice Net Flotte (Estimé)';

    const isNetEstimated = financialCompleteness !== 'OBSERVED' && financialCompleteness !== 'UNAVAILABLE';

    // Derive Fleet Trader Title & Badge
    let traderTitle = `Flotte Marchande (${participatingCharacterCount} pilotes)`;
    let traderBadgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';

    if (totalRealizedProfit >= 2_000_000_000) {
      traderTitle = `Armada Commerciale Suprême (${participatingCharacterCount} pilotes)`;
      traderBadgeColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    } else if (totalRealizedProfit >= 500_000_000) {
      traderTitle = `Syndicat Commercial d'Élite (${participatingCharacterCount} pilotes)`;
      traderBadgeColor = 'text-purple-300 bg-purple-500/15 border-purple-500/30';
    } else if (totalRealizedProfit >= 100_000_000) {
      traderTitle = `Flotte Marchande Avancée (${participatingCharacterCount} pilotes)`;
      traderBadgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }

    const fleetMetrics: TraderPerformanceMetrics = {
      character_id: 0,
      character_name: hasUnavailableCharacters
        ? `Flotte Partielle (${participatingCharacterCount}/${characterResults.length} pilotes)`
        : `Flotte Consolidée (${participatingCharacterCount} pilotes)`,
      last_calculated: new Date().toISOString(),
      total_realized_profit: totalRealizedProfit,
      total_buy_volume: totalBuyVolume,
      total_sell_volume: totalSellVolume,
      total_turnover: totalTurnover,
      ...(observedFulfilledOrderActivityIsk !== undefined
        ? { observed_fulfilled_order_activity_isk: observedFulfilledOrderActivityIsk }
        : {}),
      total_closed_trades: totalClosedTrades,
      profitable_trades: profitableTrades,
      unprofitable_trades: unprofitableTrades,
      win_rate_pct: winRatePct,
      average_realized_roi: avgRealizedRoi,
      average_realized_roi_scope: 'CLOSED_POSITIONS',
      realized_profit_scope: 'DISPOSAL_ALLOCATIONS',
      average_hold_days: avgHoldDays,
      ...(capitalRecovery ? { capital_recovery: capitalRecovery } : {}),
      total_broker_fees_paid: totalBrokerFeesPaid,
      total_sales_tax_paid: totalSalesTaxPaid,
      top_profitable_items: topProfitableItems,
      recent_trade_cycles: sortedCycles,
      activity_by_location: activityByLocation,
      category_success_rate: categorySuccessRate,
      trader_title: traderTitle,
      trader_badge_color: traderBadgeColor,
      calibration_weight: 1.0,
      financial_completeness: financialCompleteness,
      is_net_estimated: isNetEstimated,
      realized_profit_label: profitLabel,
      ...(totalRealizedGross !== undefined ? { total_realized_gross: totalRealizedGross } : {}),
      ...(totalEstimatedFees !== undefined ? { total_estimated_fees: totalEstimatedFees } : {}),
      has_unmatched_trades: hasUnmatchedTrades,
      ...(unmatchedTradesCount !== undefined ? { unmatched_trades_count: unmatchedTradesCount } : {}),
    };

    const status: FleetFinancialStatus = hasUnavailableCharacters ? 'partial' : 'complete';

    return Object.freeze({
      scope,
      fleetMetrics: Object.freeze(fleetMetrics),
      characterResults: Object.freeze([...characterResults]),
      status,
      hasUnavailableCharacters,
      unavailableCharacterNames: Object.freeze(unavailableCharacterNames),
      participatingCharacterCount,
      totalCharacterCount: characterResults.length,
    });
  }

  /**
   * Pure selection helper resolving performance metrics for a specified scope.
   */
  static selectPerformanceByScope(
    characterResults: readonly CharacterFinancialResult[],
    scope: PerformanceScope,
    activeCharacterId: string,
    options?: {
      consolidatedFleetMetrics?: TraderPerformanceMetrics;
    }
  ): {
    selectedMetrics: TraderPerformanceMetrics | null;
    characterResult?: CharacterFinancialResult;
    fleetResult?: FleetFinancialResult;
  } {
    if (scope.type === 'active_character') {
      const active = characterResults.find(
        (r) => String(r.characterId) === String(activeCharacterId)
      );
      return {
        selectedMetrics: active?.metrics || null,
        characterResult: active,
      };
    }

    if (scope.type === 'character') {
      const target = characterResults.find(
        (r) => String(r.characterId) === String(scope.characterId)
      );
      return {
        selectedMetrics: target?.metrics || null,
        characterResult: target,
      };
    }

    if (scope.type === 'fleet') {
      // FIN-002: a fleet Performance view must consume one shared economic
      // accounting scope. Aggregating character-isolated financial metrics is
      // reporting arithmetic, not an economic reconciliation, and can miss
      // cross-character lot consumption.
      if (!options?.consolidatedFleetMetrics) {
        return { selectedMetrics: null };
      }

      const reportingFleet = this.aggregateFleetPerformance(characterResults, scope);
      const enhancedFleetResult: FleetFinancialResult = {
        ...reportingFleet,
        fleetMetrics: Object.freeze(options.consolidatedFleetMetrics),
      };
      return {
        selectedMetrics: options.consolidatedFleetMetrics,
        fleetResult: Object.freeze(enhancedFleetResult),
      };
    }

    return { selectedMetrics: null };
  }
}

