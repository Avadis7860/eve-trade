/**
 * Canonical CCP market/order identity.
 *
 * Order IDs are identifiers, not arithmetic values. They are represented as
 * strings throughout the domain so they are not exposed to IEEE-754 rounding.
 */
export type OrderId = string;


/**
 * Canonical economic owner class represented by a CCP market order.
 * This is an order-domain concept, not a character-domain concept.
 */
export type OrderOwnerType = 'character' | 'corporation';

/**
 * Economic ownership and observation provenance for one canonical MarketOrder.
 *
 * The observing/authenticated character is represented by principal_character_id.
 * owner_type/owner_id identify the economic owner and are authoritative when present.
 */
export interface OrderOwnership {
  /** Character whose credential supplied the primary observation. */
  principal_character_id: number;
  /** All linked characters whose credentials independently observed this order. */
  observed_by_character_ids?: readonly number[];
  /** Economic/legal owner represented by the order payload. */
  owner_type: OrderOwnerType;
  /** EVE entity ID matching owner_type: character_id or corporation_id. */
  owner_id: number;
  owner_name?: string;
  corporation_id?: number;
  corporation_name?: string;
  /** Character who issued the order when ESI exposes issuer provenance. */
  issuer_character_id?: number;
  issuer_character_name?: string;
  /** Corporation wallet division funding this order, when applicable. */
  wallet_division?: number;
}

export interface MarketOrder {
  order_id: OrderId;
  /**
   * Backward-compatible character-owner projection.
   * Must be undefined for corporation-owned orders; use ownership as authority.
   */
  character_id?: number;
  character_name?: string;
  type_id: number;
  type_name?: string;
  region_id: number;
  region_name?: string;
  location_id: number;
  location_name?: string;
  price: number;
  volume_remain: number;
  volume_total: number;
  /**
   * Side of this observed market order. This is NOT the accounting direction
   * of a trader transaction that may have interacted with the order.
   */
  is_buy_order: boolean;
  issued: string;
  duration: number;
  escrow?: number;
  /** Canonical ownership/provenance; legacy snapshots may omit this during migration. */
  ownership?: OrderOwnership;
  /** @deprecated Use ownership.owner_type === 'corporation'. */
  is_corporation?: boolean;
  market_competition?: {
    highest_buy?: number;
    lowest_sell?: number;
    is_outbid: boolean;
    price_diff_percent: number;
    competing_volume?: number;
  };
}

/**
 * Compatibility name only. There is no separate character-owned order entity.
 */
export type EveCharacterOrder = MarketOrder;
