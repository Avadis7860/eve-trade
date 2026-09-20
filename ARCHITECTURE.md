# 🏗️ Architecture Globale du Système — EVE Trade

Ce document décrit en détail l'architecture logicielle, le cycle de vie des données, les mécanismes de sécurité, la couche de prédiction statistique et la topologie des composants du projet **EVE Trade**.

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
│   - TraderPerformanceModal  - GlobalMarketSyncModal                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     2. COUCHE DOMAINE, SERVICES & PERSISTANCE          │
│   - CatalogRepository       : SSOT du catalogue, états stricts & cache │
│   - CatalogValidator        : Validation de schéma, déduplication & intégrité
│   - CatalogHashing          : Sérialisation canonique & SHA-256 déterministe
│   - AuthService             : Session SSO, Refresh Token, Multi-Comptes│
│   - MarketDataStore         : Store réactif d'ordres & historique      │
│   - IndexedDbStore (v3)     : 9 Object Stores atomiques (avec metadata)│
│   - Scanner                 : Orchestrateur de découverte d'arbitrage  │
│   - OrderAdvisorService     : Analyseur d'ordres & recommandations     │
│   - TraderAnalyticsService  : Appariement FIFO & métriques de gain     │
│   - TypeCatalogService      : Service backend de validation catalogue  │
│   - GlobalMarketSync        : Synchronisation massive inter-hubs       │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│        3. MOTEURS FINANCIERS         │ │     4. BACKEND EXPRESS API    │
│       & PRÉDICTION STATISTIQUE       │ │           (server.ts)         │
│  - FeeEngine (Taxes & Courtage)      │ │  - /api/health (Santé & Status)│
│  - PriceLadderEngine (Profondeur)    │ │  - /api/types/status          │
│  - TradableQuantityEngine (Goulots)  │ │  - /api/types/all (Contrat {meta, types})
│  - ProfitEngine (Décomposition)      │ │  - /api/types/search (Hybride)│
│  - OpportunityScoringEngine (Scores) │ │  - /api/auth/url              │
│  - MarketFeatureEngine (Momentum)    │ │  - /api/auth/token            │
│  - PredictionEngine (Survie, Proba)  │ │  - /api/auth/refresh          │
│  - InterRegionalEngine (Hubs A->B)   │ │  - /api/character/:id/orders  │
│  - PortfolioOptimizer (Allocation)   │ │  - /api/character/:id/wallet  │
│  - MoneyEngine (Formatage ISK)       │ │  - Proxy ESI avec User-Agent  │
└──────────────────────────────────────┘ └───────────────┬───────────────┘
                                                         │
                                                         ▼
                                         ┌───────────────────────────────┐
                                         │  5. CCP GAMES EVE ONLINE API  │
                                         │  - EVE SSO OAuth v2 (JWT)     │
                                         │  - ESI Tranquility Cluster    │
                                         └───────────────────────────────┘
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

## 💾 Entrepôt de Données Persistant & Observations Immuables (`IndexedDbStore` v3)

Pour pallier le caractère volatile du `localStorage` (limité à 5 Mo) et garantir la non-pollution des données de marché, le stockage durable repose sur **IndexedDB v3** (`eve_trade_db`) avec 9 object stores spécialisés :

1. **`snapshots`** : Derniers snapshots d'ordres par paire `type_id:region_id`.
2. **`history`** : Statistiques historiques calculées par paire `type_id:region_id`.
3. **`universe_opportunities`** : Cache persistant des opportunités globales.
4. **`http_cache`** : Cache des réponses HTTP ESI avec ETags et en-têtes d'expiration.
5. **`market_observations`** : Flux immuable *Append-Only* horodaté de captures de carnets (avec clé de déduplication `observation_hash`).
6. **`opportunity_observations`** : Snapshots complets des opportunités au moment de leur détection ($T_0$) pour l'évaluation rétrospective à $T+1\text{h}$, $T+6\text{h}$, $T+24\text{h}$, $T+3\text{j}$, $T+7\text{j}$.
7. **`market_history_daily`** : Séries chronologiques brutes ESI quotidiennes.
8. **`eve_types`** : Référentiel des types résolus et validés.
9. **`catalog_metadata`** : Métadonnées d'intégrité du catalogue (version, checksum SHA-256, count, source, date de persistance).

### Invariant de Remplacement Atomique (`replaceCatalog`)
Afin d'éviter l'accumulation silencieuse de types orphelins ou périmés issue d'anciennes versions, toute mise à jour du catalogue dans IndexedDB exécute une transaction atomique :
* `typesStore.clear()` : Purge intégrale de la table existante.
* Écriture unitaire de la collection validée.
* Enregistrement synchrone des métadonnées cryptographiques dans `catalog_metadata`.

---

## 🔐 Sécurité & Gestion des Identités EVE SSO Durcie

### 1. Authentification OAuth 2.0 (EVE SSO v2)
L'authentification utilise le protocole officiel **EVE Online Single Sign-On (SSO) v2** avec jetons JWT signés :
* **Protection des secrets :** L'échange `authorization_code` $\to$ `tokens` s'effectue exclusivement côté serveur dans `server.ts` via l'en-tête `Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)`.
* **Protection CSRF & State Cryptographique :** Chaque session de connexion génère un `state` cryptographique aléatoire de 32 octets stocké en mémoire côté serveur avec TTL de 10 minutes (`activeOAuthStates`). La validation consomme le jeton immédiatement pour interdire toute réutilisation.
* **Support Multi-Comptes & Persistance Hybride :** `AuthService` maintient la liste des personnages (`EveCharacterSession[]`) via `safeStorage` (supportant le navigateur et l'environnement Node.js/tests).
* **Verrouillage Atomique des Rafraîchissements (Mutex Lock) :** Déduplication stricte des appels simultanés de rafraîchissement (`refreshLockMap`) afin d'éviter les courses critiques d'invalidation de jeton auprès des serveurs CCP.

---

## ⚡ Performance, Observabilité & Fail-Loud

1. **Contrats "Fail-Loud" (Principe `NO DATA ≠ ZERO DATA`) :**
   * Aucune transformation silencieuse d'erreur réseau ou de catalogue en tableau vide ou zéros artificiels.
   * L'API backend et `EsiService` propagent des erreurs explicites avec statuts HTTP appropriés (503, 502, 400).
   * L'interface utilisateur affiche des indicateurs de santé du catalogue avec badge d'avertissement lorsque le mode de secours est activé.
2. **Observabilité & Diagnostic :**
   * Endpoint `/api/health` fournissant l'état du serveur, la mémoire, le statut du catalogue et les sessions actives.
   * Endpoint `/api/types/status` pour la traçabilité de version et du checksum.
   * Endpoint `/api/types/all` exposant le contrat strict `{ metadata, types }`.
   * Journalisation structurée unifiée (`logEvent`) traçant les événements de cycle de vie et les erreurs.
