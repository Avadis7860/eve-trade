# Execution

Status: IMPLEMENTED / SEMANTIC REBASE REQUIRED
Scope: execution lifecycle from observed opportunities to economic outcomes
Source of truth: current execution outcome primitives and FIN-001/FIN-002 target contract
Implementation: correlation/outcome/tracking
Tests: execution suites; additional FIN-001/FIN-002 scenarios required

## Boundary

Execution observation is not financial accounting.

The model must keep separate:

- prospective opportunity;
- market-order observation;
- economic transaction;
- acquisition position;
- realized disposal allocation.

A market order's `is_buy_order` describes the order-book side. It does not determine whether the trader acquired or disposed of inventory.

## Position lifecycle

The financial position lifecycle is:

`OPEN -> PARTIALLY_REALIZED -> CLOSED`

A partial transaction can create a realized allocation while leaving remaining inventory open.

Execution status must not be interpreted as proof of financial closure unless the relevant acquisition position has zero remaining quantity.

## Correlation

Order IDs may provide corroborating market provenance when available. Wallet transactions remain the accounting source for acquisition/disposition facts; missing order IDs must not be synthesized.

See [Financial Truth](../finance/financial-truth.md), [ADR-0003](../../decisions/ADR-0003-economic-position-and-order-model.md), FIN-001 / #72 and FIN-002 / #74.
