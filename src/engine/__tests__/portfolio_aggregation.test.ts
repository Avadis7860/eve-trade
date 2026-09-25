import { aggregatePortfolioReal, composePortfolioCandidateUniverse, composePortfolioSnapshot } from '../portfolioAggregation';
import type {
  PortfolioAggregationInput,
  PortfolioCandidateUniverseSnapshot,
  PortfolioTreasurySnapshot,
  ProposedAllocationSnapshot,
} from '../../types/portfolio';
import type { CurrentPosition, RealizedFinancialOutcome, TreasuryResolution } from '../../types/financial';
import type { EveCharacterOrder, OrderSelectionContext } from '../../types/character';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('[PortfolioAggregationTest] ' + message);
}

const treasuryResolution: TreasuryResolution = {
  source_mode: 'corporation',
  effective_capital: 10_000_000,
  label: 'Corporation',
  is_corporation: true,
  capital_status: 'observed_esi',
};

const treasury: PortfolioTreasurySnapshot = {
  resolution: treasuryResolution,
  provenance: {
    source_kind: 'OBSERVED_ESI',
    source_id: 'corporation:42:division:1',
    principal_scope: 'corp:42',
  },
  treasury_cash: 10_000_000,
  allocation_budget: 10_000_000,
  is_simulation: false,
  health: 'LIVE',
  data_state: 'VALID',
};

const characterOrder: EveCharacterOrder = {
  order_id: '1001',
  character_id: 10,
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  price: 100,
  volume_remain: 50,
  volume_total: 50,
  is_buy_order: true,
  issued: '2026-09-25T10:00:00Z',
  duration: 90,
  ownership: {
    principal_character_id: 10,
    observed_by_character_ids: [10],
    owner_type: 'character',
    owner_id: 10,
    issuer_character_id: 10,
  },
};

const corporationOrder: EveCharacterOrder = {
  order_id: '2002',
  character_id: undefined,
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  price: 180,
  volume_remain: 50,
  volume_total: 50,
  is_buy_order: false,
  issued: '2026-09-25T10:00:00Z',
  duration: 90,
  ownership: {
    principal_character_id: 10,
    observed_by_character_ids: [10],
    owner_type: 'corporation',
    owner_id: 42,
    issuer_character_id: 10,
    wallet_division: 1,
  },
};

const orderSelectionContext: OrderSelectionContext = {
  activeCharacterId: '10',
  fleetCharacterIds: ['10'],
  corporationIds: ['42'],
};

const candidateUniverse: PortfolioCandidateUniverseSnapshot = {
  candidate_count: 1,
  coverage: 'BOUNDED',
  state: 'READY',
  health: 'LIVE',
  data_state: 'VALID',
  freshness: 'fresh',
  detected_at: '2026-09-25T10:05:00Z',
  selected_item_is_navigation_only: true,
  candidates: [],
};

function baseInput(overrides: Partial<PortfolioAggregationInput> = {}): PortfolioAggregationInput {
  return {
    accounting_scope_id: 'corp:42',
    treasury,
    order_scope: { type: 'active_character' },
    order_selection_context: orderSelectionContext,
    orders: [characterOrder, corporationOrder],
    orders_health: 'LIVE',
    orders_data_state: 'VALID',
    positions: [],
    realized_outcomes: [],
    financial_health: 'LIVE',
    financial_data_state: 'VALID',
    candidate_universe: candidateUniverse,
    ...overrides,
  };
}

function makePosition(scope: string, quantity: number): CurrentPosition {
  return {
    position_id: 'position-' + scope,
    position_segment_id: 'segment-' + scope,
    accounting_scope_id: scope,
    type_id: 34,
    economic_owner_type: 'corporation',
    economic_owner_id: 42,
    quantity_acquired: quantity,
    quantity_disposed: 0,
    remaining_quantity: quantity,
    remaining_cost_basis: quantity * 100,
    realized_gross_profit: null,
    capital_committed: quantity * 100,
    cash_recovered: 0,
    capital_recovery_delta: -(quantity * 100),
    capital_recovery_ratio: 0,
    capital_recovery_state: 'NEGATIVE',
    provenance: [{
      source_kind: 'ESI_WALLET_TRANSACTION',
      source_id: 'tx-' + scope,
      principal_scope: 'character:10',
    }],
    lifecycle_status: 'OPEN',
    position_completeness: 'OBSERVED',
    financial_completeness: 'OBSERVED',
    source_coverage: 'MARKET_TRACEABLE',
    history_coverage: 'COMPLETE_FOR_SCOPE',
    economic_origin_coverage: 'COMPLETE_FOR_SCOPE',
    lots: [],
    allocations: [],
    disposition_states: [],
    unmatched_disposition_quantity: 0,
    invalid_transaction_ids: [],
    unreconciled_location_transition_count: 0,
  };
}

function makeOutcome(scope: string): RealizedFinancialOutcome {
  return {
    outcome_id: 'outcome-' + scope,
    execution_id: 'execution-' + scope,
    character_id: 10,
    accounting_scope_id: scope,
    source_coverage: 'MARKET_TRACEABLE',
    history_coverage: 'COMPLETE_FOR_SCOPE',
    economic_origin_coverage: 'COMPLETE_FOR_SCOPE',
    position_segments: [],
    position_disposition_states: [],
    calculation_source: 'TRANSACTION_FACTS',
    type_id: 34,
    total_buy_quantity: 10,
    total_sell_quantity: 10,
    matched_quantity: 10,
    remaining_inventory_quantity: 0,
    unmatched_sell_quantity: 0,
    has_unmatched_sell_quantity: false,
    realized_acquisition_cost: 1_000,
    realized_revenue: 1_100,
    gross_realized_profit: 100,
    realized_gross: 100,
    fees: {
      fee_mode: 'ESTIMATED',
      fee_source: 'CONFIG_ESTIMATE',
      execution_fee_mode: 'UNKNOWN',
      estimated_buy_broker_fee: 0,
      estimated_sell_broker_fee: 0,
      estimated_sales_tax: 0,
      estimated_total_fees: 0,
      is_role_assumed: true,
    },
    net_realized_profit: 100,
    realized_net_estimated: 100,
    is_net_estimated: true,
    is_financially_complete: true,
    financial_completeness: 'ESTIMATED',
    roi: 0.1,
    margin: 0.1,
    profit_per_unit: 10,
    remaining_inventory_cost_basis: 0,
    capital_committed: 1_000,
    cash_recovered: 1_100,
    capital_recovery_delta: 100,
    capital_recovery_ratio: 1.1,
    position_lifecycle: 'CLOSED',
    position_remaining_quantity: 0,
    first_buy_at: '2026-09-20T10:00:00Z',
    last_buy_at: '2026-09-20T10:00:00Z',
    first_realized_sell_at: '2026-09-21T10:00:00Z',
    last_realized_sell_at: '2026-09-21T10:00:00Z',
    weighted_buy_timestamp: '2026-09-20T10:00:00Z',
    weighted_sell_timestamp: '2026-09-21T10:00:00Z',
    weighted_hold_ms: 86_400_000,
    weighted_hold_days: 1,
    data_state: 'VALID',
    fifo_allocations: [],
    remaining_lots: [],
    realized_financial_engine_version: 'test',
  };
}

function run(): void {
  const characterScoped = aggregatePortfolioReal(baseInput({
    treasury: {
      ...treasury,
      resolution: {
        ...treasury.resolution,
        source_mode: 'corporation',
      },
    },
    order_scope: { type: 'active_character' },
  }));

  assert(characterScoped.orders.records.length === 1, 'order scope must be independent from treasury scope');
  assert(characterScoped.orders.records[0].order_id === characterOrder.order_id, 'character scope selected the wrong order');

  const corporationScoped = aggregatePortfolioReal(baseInput({
    treasury: {
      ...treasury,
      provenance: {
        ...treasury.provenance,
        principal_scope: 'character:10',
      },
    },
    order_scope: { type: 'corporation', corporationId: '42' },
  }));

  assert(corporationScoped.orders.records.length === 1, 'corporation scope must select corporation-owned orders explicitly');
  assert(corporationScoped.orders.records[0].order_id === corporationOrder.order_id, 'corporation scope selected the wrong order');
  assert(corporationScoped.orders.exposure.scoped_order_ids[0] === corporationOrder.order_id, 'order identity must remain provenance only');

  const mixedExposure = aggregatePortfolioReal(baseInput({
    order_scope: { type: 'active_character' },
    orders: [{
      ...characterOrder,
      escrow: undefined,
    }, {
      ...characterOrder,
      order_id: '1003',
      is_buy_order: false,
      price: 180,
      volume_remain: 50,
      escrow: undefined,
    }],
  }));

  assert(mixedExposure.orders.exposure.buy_obligation === 5_000, 'buy obligation should remain derivable');
  assert(mixedExposure.orders.exposure.buy_escrow === null, 'missing escrow must remain unknown');
  assert(mixedExposure.orders.exposure.uncovered_buy_obligation === null, 'uncovered obligation must not be invented without escrow evidence');
  assert(mixedExposure.orders.exposure.sell_exposure === 9_000, 'sell exposure should be composed independently');
  assert(mixedExposure.orders.exposure.health === 'PARTIAL', 'missing order evidence must degrade health');
  assert(mixedExposure.orders.exposure.data_state === 'PARTIAL', 'missing order evidence must degrade data state');

  const financial = aggregatePortfolioReal(baseInput({
    positions: [makePosition('corp:42', 10), makePosition('character:11', 999)],
    realized_outcomes: [makeOutcome('corp:42')],
    financial_health: 'LIVE',
    financial_data_state: 'VALID',
  }));

  assert(financial.positions.length === 1, 'positions from another accounting scope must not enter the aggregate');
  assert(financial.positions[0].accounting_scope_id === 'corp:42', 'position scope must be preserved');
  assert(financial.realized_outcomes.length === 1, 'matching realized outcomes must be composed');
  assert(financial.quality.health === 'PARTIAL', 'foreign financial records must degrade the aggregate instead of being silently ignored');
  assert(financial.quality.financial_completeness === 'ESTIMATED', 'financial completeness must come from canonical records');
  assert(financial.positions[0].remaining_quantity === 10, 'portfolio aggregation must preserve CurrentPosition values');
  assert(financial.realized_outcomes[0].position_lifecycle === 'CLOSED', 'portfolio aggregation must preserve Financial Truth lifecycle');
  assert(financial.realized_outcomes[0].roi === 0.1, 'portfolio aggregation must not reinterpret realized ROI');

  const unavailableFinancial = aggregatePortfolioReal(baseInput({
    positions: [],
    realized_outcomes: [],
    financial_health: 'UNKNOWN',
    financial_data_state: 'UNKNOWN',
  }));

  assert(unavailableFinancial.positions.length === 0, 'unknown financial source must not create synthetic positions');
  assert(unavailableFinancial.quality.health === 'UNKNOWN', 'unknown financial state must remain unknown');
  assert(unavailableFinancial.quality.data_state === 'UNKNOWN', 'unknown financial state must remain unknown');
  assert(unavailableFinancial.inventory.quantity === null, 'missing inventory must remain null');
  assert(unavailableFinancial.inventory.coverage === 'UNKNOWN', 'missing inventory coverage must remain unknown');
  assert(unavailableFinancial.inventory.source_boundary === 'NEW_SOURCE', 'inventory must remain a new-source boundary');

  const candidate = composePortfolioCandidateUniverse(candidateUniverse);
  assert(candidate === candidateUniverse, 'candidate universe must be transported without rewriting evidence');
  assert(candidate.selected_item_is_navigation_only, 'selected item remains navigation-only');

  const proposed = null as unknown as ProposedAllocationSnapshot;
  Object.defineProperty(proposed, 'accounting_scope_id', { value: 'corp:42' });

  const snapshot = composePortfolioSnapshot(financial, proposed);
  assert(snapshot.real === financial, 'final composition must preserve the real portfolio snapshot');

  let mismatchRejected = false;
  Object.defineProperty(proposed, 'accounting_scope_id', { value: 'character:10', configurable: true });
  try {
    composePortfolioSnapshot(financial, proposed);
  } catch {
    mismatchRejected = true;
  }
  assert(mismatchRejected, 'real and proposed snapshots with different accounting scopes must not compose');

  console.log('[PortfolioAggregationTest] all tests passed');
}

run();
