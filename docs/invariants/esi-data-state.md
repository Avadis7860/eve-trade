# ESI-DATA-STATE-001

Status: STABLE
Scope: character collection acquisition
Implementation: `src/services/esi.ts`
Validation: ESI service and gateway suites
CI gate: ESI gate

## Rule

`AVAILABLE`, `EMPTY`, `PARTIAL`, `UNAVAILABLE` and `ERROR` are distinct states.

## Failure Mode

A transport, authorization or partial-data failure becomes an empty collection and creates a false zero-activity signal.

## Enforcement

`EsiCollectionResult` preserves HTTP status and explicit state. `requireUsableCollection()` only releases AVAILABLE/EMPTY data to business consumers.

## Regression Coverage

Populated, empty, partial, 304/204, missing credential, 403 and malformed-response cases.
