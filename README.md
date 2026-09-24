# EVE Trade

[![CI](https://github.com/Avadis7860/eve-trade/actions/workflows/ci.yml/badge.svg)](https://github.com/Avadis7860/eve-trade/actions/workflows/ci.yml)

EVE Trade est une plateforme d'analyse de marché et d'arbitrage inter-régional pour EVE Online. Le projet combine acquisition ESI, moteurs financiers purs, suivi des ordres et des exécutions, provenance des données et validation déterministe.

> **Projet public en développement actif.** Le dépôt est utilisé comme projet personnel et vitrine technique. Les capacités annoncées doivent être lues avec les limites listées ci-dessous.

## Ce qui est réellement en place

- Scanner d'opportunités inter-régionales et résolution de routes.
- Catalogue de types et univers canoniques protégés par manifests.
- Données ESI personnage et corporation derrière une frontière backend centralisée.
- Ordres avec identité canonique `OrderId` et provenance multi-personnages.
- Financial Truth pour le P&L réalisé, le FIFO causal et les états d'incertitude.
- Corrélation et suivi des exécutions.
- Certification et chaîne de preuve des opportunités.
- Persistance IndexedDB et suivi empirique des résultats.
- Surface Operations pour les ordres actifs avec états de qualité `LIVE / CACHE / STALE / PARTIAL / UNKNOWN / ERROR`.
- CI de certification avec gates unitaires, serveur, build, navigateur, SDE et smoke post-merge.

## État produit

Les fondations techniques et le modèle produit sont en place. Les prochaines évolutions visibles portent sur l'architecture fonctionnelle de l'interface :

| Surface | État |
|---|---|
| Discovery | ✅ en place |
| Operations / Mes Ordres | ✅ certifié et fusionné |
| Market / ESI truth | ✅ fiabilisé et certifié |
| Allocation / Portefeuille | 🚧 prochain chantier produit |
| Performance / Journal | 📌 planifié |
| Control Center / Paramètres | 📌 planifié |
| Cockpit | 📌 planifié |
| Responsive / accessibilité / interaction | 📌 planifié |

Le problème historique de récupération des marchés signalé sur le PC cible est **résolu** : l'application est fonctionnelle actuellement et le symptôme était lié à une disponibilité de données insuffisante pour produire un marché affichable. Aucun défaut logiciel persistant n'est actuellement identifié.

## Limites actuelles

Le projet n'est pas présenté comme un produit finalisé.

- Le portefeuille ne réalise pas encore une allocation diversifiée multi-items complète.
- Le Journal reste principalement manuel alors que les données ESI nécessaires à une reconstruction automatique existent.
- Le panneau Paramètres mélange encore des contrôles métier et techniques ; certains contrôles doivent être requalifiés.
- Le Cockpit reste trop centré sur l'item et n'est pas encore la synthèse décisionnelle cible.
- La couverture navigateur des parcours métier est encore concentrée sur Auth et Operations.
- La publication du code est récente : la politique de licence, la sécurité publique et le processus de release sont encore en cours de formalisation.

## Documentation

Commencer par [docs/index.md](docs/index.md), puis :

- [état courant](docs/state/current-state.md) ;
- [matrice de vérité](docs/state/truth-matrix.md) ;
- [master plan](docs/roadmap/master-plan.md) ;
- [roadmap public readiness](docs/roadmap/public-readiness.md) ;
- [validation CI](docs/validation/ci.md).

Les audits historiques sont sous [docs/audits/](docs/audits/) et les anciens documents sous [docs/archive/](docs/archive/). Les audits ne remplacent jamais les sources de vérité courantes.

## Développement

Prérequis : Node.js 22 et npm.

```bash
npm ci
npm run typecheck
npm run typecheck:server
npm test
npm run build
```

Le serveur de développement se lance avec :

```bash
npm run dev
```

## Validation navigateur

Le gate navigateur déterministe fonctionne sans CCP :

```bash
npm ci --no-audit --no-fund
npx playwright install chromium
npm run test:e2e
```

Le parcours CCP réel est séparé de la CI et documenté dans [docs/validation/e2e.md](docs/validation/e2e.md).

## Architecture

- React/Vite : UI et orchestration.
- Services : ESI, synchronisation, analytics et persistance.
- Domaines : catalogue, univers, identité et intégrité.
- Engines : calculs purs, classification et certification.
- Express : authentification, frontières ESI et APIs.
- IndexedDB : snapshots, observations, transactions et exécutions.

Voir [docs/architecture/overview.md](docs/architecture/overview.md).

## Sécurité

Le dépôt public inclut une [Security Policy](SECURITY.md).

Les secrets CCP, tokens OAuth et credentials locaux ne doivent jamais être commités. Le harness E2E utilise des credentials synthétiques et ne dépend pas du compte CCP personnel.

## Licence et EVE Online

Le dépôt est public, mais **aucune licence de code n'est actuellement publiée**. Le modèle de distribution sera décidé explicitement avant de présenter le projet comme open source.

EVE Online, EVE et les marques associées restent la propriété de leurs ayants droit. EVE Trade est un projet tiers et n'est pas présenté comme un produit officiel de CCP Games.

## Règle de maintenance

La documentation décrit l'implémentation réelle. Un changement de contrat doit mettre à jour le contrat, l'invariant, les tests, la validation et le statut de roadmap dans la même évolution.
