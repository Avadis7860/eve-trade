# Agent Context & Change Navigation

Status: STABLE
Scope: stable developer and AI navigation guidance
Stable navigation source: .eve-trade/context-map.json
Active work source: .eve-trade/current-work.json
Validation: npm run test:context

## Purpose

This layer reduces context reconstruction cost as EVE Trade grows. It is navigation and governance metadata, not business truth and not a second accounting model.

The context map describes stable repository ownership and validation relationships. The active-work manifest describes only the currently active technical chantier. They must never be treated as interchangeable.

## Standard load order

1. Read .eve-trade/current-work.json to understand the active branch, PR, base and delivery rule.
2. Read docs/state/current-state.md, docs/state/truth-matrix.md and docs/roadmap/current-chunk.md for the current repository state.
3. Read .eve-trade/context-map.json to locate the affected domain, canonical implementation, contracts, invariants, tests and CI owner.
4. Read only the domain sources required by the task.
5. Validate the smallest relevant test set before broad certification.

## Navigation versus truth

The navigation layer can answer where to look. It cannot answer what is true when implementation, tests, CI and normative contracts disagree.

Authority order:
1. normative contracts, invariants and accepted decisions;
2. current implementation, certified tests and CI;
3. current state and roadmap;
4. navigation metadata.

A contradiction must be surfaced and resolved in the authoritative source. Updating the map must never be used to hide a failed test, contradictory implementation or stale normative document.

## Change-impact chain

task -> current work -> repository state -> domain -> canonical source -> contract -> invariant -> tests -> CI lane -> downstream impact

## Stable-map maintenance

Update the context map only when one of these changes:
- canonical ownership;
- domain boundary;
- contract or invariant ownership;
- validation ownership;
- legacy replacement status.

Do not edit the map for ordinary implementation-only changes.

CI lane references are workflow-qualified because job IDs are not globally unique across the repository.

## Active-work maintenance

Update .eve-trade/current-work.json when the active branch, PR, base branch, base SHA or delivery rule changes.

It is expected to be operationally specific to a chantier and must not become a financial or product truth source.

## Historical archive rule

The UX-03 archive is reference material only. Its financial implementation, tests and documents must be re-derived against current main before any future reuse. In particular, historical financial language that conflicts with later owner decisions is recorded as a reconciliation problem, not silently normalized by this navigation layer.
