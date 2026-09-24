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

## Active-work lifecycle

`.eve-trade/current-work.json` is checkout-aware. Its `state` determines whether the branch/PR metadata is active:

- `ACTIVE` — development is in progress on the dedicated branch/PR.
- `CLOSING` — the delivery is frozen for final certification/merge; no new scope is allowed.
- `IDLE` — the stable `main` checkout has no active delivery chantier.

A stable `main` state must never be `ACTIVE`. The last merged delivery may remain represented as `CLOSING` until the next chantier creates a new `ACTIVE` manifest. This avoids requiring an unreviewed post-merge mutation of `main`.

During PR certification, branch, PR number and base SHA must match the GitHub event. In stable mode, the CLOSING manifest carries the pre-merge main integration anchor. Validation checks that this anchor is the first parent of a merge commit (or HEAD for a non-merge stable commit) and that current-state identifies the same anchor. This keeps stable proof deterministic without any post-merge mutation.

## Historical archive rule

The UX-03 archive is reference material only. Its financial implementation, tests and documents must be re-derived against current main before any future reuse. The historical financial decision record and reconciliation memo are explicitly non-normative; the historical progressive-recovery vocabulary is preserved as a contradiction to be resolved before any new financial code.

## CI trigger model

The PR certification workflow is deliberately conservative for context-critical changes.

- Changes under .eve-trade always force the full certification scope.
- Changes to the context integrity script or agent navigation also force full certification.
- Changes to any current file referenced by the stable context map force full certification, including deletion or rename of a referenced contract, invariant or test.
- PR certification runs test:context in active mode and checks the branch, PR number and base SHA carried by current-work.
- Scheduled/manual Full Certification runs test:context in stable mode; it validates the stable map and documents without pretending that the last delivery branch is the current repository branch.
- Ordinary unrelated documentation remains eligible for the existing documentation-only routing.

This routing exists to make context drift visible without running the entire certification surface for every documentation edit.

## Deterministic integrity checks

`npm run test:context` verifies both reference integrity and a limited set of semantic relationships:

- bootstrap files exist and expose the context entrypoints;
- current-work lifecycle state is legal for the certification mode;
- stable-state documentation identifies the stable integration anchor from the checked-out main history;
- every mapped workflow/job exists;
- canonical domain paths route to the expected CI certification family;
- domain-documentation mappings reference known map domains;
- impact-chain edges reference known domains.

This remains intentionally deterministic. It does not claim to detect arbitrary natural-language contradictions or infer dependencies that were never declared.

## Bootstrap ownership

The following files are treated as context-critical inputs rather than ordinary documentation:

`AGENTS.md`, `GEMINI.md`, `CONTRIBUTING.md`, `docs/index.md`, the current-state/roadmap bootstrap, the domain/contract/invariant/validation indexes, this procedure, `.eve-trade/*` and the context integrity/routing scripts.

Changes to this bootstrap surface use the conservative certification path.

## Routing versus ownership

A CI lane reference proves that the workflow/job exists. The integrity check additionally exercises the change classifier with canonical paths in a functional-probe mode that deliberately bypasses the conservative context-critical guard. Each mapped CI lane declares the classification that is supposed to trigger it, so a lane cannot pass merely because the classifier fell back to `ambiguous/full_certification`. The normal production classifier remains conservative.

The context map does not claim that its impact graph is exhaustive. Missing edges are unresolved navigation knowledge, not proof of no downstream consumer.
