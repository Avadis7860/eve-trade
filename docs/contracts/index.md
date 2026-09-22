# Contracts Index

Status: STABLE
Scope: normative cross-layer contracts
Source of truth: implementations and public types

| Contract | Primary implementation | Main invariant | Validation |
|---|---|---|---|
| Authentication | `server/routes/auth.ts`, `AuthService` | character isolation | security/API |
| Characters | `CharacterRepository`, character gateway | character identity isolation | character/API |
| Corporations | corporation gateway + treasury sync | corporation boundary | corporation boundary |
| Catalog | `CatalogRepository`, `CatalogValidator`, manifest | catalog truth | truth/catalog |
| Orders | `types/order.ts`, order engines | OrderId + ownership | order/corporation |
| ESI | `esiClient`, `EsiGateway`, `EsiService` | transport + collection state | ESI suites |
| Market data | market gateway/store/types | data health | market quality |
| Financial | financial types + realized engine | financial safety | financial suites |
| Execution | execution types/engines | deterministic attribution | execution suites |
| Persistence | `IndexedDbStore` | schema/write semantics | persistence suites |

Contracts describe shape and semantic rules; implementation remains the technical truth.
