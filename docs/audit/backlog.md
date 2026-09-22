# EVE Trade — Backlog des Problèmes Découverts (Audit Hors Périmètre)

Ce backlog répertorie les défauts, anomalies et dettes techniques découverts lors de la phase d'inspection et d'établissement de la baseline (**LOT-001**).
Conformément aux directives de la mission, **aucun de ces éléments n'a été corrigé de façon opportune**, afin de préserver l'intégrité de la baseline et d'éviter tout effet de bord avant la mise en place des filets de sécurité.

---

## Liste des Problèmes Découverts

### ISSUE-001 : Discordance de statut dans le router `/api/health` (HTTP 503 permanent)
* **ID** : `ISSUE-001`
* **Description** : L'endpoint `/api/health` retourne systématiquement un code HTTP 503 (`status: "unhealthy"`). `TypeCatalogService.loadCatalog()` initialise le statut du catalogue à `'CATALOG_READY'`, tandis que la condition dans `server/routes/health.ts` teste explicitement `if (catalogMeta.status === 'CATALOG_LOADED')`. Par conséquent, le serveur est considéré comme défaillant par tout orchestrateur ou healthcheck externe malgré le chargement effectif des 20 526 items.
* **Fichier(s)** :
  * `server/routes/health.ts` (lignes 16-25)
  * `src/services/typeCatalog.ts`
* **Risque** : Faux positifs d'indisponibilité en production si un healthcheck HTTP surveille `/api/health`. Risque de redémarrages intempestifs de conteneurs.
* **Priorité estimée** : P1 (Élevée)
* **Phase recommandée** : LOT-002 (Hardening Serveur & Healthcheck)

---

### ISSUE-002 : Taille excessive du bundle frontend initial (8.69 MB unminified)
* **ID** : `ISSUE-002`
* **Description** : La compilation Vite émet un warning de dépassement de chunk (> 500 kB) pour `dist/assets/index-*.js` (8.69 MB non compressé, 1.05 MB gzippé). Cela s'explique par l'inclusion directe en synchrone de catalogues JSON volumineux (`allMarketTypes.json`, `universeData.json`, `marketGroups.json`) dans le chunk principal sans `dynamic import()` ni découpage par chunks (`rollupOptions.manualChunks`).
* **Fichier(s)** :
  * `vite.config.ts`
  * `src/data/allMarketTypes.json`
  * `src/data/universeData.json`
* **Risque** : Temps de chargement initial élevé pour l'utilisateur sur connexions lentes ; surconsommation mémoire du navigateur.
* **Priorité estimée** : P2 (Moyenne)
* **Phase recommandée** : Phase d'optimisation / refactoring assets

---

### ISSUE-003 : Absence de couverture de tests sur la couche HTTP / API Express
* **ID** : `ISSUE-003`
* **Description** : La suite `npm test` existante ne comporte aucun test d'intégration pour les routes d'API Express (`server/routes/*`). Les 22 suites de test couvrent exclusivement `src/engine/__tests__/*` (calculs financiers et algorithmiques). Les mécanismes de proxy ESI, la validation des paramètres de requête, les codes de statut HTTP et la gestion des erreurs réseau ne sont pas testés automatiquement.
* **Fichier(s)** :
  * `server/routes/auth.ts`
  * `server/routes/catalog.ts`
  * `server/routes/markets.ts`
  * `server/routes/characters.ts`
  * `server/routes/universe.ts`
  * `server/routes/health.ts`
* **Risque** : Régressions silencieuses lors de futures modifications du backend ; rupture des contrats d'API avec le client frontend.
* **Priorité estimée** : P1 (Élevée)
* **Phase recommandée** : LOT-002 / Tests d'intégration API

---

### ISSUE-004 : Absence de smoke test automatisé pour le démarrage du serveur
* **ID** : `ISSUE-004`
* **Description** : Aucun test automatisé ne vérifie que `server.ts` ou `dist/server.cjs` peut démarrer sur un port éphémère, monter ses middlewares et s'arrêter proprement sans exception non gérée.
* **Fichier(s)** :
  * `server.ts`
* **Risque** : Risque de régression au démarrage non détecté par la compilation statique (par exemple si une variable d'environnement ou une dépendance native CommonJS/ESM échoue à l'exécution).
* **Priorité estimée** : P1 (Élevée)
* **Phase recommandée** : LOT-002 (Server Startup Regression Test)

---

### ISSUE-005 : Présence conjointe de `bun.lock` et `package-lock.json`
* **ID** : `ISSUE-005`
* **Description** : Le repository contenait originellement `bun.lock` alors que le projet est exécuté et déployé avec Node.js/npm. La génération de `package-lock.json` a été requise pour `npm ci`. La présence de `bun.lock` est redondante si Bun n'est pas le gestionnaire officiel.
* **Fichier(s)** :
  * `bun.lock`
* **Risque** : Confusion sur le gestionnaire de paquets de référence ; dérive potentielle des dépendances si un développeur utilise Bun et un autre npm.
* **Priorité estimée** : P3 (Faible)
* **Phase recommandée** : Phase de gouvernance / nettoyage

---

### ISSUE-006 : Composants orphelins / non référencés identifiés dans l'audit initial
* **ID** : `ISSUE-006`
* **Description** : D'après `MASTER-PLAN.md`, des composants comme `src/components/Sidebar.tsx` ou `src/components/CarnetChart.tsx` sont candidats au statut de code mort. Ils sont toujours présents dans le repository et doivent faire l'objet d'une analyse d'utilisation avant suppression.
* **Fichier(s)** :
  * `src/components/Sidebar.tsx`
  * `src/components/CarnetChart.tsx`
* **Risque** : Dette technique, surface de maintenance inutile.
* **Priorité estimée** : P2 (Moyenne)
* **Phase recommandée** : Phase Cleanup / Dead Code
