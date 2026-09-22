# Treasury

Status: STABLE
Scope: economic capital source selection
Source of truth: `src/engine/treasury.ts`, `src/services/corporationTreasurySync.ts`
Implementation: treasury resolution and corporation wallet provenance
Tests: treasury + corporation treasury synchronization
CI gate: corporation boundary

## Sources

Supported modes are corporation, fleet-consolidated, active-character and manual-budget.

Corporation wallet provenance distinguishes fresh ESI observation, manual value and unavailable state. Unavailable corporation capital is not converted into spendable zero or character capital.

## Boundary

Treasury is funding context. It does not change order ownership, observer identity or transaction provenance.
