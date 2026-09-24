import {
  FinancialConfig,
  InterRegionalOpportunity,
  MarketHub,
  GlobalSyncProgress,
  EveCharacterOrder,
} from '../../types';
import {
  aggregatePortfolioOrderExposure,
  buildCandidateUniverseSnapshot,
  buildProposedAllocationSnapshot,
  buildRealPortfolioSnapshot,
  resolvePortfolioTreasury,
  scopePortfolioOrders,
  resolveAllocationUniverse,
} from '../portfolioAggregation';
import { PortfolioOptimizer } from '../portfolio';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('[UX-03] ' + message);
}

const hub = (id: string, name = id): MarketHub => ({
  id,
  name,
  region_id: Number(id.replace(/\D/g, '')) || 1,
  station_id: Number(id.replace(/\D/g, '')) || 1,
  active: true,
} as any);

function config(overrides: Partial<FinancialConfig> = {}): FinancialConfig {
  return {
    available_capital: 100_000_000,
    broker_fee: 0.015,
    sales_tax: 0.036,
    enable_transport_costs: false,
    transport_cost_per_m3: 0,
    transport_cost_per_jump: 0,
    max_cargo_m3: 60_000,
    min_roi: 0.02,
    min_net_profit: 100_000,
    max_days_to_sell: 7,
    max_capital_per_trade: 100_000_000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
    avoid_chokepoints: false,
    ...overrides,
  };
}

function opportunity(
  id: string,
  typeId: number,
  groupId: number,
  score: number,
  capturableProfit: number,
  capitalLocked = 35_000_000,
  prediction?: NonNullable<InterRegionalOpportunity['prediction']>,
  health: 'LIVE' | 'CACHE' | 'STALE' | 'PARTIAL' | 'UNKNOWN' | 'ERROR' = 'LIVE',
): InterRegionalOpportunity {
  const buy = hub(`b${typeId}`, `Buy ${typeId}`);
  const sell = hub(`s${typeId}`, `Sell ${typeId}`);

  return {
    id,
    type_id: typeId,
    type_name: `Type ${typeId}`,
    group_id: groupId,
    group_name: `Group ${groupId}`,
    category_id: typeId,
    category_name: `Category ${typeId}`,
    unit_volume: 1,
    buy_hub: buy,
    sell_hub: sell,
    strategy: 'immediate',
    route: {
      jumps: 3,
      is_highsec_only: true,
    } as any,
    best_buy_order_price: 100,
    best_sell_order_price: 120,
    top_of_book_buy_price: 100,
    top_of_book_sell_price: 120,
    effective_buy_price: 100,
    effective_sell_price: 120,
    spread_pct: 0.2,
    quantity_tradable: capitalLocked / 100,
    bottleneck: 'capital',
    total_cargo_volume: capitalLocked / 100,
    costs: {
      purchase_cost: capitalLocked,
      buy_broker_fee: 0,
      transport_cost: 0,
      total_acquisition_cost: capitalLocked,
      gross_revenue: capitalLocked + 5_000_000,
      sales_tax: 0,
      sell_broker_fee: 0,
      total_exit_fees: 0,
      net_revenue: capitalLocked + 5_000_000,
      net_profit: 5_000_000,
      profit_per_unit: 5,
      roi: 0.05,
      margin: 0.05,
      capital_locked: capitalLocked,
    },
    capturable_profit: capturableProfit,
    profit_per_day: capturableProfit / 2,
    expected_days_to_sell: 2,
    liquidity: {
      buy_hub_depth_volume: 100_000,
      sell_hub_depth_volume: 100_000,
      daily_volume_source: 50_000,
      daily_volume_dest: 50_000,
      turnover_ratio: 0.5,
      expected_days_to_sell: 2,
      volume_exhaustion_pct: 0.1,
    },
    scores: {
      profit_score: 90,
      roi_score: 80,
      liquidity_score: 70,
      volume_score: 70,
      turnover_score: 70,
      capturability_score: 80,
      competition_score: 70,
      transport_score: 80,
      stability_score: 80,
      overall_score: score,
    },
    is_anomalous: false,
    anomaly_reasons: [],
    rejection_reasons: [],
    is_viable: true,
    data_quality: {
      overall_confidence: 90,
      overall_freshness: health === 'LIVE' ? 'fresh' : health.toLowerCase(),
      overall_completeness: 'complete',
      is_verified_esi: true,
      confidence_score: 90,
      buy_hub_quality: {
        source: 'esi',
        freshness: health === 'LIVE' ? 'fresh' : health.toLowerCase(),
        completeness: 'complete',
        validation_status: 'valid',
        data_state: health === 'LIVE' ? 'LIVE' : health,
        health_status: health,
        fetched_at: new Date().toISOString(),
        age_seconds: 5,
        pages_fetched: 1,
        expected_pages: 1,
        orders_fetched: 100,
        orders_valid: 100,
        duplicate_orders_removed: 0,
        rejected_orders_count: 0,
        error_count: health === 'ERROR' ? 1 : 0,
        confidence: 0.9,
        sync_duration_ms: 10,
      },
      sell_hub_quality: {
        source: 'esi',
        freshness: health === 'LIVE' ? 'fresh' : health.toLowerCase(),
        completeness: 'complete',
        validation_status: 'valid',
        data_state: health === 'LIVE' ? 'LIVE' : health,
        health_status: health,
        fetched_at: new Date().toISOString(),
        age_seconds: 5,
        pages_fetched: 1,
        expected_pages: 1,
        orders_fetched: 100,
        orders_valid: 100,
        duplicate_orders_removed: 0,
        rejected_orders_count: 0,
        error_count: health === 'ERROR' ? 1 : 0,
        confidence: 0.9,
        sync_duration_ms: 10,
      },
    },
    prediction,
    detected_at: new Date().toISOString(),
  } as any;
}

function progress(overrides: Partial<GlobalSyncProgress> = {}): GlobalSyncProgress {
  return {
    is_running: false,
    is_paused: false,
    total_items: 100,
    completed_items: 100,
    successful_items: 100,
    failed_items: 0,
    total_orders_fetched: 1000,
    total_opportunities_found: 3,
    percent: 100,
    elapsed_seconds: 1,
    estimated_remaining_seconds: 0,
    error_count: 0,
    last_updated: new Date().toISOString(),
    ...overrides,
  };
}

function order(overrides: Partial<EveCharacterOrder> = {}): EveCharacterOrder {
  return {
    order_id: 'order-test',
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    price: 1_000_000,
    volume_remain: 20,
    volume_total: 40,
    is_buy_order: true,
    issued: new Date().toISOString(),
    duration: 30,
    escrow: 20_000_000,
    ownership: {
      principal_character_id: 1001,
      observed_by_character_ids: [1001],
      owner_type: 'character',
      owner_id: 1001,
      owner_name: 'Pilot',
    },
    ...overrides,
  } as EveCharacterOrder;
}

async function run(): Promise<void> {
  let passed = 0;

  const tests: Array<[string, () => void]> = [
    ['A diversification across independent opportunities', () => {
      const simulation = PortfolioOptimizer.optimize(
        [
          opportunity('a', 1, 10, 100, 12_000_000),
          opportunity('b', 2, 10, 99, 11_000_000),
          opportunity('c', 3, 10, 98, 10_000_000),
        ],
        config(),
      );
      const types = new Set(simulation.positions.map((position) => position.opportunity.type_id));
      assert(types.size >= 2, 'allocator must span multiple types when feasible');
    }],
    ['B selected item is navigation-only for allocation universe', () => {
      const universe = [
        opportunity('a', 1, 10, 100, 12_000_000),
        opportunity('b', 2, 11, 99, 11_000_000),
      ] as any;
      const first = resolveAllocationUniverse(universe, 1);
      const second = resolveAllocationUniverse(universe, 999999);
      assert(
        first.opportunities.map((entry) => entry.id).join(',') === second.opportunities.map((entry) => entry.id).join(','),
        'selected catalog context must not filter the allocation universe',
      );
      assert(first.source === 'GLOBAL_UNIVERSE', 'allocation source must be the global universe');
    }],
    ['C reserve leaves only 90M deployable', () => {
      const treasury = resolvePortfolioTreasury(
        config({ available_capital: 100_000_000, policy_reserve: 10_000_000, treasury_source_mode: 'manual_budget' }),
        [],
        null,
      );
      const simulation = PortfolioOptimizer.optimize(
        [opportunity('a', 1, 10, 100, 30_000_000, 35_000_000)],
        config({ available_capital: 100_000_000, policy_reserve: 10_000_000 }),
        { allocation_budget: treasury.allocation_budget, policy_reserve: treasury.policy_reserve },
      );
      const proposed = buildProposedAllocationSnapshot(
        treasury,
        buildCandidateUniverseSnapshot([opportunity('a', 1, 10, 100, 30_000_000, 35_000_000)] as any, progress()),
        simulation,
      );
      assert(treasury.allocation_budget === 90_000_000, 'reserve must reduce allocation budget');
      assert(simulation.total_capital_invested <= 90_000_000, 'deployment must respect reserved capital');
      assert(proposed.reserve_locked === 10_000_000, 'reserve must remain explicit');
    }],
    ['D escrow is displayed separately and never double-subtracted', () => {
      const treasury = resolvePortfolioTreasury(
        config({ available_capital: 100_000_000, treasury_source_mode: 'active_character' }),
        [{ character_id: 1001, character_name: 'Pilot', wallet_balance: 100_000_000, is_active: true } as any],
        1001,
      );
      const exposure = aggregatePortfolioOrderExposure([order()]);
      assert(treasury.treasury_cash === 100_000_000, 'wallet cash must stay factual');
      assert(exposure.buy_escrow === 20_000_000, 'escrow must be a separate bucket');
      assert(treasury.allocation_budget === 100_000_000, 'escrow must not be subtracted again');
    }],
    ['E uncovered buy obligation stays distinct from escrow', () => {
      const exposure = aggregatePortfolioOrderExposure([
        order({ volume_remain: 30, escrow: 20_000_000, price: 1_000_000 }),
      ]);
      assert(exposure.buy_obligation === 30_000_000, 'buy obligation must be price times remaining quantity');
      assert(exposure.uncovered_buy_obligation === 10_000_000, 'uncovered obligation must remain a diagnostic bucket');
    }],
    ['F stale candidate blocks fresh proposal while preserving prior simulation', () => {
      const stale = opportunity('stale', 1, 10, 100, 10_000_000, 20_000_000, undefined, 'STALE');
      const candidate = buildCandidateUniverseSnapshot([stale as any], progress());
      const prior = PortfolioOptimizer.optimize([opportunity('fresh', 2, 11, 99, 10_000_000)] as any, config());
      const treasury = resolvePortfolioTreasury(config(), [], null);
      const proposed = buildProposedAllocationSnapshot(treasury, candidate, prior);
      assert(proposed.proposal_blocked === true, 'STALE data must block a fresh proposal');
      assert(proposed.freshness === 'STALE', 'stale state must remain visible');
      assert(proposed.simulation.positions.length === 1, 'previous trustworthy snapshot must not be erased');
    }],
    ['G market ERROR is visible and candidate is not allocated', () => {
      const broken = opportunity('error', 1, 10, 100, 10_000_000, 20_000_000, undefined, 'ERROR');
      const simulation = PortfolioOptimizer.optimize([broken as any], config());
      const candidate = buildCandidateUniverseSnapshot([broken as any], progress());
      assert(simulation.positions.length === 0, 'ERROR candidate must not be allocated');
      assert(candidate.data_health === 'ERROR', 'ERROR health must remain visible');
      assert(broken.costs.net_profit === 5_000_000, 'business data must not be rewritten to a fabricated zero');
    }],
    ['H missing Assets remain UNKNOWN, never zero', () => {
      const treasury = resolvePortfolioTreasury(config({ treasury_source_mode: 'manual_budget' }), [], null);
      const real = buildRealPortfolioSnapshot(treasury, []);
      assert(real.inventory.coverage === 'UNKNOWN', 'missing Assets source must be explicit');
      assert(real.inventory.quantity === null, 'missing inventory quantity must stay unknown');
      assert(real.inventory.market_value === null, 'missing inventory valuation must stay unknown');
      assert(real.is_authoritative_net_worth === false, 'net worth must not be claimed authoritative');
    }],
    ['Scope keeps economic owner, corporation division and observing principal distinct', () => {
      const treasury = resolvePortfolioTreasury(
        config({
          treasury_source_mode: 'corporation',
          corporation_id: 77,
          corporation_wallet_division: 3,
          corporation_wallet_balance: 500_000_000,
          corporation_wallet_source: 'esi',
          corporation_divisions: [{ division: 3, name: 'Trade', balance: 500_000_000 }],
        }),
        [{ character_id: 1001, character_name: 'Observer', wallet_balance: 10_000_000, is_active: true } as any],
        1001,
      );

      const scoped = scopePortfolioOrders(
        [
          order({
            order_id: 'corp-3',
            ownership: {
              principal_character_id: 1001,
              observed_by_character_ids: [1001],
              owner_type: 'corporation',
              owner_id: 77,
              owner_name: 'Corp',
              wallet_division: 3,
            },
          }) as any,
          order({
            order_id: 'corp-2',
            ownership: {
              principal_character_id: 1001,
              observed_by_character_ids: [1001],
              owner_type: 'corporation',
              owner_id: 77,
              owner_name: 'Corp',
              wallet_division: 2,
            },
          }) as any,
        ],
        treasury,
        config({
          treasury_source_mode: 'corporation',
          corporation_id: 77,
          corporation_wallet_division: 3,
          corporation_wallet_balance: 500_000_000,
          corporation_wallet_source: 'esi',
          corporation_divisions: [{ division: 3, name: 'Trade', balance: 500_000_000 }],
        }),
        [{ character_id: 1001, character_name: 'Observer', wallet_balance: 10_000_000, is_active: true } as any],
      );

      assert(scoped.length === 1 && scoped[0].order_id === 'corp-3', 'corporation scope must filter by economic owner and wallet division');
      assert(treasury.principal_scope === 'corp:77', 'observer scope must remain separate from economic owner');
    }],
    ['I manual budget is explicit simulation', () => {
      const treasury = resolvePortfolioTreasury(
        config({ treasury_source_mode: 'manual_budget', available_capital: 25_000_000 }),
        [],
        null,
      );
      assert(treasury.source_kind === 'MANUAL', 'manual treasury must be marked MANUAL');
      assert(treasury.is_simulation === true, 'manual budget must be marked simulation');
    }],
    ['J group concentration cap leaves explainable idle capital', () => {
      const simulation = PortfolioOptimizer.optimize(
        [
          opportunity('a', 1, 99, 100, 40_000_000, 60_000_000),
          opportunity('b', 2, 99, 99, 35_000_000, 60_000_000),
        ],
        config({ max_portfolio_concentration_type: 1, max_portfolio_concentration_group: 0.5 }),
      );
      const groupCapital = simulation.diversification.by_group['Group 99'] ?? 0;
      assert(groupCapital <= 50_000_000 + 1e-6, 'group cap must be enforced');
      assert(
        (simulation.unallocated_reasons ?? []).some((reason) => reason.code === 'CONCENTRATION_LIMIT'),
        'idle capital must be explained by concentration pressure',
      );
    }],
    ['K prediction, prediction confidence and data confidence remain distinct', () => {
      const predicted = opportunity(
        'pred',
        1,
        10,
        50,
        8_000_000,
        20_000_000,
        {
          survival_probability: 80,
          profit_realization_probability: 75,
          expected_realized_profit: 6_000_000,
          prediction_confidence: 70,
          risk_level: 'moderate',
          estimated_turnover_hours: 48,
          key_drivers: ['volume'],
          limiting_factors: ['competition'],
        },
      );
      const simulation = PortfolioOptimizer.optimize([predicted as any], config({ max_portfolio_concentration_type: 1, max_portfolio_concentration_group: 1 }));
      const position = simulation.positions[0];
      assert(position.expected_realized_profit === predicted.prediction?.expected_realized_profit, 'expected realized profit must stay explicit');
      assert(position.prediction_confidence === 70, 'prediction confidence must stay separate');
      assert(position.data_confidence === 90, 'data confidence must stay separate');
      assert(position.rationale?.expected_profit_basis === 'EXPECTED_REALIZED_PROFIT', 'rationale must reveal the objective basis');
    }],
    ['L partial universe cannot claim exhaustive allocation', () => {
      const universe = [opportunity('partial', 1, 10, 100, 10_000_000)] as any;
      const candidate = buildCandidateUniverseSnapshot(
        universe,
        progress({ completed_items: 80, failed_items: 20 }),
      );
      assert(candidate.coverage === 'PARTIAL', 'partial acquisition must expose partial coverage');
      assert(candidate.state === 'PARTIAL', 'partial state must remain explicit');
      const treasury = resolvePortfolioTreasury(config(), [], null);
      const simulation = PortfolioOptimizer.optimize(universe, config());
      const proposed = buildProposedAllocationSnapshot(treasury, candidate, simulation);
      assert(proposed.proposal_blocked === true, 'partial universe must block fresh proposal');
    }],
    ['Capital and quantity invariants hold for every selected position', () => {
      const simulation = PortfolioOptimizer.optimize(
        [
          opportunity('a', 1, 1, 80, 10_000_000, 10_000_003),
          opportunity('b', 2, 1, 79, 9_000_000, 10_000_000),
          opportunity('c', 3, 2, 78, 8_000_000, 20_000_000),
        ] as any,
        config({ max_capital_per_trade: 25_000_000 }),
      );
      for (const position of simulation.positions) {
        const opp = position.opportunity;
        assert(position.allocated_capital <= 100_000_000 + 1e-6, 'position capital must fit allocation budget');
        assert(position.allocated_capital <= 25_000_000 + 1e-6, 'position capital must fit per-trade cap');
        assert(position.allocated_quantity <= opp.quantity_tradable, 'quantity must not exceed tradable quantity');
        assert(position.allocated_quantity * (opp.costs.capital_locked / opp.quantity_tradable) <= position.allocated_capital + 1e-6, 'quantity cost must fit allocated capital');
        assert(position.allocated_capital > 0, 'selected position capital must be positive');
      }
    }],
  ];

  for (const [name, test] of tests) {
    try {
      test();
      console.log('[PASS] ' + name);
      passed++;
    } catch (error) {
      console.error('[FAIL] ' + name + ': ' + String(error));
      throw error;
    }
  }

  console.log(`UX-03 portfolio tests: ${passed} passed.`);
}

run().catch(() => process.exit(1));
