/**
 * Canonical CCP market/order identity.
 *
 * Order IDs are identifiers, not arithmetic values. They are represented as
 * strings throughout the domain so they are not exposed to IEEE-754 rounding.
 */
export type OrderId = string;
