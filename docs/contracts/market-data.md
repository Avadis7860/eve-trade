# Market Data Contract

Status: IMPLEMENTED
Owner: market data domain
Implementation: `src/services/esi.ts`, `src/services/marketDataStore.ts`, `server/gateways/marketEsiGateway.ts`
Validation: market-data quality + ESI tests

## Shape

Market orders include canonical `OrderId`, type, location, price, remaining/total volume and market-side data needed by engines.

## Semantics

Public market data is not private to a character. Freshness, completeness, health and validation state accompany snapshots.

Duplicate canonical order identities are removed deterministically. When Operations combines auxiliary market views with the canonical `MarketDataStore`, duplicate canonical `OrderId` values appear once and the `MarketDataStore` snapshot is the authoritative value.
