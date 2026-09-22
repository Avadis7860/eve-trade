# Catalog Contract

Status: STABLE
Owner: catalog domain
Implementation: `src/domain/catalog/CatalogRepository.ts`, `CatalogValidator.ts`, `src/data/catalogManifest.ts`
Validation: catalog integrity/truth tests

## Purpose

Define the canonical identity and trust boundary for the market-type catalogue.

## Contract Shape

The canonical manifest fixes version, expected cardinality, checksum, source path and artifact identity.

## Semantic Rules

Canonical readiness requires exact expected count, exact canonical checksum and successful structural validation. Fallback/partial sources are explicitly degraded and cannot silently become canonical.

## Failure Semantics

Empty, partial, oversized, malformed or checksum-mismatched catalogues are not certified as canonical.
