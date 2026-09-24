import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FleetFinancialEngine } from '../fleetFinancial';
import { RealizedFinancialOutcomeEngine, CrossCharacterFinancialMappingViolationError } from '../realizedFinancialOutcome';
import {
  CharacterFinancialResult,
  TraderPerformanceMetrics,
  TradeCycleRecord,
  PerformanceScope,
  PersistedCharacterTransaction,
} from '../../types';

function createMockTradeCycle(overrides: Partial<TradeCycleRecord>): TradeCycleRecord {
  return {
    cycle_id: overrides.cycle_id || `cycle_${Math.random()}`,
    type_id: overrides.type_id || 34,
    type_name: overrides.type_name || 'Tritanium',
    category_name: overrides.category_name || 'Mineral',
    buy_date: overrides.buy_date || '2026-03-01T10:00:00Z',
    sell_date: overrides.sell_date || '2026-03-02T10:00:00Z',
    quantity: overrides.quantity ?? 100,
    avg_buy_price: overrides.avg_buy_price ?? 5.0,
    avg_sell_price: overrides.avg_sell_price ?? 7.0,
    total_buy_cost: overrides.total_buy_cost ?? 500.0,
    total_sell_revenue: overrides.total_sell_revenue ?? 700.0,
    gross_profit: overrides.gross_profit ?? 200.0,
    estimated_fees_paid: overrides.estimated_fees_paid ?? 20.0,
    net_profit: overrides.net_profit ?? 180.0,
    roi: overrides.roi ?? 0.36,
    hold_days: overrides.hold_days ?? 1.0,
    is_profitable: overrides.is_profitable ?? true,
    buy_location: overrides.buy_location || 'Jita IV-4',
    sell_location: overrides.sell_location || 'Amarr VIII',
    financial_completeness: overrides.financial_completeness || 'OBSERVED',
    is_net_estimated: overrides.is_net_estimated ?? false,
    realized_profit_label: overrides.realized_profit_label || 'Bénéfice Net Réalisé (Certifié)',
    fees_breakdown: overrides.fees_breakdown || {
      fee_mode: 'OBSERVED',
      fee_source: 'CONFIG_ESTIMATE',
      execution_fee_mode: 'MAKER_MAKER',
      estimated_buy_broker_fee: 10,
      estimated_sell_broker_fee: 10,
      estimated_sales_tax: 0,
      estimated_total_fees: 20,
      is_role_assumed: false,
      notes: [],
    },
    unmatched_sell_quantity: overrides.unmatched_sell_quantity ?? 0,
    position_lifecycle: overrides.position_lifecycle ?? 'CLOSED',
    position_remaining_quantity: overrides.position_remaining_quantity ?? 0,
    is_position_closed: overrides.is_position_closed ?? true,
    character_id: overrides.character_id ?? 1001,
    character_name: overrides.character_name ?? 'Pilot A',
  };
}

function createMockCharacterMetrics(overrides: Partial<TraderPerformanceMetrics>): TraderPerformanceMetrics {
  return {
    character_id: overrides.character_id ?? 1001,
    character_name: overrides.character_name ?? 'Pilot A',
    last_calculated: overrides.last_calculated || new Date().toISOString(),
    total_realized_profit: overrides.total_realized_profit ?? 100_000_000,
    total_buy_volume: overrides.total_buy_volume ?? 500_000_000,
    total_sell_volume: overrides.total_sell_volume ?? 600_000_000,
    total_turnover: overrides.total_turnover ?? 1_100_000_000,
    total_closed_trades: overrides.total_closed_trades ?? 10,
    profitable_trades: overrides.profitable_trades ?? 8,
    unprofitable_trades: overrides.unprofitable_trades ?? 2,
    win_rate_pct: overrides.win_rate_pct ?? 80.0,
    average_realized_roi: overrides.average_realized_roi ?? 0.20,
    average_realized_roi_scope: 'CLOSING_DISPOSAL_ALLOCATIONS',
    average_hold_days: overrides.average_hold_days ?? 2.5,
    total_broker_fees_paid: overrides.total_broker_fees_paid ?? 10_000_000,
    total_sales_tax_paid: overrides.total_sales_tax_paid ?? 15_000_000,
    top_profitable_items: overrides.top_profitable_items || [],
    recent_trade_cycles: overrides.recent_trade_cycles || [],
    activity_by_location: overrides.activity_by_location || [],
    category_success_rate: overrides.category_success_rate || {},
    trader_title: overrides.trader_title || 'Négociant Émérite',
    trader_badge_color: overrides.trader_badge_color || 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    calibration_weight: overrides.calibration_weight ?? 1.0,
    financial_completeness: overrides.financial_completeness || 'OBSERVED',
    is_net_estimated: overrides.is_net_estimated ?? false,
    realized_profit_label: overrides.realized_profit_label || 'Bénéfice Net Réalisé (Certifié)',
    total_realized_gross: overrides.total_realized_gross ?? 125_000_000,
    total_estimated_fees: overrides.total_estimated_fees ?? 25_000_000,
    has_unmatched_trades: overrides.has_unmatched_trades ?? false,
    unmatched_trades_count: overrides.unmatched_trades_count ?? 0,
  };
}

describe('Phase 5: Fleet Financial Contract Hardening & Non-Additive Verification', () => {
  const fleetScope: PerformanceScope = { type: 'fleet' };

  it('Test A — Fleet Complète: All characters available produces complete status and observed completeness', () => {
    const charA: CharacterFinancialResult = {
      characterId: '1001',
      characterName: 'Pilot A',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1001,
        character_name: 'Pilot A',
        total_realized_profit: 100_000_000,
        financial_completeness: 'OBSERVED',
      }),
    };

    const charB: CharacterFinancialResult = {
      characterId: '1002',
      characterName: 'Pilot B',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1002,
        character_name: 'Pilot B',
        total_realized_profit: 50_000_000,
        financial_completeness: 'OBSERVED',
      }),
    };

    const result = FleetFinancialEngine.aggregateFleetPerformance([charA, charB], fleetScope);

    assert.equal(result.status, 'complete', 'Fleet status must be complete when all characters are available');
    assert.equal(result.hasUnavailableCharacters, false, 'hasUnavailableCharacters must be false');
    assert.deepEqual(result.unavailableCharacterNames, [], 'unavailableCharacterNames must be empty');
    assert.equal(result.participatingCharacterCount, 2, 'Should have 2 participating characters');
    assert.equal(result.totalCharacterCount, 2, 'Should have 2 total characters');
    assert.equal(result.fleetMetrics.total_realized_profit, 150_000_000, 'Additive profit must equal 150M');
    assert.equal(result.fleetMetrics.financial_completeness, 'OBSERVED');
    assert.equal(result.fleetMetrics.realized_profit_label, 'Bénéfice Net Flotte (Certifié)');
  });

  it('Test B — Fleet Partielle: Unavailable character flags partial status and propagates partial completeness', () => {
    const charA: CharacterFinancialResult = {
      characterId: '1001',
      characterName: 'Pilot A',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1001,
        character_name: 'Pilot A',
        total_realized_profit: 100_000_000,
        financial_completeness: 'OBSERVED',
      }),
    };

    const charBUnavailable: CharacterFinancialResult = {
      characterId: '1002',
      characterName: 'Pilot B (Missing ESI)',
      dataHealth: 'unavailable',
      errorMessage: 'Token expired or network unreachable',
    };

    const result = FleetFinancialEngine.aggregateFleetPerformance([charA, charBUnavailable], fleetScope);

    assert.equal(result.status, 'partial', 'Fleet status must be explicitly partial');
    assert.equal(result.hasUnavailableCharacters, true, 'hasUnavailableCharacters must be true');
    assert.deepEqual(result.unavailableCharacterNames, ['Pilot B (Missing ESI)'], 'Must identify unavailable pilot');
    assert.equal(result.participatingCharacterCount, 1, 'Only Pilot A is aggregated');
    assert.equal(result.totalCharacterCount, 2, 'Total characters expected is 2');
    assert.equal(result.fleetMetrics.total_realized_profit, 100_000_000, 'Must aggregate only available pilot');
    assert.equal(result.fleetMetrics.financial_completeness, 'PARTIAL', 'Fleet completeness must be PARTIAL');
    assert.equal(
      result.fleetMetrics.realized_profit_label,
      'Bénéfice Flotte Réalisé (Partiel - Pilotes Indisponibles)',
      'Label must clarify partial consolidation'
    );
    assert.ok(
      result.fleetMetrics.character_name.includes('Flotte Partielle (1/2 pilotes)'),
      'Fleet name must indicate partial pilot ratio'
    );
  });

  it('Test B2 — Optional financial fields remain unavailable when a character metric omits them', () => {
    const incomplete = createMockCharacterMetrics({
      character_id: 1003,
      character_name: 'Pilot Missing Optional Financials',
    });
    delete incomplete.total_realized_gross;
    delete incomplete.total_estimated_fees;
    delete incomplete.unmatched_trades_count;

    const result = FleetFinancialEngine.aggregateFleetPerformance(
      [{
        characterId: '1003',
        characterName: 'Pilot Missing Optional Financials',
        dataHealth: 'fresh',
        metrics: incomplete,
      }],
      fleetScope,
    );

    assert.equal(result.fleetMetrics.total_realized_gross, undefined);
    assert.equal(result.fleetMetrics.total_estimated_fees, undefined);
    assert.equal(result.fleetMetrics.unmatched_trades_count, undefined);
  });

  it('Test C — Non-Additive Metric: Win Rate is recomputed from total trades (not sum or naive mean)', () => {
    // Pilot A: 1 trade, 1 win -> 100% win rate
    const cycleA1 = createMockTradeCycle({
      cycle_id: 'c_a1',
      character_id: 1001,
      character_name: 'Pilot A',
      is_profitable: true,
      quantity: 10,
    });
    const charA: CharacterFinancialResult = {
      characterId: '1001',
      characterName: 'Pilot A',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1001,
        character_name: 'Pilot A',
        total_closed_trades: 1,
        profitable_trades: 1,
        unprofitable_trades: 0,
        win_rate_pct: 100.0,
        recent_trade_cycles: [cycleA1],
      }),
    };

    // Pilot B: 9 trades, 0 wins -> 0% win rate
    const cyclesB: TradeCycleRecord[] = [];
    for (let i = 1; i <= 9; i++) {
      cyclesB.push(
        createMockTradeCycle({
          cycle_id: `c_b${i}`,
          character_id: 1002,
          character_name: 'Pilot B',
          is_profitable: false,
          quantity: 10,
          net_profit: -50,
        })
      );
    }
    const charB: CharacterFinancialResult = {
      characterId: '1002',
      characterName: 'Pilot B',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1002,
        character_name: 'Pilot B',
        total_closed_trades: 9,
        profitable_trades: 0,
        unprofitable_trades: 9,
        win_rate_pct: 0.0,
        recent_trade_cycles: cyclesB,
      }),
    };

    const result = FleetFinancialEngine.aggregateFleetPerformance([charA, charB], fleetScope);

    // Total trades = 10, Total winning trades = 1 -> Fleet Win Rate = 10.0%
    // If it were sum: 100% + 0% = 100% (FALSE)
    // If it were naive mean: (100% + 0%) / 2 = 50% (FALSE)
    assert.equal(result.fleetMetrics.total_closed_trades, 10);
    assert.equal(result.fleetMetrics.profitable_trades, 1);
    assert.equal(result.fleetMetrics.unprofitable_trades, 9);
    assert.equal(result.fleetMetrics.win_rate_pct, 10.0, 'Fleet Win Rate must be 10.0% (1 win / 10 total trades)');
  });

  it('Test D — Non-Additive Metric: ROI is computed across trade cycles (not sum or naive mean of character ROIs)', () => {
    // Pilot A: 1 trade with ROI = +1.00 (+100%)
    const cycleA = createMockTradeCycle({
      cycle_id: 'c_a',
      character_id: 1001,
      character_name: 'Pilot A',
      roi: 1.00,
      quantity: 1,
    });
    const charA: CharacterFinancialResult = {
      characterId: '1001',
      characterName: 'Pilot A',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1001,
        character_name: 'Pilot A',
        total_closed_trades: 1,
        average_realized_roi: 1.00,
        recent_trade_cycles: [cycleA],
      }),
    };

    // Pilot B: 3 trades each with ROI = +0.10 (+10%)
    const cyclesB = [
      createMockTradeCycle({ cycle_id: 'c_b1', character_id: 1002, character_name: 'Pilot B', roi: 0.10, quantity: 1 }),
      createMockTradeCycle({ cycle_id: 'c_b2', character_id: 1002, character_name: 'Pilot B', roi: 0.10, quantity: 1 }),
      createMockTradeCycle({ cycle_id: 'c_b3', character_id: 1002, character_name: 'Pilot B', roi: 0.10, quantity: 1 }),
    ];
    const charB: CharacterFinancialResult = {
      characterId: '1002',
      characterName: 'Pilot B',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1002,
        character_name: 'Pilot B',
        total_closed_trades: 3,
        average_realized_roi: 0.10,
        recent_trade_cycles: cyclesB,
      }),
    };

    const result = FleetFinancialEngine.aggregateFleetPerformance([charA, charB], fleetScope);

    // Fleet ROI across 4 trade cycles: (1.00 + 0.10 + 0.10 + 0.10) / 4 = 0.325 (+32.5%)
    // If it were naive mean: (1.00 + 0.10) / 2 = 0.55 (+55%) (FALSE)
    // If it were sum: 1.00 + 0.10 = 1.10 (+110%) (FALSE)
    assert.equal(result.fleetMetrics.total_closed_trades, 4);
    assert.notEqual(result.fleetMetrics.average_realized_roi, null);
    assert.equal(
      Number(result.fleetMetrics.average_realized_roi!.toFixed(4)),
      0.325,
      'Fleet ROI must be 0.325 across 4 trade cycles'
    );
  });

  it('Test E — Non-Additive Metric: Hold Time is computed across trade cycles (not naive mean of character averages)', () => {
    // Pilot A: 1 trade with hold_days = 10.0 days
    const cycleA = createMockTradeCycle({
      cycle_id: 'c_a',
      character_id: 1001,
      character_name: 'Pilot A',
      hold_days: 10.0,
      quantity: 1,
    });
    const charA: CharacterFinancialResult = {
      characterId: '1001',
      characterName: 'Pilot A',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1001,
        character_name: 'Pilot A',
        total_closed_trades: 1,
        average_hold_days: 10.0,
        recent_trade_cycles: [cycleA],
      }),
    };

    // Pilot B: 9 trades each with hold_days = 1.0 day
    const cyclesB: TradeCycleRecord[] = [];
    for (let i = 1; i <= 9; i++) {
      cyclesB.push(
        createMockTradeCycle({
          cycle_id: `c_b${i}`,
          character_id: 1002,
          character_name: 'Pilot B',
          hold_days: 1.0,
          quantity: 1,
        })
      );
    }
    const charB: CharacterFinancialResult = {
      characterId: '1002',
      characterName: 'Pilot B',
      dataHealth: 'fresh',
      metrics: createMockCharacterMetrics({
        character_id: 1002,
        character_name: 'Pilot B',
        total_closed_trades: 9,
        average_hold_days: 1.0,
        recent_trade_cycles: cyclesB,
      }),
    };

    const result = FleetFinancialEngine.aggregateFleetPerformance([charA, charB], fleetScope);

    // Fleet Average Hold Time: (10.0 + 9 * 1.0) / 10 = 1.9 days
    // If it were naive mean: (10.0 + 1.0) / 2 = 5.5 days (FALSE)
    assert.equal(result.fleetMetrics.total_closed_trades, 10);
    assert.equal(result.fleetMetrics.average_hold_days, 1.9, 'Fleet Hold Days must be 1.9 days across 10 trade cycles');
  });


  it('Invariant Check — fleet Performance requires a consolidated shared-scope calculation', () => {
    const characterResults: CharacterFinancialResult[] = [
      { characterId: '1001', characterName: 'Pilot A', dataHealth: 'fresh', metrics: createMockCharacterMetrics({ character_id: 1001 }) },
      { characterId: '1002', characterName: 'Pilot B', dataHealth: 'fresh', metrics: createMockCharacterMetrics({ character_id: 1002 }) },
    ];

    const selection = FleetFinancialEngine.selectPerformanceByScope(
      characterResults,
      { type: 'fleet' },
      '1001',
    );

    assert.equal(
      selection.selectedMetrics,
      null,
      'fleet Performance must not fall back to summing character-isolated metrics',
    );
  });

  it('Invariant Check — CrossCharacterFinancialMappingViolationError prevents mixing characters in single calculation', () => {
    const mixedTxs: PersistedCharacterTransaction[] = [
      {
        transaction_id: 1,
        timestamp: '2026-03-01T10:00:00Z',
        is_buy: true,
        quantity: 100,
        unit_price: 1000,
        type_id: 34,
        location_id: 60003760,
        client_id: 999,
        is_personal: true,
        character_id: 1001,
        first_seen_at: '2026-03-01T10:00:00Z',
        last_seen_at: '2026-03-01T10:00:00Z',
        source: 'ESI',
        source_endpoint: '/characters/1001/wallet/transactions/',
        ingestion_version: '1.0.0',
        data_state: 'VALID',
      },
      {
        transaction_id: 2,
        timestamp: '2026-03-02T10:00:00Z',
        is_buy: false,
        quantity: 100,
        unit_price: 2000,
        type_id: 34,
        location_id: 60003760,
        client_id: 999,
        is_personal: true,
        character_id: 1002, // Different character!
        first_seen_at: '2026-03-02T10:00:00Z',
        last_seen_at: '2026-03-02T10:00:00Z',
        source: 'ESI',
        source_endpoint: '/characters/1002/wallet/transactions/',
        ingestion_version: '1.0.0',
        data_state: 'VALID',
      },
    ];

    assert.throws(
      () => {
        RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, mixedTxs);
      },
      CrossCharacterFinancialMappingViolationError,
      'Engine must throw CrossCharacterFinancialMappingViolationError when mixing character IDs'
    );
  });
});
