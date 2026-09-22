# Universe

Status: STABLE
Scope: New Eden topology, location resolution and route certification
Source of truth: `src/domain/universe/*`, `src/data/universeGraphManifest.ts`
Implementation: `UniverseGraphRepository`, `UniverseRepository`, `RouteEngine`, `RouteCertification`
Tests: route engine, inter-regional route, universe truth
CI gate: truth/SDE tests

## Current behavior

The runtime graph is sourced from CCP SDE build `3503375`, with 5,485 systems and 13,978 directed stargate edges. Graph identity is protected by a manifest and checksums.

`RouteEngine` supports `SHORTEST` and `SAFE` policies. A safe route requires every traversed system, including endpoints, to have security status at least 0.5.

A partial or unknown canonical graph fails closed as `UNKNOWN` rather than inventing reachability.

## Location resolution

`UniverseRepository` resolves stations, hubs, systems, regions and structures while preserving explicit resolution status and completeness.

## Known limitation

Future SDE refreshes must update the pinned build, generated graph and manifest through the SDE gate.
