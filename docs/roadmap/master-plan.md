# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The functional E2E-001 baseline is stable and merged. CI-001 is merged and complete. UX-02 is merged. UX-01/P0 is closed. Agent Context Hardening and its post-merge synchronization are closed by PR #84. UX-03 / TASK-01 contract rebase is complete through PR #93. No product delivery is currently active.

The application has mature market, ESI, finance, order, prediction and portfolio foundations, but the presentation layer does not yet expose them as a coherent trading workflow.

The Financial Truth semantic boundary is integrated and accepted on main. The UX-03 Allocation / Portfolio contract is also accepted on main; product implementation remains a future separate chantier.

See:
- [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
- [UX-First Trading Terminal Program](ux-program.md)
- [ADR-0002 — UX-first sequencing](../decisions/ADR-0002-ux-first-trading-terminal.md)
- [P0 Market Reliability Plan](p0-market-reliability.md)

## Mandatory sequencing gate

No unrelated product chantier starts before the UX-first baseline/contract gate is completed. CI-001 was the explicit cross-cutting infrastructure exception; it is now merged.

Allowed before that gate:
- P0 market/ESI reliability and observability required to establish data truth;
- security and regression fixes;
- documentation and contract work required by the UX program.

Deferred until the UX gate:
- PST-001 IndexedDB decomposition;
- broad UI component decomposition for its own sake;
- generic performance optimization;
- legacy typing cleanup;
- unrelated feature expansion.

## Ordered roadmap

| ID | Status | Goal | Dependencies | Risk | Validation |
|---|---|---|---|---|---|
| CONTEXT-001 | DONE | Establish the first AI-agent repository navigation and active-work governance baseline | current main baseline | stale/dead context can misroute future work | test:context + PR CI + documentation sync |
| CONTEXT-002 | DONE / MERGED | Harden lifecycle, bootstrap protection, functional CI routing and stable integration-state validation | CONTEXT-001 + CI-001 | stale lifecycle metadata or false routing proof can misroute future work | test:context + PR CI + Main Smoke | 
| CONTEXT-003 | DONE / MERGED | Make stable integration-anchor validation robust to shallow post-merge checkouts | CONTEXT-002 | Main Smoke must not fall back to the merge SHA when parent history is shallow | test:context + PR CI + Main Smoke |
| CONTEXT-004 | CLOSING | Read the stable integration anchor from the raw commit object in shallow post-merge checkouts | CONTEXT-003 | Pretty-format and revision traversal must not alter parent visibility in stable proof | test:context + PR CI + Main Smoke |
| DOC-001 | DONE | Reconstruct modular documentation governance | current mission | stale truth if incomplete | docs/link audit + CI |
| E2E-001 | DONE | Establish reproducible local OAuth/browser gate, deterministic CI E2E coverage, and real-CCP smoke | stable auth/ESI | environment-sensitive auth/callback integration | browser E2E + security/API + local CCP smoke |
| UX-00 | DONE | Define and freeze product model, navigation, responsibilities and shared UX vocabulary | current audit | scope drift if implementation starts early | accepted UX contract |
| UX-01 | DONE / EXTERNALLY BOUNDED | Establish market/ESI truth and retrieval observability; reported target-PC issue resolved without a persistent application defect | UX-00 vocabulary; existing ESI boundary | hidden empty/error states; ESI rate limits | caller audit + ERROR/PARTIAL/STALE/429 regression + current functional state |
| UX-02 | DONE / MERGED | Rebuild Mes Ordres as the Operations console | UX-00, UX-01, CI-001 merged | business state fragmentation | UI/browser acceptance |
| FIN-002-RECON | DONE / ACCEPTED | Reconcile and explicitly re-accept the archived Financial Truth semantic boundary | current main + historical evidence | contradictory lifecycle/profitability semantics | accepted financial contract + domain validation |
| UX-03 | P1 / CONTRACT ACCEPTED | Rebuild Portefeuille as Real Portfolio + Proposed Allocation across multiple opportunities | UX-00, UX-01, UX-02 + accepted financial semantics + TASK-01 | misleading allocation / concentration | contract accepted; future engine/UI/scenario tests |
| UX-04 | P1 | Replace manual Journal with ESI-based automatic Performance & Historique | UX-00, UX-01, financial truth, execution data | incorrect attribution | accounting + reconciliation + browser scenarios |
| UX-05 | P1 | Rebuild Paramètres as business Control Center and remove/unwire fake controls | UX-00, engine consumer map, UX-03/04 parameter needs | settings with no effect | consumer matrix + UI tests |
| UX-06 | P2 | Reposition Cockpit as decision-oriented synthesis | UX-02..05 contracts | dashboard duplication | browser workflow acceptance |
| UX-07 | P2 | Responsive/accessibility/interaction hardening across critical workflows | UX-02..06 | broad UI regression surface | browser + targeted accessibility checks |

The order is intentionally product-first. The deferred items are not cancelled; they are blocked by the sequencing gate until their dependencies become meaningful.

## Cross-cutting infrastructure tracks

These tracks can be prepared in documentation before they are made active. Their presence does not automatically change the active product chantier.

| ID | Status | Goal | Depends on | Priority |
|---|---|---|---|---|
| CI-001 | DONE / MERGED | Refonte du système CI, validation et gouvernance PR | current CI study | maintenance only; follow-up hardening is separate |
| CI-OPS-001 | CANDIDATE / DEFERRED | Project operator CLI with Oclif around the existing CI/PR model | P0 closure; explicit CI-hardening need | maintenance candidate; separate branch/PR |
| PUBLIC-READINESS | ACTIVE MAINTENANCE | Strengthen public repository credibility, security posture, licensing and release/showcase hygiene | public repository state | maintenance track; does not replace UX delivery |

CI-001 remains the stable PR certification base. Agent Context Hardening v2 strengthens lifecycle, bootstrap and routing integrity without replacing that CI architecture. The historical Draft-routing mismatch stays separate unless explicitly activated as its own chantier.

## UX program completion gate

The UX-first program can leave discovery/design only when:
1. product information architecture is accepted;
2. P0 market retrieval is observable and reproducible;
3. Operations, Allocation, Performance and Parameters contracts are implementation-ready;
4. each contract has loading/empty/stale/partial/error behavior;
5. validation scenarios are documented;
6. roadmap/backlog/current-state remain synchronized.

## Definition of Done

Every major chantier must leave the roadmap, current-state, known-gaps and relevant domain/architecture documentation synchronized with its implementation and validation evidence.
