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

Le dépôt possède une couche de navigation agent dédiée :
- carte stable : .eve-trade/context-map.json
- état de chantier : .eve-trade/current-work.json
- procédure : docs/operations/agent-context.md

Cette couche répond à où chercher, jamais à ce qui est vrai. Elle ne remplace ni le code, ni les tests certifiés, ni les contrats/invariants normatifs.

Commencer par :
1. [.eve-trade/current-work.json](.eve-trade/current-work.json) — état du checkout et du chantier.
2. [docs/state/current-state.md](docs/state/current-state.md) — état actuel vérifiable.
3. [docs/state/truth-matrix.md](docs/state/truth-matrix.md) — synthèse des domaines.
4. [docs/roadmap/current-chunk.md](docs/roadmap/current-chunk.md) — périmètre actif.
5. [.eve-trade/context-map.json](.eve-trade/context-map.json) — navigation stable.
6. [docs/index.md](docs/index.md) — navigation documentaire générale.

Puis charger seulement le domaine utile depuis la carte stable.

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

## Cycle de vie du contexte

- `ACTIVE` : le checkout correspond à un chantier en développement sur une branche/PR dédiée.
- `CLOSING` : le chantier est gelé pour certification/fusion ; aucune nouvelle portée ne doit être ajoutée.
- `IDLE` : aucun chantier de livraison n'est actif sur l'état stable de `main`.

Sur `main`, `.eve-trade/current-work.json` ne doit jamais être interprété comme un chantier actif. L'état `CLOSING` représente le dernier chantier livré en attendant qu'un nouveau checkout rétablisse `ACTIVE`.

## Documentation

Voir [docs/documentation-guide.md](docs/documentation-guide.md).
