# CI-001A/B — Baseline et photographie de départ

Status: CURRENT BASELINE + D IMPLEMENTATION EVIDENCE
Date: 2026-09-23
Baseline main: `d7f245ec47a8746306792ce6017496f9123c23d6`
Branch: `ci/ci-001a-baseline`
Scope: GitHub Actions, suites de tests, browser E2E, gouvernance PR, sécurité CI et preuves

## Objet

Ce document fige la photographie de CI avant toute modification significative de topologie.

La règle de travail est :

> Risque → Invariant → Test → Job → Déclencheur → Environnement → Preuve → Récupération

CI-001A/B ne modifie pas encore les workflows ni le comportement applicatif. Il établit la base de mesure, les contraintes et la relation de couverture qui serviront de garde-fou aux phases suivantes.

## État GitHub au démarrage

- dépôt privé : `Avadis7860/eve-trade` ;
- branche par défaut : `main` ;
- `main` : `d7f245ec47a8746306792ce6017496f9123c23d6` ;
- PR #59 : fusionnée dans ce commit ;
- aucune PR ouverte observée au moment de la photographie ;
- seule branche de travail supplémentaire observée : `docs/ci-management-study-2026-09-23`, ancienne branche de PR #59, désormais divergente de `main` et non utilisée pour CI-001 ;
- branche CI-001 active : `ci/ci-001a-baseline`, créée directement depuis `main @ d7f245ec...`.

La branche de CI-001 doit rester unique pour le chantier. Une seconde PR ne doit pas être créée pour obtenir un signal CI supplémentaire.

## Contraintes GitHub vérifiées

### Branch protection / required checks

La lecture de `/branches/main/protection` retourne actuellement :

`403 Resource not accessible by integration`

La lecture des rulesets retourne actuellement :

`403 Upgrade to GitHub Pro or make this repository public to enable this feature`

L'API de liste des branches indique `protected: false` pour `main`, mais cette observation ne suffit pas à conclure à elle seule sur l'ensemble de la protection effective lorsque les endpoints dédiés et les rulesets ne sont pas accessibles.

Décision CI-001 :

> aucun renommage ou remplacement de required check avant vérification administrative de la protection effective de `main`.

### Merge queue

Aucune preuve d'utilisation d'une merge queue n'a été trouvée dans le dépôt ou les workflows actuels.

Décision de départ :

> ne pas ajouter `merge_group` tant qu'une merge queue n'est pas effectivement activée.

### Workflow path filtering

Les workflows actuels ne utilisent pas de `paths:` au niveau `on`.

La détection de périmètre future devra rester dans un workflow qui produit toujours un résultat observable, avec fallback conservateur.

## Architecture CI actuelle

### Workflow principal

Fichier : `.github/workflows/ci.yml`

Déclencheurs :

- `pull_request` vers `main` ;
- `push` vers `main`.

Concurrence :

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Cette concurrence annule les exécutions obsolètes d'une même référence, pas des PR distinctes.

### Job `validate`

Un seul job séquentiel exécute :

1. checkout ;
2. Node 22 + cache npm ;
3. `npm ci --no-audit --no-fund` ;
4. frontend typecheck ;
5. backend typecheck ;
6. contrats CI ;
7. configuration runtime ;
8. validation JWT EVE SSO ;
9. vérité catalogue/univers ;
10. frontière corporation/ESI ;
11. `npm test` ;
12. API ;
13. smoke serveur ;
14. sécurité ;
15. ESI ;
16. build production.

### Job `browser-e2e`

Le job dépend actuellement de `validate`.

Il exécute :

- checkout ;
- Node 22 + cache npm ;
- `npm ci` ;
- installation Chromium + dépendances système ;
- `npm run test:e2e` ;
- publication du rapport Playwright.

### Workflow SDE

Fichier : `.github/workflows/phase-2.7c-sde.yml`

Caractéristiques :

- `pull_request` vers `main` ;
- `permissions: contents: read` ;
- détection interne des chemins SDE ;
- checkout du SHA PR avec historique local ;
- build CCP SDE épinglé : `3503375` ;
- régénération du graphe canonique ;
- échec sur dérive ;
- aucun push / aucun commit automatique.

Le gate est actuellement ciblé et peu coûteux.

## Chemin critique

Référence de mesure : workflow run `35826687206`, dernier run vert détaillé avant PR #59.

| Élément | Temps observé |
|---|---:|
| `validate` | ~104 s |
| `browser-e2e` | ~166 s |
| chemin mural avec `browser-e2e needs validate` | ~276 s |
| `npm ci` validate | 9.0 s |
| frontend typecheck | 16.7 s |
| backend typecheck | 9.6 s |
| `npm test` | 35.5 s |
| build production | ~7.0 s |
| `npm ci` browser | 6.4 s |
| Playwright/Chromium install | 21.4 s |
| E2E | 130.8 s |

Ordre de grandeur théorique si browser et validation devenaient indépendants :

`max(104, 166) ≈ 166 s`

soit une réduction de chemin mural d'environ 40 % sur un run comparable. Cette valeur est une hypothèse de structure, pas un SLA.

### Run actuel au moment de la photographie

Run `35842730680`, commit `d7f245ec...`, run #596 :

- événement : `push` sur `main` ;
- `validate` : success ;
- le run a ensuite terminé avec une conclusion `success` ;
- aucun changement de workflow n'est inclus dans ce run.

Le détail job confirme que la certification actuelle est restée inchangée avant CI-001A/B.

Les temps ci-dessus sont issus des timestamps des étapes du run de référence ; ils servent de métrique de comparaison et ne sont pas des SLA.

## Test inventory

### Suite globale

`package.json` contient exactement 37 commandes dans `npm test`, lancées séquentiellement.

Cette suite couvre notamment :

- identité / scoping d'ordres ;
- corporation orders ;
- finance ;
- moteur de trading ;
- qualité marché ;
- simulation/exécution ;
- prediction ;
- propriétés/invariants ;
- catalogue et vérité univers ;
- certifications systémiques ;
- evidence/provenance/audit ;
- outcomes d'exécution ;
- persistance/ingestion ;
- flotte/treasury ;
- frontières de corporation ;
- interrégional / routage ;
- intégration end-to-end ;
- ESI service ;
- construction du graphe SDE.

### Suites spécialisées

- `test:api` : API integration + character routes contract ;
- `test:smoke` : server smoke ;
- `test:security` : security hardening ;
- `test:esi` : six tests ESI/gateway/architecture ;
- `test:corporation-boundary` : six validations corporation/finance/ESI ;
- `test:server` : agrégateur config + auth token + API + smoke + security + ESI ;
- `test:truth` : catalog/universe truth ;
- `test:sde` : universe graph builder ;
- `test:ci-config` : workflow contract ;
- `test:e2e` : Playwright.

### Redondances démontrées

Les chevauchements exacts entre scripts sont :

| Script A | Script B | Tests communs |
|---|---|---|
| `npm test` | `test:corporation-boundary` | `financial_config.test.ts`, `treasury.test.ts` |
| `test:api` | `test:corporation-boundary` | `character_routes_contract.test.ts` |
| `test:corporation-boundary` | `test:esi` | `corporation_esi_gateway.test.ts`, `corporation_esi_architecture.test.ts` |

Ces doublons sont des candidates à rationalisation future, pas des tests à supprimer maintenant. Aucun retrait n'est autorisé sans preuve de remplacement et d'équivalence.

## Browser E2E

Fichiers normatifs :

- `tests/e2e/auth-browser.spec.ts` : 13 tests ;
- `tests/e2e/operations-browser.spec.ts` : 4 tests.

Configuration :

- Chromium unique ;
- `fullyParallel: false` ;
- `workers: 1` ;
- timeout test 45 s ;
- expect timeout 8 s ;
- retry CI = 1 ;
- traces/screenshots/vidéos sur échec ;
- serveur de harness dédié.

Le harness `scripts/e2e/start-harness.ts` contient un état mutable de contrôle au niveau module :

- `nextAuthControl` ;
- `marketControl` ;
- contrôle direct du gateway marché.

Des endpoints `/__control__/*` modifient cet état.

Décision :

> ne pas augmenter `workers` Playwright avant isolation de cet état et preuve de reproductibilité.

## Taxonomie initiale

### Fast

Question : le changement est-il structurellement sain ?

Preuves candidates :

- typecheck frontend/backend ;
- workflow contracts ;
- runtime config ;
- auth/JWT rapide ;
- tests directement déterminés par le périmètre.

### Certification

Question : la proposition prête à merger possède-t-elle la preuve profonde requise ?

Preuves :

- unit/domain ;
- server/API/security/ESI ;
- build ;
- browser Auth ;
- browser Operations ;
- SDE si périmètre sensible.

### Full

Question : le dépôt entier reste-t-il cohérent ?

Preuves :

- toutes les suites ;
- toutes les preuves browser ;
- SDE ;
- build/runtime ;
- cross-domain regression ;
- checks de documentation et CI.

La classification est un objectif de CI-001E. Cette baseline n'en retire aucune.

## Observabilité baseline

Mesures disponibles :

- environ 940 workflow runs historiques dans l'étude ;
- CI Foundation : 589 runs historiques = 89 success / 163 failure / 337 cancelled ;
- sur les 100 plus récents étudiés : 8 success / 23 failure / 20 cancelled ;
- SDE : environ 308 runs PR = 295 success / 9 failure / 4 skipped ;
- plusieurs branches historiques montrent un volume élevé de runs annulés.

Interprétation :

> `cancelled` n'est pas assimilé à `flaky`. Il reflète aussi `cancel-in-progress` et la cadence de pushes.

Les métriques durables restent à implémenter en CI-001I.

## Risques / invariants / preuves à protéger

Le détail de la relation est maintenu dans [CI-001 Evidence Map](../validation/ci-evidence-map.md).

Les familles critiques sont :

- frontend ;
- backend ;
- domain/engine ;
- finance ;
- evidence/provenance ;
- persistence ;
- API ;
- ESI/rate-limit ;
- JWT/auth ;
- corporation boundary ;
- market truth ;
- browser Auth ;
- browser Operations ;
- SDE ;
- build/runtime ;
- workflows ;
- documentation ;
- supply chain / permissions / actions ;
- CI governance and recovery.

## Premier incrément techniquement sûr

CI-001A/B doit rester documentaire et métrologique :

1. figer la baseline `main @ d7f245ec...` ;
2. enregistrer la topologie et le chemin critique ;
3. recenser les 37 commandes et les recouvrements démontrés ;
4. établir la relation risque → preuve ;
5. documenter les inconnues GitHub ;
6. créer le runbook de migration et la matrice de sortie ;
7. ne pas modifier les required checks ;
8. ne pas modifier `workers` ;
9. ne pas introduire de change detection opérationnelle ;
10. ne pas découper `validate` tant que CI-001A/B n'est pas accepté comme nouvelle baseline.

## Mesure E2E par responsabilité

Les logs du run `35826687206` donnent les durées individuelles des 17 scénarios.

### Browser Auth — 13 tests

| Test | Durée |
|---|---:|
| nominal SSO popup → callback → postMessage → authenticated ESI → persisted session | 12.9 s |
| same-window callback lorsque le popup est bloqué | 8.9 s |
| forged same-origin postMessage | 4.7 s |
| callback state non émis par l’application | 4.6 s |
| token exchange code invalide | 4.3 s |
| redirect URI non autorisée | 4.9 s |
| OAuth state TTL expiré | 16.3 s |
| callback state rejoué | 5.7 s |
| refresh de session expirée | 9.1 s |
| logout / retour SSO | 6.1 s |
| isolation stricte de deux personnages | 7.6 s |
| refus OAuth contrôlé | 5.2 s |
| popup fermé avant callback | 5.8 s |

Somme des durées de tests Auth : **~96.1 s**.

### Browser Operations — 4 tests

| Test | Durée |
|---|---:|
| contexte opérationnel d’un ordre actif | 6.0 s |
| marché ERROR sans fausse décision | 7.1 s |
| marché PARTIAL avec page suivante en échec | 7.0 s |
| marché STALE après observation antérieure | 6.7 s |

Somme des durées de tests Operations : **~26.8 s**.

Les 17 scénarios représentent **~122.9 s de temps de test** ; le reste du coût browser provient du démarrage/harness, de l’installation du navigateur et du teardown.

## Dérive runtime observée sur le runner

Le même run émet à plusieurs reprises :

> Node.js 20 is deprecated. This workflow is running with Node 24 by default.

Les actions actuellement utilisées sont `actions/checkout@v4`, `actions/setup-node@v4` et `actions/upload-artifact@v4`.

Le projet configure Node.js 22 pour ses étapes applicatives, mais le runtime JavaScript interne de ces actions est soumis à l’évolution du runner GitHub.

Cette différence constitue un point de CI-001C/I pour la reproductibilité et la supply chain. Elle n’est pas modifiée dans CI-001A/B.

## CI-001C — Reproducibility and supply-chain hardening increment

Applied on the same branch/PR, without changing job topology or required checks:

- top-level `permissions: contents: read` on the main CI workflow;
- `persist-credentials: false` on all repository checkouts;
- immutable SHA pinning for `actions/checkout`, `actions/setup-node` and `actions/upload-artifact`;
- Node.js pinned to **22.23.2** and npm pinned by runtime verification to **10.9.8**;
- workflow contract tests extended to enforce these invariants;
- SDE workflow updated to the same immutable action/runtime policy.

Action SHAs currently resolved from the v4 tags:

| Action | SHA |
|---|---|
| `actions/checkout@v4` | `11d5960a326750d5838078e36cf38b85af677262` |
| `actions/setup-node@v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/upload-artifact@v4` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

Node.js 22.23.2 is an LTS security release; the release includes npm 10.9.8. This project deliberately pins the patch runtime for CI reproducibility and makes a mismatch fail the workflow.

CI-001C does not yet change the runner image, change detection, required gate, Playwright workers, test taxonomy or main/full topology.
## Rollback

Le rollback de CI-001A/B est trivial : supprimer les nouveaux documents et revenir au SHA `d7f245ec...`.

Aucune logique d'exécution existante n'est modifiée dans cette phase.


## CI-001D — Controlled topology split

Applied after the green CI-001C gate on the same branch/PR.

The main workflow now executes five independent execution lanes: `static`, `unit_domain`, `server`, `build` and `browser-e2e`. The historical `validate` job remains as **Validation & Non-Regression Gate**, depending on the four non-browser lanes.

The browser job no longer declares `needs: validate`, so browser setup/execution can progress in parallel with the non-browser lanes. No command was removed, no Playwright worker increase was made, and no branch-protection or required-check rename was introduced.

The first D run (`35845353011`) completed successfully. Observed job durations were approximately: static 46 s, unit/domain 60 s, server 26 s, build 31 s, browser 180 s, compatibility validate 4 s. The four non-browser lanes and browser started concurrently; the workflow therefore no longer paid the former validate-then-browser serialization.

D remains open until representative post-change runs confirm the behavior rather than treating one run as a sufficient performance sample.

### Rollback

If topology introduces an unexplained race, coverage regression or material performance regression, revert the workflow and workflow-contract test to the preceding green CI-001C state on the same branch. The full historical command set remains intact for proof-safe rollback.
