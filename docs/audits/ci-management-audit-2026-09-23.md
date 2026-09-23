# Audit CI — gestion, performance et gouvernance

Status: HISTORICAL STUDY / CURRENT DECISION INPUT
Date: 2026-09-23
Scope: GitHub Actions, packaging des tests, E2E navigateur, concurrence des runs et gouvernance PR
Baseline main: \`6e3f611f8bdce6ad42236f7082b3dc044582dbef\`
Source of truth: \`.github/workflows/\`, \`package.json\`, \`playwright.config.ts\`, scripts de tests et historique GitHub Actions
Related plan: [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)

## Objet de l'étude

Cette étude ne modifie pas le comportement de la CI. Elle documente l'état réel de la chaîne de validation et prépare une refonte contrôlée avant toute décision de priorité.

Le problème identifié n'est pas uniquement une CI "lente". Le problème principal est l'alignement insuffisant entre la topologie des jobs, le coût des validations, la redondance des suites, la concurrence des runs et la gouvernance d'un chantier en cours.

L'incident observé autour des PR #53 à #58 est donc traité comme un symptôme de gouvernance et d'architecture CI, pas comme une simple série d'échecs isolés.

## Conclusion exécutive

1. **La validation principale est trop séquentielle.** Le job \`validate\` enchaîne typechecks, contrats, suites unitaires, API, smoke, sécurité, ESI et build alors que plusieurs familles sont indépendantes.
2. **Le browser E2E est placé derrière toute la validation.** Sur le dernier run réussi étudié, \`validate\` a duré ~104 s et \`browser-e2e\` ~166 s. Leur dépendance pousse le chemin mural vers ~276 s hors file d'attente.
3. **\`npm test\` exécute environ 37 commandes séquentielles.** Plusieurs gates spécialisées réutilisent ensuite certains mêmes tests, ce qui révèle une taxonomie de certification imparfaite.
4. **La concurrence actuelle est par référence de workflow.** Le groupe \`\${{ github.workflow }}-\${{ github.ref }}\` annule les anciens runs sur une même référence, mais ne coordonne pas plusieurs PR distinctes.
5. **Le SDE gate est rapide mais sans concurrence homogène avec la CI principale.** Son coût mural est faible ; son principal problème est la lisibilité et la gestion de churn.
6. **Le browser harness contient un état mutable global.** Passer naïvement à plusieurs workers Playwright n'est donc pas une optimisation sûre.
7. **Le gain prioritaire est structurel.** Il faut paralléliser les validations indépendantes, séparer itération et certification et donner un check agrégateur stable avant d'optimiser chaque seconde.
8. **La discipline PR est une partie de la solution.** La CI peut annuler un run obsolète sur une PR, mais elle ne sait pas qu'une nouvelle PR est la continuation humaine du même chantier sans convention explicite.

## Mesures historiques

L'historique étudié contient environ **940 workflow runs**.

### CI Foundation & Regression Gate

Sur **589 runs** historiques :

| Conclusion | Runs |
|---|---:|
| success | 89 |
| failure | 163 |
| cancelled | 337 |

Sur les 100 runs les plus récents examinés :

| Conclusion | Runs |
|---|---:|
| success | 8 |
| failure | 23 |
| cancelled | 20 |

La proportion élevée de \`cancelled\` ne constitue pas à elle seule une mesure d'instabilité fonctionnelle : elle reflète également la cadence de pushes et \`cancel-in-progress\`.

### SDE Truth Gate

Sur environ **308 runs PR** du gate SDE :

- 295 success ;
- 9 failure ;
- 4 skipped.

Le gate SDE est donc globalement fiable et peu coûteux individuellement.

### Churn de branches observé

| Branche historique | CI Foundation | Success | Failure | Cancelled |
|---|---:|---:|---:|---:|
| \`feat/ux-02-operations\` | 19 | 3 | 8 | 8 |
| \`feat/ux-02-close-gate\` | 15 | 2 | 7 | 6 |
| \`feat/ux-02-consistency-gates-final\` | 7 | 0 | 4 | 3 |
| \`feat/ux01-market-truth-ci\` | 19 | 1 | 4 | 14 |
| \`e2e/e2e-001-browser-oauth-gate\` | 98 | 4 | 28 | 66 |

Ces chiffres décrivent surtout le coût de synchronisation CI lorsque l'effort est mené par essais successifs et nouvelles PR.

## Anatomie du pipeline actuel

Source : \`.github/workflows/ci.yml\`.

### Job \`validate\`

Le job exécute successivement :

- checkout ;
- setup Node 22 ;
- \`npm ci\` ;
- typecheck frontend ;
- typecheck backend ;
- contrats CI ;
- configuration runtime ;
- JWT EVE SSO ;
- vérité catalogue/univers ;
- frontière corporation/ESI ;
- \`npm test\` ;
- API ;
- smoke serveur ;
- sécurité ;
- ESI ;
- build production.

### Job \`browser-e2e\`

Le job :

- attend \`validate\` ;
- installe Node et les dépendances ;
- installe Chromium + dépendances système ;
- exécute \`npm run test:e2e\` ;
- publie les diagnostics Playwright.

## Mesure fine du dernier run vert

Run : \`35826687206\`.

Ordre de grandeur observé :

| Étape | Temps approximatif |
|---|---:|
| \`validate\` — job complet | 104 s |
| \`npm ci\` dans \`validate\` | 9 s |
| frontend typecheck | 17 s |
| backend typecheck | 10 s |
| \`npm test\` | 35 s |
| production build | 7 s |
| \`browser-e2e\` — job complet | 166 s |
| \`npm ci\` browser | 6 s |
| Playwright/Chromium install | 21 s |
| E2E | 131 s |

La dépendance \`needs: validate\` produit un chemin mural proche de ~276 s.

**Gain structurel théorique immédiat :** faire courir \`browser-e2e\` en parallèle de \`validate\` ramènerait un run comparable vers le maximum des deux (~166 s), soit environ **40 % de réduction du chemin mural**. Il s'agit d'un ordre de grandeur, pas d'une garantie.

## Concurrence : diagnostic précis

La configuration actuelle est :

\`\`\`yaml
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
\`\`\`

Elle est adaptée à l'annulation des versions obsolètes d'une même référence, mais elle ne constitue pas une gouvernance de chantier.

Deux PR différentes disposent de références différentes ; un run de PR #53 n'annule donc pas un run de PR #54.

Le système ne sait pas distinguer automatiquement :

\`\`\`
commit A → PR53
commit B → PR54
commit C → PR55
\`\`\`

lorsque ces trois PR sont en réalité une succession d'essais d'un même chantier.

**Ne pas remplacer immédiatement cette concurrence par une concurrence globale du dépôt.** Cela ferait aussi entrer en compétition des changements réellement indépendants.

## Test suite : diagnostic

\`package.json\` contient un \`test\` global d'environ 37 commandes lancées séquentiellement.

Des tests réapparaissent dans plusieurs niveaux de certification, notamment :

- \`financial_config.test.ts\` ;
- \`catalog_universe_truth.test.ts\` ;
- \`treasury.test.ts\` ;
- \`universe_graph_builder.test.mjs\` ;
- \`character_routes_contract.test.ts\` ;
- \`corporation_esi_gateway.test.ts\` ;
- \`corporation_esi_architecture.test.ts\`.

Le coût actuel de chaque test reste raisonnable. Le vrai problème est la lisibilité de la certification : il devient difficile de savoir quelle suite est normative, laquelle est ciblée et laquelle est simplement ré-exécutée par héritage historique.

## Browser E2E : diagnostic

Configuration actuelle :

- \`fullyParallel: false\` ;
- \`workers: 1\` ;
- timeout 45 s ;
- retries CI = 1 ;
- Chromium uniquement.

Environ 17 tests sont présents :

- 13 Auth/OAuth ;
- 4 Operations.

Le harness utilise des contrôles globaux pour OAuth et marché. Les endpoints de contrôle modifient un état mutable partagé.

Conclusion :

> **Ne pas passer immédiatement à plusieurs workers Playwright.**

La première optimisation sûre est la séparation des responsabilités :

- browser Auth ;
- browser Operations ;
- un worker par job au départ.

## SDE Truth Gate : diagnostic

\`.github/workflows/phase-2.7c-sde.yml\` :

- détecte les chemins sensibles SDE ;
- télécharge un build CCP épinglé ;
- régénère le graphe canonique ;
- vérifie l'absence de diff ;
- utilise \`contents: read\`.

Le gate est utile et peu coûteux. Son optimisation de temps n'est pas prioritaire.

La future refonte doit surtout aligner son déclenchement et sa concurrence sur le nouveau modèle.

## Main versus PR : redondance structurelle

La validation principale est déclenchée :

- sur \`pull_request\` vers \`main\` ;
- puis sur \`push\` vers \`main\`.

Une évolution peut donc être certifiée avant merge puis repayer une certification complète immédiatement après merge.

La cible doit distinguer :

- **PR** : preuve de mergeabilité ;
- **main post-merge** : smoke court ;
- **nightly/manual** : certification exhaustive.

## Maintenance des actions

La CI actuelle utilise \`actions/checkout@v4\`, \`actions/setup-node@v4\` et \`actions/upload-artifact@v4\`.

Au 23 septembre 2026, des versions majeures plus récentes sont disponibles. Cette maintenance est pertinente mais secondaire par rapport à la topologie des jobs et à la gouvernance de certification.

Elle doit être isolée de la grosse refonte.

## Ce qu'il ne faut pas faire

### Concurrence globale unique

Elle masquerait le problème de gouvernance et ferait attendre des changements indépendants.

### Workers Playwright en masse

Le harness actuel n'est pas isolé pour partager son état mutable entre workers.

### Filtres de workflow \`paths:\` sur les checks requis

Un workflow omis par filtrage peut laisser un check requis en attente et bloquer la fusion.

La détection de périmètre doit donc rester à l'intérieur d'un workflow qui produit toujours un check.

### Cache \`node_modules\` comme optimisation principale

Le cache npm déjà fourni par \`setup-node\` traite le téléchargement des paquets sans introduire un cache binaire fragile.

### Certification complète après chaque merge

Le besoin post-merge est d'abord la détection rapide de régression sur \`main\`, pas la répétition immédiate de toute la preuve PR.

### Nouvelle PR pour obtenir un nouveau signal

Un échec ambigu doit d'abord conduire à une correction sur la même PR, puis à l'attente du run pertinent ou à un rerun du job échoué.

## Architecture cible retenue par l'étude

### Niveau A — PR Fast Gate

Déclenché sur chaque évolution de PR, y compris en Draft.

Contenu cible :

- installation Node/cache ;
- typechecks frontend/backend ;
- contrats CI ;
- configuration/auth rapides ;
- tests ciblés évidents selon le diff.

Objectif : **déboguer**, pas certifier tout le dépôt.

### Niveau B — PR Certification Gate

Déclenché quand la PR passe en Ready for Review puis à chaque nouveau commit d'une PR non-Draft.

Contenu cible :

- unit/domain ;
- server/API/security/ESI ;
- build ;
- browser Auth ;
- browser Operations ;
- SDE si périmètre affecté.

Objectif : **certifier la PR prête à fusionner**.

### Niveau C — Main / Full

Sur \`main\` :

- smoke post-merge court ;
- certification exhaustive planifiée/manual.

Objectif : **surveiller et certifier le dépôt**, sans allonger chaque merge.

## Check agrégateur

Le nouveau système devra exposer un check stable, par exemple :

\`CI / required-gate\`

Règles :

- un job conditionnel non concerné peut être \`skipped\` ;
- un job réellement requis en échec fait échouer le gate ;
- le nom du check requis reste stable pendant la migration ;
- aucun workflow requis ne doit dépendre d'un filtrage \`paths\` au niveau workflow.

## Observabilité à ajouter

Le système devra pouvoir répondre à :

- durée totale d'un workflow ;
- durée par job ;
- durée par suite de test ;
- runs par PR ;
- runs annulés ;
- reruns ;
- runs SDE hors périmètre utile ;
- durée E2E Auth ;
- durée E2E Operations ;
- temps npm ;
- temps Playwright ;
- top des suites les plus lentes.

## Limites de l'étude

L'accès GitHub disponible n'a pas permis de lire la protection de branche de \`main\` ni les rulesets : les endpoints correspondants ont renvoyé \`403 Resource not accessible by integration\`.

Avant de renommer ou redéfinir le check obligatoire, la configuration réelle de branch protection doit être vérifiée avec des droits administratifs appropriés.

Aucune hypothèse de merge queue n'est retenue.

## Décision préparée

L'étude conclut que **CI-001 est suffisamment spécifié pour devenir un chantier prioritaire**, mais aucun changement d'implémentation n'est inclus dans cette étude.

La priorité reste à décider séparément afin de ne pas confondre :

- la preuve du problème ;
- la décision de priorité ;
- l'exécution technique.

Voir [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md).
