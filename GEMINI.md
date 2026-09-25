# EVE Trade — Agent AI

Point d'entrée léger pour les agents.

## Première lecture

1. Consulter l'Issue GitHub et la Pull Request du chantier lorsqu'un travail actif est en cours.
2. [docs/state/current-state.md](docs/state/current-state.md) — état logiciel stable.
3. [docs/state/truth-matrix.md](docs/state/truth-matrix.md) — synthèse des domaines.
4. [docs/roadmap/master-plan.md](docs/roadmap/master-plan.md) et [docs/roadmap/backlog.md](docs/roadmap/backlog.md) — stratégie durable.
5. [.eve-trade/context-map.json](.eve-trade/context-map.json) — navigation vers code, contrats, invariants, tests et CI.
6. [docs/operations/agent-context.md](docs/operations/agent-context.md) — règles d'utilisation.

## Règles critiques

La carte de contexte répond à « où chercher ». Elle ne répond jamais à « qu'est-ce qui est vrai » lorsqu'une source plus autoritative diverge.

Les contrats canoniques vivent dans [docs/contracts/](docs/contracts/), les invariants dans [docs/invariants/](docs/invariants/) et les validations dans [docs/validation/](docs/validation/).

Les documents sous [docs/audits/archive/](docs/audits/archive/) sont historiques.

Le cycle de vie d'un chantier appartient à GitHub ; le dépôt ne conserve pas de manifeste du chantier courant.
