# Truth Matrix

Status: CURRENT
Scope: active working state on ux-03/allocation-contract plus current main baseline
Source of truth: code, tests, CI and state documents

| Domaine | État | Implémentation principale | Validation | Documentation | Suite |
|---|---|---|---|---|---|
| Catalog | STABLE | CatalogRepository, CatalogValidator, manifest | catalog/truth suites | catalog | refresh governance |
| Universe | STABLE | graph repository + route engine + manifest | route/SDE truth | universe | SDE refresh/performance |
| Market data | STABLE / UX-01 DONE | EsiService, MarketDataStore, MarketEsiGateway | quality + ESI + browser diagnostics | market-data | retrieval maintenance |
| Trading orders | STABLE FOUNDATION / MODEL REBASE | order identity/scoping/normalization | order/corporation + Operations | orders | ORD-001 canonical axes |
| Corporation ESI | STABLE | corporation gateway + EsiService | corporation boundary + ESI | corporation trading | corporation UI |
| Finance | IMPLEMENTED PRIMITIVES / REBASE REQUIRED | fee/profit/treasury + position ledger | financial/treasury + position ledger | finance | capital recovery semantics |
| Financial Truth | IMPLEMENTED CALCULATION BOUNDARY / REBASE REQUIRED | positionLedger + RealizedFinancialOutcomeEngine | realized-financial + position-ledger + FIN scenarios | financial truth | FIN-001/FIN-002/DATA-001 |
| Execution | IMPLEMENTED / FINANCIAL LIFECYCLE SEPARATE | correlation/outcome/tracking | execution suites | execution | keep operational closure separate from financial closure |
| Portfolio | IMPLEMENTED SCAFFOLD / BLOCKED | PortfolioOptimizer | engine/property tests | portfolio | FIN-001 position/cost basis |
| Prediction | IMPLEMENTED | features/scoring/prediction | scoring/prediction | prediction | empirical calibration |
| Persistence | STABLE / DEFERRED | IndexedDB v5 / transaction and execution stores | persistence tests | persistence | no durable position store yet |
| Security | STABLE | auth + principal boundary | security/ESI | security | new scopes |
| UI | PARTIAL / PRIORITY | React components/hooks | typecheck/build + browser E2E | frontend | financial lifecycle + capital recovery |
| Browser E2E | DONE / EXPAND LATER | deterministic Playwright composition | browser/target-PC smoke | e2e | critical financial workflows |

## CI status

Latest verified branch head 26f8f7eab0c001cd96604d0053d4f8c69e33a70a is RED on the Foundation & Regression Gate.

The red causes are known and documented in Financial Truth Validation:
- legacy frontend fixture missing newly required lifecycle fields;
- legacy unit scenario using typeId = 0 against the stricter ledger invariant.

Do not weaken the invariant to make the legacy test pass. Reconcile the test contract with the accepted model.
