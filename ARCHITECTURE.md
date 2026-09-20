# 🏗️ Architecture Globale du Système — EVE Trade

Ce document décrit en détail l'architecture logicielle, le cycle de vie des données, les mécanismes de sécurité et la topologie des composants du projet **EVE Trade**.

---

## 📐 Topologie des Couches Logicielles

L'architecture est découpée en **cinq couches orthogonales** à responsabilités uniques :

```
┌────────────────────────────────────────────────────────────────────────┐
│                          1. COUCHE PRÉSENTATION                        │
│                   React 18 SPA + Tailwind CSS + Lucide                 │
│   - GlobalScannerView       - PortfolioView        - MyOrdersView      │
│   - OpportunityModal        - CarnetChart          - TradeJournal      │
│   - OrderAdvisorModal       - ConfigurationPanel   - MarketTree        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          2. COUCHE SERVICES (Web)                      │
│   - AuthService             : Session SSO, Refresh Token, Multi-Comptes│
│   - MarketDataStore         : Store réactif d'ordres & historique      │
│   - Scanner                 : Orchestrateur de découverte d'arbitrage  │
│   - OrderAdvisorService     : Analyseur d'ordres & recommandations     │
│   - TraderAnalyticsService  : Appariement FIFO & métriques de gain     │
│   - GlobalMarketSync        : Synchronisation massive inter-hubs       │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│        3. MOTEURS FINANCIERS         │ │     4. BACKEND EXPRESS API    │
│            (Pur TypeScript)          │ │           (server.ts)         │
│  - FeeEngine (Taxes & Courtage)      │ │  - /api/auth/url              │
│  - PriceLadderEngine (Profondeur)    │ │  - /api/auth/token            │
│  - TradableQuantityEngine (Goulots)  │ │  - /api/auth/refresh          │
│  - ProfitEngine (Décomposition)      │ │  - /api/character/:id/orders  │
│  - ScoringEngine (10 critères)       │ │  - /api/character/:id/wallet  │
│  - InterRegionalEngine (Hubs A->B)   │ │  - /api/types/all (15,801)    │
│  - PortfolioOptimizer (Allocation)   │ │  - Proxy ESI avec User-Agent  │
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

Voici la séquence exacte suivie lors de la recherche et de l'évaluation d'un arbitrage :

```
1. Synchronisation des Ordres
   [ESI API] ──> [EsiService / Server Proxy] ──> [MarketDataStore (Cache en mémoire)]

2. Pipeline de Calcul de l'Opportunité
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
      │       * Identifie le goulot d'étranglement
      │
      ├──> [PriceLadderEngine.simulateFill]
      │       * Simule l'achat et la vente réels avec slippage
      │       * Calcule P_effective_buy et P_effective_sell
      │
      ├──> [ProfitEngine.calculateProfit]
      │       * Applique Sales Tax, Broker Fees (NPC / Upwell) et Coûts de Fret
      │       * Calcule le Profit Net, ROI et Marge
      │
      └──> [OpportunityScoringEngine.scoreOpportunity]
              * Évalue les 10 dimensions de performance
              * Applique la décote de rotation et liquidité (Capturable Profit)
              * Contrôle les anomalies de prix (> 60% ROI ou hors médiane 30j)
```

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
   * Chargement déterministe avec validation d'intégrité de chaque élément.
   * Calcul d'empreinte cryptographique SHA-256 (`checksum`) sur les données chargées.
   * Gestion d'états formelle : `CATALOG_LOADED`, `CATALOG_FALLBACK_CORE`, `CATALOG_CORRUPTED`, `CATALOG_UNAVAILABLE`.
   * Fallback de secours vérifié (`EVE_TYPES_CATALOG`) pour garantir la disponibilité en cas de corruption ou d'absence du fichier.
2. **Contrats "Fail-Loud" (Principe `NO DATA ≠ ZERO DATA`) :**
   * Aucune transformation silencieuse d'erreur de requête ou de catalogue en tableau vide.
   * L'API backend et `EsiService` propagent des erreurs explicites avec statuts HTTP appropriés (503, 502, 400).
   * L'interface utilisateur affiche des indicateurs de santé du catalogue avec badge d'avertissement lorsque le mode de secours est activé.
3. **Observabilité & Diagnostic :**
   * Endpoint de santé `/api/health` fournissant l'état du serveur, la mémoire, le statut du catalogue et les sessions actives.
   * Endpoint dédié `/api/types/status` pour la traçabilité de version et du checksum.
   * Journalisation structurée unifiée (`logEvent`) traçant les événements de cycle de vie et les erreurs.
