# Incident Guide

Status: CURRENT
Scope: high-value failure patterns

## ESI 420/429

Preserve upstream status and Retry-After semantics. Respect the ESI error budget.

## OAuth failure

Inspect state validation, credential identity and refresh lifecycle. Never accept a missing/foreign character credential as a valid private request.

## Data degradation

Distinguish EMPTY, PARTIAL, UNAVAILABLE and ERROR. A transport failure is not zero activity.

## Financial anomaly

Inspect Financial Truth first. Do not add a parallel FIFO or fabricate missing costs/fees in a consumer.
