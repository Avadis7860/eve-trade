# Known Gaps

Status: CURRENT
Scope: functional and operational gaps revalidated against current main
Source of truth: code, tests, CI and current state documents

## Agent context / repository governance

- The repository previously required manual reconstruction of domain/code/contract/test/CI relationships for many tasks. The current context architecture provides a stable map, a separate active-work manifest and reference integrity; this hardening closes the demonstrated post-merge lifecycle and bootstrap gaps.
- The active-work state must remain operational and branch/PR specific; the stable map must not embed the current branch or PR.
- Context references are qualified by workflow file and job because CI job IDs can repeat across workflows.
- The archive is not a source of current implementation truth. Archived UX-03/Financial Truth code is reference-only and must be re-derived from current main.
- The post-merge audit demonstrated that a merged delivery could leave `current-work`, current-state and roadmap metadata presenting an old active chantier. The hardening adds deterministic stable-state checks and a closing lifecycle. Main Smoke then exposed that both revision traversal and pretty-format parent extraction were unsuitable for the workflow's shallow checkout; the current follow-up reads the raw commit object so the proof remains valid without increasing checkout depth or mutating main post-merge.

## UX / product gaps

- The UI information architecture does not yet reflect the mature trading workflow of discovery -> operations -> performance -> allocation -> cockpit.
- Operations decision-loop validation is complete and merged; PR #61 certified keep / adjust / relocate / cancel plus degraded-data behavior.
- Portfolio currently presents an allocation simulation but is fed from opportunities derived from the selected item, preventing genuine cross-item diversification.
- The Journal remains manual despite authoritative ESI-derived transaction/order-history/journal data being available.
- Parameters mix trading policy, logistics, treasury and technical maintenance; some visible controls have no demonstrated effective engine consumer.
- Cockpit is still too item-centric to act as an application-wide decision synthesis.

## Market / ESI operational gaps

- The previously reported target-PC market-display problem is resolved; the current application is functional. The symptom was attributed by the operator to insufficient available data rather than to a persistent application defect.
- Public market acquisition now has explicit failure/quality semantics and certified browser diagnostics. The legacy `EsiService.fetchLiveOrders()` helper remains a latent quality-loss hazard because it drops the quality envelope; no production caller is currently known.
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
- CI-001 is DONE / MERGED on main. The Draft-routing mismatch remains a confirmed CI follow-up. Main Smoke is independently verified on the current main merge; Full Certification remains a scheduled/manual exhaustive health surface.

See:
- [CI Validation](../validation/ci.md)
- [CI Management Audit](../audits/ci-management-audit-2026-09-23.md)
- [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
- [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md)
- [CI-001 Baseline](../audits/ci-management-baseline-2026-09-23.md)
- [CI-001 Evidence Map](../validation/ci-evidence-map.md)

- **CI follow-up:** the PR workflow currently triggers the full certification surface for Draft as well as Ready PRs. This is confirmed by PR #61 run `35858589551` and should be handled in a dedicated CI-002 hardening chantier.

- **Current sequencing:** Agent Context Hardening v2, PR #80 and PR #81 are merged. Main Smoke #17 is green on `a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8`. The current delivery is FIN-002-ARCHIVE-RECOVERY / PR #82 from `a01c2a31dbabd3678d3d8674b14f4c826ab0b0d8`. The archive remains reference-only; this delivery selectively reconstructs validated Financial Truth elements without resurrecting UX-03 UI, Fleet, CI, Agent Context or unrelated ESI/OAuth changes. Public-readiness remains a separate maintenance track.

## Public-readiness gaps

- The repository is now public but had no published license at audit time; a licensing decision is required before presenting it as open-source.
- Public security posture still requires administrative verification of Dependabot alerts, secret scanning/push protection, code scanning/SAST and main branch protection/rulesets.
- No GitHub release is recorded yet for the current package version; release provenance is planned.
- The README has been refreshed by this sync, but screenshots or a deterministic public showcase path are still planned.
- Legacy `metadata.json` contains a Gemini capability declaration that appears unused by current code and requires confirmation before removal.

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
