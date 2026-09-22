> **Statut documentaire — 22 septembre 2026**
>
> Ce document conserve l'historique du plan d'audit et de ses lots initiaux. Il n'est plus la source de vérité de l'état courant du dépôt : certaines phases ont déjà été réalisées, fusionnées ou reclassées. Pour l'état réel de `main` et le roadmap actif, consulter [`docs/audit/current-state.md`](./current-state.md) ainsi que les index sous [`docs/agent/`](../agent/).
>
> Les sections historiques mentionnant Gemini, AI Studio, des versions anciennes d'IndexedDB, des nombres de tests antérieurs ou des lockfiles absents doivent être interprétées comme des comptes rendus datés, pas comme des prescriptions actuelles.
>
# MASTER-PLAN — EVE TRADE

## Stabilisation, fiabilisation, architecture et qualité UI/UX

**Objectif global :** amener EVE Trade d’un état fonctionnel mais insuffisamment sécurisé à un état **maintenable, testable, observable et évolutif**, sans régression fonctionnelle.

**Principe directeur :**

> On ne refactore jamais une zone que l’on ne sait pas tester.

Le projet doit donc progresser selon cette séquence :

**Observer → Protéger → Vérifier → Refactorer → Nettoyer → Optimiser**

---

# 1. État initial et objectifs

L’audit initial fait ressortir plusieurs catégories de risques.

| Domaine                 | Situation actuelle                                              | Priorité |
| ----------------------- | --------------------------------------------------------------- | -------: |
| CI/CD                   | Pas de pipeline automatisé identifié                            |       P0 |
| TypeScript backend      | `server/` et `server.ts` exclus du `tsconfig` principal         |       P0 |
| Tests unitaires         | Couverture métier/engine importante                             |        ✅ |
| Tests UI/E2E            | Non identifiés                                                  |       P0 |
| Réseau ESI              | Deux implémentations/politiques différentes                     |    P0/P1 |
| Sécurité OAuth/API      | À auditer et verrouiller                                        |       P0 |
| Code mort               | `Sidebar.tsx`, `CarnetChart.tsx` candidats                      |       P1 |
| Architecture composants | Plusieurs composants très volumineux                            |       P1 |
| Persistence             | `IndexedDbStore.ts` extrêmement volumineux                      |       P1 |
| Accessibilité           | Modales sans garantie systématique de gestion du focus/dialog   |       P1 |
| Design system           | Nombreuses couleurs hardcodées                                  |       P2 |
| Configuration           | `config.yaml` à auditer                                         |       P1 |
| Non-régression          | Forte couverture moteur, faible couverture parcours utilisateur |       P0 |

---

# 2. Règle absolue d'exécution

Chaque tâche confiée à Gemini doit être exécutée selon le protocole suivant.

## Cycle obligatoire

### Étape A — Inspecter

Gemini doit identifier :

* fichiers concernés ;
* dépendances entrantes/sortantes ;
* comportement actuel ;
* tests existants ;
* risques de régression ;
* interfaces publiques ;
* effets secondaires.

Aucune modification durant cette étape.

### Étape B — Établir un filet de sécurité

Avant modification :

* ajouter ou compléter les tests nécessaires ;
* identifier le comportement attendu ;
* conserver les tests existants ;
* définir le critère de succès.

### Étape C — Modifier

Modification minimale et ciblée.

Il est interdit de profiter d’une tâche pour effectuer un second refactoring non prévu.

### Étape D — Vérifier

Exécuter systématiquement :

```bash
npm test
npm run lint
npm run build
```

Puis, lorsque disponible :

```bash
npm run test:e2e
```

### Étape E — Comparer

Gemini doit vérifier :

* tests avant/après ;
* erreurs TypeScript ;
* bundle/build ;
* comportement des routes ;
* comportement UI ;
* fichiers modifiés ;
* API modifiées ;
* éventuels nouveaux warnings.

### Étape F — Gate

Une phase n'est validée que lorsque ses critères d'acceptation sont satisfaits.

**Aucune phase suivante ne démarre sur une branche instable.**

---

# 3. Gouvernance Git

## Structure de travail

Chaque phase majeure doit utiliser sa propre branche :

```text
main
 │
 ├── audit/baseline
 ├── hardening/ci
 ├── hardening/backend-types
 ├── hardening/security
 ├── refactor/esi
 ├── refactor/storage
 ├── refactor/components
 ├── testing/e2e
 ├── ux/accessibility
 └── cleanup/dead-code
```

Les noms peuvent être adaptés à la stratégie Git actuelle.

## Règle de commit

Un commit doit avoir une responsabilité claire.

Exemples :

```text
ci: add baseline validation pipeline
typecheck: include backend compilation
test: add server startup regression coverage
refactor: consolidate ESI request handling
refactor: split indexeddb persistence stores
test: add market opportunity e2e flow
ux: improve modal accessibility
cleanup: remove confirmed orphan component
```

Éviter absolument :

```text
fix everything
refactor project
misc cleanup
```

---

# 4. PHASE 0 — BASELINE IMMUTABLE

## Objectif

Créer une photographie fiable du projet avant toute modification.

### Actions

1. Installer proprement les dépendances.
2. Compiler le frontend.
3. Exécuter les tests existants.
4. Examiner le fonctionnement du serveur.
5. Identifier les scripts réellement disponibles.
6. Capturer les erreurs/warnings existants.
7. Identifier les points d'entrée.
8. Documenter les versions Node/npm.
9. Documenter l'architecture actuelle.
10. Générer une première matrice de non-régression.

### Livrables

```text
docs/audit/baseline.md
docs/audit/regression-matrix.md
```

### Gate G0

La phase est validée lorsque :

* le comportement actuel est documenté ;
* les tests existants sont connus ;
* le build est connu ;
* les défauts préexistants sont catalogués ;
* aucune modification fonctionnelle n’a été faite.

---

# 5. PHASE 1 — CI/CD ET QUALITY GATE

## Objectif

Faire en sorte que GitHub détecte automatiquement une régression.

Cette phase est prioritaire car toutes les phases suivantes en dépendent.

## Pipeline minimal

À chaque Pull Request :

```text
checkout
   ↓
npm ci
   ↓
frontend typecheck
   ↓
backend typecheck
   ↓
unit tests
   ↓
build
   ↓
security/dependency audit
```

Puis ultérieurement :

```text
   ↓
E2E
```

## Problème à corriger

Le `tsconfig.json` actuel inclut principalement :

```json
"include": ["src"]
```

Le serveur n'est donc pas protégé par le même contrôle TypeScript.

### Solution recommandée

Créer une séparation explicite :

```text
tsconfig.json
tsconfig.server.json
```

ou une configuration composite équivalente.

### Gate G1

PR refusée automatiquement si :

* typecheck frontend échoue ;
* typecheck backend échoue ;
* test échoue ;
* build échoue.

---

# 6. PHASE 2 — OBSERVABILITÉ ET DÉMARRAGE SERVEUR

## Objectif

Vérifier que l'application peut réellement démarrer hors du contexte du frontend.

## Actions

Créer des tests pour :

```text
server startup
/api/health
route registration
configuration loading
critical middleware
```

Vérifier notamment :

```text
/auth/callback
/api/auth
/api/types
/api/markets
/api/character
/api/universe
```

## API Health

Évaluer la quantité d'informations exposées par :

```text
/api/health
```

Conserver les informations nécessaires au monitoring, mais éviter d'exposer inutilement des informations opérationnelles en production.

## Gate G2

Un environnement CI doit pouvoir :

1. démarrer le serveur ;
2. vérifier qu'il écoute ;
3. appeler le health check ;
4. arrêter proprement le processus.

---

# 7. PHASE 3 — AUDIT ET HARDENING SÉCURITÉ

## Objectif

Sécuriser les flux OAuth, ESI et API avant les gros refactorings.

## Périmètre

### OAuth

Auditer :

```text
state
callback
session
cookies
expiration
redirect
erreurs
```

### API server

Vérifier :

```text
validation inputs
timeouts
errors
rate limiting
logging
secrets
headers
CORS
```

### ESI

Vérifier :

```text
timeout
retry
backoff
Retry-After
ETag
5xx
4xx
rate limiting
```

### Gate G3

Aucune fonctionnalité ne doit perdre son comportement existant.

Les corrections de sécurité doivent être couvertes par des tests.

---

# 8. PHASE 4 — UNIFICATION DU CLIENT ESI

## Constat

Deux couches gèrent actuellement des aspects de communication ESI :

```text
src/services/esi.ts
server/utils/esiClient.ts
```

Cela crée plusieurs politiques réseau.

Schéma actuel possible :

```text
React
 ↓
EsiService
 ↓
ESI
```

ou :

```text
React
 ↓
EsiService
 ↓
API server
 ↓
esiClient
 ↓
ESI
```

## Risque

Deux comportements peuvent apparaître pour :

* timeout ;
* retry ;
* erreurs ;
* cache ;
* ETag ;
* rate limiting ;
* logging.

## Architecture cible

Créer une politique ESI clairement centralisée.

```text
             ┌───────────────┐
             │ React / UI    │
             └───────┬───────┘
                     │
                     ▼
              ┌─────────────┐
              │ API service │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ ESI gateway │
              └──────┬──────┘
                     │
                     ▼
                   ESI
```

Le choix exact entre accès direct navigateur et proxy serveur devra être déterminé par l'audit de sécurité et des besoins CORS/auth.

## Règle

Ne pas supprimer immédiatement l'ancienne implémentation.

Procéder :

```text
ancienne implémentation
        ↓
tests
        ↓
nouvelle gateway
        ↓
comparaison
        ↓
migration progressive
        ↓
suppression ancienne logique
```

## Gate G4

Les appels critiques suivants doivent produire un comportement identique :

```text
orders
wallet
transactions
order history
journal
skills
market data
```

---

# 9. PHASE 5 — PERSISTENCE ET INDEXEDDB

## Constat

`IndexedDbStore.ts` concentre énormément de responsabilités.

Il regroupe notamment :

```text
snapshots
history
opportunities
cache
observations
transactions
executions
reconciliation
localStorage fallback
errors
```

## Problème

Une modification d'une partie du stockage peut involontairement modifier une autre.

## Architecture cible

Découpage logique :

```text
storage/
 ├── indexedDb/
 │    ├── marketStore
 │    ├── opportunityStore
 │    ├── transactionStore
 │    ├── executionStore
 │    └── observationStore
 │
 ├── storageFacade
 └── storageFallback
```

## Important

La sémantique de stockage doit rester identique.

Le refactoring ne doit pas modifier :

* clés ;
* schémas ;
* formats ;
* migrations ;
* données historiques ;

sans migration explicitement planifiée.

## Gate G5

Tests obligatoires :

```text
write
read
update
delete
reload
reconciliation
migration
fallback
```

---

# 10. PHASE 6 — CODE MORT ET CODE DUPLIQUÉ

Cette phase intervient seulement après sécurisation.

## Candidats identifiés

### `Sidebar.tsx`

Semble être un composant orphelin.

### `CarnetChart.tsx`

Semble également ne plus être relié au graphe principal.

### Important

**Ne pas supprimer immédiatement.**

Pour chaque candidat :

```text
search references
↓
search dynamic imports
↓
search route/component registry
↓
search tests
↓
search documentation
↓
confirm orphan
↓
delete
↓
build
↓
test
```

## Configuration

`config.yaml` doit aussi être audité.

Questions :

```text
Qui le lit ?
Quel code le charge ?
Est-il legacy ?
Est-il documentaire ?
Existe-t-il une autre source de configuration ?
```

## Doublons

L'audit précédent n'a trouvé **aucun doublon de fichier exact par contenu**.

Cela ne signifie pas :

```text
aucun code dupliqué
```

Il faut rechercher les duplications **fonctionnelles** :

```text
retry logic
validation
formatters
API wrappers
state transformations
market calculations
UI patterns
```

## Gate G6

Tout fichier supprimé doit avoir :

* preuve de non-utilisation ;
* build vert ;
* tests verts ;
* aucun import cassé.

---

# 11. PHASE 7 — REFACTORING DES GROS COMPOSANTS

## Ordre recommandé

Commencer par :

```text
MyOrdersView.tsx
MarketTree.tsx
OpportunityModal.tsx
ConfigurationPanel.tsx
TraderPerformanceModal.tsx
ConnectedCharactersModal.tsx
GlobalMarketSyncModal.tsx
GlobalScannerView.tsx
```

## Règle

Ne jamais transformer un composant de 800 lignes en une seule opération massive.

Exemple :

```text
MyOrdersView
    ↓
extract hooks
    ↓
extract data logic
    ↓
extract table
    ↓
extract filters
    ↓
extract actions
```

Chaque extraction devient un commit indépendant.

## Architecture cible

```text
feature/
 ├── components/
 ├── hooks/
 ├── services/
 ├── selectors/
 ├── types/
 └── tests/
```

## Gate G7

Le composant doit conserver :

* mêmes données ;
* mêmes actions ;
* mêmes états ;
* mêmes raccourcis ;
* mêmes comportements métier.

---

# 12. PHASE 8 — TESTS E2E

Cette phase est fondamentale.

Les tests unitaires actuels protègent surtout le moteur métier.

Il manque une protection du système complet.

## Parcours critique

Le parcours principal à protéger est :

```text
ESI
 ↓
Market snapshot
 ↓
Opportunity
 ↓
Evidence
 ↓
User
 ↓
Execution
 ↓
Transaction
 ↓
Correlation
 ↓
Realized P&L
```

## Scénario E2E numéro 1

Créer au minimum :

```text
application startup
→ market data available
→ opportunity visible
→ user opens opportunity
→ evidence displayed
→ execution action
→ transaction recorded
→ result visible
```

## Scénarios complémentaires

```text
login/OAuth
character connection
market sync
orders
portfolio
journal
configuration
degraded catalog
API error
ESI timeout
empty state
```

## Gate G8

Le parcours critique doit être reproductible automatiquement sur CI.

---

# 13. PHASE 9 — UI/UX ET ACCESSIBILITÉ

Une fois la logique fonctionnelle sécurisée, travailler l'expérience utilisateur.

## 13.1 Modales

Audit systématique de :

```text
role="dialog"
aria-modal
aria-labelledby
focus
focus trap
Escape
focus restoration
scroll locking
```

Composants concernés :

```text
OpportunityModal
OrderAdvisorModal
ConnectedCharactersModal
GlobalMarketSyncModal
TraderPerformanceModal
```

## 13.2 Navigation clavier

Tester :

```text
Tab
Shift+Tab
Enter
Space
Escape
Arrow keys
```

notamment pour :

```text
MarketTree
HeaderNav
menus
filters
tables
modals
```

## 13.3 Responsive

Tester au minimum :

```text
desktop
tablet
mobile
```

Et vérifier :

```text
overflow
tables
modals
navigation
sidebar/tree
charts
forms
```

## 13.4 États UX

Chaque fonctionnalité importante doit posséder :

```text
loading
success
empty
error
degraded
offline/ESI unavailable
```

Le système de catalogue déjà capable d'indiquer certains états dégradés doit servir de modèle pour les autres domaines.

## Gate G9

Aucun parcours critique ne doit avoir :

* élément inaccessible au clavier ;
* modal impossible à fermer ;
* overflow destructif ;
* état d'erreur incompréhensible.

---

# 14. PHASE 10 — DESIGN SYSTEM

Le projet utilise déjà des tokens Tailwind, mais possède également beaucoup de valeurs hardcodées.

Exemples :

```text
bg-[#0e1117]
bg-[#161821]
border-[#262730]
text-[#fafafa]
```

## Objectif

Créer une source de vérité :

```text
background
surface
surface-hover
border
text
muted
success
warning
danger
accent
```

Puis migrer progressivement les composants.

## Ne pas faire

Ne pas convertir tous les composants simultanément.

Ordre :

```text
base
↓
Header
↓
Sidebar/tree
↓
tables
↓
modals
↓
forms
↓
charts
```

## Gate G10

Une modification de thème doit pouvoir modifier l'interface de façon cohérente sans chasse manuelle de dizaines de couleurs.

---

# 15. PHASE 11 — RENFORCEMENT DU TYPAGE

Une fois le nettoyage effectué, activer progressivement :

```json
"noUnusedLocals": true,
"noUnusedParameters": true
```

Éventuellement compléter par d'autres règles TypeScript/ESLint pertinentes.

## Stratégie

Ne pas activer toutes les contraintes immédiatement.

Faire :

```text
baseline
↓
unused cleanup
↓
enable rule
↓
fix errors
↓
commit
```

---

# 16. PHASE 12 — PERFORMANCE

La performance arrive après la stabilité.

Auditer :

```text
render frequency
large lists
MarketTree
tables
charts
memoization
selectors
IndexedDB access
ESI polling
network duplication
bundle size
```

## Attention

Ne pas ajouter de `useMemo` / `useCallback` partout sans mesure.

Toute optimisation doit disposer d'une raison mesurable.

---

# 17. PHASE 13 — CERTIFICATION FINALE

Le projet doit terminer avec une batterie de contrôles.

## Niveau code

```text
frontend typecheck ✅
backend typecheck ✅
lint ✅
unit tests ✅
build ✅
```

## Niveau serveur

```text
startup ✅
health ✅
routes ✅
OAuth ✅
ESI ✅
```

## Niveau métier

```text
market data ✅
opportunity ✅
execution ✅
transaction ✅
P&L ✅
```

## Niveau UI

```text
desktop ✅
tablet ✅
mobile ✅
keyboard ✅
modal accessibility ✅
error states ✅
loading states ✅
```

## Niveau architecture

```text
dead code audited ✅
duplicate logic audited ✅
ESI unified ✅
storage modularized ✅
large components decomposed ✅
configuration audited ✅
```

---

# 18. MATRICE ANTI-RÉGRESSION

Cette matrice doit devenir un document vivant.

| Domaine       | Unit | Integration | E2E | Build | Manual |
| ------------- | ---: | ----------: | --: | ----: | -----: |
| Auth          |    ✅ |           ✅ |   ✅ |     ✅ |      ✅ |
| ESI           |    ✅ |           ✅ |   ✅ |     ✅ |        |
| Market        |    ✅ |           ✅ |   ✅ |     ✅ |      ✅ |
| Opportunity   |    ✅ |           ✅ |   ✅ |     ✅ |      ✅ |
| Orders        |    ✅ |           ✅ |   ✅ |     ✅ |      ✅ |
| Portfolio     |    ✅ |           ✅ |     |     ✅ |      ✅ |
| Transactions  |    ✅ |           ✅ |   ✅ |     ✅ |        |
| P&L           |    ✅ |           ✅ |   ✅ |     ✅ |        |
| Storage       |    ✅ |           ✅ |     |     ✅ |        |
| UI Modal      |      |           ✅ |   ✅ |     ✅ |      ✅ |
| Navigation    |      |             |   ✅ |     ✅ |      ✅ |
| Responsive    |      |             |     |     ✅ |      ✅ |
| Accessibility |      |             |   ✅ |     ✅ |      ✅ |

Le tableau doit évoluer avec le projet.

---

# 19. CLASSIFICATION DES TÂCHES POUR GEMINI

## Gemini 3.7

À utiliser pour les tâches **locales, déterministes et faiblement couplées**.

Exemples :

```text
ajouter test
corriger type
extraire petit composant
modifier aria-label
corriger accessibilité d'une modal
migrer quelques tokens
supprimer fichier confirmé orphelin
documentation
```

## Gemini 3.8

À utiliser pour les tâches **transversales ou architecturales**.

Exemples :

```text
unification ESI
refactoring IndexedDbStore
architecture server typing
refactor gros composants
architecture E2E
migration configuration
refactoring impliquant plusieurs services
```

Le critère de sélection doit être **la surface de changement et le couplage**, pas simplement la taille du fichier.

---

# 20. FORMAT OBLIGATOIRE DES MISSIONS GEMINI

Chaque mission doit être donnée avec un contrat précis.

```text
MISSION ID:
PHASE:
OBJECTIF:

CONTEXTE:
[contexte nécessaire]

FICHIERS AUTORISÉS:
[liste]

FICHIERS INTERDITS:
[liste]

COMPORTEMENT ACTUEL:
[description]

COMPORTEMENT ATTENDU:
[description]

CONTRAINTES:
- aucune régression
- ne pas modifier les API non nécessaires
- ne pas faire de refactoring opportuniste
- conserver les tests existants

ÉTAPES:
1. inspecter
2. proposer l'approche
3. ajouter/adapter les tests
4. implémenter
5. vérifier
6. rapporter

VALIDATION:
npm test
npm run lint
npm run build
[tests additionnels]

CRITÈRES D'ACCEPTATION:
[list]

RAPPORT FINAL:
- fichiers modifiés
- fichiers ajoutés
- fichiers supprimés
- tests ajoutés
- tests exécutés
- risques restants
- dette technique restante
```

---

# 21. RÈGLE "NO OPPORTUNISTIC REFACTORING"

C'est une règle essentielle pour Gemini.

Lorsqu'il découvre :

```text
un bug
un doublon
une mauvaise architecture
une optimisation
un autre composant à refactorer
```

pendant une tâche :

**il ne le corrige pas automatiquement.**

Il l'ajoute à :

```text
docs/audit/backlog.md
```

ou au système d'issues GitHub.

Ainsi :

```text
tâche A
   ↓
découverte B
   ↓
backlog B
   ↓
fin tâche A
```

et non :

```text
tâche A
   ↓
B
 ↓
C
 ↓
D
 ↓
régression impossible à isoler
```

---

# 22. ORDRE EXACT D'EXÉCUTION

L'ordre recommandé est donc :

```text
00 — Baseline
 ↓
01 — CI/CD
 ↓
02 — Backend typecheck
 ↓
03 — Server startup tests
 ↓
04 — Security/OAuth hardening
 ↓
05 — ESI consolidation
 ↓
06 — Persistence architecture
 ↓
07 — Dead-code audit
 ↓
08 — Large component decomposition
 ↓
09 — E2E critical path
 ↓
10 — UI accessibility
 ↓
11 — Responsive/UI consistency
 ↓
12 — Design system
 ↓
13 — Strict TypeScript
 ↓
14 — Performance
 ↓
15 — Final certification
```

---

# 23. PRIORITÉ ABSOLUE

Le chantier ne doit **pas** commencer par :

```text
refonte visuelle
suppression de fichiers
gros refactoring React
optimisation
```

La fondation doit être :

```text
CI
 +
backend typecheck
 +
tests
 +
server startup validation
```

Une fois cette fondation obtenue, chaque refactoring devient beaucoup moins risqué.

---

# 24. DÉFINITION DE "TERMINÉ"

EVE Trade pourra être considéré comme stabilisé lorsque :

```text
          ┌────────────────────┐
          │      GitHub CI     │
          └─────────┬──────────┘
                    │
              tous les tests
                    │
          ┌─────────▼──────────┐
          │ Backend + Frontend │
          │    TypeScript      │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │    Unit + E2E      │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │   Build validé     │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │ UI/UX validée      │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │ Architecture       │
          │ documentée         │
          └────────────────────┘
```

La propriété recherchée n'est pas simplement :

> « Le logiciel fonctionne. »

Mais :

> **« Une modification future peut être effectuée avec un mécanisme automatique permettant de détecter rapidement une régression. »**

---

# 25. PREMIER LOT À CONFIER À GEMINI

Le premier lot doit rester volontairement petit.

### LOT-001 — Baseline & CI Foundation

**Gemini : 3.7**

Objectifs :

```text
1. établir le baseline du repository ;
2. documenter les scripts existants ;
3. créer le typecheck backend ;
4. créer le workflow GitHub Actions ;
5. exécuter tests + typechecks + build ;
6. ne modifier aucun comportement métier.
```

### Interdictions

```text
ne pas refactorer React
ne pas modifier ESI
ne pas supprimer du code
ne pas modifier IndexedDB
ne pas modifier l'UI
ne pas changer les API
```

### Critère de réussite

Une Pull Request vierge doit être capable d'exécuter automatiquement :

```text
npm ci
→ frontend typecheck
→ backend typecheck
→ npm test
→ npm run build
```

avec un résultat reproductible.

---

# 26. STRATÉGIE DE SUIVI

Après chaque lot, conserver trois états :

```text
BASELINE
CURRENT
TARGET
```

Exemple :

```text
Backend TypeScript
Baseline : non vérifié par CI
Current  : vérifié localement
Target   : bloquant dans GitHub CI
```

Cela permet d'éviter qu'un refactoring "améliore" le code tout en dégradant une autre dimension.

---

# 27. RÈGLE FINALE

Chaque changement doit répondre à une seule question :

> **Quel risque ce changement réduit-il, et quel test prouve qu'il ne crée pas un nouveau risque ?**

Si Gemini ne peut pas répondre à ces deux questions, la tâche n'est pas suffisamment spécifiée pour être exécutée.
