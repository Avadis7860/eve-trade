# EVE Trade

EVE Trade est une plateforme d'analyse de marché et d'arbitrage inter-régional pour EVE Online, avec validation déterministe des données, moteurs financiers purs, suivi d'exécution et persistance locale.

## Fonctions principales

- Scanner d'opportunités inter-régionales et calcul de routes.
- Catalogue de types et univers canoniques, vérifiés par manifests.
- Données ESI personnage et corporation via une frontière backend centralisée.
- Ordres avec identité canonique `OrderId` et provenance multi-personnages.
- Financial Truth pour le P&L réalisé, le FIFO causal et les états d'incertitude.
- Corrélation et suivi des exécutions.
- Certification et chaîne de preuve des opportunités.
- Persistance IndexedDB et suivi empirique des résultats.

## Documentation

Commencer par [docs/index.md](docs/index.md), puis [docs/state/current-state.md](docs/state/current-state.md), [docs/state/truth-matrix.md](docs/state/truth-matrix.md) et [docs/roadmap/master-plan.md](docs/roadmap/master-plan.md). Charger ensuite uniquement le domaine nécessaire.

Les audits historiques sont sous [docs/audits/](docs/audits/) et les anciens documents sous [docs/archive/](docs/archive/). Ils ne constituent pas des sources de vérité courantes.

## Développement

Prérequis : Node.js 22 et npm.

```bash
npm ci
npm run typecheck
npm run typecheck:server
npm test
npm run build
```

Le serveur de développement se lance avec `npm run dev`.

La CI de référence est [.github/workflows/ci.yml](.github/workflows/ci.yml). Elle couvre les typechecks frontend/backend, les gates catalogue/univers, corporation/treasury/ESI, les suites unitaires/API/smoke/security/ESI et le build de production.

## Architecture de haut niveau

- React/Vite : UI, hooks et orchestration.
- Services : ESI/backend, synchronisation, analytics et persistance.
- Domaines : catalogue, univers, identité personnage, intégrité.
- Engines : calculs purs, classification et certification.
- Express : authentification, frontières ESI et APIs.
- IndexedDB : snapshots, observations, transactions et exécutions.

Voir [docs/architecture/overview.md](docs/architecture/overview.md).

## Règle de maintenance

La documentation décrit l'implémentation réelle. Un changement de contrat doit mettre à jour le contrat, l'invariant et la validation dans la même évolution.

## Licence

Projet privé. Les données et marques EVE Online restent soumises aux conditions de CCP.
