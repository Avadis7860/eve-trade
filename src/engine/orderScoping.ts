import {
  EveCharacterOrder,
  OrderScope,
  OrderSelectionContext,
  OrderCollection,
  OrderCharacterContext,
} from '../types';

/**
 * 🎯 Order Scoping Engine — Pure Mathematical / Structural Selection Module
 *
 * Sémantique obligatoire:
 * - active_character: ordre appartenant au personnage actif (context.activeCharacterId)
 * - character: ordre appartenant au personnage spécifié (scope.characterId)
 * - fleet: ordre appartenant à l'un des personnages de la Fleet (context.fleetCharacterIds)
 *
 * Invariants majeurs:
 * - ZÉRO effet de bord, aucun appel réseau, aucun accès localStorage ou hook React.
 * - Ne modifie pas et ne clone pas artificiellement les ordres (données métier EveCharacterOrder préservées).
 * - Ne crée jamais de pseudo-propriétaire 'fleet'.
 * - ownership is authoritative when present. Character scopes only accept
 *   character-owned orders; corporation-owned orders are excluded until a
 *   corporation-specific scope is introduced.
 * - Legacy corporation orders marked is_corporation=true are never inferred
 *   to belong to the observing character.
 */

/**
 * Filters orders by the specified scope in a given selection context.
 *
 * @param orders Source list of EveCharacterOrder
 * @param scope OrderScope context requested
 * @param context OrderSelectionContext with activeCharacterId and fleetCharacterIds
 * @returns Filtered EveCharacterOrder array
 */
export function selectOrdersByScope(
  orders: EveCharacterOrder[],
  scope: OrderScope,
  context: OrderSelectionContext
): EveCharacterOrder[] {
  if (!orders || orders.length === 0) {
    return [];
  }

  const { activeCharacterId, fleetCharacterIds } = context;

  const isCharacterOwned = (order: EveCharacterOrder): boolean => {
    if (order.ownership) {
      return order.ownership.owner_type === 'character';
    }

    // Legacy safety rule: an order explicitly marked corporate is not
    // attributable to the observing character until canonical ownership is
    // resolved.
    return order.is_corporation !== true && order.character_id !== undefined;
  };

  const characterOwnerId = (order: EveCharacterOrder): number | undefined => {
    if (!isCharacterOwned(order)) return undefined;
    return order.ownership?.owner_type === 'character'
      ? order.ownership.owner_id
      : order.character_id;
  };

  switch (scope.type) {
    case 'active_character':
      return orders.filter(
        (order) =>
          characterOwnerId(order) !== undefined &&
          String(characterOwnerId(order)) === activeCharacterId
      );

    case 'character':
      return orders.filter(
        (order) =>
          characterOwnerId(order) !== undefined &&
          String(characterOwnerId(order)) === scope.characterId
      );

    case 'fleet':
      return orders.filter(
        (order) =>
          characterOwnerId(order) !== undefined &&
          Array.isArray(fleetCharacterIds) &&
          fleetCharacterIds.includes(String(characterOwnerId(order)))
      );

    default:
      return [];
  }
}

/**
 * Pure helper to construct a normalized OrderCollection.
 *
 * @param orders Source orders
 * @param characters Characters available in the context
 * @param scope Requested scope
 * @returns An OrderCollection object
 */
export function createOrderCollection(
  orders: EveCharacterOrder[],
  characters: OrderCharacterContext[],
  scope: OrderScope
): OrderCollection {
  return {
    orders: orders || [],
    characters: characters || [],
    scope,
  };
}
