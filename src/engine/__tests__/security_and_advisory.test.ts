import { OrderAdvisorService } from '../../services/orderAdvisor';
import { AuthService } from '../../services/authService';
import { EveCharacterOrder, RawMarketOrder, HistoricalStats } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runSecurityAndAdvisoryTests() {
  console.log('--- RUNNING ORDER ADVISOR & AUTH TESTS ---');

  // 1. Order Advisor - Outbid Buy Order
  console.log('1. Testing Order Advisor (Buy Order Outbid)...');
  const buyOrder: EveCharacterOrder = {
    order_id: 1001,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    price: 4.0,
    volume_remain: 10000,
    volume_total: 10000,
    is_buy_order: true,
    issued: new Date().toISOString(),
    duration: 90,
  };

  const competingOrders: Record<number, RawMarketOrder[]> = {
    10000002: [
      { order_id: 2001, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 4.5, volume_remain: 5000, volume_total: 5000, is_buy_order: true, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 }
    ]
  };

  const rec1 = OrderAdvisorService.analyzeOrder(buyOrder, competingOrders, {});
  assert(rec1.action === 'lower_price', 'Outbid buy order should recommend adjusting price');
  assert(rec1.suggested_new_price === 4.51, `Expected new buy price 4.51, got ${rec1.suggested_new_price}`);

  // 2. Order Advisor - Dead Market Sell Order Cancel Recommendation
  console.log('2. Testing Order Advisor (Dead Market Sell Cancel)...');
  const deadSellOrder: EveCharacterOrder = {
    order_id: 1002,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    price: 10.0,
    volume_remain: 1000,
    volume_total: 1000,
    is_buy_order: false,
    issued: new Date().toISOString(),
    duration: 90,
  };

  const deadCompetingOrders: Record<number, RawMarketOrder[]> = {
    10000002: [
      { order_id: 2002, type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 6.0, volume_remain: 5000, volume_total: 5000, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 }
    ]
  };
  const deadHistory: Record<number, HistoricalStats> = {
    10000002: { type_id: 34, region_id: 10000002, daily_volume_7d_median: 0.1, daily_volume_30d_median: 0.1, price_7d_avg: 6.0, price_30d_avg: 6.0, price_volatility: 0.0, is_live_esi: true }
  };

  const rec2 = OrderAdvisorService.analyzeOrder(deadSellOrder, deadCompetingOrders, deadHistory);
  assert(rec2.action === 'cancel', 'Dead market sell order should recommend cancellation');
  assert(rec2.cancel_reason === 'dead_volume', 'Cancel reason should be dead_volume');

  // 3. AuthService - Token Expiry Detection
  console.log('3. Testing AuthService token expiration detection...');
  const activeSession = {
    character_id: 9999,
    character_name: 'Test Trader',
    access_token: 'fake_jwt_token',
    refresh_token: 'fake_refresh_token',
    expires_at: Date.now() + 15 * 60 * 1000, // 15 mins left
    portrait_url: '',
    last_sync: new Date().toISOString(),
    is_active: true,
  };
  assert(!AuthService.isTokenExpiredOrExpiringSoon(activeSession), 'Token with 15m remaining should not be expired');

  const expiringSession = {
    ...activeSession,
    expires_at: Date.now() + 60 * 1000, // 1 min left (< 2 min threshold)
  };
  assert(AuthService.isTokenExpiredOrExpiringSoon(expiringSession), 'Token with 1m remaining should be marked expiring soon');

  console.log('✅ All Security & Advisory tests passed successfully!');
}

runSecurityAndAdvisoryTests();
