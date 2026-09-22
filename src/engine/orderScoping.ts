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
 * - Propriété de l'ordre toujours portée par order.character_id et order.character_name.
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

  switch (scope.type) {
    case 'active_character':
      return orders.filter(
        (order) => order.character_id !== undefined && String(order.character_id) === activeCharacterId
      );

    case 'character':
      return orders.filter(
        (order) => order.character_id !== undefined && String(order.character_id) === scope.characterId
      );

    case 'fleet':
      return orders.filter(
        (order) =>
          order.character_id !== undefined &&
          Array.isArray(fleetCharacterIds) &&
          fleetCharacterIds.includes(String(order.character_id))
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
