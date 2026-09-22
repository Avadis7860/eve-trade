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

## Regression Coverage

ESI collection tests, market quality tests and API/ESI boundary suites.
