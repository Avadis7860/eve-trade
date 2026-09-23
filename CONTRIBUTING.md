# Contribution

## Organisation

- \`src/domain\` : frontières et règles de domaine.
- \`src/engine\` : calculs purs et certification.
- \`src/services\` : orchestration, ESI, synchronisation, analytics, persistance.
- \`server/\` : HTTP, authentification et frontières ESI.
- \`src/types/\` : contrats de types publics.
- \`src/data/\` : artefacts canoniques embarqués.

## Workflow

Créer une branche dédiée, limiter le périmètre, vérifier les contrats affectés et ajouter les tests de régression nécessaires.

### Discipline PR

Règle de fonctionnement :

> Un chantier = une branche active = une PR active.

Pendant l'itération :

1. ouvrir la PR en **Draft** ;
2. accumuler les corrections sur la même branche ;
3. utiliser le signal CI de cette PR pour guider les corrections ;
4. attendre le run pertinent avant de conclure qu'une validation manque ;
5. passer en **Ready for Review** lorsque le périmètre est cohérent et localement vérifié.

Ne pas ouvrir une nouvelle PR uniquement pour obtenir un nouveau run CI.

Une nouvelle PR est réservée à un nouveau périmètre, une nouvelle base, une séparation volontaire de chantier ou l'abandon explicite du chantier précédent.

Lorsqu'un run échoue ou est interrompu :

- corriger sur la même PR ;
- utiliser un rerun du job/workflow lorsque le problème est transitoire ;
- ne pas transformer un run annulé en motif automatique d'ouverture d'une nouvelle PR.

Cette règle formalise le retour d'expérience documenté dans [l'audit CI](docs/audits/ci-management-audit-2026-09-23.md).

## Validation

La validation locale minimale reste :

\`\`\`bash
npm run typecheck
npm run typecheck:server
npm test
npm run build
\`\`\`

Ajouter les gates ciblées pour API, ESI, security, corporation ou persistance selon le changement.

La CI actuelle est désormais le mécanisme de certification de référence. CI-001 est en clôture pré-merge ; aucune nouvelle PR ne doit être ouverte uniquement pour relancer la CI.

## Documentation

La documentation active est sous [docs/](docs/). Suivre [docs/documentation-guide.md](docs/documentation-guide.md).

Lorsqu'un contrat change, mettre à jour dans la même évolution le contrat, l'invariant, la validation et le statut/roadmap si nécessaire.

Les audits ne sont pas des sources de vérité courantes, mais ils peuvent conserver la preuve et le raisonnement d'une étude. Les décisions applicables doivent être reflétées dans les documents actifs.

## CI management study

La situation actuelle de la CI est documentée dans :

- [CI Validation](docs/validation/ci.md)
- [CI Management Audit](docs/audits/ci-management-audit-2026-09-23.md)
- [CI-001 — Refonte du système CI](docs/roadmap/ci-management-refactor.md)

CI-001 est le chantier CI unique jusqu'à sa fusion. Après fusion, les évolutions de durcissement encore identifiées doivent être traitées comme des chantiers distincts, sans rouvrir une seconde PR sur CI-001.

## Maintenance

Avant fusion : liens valides, statuts cohérents, noms de fichiers actuels, absence de doublons normatifs et absence de dépendance aux vieux audits.
