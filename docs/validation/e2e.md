# Browser E2E Validation

Status: READY FOR LOCAL ACCEPTANCE
Scope: end-to-end browser proof
Source of truth: application browser wiring, `playwright.config.ts`, deterministic harness and CI workflow
Implementation: Playwright deterministic browser gate on E2E-001 branch
CI gate: deterministic browser + full regression validated on PR #46; real-CCP acceptance remains separate

## Current proof model

The browser suite deliberately uses the real eve-trade frontend/backend, while replacing only the external OAuth and ESI boundaries with deterministic local fixtures. The authorization-code exchange is server-owned; the browser receives only the validated session result.

```
Browser
  ↓
SsoConnectCard
  ↓
/api/auth/url
  ↓
controlled OAuth fixture
  ↓
/auth/callback
  ↓
postMessage
  ↓
AuthService / CharacterRepository
  ↓
/api/character/*
  ↓
CharacterEsiGateway
  ↓
EsiGateway
  ↓
controlled ESI fixture
```

The application uses CCP's documented Authorization Code endpoints and ESI compatibility-date model by default. The deterministic harness changes only external boundaries through environment variables before the server module is loaded.

## Deterministic browser command

From a clean checkout:

```text
npm ci --no-audit --no-fund
npx playwright install chromium
npm run test:e2e
```

For an interactive local browser run:

```text
npm run test:e2e:headed
```

The configured Playwright `webServer` starts `scripts/e2e/start-harness.ts`, which starts the deterministic external fixture and the real eve-trade server.

Default local ports:

- application: `3000`
- deterministic OAuth/ESI fixture: `43123`

The ports can be overridden with `E2E_APP_PORT` and `E2E_MOCK_PORT`.

## Deterministic fixture

The fixture provides two isolated characters:

- Alpha: character `1001`, corporation `99001`
- Beta: character `1002`, corporation `99002`

The OAuth fixture issues deterministic authorization codes and access/refresh tokens. Access tokens are signed RS256 JWTs with EVE-compatible issuer, audience, expiration and character subject claims, and the fixture exposes the JWKS consumed by the production verifier. The ESI fixture requires the compatibility-date header and rejects a credential when it is used for the wrong character or corporation context.

No CCP login, password, token, client secret or personal credential is used by this layer.

## Browser scenarios

The current suite covers:

- nominal SSO popup → callback → postMessage → authenticated ESI → persisted session;
- reload/session restoration;
- forged same-origin `postMessage` from the main window;
- callback with an unissued state;
- callback state replay;
- expired local session followed by refresh through the frontend API path;
- logout;
- second-character connection, token preservation and active-character switching;
- controlled OAuth denial;
- popup closed before completion;
- popup-blocked same-window callback recovery.

HTTP/security suites remain responsible for the exhaustive state TTL and lower-level protocol validation already present in the repository. The browser suite tests composition failures that those suites cannot observe.

## Real PC installation and CCP smoke

This is the acceptance layer for the target PC. It is intentionally separate from CI because it requires a real CCP SSO login and manual consent.

### 1. Local prerequisites

Use Node.js 22 and npm.

```bash
npm ci
```

Create a local `.env` from `.env.example`. Set only the real CCP application values:

```text
EVE_CALLBACK_URL=http://localhost:3000/auth/callback
EVE_CLIENT_ID=<your CCP application client id>
EVE_CLIENT_SECRET=<your CCP application client secret>
EVE_SSO_METADATA_URL=https://login.eveonline.com/.well-known/oauth-authorization-server
ESI_BASE_URL=
```

Keep `.env` local; it is ignored by Git. Do not put the client secret, access token or refresh token in source files, screenshots, CI logs or issue comments.

### 2. CCP developer application

The exact callback URL used by the local browser must be registered in the CCP developer application. For the default local installation, register:

```text
http://localhost:3000/auth/callback
```

Do not add ad-hoc query parameters or a second callback URL for this smoke. The application now validates the callback against an exact local/configured allow-list.

### 3. Production-like local run

Before exercising real SSO, validate the real build and server:

```bash
npm run build
npm start
```

In another terminal:

```bash
curl -fsS http://localhost:3000/api/health
```

Then open `http://localhost:3000` in a normal browser.

### 4. Real CCP SSO path

1. Open the Orders view and keep the SSO tab selected.
2. Choose the callback option matching the registered CCP callback.
3. Click the official EVE SSO button.
4. Complete CCP login and consent only on the official CCP page. Never automate password entry.
5. Verify that the browser returns to `/auth/callback`.
6. Verify that the authenticated character is displayed and that authenticated ESI data loads.
7. Verify logout returns to the unauthenticated SSO card.
8. When multi-character validation is required, repeat with the dedicated disposable second character and confirm that the two character credentials remain isolated.

The official EVE SSO flow uses a registered redirect URI, an authorization code, server-side token exchange and a validated JWT; CCP's documentation states that an unregistered redirect URL is rejected. ([documentation CCP SSO](https://developers.eveonline.com/docs/services/sso/))

### Acceptance result

Record one of:

- PASS — build starts, health is OK, CCP SSO returns to the registered callback, the expected character authenticates, and real ESI data loads;
- BLOCKED — configuration, callback registration or external CCP service prevents the flow;
- REGRESSION — the flow reaches eve-trade but the delivered behavior differs from the documented contract.

A real-CCP failure must not be “fixed” by weakening the callback/state/JWT/ESI security checks.

## CI

The GitHub Actions workflow contains two complementary jobs:

- the existing validation job for the established typecheck/unit/API/security/ESI/corporation/build gates;
- the Playwright browser job, which installs Chromium and executes `npm run test:e2e`.

The browser job has no CCP dependency and uploads Playwright diagnostics when available.

## OAuth invariants

- The authorization state is single-use, remains bound to the exact redirect URI selected when the authorization request is created, and is tied to the initiating browser by an HttpOnly SameSite cookie.
- The callback performs the authorization-code exchange only on the server.
- A successful popup message contains only the validated session; raw OAuth code and state are not returned to the frontend for a second exchange.
- When popup creation is blocked, the callback writes a short-lived same-origin one-shot result and redirects to the application; the frontend consumes and removes that result before synchronization. Both the callback and the auxiliary code-exchange endpoint require the initiating browser state cookie.
- Popup creation occurs synchronously from the user gesture; only the destination URL is assigned after the backend has created the state.

## Completion gate

E2E-001 is complete only when the browser job is green in CI, the existing regression gates remain green, the active documentation is synchronized, and the target-PC real-CCP smoke has been executed and recorded.
