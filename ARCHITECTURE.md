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

## 🔐 Sécurité & Gestion des Identités EVE SSO

### 1. Authentification OAuth 2.0 (EVE SSO v2)
L'authentification utilise le protocole officiel **EVE Online Single Sign-On (SSO) v2** avec jetons JWT signés :
* **Scopes demandés :**
  * `esi-markets.read_character_orders.v1` (Lecture des ordres actifs)
  * `esi-wallet.read_character_wallet.v1` (Solde du portefeuille et transactions)
  * `esi-skills.read_skills.v1` (Niveaux de compétences *Accounting* & *Broker Relations*)
  * `publicData`
* **Protection des secrets :** L'échange `authorization_code` $\to$ `tokens` s'effectue côté serveur dans `server.ts` via l'en-tête `Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)`.
* **Support Multi-Comptes :** `AuthService` maintient une collection de sessions actives dans `localStorage` (`eve_linked_characters`), permettant au trader de basculer instantanément d'un personnage à l'autre sans se déconnecter.
* **Auto-Refresh Proactif :** Les tokens d'accès expirant après 20 minutes sont automatiquement renouvelés dès que le délai résiduel est inférieur à 2 minutes.

---

## ⚡ Performance & Gestion du Cache

1. **Base de Données des Types en Mémoire (15 801 types d'objets) :**
   * Le backend précharge `src/data/allMarketTypes.json` au démarrage.
   * L'endpoint `/api/types/search` répond en $< 5\text{ms}$ pour toute recherche par nom ou `type_id`.
2. **Déduplication au niveau des requêtes ESI :**
   * `MarketDataStore` indexe les ordres par clé composite `type_id:region_id` et déduplique par `order_id`.
3. **Moteurs découplés et vectorisables :**
   * Chaque moteur mathématique opère en mémoire pure sans allocations inutiles d'objets ou de closures lourdes.
