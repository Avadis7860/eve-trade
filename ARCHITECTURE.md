# 🏗️ Architecture Globale du Système — EVE Trade

Ce document décrit en détail l'architecture logicielle, le cycle de vie des données, les mécanismes de sécurité, la couche de prédiction statistique, la chaîne de preuve cryptographique et la topologie des composants du projet **EVE Trade**.

---

## 📐 Topologie des Couches Logicielles

L'architecture est découpée en **cinq couches orthogonales** à responsabilités uniques et strictement découplées :

```
┌────────────────────────────────────────────────────────────────────────┐
│                          1. COUCHE PRÉSENTATION                        │
│                   React 18 SPA + Tailwind CSS + Lucide                 │
│   - GlobalScannerView       - PortfolioView        - MyOrdersView      │
│   - OpportunityModal        - CarnetChart          - TradeJournal      │
│   - OrderAdvisorModal       - ConfigurationPanel   - MarketTree        │
│   - TraderPerformanceModal  - GlobalMarketSyncModal- CockpitView       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     2. COUCHE DOMAINE, SERVICES & PERSISTANCE          │
│   - AuthService             : Session SSO, Refresh Token, Multi-Comptes│
│   - EsiService              : Client CCP ESI avec retry et rate-limit  │
│   - MarketDataStore         : Store réactif d'ordres & historique      │
│   - IndexedDbStore (v5)     : 11 Object Stores persistants & audit     │
│   - CatalogRepository       : SSOT du catalogue, états stricts & cache │
│   - TypeCatalogService      : Validation structurelle & cryptographique│
│   - Scanner                 : Orchestrateur d'arbitrage spatialisé     │
│   - MarketOutcomeTracker    : Suivi des résultats empiriques (1h..7j)  │
│   - CharacterTxSyncService  : Ingestion ESI portefeuille & pagination  │
│   - ExecutionTrackingService: Corrélation & cycle de vie d'exécution   │
│   - OrderAdvisorService     : Analyseur d'ordres & recommandations     │
│   - TraderAnalyticsService  : Appariement FIFO & métriques de gain     │
│   - GlobalMarketSync        : Synchronisation massive inter-hubs       │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│        3. MOTEURS FINANCIERS         │ │     4. BACKEND EXPRESS API    │
│    PUR ET SANS EFFETS DE BORD        │ │           (server.ts)         │
│  - FeeEngine (Taxes & Courtage)      │ │  - /api/health (Santé & Stats)│
│  - PriceLadderEngine (Profondeur)    │ │  - /api/types/status          │
│  - TradableQuantityEngine (Goulots)  │ │  - /api/types/all ({meta,tx}) │
│  - ProfitEngine (Décomposition P&L)  │ │  - /api/types/search (Hybride)│
│  - OpportunityScoringEngine (Scores) │ │  - /api/auth/url, token, refr │
│  - OpportunityEvidenceEngine (Preuve)│ │  - /api/character/:id/*       │
│  - FailureSemantics (Santé données)  │ │  - Proxy ESI avec User-Agent  │
│  - MarketFeatureEngine (Momentum)    │ └───────────────┬───────────────┘
│  - PredictionEngine (Survie, Risque) │                 │
│  - InterRegionalEngine (Arbitrage)   │                 ▼
│  - CharacterTransactionEngine (Norm) │ ┌───────────────────────────────┐
│  - ExecutionCorrelationEngine (Match)│ │  5. CCP GAMES EVE ONLINE API  │
│  - ExecutionOutcomeEngine (VWAP/P&L) │ │  - EVE SSO OAuth v2 (JWT)     │
│  - PortfolioOptimizer (Allocation)   │ │  - ESI Tranquility Cluster    │
│  - MoneyEngine (Formatage ISK)       │ └───────────────────────────────┘
└──────────────────────────────────────┘
```

---

## 📚 Vérité Architecturale sur le Catalogue EVE & Déterminisme

### 1. Vérité sur les Données Embarquées
* Le jeu EVE Online compte plus de 15 801 types échangeables sur le marché.
* Le référentiel statique embarqué dans le dépôt (`src/data/allMarketTypes.json`) contient une collection noyau vérifiée de **53 types de base** (minéraux majeurs, PLEX, injecteurs, coques de combat emblématiques).
* **Invariant de Transparence :** Ce jeu de 53 types est explicitement typé `CATALOG_FALLBACK_CORE`. L'architecture **interdit formellement** de prétendre qu'un catalogue de secours est un catalogue universel complet (`CATALOG_READY`). Le frontend affiche un badge ambré transparent "Noyau (53)" et un bandeau de mode dégradé explicite.

### 2. Hachage Déterministe Canonique (`CatalogHashing`)
* L'empreinte cryptographique (`checksum`) ne dépend jamais du formatage du fichier, des retours à la ligne ou de l'ordre d'insertion.
* Chaque enregistrement est normalisé selon une projection stricte (`type_id`, `name`, `group_id`, `category_id`, `volume`, `packaged_volume`, `portion_size`, `average_price`, `adjusted_price`).
* Les enregistrements sont triés par `type_id` croissant de façon déterministe avant la sérialisation JSON canonique et le calcul SHA-256.

### 3. Validation de Contrat & Déduplication (`CatalogValidator`)
* Tout élément possédant un `type_id` non entier ou $\le 0$, un nom vide, ou un volume négatif/NaN est rejeté immédiatement avec motif traçable.
* En cas de doublon sur `type_id`, l'enregistrement le plus récent est conservé et une anomalie est consignée.
* Un catalogue est classifié `CATALOG_CORRUPTED` si son empreinte calculée diverge de l'empreinte contractuelle déclarée ou si le nombre d'éléments diverge.

### 4. Isolation de la Découverte Dynamique ESI
* Lorsque des types hors-catalogue sont recherchés via `/api/types/search` et résolus via l'endpoint ESI `/universe/ids/`, ils sont enregistrés dans un registre séparé (`dynamicTypesRegistry`).
* Le catalogue canonique immuable n'est **jamais muté en mémoire**.

---

## 🛡️ Chaîne de Preuve Auditable & Certification 4 Piliers (`OpportunityEvidence`)

L'architecture EVE Trade répond de manière déterministe et vérifiable à la question : **« Pourquoi cette opportunité a-t-elle été considérée comme actionnable à cet instant précis ? »**.

### 1. Modèle de Preuve Immuable (`OpportunityEvidence`)
Chaque opportunité produite par `InterRegionalFinancialEngine` est liée de façon indissociable à un instantané complet de preuve contenant :
* **Identifiant & Horodatage :** `opportunity_id`, `detected_at`.
* **Version du protocole de certification :** `certification_version` (`4-pillars-v1`).
* **Statut de certification :** `certification_status` (`CERTIFIED`, `DEGRADED`, `REJECTED`).
* **Prouvance des Données de Marché :** Snapshots de carnet source/destination, empreintes d'ordres (`source_market_hash`, `dest_market_hash`), statuts de santé (`HEALTHY`, `STALE`, `PARTIAL`, `ERROR`).
* **Prouvance du Catalogue :** Version de catalogue, checksum SHA-256 du catalogue, statut de résolution du type (`RESOLVED_CATALOG`, `RESOLVED_DYNAMIC`, `TYPE_UNKNOWN`).
* **Prouvance Spatiale de l'Univers :** Résolution des stations/structures source et destination, validation de la route de saut (`JumpRoute`) avec cohérence des systèmes solaires.
* **Intrants et Extrants Financiers Déterministes :** Quantité exécutable, prix effectifs slippage-adjusted, taxes, frais de courtage, fret, profit net, ROI et goulot d'étranglement (`capital`, `cargo`, `source_market`, `destination_market`).
* **Évaluations Détaillées des 4 Piliers :** Statuts explicites `PASS`, `DEGRADED` ou `FAIL` pour chacun des 4 piliers.

### 2. Hachage Déterministe & Sérialisation Canonique (`OpportunityEvidenceEngine`)
* **Canonicalisation :** Clés d'objets triées lexicographiquement, tableaux de chaînes normalisés, nombres à virgule flottante arrondis à 6 décimales pour éliminer toute variation d'arrondi binaire.
* **Calcul SHA-256 :** Empreinte hexadécimale de 64 caractères (`evidence_hash`) calculée sur la sérialisation canonique (excluant le champ récursif `evidence_hash`).
* **Auditabilité & Détection d'Altération :** La méthode statique `OpportunityEvidenceEngine.verifyEvidence(evidence)` recalcule l'empreinte et vérifie l'intégrité logique des 4 piliers. Toute altération des prix, des statuts ou des données d'entrée invalide immédiatement la preuve.

---

## 📈 Suivi Empirique des Résultats de Marché (`MarketOutcomeTracker`)

Le système assure la validation empirique de ses modèles prédictifs grâce à un suivi d'évolution à plusieurs horizons :
* **Horizons Standardisés :** `1h`, `6h`, `24h`, `3d`, `7d`.
* **Immuabilité de l'Observation $T_0$ :** Le snapshot initial et le `evidence_hash` sont intouchables.
* **Instantané de Résultat (`OpportunityOutcomeSnapshot`) :**
  * `real_spread_isk` et `real_spread_pct` : Différentiel empirique observé à l'horizon $T+H$.
  * `spread_decay_pct` : Pourcentage d'érosion ou d'expansion du spread ($1 - \frac{Spread_{TH}}{Spread_{T0}}$).
  * `captured_volume` : Quantité d'ordres consommée ou disparue sur les carnets.
  * `outcome_status` : `SURVIVED` (spread $\ge 50\%$ préservé), `DECAYED` (spread résiduel $< 50\%$), `INVERTED` (spread négatif), `EXHAUSTED` (carnet épuisé).
* **Stockage Non-Destructif :** Enrichissement incrémental du dictionnaire `opportunity_observations.outcomes[horizon]` dans IndexedDB.

---

## 💼 Ingestion des Transactions & Corrélation d'Exécution (Phase 2B)

### 1. Ingestion ESI Résiliente (`CharacterTransactionSyncService`)
* **Pagination via Ancre `from_id` :** Navigation descendante dans l'historique CCP ESI `/characters/{character_id}/wallet/transactions/` avec jonction automatique sur le dernier `transaction_id` connu localement (*gap bridging*).
* **Gestion du Rate Limiting & Error Budget :**
  * Respect de `X-Esi-Error-Limit-Remain` et `X-Esi-Error-Limit-Reset`.
  * Gestion exponentielle de `HTTP 429 Too Many Requests` avec lecture de l'en-tête `Retry-After`.
  * Interception globale de `HTTP 420 Enhance Your Calm`.
* **Validation & Normalisation Pure (`CharacterTransactionEngine`) :**
  * Rejet strict des identifiants non sécurisés via `Number.isSafeInteger`.
  * Élimination des identifiants synthétiques (`transaction_id=0` ou `order_id` inventé).
  * Préservation immuable des faits historiques et des horodatages ISO-8601 UTC.

### 2. Moteur de Corrélation d'Exécution (`ExecutionCorrelationEngine`)
* **Évaluation Multicritère sur 5 Piliers :**
  1. *Identité :* Correspondance exacte de `type_id`.
  2. *Localisation :* Correspondance exacte de station ou appartenance au système/région cible.
  3. *Fenêtre Temporelle :* Transaction survenue après `detected_at` dans une fenêtre tolérée (jusqu'à 72h).
  4. *Alignement de Prix :* Proximité du prix réel avec le prix d'achat/vente estimé ($\le 15\%$).
  5. *Cohérence de Volume :* Compatibilité des quantités avec le carnet observé.
* **Niveaux d'Appariement :**
  * `DIRECT_MATCH` : Correspondance exacte de station, prix $< 5\%$ et fenêtre $< 24\text{h}$.
  * `STRONG_MATCH` : Correspondance spatiale et prix $< 10\%$.
  * `PROBABLE_MATCH` : Correspondance régionale et prix toléré.
  * `AMBIGUOUS` : Multiples opportunités candidates en concurrence.
  * `UNMATCHED` : Transaction sans opportunité correspondante (traçabilité préservée).
* **Isolation Inter-Personnages :** Interdiction formelle d'attribuer une transaction à un enregistrement d'un autre personnage (`CrossCharacterMappingViolationError`).

### 3. Calcul du Cycle de Vie d'Exécution & VWAP (`ExecutionOutcomeEngine`)
* **Appariement FIFO des Lots d'Achat et de Vente :**
  * Déduction du *Buy VWAP* (Volume Weighted Average Price) et du *Sell VWAP*.
  * Calcul exact du revenu brut, du coût brut, des frais déduits et du profit net réalisé.
  * Évaluation du taux de remplissage (*Execution Rate %*).
* **Statuts de Cycle de Vie :** `NOT_STARTED`, `BUY_PARTIAL`, `BOUGHT`, `SELL_PARTIAL`, `CLOSED`, `AMBIGUOUS`.
* **Détection des Incohérences d'Inventaire :** Marquage explicite `has_inventory_inconsistency = true` et `data_state = PARTIAL` en cas de vente sans achat préalable ou de volume de vente excédentaire.

---

## 💾 Entrepôt de Données Persistant IndexedDB v5 (`IndexedDbStore`)

Le stockage durable repose sur **IndexedDB v5** (`eve_trade_durable_store`) avec 11 magasins d'objets indexés :

| Magasin d'Objets | Clé Primaire | Index Principaux | Rôle & Contenu |
| :--- | :--- | :--- | :--- |
| **`snapshots`** | `type_id:region_id` | *(clé directe)* | Derniers snapshots complets de carnet d'ordres. |
| **`history`** | `type_id:region_id` | *(clé directe)* | Statistiques historiques calculées (médianes, volatilité). |
| **`universe_opportunities`** | `opportunity_id` | `detected_at` | Cache des opportunités détectées lors des scans globaux. |
| **`http_cache`** | `url` | `cached_at` | Réponses HTTP ESI avec ETags et en-têtes d'expiration. |
| **`market_observations`** | `observation_id` | `type_id`, `region_id`, `observation_hash`, `timestamp` | Flux immuable *Append-Only* dédupliqué des carnets. |
| **`opportunity_observations`** | `observation_id` | `opportunity_id`, `evidence_hash`, `type_id`, `source_region_id`, `dest_region_id`, `timestamp` | Preuves immuables à $T_0$ et résultats empiriques ($T+1\text{h}..7\text{j}$). |
| **`market_history_daily`** | `type_id:region_id` | *(clé directe)* | Séries chronologiques brutes ESI quotidiennes. |
| **`eve_types`** | `type_id` | `name` | Référentiel des types résolus et validés. |
| **`catalog_metadata`** | `key` | *(clé directe)* | Métadonnées d'intégrité (version, checksum SHA-256, count, date). |
| **`character_transactions`** | `transaction_id` | `character_id`, `type_id`, `location_id`, `timestamp`, `data_state` | Transactions portefeuille ESI normalisées et validées. |
| **`character_executions`** | `execution_id` | `character_id`, `observation_id`, `opportunity_id`, `match_level`, `data_state` | Enregistrements de suivi d'exécution corrélés et audités. |

### Invariant de Remplacement Atomique (`replaceCatalog`)
Toute mise à jour du catalogue dans IndexedDB exécute une transaction atomique :
* `typesStore.clear()` : Purge intégrale de la table existante.
* Écriture unitaire de la collection validée.
* Enregistrement synchrone des métadonnées cryptographiques dans `catalog_metadata`.

---

## 🔐 Sécurité & Gestion des Identités EVE SSO v2 Durcie

### 1. Authentification OAuth 2.0 (EVE SSO v2)
L'authentification utilise le protocole officiel **EVE Online Single Sign-On (SSO) v2** avec jetons JWT signés :
* **Protection des secrets :** L'échange `authorization_code` $\to$ `tokens` s'effectue exclusivement côté serveur dans `server.ts` via l'en-tête `Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)`.
* **Protection CSRF & State Cryptographique :** Chaque session de connexion génère un `state` cryptographique aléatoire de 32 octets stocké en mémoire côté serveur avec TTL de 10 minutes (`activeOAuthStates`). La validation consomme le jeton immédiatement pour interdire toute réutilisation.
* **Support Multi-Comptes & Persistance Hybride :** `AuthService` maintient la liste des personnages (`EveCharacterSession[]`) via `safeStorage` (supportant le navigateur et l'environnement Node.js/tests).
* **Verrouillage Atomique des Rafraîchissements (Mutex Lock) :** Déduplication stricte des appels simultanés de rafraîchissement (`refreshLockMap`) afin d'éviter les courses critiques d'invalidation de jeton auprès des serveurs CCP.

---

## ⚡ Performance, Observabilité & Sémantique "Fail-Loud"

1. **Contrats "Fail-Loud" (Principe `NO DATA ≠ ZERO DATA`) :**
   * Aucune transformation silencieuse d'erreur réseau ou de catalogue en tableau vide ou zéros artificiels.
   * L'API backend et `EsiService` propagent des erreurs explicites avec statuts HTTP appropriés (503, 502, 400).
   * L'interface utilisateur affiche des indicateurs de santé du catalogue avec badge d'avertissement lorsque le mode de secours est activé.
2. **Observabilité & Diagnostic :**
   * Endpoint `/api/health` fournissant l'état du serveur, la mémoire, le statut du catalogue et les sessions actives.
   * Endpoint `/api/types/status` pour la traçabilité de version et du checksum.
   * Endpoint `/api/types/all` exposant le contrat strict `{ metadata, types }`.
   * Journalisation structurée unifiée (`logEvent`) traçant les événements de cycle de vie et les erreurs.

