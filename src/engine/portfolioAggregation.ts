import {
  DataHealthStatus,
  DataState,
  PortfolioAggregationInput,
  PortfolioCandidateUniverseSnapshot,
  PortfolioDataQuality,
  PortfolioOrderExposureSnapshot,
  PortfolioSnapshot,
  ProposedAllocationSnapshot,
  RealPortfolioSnapshot,
} from '../types';
import type {
  CurrentPosition,
  EconomicOriginCoverage,
  FinancialCompleteness,
  FinancialHistoryCoverage,
  RealizedFinancialOutcome,
} from '../types/financial';
import { selectOrdersByScope } from './orderScoping';

const HEALTH_PRIORITY: Record<DataHealthStatus, number> = {
  LIVE: 0,
  CACHE: 1,
  STALE: 2,
  PARTIAL: 3,
  UNKNOWN: 4,
  ERROR: 5,
};

const DATA_STATE_PRIORITY: Record<DataState, number> = {
  VALID: 0,
  LIVE: 0,
  EMPTY: 1,
  CACHE: 1,
  STALE: 3,
  UNKNOWN: 4,
  PARTIAL: 4,
  ERROR: 5,
};

function worstHealth(states: readonly DataHealthStatus[]): DataHealthStatus {
  if (states.length === 0) return 'UNKNOWN';

  return states.reduce(
    (worst, state) => HEALTH_PRIORITY[state] > HEALTH_PRIORITY[worst] ? state : worst,
    'LIVE' as DataHealthStatus,
  );
}

function worstDataState(states: readonly DataState[]): DataState {
  if (states.length === 0) return 'UNKNOWN';

  if (states.includes('ERROR')) return 'ERROR';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  if (states.includes('STALE')) return 'STALE';
  if (states.includes('PARTIAL')) return 'PARTIAL';
  if (states.includes('CACHE')) return 'CACHE';
  if (states.includes('EMPTY')) return 'EMPTY';
  if (states.includes('LIVE')) return 'LIVE';
  return 'VALID';
}

function toPositionHealth(
  positions: readonly CurrentPosition[],
  declaredHealth: DataHealthStatus,
): DataHealthStatus {
  const states: DataHealthStatus[] = [declaredHealth];

  for (const position of positions) {
    if (position.position_completeness === 'UNAVAILABLE') {
      states.push('UNKNOWN');
    } else if (position.position_completeness === 'PARTIAL') {
      states.push('PARTIAL');
    }

    if (position.source_coverage === 'PARTIAL') states.push('PARTIAL');
    if (position.history_coverage === 'UNKNOWN') states.push('UNKNOWN');
    else if (position.history_coverage === 'PARTIAL') states.push('PARTIAL');
    if (position.economic_origin_coverage === 'UNKNOWN') states.push('UNKNOWN');
    else if (position.economic_origin_coverage === 'PARTIAL') states.push('PARTIAL');
  }

  return worstHealth(states);
}

function toPositionDataState(
  positions: readonly CurrentPosition[],
  declaredState: DataState,
): DataState {
  const states: DataState[] = [declaredState];

  for (const position of positions) {
    if (position.position_completeness === 'UNAVAILABLE') states.push('UNKNOWN');
    else if (position.position_completeness === 'PARTIAL') states.push('PARTIAL');

    if (position.source_coverage === 'PARTIAL') states.push('PARTIAL');
    if (position.history_coverage === 'UNKNOWN') states.push('UNKNOWN');
    else if (position.history_coverage === 'PARTIAL') states.push('PARTIAL');
  }

  return worstDataState(states);
}

function aggregateScopeCoverage<T extends string>(
  values: readonly T[],
  completeValue: T,
  partialValue: T,
  unknownValue: T,
): T | undefined {
  if (values.length === 0) return undefined;
  if (values.includes(unknownValue)) return unknownValue;
  if (values.includes(partialValue)) return partialValue;
  return completeValue;
}

function buildFinancialQuality(
  positions: readonly CurrentPosition[],
  outcomes: readonly RealizedFinancialOutcome[],
  declaredHealth: DataHealthStatus,
  declaredState: DataState,
): PortfolioDataQuality {
  const positionHealth = toPositionHealth(positions, declaredHealth);
  const outcomeHealth = worstHealth([
    positionHealth,
    outcomes.some((outcome) => outcome.data_state === 'PARTIAL') ? 'PARTIAL' : 'LIVE',
  ]);

  const historyValues = [
    ...positions.map((position) => position.history_coverage),
    ...outcomes.map((outcome) => outcome.history_coverage),
  ] as FinancialHistoryCoverage[];

  const originValues = [
    ...positions.map((position) => position.economic_origin_coverage),
    ...outcomes.map((outcome) => outcome.economic_origin_coverage),
  ] as EconomicOriginCoverage[];

  const sourceValues = [
    ...positions.map((position) => position.source_coverage),
    ...outcomes.map((outcome) => outcome.source_coverage),
  ];

  const completenessValues: FinancialCompleteness[] = [
    ...positions.map((position) => position.financial_completeness),
    ...outcomes.map((outcome) => outcome.financial_completeness),
  ];

  const financialCompleteness =
    completenessValues.includes('UNAVAILABLE')
      ? 'UNAVAILABLE'
      : completenessValues.includes('PARTIAL')
        ? 'PARTIAL'
        : completenessValues.includes('ESTIMATED')
          ? 'ESTIMATED'
          : completenessValues.length > 0
            ? 'OBSERVED'
            : undefined;

  const sourceCoverage =
    sourceValues.includes('UNAVAILABLE')
      ? 'UNAVAILABLE'
      : sourceValues.includes('PARTIAL')
        ? 'PARTIAL'
        : sourceValues.length > 0
          ? 'MARKET_TRACEABLE'
          : undefined;

  return {
    health: outcomeHealth,
    data_state: worstDataState([
      declaredState,
      toPositionDataState(positions, declaredState),
      outcomes.some((outcome) => outcome.data_state === 'PARTIAL') ? 'PARTIAL' : 'VALID',
    ]),
    ...(aggregateScopeCoverage(
      historyValues,
      'COMPLETE_FOR_SCOPE',
      'PARTIAL',
      'UNKNOWN',
    ) ? { history_coverage: aggregateScopeCoverage(historyValues, 'COMPLETE_FOR_SCOPE', 'PARTIAL', 'UNKNOWN') } : {}),
    ...(aggregateScopeCoverage(
      originValues,
      'COMPLETE_FOR_SCOPE',
      'PARTIAL',
      'UNKNOWN',
    ) ? { economic_origin_coverage: aggregateScopeCoverage(originValues, 'COMPLETE_FOR_SCOPE', 'PARTIAL', 'UNKNOWN') } : {}),
    ...(sourceCoverage ? { source_coverage: sourceCoverage } : {}),
    ...(financialCompleteness ? { financial_completeness: financialCompleteness as FinancialCompleteness } : {}),
  };
}

function aggregateOrderExposure(
  orders: readonly import('../types/character').EveCharacterOrder[],
  declaredHealth: DataHealthStatus,
  declaredState: DataState,
  unresolvedCorporationOrders: readonly import('../types/character').EveCharacterOrder[] = [],
): PortfolioOrderExposureSnapshot {
  const scoped = [...orders];
  let buyEscrow = 0;
  let buyObligation = 0;
  let sellExposure = 0;
  let invalidNotionalCount = 0;
  let missingEscrowCount = 0;
  let missingProvenanceCount = 0;

  for (const order of scoped) {
    if (!order.ownership) missingProvenanceCount++;

    const remaining = Number.isFinite(order.volume_remain) && order.volume_remain >= 0
      ? order.volume_remain
      : null;
    const price = Number.isFinite(order.price) && order.price >= 0
      ? order.price
      : null;

    if (remaining === null || price === null) {
      invalidNotionalCount++;
      continue;
    }

    const notional = remaining * price;
    if (!Number.isFinite(notional)) {
      invalidNotionalCount++;
      continue;
    }

    if (order.is_buy_order) {
      buyObligation += notional;

      if (order.escrow === undefined) {
        missingEscrowCount++;
      } else if (
        Number.isFinite(order.escrow) &&
        order.escrow >= 0
      ) {
        buyEscrow += order.escrow;
      } else {
        missingEscrowCount++;
      }
    } else {
      sellExposure += notional;
    }
  }

  const exposureHealth = worstHealth([
    declaredHealth,
    unresolvedCorporationOrders.length > 0
      || missingProvenanceCount > 0
      || missingEscrowCount > 0
      || invalidNotionalCount > 0
      ? 'PARTIAL'
      : 'LIVE',
  ]);

  const exposureState = worstDataState([
    declaredState,
    unresolvedCorporationOrders.length > 0
      || missingProvenanceCount > 0
      || missingEscrowCount > 0
      || invalidNotionalCount > 0
      ? 'PARTIAL'
      : 'VALID',
  ]);

  const scopeComplete = unresolvedCorporationOrders.length === 0;
  const buyObligationKnown = scopeComplete && invalidNotionalCount === 0;
  const sellExposureKnown = scopeComplete && invalidNotionalCount === 0;
  const escrowKnown = scopeComplete && missingEscrowCount === 0;

  let unresolvedNotional: number | null = 0;
  for (const order of unresolvedCorporationOrders) {
    const remaining = Number.isFinite(order.volume_remain) && order.volume_remain >= 0
      ? order.volume_remain
      : null;
    const price = Number.isFinite(order.price) && order.price >= 0
      ? order.price
      : null;
    if (remaining === null || price === null) {
      unresolvedNotional = null;
      break;
    }
    const notional = remaining * price;
    if (!Number.isFinite(notional)) {
      unresolvedNotional = null;
      break;
    }
    unresolvedNotional += notional;
  }

  return {
    order_count: scoped.length,
    buy_order_count: scoped.filter((order) => order.is_buy_order).length,
    sell_order_count: scoped.filter((order) => !order.is_buy_order).length,
    buy_escrow: escrowKnown ? buyEscrow : null,
    buy_obligation: buyObligationKnown ? buyObligation : null,
    uncovered_buy_obligation:
      buyObligationKnown && escrowKnown
        ? Math.max(0, buyObligation - buyEscrow)
        : null,
    sell_exposure: sellExposureKnown ? sellExposure : null,
    missing_escrow_count: missingEscrowCount,
    missing_provenance_count: missingProvenanceCount,
    scoped_order_ids: scoped.map((order) => order.order_id),
    unresolved_corporation_order_count: unresolvedCorporationOrders.length,
    unresolved_corporation_order_ids: unresolvedCorporationOrders.map((order) => order.order_id),
    unresolved_corporation_order_notional: unresolvedNotional,
    health: exposureHealth,
    data_state: exposureState,
  };
}

/**
 * Aggregates only already-resolved domain facts. It does not fetch, scope by
 * treasury mode, calculate Financial Truth, or call the optimizer.
 */
export function aggregatePortfolioReal(
  input: PortfolioAggregationInput,
): RealPortfolioSnapshot {
  const unresolvedCorporationOrders =
    input.order_scope.type === 'corporation'
      ? input.orders.filter(
          (order) => order.is_corporation === true && !order.ownership,
        )
      : [];

  const scopedOrders = selectOrdersByScope(
    [...input.orders],
    input.order_scope,
    input.order_selection_context,
  );

  const financialPositions = input.positions.filter(
    (position) => position.accounting_scope_id === input.accounting_scope_id,
  );
  const foreignPositions = input.positions.length - financialPositions.length;

  const financialOutcomes = input.realized_outcomes.filter(
    (outcome) => outcome.accounting_scope_id === input.accounting_scope_id,
  );
  const foreignOutcomes = input.realized_outcomes.length - financialOutcomes.length;

  const orderExposure = aggregateOrderExposure(
    scopedOrders,
    input.orders_health,
    input.orders_data_state,
    unresolvedCorporationOrders,
  );

  const financialQuality = buildFinancialQuality(
    financialPositions,
    financialOutcomes,
    input.financial_health,
    input.financial_data_state,
  );

  const qualityHealth = worstHealth([
    input.treasury.health,
    orderExposure.health,
    financialQuality.health,
    foreignPositions > 0 || foreignOutcomes > 0 ? 'PARTIAL' : 'LIVE',
  ]);

  const qualityState = worstDataState([
    input.treasury.data_state,
    orderExposure.data_state,
    financialQuality.data_state,
    foreignPositions > 0 || foreignOutcomes > 0 ? 'PARTIAL' : 'VALID',
  ]);

  const inventory: RealPortfolioSnapshot['inventory'] = {
    coverage: 'UNKNOWN',
    quantity: null,
    location_known: false,
    market_value: null,
    cost_basis: null,
    source_boundary: 'NEW_SOURCE',
  };

  const ownership = scopedOrders.flatMap((order) =>
    order.ownership ? [order.ownership] : [],
  );

  return {
    accounting_scope_id: input.accounting_scope_id,
    treasury: input.treasury,
    orders: {
      records: scopedOrders,
      ownership,
      exposure: orderExposure,
    },
    positions: financialPositions,
    realized_outcomes: financialOutcomes,
    inventory,
    quality: {
      ...financialQuality,
      health: qualityHealth,
      data_state: qualityState,
    },
    is_authoritative_net_worth: false,
  };
}

/**
 * Composes the independently acquired candidate universe without changing
 * its coverage, health, state or freshness evidence.
 */
export function composePortfolioCandidateUniverse(
  snapshot: PortfolioCandidateUniverseSnapshot,
): PortfolioCandidateUniverseSnapshot {
  return snapshot;
}

/**
 * Final composition seam used once TASK-05 has produced the prospective
 * allocation snapshot. No optimizer policy is implemented here.
 */
export function composePortfolioSnapshot(
  real: RealPortfolioSnapshot,
  proposed: ProposedAllocationSnapshot,
): PortfolioSnapshot {
  if (real.accounting_scope_id !== proposed.accounting_scope_id) {
    throw new Error(
      'Portfolio composition requires matching accounting_scope_id for Real Portfolio and Proposed Allocation',
    );
  }

  return { real, proposed };
}

export function getScopedOrdersForPortfolio(
  input: PortfolioAggregationInput,
): readonly import('../types/character').EveCharacterOrder[] {
  return selectOrdersByScope(
    [...input.orders],
    input.order_scope,
    input.order_selection_context,
  );
}

export function getCandidateUniverseForPortfolio(
  input: PortfolioAggregationInput,
): PortfolioCandidateUniverseSnapshot {
  return composePortfolioCandidateUniverse(input.candidate_universe);
}
