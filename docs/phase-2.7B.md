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

Implemented and hardened on the Phase 2.7B branch:
- immutable graph domain contract;
- canonical graph builder validation;
- deterministic BFS route engine;
- ordered traversal preservation;
- complete-path security evaluation;
- `SAFE / NON_SAFE / UNKNOWN` semantics;
- fail-closed partial-graph semantics;
- route certification;
- graph/dataset provenance identity checks;
- deterministic regression coverage;
- canonical SDE importer.

Not yet integrated into the financial runtime:
- a checked-in/generated canonical New Eden graph artifact;
- `UniverseGraphRepository` loading that real artifact in production;
- replacement of `UniverseRepository.getRoute()`'s legacy `KNOWN_ROUTES` implementation;
- adaptation of `JumpRoute` so the certified route becomes the sole financial route contract;
- wiring `InterRegionalResolver` to consume only certified graph routes;
- end-to-end regression proving that unknown/unqualified routes cannot reach the financial core.

These steps are intentionally blocked until a real SDE build is imported and validated. No synthetic topology is permitted to unblock them.

## Legacy route table

`src/data/universe.ts` remains compatibility data only during this transition.

It must not be extended and must not be treated as a graph source. The final integration must remove route resolution responsibility from `KNOWN_ROUTES` rather than wrapping it with a new abstraction.

## Validation policy

Phase 2.7B must validate graph construction, pathfinding, security traversal, certification, UNKNOWN semantics and determinism before touching financial behavior.

Browser product E2E is intentionally out of scope for this phase. OAuth/SSO remains a separate prerequisite for future browser validation.
