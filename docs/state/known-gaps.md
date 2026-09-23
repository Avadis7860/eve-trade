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

- CI-001D topology is proven; CI-001G scope routing and `CI / required-gate` are certified on head `bc2ff6c24a6b4b419311b287ddd0b206489093c3`.
- The historical `validate` and `browser-e2e` checks remain as compatibility aggregators; `CI / required-gate` is now the stable PR aggregation surface. Branch protection remains administratively unverified.
- Test taxonomy and canonical ownership are now documented; the first demonstrated duplicate invocation was removed while the underlying tests remain covered by their canonical owners and a retained Full/recovery composition.
- Browser Auth and Operations are now isolated at the job level; multi-worker Playwright execution remains intentionally blocked until state isolation is proven.
- \`npm test\` is a large sequential command manifest and specialized gates partially overlap it.
- Current concurrency cancels obsolete runs on one PR/workflow reference but does not prevent several distinct PRs from representing the same human chantier.
- The SDE gate remains authoritative for PR SDE-sensitive changes; Full certification also contains an explicit SDE regeneration proof.
- Conditional execution is routed through `CI / Change Scope` with conservative full-certification fallback; no workflow-level path filter is used on the required PR surface.
- Branch protection/ruleset configuration for \`main\` could not be verified with the available integration and must be checked before any required-check rename.
- CI-001 is DONE / MERGED on main. G is certified; H is implemented with dedicated Main/Full workflows and the CI recovery runbook; I is runtime-verified on PR run `35856208503` with durable workflow/job/step timing plus cancellation/rerun observability. Main Smoke and Full runtime proofs remain independent post-merge/scheduled health checks.

See:
- [CI Validation](../validation/ci.md)
- [CI Management Audit](../audits/ci-management-audit-2026-09-23.md)
- [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
- [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md)
- [CI-001 Baseline](../audits/ci-management-baseline-2026-09-23.md)
- [CI-001 Evidence Map](../validation/ci-evidence-map.md)

- **CI follow-up:** the PR workflow currently triggers the full certification surface for Draft as well as Ready PRs. This is a behavior mismatch with the documented Fast-vs-Certification model and should be handled in a dedicated CI-002 hardening chantier.

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
