# Master Plan

Status: CURRENT
Scope: strategic sequencing only
Source of truth: current code/tests/CI and state documents
Implementation: GitHub Issues, PRs and current repository tree
Validation: each chantier owns its validation gate
CI gate: PR CI

## Current state

The functional E2E-001 baseline is stable and merged. CI-001 is complete. UX-02 is merged and UX-01/P0 is closed. Agent-context navigation and CI integrity rules are stable. Active delivery administration is handled in GitHub rather than mirrored here.

The application has mature market, ESI, finance, order, prediction and portfolio foundations, but the presentation layer does not yet expose them as a coherent trading workflow.

The Financial Truth semantic boundary is integrated and accepted on main. The UX-03 Allocation / Portfolio contract is accepted, with its preparatory Tasks #85–#87 completed. The next explicitly sequenced review work is Issue #88. FIN-002 / Performance & Trade Analytics (#74) remains open/deferred as a separate Performance/Analytics follow-up.

Strategic roadmaps describe sequencing and dependencies; active execution details remain in GitHub Issues.

See:
- [UI/UX Product Audit](../audits/ui-ux-product-audit-2026-09-23.md)
- [UX-First Trading Terminal Program](ux-program.md)
- [ADR-0002 — UX-first sequencing](../decisions/ADR-0002-ux-first-trading-terminal.md)
- [P0 Market Reliability summary](p0-market-reliability.md)

## Mandatory sequencing gate

No unrelated product chantier starts before the UX-first baseline/contract gate is completed.

Allowed supporting work:
- market/ESI reliability and observability;
- security and regression fixes;
- documentation and contract work required by the active UX program.

Deferred until their dependencies are meaningful:
- PST-001;
- broad UI component decomposition;
- generic performance optimization;
- legacy typing cleanup;
- unrelated feature expansion.

## Ordered roadmap

| ID | Status | Goal | Dependencies | Validation |
|---|---|---|---|---|
| CONTEXT-001 | DONE | AI-agent repository navigation and delivery governance baseline | current main baseline | context + PR CI |
| CONTEXT-002..004 | DONE / MERGED | Context lifecycle and stable-anchor hardening | prior context baseline | context + Main Smoke |
| DOC-001 | DONE | Modular documentation architecture | current mission | docs/link validation |
| E2E-001 | DONE | Reproducible OAuth/browser baseline | stable auth/ESI | browser + security/API |
| UX-00 | DONE | Product model and information architecture | current audit | accepted UX contract |
| UX-01 | DONE / EXTERNALLY BOUNDED | Market truth and retrieval observability | UX-00 | market failure regression |
| UX-02 | DONE / MERGED | Operations decision workflow | UX-00/01 | browser acceptance |
| FIN-002-RECON | DONE / ACCEPTED | Financial Truth semantic reconciliation | current main + historical evidence | financial contract |
| FIN-002-ANALYTICS | OPEN / DEFERRED | Remaining Performance/Trade Analytics alignment | FIN-002-RECON | accounting + reconciliation |
| UX-03 | P1 / CONTRACT ACCEPTED | Real Portfolio + Proposed Allocation | UX-00/01/02 + accepted finance semantics | Issues #85–#92 |
| UX-04 | P1 | Performance / Historique | UX contracts + FIN-002-ANALYTICS | Issue #120 |
| UX-05 | P1 | Business Control Center | UX-03/04 parameter needs | Issue #121 |
| UX-06 | P2 | Decision-oriented Cockpit | UX-02..05 | Issue #122 |
| UX-07 | P2 | Responsive/accessibility hardening | UX-02..06 | Issue #123 |

The order is strategic. Execution sequencing, task phases and acceptance checklists belong to the corresponding GitHub Issues.

## Cross-cutting infrastructure tracks

| ID | Status | Goal | Priority |
|---|---|---|---|
| CI-001 | DONE / MERGED | Stable CI certification architecture | maintenance only |
| CI-OPS-001 | CANDIDATE / DEFERRED | Optional operator CLI | maintenance candidate |
| PUBLIC-READINESS | ACTIVE MAINTENANCE | Public repository credibility | maintenance track |

## UX program completion gate

The UX-first program can leave discovery/design only when:
1. product information architecture is accepted;
2. P0 market retrieval is observable;
3. Operations, Allocation, Performance and Parameters contracts are implementation-ready;
4. each contract has explicit degraded-state behavior;
5. validation scenarios exist in the corresponding Issues;
6. strategic roadmap and backlog remain synchronized with those Issue references.

## Definition of Done

Every major chantier must leave durable strategic documentation synchronized with its implementation and validation evidence. The chantier's living plan and progression remain in its GitHub Issue and PR.
