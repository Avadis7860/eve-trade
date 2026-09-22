# Prediction

Status: IMPLEMENTED
Scope: features, scoring and statistical prediction
Source of truth: `src/engine/features.ts`, `src/engine/scoring.ts`, `src/engine/prediction.ts`
Implementation: feature/scoring/prediction engines
Tests: `scoring_and_prediction.test.ts`

## Current behavior

The prediction layer derives temporal market features, opportunity sub-scores and survival/profit realization estimates. It is meant to complement observed data, not overwrite deterministic market, route or accounting facts.

Calibration improves only as valid historical observations accumulate.
