# 🚀 EVE Trade — Inter-Regional Arbitrage & Market Intelligence Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)]()
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg)]()
[![IndexedDB](https://img.shields.io/badge/IndexedDB-v5_Durable_Store-blueviolet.svg)]()
[![EVE Online ESI](https://img.shields.io/badge/EVE_Online-ESI_Compliant-orange.svg)](https://esi.evetech.net/)

**EVE Trade** est une plateforme professionnelle d'intelligence commerciale, d'arbitrage inter-régional, de modélisation prédictive, de certification de preuve cryptographique et de suivi d'exécution pour **EVE Online**. Conçue pour les négociants spatiaux, industriels et logisticiens de New Eden, elle combine des moteurs de calcul financier purs à haute précision, une chaîne de preuve à 4 piliers immuable (SHA-256), un entrepôt persistant IndexedDB v5, une intégration EVE SSO v2 multi-personnages et un système d'analyse d'exécution FIFO/VWAP.

---

## 🌟 Fonctionnalités Clés

### 1. 🌐 Scanner d'Arbitrage Inter-Régional Haute Précision
* **Paires de Hubs Principaux & Citadelles** : Jita IV-4, Amarr VIII, Dodixie IX-20, Rens VI-8, Hek VIII-12, etc.
* **Double Stratégie d'Exécution** :
  * *Exécution Immédiate (Taker)* : Achat sur carnet de vente source $\to$ Vente instantanée sur carnet d'achat destination.
  * *Réémission Sécurisée (Relist / Maker)* : Achat source $\to$ Pose d'ordre de vente compétitif avec sous-cotation automatique de 0.01 ISK.
* **Filtrage Spatial Strict des Stations** : Élimination absolue des fausses opportunités situées dans des stations distantes ou inaccessibles.
* **Vérification de Fiabilité Jita** : Confrontation continue de chaque prix avec le cours de référence absolu de Jita IV-4.

### 2. 🧮 Moteurs Financiers Purs & Modélisation Mathématique Éprouvée
* **Calcul Exact des Taxes et Frais CCP (`FeeEngine`)** :
  * *Taxe de Vente (Sales Tax)* : Réduction de 11% par niveau de compétence *Accounting* ($8.0\% \to 3.6\%$). Mode Alpha plafonné à 5.36%.
  * *Frais de Courtage PNJ (Broker Fee)* : Formule officielle CCP combinant *Broker Relations*, réputation de Faction et de Corporation ($3.0\% \to 1.0\%$).
  * *Règle Taker vs Maker* : L'achat direct sur ordre de vente existant n'engendre **aucun broker fee** ($0.0\%$).
  * *Frais de Structure Citadelle/Upwell* : Intégration du taux propriétaire + surtaxe réglementaire SCC (0.5% à 1.5%).
  * *Taxe de Réémission (Relist Fee)* : Réduction de 5% par niveau d'*Advanced Broker Relations*.
  * *Logistique de Fret Multidimensionnelle* : Volume cargo ($m^3$), nombre de sauts, assurance collatérale et frais fixes.
* **Consommation de Profondeur de Carnet (`PriceLadderEngine`)** : Simulation réaliste de l'épuisement des ordres par palier de prix et calcul précis du slippage.
* **Résolution des Goulots d'Étranglement (`TradableQuantityEngine`)** : Détection mathématique de la contrainte limitante (`capital`, `cargo`, `source_market`, `destination_market`).
* **Compte de Résultat Exhaustif (`ProfitEngine`)** : Décomposition en 4 scénarios (`taker_taker`, `taker_maker`, `maker_taker`, `maker_maker`), marge nette, ROI et profit unitaire.

### 3. 🛡️ Chaîne de Preuve Cryptographique & Certification 4 Piliers (`OpportunityEvidenceEngine`)
* **Empreinte SHA-256 Déterministe** : Chaque opportunité génère un instantané immuable (`evidence_hash`) via sérialisation canonique à clés triées et flottants normalisés.
* **Audit des 4 Piliers de Certification** :
  1. *MarketData* : Intégrité et fraîcheur des carnets d'ordres source et destination.
  2. *Catalog* : Checksum SHA-256 du catalogue, volume physique et métadonnées d'objet.
  3. *Universe* : Validation topologique des stations et cohérence de la route de saut.
  4. *FinancialEngine* : Déterminisme strict des calculs, rentabilité positive et résolution des goulots.
* **Vérification d'Altération en Temps Réel** : Détection immédiate de toute modification des données sous-jacentes.

### 4. 🔮 Feature Engineering & Prédiction Statistique
* **Extraction Dynamique (`MarketFeatureEngine`)** :
  * *Spread Momentum (1h & 24h)* : Détection de la compression ou expansion du différentiel de prix.
  * *Volume Acceleration* : Ratio de demande 7j vs 30j.
  * *Competition Velocity & Depth Velocity* : Vitesse d'apparition de nouveaux ordres et flux de volume visible.
  * *Spread Persistence* : Pourcentage de temps où le spread est resté profitable.
* **Modélisation Déterministe du Risque (`PredictionEngine`)** :
  * *Probabilité de Survie du Spread ($P_{survival}$)* : Évaluation de la pérennité du spread sur la durée du transport.
  * *Probabilité de Réalisation du Profit ($P_{realization}$)* : Facteur d'amortissement prenant en compte slippage, relisting et stratégie.
  * *Découplage Score vs Confiance* : Distinction nette entre l'attractivité économique (Score 0-100) et la certitude statistique des données (Confiance 0-100%).
  * *Niveaux de Risque Hiérarchisés* : `low`, `moderate`, `elevated`, `speculative`.

### 5. 📈 Suivi Empirique des Résultats de Marché (`MarketOutcomeTracker`)
* **Évaluation Multi-Horizons** : Analyse rétrospective de l'évolution du marché à $T+1\text{h}$, $T+6\text{h}$, $T+24\text{h}$, $T+3\text{j}$, $T+7\text{j}$.
* **Décroissance du Spread (*Spread Decay*)** : Mesure du spread résiduel, de la capture de volume et du statut (`SURVIVED`, `DECAYED`, `INVERTED`, `EXHAUSTED`).
* **Immuabilité $T_0$** : La prédiction originale, la preuve et le hash SHA-256 demeurent strictement inchangés.
* **Planificateur Automatique** : Surveillance périodique en arrière-plan avec contrôle de santé des données.

### 6. 💼 Ingestion des Transactions & Corrélation d'Exécution (Phase 2B)
* **Ingestion ESI Résiliente (`CharacterTransactionSyncService`)** :
  * Support multi-personnages complet avec sessions EVE SSO v2.
  * Pagination robuste sur ancre `from_id` et raccordement d'historique (*gap bridging*).
  * Résilience aux erreurs réseau, HTTP 429 (`Retry-After`), HTTP 420 (`X-Esi-Error-Limit-Reset`) et 5xx.
  * Normalisation pure et validation stricte (`Number.isSafeInteger`, rejet de faits synthétiques ou `transaction_id=0`).
* **Moteur de Corrélation d'Exécution (`ExecutionCorrelationEngine`)** :
  * Appariement multicritère sur 5 dimensions (Identité, Localisation, Fenêtre temporelle, Prix, Quantité).
  * Niveaux d'appariement stricts : `DIRECT_MATCH`, `STRONG_MATCH`, `PROBABLE_MATCH`, `AMBIGUOUS`, `UNMATCHED`.
  * Isolation inter-personnages absolue et traçabilité des transactions non assignées.
* **Suivi d'Exécution et Calcul VWAP (`ExecutionOutcomeEngine`)** :
  * Appariement chronologique FIFO des achats et ventes attribués.
  * Calcul exact du Buy VWAP, Sell VWAP, P&L réalisé net et taux d'exécution.
  * Détection d'incohérence d'inventaire, vente à découvert ou fuite de stock.

### 7. 🛡️ Conseiller d'Ordres Intelligent (Order Advisor)
* **Surveillance en Temps Réel des Ordres Actifs du Personnage** via EVE SSO.
* **Recommandations Actionnables Déterministes** :
  * *Ajuster le Prix* : Réalignement en tête de gondole préservant un $ROI \ge 4\%$.
  * *Déplacer vers un Hub Plus Lucratif* : Calcul du gain net après déduction des frais de transport et de re-dépôt.
  * *Annuler l'Ordre* : Détection des marchés morts ($\le 0.2$ u/jour) ou des guerres de prix destructrices.

### 8. 📊 Portefeuille & Optimisation du Risque
* **Allocation de Capital Optimisée** : Répartition gloutonne pondérée par le score global et la vitesse de rotation.
* **Plafonds de Concentration** : Limite paramétrable par type d'article (ex. max 35%) et par groupe de marché (ex. max 50%).
* **Diversification Multidimensionnelle** : Visualisation de l'exposition par Catégorie, Groupe et Route commerciale.

### 9. 💾 Entrepôt Durable IndexedDB v5 & Sémantique de Défaillance
* **11 Magasins d'Objets Indexés** :
  1. `snapshots` : Derniers états de carnets par paire `type_id:region_id`.
  2. `history` : Statistiques historiques calculées.
  3. `universe_opportunities` : Cache des opportunités globales.
  4. `http_cache` : Cache des requêtes ESI avec ETags et en-têtes d'expiration.
  5. `market_observations` : Flux immuable *Append-Only* horodaté avec hash de déduplication.
  6. `opportunity_observations` : Snapshots d'opportunités $T_0$, preuves et instantanés d'outcomes.
  7. `market_history_daily` : Séries chronologiques brutes ESI quotidiennes.
  8. `eve_types` : Référentiel des types résolus.
  9. `catalog_metadata` : Métadonnées d'intégrité et checksum SHA-256 du catalogue.
  10. `character_transactions` : Historique des transactions portefeuille ESI normalisées.
  11. `character_executions` : Enregistrements de suivi d'exécution corrélés par personnage et opportunité.
* **Sémantique de Défaillance & Santé des Données (`FailureSemantics`)** :
  * Hiérarchie d'état : `LIVE`, `CACHE`, `STALE`, `PARTIAL`, `UNKNOWN`, `ERROR`.
  * Principe absolu **"Fail-Loud"** : `NO DATA ≠ ZERO DATA`. Aucune erreur masquée par des valeurs factices.

---

## 🏛️ Architecture Technique Globale

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
│   - TypeCatalogService      : Intégrité & validation du catalogue      │
│   - Scanner                 : Orchestrateur d'arbitrage spatialisé     │
│   - MarketOutcomeTracker    : Suivi des résultats empiriques (1h..7j)  │
│   - CharacterTxSyncService  : Ingestion ESI portefeuille & pagination  │
│   - ExecutionTrackingService: Corrélation & cycle de vie d'exécution   │
│   - OrderAdvisorService     : Analyseur d'ordres & recommandations     │
│   - TraderAnalyticsService  : Appariement FIFO & métriques de gain     │
│   - GlobalMarketSync        : Synchronisation univers massive          │
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

## 📂 Structure du Répertoire

```bash
├── docs/                                  # 📚 Documentation technique, audits & runbooks
│   ├── algorithms_and_engine_audit.md     # Audit mathématique exhaustif de tous les moteurs
│   ├── api_and_esi_integration.md         # Spécifications ESI, proxy, OAuth & rate-limiting
│   ├── agent_workflow_and_guidelines.md   # Guide opérationnel et protocoles pour agents IA
│   └── operations_and_runbook.md          # Runbook d'exploitation, diagnostic et procédures
├── src/
│   ├── components/                        # 🎨 Composants React modulaires
│   │   ├── CarnetChart.tsx                # Visualiseur de carnet d'ordres (Profondeur)
│   │   ├── CockpitView.tsx                # Tableau de bord synthétique
│   │   ├── ConfigurationPanel.tsx         # Paramètres financiers, taxes et compétences
│   │   ├── ConnectedCharactersModal.tsx   # Modal multi-personnages EVE SSO
│   │   ├── GlobalMarketSyncModal.tsx      # Synchronisation massive de l'univers EVE
│   │   ├── GlobalScannerView.tsx          # Tableau d'arbitrage inter-régional
│   │   ├── HeaderNav.tsx                  # En-tête de navigation et statut de santé
│   │   ├── MarketTree.tsx                 # Arbre de navigation hiérarchique EVE
│   │   ├── MyOrdersView.tsx               # Vue des ordres actifs du joueur
│   │   ├── OpportunityModal.tsx           # Analyse approfondie et preuve 4 piliers
│   │   ├── OrderAdvisorModal.tsx          # Conseiller d'ordres et d'ajustement
│   │   ├── PortfolioView.tsx              # Vue de simulation et allocation de portefeuille
│   │   ├── Sidebar.tsx                    # Menu de navigation latéral
│   │   ├── TradeJournal.tsx               # Journal d'exécution des transactions
│   │   └── TraderPerformanceModal.tsx     # Métriques de performance et statistiques FIFO
│   ├── data/
│   │   ├── universe.ts                    # Hubs, régions, systèmes, routes & catalogue
│   │   ├── allMarketTypes.json            # 53 types noyau validés (CATALOG_FALLBACK_CORE)
│   │   └── mockData.ts                    # Données de secours réalistes
│   ├── domain/                            # 🏛️ Modèles de domaine & référentiels
│   │   ├── catalog/                       # Gestion du catalogue de types et validation
│   │   ├── character/                     # Entités et sessions de personnages
│   │   └── universe/                      # Topologie stellaire, stations et systèmes
│   ├── engine/                            # ⚙️ Moteurs mathématiques purs (sans effet de bord)
│   │   ├── characterTransaction.ts        # Normalisation & validation des transactions ESI
│   │   ├── evidence.ts                    # Moteur de preuve 4 piliers & hachage SHA-256
│   │   ├── executionCorrelation.ts        # Moteur de corrélation multicritère
│   │   ├── executionOutcome.ts            # Moteur de calcul VWAP & P&L d'exécution
│   │   ├── failureSemantics.ts            # Modèle de santé des données & Fail-Loud
│   │   ├── features.ts                    # Moteur de feature engineering temporel
│   │   ├── fee.ts                         # Moteur de taxes, courtage et transport
│   │   ├── interRegional.ts               # Moteur d'arbitrage spatialisé
│   │   ├── ladder.ts                      # Moteur d'agrégation et de slippage
│   │   ├── money.ts                       # Formatage monétaire ISK et pourcentages
│   │   ├── portfolio.ts                   # Moteur d'optimisation de portefeuille
│   │   ├── prediction.ts                  # Moteur de prévision statistique et confiance
│   │   ├── profit.ts                      # Moteur de rentabilité et décomposition
│   │   ├── quantity.ts                    # Moteur de calcul de quantité maximale
│   │   ├── scoring.ts                     # Moteur de notation multicritère (0-100)
│   │   └── __tests__/                     # Suites complètes de tests unitaires (100% verts)
│   ├── services/                          # 🌐 Services asynchrones & intégrations
│   │   ├── authService.ts                 # Gestion des sessions et tokens SSO
│   │   ├── characterTransactionSyncService.ts # Ingestion ESI des transactions de portefeuille
│   │   ├── esi.ts                         # Client ESI et résolution d'entités
│   │   ├── executionTrackingService.ts    # Service de suivi d'exécution et corrélation
│   │   ├── globalMarketSync.ts            # Gestionnaire de synchronisation globale
│   │   ├── indexedDbStore.ts              # Persistance durable IndexedDB v5
│   │   ├── marketDataStore.ts             # Cache réactif d'ordres et d'historique
│   │   ├── marketOutcomeTracker.ts        # Suivi empirique des opportunités (1h..7j)
│   │   ├── orderAdvisor.ts                # Moteur d'analyse et conseil d'ordres
│   │   ├── scanner.ts                     # Orchestrateur de scan inter-hubs
│   │   ├── traderAnalytics.ts             # Calculateur FIFO P&L et métriques
│   │   └── typeCatalog.ts                 # Service de validation du catalogue
│   ├── types.ts                           # Déclarations TypeScript unifiées
│   ├── App.tsx                            # Composant racine
│   ├── main.tsx                           # Point d'entrée React
│   └── index.css                          # Styles globaux Tailwind
├── server/                                # 🖥️ Backend Express modulaire
│   ├── routes/                            # Routes d'API dédiées
│   │   ├── auth.ts                        # Endpoints SSO v2 (URL, token, refresh)
│   │   ├── catalog.ts                     # Endpoints catalogue (status, all, search)
│   │   ├── characters.ts                  # Proxy pour wallet, orders, skills
│   │   ├── health.ts                      # Endpoint diagnostic /api/health
│   │   ├── markets.ts                     # Proxy pour les données de marché
│   │   └── universe.ts                    # Proxy pour la résolution spatiale
│   └── utils/                             # Utilitaires backend (ESI client, logger)
├── server.ts                              # Serveur Express principal (API + Vite Middleware)
├── AGENTS.md                              # 🤖 Directives & invariants stricts pour Agents IA
├── ARCHITECTURE.md                        # 🏗️ Description détaillée de l'architecture
├── CONTRIBUTING.md                        # 🤝 Guide de contribution et standards de code
├── GEMINI.md                              # 🤖 Directives spécifiques Google AI Studio
├── package.json                           # Dépendances et scripts
└── tsconfig.json                          # Configuration TypeScript
```

---

## ⚡ Démarrage Rapide

### Prérequis
* **Node.js** v18+ ou v20+
* **npm** ou **bun**

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/votre-compte/eve-trade.git
cd eve-trade

# Installer les dépendances
npm install
```

### Lancement en Développement

```bash
npm run dev
```
L'application démarre sur `http://localhost:3000`.

### Exécution des Tests Unitaires & Intégration

```bash
npm test
```
Cette commande exécute l'ensemble des suites de tests automatisés (taxes, carnet, arbitrage, preuve cryptographique, normalisation des transactions, ingestion résiliente, corrélation et suivi d'exécution).

### Vérification de Typage & Build de Production

```bash
# Vérification stricte du typage TypeScript
npm run lint

# Compilation de production (Client Vite + Serveur Express CJS)
npm run build

# Démarrage en mode production
npm start
```

---

## 🔑 Variables d'Environnement

Créez un fichier `.env` basé sur `.env.example` pour configurer vos identifiants d'application développeur CCP :

```env
# EVE Online Developer Application Credentials (optionnel, valeurs par défaut incluses)
EVE_CLIENT_ID=votre_client_id_ici
EVE_CLIENT_SECRET=votre_client_secret_ici
```

---

## 📖 Documentation Complète

* [**Audit et Traçabilité des Algorithmes**](./docs/algorithms_and_engine_audit.md) — Décomposition mathématique pas à pas de chaque formule, variables, contraintes, preuves et cas limites.
* [**Intégration API & ESI**](./docs/api_and_esi_integration.md) — Spécification des routes ESI, gestion du cache, rate limits, pagination et flux SSO.
* [**Guide Opérationnel & Workflow pour Agents IA**](./docs/agent_workflow_and_guidelines.md) — Invariants stricts, règles d'ingénierie et protocole de validation.
* [**Runbook d'Exploitation & Diagnostic**](./docs/operations_and_runbook.md) — Procédures opérationnelles, diagnostic réseau et intégrité des données.
* [**Architecture Globale**](./ARCHITECTURE.md) — Topologie en 5 couches, persistance IndexedDB v5 et sécurité.
* [**Guide de Contribution**](./CONTRIBUTING.md) — Standards de code et processus de pull request.

---

## ⚖️ Licence & Clause de non-responsabilité

EVE Online et le logo EVE sont des marques déposées de **CCP hf.** Ce projet est développé sous licence **MIT** dans le respect des conditions d'utilisation de l'API CCP ESI pour les outils communautaires de tierce partie.


