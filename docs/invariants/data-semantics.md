# DATA-SEMANTICS-001

Status: STABLE
Scope: santé et complétude des données
Implementation: `src/engine/failureSemantics.ts`, `src/services/esi.ts`
Validation: market quality, ESI and data-contract tests

## Rule

Les états de santé, fraîcheur, complétude et validation ne doivent pas être fusionnés en une simple présence/absence de tableau.

## Why

Une collection vide peut être parfaitement disponible ; une collection indisponible ne signifie pas absence d'activité.

## Failure Mode

Converting PARTIAL/UNAVAILABLE/ERROR to EMPTY creates false zero-activity signals.

## Enforcement

Service results and business consumers must preserve explicit state.

Numeric values follow the same rule:

- a valid zero remains `0` when zero is contractually meaningful;
- missing, invalid or unavailable data remains `null`/explicit failure and is never fabricated as `0`;
- physical quantities such as item volume never receive arbitrary fallback values;
- ratios require a valid denominator and remain unavailable when it is missing;
- provenance (`source_kind`, `source_id`, `principal_scope`) must survive financial projections and aggregations.

## Regression Coverage

ESI collection tests, market quality tests and API/ESI boundary suites.
