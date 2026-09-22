# Browser E2E Validation

Status: PARTIAL
Scope: end-to-end browser proof
Source of truth: current `package.json`, browser/application wiring and CI workflow
Implementation: no browser E2E harness is currently a reference gate
CI gate: none

## Current state

The repository has strong HTTP/API and deterministic service/engine validation, but no browser E2E command in the current package scripts or CI workflow.

Authentication is already covered below the browser layer by API/security tests. The missing proof is the composition of the real frontend, backend, OAuth callback, session, authenticated API and persistence/session restoration behavior in an actual browser runtime.

## E2E-001 objective

Establish a reproducible browser-level authentication gate for the existing application without redefining the authentication or ESI architecture.

The primary flow to prove is:

`Browser → SsoConnectCard → /api/auth/url → OAuth/SSO boundary → /auth/callback → session establishment → AuthService → authenticated API → ESI boundary`

The browser proof must cover the success path and the material failure paths that can break integration despite passing isolated HTTP tests.

## Test layers

### Deterministic CI/browser layer

The automated CI path must:

- use a real browser harness;
- launch the real eve-trade application/backend path used by the project;
- exercise the browser-facing SSO flow rather than the manual code/token mode;
- control the external OAuth and ESI boundaries deterministically;
- verify callback completion, session creation and session restoration;
- verify an authenticated character request reaches the expected application boundary;
- verify character/session isolation;
- verify logout and relevant authentication failures;
- run reproducibly without a real CCP account or interactive credentials.

The test must add unique browser-level evidence instead of merely duplicating the existing HTTP security suite.

### Real CCP smoke layer

A separate local smoke path must validate the integration against CCP SSO with a dedicated disposable test account.

The operator may perform the CCP login/consent interaction manually. Once authorization is granted, the test may continue through the real callback, session creation and real authenticated ESI request.

Credentials and long-lived secrets must remain local. They must not be committed, placed in fixtures, emitted in logs, or required by CI.

This smoke path is used for local integration verification and for the post-install acceptance test performed on the user's own PC. It is not a CI dependency.

## Required evidence

E2E-001 is complete only when the implementation provides:

- a documented browser test command;
- reproducible local startup/bootstrap instructions;
- CI integration for the deterministic browser suite;
- success and failure coverage for the OAuth callback/session composition;
- session persistence/restoration coverage where the current architecture supports it;
- authenticated request and identity-isolation evidence;
- no dependency on a real CCP account in CI;
- a documented real-CCP smoke procedure;
- green typecheck, unit/API/security/ESI suites, production build and CI.

## Gate requirement

Before browser E2E becomes a release-quality proof, the local EVE SSO/OAuth callback, session and authenticated API flow must be reproducibly validated outside any special agent environment.

The post-implementation acceptance sequence is:

1. merge the E2E-001 implementation after normal CI validation;
2. install/run the application on the user's PC;
3. execute the documented real-CCP smoke path with the disposable test account;
4. record any discrepancy as a regression input before declaring the integration proven.
