import { TreasuryEngine } from './treasury';
import type {
  FinancialConfig,
  TreasurySourceMode,
  TreasuryCapitalStatus,
} from '../types/financial';
import type {
  EveCharacterOrder,
  EveCharacterSession,
} from '../types/character';
import type {
  GlobalSyncProgress,
  InterRegionalOpportunity,
  UniverseWideOpportunity,
} from '../types/opportunity';
import type {
  DataHealthStatus,
} from '../types/market';
import type {
  PortfolioCandidateUniverseSnapshot,
  PortfolioOrderExposureSnapshot,
  PortfolioRealInventorySnapshot,
  PortfolioTreasurySnapshot,
  PortfolioUniverseCoverage,
  PortfolioUniverseState,
  ProposedAllocationSnapshot,
  RealPortfolioSnapshot,
  PortfolioAggregationInput,
  AllocationUniverseResolution,
} from '../types/portfolio';
import type { PortfolioSimulation } from '../types/execution';
import { PortfolioOptimizer } from './portfolio';

const BLOCKING_HEALTH: ReadonlySet<DataHealthStatus> = new Set([
  'STALE',
  'PARTIAL',
  'UNKNOWN',
  'ERROR',
]);

const UNIVERSE_BLOCKING_STATES: ReadonlySet<PortfolioUniverseState> = new Set([
  'STALE',
  'PARTIAL',
  'UNKNOWN',
  'ERROR',
]);

function worstHealth(states: DataHealthStatus[]): DataHealthStatus {
  if (states.includes('ERROR')) return 'ERROR';
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  if (states.includes('PARTIAL')) return 'PARTIAL';
  if (states.includes('STALE')) return 'STALE';
  if (states.includes('CACHE')) return 'CACHE';
  return 'LIVE';
}

function treasuryHealth(status: TreasuryCapitalStatus): DataHealthStatus {
  if (status === 'observed_esi') return 'LIVE';
  if (status === 'manual') return 'LIVE';
  return 'UNKNOWN';
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function resolvePortfolioTreasury(
  config: FinancialConfig,
  characters: EveCharacterSession[] = [],
  activeCharacterId: number | null = null,
): PortfolioTreasurySnapshot {
  const resolution = TreasuryEngine.resolveEffectiveCapital(
    config,
    characters,
    activeCharacterId,
  );

  const reserveConfigured =
    typeof config.policy_reserve === 'number' &&
    Number.isFinite(config.policy_reserve) &&
    config.policy_reserve > 0;
  const policyReserve = reserveConfigured ? Math.max(0, config.policy_reserve!) : 0;

  const fleetWalletsPartial =
    resolution.source_mode === 'fleet_consolidated' &&
    characters.length > 0 &&
    characters.some((character) => typeof character.wallet_balance !== 'number' || !Number.isFinite(character.wallet_balance));

  const dataHealth: DataHealthStatus =
    resolution.capital_status === 'unavailable'
      ? 'UNKNOWN'
      : fleetWalletsPartial
        ? 'PARTIAL'
        : 'LIVE';

  const treasuryCash =
    resolution.capital_status === 'unavailable' || fleetWalletsPartial
      ? null
      : resolution.effective_capital;

  const allocationBudget =
    treasuryCash === null
      ? null
      : Math.max(0, treasuryCash - policyReserve);

  const sourceId = buildTreasurySourceId(
    resolution.source_mode,
    resolution.division,
    config,
    characters,
    activeCharacterId,
  );

  const principalScope = buildPrincipalScope(
    resolution.source_mode,
    config,
    characters,
    activeCharacterId,
  );

  return {
    source_mode: resolution.source_mode,
    source_kind:
      resolution.capital_status === 'observed_esi'
        ? 'OBSERVED_ESI'
        : resolution.capital_status === 'manual'
          ? 'MANUAL'
          : 'UNAVAILABLE',
    source_id: sourceId,
    principal_scope: principalScope,
    label: resolution.label,
    treasury_cash: treasuryCash,
    policy_reserve: policyReserve,
    reserve_configured: reserveConfigured,
    allocation_budget: allocationBudget,
    capital_status: resolution.capital_status,
    data_health: dataHealth,
    is_simulation:
      resolution.capital_status === 'manual' ||
      resolution.source_mode === 'manual_budget',
  };
}

function buildTreasurySourceId(
  mode: TreasurySourceMode,
  division: number | undefined,
  config: FinancialConfig,
  characters: EveCharacterSession[],
  activeCharacterId: number | null,
): string {
  switch (mode) {
    case 'corporation':
      return `corporation:${config.corporation_id ?? 'unknown'}:division:${division ?? config.corporation_wallet_division ?? 1}`;
    case 'active_character': {
      const id =
        activeCharacterId ??
        characters.find((character) => character.is_active)?.character_id ??
        characters[0]?.character_id;
      return `character:${id ?? 'unknown'}`;
    }
    case 'fleet_consolidated':
      return `fleet:${characters.map((character) => character.character_id).sort((a, b) => a - b).join(',') || 'selected'}`;
    case 'manual_budget':
    default:
      return 'manual_budget';
  }
}

function buildPrincipalScope(
  mode: TreasurySourceMode,
  config: FinancialConfig,
  characters: EveCharacterSession[],
  activeCharacterId: number | null,
): string {
  switch (mode) {
    case 'corporation':
      return `corp:${config.corporation_id ?? 'unknown'}`;
    case 'fleet_consolidated':
      return characters.map((character) => String(character.character_id)).sort().join(',') || 'fleet:empty';
    case 'active_character': {
      const id =
        activeCharacterId ??
        characters.find((character) => character.is_active)?.character_id ??
        characters[0]?.character_id;
      return id ? `character:${id}` : 'character:unknown';
    }
    case 'manual_budget':
    default:
      return 'manual';
  }
}

export function scopePortfolioOrders(
  orders: EveCharacterOrder[],
  treasury: PortfolioTreasurySnapshot,
  config: FinancialConfig,
  characters: EveCharacterSession[] = [],
): EveCharacterOrder[] {
  const linkedCharacterIds = new Set(characters.map((character) => character.character_id));
  const corporationId = config.corporation_id;

  return orders.filter((order) => {
    const ownerType = order.ownership?.owner_type;
    const ownerId = order.ownership?.owner_id;

    if (treasury.source_mode === 'corporation') {
      return (
        ownerType === 'corporation' &&
        typeof ownerId === 'number' &&
        ownerId === corporationId &&
        order.ownership?.wallet_division === treasuryDivision(treasury, config)
      );
    }

    if (treasury.source_mode === 'fleet_consolidated') {
      if (ownerType === 'corporation') return false;
      if (ownerType === 'character' && typeof ownerId === 'number') {
        return linkedCharacterIds.has(ownerId);
      }
      return (
        ownerType === undefined &&
        typeof order.character_id === 'number' &&
        linkedCharacterIds.has(order.character_id)
      );
    }

    if (treasury.source_mode === 'active_character') {
      const activeId = parseCharacterId(treasury.principal_scope);
      if (ownerType === 'corporation') return false;
      if (ownerType === 'character') return ownerId === activeId;
      return typeof order.character_id === 'number' && order.character_id === activeId;
    }

    // A manual budget has no observed economic order scope by itself.
    return false;
  });
}

function parseCharacterId(scope: string): number | null {
  const match = scope.match(/^character:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function treasuryDivision(
  treasury: PortfolioTreasurySnapshot,
  config: FinancialConfig,
): number {
  const match = treasury.source_id.match(/:division:(\d+)$/);
  return match ? Number(match[1]) : (config.corporation_wallet_division ?? 1);
}

export function aggregatePortfolioOrderExposure(
  orders: EveCharacterOrder[],
  explicitHealth?: DataHealthStatus,
): PortfolioOrderExposureSnapshot {
  let buyEscrow = 0;
  let buyObligation = 0;
  let sellExposure = 0;
  let missingEscrowCount = 0;
  let missingProvenanceCount = 0;
  let invalidCount = 0;

  for (const order of orders) {
    if (!order.ownership) missingProvenanceCount++;

    const remain = finiteNonNegative(order.volume_remain);
    const price = finiteNonNegative(order.price);

    if (remain === null || price === null) {
      invalidCount++;
      continue;
    }

    const notional = price * remain;
    if (!Number.isFinite(notional)) {
      invalidCount++;
      continue;
    }

    if (order.is_buy_order) {
      buyObligation += notional;
      if (order.escrow !== undefined) {
        const escrow = finiteNonNegative(order.escrow);
        if (escrow === null) invalidCount++;
        else buyEscrow += escrow;
      } else {
        missingEscrowCount++;
      }
    } else {
      sellExposure += notional;
    }
  }

  const health = explicitHealth ??
    (invalidCount > 0 || missingEscrowCount > 0 || missingProvenanceCount > 0
      ? 'PARTIAL'
      : 'UNKNOWN');

  return {
    order_count: orders.length,
    buy_order_count: orders.filter((order) => order.is_buy_order).length,
    sell_order_count: orders.filter((order) => !order.is_buy_order).length,
    buy_escrow: missingEscrowCount > 0 ? null : buyEscrow,
    buy_obligation: Number.isFinite(buyObligation) ? buyObligation : null,
    uncovered_buy_obligation:
      missingEscrowCount > 0 || !Number.isFinite(buyObligation)
        ? null
        : Math.max(0, buyObligation - buyEscrow),
    sell_exposure: Number.isFinite(sellExposure) ? sellExposure : null,
    data_health: health,
    missing_escrow_count: missingEscrowCount,
    missing_provenance_count: missingProvenanceCount,
    scoped_order_ids: orders.map((order) => String(order.order_id)),
  };
}

function opportunityHealth(opp: InterRegionalOpportunity): DataHealthStatus {
  const states: DataHealthStatus[] = [];
  const buyQuality = opp.data_quality?.buy_hub_quality;
  const sellQuality = opp.data_quality?.sell_hub_quality;
  if (buyQuality?.health_status) states.push(buyQuality.health_status);
  if (sellQuality?.health_status) states.push(sellQuality.health_status);

  const marketPillar = opp.certification?.pillar_evaluations?.market_data;
  if (marketPillar?.health_source) states.push(marketPillar.health_source);
  if (marketPillar?.health_dest) states.push(marketPillar.health_dest);

  if (states.length === 0) return 'UNKNOWN';
  return worstHealth(states);
}

function universeCoverageAndState(
  universe: UniverseWideOpportunity[],
  progress?: GlobalSyncProgress,
): {
  coverage: PortfolioUniverseCoverage;
  state: PortfolioUniverseState;
  health: DataHealthStatus;
} {
  if (progress?.is_running) {
    return {
      coverage: universe.length > 0 ? 'PARTIAL' : 'UNKNOWN',
      state: 'PARTIAL',
      health: 'PARTIAL',
    };
  }

  if (!progress || progress.total_items === 0) {
    if (universe.length > 0) {
      return { coverage: 'BOUNDED', state: 'CACHE', health: 'CACHE' };
    }
    return { coverage: 'UNKNOWN', state: 'UNKNOWN', health: 'UNKNOWN' };
  }

  if (progress.failed_items > 0 || progress.completed_items < progress.total_items) {
    return {
      coverage: 'PARTIAL',
      state: universe.length > 0 ? 'PARTIAL' : 'PARTIAL',
      health: 'PARTIAL',
    };
  }

  if (universe.length === 0) {
    return { coverage: 'BOUNDED', state: 'EMPTY', health: 'LIVE' };
  }

  const health = worstHealth(universe.map(opportunityHealth));

  if (health === 'ERROR') return { coverage: 'BOUNDED', state: 'ERROR', health };
  if (health === 'PARTIAL') return { coverage: 'BOUNDED', state: 'PARTIAL', health };
  if (health === 'STALE') return { coverage: 'BOUNDED', state: 'STALE', health };
  if (health === 'UNKNOWN') return { coverage: 'BOUNDED', state: 'UNKNOWN', health };
  if (health === 'CACHE') return { coverage: 'BOUNDED', state: 'CACHE', health };
  return { coverage: 'BOUNDED', state: 'READY', health: 'LIVE' };
}

export function buildCandidateUniverseSnapshot(
  universe: UniverseWideOpportunity[],
  progress?: GlobalSyncProgress,
): PortfolioCandidateUniverseSnapshot {
  const resolution = universeCoverageAndState(universe, progress);
  const detectedAt = universe.reduce<string | null>(
    (latest, opp) => (!latest || opp.detected_at > latest ? opp.detected_at : latest),
    null,
  );

  return {
    candidate_count: universe.length,
    coverage: resolution.coverage,
    state: resolution.state,
    data_health: resolution.health,
    detected_at: detectedAt,
    selected_item_is_navigation_only: true,
    candidates: [...universe],
  };
}

export function resolveAllocationUniverse(
  universe: UniverseWideOpportunity[],
  selectedTypeId?: number,
): AllocationUniverseResolution {
  return {
    opportunities: universe as InterRegionalOpportunity[],
    source: 'GLOBAL_UNIVERSE',
    selected_item_type_id: selectedTypeId,
  };
}

export function buildRealPortfolioSnapshot(
  treasury: PortfolioTreasurySnapshot,
  orders: EveCharacterOrder[],
): RealPortfolioSnapshot {
  const orderExposure = aggregatePortfolioOrderExposure(orders);
  const inventory: PortfolioRealInventorySnapshot = {
    coverage: 'UNKNOWN',
    quantity: null,
    location_known: false,
    market_value: null,
    cost_basis: null,
  };

  const health = worstHealth([
    treasury.data_health,
    orderExposure.data_health,
    'UNKNOWN',
  ]);

  return {
    treasury,
    orders: orderExposure,
    inventory,
    data_health: health,
    freshness: health,
    is_authoritative_net_worth: false,
  };
}

export function buildProposedAllocationSnapshot(
  treasury: PortfolioTreasurySnapshot,
  candidateUniverse: PortfolioCandidateUniverseSnapshot,
  simulation: PortfolioSimulation,
  options: { preserveSimulation?: boolean } = {},
): ProposedAllocationSnapshot {
  const blockedByTreasury = treasury.allocation_budget === null;
  const blockedByUniverse =
    UNIVERSE_BLOCKING_STATES.has(candidateUniverse.state) ||
    BLOCKING_HEALTH.has(candidateUniverse.data_health);

  const dataHealth = worstHealth([
    treasury.data_health,
    candidateUniverse.data_health,
    simulation.data_health ?? 'LIVE',
  ]);

  const proposalBlocked = blockedByTreasury || blockedByUniverse;
  const surfacedSimulation =
    proposalBlocked && options.preserveSimulation !== true
      ? {
          ...simulation,
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
          allocation_budget: treasury.allocation_budget,
          policy_reserve: treasury.policy_reserve,
          unallocated_capital: treasury.allocation_budget,
          unallocated_reasons: [
            ...(simulation.unallocated_reasons ?? []),
            {
              code: 'DATA_ISSUE' as const,
              detail: 'Proposition fraîche bloquée: positions calculées sur des données insuffisantes non présentées.',
            },
          ],
        }
      : simulation;

  const deployed = surfacedSimulation.total_capital_invested;
  const withinBudget =
    treasury.allocation_budget === null
      ? null
      : Math.max(0, treasury.allocation_budget - deployed);

  const reserveLocked = treasury.policy_reserve;
  const unallocatedTotal =
    treasury.allocation_budget === null
      ? null
      : reserveLocked + (withinBudget ?? 0);

  const reasons = [...(surfacedSimulation.unallocated_reasons ?? [])];
  if (reserveLocked > 0) {
    reasons.unshift({
      code: 'RESERVE',
      amount: reserveLocked,
      detail: 'Capital explicitement retenu par la politique de réserve.',
    });
  }

  const positionRationales: Record<string, import('../types/portfolio').PortfolioPositionRationale> = {};
  for (const position of surfacedSimulation.positions) {
    if (position.rationale) {
      positionRationales[position.opportunity.id] = position.rationale;
    }
  }

  return {
    treasury,
    candidate_universe: candidateUniverse,
    simulation: surfacedSimulation,
    data_health: dataHealth,
    freshness: candidateUniverse.data_health,
    proposal_blocked: proposalBlocked,
    unallocated_capital: unallocatedTotal,
    unallocated_within_budget: withinBudget,
    reserve_locked: reserveLocked,
    unallocated_reasons: reasons,
    position_rationales: positionRationales,
  };
}

export function buildPortfolioSnapshots(
  input: PortfolioAggregationInput,
): {
  treasury: PortfolioTreasurySnapshot;
  scopedOrders: EveCharacterOrder[];
  realPortfolio: RealPortfolioSnapshot;
  candidateUniverse: PortfolioCandidateUniverseSnapshot;
  proposedAllocation: ProposedAllocationSnapshot;
  simulation: PortfolioSimulation;
} {
  const characters = input.characters ?? [];
  const treasury = resolvePortfolioTreasury(
    input.config,
    characters,
    input.active_character_id ?? null,
  );
  const scopedOrders = scopePortfolioOrders(
    input.orders ?? [],
    treasury,
    input.config,
    characters,
  );

  const candidateUniverse = buildCandidateUniverseSnapshot(
    input.universe ?? [],
    input.global_sync_progress,
  );
  const simulation = PortfolioOptimizer.optimize(
    candidateUniverse.candidates,
    input.config,
    {
      allocation_budget: treasury.allocation_budget,
      policy_reserve: treasury.policy_reserve,
      capital_provenance: {
        source_kind: treasury.source_kind,
        source_id: treasury.source_id,
        principal_scope: treasury.principal_scope,
      },
    },
  );

  return {
    treasury,
    scopedOrders,
    realPortfolio: buildRealPortfolioSnapshot(treasury, scopedOrders),
    candidateUniverse,
    proposedAllocation: buildProposedAllocationSnapshot(treasury, candidateUniverse, simulation),
    simulation,
  };
}

export function isFreshProposalAllowed(snapshot: ProposedAllocationSnapshot): boolean {
  return !snapshot.proposal_blocked &&
    snapshot.candidate_universe.coverage !== 'UNKNOWN' &&
    snapshot.candidate_universe.state !== 'EMPTY' &&
    snapshot.candidate_universe.data_health !== 'ERROR';
}
