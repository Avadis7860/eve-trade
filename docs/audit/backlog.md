# EVE Trade — Backlog des Problèmes Découverts

Ce backlog répertorie les défauts, anomalies et dettes techniques documentés au fil des missions d'audit et de stabilisation.

---

## Statut des Anomalies

| ID | Titre | Statut | Résolu dans | Priorité |
| :--- | :--- | :--- | :--- | :--- |
| **ISSUE-001** | Discordance de statut `/api/health` (HTTP 503 permanent) | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-002** | Taille excessive du bundle frontend initial (8.69 MB unminified) | ⏳ BACKLOG | Non planifié (Post LOT-004) | P2 |
| **ISSUE-003** | Absence de couverture de tests sur la couche HTTP / API Express | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-004** | Absence de smoke test automatisé pour le démarrage du serveur | ✅ RESOLVED | **LOT-002** | P1 |
| **ISSUE-005** | Présence conjointe de `bun.lock` et `package-lock.json` | ⏳ BACKLOG | Non planifié (Nettoyage) | P3 |
| **ISSUE-006** | Composants orphelins / non référencés identifiés dans l'audit initial | ⏳ BACKLOG | Non planifié (Dead code) | P2 |
| **ISSUE-007** | Absence de mock officiel ESI pour tests hors-ligne du proxy marché | ✅ RESOLVED | **LOT-003** | P2 |
| **ISSUE-008** | Vulnérabilité potentielle XSS et rejeu de jeton OAuth dans `/auth/callback` et `/api/auth/token` | ✅ RESOLVED | **LOT-003** | P1 |
| **ISSUE-009** | Absence de validation stricte sur les paramètres d'URL et limites de requêtes | ✅ RESOLVED | **LOT-003** | P1 |
| **ISSUE-010** | Absence de détection du budget d'erreur ESI et de respect de `Retry-After` sur 429 | ✅ RESOLVED | **LOT-003** | P1 |
| **ISSUE-011** | Divulgation d'informations serveur (`x-powered-by`, stack traces) et absence de headers de sécurité | ✅ RESOLVED | **LOT-003** | P2 |

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
* **Statut** : ✅ **RÉSOLU** dans **LOT-003**
* **Correction appliquée** :
  * Implémentation du système d'injection de mocks globaux `setGlobalEsiMock` dans `server/utils/esiClient.ts`.
  * Intégration dans `server/routes/markets.ts`, `server/routes/catalog.ts`, etc.
  * Validation via la suite `server/__tests__/esi_hardening.test.ts` (9 tests hors-ligne déterministes).

---

### ISSUE-008 : Vulnérabilité potentielle XSS et rejeu de jeton OAuth dans `/auth/callback` et `/api/auth/token`
* **ID** : `ISSUE-008`
* **Statut** : ✅ **RÉSOLU** dans **LOT-003 & LOT-003.1**
* **Correction appliquée** :
  * Paramètre `state` rendu strictement obligatoire dans `/api/auth/token` (`MISSING_STATE`).
  * Consommation atomique à usage unique prévenant le rejeu (`INVALID_OR_EXPIRED_STATE`).
  * Sérialiseur anti-XSS `safeJsonStringify` neutralisant les sorties de balises `</script>` (`\u003c`, `\u003e`, `\u0026`) dans la page de callback.
  * Échappement HTML strict `escapeHtml` sur tous les paramètres d'erreur affichés.

---

### ISSUE-009 : Absence de validation stricte sur les paramètres d'URL et limites de requêtes
* **ID** : `ISSUE-009`
* **Statut** : ✅ **RÉSOLU** dans **LOT-003**
* **Correction appliquée** :
  * Validation numérique, bornage et filtrage de `type_id`, `regionId`, `locationId`, `limit`, `page`, `order_type`.
  * Couvert par la suite `server/__tests__/security_hardening.test.ts`.

---

### ISSUE-010 : Absence de détection du budget d'erreur ESI et de respect de `Retry-After` sur 429
* **ID** : `ISSUE-010`
* **Statut** : ✅ **RÉSOLU** dans **LOT-003**
* **Correction appliquée** :
  * Détection de `x-esi-error-limit-remain <= 0` provoquant l'abandon immédiat des retries pour protéger l'IP.
  * Prise en compte du header `Retry-After` sur 429 avec backoff adapté.
  * Couvert par `server/__tests__/esi_hardening.test.ts`.

---

### ISSUE-011 : Divulgation d'informations serveur et absence de politique CORS restrictive
* **ID** : `ISSUE-011`
* **Statut** : ✅ **RÉSOLU** dans **LOT-003 & LOT-003.1**
* **Correction appliquée** :
  * Suppression de l'en-tête `X-Powered-By`.
  * Ajout des en-têtes `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 0`, `Referrer-Policy: strict-origin-when-cross-origin`.
  * Politique CORS basée sur une whitelist stricte via `isAllowedOrigin`, `Vary: Origin`, et 403 Forbidden sur requêtes preflight non autorisées.
  * Limitation de la charge utile JSON à 1 MB et masquage des erreurs internes.
