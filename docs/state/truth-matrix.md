# Truth Matrix

Status: CURRENT
Scope: synthetic state of current main
Source of truth: code, tests, CI and manifests

| Domaine | État | Implémentation principale | Validation | Documentation | Suite |
|---|---|---|---|---|---|
| Catalog | STABLE | CatalogRepository, CatalogValidator, manifest | truth/catalog suites | [catalog](../domains/catalog.md) | refresh governance |
| Universe | STABLE | graph repository + route engine + manifest | route/SDE truth | [universe](../domains/universe.md) | SDE refresh/performance |
| Market data | STABLE / UX-01 DONE | EsiService, MarketDataStore, MarketEsiGateway | quality + ESI + browser diagnostics | [market-data](../domains/market-data.md) | retrieval observability maintenance + empirical turnover |
| Trading orders | STABLE / UX-02 DONE | order identity/scoping/normalization | order/corporation + Operations browser suites | [orders](../domains/trading/orders.md) | allocation/performance consumers |
| Corporation ESI | STABLE | corporation gateway + EsiService | corporation boundary + ESI | [corporation trading](../domains/trading/corporation-trading.md) | corporation UI after UX gate |
| Finance | IMPLEMENTED | fee/profit/treasury engines | financial/treasury | [finance](../domains/finance/overview.md) | accounting consumers |
| Financial Truth | STABLE / UX P1 | RealizedFinancialOutcomeEngine | realized-financial | [financial truth](../domains/finance/financial-truth.md) | automatic Performance UI |
| Execution | IMPLEMENTED / UX P1 | correlation/outcome/tracking | execution suites | [execution](../domains/execution/overview.md) | outcome attribution in Performance |
| Portfolio | IMPLEMENTED / UX P1 | PortfolioOptimizer | engine/property tests | [portfolio](../domains/portfolio.md) | cross-item opportunity input + allocation UI |
| Prediction | IMPLEMENTED | features/scoring/prediction | scoring/prediction | [prediction](../domains/prediction.md) | empirical calibration |
| Persistence | STABLE / DEFERRED | IndexedDbStore v5 / 11 stores | persistence tests | [persistence](../architecture/persistence.md) | decomposition after UX gate |
| Security | STABLE | auth + ESI principal boundary | security/ESI | [security](../architecture/security-boundary.md) | new scopes |
| UI | PARTIAL / PRIORITY | React components/hooks | typecheck/build + browser E2E | [frontend](../architecture/frontend.md) | UX-00..UX-07 |
| Agent context | ACTIVE ON CURRENT BRANCH | .eve-trade/context-map.json + current-work + context-integrity + ci-scope | test:context + CI static | [agent context](../operations/agent-context.md) | lifecycle/bootstrap/routing hardening |
| Browser E2E | DONE / EXPAND LATER | deterministic Playwright OAuth/ESI composition merged to main | PR #46 + target-PC smoke PASS | [e2e](../validation/e2e.md) | E2E-002 after UX contracts |
