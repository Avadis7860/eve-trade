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

Commencer par :
- [docs/index.md](docs/index.md)
- [docs/state/current-state.md](docs/state/current-state.md)
- [docs/state/truth-matrix.md](docs/state/truth-matrix.md)
- [docs/roadmap/current-chunk.md](docs/roadmap/current-chunk.md)

Puis charger seulement le domaine utile :
- Ordres : [domains/trading/orders.md](docs/domains/trading/orders.md) + [contracts/orders.md](docs/contracts/orders.md) + [invariants/order-identity.md](docs/invariants/order-identity.md)
- Corporation : [domains/trading/corporation-trading.md](docs/domains/trading/corporation-trading.md) + [contracts/corporations.md](docs/contracts/corporations.md) + [invariants/corporation-boundary.md](docs/invariants/corporation-boundary.md)
- ESI : [architecture/esi-boundary.md](docs/architecture/esi-boundary.md) + [contracts/esi.md](docs/contracts/esi.md) + [invariants/esi-data-state.md](docs/invariants/esi-data-state.md)
- Financial Truth : [domains/finance/financial-truth.md](docs/domains/finance/financial-truth.md) + [contracts/financial.md](docs/contracts/financial.md) + [invariants/financial-safety.md](docs/invariants/financial-safety.md)

## Où chercher

- Frontend : `src/components`, `src/hooks`, `src/services`
- Domaines : `src/domain`
- Moteurs purs : `src/engine`
- Types : `src/types`
- Backend : `server`, `server.ts`
- Données canoniques : `src/data`
- Persistance : `src/services/indexedDbStore.ts`

## Validation

```bash
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

## Documentation

Voir [docs/documentation-guide.md](docs/documentation-guide.md).
