import { strict as assert } from 'node:assert';
import type { EveCharacterOrder, RawMarketOrder } from '../../types';
import {
  ORDER_AGEING_RISK_REMAINING_RATIO,
  getOrderLockedValue,
  getOrderMarketDistance,
  getOrderTiming,
} from '../orderOperations';

const base: EveCharacterOrder = {
  order_id: 'order-1',
  character_id: 1001,
  character_name: 'Trader',
  type_id: 34,
  region_id: 10000002,
  location_id: 60003760,
  price: 10,
  volume_remain: 600,
  volume_total: 1000,
  is_buy_order: false,
  issued: '2026-09-20T00:00:00.000Z',
  duration: 10,
};

const now = Date.parse('2026-09-25T00:00:00.000Z');
const timing = getOrderTiming(base, now);

assert.equal(timing.fillRatio, 0.4);
assert.equal(timing.remainingRatio, 0.5);
assert.equal(timing.isAgeingRisk, false);
assert.equal(timing.remainingMs, 5 * 86_400_000);
assert.equal(timing.ageMs, 5 * 86_400_000);

const nearExpiry = getOrderTiming(
  { ...base, issued: '2026-09-20T00:00:00.000Z', duration: 6 },
  now,
);
assert.equal(nearExpiry.remainingRatio, 1 / 6);
assert.equal(
  nearExpiry.isAgeingRisk,
  true,
  `Risk threshold should be based on remaining-duration ratio ${ORDER_AGEING_RISK_REMAINING_RATIO}`,
);

assert.equal(getOrderLockedValue({ ...base, is_buy_order: true, escrow: 12345 }), 12345);
assert.equal(getOrderLockedValue(base), 6000);

const market: RawMarketOrder[] = [
  {
    order_id: 'other-1',
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 9,
    volume_remain: 100,
    volume_total: 100,
    is_buy_order: false,
    issued: base.issued,
    duration: 90,
  },
  {
    order_id: 'other-2',
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 10.5,
    volume_remain: 100,
    volume_total: 100,
    is_buy_order: false,
    issued: base.issued,
    duration: 90,
  },
  {
    order_id: 'buy-1',
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 8,
    volume_remain: 100,
    volume_total: 100,
    is_buy_order: true,
    issued: base.issued,
    duration: 90,
  },
  {
    order_id: 'buy-2',
    type_id: 34,
    region_id: 10000002,
    system_id: 30000142,
    location_id: 60003760,
    price: 8.5,
    volume_remain: 100,
    volume_total: 100,
    is_buy_order: true,
    issued: base.issued,
    duration: 90,
  },
]

const sellDistance = getOrderMarketDistance(base, market);
assert.equal(sellDistance?.referencePrice, 9);
assert.ok(Math.abs((sellDistance?.distancePct ?? 0) - 11.1111111111) < 1e-9);

const buyDistance = getOrderMarketDistance(
  { ...base, order_id: 'my-buy', is_buy_order: true, price: 8 },
  market,
);
assert.equal(buyDistance?.referencePrice, 8.5);
assert.ok(Math.abs((buyDistance?.distancePct ?? 0) - ((8 - 8.5) / 8.5 * 100)) < 1e-9);

console.log('✅ Operations timing/market-context primitives passed.');
