# Documentation EVE Trade

> Bootstrap minimal : \`state/current-state.md\` → \`state/truth-matrix.md\` → \`roadmap/master-plan.md\` → domaine concerné.

| Zone | Question |
|---|---|
| [state](state/) | Où en est réellement le projet ? |
| [architecture](architecture/) | Comment le système est-il structuré ? |
| [domains](domains/) | Que fait le domaine ? |
| [contracts](contracts/) | Quel est le contrat normatif ? |
| [invariants](invariants/) | Quelles règles doivent rester vraies ? |
| [validation](validation/) | Comment la garantie est-elle prouvée ? |
| [roadmap](roadmap/) | Quel chantier vient ensuite ? |
| [operations](operations/) | Comment développer ou diagnostiquer ? |
| [decisions](decisions/) | Pourquoi cette décision existe-t-elle ? |
| [audits](audits/) | Quels audits sont actifs ou historiques ? |
| [archive](archive/) | Quels documents ne sont plus actifs ? |

## Current product governance

The current product sequence is governed by:
- [UI/UX Product Audit](audits/ui-ux-product-audit-2026-09-23.md)
- [UX-First Trading Terminal Program](roadmap/ux-program.md)
- [ADR-0002 — UX-first sequencing](decisions/ADR-0002-ux-first-trading-terminal.md)

The CI delivery model now also has a dedicated study and plan:
- [CI Management Audit](audits/ci-management-audit-2026-09-23.md)
- [CI-001 — Refonte du système CI](roadmap/ci-management-refactor.md)
- [CI Validation](validation/ci.md)
- [Public Readiness Audit](audits/public-readiness-audit-2026-09-24.md)
- [Public Readiness Roadmap](roadmap/public-readiness.md)

A chantier must normally be understood with 2 to 5 specialized documents. The UX program remains the sequencing authority for product delivery. CI-001 is merged and stable; its remaining hardening items are tracked separately. Public Readiness is a maintenance track for the new public repository.

Voir [documentation-guide.md](documentation-guide.md) pour la gouvernance.
