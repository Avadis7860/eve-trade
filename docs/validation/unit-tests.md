# Unit and Domain Tests

Status: STABLE
Scope: deterministic engine/service regressions
Source of truth: `package.json` test script and `src/**/__tests__/`
Implementation: individual engine/service suites
CI gate: `npm test`

## Core areas

The current test command covers order identity/scoping, corporation normalization, financial configuration/engines/realized accounting, market quality, execution correlation/outcomes/tracking, prediction/scoring, property invariants, catalog/universe truth, evidence/observations, transactions/persistence, character/corporation treasury, inter-regional purity and route resolution.

## Rule

Use the smallest targeted suite during iteration, then the full `npm test` gate before PR completion.
