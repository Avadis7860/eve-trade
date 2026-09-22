# EVE Trade — Matrice de Couverture et Non-Régression

Cette matrice documente les mécanismes de protection actuels et dans le pipeline CI à l'issue de **LOT-001**.
Elle distingue rigoureusement ce qui est formellement vérifié par des tests ou le compilateur de ce qui ne bénéficie pas encore d'une couverture automatisée.

---

## Matrice de Protection

| Composant / Surface | Current Protection (Local) | CI Protection (GitHub Actions) | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend TypeScript** | `npm run typecheck` (`tsc --noEmit`) | Étape `Frontend typecheck` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre l'intégralité de `src/**` avec vérification stricte (`strict: true`, React JSX). |
| **Backend TypeScript** | `npm run typecheck:server` (`tsc -p tsconfig.server.json --noEmit`) | Étape `Backend typecheck` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre `server.ts`, `server/routes/*.ts` et `server/utils/*.ts` avec vérification stricte. |
| **Unit tests (Moteurs financiers)** | `npm test` (22 suites tsx) | Étape `Unit tests` dans `.github/workflows/ci.yml` | ✅ COUVERT | Couvre 22 suites unitaires (`src/engine/__tests__/*`) : taxes, carnet, FIFO, scoring, certification 4 piliers. |
| **Build (Frontend & Backend)** | `npm run build` (Vite + esbuild) | Étape `Production build` dans `.github/workflows/ci.yml` | ✅ COUVERT | Vérifie la compilation complète Vite (SPA) et le bundle CommonJS `dist/server.cjs`. |
| **Server startup (Smoke / Runtime)** | Aucun test automatisé. Vérification manuelle via curl / dev server. | Aucune étape dans le CI actuel. | ⚠️ NON COUVERT | Le serveur n'est pas instancié en phase de test. Candidat prioritaire pour LOT-002 (smoke test de démarrage). |
| **API health (`/api/health`)** | Aucun test unitaire ou d'intégration automatisé. | Aucune étape dans le CI actuel. | ⚠️ NON COUVERT | Endpoint opérationnel mais renvoie 503 préexistant (`status: unhealthy`). Aucun test de régression sur les routes HTTP. |
| **Routes EVE SSO (`/api/auth/*`)** | Aucun test d'intégration automatisé. | Aucune étape dans le CI actuel. | ⚠️ NON COUVERT | La logique d'authentification OAuth2 n'est couverte que par des tests de structures (`security_and_advisory.test.ts`), sans requêtes HTTP réelles. |
| **Routes Marché & Catalogue (`/api/markets/*`, `/api/types/*`)** | Aucun test d'intégration automatisé. | Aucune étape dans le CI actuel. | ⚠️ NON COUVERT | Pas de test d'intégration Express. Seuls les services sous-jacents ont des tests unitaires partiels. |
| **UI Components (React)** | Typecheck statique uniquement (`tsc`). | Aucun test E2E / RTL dans le CI. | ⚠️ NON COUVERT | Aucun test de rendu ou d'interaction utilisateur (Playwright / Cypress / Testing Library non configurés). |
| **Persistance IndexedDB** | Tests unitaires de logique de persistance avec mocks (`src/engine/__tests__/*`). | Étape `Unit tests` dans CI (via mocks). | 🟡 PARTIELLEMENT COUVERT | Les scénarios d'invariants et d'erreurs IndexedDB sont testés unitairement en mémoire, mais pas dans un navigateur réel. |

---

## Synthèse de Protection

1. **Sécurisé par le CI (P0)** :
   - Typage statique Frontend (`src/**`)
   - Typage statique Backend (`server.ts`, `server/**`)
   - Cohérence mathématique et comptable des moteurs financiers (`src/engine/*`)
   - Validité du bundle de déploiement (Vite bundle + esbuild bundle)
2. **Zones à risque identifiées pour les prochains lots (P1/P2)** :
   - Tests d'intégration des routes Express (`server/routes/*`)
   - Test de démarrage et arrêt propre du serveur (`server.ts`)
   - Tests de composants React et parcours utilisateur (E2E / Playwright)
