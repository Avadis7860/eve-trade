# Current Chunk

Status: IN PROGRESS
Scope: E2E-001 — Reproducible Local OAuth / Browser Gate
Branch: `e2e/e2e-001-browser-oauth-gate`
PR: #46
Base: `main` at `a31979c6c76ba93cc19a7437894f3935e69a01c7`
Objective: establish deterministic browser proof of the existing SSO → callback → session → authenticated ESI path, plus a separate real-CCP smoke procedure.

## Proof required

- real Playwright browser reaches the SSO popup path through `SsoConnectCard`;
- real application callback and `postMessage` composition with a server-owned authorization-code exchange;
- popup-blocked same-window callback recovery;
- session persistence/restoration;
- authenticated character and corporation ESI path through real application routes/gateways;
- browser-level popup, state, OAuth-error, refresh, logout, popup-blocked recovery and multi-character isolation coverage;
- deterministic CI execution without CCP credentials;
- local real-CCP smoke procedure documented separately.

## Main files

- `tests/e2e/auth-browser.spec.ts`
- `scripts/e2e/start-harness.ts`
- `playwright.config.ts`
- `server/routes/auth.ts`
- `server/utils/authUtils.ts`
- `server/utils/esiClient.ts`
- `src/hooks/useCharacterSync.ts`
- `.github/workflows/ci.yml`

## Validation

The existing unit/API/security/ESI/corporation/build gates remain authoritative for their layers. The new browser gate must be green in CI before E2E-001 can be declared complete.

## Blockers

Final completion requires an actual green CI run for this branch/PR and the separate real-CCP smoke procedure on the target PC.
