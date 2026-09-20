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
│                     2. COUCHE SERVICES & PERSISTANCE                   │
│   - AuthService             : Session SSO, Refresh Token, Multi-Comptes│
│   - MarketDataStore         : Store réactif d'ordres & historique      │
│   - IndexedDbStore          : 8 Object Stores (Observations, Historique)│
│   - Scanner                 : Orchestrateur de découverte d'arbitrage  │
│   - OrderAdvisorService     : Analyseur d'ordres & recommandations     │
│   - TraderAnalyticsService  : Appariement FIFO & métriques de gain     │
│   - TypeCatalogService      : Intégrité SHA-256 & 15 801+ types        │
│   - GlobalMarketSync        : Synchronisation massive inter-hubs       │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│        3. MOTEURS FINANCIERS         │ │     4. BACKEND EXPRESS API    │
│       & PRÉDICTION STATISTIQUE       │ │           (server.ts)         │
│  - FeeEngine (Taxes & Courtage)      │ │  - /api/health (Santé & Status)│
│  - PriceLadderEngine (Profondeur)    │ │  - /api/types/status          │
│  - TradableQuantityEngine (Goulots)  │ │  - /api/types/all (Catalogue) │
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

## 🔄 Flux de Données & Cycle de Vie d'une Opportunité

Voici la séquence exacte suivie lors de la recherche, de l'évaluation et de la prévision d'une opportunité d'arbitrage :

```
1. Synchronisation des Ordres & Séries Historiques
   [ESI API] ──> [EsiService / Server Proxy] ──> [IndexedDbStore + MarketDataStore]
                                                      │
                                                      ├──> Enregistrement MarketObservation (Append-Only)
                                                      └──> Mise en cache DailyMarketHistory[]

2. Pipeline de Calcul Financier & Goulots d'Étranglement
   [Scanner] 
      │
      ├──> [Universe Data] : Définition des Hubs (ex: Jita IV-4 -> Amarr VIII)
      │
      ├──> [InterRegionalFinancialEngine.filterAccessibleOrdersForHub]
      │       * Élimine les ordres hors stations ou hors portée
      │
      ├──> [PriceLadderEngine.buildSellLadder & buildBuyLadder]
      │       * Agrège les ordres par palier de prix
      │
      ├──> [TradableQuantityEngine.calculateMaxTradableQuantity]
      │       * Résout : min(Capital, Cargo, Source Depth, Destination Depth)
      │       * Identifie le goulot d'étranglement déterministe
      │
      ├──> [PriceLadderEngine.simulateFill]
      │       * Simule l'achat et la vente réels avec slippage
      │       * Calcule P_effective_buy et P_effective_sell
      │
      ├──> [ProfitEngine.calculateProfit]
      │       * Applique Sales Tax, Broker Fees (NPC / Upwell) et Coûts de Fret
      │       * Calcule le Profit Net, ROI et Marge
      │
      ├──> [OpportunityScoringEngine.scoreOpportunity]
      │       * Évalue les 10 dimensions de performance selon le profil trader
      │       * Applique la décote de rotation et liquidité (Capturable Profit)
      │       * Contrôle les anomalies de prix unitaire (> 60% ROI ou hors médiane 30j)
      │
      ├──> [MarketFeatureEngine.extractFeatures]
      │       * Calcule le momentum du spread (1h, 24h), l'accélération du volume,
      │         la vélocité concurrentielle et la persistance
      │
      └──> [PredictionEngine.predictOpportunity]
              * Calcule la probabilité de survie du spread P_survival (%)
              * Calcule la probabilité de réalisation du profit P_realization (%)
              * Établit l'espérance de profit réalisé et le niveau de risque (low, moderate, elevated, speculative)
              * Découple le score d'opportunité (attractivité) de la confiance statistique
```

---

## 💾 Entrepôt de Données Persistant & Observations Immuables (`IndexedDbStore`)

Pour pallier le caractère volatile du `localStorage` (limité à 5 Mo) et permettre l'apprentissage statistique sur séries temporelles, le stockage durable repose sur **IndexedDB v2** (`eve_trade_db`) avec fallback en mémoire :

1. **`snapshots`** : Derniers snapshots d'ordres par paire `type_id:region_id`.
2. **`history`** : Statistiques historiques calculées par paire `type_id:region_id`.
3. **`universe_opportunities`** : Cache persistant des opportunités globales.
4. **`http_cache`** : Cache des réponses HTTP ESI avec ETags et en-têtes d'expiration.
5. **`market_observations`** : Flux immuable *Append-Only* horodaté de captures de carnets (avec clé de déduplication `observation_hash`).
6. **`opportunity_observations`** : Snapshots complets des opportunités au moment de leur détection ($T_0$) pour l'évaluation rétrospective à $T+1\text{h}$, $T+6\text{h}$, $T+24\text{h}$, $T+3\text{j}$, $T+7\text{j}$.
7. **`market_history_daily`** : Séries chronologiques brutes ESI quotidiennes (date, volume, moyenne, haut, bas, nombre d'ordres).
8. **`eve_types`** : Référentiel permanent des 15 801+ types d'objets résolus.

---

## 🔐 Sécurité & Gestion des Identités EVE SSO Durcie

### 1. Authentification OAuth 2.0 (EVE SSO v2)
L'authentification utilise le protocole officiel **EVE Online Single Sign-On (SSO) v2** avec jetons JWT signés :
* **Scopes demandés :**
  * `esi-markets.read_character_orders.v1` (Lecture des ordres actifs)
  * `esi-wallet.read_character_wallet.v1` (Solde du portefeuille et transactions)
  * `esi-skills.read_skills.v1` (Niveaux de compétences *Accounting* & *Broker Relations*)
  * `publicData`
* **Protection des secrets :** L'échange `authorization_code` $\to$ `tokens` s'effectue exclusivement côté serveur dans `server.ts` via l'en-tête `Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)`.
* **Protection CSRF & State Cryptographique :** Chaque session de connexion génère un `state` cryptographique aléatoire de 32 octets stocké en mémoire côté serveur avec TTL de 10 minutes (`activeOAuthStates`). La validation consomme le jeton immédiatement pour interdire toute réutilisation.
* **Support Multi-Comptes & Persistance Hybride :** `AuthService` maintient la liste des personnages (`EveCharacterSession[]`) via `safeStorage` (supportant le navigateur et l'environnement Node.js/tests).
* **Verrouillage Atomique des Rafraîchissements (Mutex Lock) :** Déduplication stricte des appels simultanés de rafraîchissement (`refreshLockMap`) afin d'éviter les courses critiques d'invalidation de jeton auprès des serveurs CCP.

---

## ⚡ Performance, Intégrité du Catalogue & "Fail-Loud"

1. **Service Centralisé de Catalogue (`TypeCatalogService`) :**
   * Chargement déterministe avec validation structurelle de chaque type.
   * Calcul d'empreinte cryptographique SHA-256 (`checksum`) sur les données brutes.
   * Gestion d'états formelle : `CATALOG_LOADED`, `CATALOG_FALLBACK_CORE`, `CATALOG_CORRUPTED`, `CATALOG_UNAVAILABLE`.
   * Fallback de secours vérifié (`EVE_TYPES_CATALOG`) pour garantir la disponibilité en cas de corruption ou d'absence du fichier.
2. **Résolution Universelle des Types (15 801+ Articles) :**
   * Recherche hybride locale / distante `/api/types/search` s'appuyant sur le catalogue embarqué et l'endpoint ESI `/universe/ids/`.
   * Mise en cache transparente dans IndexedDB (`eve_types`).
3. **Contrats "Fail-Loud" (Principe `NO DATA ≠ ZERO DATA`) :**
   * Aucune transformation silencieuse d'erreur de requête ou de catalogue en tableau vide.
   * L'API backend et `EsiService` propagent des erreurs explicites avec statuts HTTP appropriés (503, 502, 400).
   * L'interface utilisateur affiche des indicateurs de santé du catalogue avec badge d'avertissement lorsque le mode de secours est activé.
4. **Observabilité & Diagnostic :**
   * Endpoint de santé `/api/health` fournissant l'état du serveur, la mémoire, le statut du catalogue et les sessions actives.
   * Endpoint dédié `/api/types/status` pour la traçabilité de version et du checksum.
   * Journalisation structurée unifiée (`logEvent`) traçant les événements de cycle de vie et les erreurs.

