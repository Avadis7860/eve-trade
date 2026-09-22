# EVE Trade — Backlog des Problèmes Découverts

Ce backlog répertorie les défauts, anomalies et dettes techniques documentés au fil des missions d'audit et de stabilisation.

---

## Statut des Anomalies

| ID | Titre | Statut | Résolu dans | Priorité |
| :--- | :--- | :--- | :--- | :--- |
| **ISSUE-001** | Discordance de statut `/api/health` (HTTP 503 permanent) | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-002** | Taille excessive du bundle frontend initial (8.69 MB unminified) | ⏳ BACKLOG | Non planifié (Post LOT-003) | P2 |
| **ISSUE-003** | Absence de couverture de tests sur la couche HTTP / API Express | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-004** | Absence de smoke test automatisé pour le démarrage du serveur | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-005** | Présence conjointe de `bun.lock` et `package-lock.json` | ⏳ BACKLOG | Non planifié (Nettoyage) | P3 |
| **ISSUE-006** | Composants orphelins / non référencés identifiés dans l'audit initial | ⏳ BACKLOG | Non planifié (Dead code) | P2 |
| **ISSUE-007** | Absence de mock officiel ESI pour tests hors-ligne du proxy marché | ⏳ BACKLOG | LOT-003 (Hardening ESI) | P2 |

---

## Détail des Problèmes et Résolutions

### ISSUE-001 : Discordance de statut dans le router `/api/health` (Résolu dans LOT-002)
* **ID** : `ISSUE-001`
* **Statut** : ✅ **RÉSOLU** dans **LOT-002**
* **Cause racine** : `server/routes/health.ts` testait strictement `catalogMeta.status === 'CATALOG_LOADED'`, alors que le contrat de domaine émis par `TypeCatalogService` et certifié par les tests d'intégrité est `'CATALOG_READY'`.
* **Correction appliquée** :
  * Mise à jour de `server/routes/health.ts` pour accepter à la fois `'CATALOG_READY'` et `'CATALOG_LOADED'` pour un état `healthy` (HTTP 200).
  * Prise en compte de `'CATALOG_FALLBACK_CORE'` et `'CATALOG_DEGRADED'` pour un état `degraded` (HTTP 200).
  * Traitement des états corrompus, indisponibles ou vides (`CATALOG_CORRUPTED`, `CATALOG_EMPTY`, `CATALOG_UNAVAILABLE`) avec bascule en `unhealthy` (HTTP 503).
  * Validé par 3 tests d'intégration automatisés couvrant les trois branches dans `server/__tests__/api_integration.test.ts`.

---

### ISSUE-002 : Taille excessive du bundle frontend initial (8.69 MB unminified)
* **ID** : `ISSUE-002`
* **Statut** : ⏳ **BACKLOG** (Hors périmètre LOT-002)
* **Description** : La compilation Vite émet un warning de dépassement de chunk (> 500 kB) pour `dist/assets/index-*.js` (8.69 MB non compressé, 1.05 MB gzippé) dû à l'import statique synchrone de catalogues JSON volumineux.
* **Priorité** : P2 (Moyenne)

---

### ISSUE-003 : Absence de couverture de tests sur la couche HTTP / API Express (Résolu dans LOT-002)
* **ID** : `ISSUE-003`
* **Statut** : ✅ **RÉSOLU** dans **LOT-002**
* **Correction appliquée** :
  * Création de la suite `server/__tests__/api_integration.test.ts`.
  * Couverture de 15 assertions réelles sur serveur actif (port dynamique) :
    1. `/api/health` (healthy, degraded, unhealthy, non-divulgation de secrets)
    2. `/api/types/status`, `/api/types/all` (formats `{ metadata, types }` et flat, en-têtes canoniques), lookup type_id (34), recherche textuelle
    3. `/api/markets/:regionId/history` (validation des paramètres obligatoires, HTTP 400)
    4. `/api/auth/config`, `/api/auth/url` (génération CSRF 64 hex, blocage redirect_uri non whitelisté)
    5. `/api/character/:id/orders`, `/api/character/:id/wallet` (contrôle obligatoire de l'en-tête Authorization, HTTP 401)
    6. `/api/universe/location/:id` (fallback déterministe pour stations/structures)
  * Intégré au script `npm run test:api` et à l'étape `API integration tests` dans GitHub Actions.

---

### ISSUE-004 : Absence de smoke test automatisé pour le démarrage du serveur (Résolu dans LOT-002)
* **ID** : `ISSUE-004`
* **Statut** : ✅ **RÉSOLU** dans **LOT-002**
* **Correction appliquée** :
  * Refactorisation modulaire de `server.ts` : export de `createServerApp()` et `startServer(port?, options?)` avec port dynamique et interface `RunningServer` (`app`, `server`, `port`, `close()`).
  * Création de `server/__tests__/server_smoke.test.ts` testant le cycle de vie complet : démarrage sur port dynamique 0 -> écoute -> requête GET `/api/health` -> vérification de la réponse 200 OK -> arrêt gracieux du serveur -> vérification de la fermeture effective du port (connexion refusée).
  * Intégré au script `npm run test:smoke` et à l'étape `Server smoke test` dans GitHub Actions.

---

### ISSUE-005 : Présence conjointe de `bun.lock` et `package-lock.json`
* **ID** : `ISSUE-005`
* **Statut** : ⏳ **BACKLOG** (Hors périmètre LOT-002)
* **Description** : Présence résiduelle de `bun.lock`.
* **Priorité** : P3 (Faible)

---

### ISSUE-006 : Composants orphelins / non référencés identifiés dans l'audit initial
* **ID** : `ISSUE-006`
* **Statut** : ⏳ **BACKLOG** (Hors périmètre LOT-002)
* **Description** : Composants orphelins (`Sidebar.tsx`, etc.) à auditer lors d'un lot dédié.
* **Priorité** : P2 (Moyenne)

---

### ISSUE-007 : Absence de mock officiel ESI pour tests hors-ligne du proxy marché
* **ID** : `ISSUE-007`
* **Statut** : ⏳ **BACKLOG** (Prévu pour LOT-003 / ESI Hardening)
* **Description** : Les tests d'intégration du proxy marché (`/api/markets/*`) testent actuellement la validation des paramètres mais pas l'interaction complète avec les upstream ESI afin de préserver l'indépendance réseau en CI.
* **Priorité** : P2 (Moyenne)
