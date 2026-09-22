# Security Validation

Status: STABLE
Scope: OAuth, HTTP hardening and credential boundaries
Source of truth: `server/__tests__/security_hardening.test.ts`
Implementation: auth routes/utils + ESI principal boundaries
CI gate: `npm run test:security`

## Coverage

OAuth state/anti-replay, CORS policy, security headers, request validation, error exposure, payload limits and credential/principal isolation.

Changes crossing authentication or private-data boundaries must retain this gate.
