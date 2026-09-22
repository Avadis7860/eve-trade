> **Historical**
> Date archived: 2026-09-23
> Superseded by: Historical Phase 2.7B report; current Universe truth is docs/domains/universe.md.
> Relevant only for: development history and migration traceability.
>
# Phase 2.7B — Universe Graph & Route Engine

## Architectural objective

Replace the historical hub-pair route table with a canonical graph derived from EVE's Static Data Export (SDE):

`SDE canonical -> New Eden Universe Graph -> Route Engine -> Certified JumpRoute -> InterRegionalResolver -> CertifiedInterRegionalInputs -> Pure Financial Calculation`

The financial calculation remains untouched.

## Canonical route scope

The route graph is explicitly scoped to **New Eden known space**: solar-system IDs `30,000,000..30,999,999`.

This is deliberate. CCP documents that the SDE contains multiple space classes and identifies New Eden known-space solar systems by this ID range. Wormhole, Abyssal, Void and hidden-space systems are therefore not silently mixed into the market route graph.

CCP's route-calculation documentation identifies `mapSolarSystems` and `mapStargates` as the SDE inputs for a New Eden route graph.

## Route truth

A route is not represented by a precomputed distance, a pair-specific lookup, or a guessed connection.

Every certified route retains:
- ordered traversed solar systems;
- canonical security status for every traversed solar system;
- jump count derived from the ordered path;
- safety classification;
- graph version/checksum;
- dataset version/checksum;
- provenance.

A missing security value is `UNKNOWN`. It is never converted to `0`, `-1`, or a safe value.

## Safe-route invariant

A route is `SAFE` only when **every** system in the traversed path has canonical security status `>= 0.5`.

A single traversed system below `0.5` makes the route `NON_SAFE`.

A missing security value makes the route `UNKNOWN` and therefore non-certifiable.

## Partial graph invariant

A partial graph cannot prove:
- reachability;
- shortestness;
- absence of a shorter path;
- absence of an undiscovered unsafe intermediate system.

Therefore **no route from a partial graph is allowed to expose a usable jump count**. The route engine returns `UNKNOWN` with `jumps: null`, even when the observed subgraph happens to contain a path.

Certification independently rejects partial provenance and verifies that route provenance exactly matches the graph identity.

## Determinism

Adjacency lists are sorted by system ID and pathfinding uses deterministic breadth-first traversal. Repeated executions over the same complete graph therefore produce the same ordered shortest path.

## Canonical artifact generation

The repository contains a deterministic importer:

`node scripts/build-universe-graph.mjs <sde-directory> <output-json> <sde-build>`

The importer:
1. parses the official JSONL files;
2. keeps only New Eden known-space system IDs;
3. rejects malformed/unsafe system identifiers and security values;
4. rejects duplicate New Eden system IDs;
5. rejects gates crossing the New Eden graph boundary;
6. rejects gates referencing absent systems;
7. rejects self-loops;
8. rejects asymmetric directed topology;
9. sorts nodes and edges canonically;
10. computes a graph SHA-256 from the normalized graph;
11. computes a dataset SHA-256 from the source file bytes plus the explicit route scope;
12. records the exact SDE build in graph provenance.

No topology is inferred from names, coordinates, region membership, ESI responses or the legacy route table.

## Current implementation state
Implemented and hardened across Phase 2.7B and Phase 2.7C:
- immutable graph domain contract;
- canonical SDE graph builder validation;
- real CCP SDE artifact for build `3503375`;
- deterministic SHA-256 graph and source identity checks;
- deterministic SHORTEST route engine;
- constrained SAFE route engine;
- destination route indexing for repeated order-range checks;
- ordered traversal preservation;
- complete-path security evaluation;
- `SAFE / NON_SAFE / UNKNOWN` semantics;
- fail-closed partial-graph semantics;
- certified route provenance;
- explicit `CertifiedJumpRoute -> JumpRoute` financial adapter;
- production `UniverseRepository.getRoute()` resolution from the canonical SDE graph;
- `InterRegionalResolver` integration with SAFE trade routes and indexed SHORTEST range checks;
- legacy `KNOWN_ROUTES` route authority removed;
- end-to-end regression proving canonical routes cannot be bypassed at the financial boundary.

The runtime graph currently contains 5,485 New Eden systems and 13,978 directed stargate edges. Its canonical graph checksum is:
`5465da368fa3b6bf03d610554de453af1c54182199d325fe318d431d29225b3c`.

The pinned artifact is intentionally verified in CI by reproducibly regenerating it from the same CCP SDE build. CI does not silently rewrite the branch.

## Legacy route table

The historical `KNOWN_ROUTES` table has been removed from `src/data/universe.ts`. Route resolution is exclusively graph-backed.

## Validation policy
## Validation policy

Phase 2.7B must validate graph construction, pathfinding, security traversal, certification, UNKNOWN semantics and determinism before touching financial behavior.

Browser product E2E is intentionally out of scope for this phase. OAuth/SSO remains a separate prerequisite for future browser validation.
