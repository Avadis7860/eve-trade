# Technical Debt

Status: CURRENT
Scope: technical debt only
Source of truth: current code tree + validation surfaces

| Sujet | État | Evidence | Risque | Suite |
|---|---|---|---|---|
| IndexedDB monolithique | OPEN | `src/services/indexedDbStore.ts` ≈ 2292 lignes | maintenance/context | structural persistence chantier |
| Gros composants UI | OPEN | ConfigurationPanel, MyOrdersView, OpportunityModal, TraderPerformanceModal and others are large | change risk/context | frontend decomposition |
| Initial bundle/performance | OPEN | performance surface is not a current CI gate | load cost | performance chantier |
| Browser E2E | READY FOR LOCAL ACCEPTANCE | Playwright harness + CI job green on PR #46; real CCP smoke still pending | live environment proof remains outstanding | execute target-PC real CCP smoke |
| Broad analytics service | WATCH | `traderAnalytics.ts` ≈ 1367 lines but delegates accounting to Financial Truth | maintenance | later decomposition if justified |

The IndexedDB HTTP cache is **not itself a defect**: the current code documents that it has no active private-data consumer. Creating one without principal/owner partitioning would be a future defect.
