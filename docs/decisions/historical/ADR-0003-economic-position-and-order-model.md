# ADR-0003 — Economic Transactions, Acquisition Lots and Canonical Market Orders

Status: HISTORICAL / NOT ACCEPTED AS CURRENT NORMATIVE DECISION
Source: archive/ux-03-allocation-contract-2026-09-24 at 75df2e8f77d8ccc0cd5a2a631661902d1b54fab6
Recovered from the historical agent-context commits listed in the current context map.

## Purpose

This document preserves an important financial/domain decision record found in the archived UX-03 work. It exists so future agents can understand why the archive was not copied into main and which decisions still require explicit re-acceptance.

## Historical decisions worth preserving

1. MarketOrder is the canonical market-order entity. A compatibility alias must not become a second order species.
2. Economic acquisition/disposition direction comes from economic transaction facts, not from the market order side. A trader can acquire by taking an existing SELL order and later dispose of the inventory through a SELL order.
3. Economic ownership, observing principal and issuer are separate axes. Character and corporation are scope/provenance dimensions, not automatically separate accounting ledgers.
4. Order ID is canonical CCP provenance when available, but an order ID must never be invented from unrelated wallet/journal identifiers or temporal proximity.
5. Acquisition lots and disposal allocations provide the causal boundary for realized results. A partial disposal realizes only the quantity actually disposed while the remaining quantity stays economically open.
6. Realized disposal P&L, cumulative cash recovery, lifecycle state and any unrealized/current-market valuation are separate measures.
7. A position lifecycle is OPEN -> PARTIALLY_REALIZED -> CLOSED. Closure follows remaining economically open quantity and is independent of fee availability.
8. Source coverage, freshness and data health remain orthogonal to economic ownership and accounting lifecycle.
9. Future PI/Industry/internal-transfer origins should enter the same generic economic-source to acquisition-lot pipeline rather than creating a second financial engine.

## Historical partial-disposal example

For 10,000 units acquired at 100 ISK followed by one unit disposed at 140 ISK:

- the disposed unit can show +40 ISK gross realized P&L;
- 9,999 units remain open;
- the lifecycle remains PARTIALLY_REALIZED;
- acquisition capital recovered through observed disposal revenue is 140 ISK;
- the unrecovered capital is 999,860 ISK before considering other activity.

The example demonstrates why a positive result on one disposal cannot silently become whole-position ROI.

## Explicit reconciliation still required

The archived financial contract also introduced progressive recovery states that allowed a partially realized position to be labelled RECOVERED or POSITIVE when cumulative recovery crossed a threshold.

The more recent owner requirement is stronger: a complete economic operation is not considered positive or complete while its economic position remains open, even when an individual disposal is profitable.

These semantic directions must not be silently merged.

This historical record therefore does not select a winner. It records an unresolved contract decision that must be explicitly accepted before new financial implementation.

## Re-entry gate

Before any future FIN-002 or other financial implementation:

- re-derive the current canonical implementation from main;
- explicitly decide the relationship between disposal-level realized P&L, cumulative capital recovery, position lifecycle and whole-operation profitability;
- define the scope and denominator of every ROI or profitability KPI;
- preserve FACT / DERIVED / AGGREGATED / NEW SOURCE / POLICY distinctions;
- keep UNKNOWN / PARTIAL / ERROR / ABSENT / UNAVAILABLE out of numeric business-zero semantics;
- preserve source_kind, source_id and principal scope without inventing causal links;
- add contract tests and a CI ownership path before changing financial code.

This record is not authorization to implement the historical model.
