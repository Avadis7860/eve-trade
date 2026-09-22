# Contribution

## Organisation

- `src/domain` : frontières et règles de domaine.
- `src/engine` : calculs purs et certification.
- `src/services` : orchestration, ESI, synchronisation, analytics, persistance.
- `server/` : HTTP, authentification et frontières ESI.
- `src/types/` : contrats de types publics.
- `src/data/` : artefacts canoniques embarqués.

## Workflow

Créer une branche dédiée, limiter le périmètre, vérifier les contrats affectés et ajouter les tests de régression nécessaires.

## Validation

```bash
npm run typecheck
npm run typecheck:server
npm test
npm run build
```

Ajouter les gates ciblées pour API, ESI, security, corporation ou persistance selon le changement.

## Documentation

La documentation active est sous [docs/](docs/). Suivre [docs/documentation-guide.md](docs/documentation-guide.md).

Lorsqu'un contrat change, mettre à jour dans la même évolution le contrat, l'invariant, la validation et le statut/roadmap si nécessaire.

Les archives ne sont pas des sources de vérité courantes.
