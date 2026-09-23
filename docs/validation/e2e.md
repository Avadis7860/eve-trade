# Browser E2E Validation

Status: IN PROGRESS
Scope: end-to-end browser proof
Source of truth: application browser wiring, `playwright.config.ts`, deterministic harness and CI workflow
Implementation: Playwright deterministic browser gate on E2E-001 branch
CI gate: pending branch validation

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

## Real CCP smoke test

This is a separate local acceptance procedure and is never a CI prerequisite.

1. Copy `.env.example` to a local environment file and populate only local CCP application values.
2. Register the exact callback URI with the CCP developer application and set the same value in `EVE_CALLBACK_URL`.
3. Start the normal application with `npm run dev`.
4. Open the Orders view, keep the SSO tab selected, and choose the callback option matching the registered CCP callback.
5. Click the official EVE SSO button.
6. Complete CCP login and consent manually in the official CCP page. Do not automate password entry and do not paste or record the password in the project.
7. Verify that the browser returns to `/auth/callback`, the character appears authenticated, and authenticated ESI data loads.
8. Perform the same check for a dedicated disposable test character when multi-character validation is required.

Real values remain outside Git and outside logs. The smoke test is expected to be run by the repository owner after installation on the target PC.

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

E2E-001 is not complete until the browser job is green in CI on the branch/PR, the existing regression gates remain green, and the active documentation is synchronized with the delivered behavior.
