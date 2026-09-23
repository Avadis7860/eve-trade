# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: tracked roadmaps and code
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The functional E2E-001 baseline is stable and merged. The next product priority is now the UX-first trading terminal program established by the 2026-09-23 UI/UX audit.

The application has mature market, ESI, finance, order, prediction and portfolio foundations, but the presentation layer does not yet expose them as a coherent trading workflow.

See:
- [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
- [UX-First Trading Terminal Program](ux-program.md)
- [ADR-0002 — UX-first sequencing](../decisions/ADR-0002-ux-first-trading-terminal.md)

## Mandatory sequencing gate

No unrelated chantier starts before the UX-first baseline/contract gate is completed.

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
| DOC-001 | DONE | Reconstruct modular documentation governance | current mission | stale truth if incomplete | docs/link audit + CI |
| E2E-001 | DONE | Establish reproducible local OAuth/browser gate, deterministic CI E2E coverage, and real-CCP smoke | stable auth/ESI | environment-sensitive auth/callback integration | browser E2E + security/API + local CCP smoke |
| UX-00 | DONE | Define and freeze product model, navigation, responsibilities and shared UX vocabulary | current audit | scope drift if implementation starts early | accepted UX contract |
| UX-01 | P0 / IMPLEMENTED — VALIDATION OPEN | Establish market/ESI truth, retrieval observability and diagnose target-PC market-order incident | UX-00 vocabulary; existing ESI boundary | hidden empty/error states; ESI rate limits | target-PC smoke + ERROR/PARTIAL/STALE regression |
| UX-02 | ACTIVE | Rebuild Mes Ordres as the Operations console | UX-00, UX-01 | business state fragmentation | UI/browser acceptance |
| UX-03 | P1 | Rebuild Portefeuille as Real Portfolio + Proposed Allocation across multiple opportunities | UX-00, existing portfolio engine | misleading allocation / concentration | engine + UI + scenario tests |
| UX-04 | P1 | Replace manual Journal with ESI-based automatic Performance & Historique | UX-00, financial truth, execution data | incorrect attribution | accounting + reconciliation + browser scenarios |
| UX-05 | P1 | Rebuild Paramètres as business Control Center and remove/unwire fake controls | UX-00, engine consumer map | settings with no effect | consumer matrix + UI tests |
| UX-06 | P2 | Reposition Cockpit as decision-oriented synthesis | UX-02..05 contracts | dashboard duplication | browser workflow acceptance |
| UX-07 | P2 | Responsive/accessibility/interaction hardening across critical workflows | UX-02..06 | broad UI regression surface | browser + targeted accessibility checks |
| E2E-002 | DEFERRED | Add critical browser workflows beyond authentication | UX-02..07 | false confidence before UX contracts | browser suite + CI |
| PST-001 | DEFERRED | Decompose IndexedDB without semantic drift | UX baseline + E2E safety net | migration/data-loss risk | persistence + regression |
| UI-001 | DEFERRED | Expose corporation trading scope cleanly in UI | UX-02 and ownership contracts | scope confusion | UI + order scenarios |
| UI-002 | DEFERRED | Decompose oversized frontend components | UX contracts stable | behavior drift | typecheck + regression + E2E |
| PERF-001 | DEFERRED | Measure and optimize initial load/runtime cost | UX structure stable | optimization without product evidence | build + measured evidence |
| TYPE-001 | DEFERRED | Reduce remaining legacy typing/facades where beneficial | preceding work | churn without user value | typecheck + regression |

The order is intentionally product-first. The deferred items are not cancelled; they are blocked by the sequencing gate until their dependencies become meaningful.

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
