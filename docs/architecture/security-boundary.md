# Security Boundary

Status: STABLE
Scope: authentication, credentials and private-data boundaries
Source of truth: `server/routes/auth.ts`, `server/utils/authUtils.ts`, `server/utils/esiGateway.ts`, character gateways/routes
Tests: security hardening + ESI/API suites
CI gate: security + ESI

## Rules

OAuth state is cryptographically bound to the login attempt and cannot be replayed. Character-scoped requests require the correct Bearer credential.

Private ESI request coalescing is partitioned by principal and credential fingerprint. Public market data remains owner-neutral.

Corporation access is authorized through the observing character; corporation identity does not replace the character credential.
