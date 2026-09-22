# Phase 2.7B — Universe Graph & Route Engine

## Architectural objective

Replace the historical hub-pair route table with a canonical graph derived from EVE's Static Data Export (SDE):

\`SDE canonical universe -> Universe Graph -> Route Engine -> Certified JumpRoute -> InterRegionalResolver -> CertifiedInterRegionalInputs -> Pure Financial Calculation\`

The financial calculation remains untouched.

## Route truth

The graph is built from canonical solar-system nodes and canonical stargate topology. A route is not represented by a precomputed distance, a pair-specific lookup, or a guessed connection.

Every certified route retains:

- ordered traversed solar systems;
- canonical security status for every traversed system;
- jump count derived from the ordered path;
- safety classification;
- graph version/checksum;
- dataset version/checksum;
- provenance.

A missing security status is \`UNKNOWN\`. It is never converted to \`0\`, \`-1\`, or a safe value.

## Safe-route invariant

A route is \`SAFE\` only when **every** system in the traversed path has canonical security status \`>= 0.5\`.

A single system below \`0.5\` makes the route \`NON_SAFE\`.

A missing security value makes the route \`UNKNOWN\` and therefore non-certifiable as safe.

## Determinism

The graph adjacency lists are sorted by system ID and pathfinding uses deterministic breadth-first traversal. Repeated executions over the same graph therefore produce the same ordered shortest path.

## Canonical artifact generation

The repository now contains a deterministic importer:

\`node scripts/build-universe-graph.mjs <sde-directory> <output-json> <sde-build>\`

It consumes only:

- \`mapSolarSystems.jsonl\` for canonical systems/security;
- \`mapStargates.jsonl\` for canonical topology.

The importer rejects:

- unknown system references;
- self-loop stargates;
- non-finite security status;
- asymmetric stargate topology.

The generated artifact records the exact SDE build and a SHA-256 checksum of the normalized graph input.

The importer is deliberately not wired to ESI and does not infer topology from names, regions, distances, or the legacy route table.

## Current integration boundary

The route engine and certification layer are intentionally implemented independently of the existing \`KNOWN_ROUTES\` compatibility table.

The compatibility route table must not be promoted into graph topology. Integration into \`UniverseRepository\` and \`InterRegionalResolver\` will occur only after the canonical SDE stargate artifact is imported and its completeness/checksum have been validated.

This prevents a temporary dataset or inferred topology from becoming financial truth.

## Canonical SDE requirements

CCP's SDE exposes \`mapSolarSystems.jsonl\`, including \`securityStatus\`, and \`mapStargates.jsonl\`, including source and destination system/stargate IDs.

No ESI response is accepted as a substitute for the canonical graph source.
