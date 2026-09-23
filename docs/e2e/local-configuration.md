# E2E Local Configuration

## Purpose

This document defines the runtime configuration required to execute the real CCP EVE SSO/ESI smoke test locally. It is intentionally separate from the deterministic browser E2E documentation.

## Canonical local runtime

The supported local server is:

`http://localhost:3000`

The canonical CCP callback is:

`http://localhost:3000/auth/callback`

The same callback URI must be registered in the private CCP Developer application and configured as `EVE_CALLBACK_URL`.

## Environment variables

Copy `.env.example` to `.env` and provide:

- `EVE_CLIENT_ID`: CCP application client ID.
- `EVE_CLIENT_SECRET`: CCP application client secret. Keep it server-side only.
- `EVE_CALLBACK_URL`: exactly `http://localhost:3000/auth/callback`.

Optional boundary overrides exist for deterministic tests:

- `EVE_SSO_AUTHORIZE_URL`
- `EVE_SSO_TOKEN_URL`
- `EVE_SSO_VERIFY_URL` (legacy compatibility override)
- `EVE_SSO_METADATA_URL`
- `ESI_BASE_URL`

Leaving these optional variables empty uses the official CCP/ESI production endpoints.

## Runtime loading

The `dev` and `start` scripts explicitly load `.env` with Node.js 22's `--env-file-if-exists` mechanism. Tests are not implicitly loaded from a developer's `.env`; this prevents real credentials from silently changing deterministic test behavior.

Runtime configuration is centralized in `server/config/environment.ts`. Server consumers must use this configuration rather than reading `process.env.EVE_*` directly.

## Safe diagnostics

`GET /api/auth/config` exposes configuration status only:

- whether the client ID is configured;
- whether the client secret exists;
- whether the callback is configured;
- the configured callback;
- upstream endpoint URLs;
- requested OAuth scopes.

The raw client secret is never returned.

## Failure semantics

A real OAuth flow must fail before contacting CCP when mandatory configuration is incomplete:

- `GET /api/auth/url` returns `503 SSO_NOT_CONFIGURED` when `EVE_CLIENT_ID` is missing.
- Token exchange returns `503 SSO_NOT_CONFIGURED` when client ID, client secret, or callback configuration is incomplete.

This distinguishes local configuration failure from a CCP rejection.

## Secret handling

Never commit `.env`, paste the client secret into chat, place it in browser code, or include it in CI artifacts/logs.

The browser receives an authorization URL, not the client secret. The authorization-code exchange remains server-side.

## Real smoke-test entry criteria

Before starting the real browser test:

1. `npm install` completes cleanly.
2. `npm run dev` starts the server on port 3000.
3. `GET /api/auth/config` reports client ID, secret presence, and callback as configured.
4. The CCP application contains the exact canonical callback URI.
5. The browser test uses the real local server, not the deterministic fixture environment.

The remaining real-world proof is then CCP OAuth authorization, server-side code exchange, JWT identity verification, authenticated ESI access, persistence/reload, logout, and multi-character isolation.
