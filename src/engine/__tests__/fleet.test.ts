import { TradingFleetEngine } from '../fleet';
import { EveCharacterSession, MarketHub, FinancialConfig, InterRegionalOpportunity } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runFleetTests() {
  console.log('--- RUNNING TRADING FLEET ENGINE TESTS ---');

  const mockHubs: MarketHub[] = [
    {
      id: 'jita',
      name: 'Jita IV-4',
      region_id: 10000002,
      region: 'The Forge',
      solar_system: 'Jita',
      system_id: 30000142,
      station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      station_id: 60003760,
      security_status: 0.95,
      priority: 1,
      active: true,
      hub_type: 'npc_major',
    },
    {
      id: 'amarr',
      name: 'Amarr VIII',
      region_id: 10000043,
      region: 'Domain',
      solar_system: 'Amarr',
      system_id: 30002187,
      station: 'Amarr VIII (Oris) - Emperor Family Academy',
      station_id: 60008494,
      security_status: 1.0,
      priority: 2,
      active: true,
      hub_type: 'npc_major',
    },
  ];

  const mockConfig: FinancialConfig = {
    available_capital: 1_000_000_000,
    sales_tax: 0.08,
    broker_fee: 0.03,
    transport_cost_per_m3: 50,
    transport_cost_per_jump: 20000,
    max_cargo_m3: 60000,
    enable_transport_costs: true,
    min_roi: 0.03,
    min_net_profit: 500000,
    max_days_to_sell: 7,
    max_capital_per_trade: 500_000_000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
    accounting_level: 5,
    broker_relations_level: 5,
    advanced_broker_relations_level: 5,
    faction_standing: 0,
    corp_standing: 0,
  };

  const charBuyer: EveCharacterSession = {
    character_id: 101,
    character_name: 'Buyer Alt Jita',
    portrait_url: 'https://images.evetech.net/characters/101/portrait?size=128',
    access_token: 'tok_1',
    refresh_token: 'ref_1',
    expires_at: Date.now() + 100000,
    wallet_balance: 500_000_000,
    accounting_skill: 5,
    broker_relations_skill: 5,
    fleet_role: 'buyer',
    assigned_hub_id: 'jita',
    ship_cargo_capacity_m3: 5000,
  };

  const charHauler: EveCharacterSession = {
    character_id: 102,
    character_name: 'Hauler Alt DST',
    portrait_url: 'https://images.evetech.net/characters/102/portrait?size=128',
    access_token: 'tok_2',
    refresh_token: 'ref_2',
    expires_at: Date.now() + 100000,
    wallet_balance: 10_000_000,
    accounting_skill: 3,
    broker_relations_skill: 3,
    fleet_role: 'hauler',
    assigned_hub_id: 'jita',
    ship_cargo_capacity_m3: 60000,
  };

  const charSeller: EveCharacterSession = {
    character_id: 103,
    character_name: 'Seller Alt Amarr',
    portrait_url: 'https://images.evetech.net/characters/103/portrait?size=128',
    access_token: 'tok_3',
    refresh_token: 'ref_3',
    expires_at: Date.now() + 100000,
    wallet_balance: 200_000_000,
    accounting_skill: 5,
    broker_relations_skill: 5,
    fleet_role: 'seller',
    assigned_hub_id: 'amarr',
    ship_cargo_capacity_m3: 5000,
  };

  const partialOpp: Partial<InterRegionalOpportunity> = {
    buy_hub: mockHubs[0],
    sell_hub: mockHubs[1],
    strategy: 'relist',
    quantity_tradable: 100,
    total_cargo_volume: 12000,
    route: {
      from_system_id: mockHubs[0].system_id,
      to_system_id: mockHubs[1].system_id,
      jumps: 9,
      min_security: 0.95,
      is_highsec_only: true,
    },
    costs: {
      purchase_cost: 100_000_000,
      buy_broker_fee: 0,
      transport_cost: 2_000_000,
      total_acquisition_cost: 100_000_000,
      gross_revenue: 140_000_000,
      sales_tax: 5_040_000,
      sell_broker_fee: 3_000_000,
      total_exit_fees: 8_040_000,
      net_revenue: 131_960_000,
      net_profit: 29_960_000,
      profit_per_unit: 299_600,
      roi: 0.2996,
      margin: 0.214,
      capital_locked: 100_000_000,
    },
  };

  console.log('1. Testing multi-character fleet assignment via resolveFleetPlan...');
  const plan = TradingFleetEngine.resolveFleetPlan(
    partialOpp,
    [charBuyer, charHauler, charSeller],
    mockConfig
  );

  assert(plan.is_fleet_enabled === true, 'Fleet should be enabled');
  assert(plan.fleet_size === 3, 'Fleet size should be 3');
  assert(plan.is_cross_character === true, 'Cross character should be true');
  assert(plan.buyer_character?.character_id === 101, 'Buyer should be Alt 101');
  assert(plan.hauler_character?.character_id === 102, 'Hauler should be Alt 102');
  assert(plan.seller_character?.character_id === 103, 'Seller should be Alt 103');
  assert(plan.steps.length === 3, 'There should be 3 execution steps');
  assert(plan.steps[0].phase === 'BUY', 'Step 1 should be BUY');
  assert(plan.steps[1].phase === 'HAUL', 'Step 2 should be HAUL');
  assert(plan.steps[2].phase === 'SELL', 'Step 3 should be SELL');
  assert(plan.hauler_cargo_sufficient === true, 'Hauler cargo should be sufficient');
  assert(plan.buyer_has_sufficient_capital === true, 'Buyer capital should be sufficient');

  console.log('2. Testing buyer wallet deficit detection...');
  const brokeBuyer: EveCharacterSession = {
    ...charBuyer,
    wallet_balance: 5_000_000,
  };

  const planDeficit = TradingFleetEngine.resolveFleetPlan(
    partialOpp,
    [brokeBuyer, charHauler, charSeller],
    mockConfig
  );

  assert(planDeficit.buyer_has_sufficient_capital === false, 'Buyer should be flagged with insufficient capital');
  assert(planDeficit.buyer_capital_deficit === 95_000_000, 'Deficit should be 95M ISK');

  console.log('3. Testing cargo capacity overflow detection...');
  const planCargoOverflow = TradingFleetEngine.resolveFleetPlan(
    {
      ...partialOpp,
      total_cargo_volume: 100_000, // 100k m3 > 60k m3
    },
    [charBuyer, charHauler, charSeller],
    mockConfig
  );

  assert(planCargoOverflow.hauler_cargo_sufficient === false, 'Cargo should be flagged as insufficient');

  console.log('4. Testing consolidated fleet overview...');
  const overview = TradingFleetEngine.computeFleetOverview([charBuyer, charHauler, charSeller]);
  assert(overview.total_characters === 3, 'Overview total characters should be 3');
  assert(overview.consolidated_wallet_balance === 710_000_000, 'Consolidated wallet balance should be 710M ISK');
  assert(overview.hub_coverage['jita']?.length === 2, 'Jita should have 2 stationed characters');
  assert(overview.hub_coverage['amarr']?.length === 1, 'Amarr should have 1 stationed character');

  console.log('✅ ALL TRADING FLEET TESTS PASSED!');
}

runFleetTests();
