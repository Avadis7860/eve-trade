import {
  InterRegionalOpportunity,
  PortfolioSimulation,
  PortfolioPosition,
  FinancialConfig,
} from '../types';

export class PortfolioOptimizer {
  /**
   * Allocates available capital among viable opportunities while respecting:
   * - Max capital per trade
   * - Max portfolio concentration per Item Type (e.g. max 35%)
   * - Max portfolio concentration per Item Group (e.g. max 50%)
   * - Preference for high Turnover & Capital Efficiency
   */
  static optimize(
    opportunities: InterRegionalOpportunity[],
    config: FinancialConfig
  ): PortfolioSimulation {
    const viable = opportunities
      .filter((o) => o.is_viable && o.costs.net_profit > 0)
      .sort((a, b) => b.scores.overall_score - a.scores.overall_score);

    let capitalRemaining = config.available_capital;
    const positions: PortfolioPosition[] = [];
    const concentrationType: Record<number, number> = {};
    const concentrationGroup: Record<number, number> = {};
    const concentrationCategory: Record<string, number> = {};
    const concentrationRoute: Record<string, number> = {};

    const maxPerType = config.available_capital * config.max_portfolio_concentration_type;
    const maxPerGroup = config.available_capital * config.max_portfolio_concentration_group;

    for (const opp of viable) {
      if (capitalRemaining <= 500000) break; // Minimum meaningful trade capital

      const currentTypeCap = concentrationType[opp.type_id] || 0;
      const currentGroupCap = concentrationGroup[opp.group_id] || 0;

      const allowedForType = Math.max(0, maxPerType - currentTypeCap);
      const allowedForGroup = Math.max(0, maxPerGroup - currentGroupCap);
      const allowedCapital = Math.min(
        capitalRemaining,
        config.max_capital_per_trade,
        allowedForType,
        allowedForGroup,
        opp.costs.capital_locked
      );

      if (allowedCapital <= 100000) continue;

      // Fraction of the opportunity's full capacity we can fund
      const fraction = Math.min(1.0, allowedCapital / opp.costs.capital_locked);
      const allocatedQty = Math.max(1, Math.floor(opp.quantity_tradable * fraction));
      const actualAllocatedCapital = opp.costs.capital_locked * fraction;

      const expectedProfit = opp.capturable_profit * fraction;
      const expectedDailyProfit = opp.profit_per_day * fraction;

      positions.push({
        opportunity: opp,
        allocated_capital: actualAllocatedCapital,
        allocated_quantity: allocatedQty,
        expected_profit: expectedProfit,
        expected_daily_profit: expectedDailyProfit,
        share_of_portfolio: 0, // calculated below
      });

      capitalRemaining -= actualAllocatedCapital;
      concentrationType[opp.type_id] = currentTypeCap + actualAllocatedCapital;
      concentrationGroup[opp.group_id] = currentGroupCap + actualAllocatedCapital;

      const catName = opp.category_name || 'Autre';
      concentrationCategory[catName] = (concentrationCategory[catName] || 0) + actualAllocatedCapital;

      const routeKey = `${opp.buy_hub.name} → ${opp.sell_hub.name}`;
      concentrationRoute[routeKey] = (concentrationRoute[routeKey] || 0) + actualAllocatedCapital;
    }

    const totalInvested = config.available_capital - capitalRemaining;
    const totalExpectedProfit = positions.reduce((acc, p) => acc + p.expected_profit, 0);
    const totalDailyProfit = positions.reduce((acc, p) => acc + p.expected_daily_profit, 0);
    const weightedRoi = totalInvested > 0 ? totalExpectedProfit / totalInvested : 0;

    // Normalize share percentages
    for (const pos of positions) {
      pos.share_of_portfolio = totalInvested > 0 ? pos.allocated_capital / totalInvested : 0;
    }

    return {
      total_capital_available: config.available_capital,
      total_capital_invested: totalInvested,
      total_expected_profit: totalExpectedProfit,
      total_expected_daily_profit: totalDailyProfit,
      weighted_roi: weightedRoi,
      positions,
      diversification: {
        by_category: concentrationCategory,
        by_group: Object.fromEntries(
          Object.entries(concentrationGroup).map(([k, v]) => [
            viable.find((o) => o.group_id === Number(k))?.group_name || `Group ${k}`,
            v,
          ])
        ),
        by_route: concentrationRoute,
      },
    };
  }
}
