# Public Readiness Audit — EVE Trade

Status: CURRENT / REFERENCE
Date: 2026-09-24
Scope: public repository credibility, discoverability, security posture, maintainability and portfolio presentation
Baseline: main @ 95e970933a1d440fb61d25a6f677742731b697aa
Repository visibility: public
Source of truth: current repository tree, current CI workflows, current state/roadmap documents and verified GitHub repository metadata

## Purpose

This audit establishes what should be reinforced before treating EVE Trade as a public portfolio showcase.

The target is simple:

> a visitor should be able to understand the project quickly, verify that the claimed guarantees are real, see the project's limitations honestly, and find an explicit security and maintenance posture.

## Verified current strengths

- Public repository with a real README and modular documentation.
- Reproducible Node.js 22.23.2 / npm 10.9.8 validation baseline.
- Deterministic browser E2E with isolated Auth and Operations jobs.
- CI required gate, Main Smoke and Full Certification workflow separation.
- Explicit ESI/authentication security tests.
- Canonical SDE-backed universe artifacts with manifest verification.
- Financial/evidence/provenance domains with dedicated unit coverage.
- Operations workflow certified for keep / adjust / relocate / cancel.
- Market health vocabulary explicitly distinguishes LIVE / CACHE / STALE / PARTIAL / UNKNOWN / ERROR.
- Public market error diagnostics preserve HTTP/cache/ESI/Retry-After information.
- The previously reported market-display problem is now considered resolved: the application is currently functional, and the reported symptom was explained by insufficient available data to produce a market to display. No persistent application defect is currently identified.

## Public-facing gaps confirmed in the repository

### PUB-001 — README / first-contact presentation

**Status: IN PROGRESS — documentation correction included in this sync.**

Current gap:
- README still contains the obsolete statement "Projet privé".
- No concise current-status section distinguishes implemented capabilities from planned UX work.
- No explicit known-limitations section.
- No visible CI status badge.
- The README does not yet present the project clearly as a public portfolio artifact.

Target:
- accurate public status;
- capabilities backed by current implementation;
- validation entry points;
- explicit limitations;
- clear EVE/CCP third-party disclaimer;
- CI visibility.

### PUB-002 — Security posture for a public repository

**Status: HIGH PRIORITY / ADMIN + DOCUMENTATION FOLLOW-UP.**

Repository-side observations:
- SECURITY.md is now published by this synchronization;
- security-oriented application tests exist;
- workflow token permissions are explicitly constrained in CI;
- no repository-local CodeQL workflow was found;
- no repository-local Dependabot configuration was found;
- branch-protection/ruleset settings could not be verified with the available GitHub integration.

Remaining target:
- enable/verify Dependabot alerts;
- enable/verify secret scanning and push protection;
- choose and enable a maintained code-scanning/SAST solution, such as CodeQL, where appropriate;
- verify effective main branch protection/ruleset configuration administratively.

### PUB-003 — License / source-use clarity

**Status: DECISION REQUIRED.**

There is currently no LICENSE file in the repository.

Public visibility does not itself define broad source-code reuse rights; without a license, default copyright rules apply. A license decision must therefore be explicit rather than implied.

Target:
- choose the intended distribution model;
- add the corresponding license if the project is intended to be open-source;
- update README and contribution guidance accordingly.

### PUB-004 — Release / version provenance

**Status: PLANNED.**

The package currently reports version 0.1.0, while the repository has no GitHub release recorded.

Before using the project as a portfolio release, establish:
- a deliberate release/version policy;
- release notes;
- a tagged showcase release;
- a reproducible validation reference for the release commit.

### PUB-005 — Public demonstration path

**Status: PLANNED / PRODUCT-CROSSCUTTING.**

The repository has strong deterministic CI, but a visitor cannot rely on CCP credentials or a live personal ESI environment to understand the product.

Preferred direction:
- provide screenshots or a short product walkthrough;
- later consider a deterministic showcase/demo mode using safe fixture data;
- keep real CCP/ESI access clearly separated from showcase/demo data.

A public demo must never require exposing personal credentials or production secrets.

### PUB-006 — Dependency maintenance and supply-chain evidence

**Status: PLANNED / HIGH PRIORITY.**

Current repository evidence proves locked installs and security/unit coverage, but no dedicated dependency maintenance automation is committed.

Target:
- Dependabot or an equivalent maintenance process;
- documented update ownership;
- periodic vulnerability review;
- controlled update PRs using the existing certification gate.

### PUB-007 — Documentation truth synchronization

**Status: IN PROGRESS — addressed by this sync.**

Several active documents still carried pre-merge or stale P0 language:
- P0 listed as ACTIVE/CLOSING;
- target-PC incident listed as NOT ROOT-CAUSED;
- CI-001 described as pre-merge;
- Draft-routing follow-up mixed with current-state wording;
- README described the project as private.

This is a credibility problem because public visitors can reasonably interpret stale status text as evidence that the project is unmanaged.

### PUB-008 — Legacy metadata review

**Status: PLANNED / LOW-RISK CLEANUP.**

metadata.json still declares MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API, while repository code search finds that capability only in this metadata file and an archived roadmap.

This may be legacy tooling metadata. It should be confirmed and either documented as intentionally required metadata, or removed when confirmed unused. Do not remove it speculatively.

## Public showcase gate

Before presenting the repository as a finished portfolio artifact:
1. README accurately represents the current product.
2. P0/UX-01 is closed and no stale incident wording remains.
3. Security policy is published.
4. Dependabot/security analysis settings are reviewed.
5. Effective branch protection/rulesets are verified.
6. License intent is explicit.
7. At least one reproducible showcase path exists.
8. A validated release/tag exists for the version being presented.
9. Known limitations are visible rather than hidden.
10. The last main smoke is green for the commit being presented.

## Priority model

The public-readiness work does not replace the product roadmap.

**Before portfolio publication:** PUB-001, PUB-002, PUB-003, PUB-007.

**Before a first stable showcase release:** PUB-004, PUB-005.

**Ongoing maintenance:** PUB-006, PUB-008.

UX-03 remains the next product build after the documentation sync. Security or regression work may interrupt the sequence when concrete evidence justifies it.

## External references

- GitHub repository best practices: https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories
- GitHub repository security: https://docs.github.com/en/repositories/creating-and-managing-repositories/about-repositories
- GitHub security and analysis: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository
- GitHub licensing: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
- GitHub security policy: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/add-security-policy
- GitHub Dependabot: https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/dependabot-quickstart
