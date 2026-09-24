# Contracts Index

Status: STABLE WITH FINANCIAL REBASE IN PROGRESS
Scope: normative cross-layer contracts
Source of truth: implementations and public types

| Contract | Primary implementation | Main invariant | Validation |
|---|---|---|---|
| Authentication | `server/routes/auth.ts`, `AuthService` | character isolation | security/API |
| Characters | `CharacterRepository`, character gateway | character identity isolation | character/API |
| Corporations | corporation gateway + treasury sync | corporation boundary | corporation boundary |
| Catalog | `CatalogRepository`, `CatalogValidator`, manifest | catalog truth | truth/catalog |
| Orders | `types/order.ts`, order engines | canonical OrderId + issuer/owner/observer separation | order/corporation + ORD-001 |
| ESI | `esiClient`, `EsiGateway`, `EsiService` | transport + collection state | ESI suites |
| Market data | market gateway/store/types | data health | market quality |
| Financial | financial types + position ledger + realized engine | acquisition lots + causal disposal + explicit completeness | FIN-001/FIN-002 |
| Execution | execution types/engines | deterministic operational attribution distinct from financial closure | execution + FIN scenarios |
| Persistence | `IndexedDbStore` | schema/write semantics | persistence suites |

Contracts describe shape and semantic rules; implementation remains the technical truth.
