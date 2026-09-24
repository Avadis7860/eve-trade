import {
  InterRegionalOpportunity,
  PortfolioSimulation,
  PortfolioPosition,
  FinancialConfig,
  DataHealthStatus,
  PortfolioUnallocatedReason,
  PortfolioPositionRationale,
} from '../types';

export interface PortfolioOptimizationOptions {
  /** Null blocks allocation: treasury scope is unavailable or not trustworthy. */
  allocation_budget?: number | null;
  /** Policy reserve is kept outside allocation_budget and is reported by the aggregation boundary. */
  policy_reserve?: number;
}

const BLOCKING_HEALTH: ReadonlySet<DataHealthStatus> = new Set([
  'STALE',
  'PARTIAL',
  'UNKNOWN',
  'ERROR',
]);

function toFinitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function opportunityDataHealth(opp: InterRegionalOpportunity): DataHealthStatus {
  const explicit: DataHealthStatus[] = [];
  const buy = opp.data_quality?.buy_hub_quality;
  const sell = opp.data_quality?.sell_hub_quality;

  if (buy?.health_status) explicit.push(buy.health_status);
  if (sell?.health_status) explicit.push(sell.health_status);

  const marketPillar = opp.certification?.pillar_evaluations?.market_data;
  if (marketPillar?.health_source) explicit.push(marketPillar.health_source);
  if (marketPillar?.health_dest) explicit.push(marketPillar.health_dest);

  if (explicit.length === 0) return 'UNKNOWN';
  if (explicit.includes('ERROR')) return 'ERROR';
  if (explicit.includes('PARTIAL')) return 'PARTIAL';
  if (explicit.includes('STALE')) return 'STALE';
  if (explicit.includes('UNKNOWN')) return 'UNKNOWN';
  if (explicit.includes('CACHE')) return 'CACHE';
  return 'LIVE';
}

function hasSupportedPrediction(opp: InterRegionalOpportunity): boolean {
  const prediction = opp.prediction;
  const dataConfidence = opp.data_quality?.overall_confidence;
  return Boolean(
    prediction &&
      Number.isFinite(prediction.expected_realized_profit) &&
      Number.isFinite(prediction.profit_realization_probability) &&
      Number.isFinite(prediction.prediction_confidence) &&
      prediction.prediction_confidence > 0 &&
      typeof dataConfidence === 'number' &&
      Number.isFinite(dataConfidence) &&
      dataConfidence > 0,
  );
}

function expectedRealizedProfit(opp: InterRegionalOpportunity): number | null {
  return hasSupportedPrediction(opp)
    ? Math.max(0, opp.prediction!.expected_realized_profit)
    : null;
}

function objectiveCompare(a: InterRegionalOpportunity, b: InterRegionalOpportunity): number {
  const aForecast = hasSupportedPrediction(a);
  const bForecast = hasSupportedPrediction(b);

  if (aForecast !== bForecast) return aForecast ? -1 : 1;

  if (aForecast && bForecast) {
    const expectedA = expectedRealizedProfit(a) ?? 0;
    const expectedB = expectedRealizedProfit(b) ?? 0;
    if (expectedA !== expectedB) return expectedB - expectedA;
  }

  if (a.capturable_profit !== b.capturable_profit) return b.capturable_profit - a.capturable_profit;
  if (a.profit_per_day !== b.profit_per_day) return b.profit_per_day - a.profit_per_day;
  if (a.costs.roi !== b.costs.roi) return b.costs.roi - a.costs.roi;

  const aLiquidityCapture =
    (a.scores.liquidity_score + a.scores.capturability_score) / 2;
  const bLiquidityCapture =
    (b.scores.liquidity_score + b.scores.capturability_score) / 2;
  if (aLiquidityCapture !== bLiquidityCapture) return bLiquidityCapture - aLiquidityCapture;

  // overall_score is a deterministic ranking tie-breaker only.
  if (a.scores.overall_score !== b.scores.overall_score) {
    return b.scores.overall_score - a.scores.overall_score;
  }

  if (a.type_id !== b.type_id) return a.type_id - b.type_id;
  if (a.buy_hub.id !== b.buy_hub.id) return a.buy_hub.id.localeCompare(b.buy_hub.id);
  return a.sell_hub.id.localeCompare(b.sell_hub.id);
}

function hardGateReasons(
  opp: InterRegionalOpportunity,
  config: FinancialConfig,
): { codes: PortfolioUnallocatedReason['code'][]; details: string[] } {
  const codes: PortfolioUnallocatedReason['code'][] = [];
  const details: string[] = [];

  if (!opp.is_viable || !(opp.costs.net_profit > 0)) {
    codes.push('NO_ELIGIBLE_OPPORTUNITY');
    details.push('Opportunity financièrement non viable ou non profitable.');
  }

  if (opp.certification && !opp.certification.is_actionable) {
    codes.push('DATA_ISSUE');
    details.push('Certification non actionnable.');
  }

  const health = opportunityDataHealth(opp);
  if (BLOCKING_HEALTH.has(health)) {
    codes.push('DATA_ISSUE');
    details.push(`Données requises non fiables (${health}).`);
  }

  if (opp.is_anomalous) {
    codes.push('DATA_ISSUE');
    details.push('Opportunité anomalous: exclue de la proposition par défaut.');
  }

  if (opp.costs.net_profit < config.min_net_profit) {
    codes.push('POLICY_LIMIT');
    details.push('Profit net sous le seuil configuré.');
  }

  if (opp.costs.roi < config.min_roi) {
    codes.push('POLICY_LIMIT');
    details.push('ROI sous le seuil configuré.');
  }

  if (opp.expected_days_to_sell > config.max_days_to_sell) {
    codes.push('POLICY_LIMIT');
    details.push('Expected days to sell au-dessus du plafond configuré.');
  }

  if (config.avoid_chokepoints && !opp.route.is_highsec_only) {
    codes.push('ROUTE_SECURITY_CONSTRAINT');
    details.push('Route incompatible avec la politique de sécurité.');
  }

  if (toFinitePositive(opp.costs.capital_locked) === null) {
    codes.push('NO_ELIGIBLE_OPPORTUNITY');
    details.push('Capital requis non fini ou non positif.');
  }

  if (
    !Number.isFinite(opp.quantity_tradable) ||
    !Number.isFinite(opp.costs.capital_locked) ||
    opp.quantity_tradable <= 0
  ) {
    codes.push('NO_ELIGIBLE_OPPORTUNITY');
    details.push('Quantité tradable non valide.');
  }

  return { codes, details };
}

function makeRiskFronts(
  opp: InterRegionalOpportunity,
  typeShare: number,
  groupShare: number,
): string[] {
  const health = opportunityDataHealth(opp);
  const fronts = [
    `data:${health}`,
    `liquidity:expected_days_to_sell=${opp.expected_days_to_sell.toFixed(2)}`,
    `capture:score=${opp.scores.capturability_score}`,
    `route:highsec_only=${opp.route.is_highsec_only}`,
    `execution:bottleneck=${opp.bottleneck}`,
    `concentration:type=${(typeShare * 100).toFixed(1)}%`,
    `concentration:group=${(groupShare * 100).toFixed(1)}%`,
  ];

  if (opp.prediction) {
    fronts.push(
      `prediction:probability=${opp.prediction.profit_realization_probability.toFixed(1)}%`,
      `prediction:confidence=${opp.prediction.prediction_confidence.toFixed(1)}%`,
    );
  }

  return fronts;
}

function allocationRationale(
  opp: InterRegionalOpportunity,
  isNewType: boolean,
  isNewGroup: boolean,
  hasPrediction: boolean,
  allowedCapital: number,
): PortfolioPositionRationale {
  const rationale: string[] = [];

  rationale.push(
    hasPrediction
      ? 'Priorité fondée sur le profit réalisé attendu car le forecast est suffisamment supporté.'
      : 'Priorité fondée sur le capturable profit observé du modèle, sans forecast suffisamment supporté.',
  );

  rationale.push(`Profit/jour modèle: ${opp.profit_per_day.toFixed(2)} ISK/j.`);
  rationale.push(`ROI projeté: ${(opp.costs.roi * 100).toFixed(2)}%.`);

  if (isNewType) rationale.push('Nouvelle exposition type privilégiée pour préserver la diversification.');
  if (isNewGroup) rationale.push('Nouvelle exposition groupe privilégiée pour réduire la concentration.');

  if (allowedCapital < opp.costs.capital_locked) {
    rationale.push('Allocation plafonnée par les contraintes de capital/concentration.');
  }

  return {
    rationale,
    expected_profit_basis: hasPrediction
      ? 'EXPECTED_REALIZED_PROFIT'
      : 'CAPTURABLE_PROFIT',
    forecast_supported: hasPrediction,
  };
}

function codeForFirstBlockingReason(
  codes: PortfolioUnallocatedReason['code'][],
): PortfolioUnallocatedReason['code'] | null {
  const order: PortfolioUnallocatedReason['code'][] = [
    'DATA_ISSUE',
    'ROUTE_SECURITY_CONSTRAINT',
    'CONCENTRATION_LIMIT',
    'POLICY_LIMIT',
    'INSUFFICIENT_CAPITAL',
    'MINIMUM_TRADE_SIZE',
    'NO_ELIGIBLE_OPPORTUNITY',
  ];
  return order.find((code) => codes.includes(code)) ?? null;
}

export class PortfolioOptimizer {
  /**
   * UX-03 allocator.
   * - consumes any supplied opportunity universe (the hook now supplies the global universe);
   * - applies hard eligibility gates before ranking;
   * - uses forecast/capturable economics rather than overall_score as the objective;
   * - prefers an unrepresented item type when feasible to avoid first-score concentration;
   * - enforces type/group caps against deployed allocation budget;
   * - computes quantity from a conservative per-unit capital invariant.
   */
  static optimize(
    opportunities: InterRegionalOpportunity[],
    config: FinancialConfig,
    options: PortfolioOptimizationOptions = {},
  ): PortfolioSimulation {
    const allocationBudget =
      options.allocation_budget === undefined
        ? Math.max(0, Number.isFinite(config.available_capital) ? config.available_capital : 0)
        : options.allocation_budget;

    const baseResult: PortfolioSimulation = {
      total_capital_available: allocationBudget ?? 0,
      total_capital_invested: 0,
      total_expected_profit: 0,
      total_expected_daily_profit: 0,
      weighted_roi: 0,
      positions: [],
      diversification: {
        by_category: {},
        by_group: {},
        by_route: {},
      },
      allocation_budget: allocationBudget,
      policy_reserve: Math.max(0, options.policy_reserve ?? config.policy_reserve ?? 0),
      unallocated_capital: allocationBudget,
      unallocated_reasons: [],
    };

    if (allocationBudget === null) {
      baseResult.unallocated_capital = null;
      baseResult.unallocated_reasons = [{
        code: 'DATA_ISSUE',
        detail: 'Treasury scope unavailable: proposal blocked without a trustworthy allocation budget.',
      }];
      return baseResult;
    }

    const preGateReasons: PortfolioUnallocatedReason[] = [];
    const eligible: InterRegionalOpportunity[] = [];

    for (const opp of opportunities) {
      const gate = hardGateReasons(opp, config);
      if (gate.codes.length > 0) {
        const code = codeForFirstBlockingReason(gate.codes);
        if (code) {
          preGateReasons.push({
            code,
            count: 1,
            detail: gate.details.join(' '),
          });
        }
        continue;
      }
      eligible.push(opp);
    }

    if (eligible.length === 0) {
      baseResult.unallocated_reasons = [{
        code: 'NO_ELIGIBLE_OPPORTUNITY',
        count: opportunities.length,
        detail: opportunities.length
          ? 'Aucune opportunité ne satisfait simultanément les hard gates.'
          : 'Aucun univers de candidats exploitable pour une allocation.',
      }];
      return baseResult;
    }

    if (!(allocationBudget > 0)) {
      baseResult.unallocated_reasons = [{
        code: 'INSUFFICIENT_CAPITAL',
        detail: 'Allocation budget nul ou insuffisant.',
      }];
      return baseResult;
    }

    let capitalRemaining = allocationBudget;
    const positions: PortfolioPosition[] = [];
    const concentrationType: Record<number, number> = {};
    const concentrationGroup: Record<number, number> = {};
    const concentrationCategory: Record<string, number> = {};
    const concentrationRoute: Record<string, number> = {};
    const selectedTypes = new Set<number>();
    const selectedGroups = new Set<number>();

    const maxPerType = Math.max(0, allocationBudget * config.max_portfolio_concentration_type);
    const maxPerGroup = Math.max(0, allocationBudget * config.max_portfolio_concentration_group);

    while (capitalRemaining > 0) {
      const candidates = eligible.filter((opp) => {
        const typeCapLeft = maxPerType - (concentrationType[opp.type_id] ?? 0);
        const groupCapLeft = maxPerGroup - (concentrationGroup[opp.group_id] ?? 0);
        const unitCapital = opp.costs.capital_locked / opp.quantity_tradable;
        return (
          Number.isFinite(unitCapital) &&
          unitCapital > 0 &&
          typeCapLeft >= unitCapital - 1e-9 &&
          groupCapLeft >= unitCapital - 1e-9 &&
          capitalRemaining >= unitCapital - 1e-9
        );
      });

      if (candidates.length === 0) break;

      const diversificationCandidates = candidates.filter((opp) => !selectedTypes.has(opp.type_id));
      const pool = diversificationCandidates.length > 0 ? diversificationCandidates : candidates;
      const ordered = [...pool].sort((a, b) => objectiveCompare(a, b));

      // When economics are close, reduce concentration pressure rather than using score as a proxy.
      ordered.sort((a, b) => {
        const aPressure =
          (concentrationType[a.type_id] ?? 0) / Math.max(1, maxPerType) +
          (concentrationGroup[a.group_id] ?? 0) / Math.max(1, maxPerGroup);
        const bPressure =
          (concentrationType[b.type_id] ?? 0) / Math.max(1, maxPerType) +
          (concentrationGroup[b.group_id] ?? 0) / Math.max(1, maxPerGroup);
        const economic = objectiveCompare(a, b);
        if (economic !== 0) return economic;
        return aPressure - bPressure;
      });

      const opp = ordered[0];
      const currentTypeCap = concentrationType[opp.type_id] ?? 0;
      const currentGroupCap = concentrationGroup[opp.group_id] ?? 0;
      const allowedCapital = Math.min(
        capitalRemaining,
        Math.max(0, config.max_capital_per_trade),
        Math.max(0, maxPerType - currentTypeCap),
        Math.max(0, maxPerGroup - currentGroupCap),
        opp.costs.capital_locked,
      );

      const unitCapital = opp.costs.capital_locked / opp.quantity_tradable;
      if (!(allowedCapital >= unitCapital - 1e-9) || !(unitCapital > 0)) continue;

      let allocatedQty = Math.floor((allowedCapital + 1e-9) / unitCapital);
      allocatedQty = Math.min(
        Math.max(0, allocatedQty),
        Math.floor(opp.quantity_tradable),
      );

      let actualAllocatedCapital = allocatedQty * unitCapital;
      while (allocatedQty > 0 && actualAllocatedCapital > allowedCapital + 1e-6) {
        allocatedQty -= 1;
        actualAllocatedCapital = allocatedQty * unitCapital;
      }

      if (!(allocatedQty > 0) || !(actualAllocatedCapital > 0)) continue;

      const fraction = Math.min(1, allocatedQty / opp.quantity_tradable);
      const expectedProfit = Math.max(0, opp.capturable_profit) * fraction;
      const expectedDailyProfit = Math.max(0, opp.profit_per_day) * fraction;
      const hasPrediction = hasSupportedPrediction(opp);
      const expectedRealized = hasPrediction
        ? (opp.prediction!.expected_realized_profit * fraction)
        : undefined;

      const projectedTotal =
        positions.reduce((sum, position) => sum + position.allocated_capital, 0) +
        actualAllocatedCapital;
      const typeShare = projectedTotal > 0 ? (currentTypeCap + actualAllocatedCapital) / projectedTotal : 0;
      const groupShare = projectedTotal > 0 ? (currentGroupCap + actualAllocatedCapital) / projectedTotal : 0;

      const position: PortfolioPosition = {
        opportunity: opp,
        allocated_capital: actualAllocatedCapital,
        allocated_quantity: allocatedQty,
        expected_profit: expectedProfit,
        expected_daily_profit: expectedDailyProfit,
        share_of_portfolio: 0,
        expected_realized_profit: expectedRealized,
        projected_net_profit: opp.costs.net_profit * fraction,
        capturable_profit: opp.capturable_profit * fraction,
        projected_roi: opp.costs.roi,
        profit_per_day: opp.profit_per_day,
        expected_days_to_sell: opp.expected_days_to_sell,
        data_confidence: opp.data_quality?.overall_confidence ?? null,
        prediction_confidence: opp.prediction?.prediction_confidence ?? null,
        profit_realization_probability: opp.prediction?.profit_realization_probability ?? null,
        risk_fronts: makeRiskFronts(opp, typeShare, groupShare),
        rationale: allocationRationale(
          opp,
          !selectedTypes.has(opp.type_id),
          !selectedGroups.has(opp.group_id),
          hasPrediction,
          allowedCapital,
        ),
      };

      positions.push(position);
      selectedTypes.add(opp.type_id);
      selectedGroups.add(opp.group_id);
      capitalRemaining = Math.max(0, capitalRemaining - actualAllocatedCapital);
      concentrationType[opp.type_id] = currentTypeCap + actualAllocatedCapital;
      concentrationGroup[opp.group_id] = currentGroupCap + actualAllocatedCapital;

      const catName = opp.category_name || `Category ${opp.category_id}`;
      concentrationCategory[catName] =
        (concentrationCategory[catName] ?? 0) + actualAllocatedCapital;

      const routeKey = `${opp.buy_hub.name} → ${opp.sell_hub.name}`;
      concentrationRoute[routeKey] =
        (concentrationRoute[routeKey] ?? 0) + actualAllocatedCapital;

      // One proposal position per opportunity: never let repeated passes circumvent
      // max-capital-per-trade or make one opportunity appear as several independent trades.
      const index = eligible.indexOf(opp);
      if (index >= 0) eligible.splice(index, 1);
    }

    const totalInvested = positions.reduce((acc, p) => acc + p.allocated_capital, 0);
    const totalExpectedProfit = positions.reduce((acc, p) => acc + p.expected_profit, 0);
    const totalDailyProfit = positions.reduce((acc, p) => acc + p.expected_daily_profit, 0);
    const weightedRoi = totalInvested > 0 ? totalExpectedProfit / totalInvested : 0;

    for (const pos of positions) {
      pos.share_of_portfolio = totalInvested > 0 ? pos.allocated_capital / totalInvested : 0;
      pos.concentration_contribution = {
        type_share: totalInvested > 0 ? (concentrationType[pos.opportunity.type_id] ?? 0) / totalInvested : 0,
        group_share: totalInvested > 0 ? (concentrationGroup[pos.opportunity.group_id] ?? 0) / totalInvested : 0,
        category_share:
          totalInvested > 0
            ? (concentrationCategory[pos.opportunity.category_name || `Category ${pos.opportunity.category_id}`] ?? 0) /
              totalInvested
            : 0,
        route_share:
          totalInvested > 0
            ? (concentrationRoute[`${pos.opportunity.buy_hub.name} → ${pos.opportunity.sell_hub.name}`] ?? 0) /
              totalInvested
            : 0,
      };
      if (pos.risk_fronts) {
        pos.risk_fronts = makeRiskFronts(
          pos.opportunity,
          pos.concentration_contribution.type_share,
          pos.concentration_contribution.group_share,
        );
      }
    }

    const unallocatedCapital = Math.max(0, capitalRemaining);
    const reasons = [...preGateReasons];

    if (unallocatedCapital > 0) {
      const remainingEligibility = opportunities
        .filter((opp) => !positions.some((pos) => pos.opportunity.id === opp.id))
        .map((opp) => ({
          opp,
          gate: hardGateReasons(opp, config),
        }));

      const eligibleRemaining = remainingEligibility.filter((entry) => entry.gate.codes.length === 0);
      const affordable = eligibleRemaining.filter((entry) => {
        const unitCapital = entry.opp.costs.capital_locked / entry.opp.quantity_tradable;
        return Number.isFinite(unitCapital) && unitCapital > 0 && unitCapital <= unallocatedCapital + 1e-9;
      });

      const concentrationBlocked = eligibleRemaining.some((entry) => {
        const opp = entry.opp;
        const unitCapital = opp.costs.capital_locked / opp.quantity_tradable;
        return (
          Number.isFinite(unitCapital) &&
          (
            maxPerType - (concentrationType[opp.type_id] ?? 0) < unitCapital - 1e-9 ||
            maxPerGroup - (concentrationGroup[opp.group_id] ?? 0) < unitCapital - 1e-9
          )
        );
      });

      const reasonCodes: PortfolioUnallocatedReason['code'][] = [];
      if (concentrationBlocked) reasonCodes.push('CONCENTRATION_LIMIT');
      if (eligibleRemaining.length > 0 && affordable.length === 0) reasonCodes.push('INSUFFICIENT_CAPITAL');

      for (const entry of remainingEligibility) {
        if (entry.gate.codes.includes('ROUTE_SECURITY_CONSTRAINT')) reasonCodes.push('ROUTE_SECURITY_CONSTRAINT');
        if (entry.gate.codes.includes('DATA_ISSUE')) reasonCodes.push('DATA_ISSUE');
        if (entry.gate.codes.includes('POLICY_LIMIT')) reasonCodes.push('POLICY_LIMIT');
      }

      const code = codeForFirstBlockingReason(reasonCodes);
      if (code) {
        reasons.push({
          code,
          count: 1,
          detail:
            code === 'CONCENTRATION_LIMIT'
              ? 'Le capital restant ne peut pas être déployé sans dépasser les caps type/groupe.'
              : code === 'INSUFFICIENT_CAPITAL'
                ? 'Le capital restant est inférieur au coût unitaire des allocations restantes.'
                : 'Les opportunités restantes sont bloquées par les contraintes de données, politique ou route.',
        });
      } else if (reasons.length === 0) {
        reasons.push({
          code: 'NO_ELIGIBLE_OPPORTUNITY',
          detail: 'Aucune allocation supplémentaire déterministe ne peut être financée.',
        });
      }
    }

    return {
      ...baseResult,
      total_capital_invested: totalInvested,
      total_expected_profit: totalExpectedProfit,
      total_expected_daily_profit: totalDailyProfit,
      weighted_roi: weightedRoi,
      positions,
      diversification: {
        by_category: concentrationCategory,
        by_group: Object.fromEntries(
          Object.entries(concentrationGroup).map(([k, v]) => [
            eligible.find((o) => o.group_id === Number(k))?.group_name || `Group ${k}`,
            v,
          ]),
        ),
        by_route: concentrationRoute,
      },
      unallocated_capital: unallocatedCapital,
      unallocated_reasons: reasons.length > 0 ? reasons : undefined,
    };
  }
}
