# EVE Trade — Directives pour agents

## Garde-fous

La documentation ne remplace jamais le code et les tests comme source de vérité. En cas de contradiction, vérifier l'implémentation actuelle, les tests et la CI.

Fondations sensibles :
- identité canonique des ordres ;
- séparation observateur / propriétaire économique ;
- frontière corporation ESI ;
- états explicites des collections ESI ;
- vérité canonique Catalog / Universe ;
- Financial Truth et FIFO causal ;
- isolation des données privées par principal.

## Navigation

La documentation versionnée contient uniquement des connaissances durables :
- carte de navigation : [.eve-trade/context-map.json](.eve-trade/context-map.json)
- état logiciel : [docs/state/current-state.md](docs/state/current-state.md)
- synthèse des domaines : [docs/state/truth-matrix.md](docs/state/truth-matrix.md)
- roadmap stratégique : [docs/roadmap/master-plan.md](docs/roadmap/master-plan.md)
- backlog stratégique : [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- procédure : [docs/operations/agent-context.md](docs/operations/agent-context.md)

Pour un chantier actif, consulter directement l'Issue GitHub et la Pull Request. Le dépôt ne conserve aucune copie du chantier courant.

## Où chercher

- Frontend : src/components, src/hooks, src/services
- Domaines : src/domain
- Moteurs purs : src/engine
- Types : src/types
- Backend : server, server.ts
- Données canoniques : src/data
- Persistance : src/services/indexedDbStore.ts

## Validation

```bash
npm run test:context
npm run typecheck
npm run typecheck:server
npm test
npm run build
```

Ajouter les suites ciblées pour la surface modifiée. La CI est la validation partagée.

## Règles

1. Identifier la source de vérité avant modification.
2. Ne pas réécrire une formule financière pendant un chantier non financier.
3. Ne pas ajouter une seconde frontière ESI.
4. Ne pas convertir une absence de données en zéro métier.
5. Ne pas déduire le propriétaire d'un ordre depuis le seul observateur.
6. Préserver les identifiants canoniques.
7. Tout changement de contrat doit être protégé par une validation correspondante.
8. Aucun refactoring opportuniste hors périmètre.
9. Ne pas importer de code depuis l'archive UX-03 uniquement parce qu'il était certifié ou testé ; toute réutilisation future doit être re-dérivée depuis main après réconciliation explicite des contrats.

## Gouvernance du delivery

GitHub Issue = définition et suivi du chantier.
GitHub PR = branche, commits, CI, Draft/Ready et merge.
Git = état réellement intégré.
CI = preuve de certification.

Aucun fichier versionné ne doit recopier l'Issue, la PR, la branche, la phase ou le statut administratif courant.
Aucun merge normal ne doit nécessiter une PR de nettoyage documentaire.

## Documentation

Voir [docs/documentation-guide.md](docs/documentation-guide.md).
