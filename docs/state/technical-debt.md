# Technical Debt

Status: CURRENT
Scope: technical debt only
Source of truth: current code tree + validation surfaces

| Sujet | État | Evidence | Risque | Suite |
|---|---|---|---|---|
| IndexedDB monolithique | OPEN | `src/services/indexedDbStore.ts` ≈ 2292 lignes | maintenance/context | structural persistence chantier |
| Gros composants UI | OPEN | ConfigurationPanel, MyOrdersView, OpportunityModal, TraderPerformanceModal and others are large | change risk/context | frontend decomposition |
| Initial bundle/performance | OPEN | performance surface is not a current CI gate | load cost | performance chantier |
| Browser E2E | DONE | Playwright harness + CI job green; PR #46 merged; target-PC real CCP smoke PASS on 2026-09-23 | maintained by browser/security regression coverage | E2E-002 for additional critical workflows |
| Broad analytics service | WATCH | `traderAnalytics.ts` ≈ 1367 lines but delegates accounting to Financial Truth | maintenance | later decomposition if justified |

The IndexedDB HTTP cache is **not itself a defect**: the current code documents that it has no active private-data consumer. Creating one without principal/owner partitioning would be a future defect.
