# CI-001 — Refonte du système CI, validation et gouvernance

Status: ACTIVE — CI-001I
Scope: GitHub Actions, test certification, browser E2E et gouvernance des PR
Owner: project maintainers
Baseline: main @ \`d7f245ec47a8746306792ce6017496f9123c23d6\`
Study: [Audit CI — gestion, performance et gouvernance](../audits/ci-management-audit-2026-09-23.md)
Current validation: [CI Validation](../validation/ci.md)
Coverage model: [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md)
Current baseline: [CI-001A/B — Baseline](../audits/ci-management-baseline-2026-09-23.md)
Evidence map: [CI-001B — Evidence Map](../validation/ci-evidence-map.md)

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

## Current execution state

CI-001 is now the single active cross-cutting chantier and the absolute CI priority. The active branch is `ci/ci-001a-baseline`; there must be no second active PR for CI-001.

CI-001A/B through CI-001G are implemented, with CI-001G certified on head `bc2ff6c24a6b4b419311b287ddd0b206489093c3`. CI-001H is now the active execution slice: separate main post-merge smoke, scheduled/manual Full Repository Certification, and explicit recovery guidance.

CI-001A/B established the baseline/evidence map and CI-001C hardened workflow permissions, action immutability and runtime reproducibility. CI-001D is proven; CI-001G is certified; CI-001H now separates Main/Full/recovery. Required-check naming, branch protection and Playwright workers remain unchanged.

## État actuel de référence

Le workflow principal est :

\`\`\`
pull_request/push main
        │
        ├────────► static
        ├────────► unit-domain
        ├────────► server
        ├────────► build
        └────────► browser-e2e
                         │
          validate ◄────┴─ compatibility aggregation
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

## Programme phasé

CI-001 est volontairement traité comme un **programme de maîtrise CI** et non comme un seul changement de workflow.

Chaque phase possède :

- un périmètre fermé ;
- des preuves attendues ;
- un gate de sortie ;
- une stratégie de rollback ;
- une mise à jour documentaire ;
- une vérification de la matrice globale.

Aucune phase ne doit supprimer une preuve sans identifier explicitement l'invariant qu'elle protégeait et son remplacement.

### CI-001A — Freeze, baseline et observabilité de départ

Objectif : établir l'état de référence avant optimisation.

Travail :

- figer SHA, workflows et scripts de référence ;
- mesurer plusieurs runs représentatifs ;
- mesurer durée par job et par suite ;
- comptabiliser success/cancel/failure/rerun ;
- identifier les jobs coûteux ;
- recenser les checks requis lorsque l'accès admin sera disponible ;
- valider la matrice de couverture initiale.

Gate :

> aucune modification de topologie tant que le baseline et les zones inconnues ne sont pas documentés.

### CI-001B — Inventaire risques → preuves → déclencheurs

Objectif : vérifier qu'aucun domaine critique ne reste sans preuve.

Construire la relation :

\`risque → invariant → test → job → trigger → environnement → preuve\`

Couvertures à recenser :

- typecheck ;
- domaine/engine ;
- finance/evidence/persistence ;
- API/server ;
- ESI/rate-limit/auth ;
- market truth ;
- corporation boundary ;
- browser ;
- SDE ;
- build/runtime ;
- documentation/workflow.

Gate :

> chaque risque critique possède une preuve identifiable ou une lacune explicitement assumée comme conditionnelle.

### CI-001C — Reproductibilité et sécurité de la supply chain CI

Objectif : rendre l'exécution CI elle-même robuste et minimale.

Travail :

- permissions explicites au minimum nécessaire ;
- politique de secrets ;
- politique de pinning des actions ;
- vérification Node/npm/lockfile ;
- contrôle de dérive runner ;
- revue des dépendances lorsque disponible ;
- évaluation de l'attestation de build si le mode de distribution la rend pertinente ;
- tests des contrats de workflow.

Gate :

> le pipeline dispose d'un modèle de sécurité et de reproductibilité documenté, sans élargissement implicite des permissions.

### CI-001D — Topologie et parallélisation contrôlée

Objectif : supprimer les dépendances séquentielles sans modifier la couverture.

État : ACTIVE — implémentation sur la branche CI-001 unique.

Travail :

- détacher browser de \`validate\` ;
- découper static / unit-domain / server / build ;
- conserver les tests fonctionnels ;
- mesurer le chemin mural ;
- surveiller le coût des installations parallèles.

Gate :

> la couverture fonctionnelle reste au moins équivalente et le chemin mural diminue sur plusieurs runs représentatifs.

### CI-001E — Taxonomie et ownership des tests

Objectif : rendre la certification intelligible et sans doublons injustifiés.

État : ACTIVE — ownership canonique fixé et premier dédoublonnage appliqué.

Travail :

- matrice test → responsabilité ;
- suite canonique par responsabilité ;
- séparation Fast / Certification / Full ;
- suppression des ré-exécutions historiques non justifiées ;
- politique explicite pour les tests lents ;
- politique de flaky tests : détecter, classifier, corriger, réactiver.

Gate :

> aucun test de certification n'a une responsabilité ambiguë ou plusieurs propriétaires implicites.

### CI-001F — Browser E2E isolation et composition

Objectif : accélérer l'E2E sans introduire de flakiness.

État : ACTIVE — Auth et Operations sont séparés en jobs indépendants.

Travail :

- séparer Auth et Operations en jobs ;
- conserver \`workers: 1\` au départ ;
- isoler les contrôles globaux ;
- améliorer diagnostics/artefacts ;
- mesurer le coût browser setup versus execution ;
- n'autoriser sharding/workers supplémentaires qu'après preuve d'isolation.

Gate :

> les jobs browser sont indépendants du reste de la CI et les scénarios restent reproductibles.

Playwright recommande la stabilité/reproductibilité avec un seul worker en CI et propose le sharding lorsque la parallélisation doit devenir plus large ; l'isolation de l'état externe doit être établie avant cette étape.

### CI-001G — Change detection et required-gate

État : COMPLETED — certifié sur head `bc2ff6c24a6b4b419311b287ddd0b206489093c3`.

Objectif : rendre les validations conditionnelles sûres.

Travail :

- détection de domaines impactés ;
- fallback conservateur en cas d'ambiguïté ;
- \`required-gate\` stable ;
- jobs conditionnels sans workflow-level path filtering dangereux ;
- vérification réelle de la branch protection ;
- prise en charge de \`merge_group\` si une merge queue est activée.

Gate :

> chaque PR obtient un signal de fusion stable et aucune validation requise ne peut rester silencieusement en attente.

### CI-001H — Cycle Main : post-merge, Full et récupération

État : IMPLEMENTED — workflows Main/Full et recovery runbook implémentés sur la branche CI-001 unique. Le Main Smoke est une preuve post-merge; le Full reste un contrôle manual/scheduled indépendant.

Objectif : séparer santé immédiate et certification exhaustive.

Travail :

- smoke post-merge court ;
- Full Repository Certification planifiée/manuelle ;
- tests de régression transversale ;
- timeouts explicites ;
- politique retry/rerun ;
- diagnostics de panne ;
- procédure de rollback CI.

Gate :

> un merge normal ne répète plus inutilement toute la certification profonde, tandis qu'une certification complète reste disponible et traçable.

### CI-001I — Observabilité durable et contrôle de performance

État : COMPLETED — collecteur de métriques exécutable et runtime-verified par PR run `35856208503`.

Objectif : transformer les gains ponctuels en système mesurable.

Travail :

- durée workflow/job/step ;
- taux d'annulation ;
- taux de rerun ;
- flakiness ;
- coût relatif des lanes ;
- fréquence des certifications Full ;
- top lenteurs ;
- seuils d'alerte/dérive ;
- artefact machine-readable conservé pour l'analyse de tendance.

Gate :

> une dégradation significative de la CI devient observable sans nouvel audit manuel complet.

### CI-001J — Final certification, documentation et handover

Objectif : vérifier la couverture complète avant clôture.

Travail :

- rejouer la matrice globale ;
- exécuter une certification Full ;
- vérifier tests/meta-tests ;
- vérifier workflows et permissions ;
- vérifier branch protection/rulesets ;
- vérifier runbook ;
- mettre à jour Master Plan, Current State, Known Gaps et validation ;
- reclasser les gaps restants : \`closed\`, \`conditional\` ou \`known/accepted\`.

Gate de clôture :

> aucune lacune requise n'est inexpliquée dans [CI-001 Global Coverage Matrix](../validation/ci-coverage-matrix.md).

## Règle de progression entre phases

Une phase peut produire du code, de la documentation ou des métadonnées, mais elle ne devient la nouvelle base qu'après son gate.

Les phases peuvent être regroupées dans une même PR uniquement lorsque leur dépendance est strictement linéaire et que cela ne rend pas le rollback ou le diagnostic ambigu.

Le découpage en phases est donc une **barrière de sécurité contre les gaps**, pas une obligation de multiplier les PR.

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

État actuel : **PRE-MERGE CLOSURE — CI-001J**.

CI-001 est désormais le chantier prioritaire unique pour la CI et la gouvernance de livraison. UX-02 reste suspendu pendant cette tranche d'infrastructure.

CI-001D est désormais mesuré sur deux runs verts ; **CI-001E** a engagé l’ownership canonique ; **CI-001F** est la tranche active : isolation Auth/Operations et preuve de reproductibilité browser.

La protection de branche et les required checks restent inchangés jusqu'à vérification administrative explicite.

## Pre-merge closure

Le chantier ne doit pas être modifié par de nouvelles optimisations avant merge. Les prérequis restants sont : validation humaine de la PR, vérification administrative de la branch protection/ruleset de `main`, et conservation du head vert. Le Main Smoke et le Full Certification restent des preuves séparées qui ne doivent pas être artificiellement produites comme prérequis de fusion.
