# Contrats ESI — Matrice de protection et de test

## Objectif

Cette matrice protège la frontière la plus sensible de l'acquisition CCP :

```
HTTP client
  -> Express /api/character/:characterId/*
  -> CharacterEsiGateway
  -> EsiGateway
  -> fetchEsi
  -> CCP ESI
```

Le principe directeur est **NO DATA != ZERO DATA** : une absence de donnée, une erreur de transport ou un payload invalide ne doit jamais être converti silencieusement en donnée financière exploitable.

## Répartition des responsabilités

| Couche | Responsabilité | Ne doit pas faire |
|---|---|---|
| `charactersRouter` | Validation HTTP, extraction Bearer, statut HTTP, restitution des métadonnées | Réimplémenter retry/ETag/error-budget |
| `CharacterEsiGateway` | Mapping endpoint caractère + principal | Manipuler directement les headers HTTP du client |
| `EsiGateway` | Principal, auth sortante, déduplication privée, validation transport | Connaître les règles métier caractère |
| `fetchEsi` | URL ESI, User-Agent, compatibilité, timeout, retry, rate-limit, parsing | Connaître le personnage ou l'API HTTP locale |
| Tests HTTP | Vérifier la frontière observable client -> ESI | Mocking uniquement de fonctions internes |
| Tests gateway | Vérifier les mappings déterministes | Dépendre d'un serveur réel CCP |

## Matrice des routes caractère

| Route | Auth | Paramètres | Contrat succès | Contrat erreur |
|---|---|---|---|---|
| `orders` | Bearer | `characterId` | tableau ESI | statut + `esi_error_kind` |
| `orders/history` | Bearer | `page 1..1000` | tableau ESI + pagination | statut + classification |
| `wallet` | Bearer | `characterId` | `{ balance }`, négatif/0/décimal préservés | jamais de faux zéro |
| `skills` | Bearer | `characterId` | payload ESI | statut + classification |
| `transactions` | Bearer | `from_id > 0` optionnel | tableau ESI | statut + classification |
| `journal` | Bearer | `characterId` | tableau ESI | statut + classification |
| `corporation` | non requis pour l'identité publique | `characterId` | profil corporation résolu | échec de résolution explicite |
| `corporation/wallets` | Bearer | `characterId` | divisions + soldes ESI | accès refusé explicitement |

## Invariants d'authentification

* `Bearer`, `bearer` et `BEARER` sont équivalents.
* Les espaces multiples entre schéma et credential sont tolérés et normalisés.
* `Basic`, `Token`, `Digest`, Bearer sans credential et credential vide sont refusés.
* Un identifiant caractère non positif, non entier ou non canonique est refusé avant tout appel ESI.
* Le credential de Character A ne peut jamais être transmis à Character B.
* `fetchPublicIdentity` utilise toujours le principal anonyme, même si le caller HTTP possède un Authorization.
* Les headers Authorization fournis au gateway sont supprimés puis reconstruits à partir du principal.

## Invariants de transport

* Les requêtes privées GET sont dédupliquées uniquement pour le même principal, endpoint, ETag et contexte de headers.
* `dedupe: false` désactive explicitement la coalescence.
* Un chemin ESI relatif doit commencer par `/` et ne peut pas contenir de caractères de contrôle CR/LF.
* Les valeurs de headers contrôlées par un caller ne peuvent pas contenir CR/LF.
* L'Authorization anonyme est toujours absente de la requête sortante.
* Les métadonnées CCP ne doivent pas être perdues au passage gateway : ETag, Expires, Last-Modified, Cache-Control, compatibilité, X-Pages, rate-limit et Retry-After.

## Invariants de données

* Le payload ESI est conservé sans normalisation métier à la frontière transport.
* Un wallet négatif reste négatif; `0` reste `0`; les décimales restent exactes dans la représentation JavaScript reçue.
* Un succès HTTP sans payload exploitable est un `INVALID_ESI_RESPONSE`, jamais une donnée métier par défaut.
* `304 Not Modified` reste un résultat de cache sans corps.
* Les erreurs 401/403/404/420/429/502/503/504 conservent leur statut et leur classification.
* `X-ESI-Error-Limit-Remain` et `X-ESI-Error-Limit-Reset` restent disponibles pour le diagnostic et les politiques aval.

## Régressions historiques désormais couvertes

1. Échappement involontaire de source TypeScript : le typecheck reste la première barrière.
2. Double échappement de la regex Bearer : la suite HTTP teste les variantes réelles du header.
3. Corruption de la logique du Truth Gate : le test de configuration vérifie la structure logique attendue.
4. `persist-credentials: false` associé à un `git fetch origin` privé : l'invariant SDE interdit désormais cette dépendance.
5. Auto-mutation du Truth Gate : le workflow est contrôlé comme strictement read-only.
6. Réponse ESI 2xx malformée : le client classe explicitement le résultat comme invalide.
7. Perte de métadonnées ESI entre transport et HTTP : la suite de contrat vérifie leur propagation.

## Commandes de validation

Validation locale ciblée :

```bash
npm run typecheck
npm run typecheck:server
npm run test:ci-config
npm run test:esi
npm run test:api
npm run build
```

Validation CI complète :

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run typecheck:server
npm run test:ci-config
npm run test:truth
npm test
npm run test:api
npm run test:smoke
npm run test:security
npm run test:esi
npm run build
```

## Règle de maintenance

Une modification de contrat ESI doit être accompagnée dans le même changement par :

1. la modification de l'implémentation propriétaire du contrat;
2. le test de frontière correspondant;
3. la mise à jour de cette matrice;
4. la validation CI complète.

Une modification ne doit pas être acceptée uniquement parce qu'elle corrige un symptôme observé : le cas de régression doit devenir un invariant automatisé.
