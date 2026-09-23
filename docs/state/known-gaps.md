# Known Gaps

Status: CURRENT
Scope: functional and operational gaps revalidated against current main
Source of truth: code, tests, CI and current state documents

## UX / product gaps

- The UI information architecture does not yet reflect the mature trading workflow of discovery -> operations -> performance -> allocation -> cockpit.
- Operations is partially implemented: the active-order console now exposes the main operational context, but browser validation of the complete decision loop is still open.
- Portfolio currently presents an allocation simulation but is fed from opportunities derived from the selected item, preventing genuine cross-item diversification.
- The Journal remains manual despite authoritative ESI-derived transaction/order-history/journal data being available.
- Parameters mix trading policy, logistics, treasury and technical maintenance; some visible controls have no demonstrated effective engine consumer.
- Cockpit is still too item-centric to act as an application-wide decision synthesis.

## Market / ESI operational gaps

- Target-PC public market-order retrieval is reported broken but remains NOT ROOT-CAUSED.
- Some non-Operations market acquisition paths may still swallow errors; the Operations order-sync path now surfaces explicit failure instead of presenting an ordinary empty state.
- Rate-limit/cache-aware scheduling for the public market-order group is not yet exposed as a product-level operational signal.
- Market-data freshness/completeness/source remain inconsistent across the application; Operations now exposes per-order health and age using the UX-01 vocabulary.

## CI / delivery gaps

- The current CI is functionally valid but operationally inefficient: the browser gate waits for the monolithic validation job.
- The main validation job contains several independent families that are still serialized.
- \`npm test\` is a large sequential command manifest and specialized gates partially overlap it.
- Current concurrency cancels obsolete runs on one PR/workflow reference but does not prevent several distinct PRs from representing the same human chantier.
- The SDE gate is reliable and cheap but is not yet governed by the same future certification/concurrency model.
- There is no stable conditional-check aggregator yet, so a future path-aware model must be introduced carefully.
- Branch protection/ruleset configuration for \`main\` could not be verified with the available integration and must be checked before any required-check rename.
- CI-001 is now ACTIVE. CI-001A/B has frozen the baseline and evidence map; topology, required-gate and branch-protection changes remain gated by later phases.

See:
- [CI Validation](../validation/ci.md)
- [CI Management Audit](../audits/ci-management-audit-2026-09-23.md)
- [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
- [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md)
- [CI-001 Baseline](../audits/ci-management-baseline-2026-09-23.md)
- [CI-001 Evidence Map](../validation/ci-evidence-map.md)

## Structural gaps

- IndexedDbStore remains a large monolithic service; decomposition is explicitly DEFERRED by the UX-first sequencing gate.
- Several UI files remain large; decomposition is explicitly DEFERRED until the relevant UX contracts are accepted.
- Performance is not protected by a dedicated measurement gate.
- Browser E2E must expand to cover critical trading workflows after UX contracts are frozen.

## Domain gaps

- Assets, inventory and logistics corporation domains are not implemented.
- Corporation trading UI scope remains less mature than the underlying ownership/ESI domain.
- Prediction/calibration depends on accumulating valid historical observations.

## Historical reclassification

Older audits may mention duplicate corporation ESI paths, numeric OrderId risk, observer/owner confusion or missing API tests. Those are historical after the stabilization sequence and must not be copied into the current backlog without fresh evidence.
