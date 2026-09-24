# Security Policy

## Supported versions

EVE Trade is a personal project under active development.

For security fixes, the supported reference is the current `main` branch. Older commits and historical branches are not treated as supported release lines.

## Reporting a vulnerability

Do not publish credentials, access tokens, client secrets or exploitable security details in a public GitHub issue.

Use GitHub's private vulnerability reporting / Security Advisories mechanism for this repository when available. If the private reporting channel is not available, contact the maintainer privately through GitHub rather than disclosing the issue publicly.

Please include:
- affected commit or version;
- security impact;
- minimal reproduction steps;
- relevant logs or traces with secrets removed.

Never include CCP passwords, OAuth client secrets, access tokens or refresh tokens in a report.

## Response

This is a maintainer-run portfolio project and does not promise a contractual response SLA. Reports will be reviewed on a best-effort basis.

## Security boundaries

The application deliberately keeps OAuth code/token exchange on the server and validates EVE SSO JWTs before exposing authenticated ESI data to browser consumers.

The deterministic browser harness uses synthetic credentials and does not require real CCP credentials.

Security-related changes must preserve the existing authentication, principal-isolation and token-handling invariants and must pass the repository's security and CI certification gates.
