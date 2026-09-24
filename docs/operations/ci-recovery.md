# CI Recovery Runbook

Status: ACTIVE — current CI operations

## Evidence rule

Certification evidence is valid only for the exact current head SHA of the active PR or the exact commit SHA stated by the Main/Full run.

An obsolete, cancelled or superseded run is not certification evidence for a newer head.

## Failure classification

1. Identify the first actually failing job on the current head.
2. Classify it as functional regression, CI/meta-CI contract regression, routing/scope defect, cancellation/concurrency artifact, SDE-specific failure, or transient infrastructure failure.
3. Preserve the failing log as evidence before changing the branch.

## Recovery rules

- Never use `|| true`, an unconditional skip, or a success conversion to hide a failed invariant.
- A genuinely transient infrastructure failure may be rerun on the same current head; the rerun does not change the head being certified.
- A real functional or CI contract failure must be fixed on the current dedicated branch/PR for that chantier, then a new head must be certified.
- Do not create a second PR or branch solely to obtain another CI signal.
- After any push, discard certification evidence from older heads and re-evaluate only the newest current head.

## Main post-merge failure

If `CI / main-smoke` fails after a merge, preserve the failing evidence, identify the broken invariant, and use the repository's normal reviewed revert/rollback process. Do not weaken `CI / required-gate` or remove the underlying validation.

## Full certification

`CI Full Repository Certification` is scheduled/manual and must complete all declared lanes. Its `full-gate` records the certified commit through `github.sha`. A cancelled or incomplete Full run is not a successful Full certification.

## Governance

> One chantier = one active branch = one active PR.

CI-001 is closed. New CI corrections must use a new dedicated maintenance branch and PR.