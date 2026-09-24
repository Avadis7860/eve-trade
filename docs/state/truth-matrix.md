# Truth Matrix

Status: CURRENT
Scope: active working state on `ux-03/allocation-contract` plus current main baseline
Source of truth: code, tests, CI and state documents

| Domaine | État | Implémentation principale | Validation | Documentation | Suite |
|---|---|---|---|---|---|
| Catalog | STABLE | CatalogRepository, CatalogValidator, manifest | catalog/truth suites | catalog | refresh governance |
| Universe | STABLE | graph repository + route engine + manifest | route/SDE truth | universe | SDE refresh/performance |
| Market data | STABLE / UX-01 DONE | EsiService, MarketDataStore, MarketEsiGateway | quality + ESI + browser diagnostics | market-data | retrieval maintenance |
| Trading orders | STABLE FOUNDATION / MODEL REBASE | order identity/scoping/normalization | order/corporation + Operations | orders | ORD-001 canonical axes |
| Corporation ESI | STABLE | corporation gateway + EsiService | corporation boundary + ESI | corporation trading | corporation UI |
| Finance | IMPLEMENTED PRIMITIVES / REBASE REQUIRED | fee/profit/treasury engines | financial/treasury | finance | position ledger |
| Financial Truth | SEMANTIC REBASE REQUIRED | RealizedFinancialOutcomeEngine + future position ledger | realized-financial + FIN scenarios | financial truth | FIN-001/FIN-002 |
| Execution | IMPLEMENTED / SEMANTIC REBASE REQUIRED | correlation/outcome/tracking | execution suites | execution | separate market mechanism from economic transaction |
| Portfolio | IMPLEMENTED SCAFFOLD / BLOCKED | PortfolioOptimizer | engine/property tests | portfolio | FIN-001 position/cost basis |
| Prediction | IMPLEMENTED | features/scoring/prediction | scoring/prediction | prediction | empirical calibration |
| Persistence | STABLE / DEFERRED | IndexedDB v5 / stores | persistence tests | persistence | decomposition later |
| Security | STABLE | auth + principal boundary | security/ESI | security | new scopes |
| UI | PARTIAL / PRIORITY | React components/hooks | typecheck/build + browser E2E | frontend | UX contract sequence |
| Browser E2E | DONE / EXPAND LATER | deterministic Playwright composition | browser/target-PC smoke | e2e | critical financial workflows |

