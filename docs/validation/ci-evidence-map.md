# CI-001B — Evidence Map

Status: CURRENT — CI-001B
Date: 2026-09-23
Baseline: main @ `d7f245ec47a8746306792ce6017496f9123c23d6`
Parent: [CI-001 — Refonte du système CI](../roadmap/ci-management-refactor.md)
Baseline snapshot: [CI-001A/B — Baseline et photographie de départ](../audits/ci-management-baseline-2026-09-23.md)

## Purpose

Cette carte rend explicite la relation :

> risque → invariant → test → job → déclencheur → environnement → preuve → récupération

Elle est volontairement construite sur la CI réellement exécutée aujourd'hui. Les jobs cibles de CI-001D/E/F/G/H/I/J pourront évoluer, mais ne doivent pas perdre l'invariant ni la preuve sans remplacement démontré.

L'état `GAP` ou `UNKNOWN` signifie qu'aucune preuve durable n'est encore disponible dans la configuration actuelle ; ce statut doit conduire à une décision explicite, pas à une hypothèse silencieuse.

## Current evidence map

| Domaine / risque | Invariant protégé | Test / preuve actuelle | Job actuel | Déclencheur actuel | Environnement | Preuve observable | Récupération / garde-fou |
|---|---|---|---|---|---|---|---|
| Frontend | le code frontend reste typable | `npm run typecheck` | `validate` | PR + push main | ubuntu-latest, Node 22 | check/job log | corriger sur la même PR ; rerun si transitoire |
| Backend | le serveur reste typable | `npm run typecheck:server` | `validate` | PR + push main | ubuntu-latest, Node 22 | check/job log | idem |
| Workflow CI | les invariants structurels des workflows ne dérivent pas | `npm run test:ci-config` | `validate` | PR + push main | Node 22 | job log | corriger workflow + rerun |
| Runtime config | la configuration minimale reste cohérente | `npm run test:config` | `validate` | PR + push main | Node 22 | job log | corriger config + rerun |
| Auth / JWT | les tokens EVE acceptés respectent issuer/audience/signature/claims attendus | `npm run test:auth-token` + `test:security` | `validate` | PR + push main | Node 22 | job log | corriger sur même PR ; conserver les scénarios négatifs |
| Catalogue | le catalogue embarqué respecte son contrat d'intégrité | `catalog_integrity.test.ts` via `npm test` | `validate` | PR + push main | Node 22 | job log | régénération/commit explicite si artefact concerné |
| Universe truth | le graphe embarqué correspond à la vérité attendue | `test:truth` + SDE Truth Gate | `validate` + workflow SDE | PR + push main pour CI, PR ciblée pour SDE | Node 22 | logs + diff canonique | SDE gate read-only ; régénérer explicitement puis review |
| SDE build integrity | l'artefact canonique reste reproductible à partir du build CCP épinglé | `test:sde` + régénération SDE | `sde-truth` quand sensible | PR | Node 22, SDE build 3503375 | diff sur `universeGraph.json` / manifest | aucun auto-commit ; échec sur dérive |
| Finance | les calculs financiers et la configuration restent cohérents | `financial_config.test.ts`, `financial_engine.test.ts`, `realized_financial_outcome.test.ts` via `npm test` | `validate` | PR + push main | Node 22 | job log | ne retirer aucune suite sans preuve équivalente |
| Evidence / provenance | les décisions restent traçables jusqu'à une observation/preuve | `data_contracts_and_provenance.test.ts`, `evidence_chain.test.ts`, `observation_provenance_and_audit.test.ts` | `validate` | PR + push main | Node 22 | job log | conserver les tests de preuve lors du découpage |
| Persistence | transactions/sessions persistent selon les invariants attendus | `character_transaction_persistence.test.ts`, `character_transaction_ingestion.test.ts` | `validate` | PR + push main | Node 22 | job log | conserver couverture de migration/persistence |
| Execution / outcome | simulation, exécution et résultat réalisé restent cohérents | `execution_simulation.test.ts`, `execution_outcome.test.ts`, `execution_tracking_integration.test.ts`, `realized_financial_outcome.test.ts` | `validate` | PR + push main | Node 22 | job log | certification profonde requise |
| Domain invariants | propriétés structurelles et frontières de domaine restent vraies | `property_invariants.test.ts`, `domain_repositories.test.ts`, `systemic_certification.test.ts` | `validate` | PR + push main | Node 22 | job log | canoniser la responsabilité avant déplacement |
| Order / ownership | identité/scoping/ownership des ordres restent stricts | `order_identity.test.ts`, `order_scoping_contracts.test.ts`, `corporation_order.test.ts`, `fleetFinancial*` | `validate` | PR + push main | Node 22 | job log | préserver les frontières character/corporation |
| Corporation boundary | un principal ne peut agir/lire hors de sa frontière | `test:corporation-boundary` + ESI tests + character routes | `validate` | PR + push main | Node 22 | job log | aucune simplification sans scénario négatif équivalent |
| API | contrats/routes HTTP restent valides | `test:api` | `validate` | PR + push main | Node 22 | job log | corriger route/contrat + rerun |
| Server runtime | serveur démarre et expose la santé attendue | `test:smoke` | `validate` | PR + push main | Node 22 | job log | conserver aussi dans futur post-merge smoke |
| ESI | transport, gateways, erreurs et durcissement respectent les contrats | `test:esi` + service ESI tests | `validate` | PR + push main | Node 22 | job log | préserver scénarios de failure/rate-limit |
| Market truth | LIVE/CACHE/STALE/PARTIAL/ERROR/UNKNOWN ne sont pas confondus avec un état métier vide | `market_data_quality.test.ts` + Operations browser | `validate` + browser | PR + push main | Node 22 / Playwright | job log + browser report | browser diagnostics ; pas de retry aveugle |
| Browser Auth | OAuth popup/callback/CSRF/session/isolation restent déterministes | 13 scénarios `auth-browser.spec.ts` | `browser-e2e` | PR + push main | Node 22 + Chromium + E2E harness | Playwright report, trace/video/screenshot on failure | rerun ciblé ; investigation de flake avant retry policy |
| Browser Operations | données opérationnelles et états dégradés sont visibles sans fausse décision | 4 scénarios `operations-browser.spec.ts` | `browser-e2e` | PR + push main | Node 22 + Chromium + E2E harness | Playwright report | conserver `workers: 1` avant isolation |
| Browser isolation | chaque scénario doit être indépendant des contrôles globaux | état mutable `nextAuthControl` / `marketControl` dans harness | `browser-e2e` | PR + push main | même process de harness | aucune preuve d'isolation multi-worker actuellement | GAP/PARTIAL : isoler avant workers > 1 |
| Build | la production build reste réalisable | `npm run build` | `validate` | PR + push main | Node 22 | job log | conserver un build certification |
| Lockfile / install | l'installation correspond au lockfile | `npm ci --no-audit --no-fund` | `validate`, `browser-e2e` | PR + push main | Node 22 | step log | ne pas passer à node_modules cache fragile |
| Workflow token permissions | CI n'obtient pas plus de droits que nécessaire | `phase-2.7c-sde.yml` explicite `contents: read` ; `ci.yml` n'explicite pas les permissions | SDE / CI | PR / main | GitHub Actions | YAML review | GAP/PARTIAL : durcissement CI-001C |
| Action supply chain | une action tierce ne dérive pas silencieusement | versions `@v4` actuellement utilisées | tous workflows | PR / main | GitHub Actions | workflow source | GAP/PARTIAL : politique de pinning à décider |
| Secrets | aucun secret n'est exposé ou écrit par la CI | pas de policy CI dédiée | tous workflows | PR / main | GitHub Actions | configuration/secret audit | GAP/PARTIAL : formaliser règles |
| Dependency security | les changements de dépendances critiques sont détectés | aucune dependency-review dédiée observée | aucune lane dédiée | — | — | aucune preuve durable | GAP / décision CI-001C/I |
| SAST | défauts de code détectables automatiquement | aucun workflow CodeQL/SAST observé | aucun | — | — | aucune preuve durable | GAP / UNKNOWN ; décision explicite requise |
| Dependency maintenance | mises à jour/alertes ont un propriétaire automatique | aucun Dependabot/Renovate observé | aucun | — | — | aucune preuve durable | GAP / UNKNOWN |
| Documentation integrity | liens/statuts/docs actives restent cohérents | documentation guide + revue manuelle | aucun dédié | — | — | preuve manuelle seulement | PARTIAL : CI-001I/J |
| General change detection | le périmètre est détecté sans cacher une validation requise | seul SDE a une détection dédiée | SDE seulement | PR | ubuntu-latest | job output `sde_changed` | GAP : généraliser avec fallback conservateur |
| Required gate | chaque PR possède un check stable d'agrégation | aucun agrégateur dédié | aucun | — | — | aucun check `required-gate` | GAP : CI-001G avant modification protection |
| Branch protection | le check réellement obligatoire est connu | API protection inaccessible | n/a | n/a | GitHub settings | 403 dans l'intégration | GAP/UNKNOWN : vérification admin obligatoire |
| Merge queue | les checks sont compatibles avec une éventuelle queue | aucune preuve d'usage | n/a | n/a | GitHub | aucun usage observé | CONDITIONAL : ajouter `merge_group` seulement si queue adoptée |
| Concurrency | les runs obsolètes d'une même PR sont annulés sans bloquer les changements indépendants | `github.workflow-github.ref` + cancel | workflow-level | PR / main | GitHub Actions | run history | conserver par PR ; ne pas globaliser sans mesure |
| PR governance | un chantier utilise une seule branche/PR | règle dans `CONTRIBUTING.md` | humain + CI | cycle PR | GitHub | PR history / docs | même PR pour corrections/reruns |
| Flaky policy | une flake est identifiée et corrigée, pas masquée | browser retry=1 uniquement | browser | PR / main | Playwright | retry metadata + report | GAP/PARTIAL : classifier/quarantiner/fixer |
| Retry / rerun | les reruns sont visibles et limités au transitoire | browser retry=1 ; rerun manuel possible | jobs | failures | GitHub Actions | run attempt | formaliser en H |
| Diagnostics | une panne produit suffisamment de preuves | browser report/trace/video/screenshot | browser | failures | Playwright | artifacts | étendre aux lanes ciblées |
| Timeout | un blocage ne consomme pas indéfiniment le runner | jobs timeout 15/20 min ; Playwright 45s | workflows | PR / main | GitHub Actions | cancelled/timeout | ajouter timeouts ciblés en H |
| CI timing | les dérives de temps deviennent mesurables | historique manuel seulement | n/a | n/a | GitHub Actions | baseline run data | GAP : métriques durables |
| Main smoke | `main` doit signaler rapidement une panne post-merge | actuellement certification complète | `validate` + browser | push main | Node 22 + Chromium | workflow result | CI-001H : smoke court |
| Full certification | dépôt entier certifié indépendamment du merge courant | aucun workflow Full dédié | aucun | — | — | aucune preuve planifiée | GAP : CI-001H |
| Rollback CI | chaque tranche de refactor peut être annulée sans perte de preuve | stratégie documentaire seulement | n/a | phase gate | Git | commit/branch history | GAP : runbook formel |
| Human runbook | équipe sait distinguer failure, cancel, flake, rerun et nouvelle PR | `CONTRIBUTING.md` partiel | n/a | incident | GitHub | documentation | compléter en H/J |

## Canonical test ownership — starting point

Cette section ne prétend pas encore être la taxonomie finale. Elle fixe un propriétaire logique initial pour éviter qu'un déplacement de commandes ne fasse disparaître une preuve.

### Unit / domain certification

Responsabilité dominante :

- identité et scoping des ordres ;
- corporation orders ;
- finance ;
- moteur ;
- qualité marché ;
- simulation ;
- prédiction ;
- invariants/propriétés ;
- repositories ;
- catalogue ;
- truth ;
- certifications systémiques ;
- evidence/provenance ;
- outcomes ;
- persistence/ingestion ;
- fleet/treasury ;
- routes/interregional ;
- intégration end-to-end ;
- service ESI ;
- builder SDE.

Source de vérité actuelle : les 37 commandes de `npm test`.

### Server certification

Responsabilité dominante :

- API ;
- character routes ;
- smoke ;
- security ;
- ESI gateways ;
- runtime config ;
- auth token validation.

Source de vérité actuelle : scripts `test:api`, `test:smoke`, `test:security`, `test:esi`, `test:config`, `test:auth-token`.

### Browser certification

Responsabilité dominante :

- Auth/OAuth : `auth-browser.spec.ts`, 13 tests ;
- Operations/market health : `operations-browser.spec.ts`, 4 tests.

Source de vérité actuelle : `npm run test:e2e`.

### Meta / CI certification

Responsabilité dominante :

- contrat des workflows : `workflow_contract.test.mjs` ;
- intégrité SDE : `universe_graph_builder.test.mjs` + workflow SDE.

## Demonstrated script overlaps

Les chevauchements exacts mesurés sont :

1. `npm test` ↔ `test:corporation-boundary` :
   - `financial_config.test.ts` ;
   - `treasury.test.ts`.
2. `test:api` ↔ `test:corporation-boundary` :
   - `character_routes_contract.test.ts`.
3. `test:corporation-boundary` ↔ `test:esi` :
   - `corporation_esi_gateway.test.ts` ;
   - `corporation_esi_architecture.test.ts`.

Ces chevauchements sont documentés comme candidats à rationalisation dans CI-001E. Aucun test n'est supprimé en CI-001B.

## Coverage decisions for the migration

Pour chaque futur déplacement d'un test :

1. conserver le fichier de test inchangé tant que son propriétaire canonique n'est pas décidé ;
2. identifier l'invariant ;
3. pointer vers la nouvelle lane ;
4. vérifier que la lane s'exécute sur tous les déclencheurs requis ;
5. vérifier que l'environnement est équivalent ou plus strict ;
6. vérifier la preuve observable ;
7. seulement ensuite supprimer l'ancien appel redondant.

Pour chaque future conditionalisation :

> l'ambiguïté du périmètre déclenche la certification profonde, jamais l'absence de preuve.

## CI-001B gate

CI-001B peut être considéré comme documenté lorsque :

- chaque famille critique de la Global Coverage Matrix possède une ligne de preuve ;
- les GAP/UNKNOWN sont explicites ;
- les chevauchements actuellement démontrés sont listés ;
- les contraintes GitHub sont séparées des décisions locales ;
- aucun test n'a été retiré ;
- le premier incrément d'implémentation peut être choisi sans inventer de couverture.

