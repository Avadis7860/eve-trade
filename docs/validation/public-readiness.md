# Public Readiness Validation

Status: CURRENT — MAINTENANCE GATE
Date: 2026-09-24
Scope: public repository credibility, security posture and portfolio showcase readiness
Source of truth: repository settings, root project files, public-readiness roadmap and current CI
Roadmap: [Public Readiness](../roadmap/public-readiness.md)
Audit: [Public Readiness Audit](../audits/public-readiness-audit-2026-09-24.md)

## Purpose

This document defines how the project proves that its public-facing repository state is credible.

It separates:
- evidence observable from the repository;
- evidence requiring GitHub administrative settings;
- decisions that belong to the maintainer rather than to CI.

## Repository-side checks

| Check | Current state | Evidence |
|---|---|---|
| Repository is public | PASS | GitHub repository metadata reports visibility: public |
| README is public-facing and current | PASS after this sync | README.md |
| Security policy published | PASS after this sync | SECURITY.md |
| CI status visible from README | PASS after this sync | README CI badge |
| No local secrets committed | PASS by repository convention | .gitignore, .env.example, auth/security tests |
| Deterministic browser proof | PASS | Playwright E2E and CI browser jobs |
| Main post-merge smoke | PASS | Main Smoke #9 on 95e970933a1d440fb61d25a6f677742731b697aa |
| P0/UX-01 current status | PASS after this sync | current-state, roadmap and validation documents |
| License file | PASS | LICENSE publishes MIT for original EVE Trade materials |
| GitHub release/tagged showcase | NOT PRESENT | release process is planned |
| Public screenshots/demo path | NOT PRESENT | showcase work is planned |

## License boundary checks

- Original EVE Trade code and original project documentation: MIT, documented in LICENSE.
- EVE/CCP/SDE-derived data and CCP tools/marks: explicitly excluded from the project license; see THIRD-PARTY-NOTICES.md and the current CCP terms.
- Open-source dependencies: retain their upstream licenses; the project license does not relicense them.

## Administrative checks

These cannot be certified from repository content alone:

- main branch protection / ruleset requirements;
- Dependabot alerts and security updates;
- secret scanning and push protection;
- code scanning / SAST configuration;
- repository-level vulnerability reporting availability;
- repository security settings and their enforcement status.

The available GitHub integration returned 403 Resource not accessible by integration for the branch-protection endpoint. This is recorded as an administrative unknown, not as evidence that protection is absent.

## Showcase release gate

A public showcase release should satisfy:

1. accurate README and current project status;
2. published security policy;
3. explicit license decision and published license boundary;
4. verified repository security settings;
5. verified main protection/ruleset;
6. green Main Smoke on the release commit;
7. reproducible showcase/demo path;
8. release notes tied to the validated commit;
9. visible known limitations;
10. no stale active-incident claims in current documentation.

## Maintenance rule

A repository can be public while still being under active development. Public readiness therefore means truthful, auditable and intentionally maintained, not that every roadmap item is complete.
