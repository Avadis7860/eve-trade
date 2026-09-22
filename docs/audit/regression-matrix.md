# EVE Trade — Matrice de Couverture et Non-Régression

Cette matrice documente les mécanismes de protection actuels et dans le pipeline CI à l'issue de **LOT-003 & LOT-003.1** (Security & ESI Hardening).
Elle distingue rigoureusement ce qui est formellement vérifié par des tests ou le compilateur de ce qui ne bénéficie pas encore d'une couverture automatisée.

---

## Matrice de Protection

| Composant / Surface | Current Protection (Local) | CI Protection (GitHub Actions) | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend TypeScript** | `npm run typecheck` (`tsc --noEmit`) | Étape `Frontend typecheck` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre l'intégralité de `src/**` avec vérification stricte (`strict: true`, React JSX). |
| **Backend TypeScript** | `npm run typecheck:server` (`tsc -p tsconfig.server.json --noEmit`) | Étape `Backend typecheck` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre `server.ts`, `server/routes/*.ts`, `server/utils/*.ts` et `server/__tests__/*.ts` avec vérification stricte. |
| **Unit tests (Moteurs financiers)** | `npm test` (22 suites tsx) | Étape `Unit tests` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre 22 suites unitaires (`src/engine/__tests__/*`) : taxes, carnet, FIFO, scoring, certification 4 piliers. |
| **API Integration (Routes Express)** | `npm run test:api` (`server/__tests__/api_integration.test.ts`) | Étape `API integration tests` dans `.github/workflows/ci.yml` | ✅ COUVERT | 15 scénarios HTTP réels : `/api/health` (healthy, degraded, unhealthy), `/api/types` (status, all, lookup, search), `/api/markets` (validation), `/api/auth` (CSRF, whitelist), `/api/character` (auth guard), `/api/universe` (fallback). |
| **Server startup (Smoke / Runtime)** | `npm run test:smoke` (`server/__tests__/server_smoke.test.ts`) | Étape `Server smoke test` dans `.github/workflows/ci.yml` | ✅ COUVERT | Cycle complet : démarrage port dynamique (0) -> écoute -> requête GET `/api/health` -> réponse 200 OK -> arrêt propre -> vérification de fermeture de port (connexion refusée). |
| **Security Hardening (HTTP & Auth)** | `npm run test:security` (`server/__tests__/security_hardening.test.ts`) | Étape `Security hardening tests` dans `.github/workflows/ci.yml` | ✅ COUVERT | 25 tests : validation des entrées (types, limits, bounds, integer), en-têtes de sécurité (nosniff, X-XSS-Protection, Referrer-Policy), masquage `x-powered-by`, politique CORS par whitelist stricte (`isAllowedOrigin`, preflight 403, credentials restreints), obligation du paramètre `state` OAuth et anti-rejeu, assainissement XSS en contexte de script HTML (`safeJsonStringify`), rejet des payloads volumineux. |
| **ESI Hardening & Offline Mocks** | `npm run test:esi` (`server/__tests__/esi_hardening.test.ts`) | Étape `ESI hardening & mock tests` dans `.github/workflows/ci.yml` | ✅ COUVERT | 9 tests : retries sur erreurs 5xx (502/503/504), non-retry sur 4xx, arrêt immédiat sur budget d'erreur ESI épuisé (`x-esi-error-limit-remain <= 0`), respect du header `Retry-After` sur 429, timeout abort propre (504), proxying hors ligne déterministe via mock global ESI pour marché, station et wallet. |
| **Build (Frontend & Backend)** | `npm run build` (Vite + esbuild) | Étape `Production build` dans `.github/workflows/ci.yml` | ✅ COUVERT | Vérifie la compilation complète Vite (SPA) et le bundle CommonJS `dist/server.cjs`. |
| **UI Components (React)** | Typecheck statique uniquement (`tsc`). | Aucun test E2E / RTL dans le CI. | ⚠️ NON COUVERT | Aucun test de rendu ou d'interaction utilisateur (Playwright / Cypress / Testing Library non configurés). |
| **Persistance IndexedDB** | Tests unitaires de logique de persistance avec mocks (`src/engine/__tests__/*`). | Étape `Unit tests` dans CI (via mocks). | 🟡 PARTIELLEMENT COUVERT | Les scénarios d'invariants et d'erreurs IndexedDB sont testés unitairement en mémoire, mais pas dans un navigateur réel. |

---

## Synthèse de Protection (LOT-003)

1. **Sécurisé par le CI (P0)** :
   - Typage statique Frontend (`src/**`)
   - Typage statique Backend (`server.ts`, `server/**`)
   - Moteurs mathématiques, comptables et financiers purs (22 suites `npm test`)
   - Tests d'intégration HTTP Express en conditions réelles (`npm run test:api`)
   - Cycle de vie complet démarrage / écoute / arrêt propre du serveur (`npm run test:smoke`)
   - Hardening sécurité : validation fine de tous les paramètres de routes, headers HTTP, CORS, anti-rejeu CSRF, masquage d'erreurs (`npm run test:security`)
   - Résilience ESI : backoff exponentiel, budget d'erreur, Retry-After, timeout abort, injection de mocks hors-ligne déterministes (`npm run test:esi`)
   - Validité du bundle de déploiement (Vite SPA + esbuild `dist/server.cjs`)
2. **Zones à risque identifiées pour les prochains lots (P1/P2)** :
   - Unification et simplification de la couche client ESI frontend / backend (Phase 4 / LOT-004)
   - Élagage des composants orphelins et optimisation du bundle frontend (ISSUE-002, ISSUE-006)
   - Tests de composants React et parcours utilisateur (E2E / Playwright)
