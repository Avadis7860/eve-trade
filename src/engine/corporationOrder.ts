import type {
  EveCharacterOrder,
  EveCharacterOrderHistory,
  OrderOwnership,
} from '../types';
import { normalizeOrderId } from './orderIdentity';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildOwnership(
  principalCharacterId: number,
  corporationId: number,
  corporationName?: string,
): OrderOwnership {
  return {
    principal_character_id: principalCharacterId,
    owner_type: 'corporation',
    owner_id: corporationId,
    ...(corporationName ? { owner_name: corporationName } : {}),
    corporation_id: corporationId,
    ...(corporationName ? { corporation_name: corporationName } : {}),
  };
}

function normalizeCommonCorporationOrder(
  raw: unknown,
  principalCharacterId: number,
  corporationId: number,
  corporationName?: string,
): {
  orderId: string;
  typeId: number;
  regionId: number;
  locationId: number;
  price: number;
  volumeRemain: number;
  volumeTotal: number;
  isBuyOrder: boolean;
  issued: string;
  duration: number;
  escrow?: number;
} | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !isPositiveInteger(principalCharacterId) ||
    !isPositiveInteger(corporationId)
  ) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const orderId = normalizeOrderId(source.order_id);
  const typeId = Number(source.type_id);
  const regionId = Number(source.region_id);
  const locationId = Number(source.location_id);
  const price = Number(source.price);
  const volumeRemain = Number(source.volume_remain);
  const volumeTotal = Number(source.volume_total);
  const duration = Number(source.duration ?? 90);

  if (
    !orderId ||
    !Number.isInteger(typeId) ||
    typeId <= 0 ||
    !Number.isInteger(regionId) ||
    regionId <= 0 ||
    !Number.isInteger(locationId) ||
    locationId <= 0 ||
    !finiteNumber(price) ||
    price <= 0 ||
    !finiteNumber(volumeRemain) ||
    volumeRemain <= 0 ||
    !finiteNumber(volumeTotal) ||
    volumeTotal < volumeRemain ||
    !finiteNumber(duration) ||
    duration < 0 ||
    typeof source.issued !== 'string' ||
    source.issued.length === 0 ||
    typeof source.is_buy_order !== 'boolean'
  ) {
    return null;
  }

  const escrow = source.escrow;
  if (escrow !== undefined && (!finiteNumber(escrow) || escrow < 0)) {
    return null;
  }

  return {
    orderId,
    typeId,
    regionId,
    locationId,
    price,
    volumeRemain,
    volumeTotal,
    isBuyOrder: source.is_buy_order,
    issued: source.issued,
    duration,
    ...(escrow !== undefined ? { escrow } : {}),
  };
}

/**
 * Normalize one corporation active-order ESI payload into the application's
 * ownership-aware order contract. No character owner is inferred.
 */
export function normalizeCorporationOrder(
  raw: unknown,
  principalCharacterId: number,
  corporationId: number,
  corporationName?: string,
): EveCharacterOrder | null {
  const common = normalizeCommonCorporationOrder(
    raw,
    principalCharacterId,
    corporationId,
    corporationName,
  );
  if (!common) return null;

  const ownership = buildOwnership(
    principalCharacterId,
    corporationId,
    corporationName,
  );

  return {
    order_id: common.orderId,
    type_id: common.typeId,
    region_id: common.regionId,
    location_id: common.locationId,
    price: common.price,
    volume_remain: common.volumeRemain,
    volume_total: common.volumeTotal,
    is_buy_order: common.isBuyOrder,
    issued: common.issued,
    duration: common.duration,
    ...(common.escrow !== undefined ? { escrow: common.escrow } : {}),
    ownership,
    is_corporation: true,
    // Intentionally no character_id/name, issuer, or wallet division:
    // CCP did not provide those facts in this normalized boundary.
  };
}

/**
 * Normalize one corporation historical-order ESI payload.
 */
export function normalizeCorporationOrderHistory(
  raw: unknown,
  principalCharacterId: number,
  corporationId: number,
  corporationName?: string,
): EveCharacterOrderHistory | null {
  const common = normalizeCommonCorporationOrder(
    raw,
    principalCharacterId,
    corporationId,
    corporationName,
  );
  if (!common) return null;

  const source = raw as Record<string, unknown>;
  const state = source.state;
  if (
    state !== 'cancelled' &&
    state !== 'expired' &&
    state !== 'fulfilled' &&
    state !== 'open'
  ) {
    return null;
  }

  if (source.completed_at !== undefined && typeof source.completed_at !== 'string') {
    return null;
  }

  return {
    order_id: common.orderId,
    ownership: buildOwnership(
      principalCharacterId,
      corporationId,
      corporationName,
    ),
    type_id: common.typeId,
    region_id: common.regionId,
    location_id: common.locationId,
    price: common.price,
    volume_remain: common.volumeRemain,
    volume_total: common.volumeTotal,
    is_buy_order: common.isBuyOrder,
    issued: common.issued,
    duration: common.duration,
    ...(common.escrow !== undefined ? { escrow: common.escrow } : {}),
    state,
    ...(source.completed_at !== undefined ? { completed_at: source.completed_at } : {}),
    is_corporation: true,
  };
}

/**
 * Corporate endpoint is authoritative for corporation-owned orders when the
 * same order is also present in a character-scoped response.
 */
export function mergeCharacterAndCorporationOrders(
  characterOrders: readonly EveCharacterOrder[],
  corporationOrders: readonly EveCharacterOrder[],
): EveCharacterOrder[] {
  const byId = new Map<string, EveCharacterOrder>();

  for (const order of characterOrders) {
    byId.set(order.order_id, order);
  }

  for (const order of corporationOrders) {
    byId.set(order.order_id, order);
  }

  return Array.from(byId.values());
}
