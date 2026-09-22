# ADR-0001 — Modular Documentation Architecture

Status: Accepted
Date: 2026-09-23

## Context

The repository had several large documents mixing architecture, contracts, invariants, validation, roadmap and historical audits. This increased context cost and made stale statements easy to confuse with current truth.

## Decision

Use a segmented documentation tree where each active document has one primary question and one responsibility. State, architecture, domains, contracts, invariants, validation, roadmap, operations, decisions and archives have separate surfaces and indexes.

The code and tests remain the implementation truth. Normative documentation has one canonical home and related documents link to it.

## Consequences

Future agents can load a small path of specialized documents instead of the full historical corpus. Contract changes require synchronized code/test/document updates. Historical audits are retained without remaining on the active navigation path.

## Related

[Documentation guide](../documentation-guide.md) · [Documentation index](../index.md)
