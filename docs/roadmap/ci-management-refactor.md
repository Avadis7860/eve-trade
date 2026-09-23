# CI-001 — Refonte du système CI, validation et gouvernance

Status: PLANNED / PRIORITY DECISION PENDING
Scope: GitHub Actions, test certification, browser E2E et gouvernance des PR
Owner: project maintainers
Baseline: main @ \`6e3f611f8bdce6ad42236f7082b3dc044582dbef\`
Study: [Audit CI — gestion, performance et gouvernance](../audits/ci-management-audit-2026-09-23.md)
Current validation: [CI Validation](../validation/ci.md)

## Objective

Transformer la CI d'une chaîne de validation monolithique et réactive en un système prévisible :

- feedback rapide pendant l'itération ;
- certification complète au moment pertinent ;
- parallélisation des validations indépendantes ;
- suppression des exécutions redondantes ;
- E2E organisé par responsabilité ;
- check obligatoire stable ;
- gouvernance PR explicite ;
- certification exhaustive séparée du cycle normal de merge.

## Non-goals

CI-001 ne vise pas à :

- réécrire les tests métier ;
- supprimer les tests existants sans remplacement de preuve ;
- augmenter immédiatement les workers Playwright ;
- introduire une infrastructure self-hosted ;
- optimiser prématurément chaque seconde d'installation ;
- résoudre les gaps métier de UX-02.

## Principe directeur

> Une modification doit recevoir le signal dont elle a besoin au moment où elle en a besoin : debug rapide pendant l'itération, certification profonde avant merge, santé courte après merge, certification exhaustive planifiée.

## État actuel de référence

Le workflow principal est :

\`\`\`
pull_request/push main
        │
        ▼
   validate
        │
        ▼
 browser-e2e
\`\`\`

Le job \`validate\` regroupe presque toutes les validations. Le browser E2E attend la totalité de ce job.

La concurrence est actuellement par référence de workflow avec annulation du run obsolète sur cette référence.

## Architecture cible

\`\`\`
Draft PR ───────────────► PR Fast Gate
                               │
                               └── feedback d'itération

Ready for Review ───────► PR Certification Gate
                              ├── static/typecheck
                              ├── unit/domain
                              ├── server/API/security/ESI
                              ├── build
                              ├── browser-auth
                              ├── browser-operations
                              └── SDE si périmètre sensible
                                      │
                                      ▼
                              CI / required-gate

main push ──────────────► post-merge smoke court

schedule/manual ────────► Full Repository Certification
\`\`\`

## Règles de déclenchement

### PR Fast

Le Fast Gate s'exécute sur :

- \`opened\` ;
- \`synchronize\` ;
- \`reopened\`.

Une PR Draft reste dans ce niveau tant qu'elle n'est pas prête à être certifiée.

### PR Certification

La Certification s'exécute :

- sur \`ready_for_review\` ;
- sur \`synchronize\` lorsque la PR n'est plus Draft ;
- sur \`reopened\` lorsque la PR est non-Draft.

Cette stratégie permet de développer longtemps dans une Draft sans payer systématiquement le coût complet du navigateur et des suites profondes.

### Main

Le push sur \`main\` ne doit plus refaire automatiquement la certification complète de PR.

Il doit exécuter un smoke post-merge court.

### Full

Une certification exhaustive est déclenchée :

- sur planning ;
- manuellement ;
- éventuellement sur une phase spécifique du chantier lorsque le périmètre le justifie.

## Concurrence cible

Le principe retenu est :

1. **annuler le run obsolète d'une même PR** ;
2. **ne pas sérialiser tout le dépôt** ;
3. **ne pas utiliser la concurrence comme substitut à la gouvernance PR** ;
4. conserver des groupes distincts pour les phases Fast et Certification si nécessaire ;
5. aligner également le SDE gate sur une politique de concurrence cohérente.

Une optimisation de file globale ne sera considérée qu'après mesure du débit réel du nouveau système.

## Découpage des validations

La première cible raisonnable est de passer du job monolithique \`validate\` à des familles indépendantes.

### Famille static

- frontend typecheck ;
- backend typecheck ;
- workflow contracts ;
- config/auth rapides.

### Famille unit/domain

- suite unitaire canonique ;
- truth ;
- corporation boundary si pertinente.

### Famille server

- API ;
- smoke ;
- security ;
- ESI.

### Famille build

- production build.

### Famille browser

- Auth ;
- Operations.

Le nombre exact de jobs reste à ajuster selon le coût de \`npm ci\`, mais chaque job doit avoir une responsabilité lisible.

## Test taxonomy

Créer une matrice explicite :

| Niveau | Question | Exemple |
|---|---|---|
| Fast | le changement est-il structurellement sain ? | typecheck, config, tests rapides |
| Certification | le périmètre est-il intégralement prouvé ? | unit, API, security, ESI, build, browser |
| Full | le dépôt entier reste-t-il cohérent ? | toutes les suites, E2E, SDE si applicable |

Chaque fichier de test doit avoir une responsabilité canonique.

Un test ne doit pas être ajouté à plusieurs scripts de certification sans justification documentaire.

## Browser E2E

### Étape initiale

Séparer :

- \`browser-auth\` ;
- \`browser-operations\`.

Conserver \`workers: 1\` au départ.

### Étape future

N'autoriser plusieurs workers qu'après avoir éliminé ou isolé :

- state global OAuth ;
- state global market ;
- endpoints de contrôle partagés ;
- toute dépendance de test à un ordre d'exécution.

La parallélisation intra-suite sera alors mesurée, pas supposée.

## Change detection

Ajouter une détection de périmètre à l'intérieur du workflow.

Domaines cibles :

- frontend ;
- engine/domain ;
- services ;
- server/API/ESI ;
- SDE/data ;
- workflows ;
- package/config ;
- tests/docs.

La détection ne doit pas empêcher le workflow principal de produire un check.

Elle doit seulement décider quelles validations spécialisées sont pertinentes.

En cas de périmètre ambigu :

> fallback vers la certification profonde plutôt que vers une absence de preuve.

## Required gate

Créer un job agrégateur stable : \`required-gate\`.

Exigences :

- il s'exécute avec \`if: always()\` ;
- il dépend des jobs de validation ;
- \`success\` de tous les jobs requis → succès ;
- \`failure\` d'un job requis → échec ;
- \`skipped\` d'un job conditionnel non pertinent → accepté ;
- aucune branche ne dépend d'un nom de job temporaire.

Le nom du check obligatoire est une API de gouvernance : il doit évoluer rarement.

## Main post-merge

Le push \`main\` doit fournir :

- smoke serveur ;
- vérification build/runtime minimale ;
- éventuellement un contrôle de migration/manifeste court.

La certification complète ne doit pas être dupliquée automatiquement immédiatement après chaque merge.

## Full Certification

Le Full Gate doit rester exhaustif.

Il sert à détecter :

- régression transversale ;
- drift de suites ;
- problème de packaging ;
- incohérence SDE/manifests ;
- régression browser non représentée par le Fast Gate ;
- dépendance oubliée entre domaines.

Il doit être planifié et consultable comme preuve de santé du dépôt.

## Actions GitHub

Mettre à jour séparément :

- \`actions/checkout\` ;
- \`actions/setup-node\` ;
- \`actions/upload-artifact\`.

Cette évolution sera traitée comme une maintenance indépendante afin d'éviter de mélanger runtime des actions, topologie CI et logique de certification.

## Observabilité CI

Introduire un relevé simple des temps :

- workflow total ;
- job ;
- suite de test ;
- browser setup ;
- browser execution ;
- npm install ;
- fréquence d'annulation ;
- fréquence de rerun.

La cible est de pouvoir prouver l'amélioration après chaque tranche.

## Gouvernance de développement

Règle normative du chantier :

> Un chantier = une branche active = une PR active.

Pendant l'itération :

1. rester en Draft ;
2. accumuler les corrections sur la même branche ;
3. laisser le Fast Gate produire le signal ;
4. attendre le résultat du run pertinent ;
5. passer en Ready for Review pour déclencher la certification profonde.

Une nouvelle PR ne doit pas être ouverte uniquement pour provoquer un nouveau run CI.

Un nouveau PR est justifié seulement par :

- changement de périmètre ;
- nouvelle base ;
- séparation volontaire d'un chantier ;
- abandon explicite du chantier précédent.

## Ordre d'implémentation

### CI-001A — Baseline et observabilité

- figer les mesures de référence ;
- ajouter le résumé des temps dans la documentation ;
- établir la matrice test → niveau → responsabilité ;
- identifier les duplications.

Gate :
les durées et responsabilités sont mesurables avant changement de topologie.

### CI-001B — Parallélisation sans changement de contrat

- détacher browser de \`validate\` ;
- paralléliser les familles indépendantes ;
- conserver la certification fonctionnelle existante.

Gate :
mêmes preuves fonctionnelles, chemin mural réduit, aucun check obligatoire supprimé.

### CI-001C — Test ownership et déduplication

- redessiner les scripts npm ;
- supprimer les exécutions redondantes ;
- conserver une suite canonique par responsabilité.

Gate :
chaque test de certification a un propriétaire logique et un niveau explicite.

### CI-001D — Browser composition

- séparer Auth et Operations ;
- conserver un worker par job ;
- stabiliser le harness ;
- mesurer les gains.

Gate :
E2E parallèle au reste de la CI et diagnostics lisibles.

### CI-001E — Fast / Certification / Main / Full

- introduire l'état Draft vs Ready for Review ;
- créer le post-merge smoke ;
- déplacer la certification exhaustive vers Full.

Gate :
l'itération courante ne paie plus systématiquement la certification complète.

### CI-001F — Change detection + required gate

- ajouter la détection de périmètre ;
- ajouter \`required-gate\` ;
- vérifier manuellement la branch protection ;
- stabiliser les noms de checks.

Gate :
les validations conditionnelles peuvent être utilisées sans fragiliser la fusion.

### CI-001G — Governance et maintenance

- documenter la règle un chantier/une PR ;
- documenter rerun vs nouveau PR ;
- mettre à niveau les actions GitHub ;
- mettre à jour les métriques de référence.

Gate :
le système technique et le comportement d'équipe racontent la même histoire.

## Critères de succès

CI-001 est considéré comme terminé lorsque :

1. le feedback Fast est nettement plus court que la certification complète ;
2. browser, server et validation statique progressent en parallèle lorsque leurs dépendances le permettent ;
3. la PR dispose d'un check obligatoire stable ;
4. une PR Draft ne paie pas systématiquement le coût complet ;
5. une seconde PR n'est plus utilisée comme mécanisme de relance CI ;
6. les suites de tests ne se chevauchent plus sans justification ;
7. le post-merge \`main\` n'exécute plus par défaut une copie intégrale de la certification PR ;
8. la certification Full reste disponible et lisible ;
9. les performances sont mesurées sur plusieurs runs, pas sur un seul run opportuniste.

## Rollback strategy

Chaque tranche doit être réversible.

En particulier :

- ne pas changer les noms des checks obligatoires et la topologie dans le même commit ;
- garder une voie temporaire vers la validation complète existante ;
- conserver les scripts historiques jusqu'à ce que leurs remplaçants aient une preuve équivalente ;
- revenir à \`workers: 1\` si le browser devient flaky ;
- revenir à la validation monolithique si la parallélisation introduit des conditions de course non comprises.

## Priorité

État actuel : **PRIORITY DECISION PENDING**.

Cette roadmap est prête à devenir le chantier prioritaire, mais elle ne modifie pas encore l'ordre produit actuel.

Si CI-001 devient la priorité absolue, le premier incrément à lancer est **CI-001A + CI-001B**, sans toucher immédiatement aux règles de protection de branche.
