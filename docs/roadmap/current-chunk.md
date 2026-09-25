# Current Chunk

Status: ACTIVE
Scope: CONTEXT-005 — Reconcevoir le cycle de vie et la certification du manifeste current-work
Branch: chore/context-005-lifecycle-certification
Base: main @ 96797a2566496f097ddc6d075786addb8e7ce78d
PR: #128

## Delivery status

The governance hardening chantier is active. Its goal is to make the `current-work` lifecycle explicit and certifiable before merge, without post-merge recovery commits.

## Contract

- Draft PR / iteration: `current-work.state=ACTIVE`.
- Ready for Review / merge-ready certification: `current-work.state=CLOSING`.
- Both states require matching branch, PR number and base SHA.
- Stable `main` keeps `CLOSING` and validates the first parent of its merge commit.
- Main Post-Merge Smoke remains a second proof, not a recovery mechanism.

## Scope guard

No product implementation.
No Financial Truth changes.
No ESI source changes.
No archive resurrection.
CI-002 (#112) remains separate from this lifecycle-safety chantier.

## Exit gate

The lifecycle transition contract, PR event coverage, context-integrity enforcement, regression tests and context documentation must all be green before merge. No post-merge closing PR is allowed to be required by this chantier.

## Next-step boundary

After CONTEXT-005 is merged and Main Smoke is green, the one-chantier rule may open the next explicitly selected issue.
