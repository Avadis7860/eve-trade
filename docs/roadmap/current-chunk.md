# Current Chunk

Status: CLOSING
Scope: post-merge synchronization of UX-03 / TASK-01
Branch: chore/post-merge-ux03-task01-close
PR: #94

No product implementation chantier is active. This delivery is only closing the repository lifecycle after PR #93.

## Last completed delivery

**UX-03 / TASK-01 — Relecture et rebase du contrat Allocation / Portefeuille**

- Issue: #85
- PR: #93
- Branch: `ux-03/allocation-contract`
- Merge commit: `c338265bd8c844a77082d21893d23fa98235b0da`
- Result: accepted UX-03 Allocation / Portfolio contract
- Scope delivered: documentation/contract only

## Accepted outcomes

- Economic operation is reconstructed from transaction / position lineage, not BUY/SELL order pairs.
- CCP order IDs remain order provenance/correlation only.
- Character, corporation, issuer and observer remain distinct from accounting scope.
- Partial disposal, disposal/allocation ROI, capital recovery and whole-operation profitability remain distinct.
- Whole-operation ROI/profitability is closure-gated.
- EJECT / RETAIN remains a POLICY layer.
- Real Portfolio and Proposed Allocation remain separate.
- FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY boundaries remain explicit.
- UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE / STALE never become numeric zero.

## Archive status

The UX-03 archive remains reference-only. No archived implementation was imported by TASK-01.

## Next-step gate

Any future UX-03 implementation must start as a new chantier from the then-current `main`, with a new branch and a new PR. It must consume the accepted contract rather than reopening the archived implementation.
