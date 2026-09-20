# 🚀 EVE Trade — Inter-Regional Arbitrage & Market Intelligence Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)]()
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg)]()
[![EVE Online ESI](https://img.shields.io/badge/EVE_Online-ESI_Compliant-orange.svg)](https://esi.evetech.net/)

**EVE Trade** est une plateforme professionnelle d'intelligence commerciale, d'arbitrage inter-régional, de modélisation prédictive et de gestion d'ordres pour **EVE Online**. Conçue pour les négociants spatiaux, industriels et logisticiens de New Eden, elle combine des moteurs de calcul financier haute précision, une intégration native avec l'API CCP ESI et EVE SSO v2, un entrepôt d'observations immuables sur IndexedDB et des algorithmes d'analyse prédictive pour optimiser le retour sur investissement (ROI) et la rotation du capital.

---

## 🌟 Fonctionnalités Clés

### 1. 🌐 Scanner d'Arbitrage Inter-Régional Haute Précision
* **Paires de Hubs Principaux & Citadelles** : Jita IV-4, Amarr VIII, Dodixie IX-20, Rens VI-8, Hek VIII-12, etc.
* **Double Stratégie d'Exécution** :
  * *Exécution Immédiate (Taker)* : Achat sur carnet de vente source $\to$ Vente instantanée sur carnet d'achat destination.
  * *Réémission Sécurisée (Relist / Maker)* : Achat source $\to$ Pose d'ordre de vente compétitif avec sous-cotation automatique de 0.01 ISK.
* **Filtrage Spatial Strict des Stations** : Élimination absolue des fausses opportunités situées dans des stations distantes ou inaccessibles.
* **Vérification de Fiabilité Jita** : Confrontation continue de chaque prix avec le cours de référence absolu de Jita IV-4.

### 2. 🧮 Moteurs Financiers et Modélisation Mathématique Éprouvée
* **Calcul Exact des Taxes et Frais CCP** :
  * *Taxe de Vente (Sales Tax)* : Réduction de 11% par niveau de compétence *Accounting* ($8.0\% \to 3.6\%$).
  * *Frais de Courtage PNJ (Broker Fee)* : Formule officielle CCP combinant *Broker Relations*, réputation de Faction et de Corporation ($3.0\% \to 1.0\%$).
  * *Frais de Structure Citadelle/Upwell* : Intégration du taux propriétaire + surtaxe de structure CCP SCC (0.5%).
  * *Taxe de Réémission (Relist Fee)* : Réduction de 5% par niveau d'*Advanced Broker Relations*.
* **Logistique de Fret Multidimensionnelle** : Prise en compte du volume cargo ($m^3$), du nombre de sauts, et du coût de collatéral.
* **Consommation de Profondeur de Carnet (Price Ladder Engine)** : Simulation réaliste de l'épuisement des ordres par palier de prix et calcul précis du slippage.
* **Résolution des Goulots d'Étranglement** : Détection mathématique de la contrainte limitante (Capital, Cargo $m^3$, Volume source ou Volume destination).

### 3. 🔮 Moteurs de Feature Engineering & Prédiction Statistique
* **Extraction de Descripteurs Dynamiques (`MarketFeatureEngine`)** :
  * *Spread Momentum (1h & 24h)* : Détection de la compression ou de l'expansion du différentiel de prix.
  * *Volume Acceleration* : Ratio de demande 7j vs 30j.
  * *Competition Velocity & Depth Velocity* : Vitesse d'apparition de nouveaux ordres concurrents et flux de volume visible.
  * *Spread Persistence* : Pourcentage du temps où le spread est resté profitable.
* **Modélisation Déterministe du Risque (`PredictionEngine`)** :
  * *Probabilité de Survie du Spread ($P_{survival}$)* : Évaluation de la pérennité du spread sur la durée du transport.
  * *Probabilité de Réalisation du Profit ($P_{realization}$)* : Facteur d'amortissement prenant en compte slippage, relisting et stratégie.
  * *Découplage Score vs Confiance* : Distinction claire entre l'attractivité brute (Score 0-100) et la certitude statistique des données (Confiance 0-100%).
  * *Niveaux de Risque Hiérarchisés* : Classification objective (`low`, `moderate`, `elevated`, `speculative`).

### 4. 🛡️ Conseiller d'Ordres Intelligent (Order Advisor)
* **Surveillance en Temps Réel des Ordres Actifs du Personnage** via EVE SSO.
* **Recommandations Actionnables Déterministes** :
  * *Ajuster le Prix* : Réalignement en tête de gondole tout en calculant le profit net et le ROI résiduels ($ROI \ge 4\%$).
  * *Déplacer vers un Hub Plus Lucratif* : Calcul du gain net après déduction des frais de saut, de transport et de re-dépôt.
  * *Annuler l'Ordre* : Détection des marchés morts ($\le 0.2$ u/jour) ou des guerres de prix destructrices de capital.

### 5. 📊 Portefeuille & Optimisation du Risque
* **Allocation de Capital Optimisée** : Répartition gloutonne pondérée par le score global et la vitesse de rotation du capital.
* **Plafonds de Concentration** : Limite paramétrable par type d'article (ex. max 35%) et par groupe de marché (ex. max 50%).
* **Diversification Multidimensionnelle** : Visualisation de l'exposition par Catégorie, par Groupe d'objets et par Route commerciale.

### 6. 📜 Historique Réalisé & Journal de Trading (FIFO P&L)
* **Traçabilité Chronologique FIFO** des transactions d'achat et de vente réelles via ESI.
* **Indicateurs de Performance Trader** : P&L net réalisé, Taux de réussite (Win Rate %), ROI moyen effectif, Temps moyen de détention (*Hold Days*), Frais de courtage totaux versés.
* **Calibration Personnalisée du Risque** : Attribution de bonus ou de pénalités de confiance sur les opportunités selon l'historique personnel du joueur.

### 7. 💾 Entrepôt Durable IndexedDB & Observations Immuables
* **8 Magasins d'Objets Spécialisés** : Stockage persistant des snapshots, historiques bruts quotidiens ESI, observations immuables et types résolus.
* **Modèle Append-Only Dédupliqué** : Sauvegarde continue des états de marché pour le suivi des prédictions rétrospectives (*Outcome Tracking* à 1h, 6h, 24h, 3j, 7j).

### 8. 📚 Catalogue Universel des 15 801+ Types & Intégrité
* **`TypeCatalogService` & Checksum SHA-256** : Chargement validé et vérification d'empreinte cryptographique des items de marché avec métadonnées (`CATALOG_LOADED`, `CATALOG_FALLBACK_CORE`, `CATALOG_CORRUPTED`, `CATALOG_UNAVAILABLE`).
* **Résolution Hybride Universelle** : Recherche instantanée combinant le catalogue local et le point d'accès ESI `/universe/ids/`.
* **Contrats "Fail-Loud" Sans Faux Zéro** : Respect strict du principe `NO DATA ≠ ZERO DATA`. Aucune transformation silencieuse d'erreur réseau ou de catalogue en tableau vide.

---

## 🏛️ Architecture Technique

```
┌────────────────────────────────────────────────────────┐
│                   React 18 + Vite SPA                  │
│       Tailwind CSS + Lucide Icons + Recharts UI        │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌───────────────────────────────┐   ┌───────────────────────────┐
│     Core Trading Engines      │   │  Persistence & Services   │
│  - FeeEngine (Taxes & Fees)   │   │  - AuthService (SSO Multi)│
│  - PriceLadder (Order Books)  │   │  - IndexedDbStore (8 DBs) │
│  - TradableQuantity (Limits)  │   │  - EsiService (CCP API)   │
│  - ProfitEngine (Breakdown)   │   │  - MarketDataStore        │
│  - ScoringEngine (Scoring)    │   │  - OrderAdvisorService    │
│  - MarketFeatureEngine (Feat) │   │  - TraderAnalyticsService │
│  - PredictionEngine (ML/Risk) │   │  - TypeCatalogService     │
│  - InterRegional (Arbitrage)  │   │  - GlobalMarketSync       │
│  - PortfolioOptimizer (Alloc) │   └─────────────┬─────────────┘
└───────────────────────────────┘                 │
                                                  ▼
                                    ┌───────────────────────────┐
                                    │    Express Server / API   │
                                    │  - SSO Token Exchange     │
                                    │  - ESI Proxy & Rate Limit │
                                    │  - Types Search (15.8k)   │
                                    │  - Health & Status        │
                                    └─────────────┬─────────────┘
                                                  ▼
                                    ┌───────────────────────────┐
                                    │   CCP Tranquility / ESI   │
                                    │  - /markets/{region}/...  │
                                    │  - /characters/{id}/...   │
                                    │  - EVE SSO OAuth v2       │
                                    └───────────────────────────┘
```

---

## 📂 Structure du Répertoire

```bash
├── docs/                                  # 📚 Documentation technique & audits détaillés
│   ├── algorithms_and_engine_audit.md     # Audit mathématique complet de tous les moteurs
│   ├── api_and_esi_integration.md         # Spécifications ESI, proxy, OAuth & rate-limiting
│   ├── agent_workflow_and_guidelines.md   # Guide de prise en main pour les agents IA
│   └── master_plan_predictive_and_data_architecture.md # Plan de travail et spécifications
├── src/
│   ├── components/                        # 🎨 Composants React modulaires
│   │   ├── CarnetChart.tsx                # Visualiseur de carnet d'ordres (Profondeur)
│   │   ├── ConfigurationPanel.tsx         # Paramètres financiers et compétences
│   │   ├── ConnectedCharactersModal.tsx   # Modal multi-personnages EVE SSO
│   │   ├── GlobalMarketSyncModal.tsx      # Synchronisation massive de l'univers EVE
│   │   ├── GlobalScannerView.tsx          # Tableau d'arbitrage inter-régional
│   │   ├── MarketTree.tsx                 # Arbre de navigation hiérarchique EVE
│   │   ├── MyOrdersView.tsx               # Vue des ordres actifs du joueur
│   │   ├── OpportunityModal.tsx           # Analyse approfondie d'une opportunité
│   │   ├── OrderAdvisorModal.tsx          # Conseiller d'ordres et d'ajustement
│   │   ├── PortfolioView.tsx              # Vue de simulation de portefeuille
│   │   ├── Sidebar.tsx                    # Menu de navigation principal
│   │   ├── TradeJournal.tsx               # Journal d'exécution des transactions
│   │   └── TraderPerformanceModal.tsx     # Métriques de performance et statistiques
│   ├── data/
│   │   ├── universe.ts                    # Hubs, régions, systèmes, routes & catalogue
│   │   ├── allMarketTypes.json            # 250+ articles clés pré-indexés
│   │   └── mockData.ts                    # Données de secours réalistes
│   ├── engine/                            # ⚙️ Moteurs mathématiques purs (sans effet de bord)
│   │   ├── fee.ts                         # Moteur de taxes, courtage et transport
│   │   ├── ladder.ts                      # Moteur d'agrégation et de slippage
│   │   ├── quantity.ts                    # Moteur de calcul de quantité maximale
│   │   ├── profit.ts                      # Moteur de rentabilité et de décomposition
│   │   ├── scoring.ts                     # Moteur de notation multicritère (0-100)
│   │   ├── features.ts                    # Moteur de feature engineering temporel
│   │   ├── prediction.ts                  # Moteur de prévision statistique et de confiance
│   │   ├── interRegional.ts               # Moteur d'arbitrage directionnel
│   │   ├── portfolio.ts                   # Moteur d'optimisation de portefeuille
│   │   ├── money.ts                       # Formatage monétaire ISK et pourcentages
│   │   └── __tests__/                     # Suites de tests unitaires et d'intégration
│   ├── services/                          # 🌐 Services asynchrones & intégrations
│   │   ├── authService.ts                 # Gestion des sessions et tokens SSO
│   │   ├── esi.ts                         # Client ESI et résolution d'entités
│   │   ├── globalMarketSync.ts            # Gestionnaire de synchronisation globale
│   │   ├── indexedDbStore.ts              # Persistance durable IndexedDB v2
│   │   ├── marketDataStore.ts             # Cache réactif d'ordres et d'historique
│   │   ├── orderAdvisor.ts                # Moteur d'analyse et conseil d'ordres
│   │   ├── scanner.ts                     # Orchestrateur de scan inter-hubs
│   │   ├── traderAnalytics.ts             # Calculateur FIFO P&L et métriques
│   │   └── typeCatalog.ts                 # Service de validation du catalogue
│   ├── types.ts                           # Déclarations TypeScript partagées
│   ├── App.tsx                            # Composant racine
│   ├── main.tsx                           # Point d'entrée React
│   └── index.css                          # Styles globaux Tailwind
├── server.ts                              # Serveur Express (Backend API + Proxy SSO/ESI)
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

### Exécution des Tests Unitaires

```bash
npm test
```
Cette commande exécute l'ensemble des tests mathématiques des moteurs et de sécurité des sessions.

### Vérification de Typage & Build de Production

```bash
# Vérification du typage
npm run lint

# Compilation de production (Client Vite + Serveur Express CJS)
npm run build

# Démarrage en mode production
npm start
```

---

## 🔑 Variables d'Environnement

Créez un fichier `.env` basé sur `.env.example` si vous souhaitez utiliser votre propre application développeur EVE Online CCP :

```env
# EVE Online Developer Application Credentials (optionnel, valeurs par défaut incluses)
EVE_CLIENT_ID=votre_client_id_ici
EVE_CLIENT_SECRET=votre_client_secret_ici
```

> **Note :** L'outil intègre un mode de fonctionnement sécurisé avec URL de redirection adaptative et mode de saisie manuelle de code pour s'adapter à tous les environnements de déploiement (Cloud Run, Docker, Localhost).

---

## 📖 Documentation Complète

Pour aller plus loin, consultez les documents techniques dans le dossier `/docs/` :
* [**Audit et Traçabilité des Algorithmes**](./docs/algorithms_and_engine_audit.md) — Décomposition mathématique pas à pas de chaque formule, variables, contraintes et cas limites.
* [**Intégration API & ESI**](./docs/api_and_esi_integration.md) — Spécification des routes ESI, gestion du cache, rate limits et flux SSO.
* [**Guide & Protocole pour Agents IA**](./docs/agent_workflow_and_guidelines.md) — Règles architecturales et checklist de validation pour les modèles d'IA.
* [**Plan Directeur de l'Architecture Prédictive**](./docs/master_plan_predictive_and_data_architecture.md) — Feuille de route d'ingénierie et architecture des observations.
* [**Architecture Globale**](./ARCHITECTURE.md) — Flux de données, persistance et sécurité.
* [**Guide de Contribution**](./CONTRIBUTING.md) — Standards de code et processus de pull request.

---

## ⚖️ Licence & Clause de non-responsabilité

EVE Online et le logo EVE sont des marques déposées de **CCP hf.** Ce projet est développé sous licence **MIT** dans le respect des conditions d'utilisation de l'API CCP ESI pour les outils communautaires de tierce partie.

