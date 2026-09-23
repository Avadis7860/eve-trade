# Current Chunk

Status: COMPLETE
Scope: E2E-001 — Reproducible Local OAuth / Browser Gate
PR: #46 — merged to `main`
Merge: `9438bbedb2d44cf3f5f371144bcf72094955cd46`
Objective: establish deterministic browser proof of the existing SSO → callback → session → authenticated ESI path, plus a separate real-CCP smoke procedure.

## Completed proof

- real Playwright browser reaches the SSO popup path through `SsoConnectCard`;
- real application callback and `postMessage` composition with a server-owned authorization-code exchange;
- popup-blocked same-window callback recovery;
- session persistence/restoration;
- authenticated character and corporation ESI path through real application routes/gateways;
- browser-level popup, state, OAuth-error, refresh, logout, popup-blocked recovery and multi-character isolation coverage;
- deterministic CI execution without CCP credentials;
- target-PC real-CCP smoke executed successfully on 2026-09-23.

## Validation

The unit/API/security/ESI/corporation/build gates remain green, the deterministic browser gate is green, and the real CCP SSO/ESI acceptance is PASS.

## Completion

E2E-001 is closed. No blocker remains on the authentication/browser acceptance track.

## Next chantier

PST-001 — Decompose the IndexedDB implementation without semantic drift.
