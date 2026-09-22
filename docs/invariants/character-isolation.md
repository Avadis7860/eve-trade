# CHARACTER-ISOLATION-001

Status: STABLE
Scope: private character data and credentials
Implementation: `AuthService`, character gateway/routes, `EsiGateway`
Validation: security, API, ESI and transaction tests

## Rule

A character credential and its private data remain attributable to the correct character principal.

## Why

Cross-character contamination can corrupt wallet, orders, transactions and execution attribution.

## Failure Mode

Reusing a token across principals, merging private cache entries or inferring ownership from an observer.

## Enforcement

Principal-aware ESI context, credential validation and explicit character IDs.

## Regression Coverage

Character route contract, security hardening and ESI gateway tests.
