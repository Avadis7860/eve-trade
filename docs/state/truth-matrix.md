# Truth Matrix

Status: CURRENT
Scope: synthetic state of current `main`
Source of truth: code, tests, CI and manifests at main `eb7810dde5b4a1f3b7b1949d6a512cd606c853d1`

| Domaine | État | Implémentation principale | Validation | Documentation | Suite |
|---|---|---|---|---|---|
| Catalog | STABLE | `CatalogRepository`, `CatalogValidator`, manifest | truth/catalog suites | [catalog](../domains/catalog.md) | refresh governance |
| Universe | STABLE | graph repository + route engine + manifest | route/SDE truth | [universe](../domains/universe.md) | SDE refresh/performance |
| Market data | IMPLEMENTED | `EsiService`, `MarketDataStore` | quality + ESI | [market-data](../domains/market-data.md) | empirical turnover |
| Trading orders | STABLE | order identity/scoping/normalization | order/corporation suites | [orders](../domains/trading/orders.md) | UI corporation scope |
| Corporation ESI | STABLE | corporation gateway + EsiService | corporation boundary + ESI | [corporation trading](../domains/trading/corporation-trading.md) | future corp domains |
| Finance | IMPLEMENTED | fee/profit/treasury engines | financial/treasury | [finance](../domains/finance/overview.md) | accounting consumers |
| Financial Truth | STABLE | `RealizedFinancialOutcomeEngine` | realized-financial | [financial truth](../domains/finance/financial-truth.md) | keep single source |
| Execution | IMPLEMENTED | correlation/outcome/tracking | execution suites | [execution](../domains/execution/overview.md) | attribution improvements |
| Portfolio | IMPLEMENTED | `PortfolioOptimizer` | engine/property tests | [portfolio](../domains/portfolio.md) | advanced allocation |
| Prediction | IMPLEMENTED | features/scoring/prediction | scoring/prediction | [prediction](../domains/prediction.md) | empirical calibration |
| Persistence | STABLE | `IndexedDbStore` v5 / 11 stores | persistence tests | [persistence](../architecture/persistence.md) | structural refactor |
| Security | STABLE | auth + ESI principal boundary | security/ESI | [security](../architecture/security-boundary.md) | new scopes |
| UI | PARTIAL | React components/hooks | typecheck/build | [frontend](../architecture/frontend.md) | E2E + UX/performance |
| Browser E2E | PARTIAL | no reference browser harness on `main`; E2E-001 implementation exists on active branch | HTTP/API + service/engine on `main`; browser evidence pending | [e2e](../validation/e2e.md) | E2E-001 |
