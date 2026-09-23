# P0-C — Target-PC Market Evidence Bundle

Status: IMPLEMENTATION CERTIFIED / EXTERNAL EVIDENCE PENDING
Date: 2026-09-24
Branch: feat/p0-target-pc-evidence (historical; do not reuse)
Base: main at c0ddc69ef424ed0cfd4de776758166c3ee8c1abe
Merge: PR #67 → main at 31308676ec2d9104f7c6ffab29dae1e3f4f49a00
Certification: CI #719 · SDE #480 · Main Smoke #8

## Purpose

Provide one reproducible, non-secret evidence artifact for the reported target-PC market-order retrieval incident.

The export is repository-side evidence only. It does not infer CCP/ESI behavior and it does not contain access tokens.

## Exported bundle

The Market Data Health surface can export a JSON bundle with:

- UTC capture timestamp;
- selected item name and type ID;
- current application path;
- browser user-agent, language and timezone;
- canonical market request template;
- one record per active hub;
- health state (LIVE, CACHE, STALE, PARTIAL, UNKNOWN, ERROR);
- source/freshness/data state/completeness/validation;
- fetch age and timestamp;
- fetched/expected pagination;
- order counters;
- last HTTP status;
- cache status;
- ESI error-budget remaining/reset;
- Retry-After when present;
- last error when present.

Authentication headers, access tokens and bearer credentials are intentionally excluded.

## Target-PC procedure

On the affected PC:

1. Reproduce the market-order retrieval problem with the normal application flow.
2. Leave the Market Data Health strip visible in the affected state.
3. Use Exporter preuve P0-C.
4. Preserve the generated JSON file unchanged.
5. Record the UTC timestamp at which the failure was reproduced if the export was triggered after the request.
6. Repeat the same market request from a controlled comparison environment and record whether it succeeds.

The export currently records the comparison field as not_recorded; this is deliberate because the application cannot establish an external comparison result by itself.

## Classification gate

P0-C is complete only when:

- the export itself is validated by unit tests;
- the browser workflow can generate the bundle;
- the affected-PC bundle is captured against real CCP/ESI;
- the controlled comparison result is documented;
- the incident can be classified as either ROOT-CAUSED or EXTERNALLY BOUNDED.

Until then the target-PC incident remains NOT ROOT-CAUSED.

## Evidence boundary

This increment closes a tooling gap, not the external incident. A successful export proves that the application can serialize its observed repository-side state; it does not prove that CCP/ESI is responsible for the observed failure.
