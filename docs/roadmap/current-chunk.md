# Current Chunk

Status: ACTIVE DELIVERY
Scope: CONTEXT-005 — rework current-work lifecycle and certification
Branch: chore/context-005-current-work-lifecycle-rework
Base: main @ 96797a2566496f097ddc6d075786addb8e7ce78d
PR: #129
Issue: #126

## Architectural target

CONTEXT-005 separates two different persistence boundaries:

- `.eve-trade/current-work.json` is ephemeral checkout context for an active technical chantier.
- `.eve-trade/stable-context.json` is persistent delivery context for the stable `main` tree.

GitHub remains authoritative for PR administration (Draft, Ready for Review, merge). These administrative states are not duplicated as a local repository state machine.

## Completed in this delivery

- Phase A architectural validation is accepted in issue #126.
- PR #128 is historical evidence only and is not reused.
- `current-work.json` was removed from versioned stable state and is now generated for active PR certification.
- `stable-context.json` was introduced as the persistent stable delivery boundary.
- `context-integrity` now loads active and stable context independently.
- PR #129 is the sole active delivery branch.

## Current phase

### Phase B — Schema boundary

Define the exact fields, allowed lifecycle semantics and persistence rules for both contexts.

### Phase C — Certification

Certify:
- active branch / PR / base SHA coherence;
- stable delivery anchor coherence against the checked-out commit object;
- absence of any requirement for current-work on stable `main`;
- regressions for #105 and #127.

### Phase D — CI

Keep CONTEXT-005 limited to context safety. Draft/Ready routing optimization remains CI-002 / #112.

### Phase E — Documentation

Synchronize the bootstrap, state, roadmap and context procedure with the new boundary.

### Phase F — Reference scenarios

Replay new chantier, documentation metadata, Draft, Ready, synchronize, re-Draft, merge, Main Smoke, next chantier, #105 regression and #127 regression.

## Exit gate

The delivery is complete only when:
- no active context can persist on stable `main`;
- no post-merge cleanup PR is required;
- active certification remains deterministic;
- stable certification validates the persistent delivery anchor;
- Main Smoke remains a second proof;
- CI-002 stays outside scope;
- all bootstrap/state documentation describes the same architecture.
