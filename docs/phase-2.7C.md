# Phase 2.7C — Real SDE Canonical Universe Integration

## Mission

Turn the Phase 2.7B topology foundation into the **actual production route source** for eve-trade, using a real CCP Static Data Export (SDE) artifact.

Target chain:

`CCP SDE -> validated source manifest -> canonical universe graph artifact -> UniverseGraphRepository -> certified routes -> UniverseRepository -> InterRegionalResolver -> financial calculation`

The financial formulas remain unchanged by this phase.

---

## Why this phase exists

Phase 2.7B delivered and hardened the graph primitives, deterministic BFS, provenance checks and canonical importer scaffolding.

The production runtime is still blocked by four facts:

1. `UniverseRepository.getRoute()` delegates to the legacy `KNOWN_ROUTES` table.
2. No real SDE graph artifact is currently bundled and verified at runtime.
3. The current resolver can request many routes independently, which would make a naive BFS-per-order integration unnecessarily expensive once all regions are supported.
4. The current route certification model validates the generic shortest path and then rejects it when it is unsafe; it does not yet compute the shortest route **under a safety constraint**.

This phase closes those gaps without modifying the financial equations.

---

## Source of truth

The authoritative source is CCP's SDE.

CCP documents that:
- `mapSolarSystems` provides solar systems and security status;
- `mapStargates` provides static solar-system connections;
- New Eden known-space solar-system IDs are `30,000,000..30,999,999`;
- JSON Lines is an official SDE distribution format;
- the official automation endpoint exposes the latest SDE build and versioned download URLs.

The importer must not infer topology from ESI, station names, coordinates, region adjacency, historical route tables or community route databases.

### Build identity rule

The build number must not be manually trusted as a free text label.

The reproducible generation flow must retain:
- exact CCP SDE build;
- exact source file SHA-256 for `mapSolarSystems.jsonl`;
- exact source file SHA-256 for `mapStargates.jsonl`;
- route scope;
- graph checksum;
- graph cardinalities;
- generator/schema version.

The graph checksum authenticates the normalized graph. The source-file checksums authenticate the exact SDE inputs used to build it.

---

## Scope

### Included

- Real SDE acquisition and reproducible import.
- Canonical graph artifact committed to the repository.
- Strong topology/data integrity gates.
- Runtime graph loading and verification.
- Deterministic shortest-route resolution.
- Deterministic shortest-safe-route resolution.
- Efficient batch route lookup for market order-range filtering.
- Explicit migration from legacy route semantics to certified graph routes.
- Regression coverage from SDE input to financial gate.
- CI gates that prevent a stale, incomplete or fabricated graph from reaching production.

### Excluded

- Changes to profit/tax/broker formulas.
- Rework of market-history logic.
- OAuth/SSO E2E.
- New market-risk models based on kill statistics or player activity.
- Automatic use of Ansiblex, Thera or dynamic wormholes.
- Replacement of the canonical location dataset itself unless a failing integration proves it is required.

---

# Workstream 1 — Harden the SDE importer

## 1.1 Refactor the importer into testable layers

Current `scripts/build-universe-graph.mjs` performs parsing, validation, graph construction, hashing and file output in one top-level script.

Refactor into:

- pure parsing/validation functions;
- graph normalization functions;
- checksum functions;
- artifact serialization;
- thin CLI entrypoint.

The CLI must exit non-zero on every integrity failure.

## 1.2 Validate the actual SDE record shape

Hard-require the fields used by the graph:

`mapSolarSystems`
- `_key`
- `securityStatus`

`mapStargates`
- `_key`
- `solarSystemID`
- `destination.solarSystemID`
- `destination.stargateID`

Do not silently coerce malformed values into valid records.

## 1.3 Strengthen topology integrity

In addition to the current checks, verify:

- unique solar-system IDs;
- unique stargate IDs;
- no self loops;
- no edge to an unknown system;
- no cross-scope stargate endpoint;
- reciprocal system-level topology;
- reciprocal stargate-level references where the SDE provides the referenced destination stargate ID;
- no duplicate canonical edge records;
- deterministic ordering.

Where safe and stable against the current SDE schema, cross-check `mapSolarSystems.stargateIDs` against the stargate records rather than relying on a single source file alone.

## 1.4 Preserve full security precision

Store the raw SDE `securityStatus` value.

The route safety threshold remains:

`security_status >= 0.5`

Do not round security for route certification.

Missing security is UNKNOWN.

---

# Workstream 2 — Produce a real canonical artifact

## 2.1 Artifact shape

Create a committed runtime asset, for example:

`src/data/universeGraph.json`

It must contain:

- schema version;
- graph version;
- provenance;
- ordered nodes;
- ordered edges.

The asset must be generated, not hand-authored.

## 2.2 Runtime manifest

Create a small source manifest, for example:

`src/data/universeGraphManifest.ts`

It records:

- CCP SDE build;
- source URL;
- source file checksums;
- graph checksum;
- node count;
- edge count;
- route scope;
- generator version;
- artifact SHA.

The runtime must verify the graph checksum independently; it must never trust the manifest merely because the manifest exists.

## 2.3 Acceptance criteria for the real artifact

The imported graph must prove:

- non-zero node count;
- non-zero edge count;
- every edge references an existing node;
- all graph nodes have valid canonical security values;
- reciprocal topology passes;
- graph checksum recomputes exactly;
- artifact provenance is complete;
- all five configured major market hubs resolve to nodes;
- market-hub source/destination systems are in the graph;
- the major hub pairs have deterministic routes.

Do not commit synthetic graph data as a substitute for the real artifact.

---

# Workstream 3 — Route engine correctness for production

## 3.1 Preserve generic shortest path

The existing BFS remains the baseline for an unconstrained route.

Invariants:

- deterministic neighbor ordering;
- shortest path in jump count;
- stable ordered system path;
- exact jump count = path length - 1;
- UNKNOWN when source/destination is absent;
- UNKNOWN when graph provenance is partial;
- NO_ROUTE only when a complete graph proves the systems are disconnected.

## 3.2 Add shortest-safe-path semantics

For a high-sec route request, the engine must search the subgraph whose traversed systems satisfy:

`security_status >= 0.5`

This is not equivalent to:

1. calculate unrestricted shortest path;
2. inspect safety;
3. reject if unsafe.

The correct algorithm is a constrained BFS.

This distinction is required because an unsafe shortest route may coexist with a longer safe route.

The result must remain deterministic and certifiable.

## 3.3 Keep route policies explicit

Do not globally force SAFE routing onto every consumer.

At minimum keep two explicit policies:

- `SHORTEST`: needed for EVE order-range accessibility;
- `SAFE`: needed for a high-sec-only transport/trade route.

A consumer must declare the policy it requires.

---

# Workstream 4 — Batch route resolution and performance

A production graph makes the naive pattern below unacceptable at scale:

`for each order -> BFS(order.system, destination.hub)`

The market scanner evaluates many items and directed hub pairs. Numeric order-range checks can involve many solar systems.

## Required design

Introduce a route index / cached route tree, with deterministic invalidation by:

- graph version;
- graph checksum;
- route policy;
- destination system.

For a fixed destination:

- perform one reverse/forward traversal as appropriate;
- retain the shortest distance and path metadata;
- answer individual order-range checks in O(1) lookup time.

The index may be built lazily per destination and policy.

The goal is to make repeated `routeBySystemId` access independent of the number of orders once the destination/policy index exists.

## Performance gate

Add regression coverage proving that many route lookups against the same destination do not repeatedly traverse the entire graph.

Do not optimize through unsafe memoization that ignores graph identity or route policy.

---

# Workstream 5 — Certified route -> financial route contract

The new `CertifiedJumpRoute` and legacy `JumpRoute` are not identical contracts.

Do not use casts to bridge them.

## Recommended migration

Derive a financial route explicitly from the certified route:

- `from_system_id` = certified source;
- `to_system_id` = certified destination;
- `jumps` = certified jump count;
- `min_security` = minimum of all traversed canonical security values;
- `is_highsec_only` = certified safety === SAFE;
- `status` = explicit certified/known state;
- `source` = canonical graph;
- `is_verified` = true only after certification;
- `confidence` = 1 only for a fully certified complete graph route;
- `provenance` = graph provenance;
- `chokepoints` and `gank_risk_level` must not be fabricated by the graph adapter.

If the existing `JumpRoute` type needs a status/source expansion, migrate all consumers explicitly and update the tests in the same change.

---

# Workstream 6 — Replace KNOWN_ROUTES in the runtime

Final target:

`UniverseRepository.getRoute()`

must no longer call:

`src/data/universe.ts -> KNOWN_ROUTES -> getJumpRoute()`

Instead:

`UniverseGraphRepository -> RouteEngine -> certifyRoute -> financial route adapter`

The legacy table can remain temporarily for unrelated compatibility data, but it must lose all route-resolution authority.

Do not wrap `KNOWN_ROUTES` behind another function and call that an integration.

After migration:

- arbitrary New Eden system pairs resolve from the graph;
- unknown pairs are UNKNOWN;
- no pair-specific manual route table is required;
- no route with fabricated jumps can enter the financial core.

---

# Workstream 7 — InterRegionalResolver integration

`InterRegionalResolver` must enforce graph certification.

For the main trade route:

- canonical source station;
- canonical destination station;
- certified route;
- explicit route policy;
- verified complete graph;
- finite non-negative jumps.

For destination order-range evaluation:

- use the route index;
- preserve exact EVE order-range semantics;
- UNKNOWN route distance means the order is not proven accessible;
- never substitute zero/negative synthetic distance.

The resolver should remain a certification boundary. The financial engine should remain pure.

---

# Workstream 8 — Regression and proof gates

## Gate A — importer fixtures

Synthetic minimal JSONL fixtures for:

- valid graph;
- malformed system;
- malformed security;
- missing system reference;
- self-loop;
- duplicate system;
- duplicate stargate;
- asymmetric edge;
- invalid reciprocal stargate reference;
- partial/missing source data.

## Gate B — real SDE artifact

The exact current/pinned CCP SDE build must successfully generate the runtime graph artifact.

The CI log must expose:

- build;
- source checksums;
- node count;
- directed edge count;
- graph checksum.

## Gate C — route correctness

Prove:

- one-hop;
- multi-hop;
- same-system;
- disconnected complete graph;
- partial graph UNKNOWN;
- missing system UNKNOWN;
- deterministic repeated results;
- unsafe shortest route;
- longer safe alternative route;
- fully safe route;
- unknown security route rejected by certification.

## Gate D — runtime integration

Prove:

- `UniverseRepository.getRoute()` uses the canonical graph;
- legacy `KNOWN_ROUTES` is not consulted;
- arbitrary valid New Eden pairs resolve;
- hub route provenance is canonical graph provenance.

## Gate E — order-range correctness

Prove:

- station range;
- solar-system range;
- region range;
- numeric range;
- numeric range with UNKNOWN route;
- numeric range with known route outside the allowed jump limit;
- numeric range with a valid route inside the allowed limit.

## Gate F — financial non-regression

Run the complete financial/unit/API/smoke/security/ESI/build suite.

The route migration must not change:

- price ladder formulas;
- quantity constraints;
- fee calculations;
- P&L;
- ROI;
- portfolio math.

Only route truth and accessibility are allowed to change.

---

# Workstream 9 — CI and reproducibility

## CI requirements

The pull request must run:

1. Typecheck frontend.
2. Typecheck backend.
3. Canonical truth tests.
4. SDE importer tests.
5. Route/domain tests.
6. Full unit tests.
7. API integration.
8. Smoke.
9. Security.
10. ESI hardening.
11. Production build.

## SDE refresh policy

Do not make normal PR CI depend on an unpinned "whatever is latest today" graph.

Use:

- a pinned build for the committed artifact;
- an explicit refresh procedure to generate a new artifact;
- a validation gate that prevents accidental mismatch between the recorded build and generated checksums.

A separate scheduled/manual refresh workflow may later automate SDE updates, but it must produce a reviewable diff and must never silently mutate the financial route source.

---

# Workstream 10 — Documentation and cleanup

Update:

- `docs/phase-2.7B.md` from "integration pending" to the actual production state after completion;
- `AGENTS.md` route invariants;
- architecture documentation;
- operational runbook for SDE refresh and checksum verification.

After production integration, remove obsolete route-table code and tests.

The final state must have one authoritative route pipeline.

---

# Ordered implementation plan

### Phase A — Preparation
- Refactor importer into testable units.
- Add stronger SDE/topology validation.
- Add fixture suite.
- Add route policy model.
- Add route-index design and tests.

### Phase B — Real data
- Acquire a specific CCP SDE build through the official distribution mechanism.
- Generate the real graph.
- Validate checksums/cardinality/topology.
- Add the artifact and runtime manifest.

### Phase C — Runtime
- Load the graph through `UniverseGraphRepository`.
- Add shortest-safe path search.
- Add cached/batch route index.
- Implement explicit CertifiedJumpRoute -> JumpRoute migration.
- Replace `KNOWN_ROUTES` in `UniverseRepository`.
- Wire `InterRegionalResolver`.

### Phase D — Proof
- Run route truth gates.
- Run order-range gates.
- Run full financial regression.
- Run complete CI.

### Phase E — Cleanup
- Remove obsolete route resolution code.
- Update documentation.
- Open PR only when all gates are green.

---

# Definition of Done

This phase is complete only when all statements below are true:

- A real CCP SDE build is the source of the committed graph artifact.
- The exact source/build identity is recorded.
- The graph checksum is independently recomputed at runtime.
- The graph passes complete integrity validation.
- Generic shortest routes are deterministic and certified.
- Shortest SAFE routes are computed under the safety constraint, not rejected after the fact.
- Repeated destination route queries use a graph index/cache instead of repeated full BFS.
- `UniverseRepository.getRoute()` no longer depends on `KNOWN_ROUTES`.
- `InterRegionalResolver` accepts only certified canonical routes.
- Numeric order-range filtering remains correct and fail-closed.
- No fabricated route distance can reach the financial engine.
- The complete CI regression gate is green.
- Legacy route-table responsibility is removed.

---

## Current branch

`phase-2.7C-sde-canonical-universe-integration`

Base:

`main` at merge commit `52222919194fae5f08abeae13b4b4997605b0ef3`

No production route behavior is changed by this planning commit.
