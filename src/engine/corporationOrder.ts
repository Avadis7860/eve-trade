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
    observed_by_character_ids: [principalCharacterId],
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
  issuerCharacterId?: number;
  walletDivision?: number;
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

  const issuerCharacterId = source.issued_by;
  if (issuerCharacterId !== undefined && !isPositiveInteger(issuerCharacterId)) {
    return null;
  }

  const walletDivision = source.wallet_division;
  if (
    walletDivision !== undefined &&
    (!isPositiveInteger(walletDivision) || walletDivision > 7)
  ) {
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
    ...(issuerCharacterId !== undefined ? { issuerCharacterId } : {}),
    ...(walletDivision !== undefined ? { walletDivision } : {}),
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
    ownership: {
      ...ownership,
      ...(common.issuerCharacterId !== undefined
        ? { issuer_character_id: common.issuerCharacterId }
        : {}),
      ...(common.walletDivision !== undefined
        ? { wallet_division: common.walletDivision }
        : {}),
    },
    is_corporation: true,
    // No character owner projection is created. Issuer and wallet division
    // are preserved only when CCP explicitly exposes them.
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
    ownership: {
      ...buildOwnership(principalCharacterId, corporationId, corporationName),
      ...(common.issuerCharacterId !== undefined
        ? { issuer_character_id: common.issuerCharacterId }
        : {}),
      ...(common.walletDivision !== undefined
        ? { wallet_division: common.walletDivision }
        : {}),
    },
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

/**
 * Merges two observations of the same economic order without losing the
 * independent characters that observed it.
 *
 * Owner identity must be identical. A conflicting owner is treated as an
 * integrity violation and returns null rather than choosing a winner silently.
 */
export function mergeOrderObservations(
  existing: EveCharacterOrder,
  incoming: EveCharacterOrder,
): EveCharacterOrder | null {
  if (existing.order_id !== incoming.order_id) return null;

  const existingOwner = existing.ownership;
  const incomingOwner = incoming.ownership;
  const existingLegacyCorporate = !existingOwner && existing.is_corporation === true;
  const incomingLegacyCorporate = !incomingOwner && incoming.is_corporation === true;

  if (
    (existingOwner && incomingOwner &&
      (
        existingOwner.owner_type !== incomingOwner.owner_type ||
        existingOwner.owner_id !== incomingOwner.owner_id
      )) ||
    (existingLegacyCorporate && incomingOwner?.owner_type === 'character') ||
    (incomingLegacyCorporate && existingOwner?.owner_type === 'character')
  ) {
    return null;
  }

  const owner = existingOwner ?? incomingOwner;
  if (!owner) {
    // Two legacy corporate observations remain explicitly unowned rather than
    // being attributed to either observing character.
    if (existingLegacyCorporate || incomingLegacyCorporate) {
      return {
        ...existing,
        ...incoming,
        character_id: undefined,
        character_name: undefined,
        is_corporation: true,
      };
    }
    return existing;
  }

  const observers = new Set<number>();
  const existingObservers = existingOwner
    ? (existingOwner.observed_by_character_ids ?? [existingOwner.principal_character_id])
    : [];
  const incomingObservers = incomingOwner
    ? (incomingOwner.observed_by_character_ids ?? [incomingOwner.principal_character_id])
    : [];

  for (const id of existingObservers) {
    if (Number.isInteger(id) && id > 0) observers.add(id);
  }
  for (const id of incomingObservers) {
    if (Number.isInteger(id) && id > 0) observers.add(id);
  }

  const sortedObservers = Array.from(observers).sort((a, b) => a - b);
  const primaryPrincipal = sortedObservers[0] ?? owner.principal_character_id;

  return {
    ...existing,
    ...incoming,
    ownership: {
      ...owner,
      principal_character_id: primaryPrincipal,
      observed_by_character_ids: sortedObservers,
    },
    character_id:
      owner.owner_type === 'character'
        ? owner.owner_id
        : undefined,
    character_name:
      owner.owner_type === 'character'
        ? (owner.owner_name ?? incoming.character_name ?? existing.character_name)
        : undefined,
  };
}
