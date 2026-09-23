process.env.NODE_ENV = 'test';

import { OrderAdvisorService } from '../../services/orderAdvisor';
import { AuthService } from '../../services/authService';
import { EveCharacterOrder, RawMarketOrder, HistoricalStats, EveCharacterSession } from '../../types';
import {
  generateOAuthState,
  validateAndConsumeOAuthState,
  validateRedirectUri,
  activeOAuthStates,
  STATE_TTL_MS,
} from '../../../server';

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
    order_id: '1001',
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
      { order_id: '2001', type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 4.5, volume_remain: 5000, volume_total: 5000, is_buy_order: true, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 }
    ]
  };

  const rec1 = OrderAdvisorService.analyzeOrder(buyOrder, competingOrders, {});
  assert(rec1.action === 'lower_price', 'Outbid buy order should recommend adjusting price');
  assert(rec1.suggested_new_price === 4.51, `Expected new buy price 4.51, got ${rec1.suggested_new_price}`);

  // 2. Order Advisor - Dead Market Sell Order Cancel Recommendation
  console.log('2. Testing Order Advisor (Dead Market Sell Cancel)...');
  const deadSellOrder: EveCharacterOrder = {
    order_id: '1002',
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
      { order_id: '2002', type_id: 34, location_id: 60003760, system_id: 30000142, region_id: 10000002, price: 6.0, volume_remain: 5000, volume_total: 5000, is_buy_order: false, duration: 90, issued: new Date().toISOString(), order_range: 'region', min_volume: 1 }
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
  const activeSession: EveCharacterSession = {
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

  const expiringSession: EveCharacterSession = {
    ...activeSession,
    expires_at: Date.now() + 60 * 1000, // 1 min left (< 2 min threshold)
  };
  assert(AuthService.isTokenExpiredOrExpiringSoon(expiringSession), 'Token with 1m remaining should be marked expiring soon');

  // 4. OAuth CSRF State Security: Generation, Verification, Replay Prevention, TTL Expiry
  console.log('4. Testing OAuth CSRF State Security invariants...');
  
  // 4a. Rejection of undefined or missing state
  const missingCheck = validateAndConsumeOAuthState(undefined);
  assert(!missingCheck.isValid, 'Missing state must be rejected');
  assert(missingCheck.error === 'MISSING_STATE', 'Error code must be MISSING_STATE');

  // 4b. Rejection of forged / arbitrary state
  const forgedCheck = validateAndConsumeOAuthState('forged_unregistered_state_token');
  assert(!forgedCheck.isValid, 'Forged state must be rejected');
  assert(forgedCheck.error === 'INVALID_OR_EXPIRED_STATE', 'Error code must be INVALID_OR_EXPIRED_STATE');

  // 4c. Valid state generation and one-time consumption
  const validRedirect = 'http://localhost:3000/auth/callback';
  const generatedState = generateOAuthState(validRedirect);
  assert(typeof generatedState === 'string' && generatedState.length >= 32, 'Generated state must be secure string');
  assert(activeOAuthStates.has(generatedState), 'State must be tracked in active state store');

  // First consumption: MUST SUCCEED
  const firstConsume = validateAndConsumeOAuthState(generatedState);
  assert(firstConsume.isValid, 'First state consumption must be valid');
  assert(!activeOAuthStates.has(generatedState), 'Consumed state must be purged immediately from store');

  // Second consumption (Replay Attack): MUST BE BLOCKED
  const replayConsume = validateAndConsumeOAuthState(generatedState);
  assert(!replayConsume.isValid, 'Replayed state token must be rejected');
  assert(replayConsume.error === 'INVALID_OR_EXPIRED_STATE', 'Replayed token must be identified as invalid/expired');

  // 4d. Expired State Rejection
  const expiredState = generateOAuthState(validRedirect);
  const entry = activeOAuthStates.get(expiredState);
  if (entry) {
    // Artificial time travel: simulate state older than STATE_TTL_MS (10 min)
    entry.createdAt = Date.now() - (STATE_TTL_MS + 5000);
  }
  const expiredCheck = validateAndConsumeOAuthState(expiredState);
  assert(!expiredCheck.isValid, 'State past TTL must be rejected');
  assert(expiredCheck.error === 'EXPIRED_STATE', 'Error code must be EXPIRED_STATE');

  // 5. Strict redirect_uri Whitelist Security
  console.log('5. Testing strict redirect_uri Whitelist Security...');
  const mockReq = {
    get: (header: string) => (header.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
    protocol: 'http',
  } as any;

  // 5a. Allowed standard callbacks
  const checkDefault = validateRedirectUri(undefined, mockReq);
  assert(checkDefault.isValid, 'Undefined redirect_uri should fallback to valid default callback');
  const expectedDefault = process.env.EVE_CALLBACK_URL || 'http://localhost:3000/auth/callback';
  assert(checkDefault.uri === expectedDefault, `Default URI must match expected default (${expectedDefault})`);

  const checkLocalhost = validateRedirectUri('http://localhost:3000/auth/callback', mockReq);
  assert(checkLocalhost.isValid, 'Whitelisted localhost callback must be accepted');

  // 5b. Open Redirect / Unauthorized domain rejection
  const attackerUri = 'https://malicious-site.com/steal-eve-token';
  const maliciousCheck = validateRedirectUri(attackerUri, mockReq);
  assert(!maliciousCheck.isValid, 'Malicious external redirect_uri MUST BE REJECTED');

  const attackerSubdomain = 'https://localhost.attacker.com/auth/callback';
  const subCheck = validateRedirectUri(attackerSubdomain, mockReq);
  assert(!subCheck.isValid, 'Subdomain spoofing redirect_uri MUST BE REJECTED');

  // 6. AuthService Session Status & Normalization
  console.log('6. Testing AuthService Session Lifecycle Statuses...');
  
  // 6a. SESSION_VALID
  const validStatus = AuthService.computeSessionStatus(activeSession);
  assert(validStatus === 'SESSION_VALID', `Expected SESSION_VALID, got ${validStatus}`);

  // 6b. SESSION_EXPIRING
  const expiringStatus = AuthService.computeSessionStatus(expiringSession);
  assert(expiringStatus === 'SESSION_EXPIRING', `Expected SESSION_EXPIRING, got ${expiringStatus}`);

  // 6c. SESSION_EXPIRED
  const expiredSession: EveCharacterSession = {
    ...activeSession,
    expires_at: Date.now() - 5000,
  };
  const expiredStatus = AuthService.computeSessionStatus(expiredSession);
  assert(expiredStatus === 'SESSION_EXPIRED', `Expected SESSION_EXPIRED, got ${expiredStatus}`);

  // 6d. SESSION_REVOKED
  const revokedSession: EveCharacterSession = {
    ...activeSession,
    auth_error: 'ESI 401 Unauthorized: token revoked by user',
  };
  const revokedStatus = AuthService.computeSessionStatus(revokedSession);
  assert(revokedStatus === 'SESSION_REVOKED', `Expected SESSION_REVOKED, got ${revokedStatus}`);

  // 6e. SESSION_CORRUPTED
  const corruptedStatus = AuthService.computeSessionStatus({ character_id: 123 } as any);
  assert(corruptedStatus === 'SESSION_CORRUPTED', `Expected SESSION_CORRUPTED, got ${corruptedStatus}`);

  // 6f. Normalization to v2
  const normalized = AuthService.normalizeSession(activeSession);
  assert(normalized.session_version === 2, 'Normalized session must have session_version 2');
  assert(normalized.auth_status === 'SESSION_VALID', 'Normalized session must have auth_status computed');
  assert(Boolean(normalized.last_validated_at), 'Normalized session must have last_validated_at populated');

  console.log('✅ All Security & Advisory tests passed successfully!');
}

runSecurityAndAdvisoryTests();

