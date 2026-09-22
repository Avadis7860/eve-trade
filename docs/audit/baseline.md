# EVE Trade — Baseline Audit & Traçabilité (LOT-001)

Document de référence établi dans le cadre de la mission **LOT-001 — Baseline & CI Foundation** du master-plan de stabilisation du projet EVE Trade.

---

## 1. Environment

* **Node.js** : `v22.23.2` (Target runtime : Node 22 LTS)
* **npm** : `10.9.8`
* **TypeScript** : `5.7.2`
* **Vite** : `6.0.7` (Frontend build & dev middleware)
* **esbuild** : `0.28.2` (Backend Node/CJS bundler `server.ts` -> `dist/server.cjs`)
* **Framework Frontend** : React 18.3.1 + TailwindCSS 3.4.17
* **Framework Backend** : Express 5.2.1
* **Test Runner** : `tsx` (TypeScript Execution Engine v4.23.13)

---

## 2. Commands

| Commande | Rôle | Configuration sous-jacente |
| :--- | :--- | :--- |
| `npm run typecheck` (ou `npm run lint`) | Typecheck statique Frontend | `tsc --noEmit` via `tsconfig.json` (`include: ["src"]`) |
| `npm run typecheck:server` | Typecheck statique Backend | `tsc -p tsconfig.server.json --noEmit` (`include: ["server.ts", "server/**/*"]`) |
| `npm test` | Suite de tests unitaires mathématiques & moteurs | 22 suites de tests exécutées séquentiellement via `tsx src/engine/__tests__/*.test.ts` |
| `npm run build` | Compilation de production Frontend & Backend | `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` |
| `npm run dev` | Serveur de développement avec HMR & API | `tsx server.ts` |
| `npm start` | Démarrage en production | `node dist/server.cjs` |
| `npm ci` | Installation propre et déterministe | Utilise `package-lock.json` (lockfileVersion 3) |

---

## 3. Initial State (Avant Modification)

Photographie exacte capturée avant l'application de tout changement au repository :

### A. Exécution de `npm ci`
* **Résultat** : `FAIL préexistant` (Exit code 1).
* **Durée** : ~1s.
* **Erreur** : `npm error code EUSAGE: The npm ci command can only install with an existing package-lock.json or npm-shrinkwrap.json`.
* **Cause racine** : Le projet initial contenait un fichier `bun.lock` au format Bun, sans `package-lock.json`. La commande `npm ci` était donc impossible à exécuter en local ou dans un pipeline CI GitHub Actions.

### B. Exécution de `npm test`
* **Résultat** : `PASS` (Exit code 0).
* **Durée** : ~34s.
* **Détail** : 22 suites de tests unitaires exécutées avec succès (100% de réussite sur les moteurs financiers, FIFO, certification 4 piliers, transactions de personnages, et invariants mathématiques).

### C. Exécution de `npm run lint` (`tsc --noEmit`)
* **Résultat** : `PASS` (Exit code 0).
* **Durée** : ~15s.
* **Couverture** : Uniquement `src/**`. Le backend `server.ts` et `server/**` était totalement ignoré.

### D. Exécution de `npm run build`
* **Résultat** : `PASS` (Exit code 0).
* **Durée** : ~10.3s (Vite build: 9.35s, esbuild backend bundle: 911ms).
* **Artéfacts** : `dist/index.html` (1.07 kB), `dist/assets/index-*.js` (8.69 MB unminified bundle), `dist/server.cjs` (7.1 MB).
* **Warnings préexistants** : Warning Vite relatif à la taille des chunks > 500 kB (`dist/assets/index-*.js`).

### E. Couverture TypeScript du Backend
* **Résultat** : `FAIL préexistant` (Absence totale de couverture).
* **Détail** : `tsconfig.json` définissait explicitement `"include": ["src"]`. Aucun contrôle de typage TypeScript ne s'appliquait à `server.ts`, `server/routes/*.ts` ou `server/utils/*.ts`.

### F. Vérification de l'API `/api/health`
* **Résultat** : Réponse HTTP 503 avec payload `{"status":"unhealthy"}`.
* **Cause racine** : Discordance de statut entre `TypeCatalogService` (qui émet `CATALOG_READY`) et `server/routes/health.ts` (qui vérifie spécifiquement `catalogMeta.status === 'CATALOG_LOADED'`).

---

## 4. Problems Discovered (Préexistants, Non Corrigés)

Les problèmes suivants ont été identifiés sans modification du code applicatif, conformément à la règle de non-altération hors périmètre de LOT-001 :

1. **BACKLOG-001 (P1)** : Discordance de statut dans `/api/health` entraînant un statut HTTP 503 / `unhealthy` alors que le catalogue de 20 526 items est correctement chargé en mémoire.
2. **BACKLOG-002 (P2)** : Bundle frontend monolithique de 8.69 MB (`dist/assets/index-*.js`) sans découpage par `manualChunks` ou `dynamic import()`.
3. **BACKLOG-003 (P1)** : Absence complète de tests automatisés pour les routes Express (`/api/auth`, `/api/types`, `/api/markets`, `/api/character`, `/api/universe`, `/api/health`).
4. **BACKLOG-004 (P2)** : Absence de test automatisé de démarrage du serveur (smoke test / sanity check de démarrage HTTP).

---

## 5. Changes Made (LOT-001 Uniquement)

1. **`package-lock.json`** : Généré proprement via `npm i --package-lock-only` pour permettre l'exécution déterministe de `npm ci` dans GitHub Actions et en local sans altérer les versions résolues.
2. **`tsconfig.server.json`** : Création d'une configuration TypeScript dédiée au backend étendant `tsconfig.json` :
   * Cible : `server.ts` et `server/**/*`
   * Strict typechecking activé (`strict: true`, `esModuleInterop: true`, `resolveJsonModule: true`, `isolatedModules: true`).
   * Vérification indépendante sans émission (`noEmit: true`).
3. **`package.json`** :
   * Ajout de `"typecheck": "tsc --noEmit"` (Frontend).
   * Ajout de `"typecheck:server": "tsc -p tsconfig.server.json --noEmit"` (Backend).
   * Conservation intégrale de `"lint"`, `"test"`, `"build"`, `"dev"`, `"start"`, `"preview"`.
4. **`.github/workflows/ci.yml`** : Création du workflow GitHub Actions déclenché sur `push` et `pull_request` :
   * Checkout
   * Setup Node.js 22 avec cache npm
   * `npm ci`
   * `npm run typecheck` (Frontend)
   * `npm run typecheck:server` (Backend)
   * `npm test` (Unit tests)
   * `npm run build` (Production build)
5. **Documentation d'Audit** : Création de `docs/audit/baseline.md`, `docs/audit/regression-matrix.md`, et `docs/audit/backlog.md`.

---

## 6. Validation Finale (Post-Modification)

| Étape | Commande | Statut | Durée |
| :--- | :--- | :--- | :--- |
| Installation déterministe | `npm ci` | `PASS` | ~0.7s |
| Typecheck Frontend | `npm run typecheck` | `PASS` (0 erreur) | ~15s |
| Typecheck Backend | `npm run typecheck:server` | `PASS` (0 erreur) | ~2.5s |
| Typecheck Legacy Alias | `npm run lint` | `PASS` (0 erreur) | ~15s |
| Tests Unitaires Moteurs | `npm test` | `PASS` (22 suites, 100%) | ~34s |
| Build Production | `npm run build` | `PASS` (Vite + esbuild) | ~10s |
