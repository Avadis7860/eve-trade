# Catalog

Status: STABLE
Scope: canonical market-type catalogue
Source of truth: `src/domain/catalog/*`, `src/data/catalogManifest.ts`
Implementation: `CatalogRepository`, `CatalogValidator`, `TypeCatalogService`
Tests: catalog integrity, type catalog, catalog/universe truth
CI gate: truth gate + unit suite

## Purpose

Provide one trusted source for market type identity, names and metadata.

## Current behavior

The canonical manifest expects version `2026.09.20.1`, 20,526 items and checksum `855ac7ea679dccb939696874456975e4c80be8f5ecd72c0c142a01c6548abfb3`. The repository rejects empty, partial, oversized or checksum-mismatched canonical data.

Fallback data is explicit and degraded; it cannot silently become canonical.

## Dependencies

Static JSON, catalog hashing/validation, optional server/IndexedDB sources and ESI lookup for dynamic resolution.

## Known limitations

A fallback/partial catalogue remains a degraded state and must not be presented as canonical completeness.

## Related

[Catalog contract](../contracts/catalog.md) · [data semantics](../invariants/data-semantics.md)
