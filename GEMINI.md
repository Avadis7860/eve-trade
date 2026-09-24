# EVE Trade — Agent AI

Point d'entrée léger pour les agents.

## Première lecture

1. [.eve-trade/current-work.json](.eve-trade/current-work.json) — état du checkout : ACTIVE / CLOSING / IDLE.
2. [docs/state/current-state.md](docs/state/current-state.md) — état vérifié du dépôt.
3. [docs/state/truth-matrix.md](docs/state/truth-matrix.md) — synthèse des domaines.
4. [docs/roadmap/current-chunk.md](docs/roadmap/current-chunk.md) — chantier et périmètre.
5. [.eve-trade/context-map.json](.eve-trade/context-map.json) — navigation stable vers code, contrats, invariants, tests et CI.
6. [docs/index.md](docs/index.md) — index documentaire.
7. [docs/operations/agent-context.md](docs/operations/agent-context.md) — règles d'utilisation de cette couche.

## Règles critiques

La carte de contexte répond à « où chercher ». Elle ne répond jamais à « qu'est-ce qui est vrai » lorsqu'une source plus autoritative diverge.

Les contrats canoniques vivent dans [docs/contracts/](docs/contracts/), les invariants dans [docs/invariants/](docs/invariants/) et les validations dans [docs/validation/](docs/validation/).

Les documents sous [docs/audits/archive/](docs/audits/archive/) sont historiques. Identifier toujours l'implémentation, les tests et le gate CI avant de modifier.

Le routage CI du contexte distingue la protection conservatrice des chemins critiques de leur classification fonctionnelle : les preuves de routage utilisent des probes fonctionnels explicites, déclarés par lane, sans laisser le fallback `ambiguous` produire artificiellement la preuve.
