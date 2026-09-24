# Agent Context & Change Navigation

Status: STABLE
Scope: developer and AI navigation metadata
Navigation source: `.eve-trade/context-map.json`
Validation: `npm run test:context`

## Purpose

This layer reduces context reconstruction cost as EVE Trade grows. It is navigation metadata, not business truth.

Authority remains: implementation and certified tests, then normative contracts/invariants, then active state/roadmap, then this map.

## Standard workflow

1. Read `docs/state/current-state.md`, `docs/state/truth-matrix.md` and `docs/roadmap/current-chunk.md`.
2. Identify the domain in `.eve-trade/context-map.json`.
3. Read the listed canonical implementation paths first.
4. Read only the listed contracts/invariants needed by the change.
5. Run the listed domain tests before broad validation.
6. Treat hotspots and legacy entries as warnings against opportunistic refactoring or accidental model resurrection.

## Change-impact chain

task -> domain -> canonical source -> contract -> invariant -> tests -> CI -> downstream consumers

## Why this exists

The repository now contains many valid contracts and layers, but the relationship between them was previously reconstructed manually for each task. This file and the machine-readable map make that relationship explicit without creating a second normative source.

## Maintenance rule

Update the context map only when canonical ownership, validation ownership, domain boundaries or legacy replacements change. Do not update it for ordinary implementation-only commits.

The active delivery rule remains one chantier = one branch = one PR.
