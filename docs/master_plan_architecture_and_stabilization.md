# Master-Plan de Stabilisation & Refonte Architecturale : EVE Trade

Ce document constitue le **Master-Plan Opérationnel de Référence** élaboré à la suite de l'audit technique approfondi du dépôt `Avadis7860/eve-trade`. Il formalise la feuille de route pour faire passer le score de maturité global de **61/100 à plus de 85/100** sans ajouter de dette fonctionnelle.

---

## 🎯 1. Contexte & Diagnostic de l'Audit

### 1.1 Matrice des Scores Actuels vs Cibles

| Domaine d'Évaluation               | Score Actuel | Statut | Score Cible (Post-Refactor) | Priorité |
| :--------------------------------- | -----------: | :----: | --------------------------: | :------: |
| **Catalogues / Données Univers**   |   **43/100** |   🔴   |                     **95+** |  **P0**  |
| **Architecture & Maintenabilité**  |   **49/100** |   🔴   |                     **90+** |  **P0**  |
| **Persistance des Personnages**    |   **55/100** | 🔴/🟠  |                     **95+** |  **P1**  |
| **Gestion & Résolution des IDs**   |   **58/100** |   🟠   |                     **95+** |  **P1**  |
| **UI & Adaptabilité Responsive**   |   **57/100** | 🔴/🟠  |                     **90+** |  **P1**  |
| **Qualité du Code & Modularité**   |   **61/100** |   🟠   |                     **90+** |  **P2**  |
| **Tests d'Intégration & Vérif.**   |   **67/100** |   🟠   |                     **90+** |  **P2**  |
| **Performance & Scalabilité**      |   **72/100** | 🟢/🟠  |                     **90+** |  **P2**  |
| **Résilience ESI & Réseau**        |   **73/100** | 🟢/🟠  |                     **90+** |  **P2**  |
| **Moteurs Financiers & Invariants**|   **78/100** |   🟢   |                     **95+** |  **P2**  |
| **OAuth & Sécurité EVE SSO**       |   **82/100** |   🟢   |                     **95+** |  **P2**  |
| **SCORE GLOBAL**                   |   **61/100** |   🟠   |                     **92+** |  —       |

### 1.2 Le Paradoxe Fondamental d'EVE Trade
Les moteurs mathématiques purs (`/src/engine/*`) et la sécurité SSO (`AuthService`, CSRF tokens, whitelist) ont atteint un niveau de rigueur élevé. Cependant, **l'infrastructure de données et l'orchestration logicielle autour de ces moteurs demeurent fragmentées**. 

Les symptômes majeurs relevés par l'audit sont :
1. **La fausse promesse des 15 801 types** : L'interface clame « 15,801+ database cache », mais le catalogue effectif se rabat sur un sous-ensemble statique de 38 types (`allMarketTypes.json` et `EVE_TYPES_CATALOG`).
2. **La concurrence des sources de vérité** : Cinq canaux d'accès coexistent (`EVE_TYPES_CATALOG`, `TypeCatalogService`, `IndexedDbStore`, `customTypes`, `ESI live`), créant des incohérences de décompte et des résolutions de noms erronées (`Type #123456`).
3. **Le découplage Session vs Données Personnage** : L'identité OAuth persiste, mais le portefeuille, les compétences, les ordres et les transactions sont reconstruits de façon volatile à chaque rafraîchissement sans historique unifié.
4. **L'invention de métadonnées (`normalizeSession`)** : Si `expires_at` est manquant, le code forge arbitrairement `Date.now() + 20 minutes`, violant la règle d'or d'exactitude des données.
5. **Les deux géants monolithiques** : `App.tsx` (~49 KB) et `server.ts` (~49 KB) cumulent l'ensemble des responsabilités système.
6. **Le débordement UI sur écrans intermédiaires** : Des barres de navigation et des montants en ISK rigides causent des chevauchements visuels à certaines largeurs d'écran.

---

## 🏛️ 2. Principes Directeurs de la Refonte Architecturale

```
                           CCP ESI & SDE Dataset
                                    │
                                    ▼
                         ┌────────────────────┐
                         │   Data Ingestion   │
                         │ & Validation Layer │
                         └──────────┬─────────┘
                                    │
                                    ▼
                         ┌────────────────────┐
                         │ Single Source of   │
                         │  Truth Repository  │
                         │(Catalog & Universe)│
                         └──────────┬─────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
       ┌────────────────────┐              ┌────────────────────┐
       │ IndexedDB Tier-1   │              │ Memory Indexed Map │
       │ Persistent Storage │              │ (O(1) ID Lookups)  │
       └──────────┬─────────┘              └──────────┬─────────┘
                  └─────────────────┬─────────────────┘
                                    ▼
                         ┌────────────────────┐
                         │ Deterministic Pure │
                         │ Trading Engines    │
                         └──────────┬─────────┘
                                    │
                                    ▼
                         ┌────────────────────┐
                         │  Modular UI Shell  │
                         │ & Domain Providers │
                         └────────────────────┘
```

### Règle 1 : La Source Unique de Vérité (SSOT)
Aucun composant, moteur ou service ne doit manipuler de liste de types codée en dur. Tout type, station, système ou région provient exclusivement du **CatalogRepository** et de l'**UniverseRepository**.

### Règle 2 : L'Identifiant comme Identité Canonique
La logique métier traite **exclusivement** :
* `type_id`
* `region_id`
* `system_id`
* `station_id` / `location_id`

Les chaînes de caractères (`name`, `station_name`, `system_name`) ne sont générées qu'au niveau de la vue (projections d'affichage).

### Règle 3 : Traçabilité Temporelle & Zéro Donnée Fabriquée
Toute donnée sans timestamp de synchronisation ou sans expiration valide est classée `UNKNOWN` ou `EXPIRED` et soumise à réévaluation, jamais prolongée artificiellement.

---

## 🗺️ 3. Feuille de Route en 6 Phases Opérationnelles

### Phase 0 — Point Zéro, Audit du Code Mort & Matrice de Décompte (P0)
* **Matrice de cohérence initiale** : Mesurer et journaliser la cohérence des décomptes :
  $$\text{Server Catalog} \equiv \text{IndexedDB Cache} \equiv \text{Universe Static} \equiv \text{UI Available Types}$$
* **Inventaire du code mort** :
  * Identifier et marquer pour dépréciation les interfaces `Backward compatibility` orphelines dans `src/types.ts`.
  * Recenser les résolutions locales de stations isolées (`KNOWN_STATION_NAMES`) pour les fusionner dans l'Universe Repository.

### Phase 1 — Source Unique de Vérité Catalogue & Univers (P0)
* **Création de `src/domain/catalog/`** :
  * `CatalogRepository.ts` : Point d'accès unique en mémoire et disque pour tous les types EVE. Indexation par `Map<number, EveTypeDetail>` pour des recherches $O(1)$.
  * `CatalogValidator.ts` : Validation stricte (IDs entiers positifs, noms non vides, volumes réels $\ge 0$, cohérence `group_id` / `category_id`).
  * `CatalogMetadata.ts` : Gestion des états déterministes : `UNINITIALIZED`, `LOADING`, `READY`, `DEGRADED`, `CORRUPTED`.
* **Génération et Intégration du Dataset Universel** :
  * Séparer formellement l'**indexation du catalogue** (référentiel des types, groupes, catégories) de la **synchronisation du marché** (seuls les types liquides sont interrogés pour les ordres).
  * Bannir l'utilisation de `EVE_TYPES_CATALOG` en tant que source de données parallèle dans `App.tsx`, `MarketTree.tsx`, `GlobalMarketSync.ts` et `Scanner.ts`.

### Phase 2 — Normalisation des IDs & Universe Repository (P1)
* **Création de `src/domain/universe/`** :
  * `UniverseRepository.ts` : Gestionnaire unifié des entités spatiales.
    * `getRegion(regionId: number): MarketRegion`
    * `getSystem(systemId: number): SolarSystem`
    * `getStation(stationId: number): MarketStation`
    * `resolveLocation(locationId: number): Promise<LocationResolution>` (avec distinction claire Station NPC vs Structure Citadelle Upwell).
* **Refonte de la résolution spatiale** :
  * Remplacement des lookups textuels par des résolutions `station_id` et `system_id` canoniques.
  * Respect inconditionnel de la portée des ordres d'achat (`order_range`: station, solar_system, region, $N$ jumps).

### Phase 3 — Architecture de Persistance Personnage Découplée (P1)
* **Séparation formelle des responsabilités** :
  * `CharacterIdentity` : `character_id`, `character_name`, `portrait_url`, `scopes`, tokens chiffrés/sécurisés.
  * `CharacterSnapshot` : `wallet_balance`, `skills`, `active_orders`, `order_history`, `transactions`, `journal` avec `fetched_at` et statut de fraîcheur.
  * `CharacterAnalytics` : Calculs de performance (FIFO, profit réalisé, win rate, turnover) calculés par `traderAnalytics.ts`.
* **Élimination de l'écriture directe serveur $\to$ `localStorage`** :
  * Le callback serveur renvoie les jetons et le profil validé au client.
  * Seul `CharacterRepository` / `AuthService` a le droit d'écrire dans la persistance locale navigateur via un schéma unifié v3.
  * Suppression définitive des clés legacy : `eve_char_session`, `eve_linked_characters`, `eve_active_character_id`.
* **Correction critique de `normalizeSession`** :
  * Remplacement de l'attribution artificielle de 20 minutes par une politique `UNKNOWN_EXPIRATION` $\to$ revalidation immédiate auprès d'EVE SSO.

### Phase 4 — Découpage Modulaire d'`App.tsx` & `server.ts` (P2)
* **Découpage d'`App.tsx` (~49 KB) en Architecture Provider** :
  * `src/context/AuthProvider.tsx` : État SSO, multi-comptes, bascule de personnage actif.
  * `src/context/CatalogProvider.tsx` : État du catalogue, recherche, favoris, catégories.
  * `src/context/CharacterDataProvider.tsx` : Snapshot wallet, skills, ordres, actualisation automatique en tâche de fond.
  * `src/context/TradingConfigProvider.tsx` : Paramètres de fret, capital, taxes et filtres de sécurité.
  * `App.tsx` devient un **AppShell** épuré (< 15 KB) gérant la disposition et la navigation.
* **Découpage de `server.ts` (~49 KB) en Routeurs Express Spécialisés** :
  * `server/routes/auth.ts` : Initialisation SSO, callback, refresh, validation PKCE/State.
  * `server/routes/catalog.ts` : Endpoints `/api/types/*` et validation de checksum.
  * `server/routes/markets.ts` : Proxy ESI avec cache HTTP serveur intelligent et ETag.
  * `server/routes/characters.ts` : Proxy wallet, skills, transactions avec validation de token.
  * `server/routes/universe.ts` : Résolution universelle de stations, systèmes et structures.

### Phase 5 — Robustesse Ergonomique & Adaptabilité Responsive (P2)
* **Hiérarchisation Responsive à 3 Paliers Stricts** :
  * `Desktop (≥ 1280px)` : Layout étendu multi-colonnes, sidebar d'arborescence permanente, cockpit complet.
  * `Compact / Tablette (768px - 1279px)` : Sidebar rétractable, navigation icône + label compact, grille adaptative.
  * `Mobile (< 768px)` : Tiroir de navigation bas de page (bottom bar / drawer), masquage des colonnes non prioritaires du carnet.
* **Formatage & Sécurité Typographique des Montants ISK** :
  * Application systématique de `tabular-nums` et `min-w-0` sur les conteneurs de prix.
  * Prévention absolue des débordements de texte sur les nombres à 10 chiffres (milliards d'ISK) grâce à un dimensionnement adaptatif (`formatCompactIsk` vs `formatIsk`).

### Phase 6 — Tests d'Intégration Systémiques & Certification Qualité (P2)
* **Création d'une suite de tests d'intégration** :
  * `catalog_pipeline.test.ts` : Ingestion disque $\to$ Validation checksum $\to$ Stockage IndexedDB $\to$ Résolution O(1).
  * `session_persistence.test.ts` : Multi-personnages $\to$ Expiration $\to$ Refresh lock $\to$ Rechargement navigateur sans perte d'état.
  * `spatial_universe.test.ts` : Résolution canonique ID $\to$ Station / Système $\to$ Détection d'inaccessibilité de structure.
* **Validation des 3 Invariants d'Assurance Qualité** :
  1. `npm test` : 100% de réussite sur toutes les suites (moteurs mathématiques + nouveaux tests d'intégration).
  2. `npm run lint` : 0 erreur de typage TypeScript (`tsc --noEmit`).
  3. `npm run build` : Compilation complète et bundling sans régression de taille ou de performance.

---

## 📊 4. Matrice de Risques & Stratégies d'Atténuation

| Risque Identifié | Impact | Probabilité | Stratégie d'Atténuation |
| :--- | :--- | :--- | :--- |
| **Régression sur les moteurs de trading purs** | Critique | Faible | Règle d'or : `/src/engine/*` demeure strictement intact et mathématiquement pur. Aucune dépendance réseau ou React. |
| **Rupture de compatibilité des sessions utilisateurs existantes** | Majeur | Modérée | Implémenter une migration transparente unique (v1/v2 $\to$ v3) lors du premier boot de `CharacterRepository`. |
| **Surcharge mémoire liée à 15 000+ types en mémoire** | Modéré | Faible | Indexation par `Map<number, EveTypeDetail>` et structures légères (empreinte < 8 Mo en RAM, virtuelle pour le DOM). |
| **Timeout ESI lors de synchronisations massives** | Majeur | Modérée | Séparer le catalogue statique de l'interrogation dynamique des carnets. Découper les requêtes en lots résilients avec reprise sur incident. |

---

## 🏁 5. Critères d'Accomplissement de la Mission (Definition of Done)

* [ ] Le catalogue de types fonctionne sur une source de vérité unique avec validation, statut explicite et intégrité vérifiable.
* [ ] La coexistence conflictuelle de listes de types codées en dur est éradiquée.
* [ ] Les identifiants (`type_id`, `station_id`, etc.) gouvernent 100% des flux de calculs et de données ; les noms ne sont que des projections d'affichage.
* [ ] Les données des personnages (portefeuille, compétences, ordres) persistent avec un horodatage d'observation clair après rechargement de page.
* [ ] Le serveur et le client n'inventent aucune valeur d'expiration de session en cas d'absence d'information.
* [ ] `App.tsx` et `server.ts` sont modularisés en routeurs et contextes spécialisés.
* [ ] L'interface s'adapte sans chevauchement ni rupture d'alignement de 480px à 1920px+.
* [ ] L'ensemble des tests mathématiques et d'intégration passe au vert (`npm test`), le linter est immaculé (`npm run lint`), et le build de production s'exécute sans erreur (`npm run build`).
