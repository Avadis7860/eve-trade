import { GlobalMarketSyncService } from '../globalMarketSync';
import { setBackendApiFetchForTesting } from '../backendApiClient';
import type { FinancialConfig, MarketHub, EveTypeDetail } from '../../types';

const testConfig: FinancialConfig = {
  available_capital: 500_000_000,
  enable_transport_costs: false,
  broker_fee: 0.015,
  sales_tax: 0.036,
  transport_cost_per_m3: 0,
  transport_cost_per_jump: 0,
  max_cargo_m3: 50_000,
  min_roi: 0.02,
  min_net_profit: 10_000,
  max_days_to_sell: 7,
  max_capital_per_trade: 200_000_000,
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.50,
};

const testHub: MarketHub = {
  id: 'p0-error-hub',
  name: 'P0 Error Hub',
  region: 'The Forge',
  region_id: 10000002,
  solar_system: 'Jita',
  system_id: 30000142,
  station: 'Jita IV - Moon 4 - Assembly Plant',
  station_id: 60003760,
  security_status: 0.9,
  priority: 1,
  active: true,
  hub_type: 'npc_major',
};

const testItem: EveTypeDetail = {
  type_id: 999991,
  name: 'P0 Error Fixture',
  volume: 1,
  group_id: 999991,
  category_id: 4,
};

async function run(): Promise<void> {
  setBackendApiFetchForTesting(async (input) => {
    const url = String(input);
    if (url.includes('/api/markets/10000002/orders')) {
      return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected backend request: ' + url);
  });

  try {
    await GlobalMarketSyncService.startGlobalSync(
      [testHub],
      testConfig,
      'immediate',
      {
        category_id_filter: 4,
        item_limit: 1,
        fetch_history: false,
        concurrency: 1,
      },
      [testItem],
    );

    const progress = GlobalMarketSyncService.getProgress();
    if (progress.completed_items !== 1) throw new Error('Failed sync item must still complete its processing slot');
    if (progress.successful_items !== 0) throw new Error('HTTP 503 must not be counted as a successful item');
    if (progress.failed_items !== 1) throw new Error('HTTP 503 must increment failed_items');
    if (progress.error_count !== 1) throw new Error('HTTP 503 must increment error_count exactly once');

    console.log('✅ Global market sync failure visibility passed.');
  } finally {
    setBackendApiFetchForTesting(null);
    GlobalMarketSyncService.stop();
  }
}

run().catch((err) => {
  console.error('❌ Global market sync failure visibility test failed:', err);
  process.exit(1);
});
