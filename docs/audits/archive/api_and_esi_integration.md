> **Historical**
> Date archived: 2026-09-23
> Superseded by: Replaced by architecture/esi-boundary.md, contracts/esi.md and validation/esi-tests.md.
> Relevant only for: development history and migration traceability.
>
# 🌐 Intégration API EVE Online (ESI & SSO v2)

Ce document décrit en détail les points de terminaison (endpoints) CCP Games ESI utilisés par **EVE Trade**, la gestion du proxy backend, la gestion des limites de requêtes (*rate-limiting*), les routes de l'API locale Express et le cycle de vie des jetons d'authentification.

---

## 📡 Endpoints ESI Utilisés

| Domaine | Endpoint ESI | Méthode | Scope SSO Requis | Utilisation dans EVE Trade |
| :--- | :--- | :--- | :--- | :--- |
| **Marché Régional** | `/markets/{region_id}/orders/` | `GET` | *Public* | Récupération de l'ensemble des carnets d'ordres d'une région. |
| **Historique Marché** | `/markets/{region_id}/history/` | `GET` | *Public* | Volume moyen journalier et médiane des prix sur 30 jours. |
| **Ordres Actifs** | `/characters/{character_id}/orders/` | `GET` | `esi-markets.read_character_orders.v1` | Surveillance des ordres ouverts du joueur par le Conseiller. |
| **Historique d'Ordres** | `/characters/{character_id}/orders/history/` | `GET` | `esi-markets.read_character_orders.v1` | Ordres expirés, remplis ou annulés pour le journal. |
| **Solde Portefeuille** | `/characters/{character_id}/wallet/` | `GET` | `esi-wallet.read_character_wallet.v1` | Capital disponible pour l'optimiseur de portefeuille. |
| **Transactions Joueur** | `/characters/{character_id}/wallet/transactions/` | `GET` | `esi-wallet.read_character_wallet.v1` | Ingestion paginée (`from_id`) & réconciliation d'exécution. |
| **Journal Financier** | `/characters/{character_id}/wallet/journal/` | `GET` | `esi-wallet.read_character_wallet.v1` | Suivi des taxes et frais de courtage prélevés par CCP. |
| **Compétences** | `/characters/{character_id}/skills/` | `GET` | `esi-skills.read_skills.v1` | Niveaux d'*Accounting* (ID 3443) et *Broker Relations* (ID 3444). |
| **Univers (Stations)** | `/universe/stations/{station_id}/` | `GET` | *Public* | Résolution des noms et systèmes stellaires des stations PNJ. |
| **Univers (Citadelles)** | `/universe/structures/{structure_id}/` | `GET` | `esi-universe.read_structures.v1` | Résolution des noms des structures Upwell accessibles au personnage authentifié. |
| **Univers (Types)** | `/universe/types/{type_id}/` | `GET` | *Public* | Résolution des noms et volumes unitaires ($m^3$) des objets. |
| **Résolution d'IDs** | `/universe/ids/` | `POST` | *Public* | Résolution universelle des noms des types, stations et systèmes. |

---

## 🖥️ Endpoints Backend Express (`server.ts` & `/server/routes/*`)

Le backend local Express fait office de proxy sécurisé, de gestionnaire de session et de contrôleur d'intégrité :

| Endpoint Backend | Méthode | Paramètres / Corps | Rôle & Traitement |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Aucun | Diagnostic de santé, mémoire Node.js, statut du catalogue et sessions. |
| `/api/types/status` | `GET` | Aucun | État du catalogue, nombre de types indexés, source et checksum SHA-256. |
| `/api/types/all` | `GET` | Aucun | Retourne le catalogue complet validé sous contrat strict `{ metadata, types }`. |
| `/api/types/search` | `GET` | `?q=terme` | Recherche hybride (catalogue local + proxy ESI `/universe/ids/`). |
| `/api/auth/url` | `GET` | `?redirect_uri=...` | Génère l'URL d'autorisation EVE SSO v2 avec jeton CSRF `state`. |
| `/api/auth/token` | `POST` | `{ code, state }` | Échange sécurisé du code d'autorisation contre les tokens JWT. |
| `/api/auth/refresh` | `POST` | `{ refresh_token }` | Renouvellement atomique avec verrouillage anti-concurrence. |
| `/api/character/:id/wallet` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/wallet/`; le solde est renvoyé inchangé sous `{ balance }`. |
| `/api/character/:id/orders` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/orders/`. |
| `/api/character/:id/orders/history` | `GET` | `?page=1..1000` & `Authorization` | Historique des ordres caractère, page ESI explicitement conservée. |
| `/api/character/:id/skills` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/skills/`. |
| `/api/character/:id/transactions` | `GET` | `?from_id=...` & `Authorization` | Ingestion paginée des transactions de portefeuille. |
| `/api/character/:id/journal` | `GET` | En-tête `Authorization` | Proxy vers le journal financier caractère. |
| `/api/character/:id/corporation` | `GET` | Facultatif | Résolution de l'identité publique caractère puis du profil public de corporation; l'identité ESI est toujours appelée anonymement. |
| `/api/character/:id/corporation/wallets` | `GET` | En-tête `Authorization` | Route corporation legacy maintenue en non-régression; expose divisions et soldes tels que fournis par ESI. |

---

## 🔐 Contrat de frontière ESI des routes caractère

Les routes caractère authentifiées utilisent exclusivement la chaîne `charactersRouter -> CharacterEsiGateway -> EsiGateway -> fetchEsi`. La route ne reconstruit pas de politique ESI parallèle.

Règles durables :
* `characterId` doit être un entier positif sous sa forme canonique;
* le schéma Bearer est insensible à la casse et les espaces entre schéma et credential sont normalisés;
* une requête anonyme ne transmet jamais l'Authorization fournie par le caller;
* les credentials de deux personnages ne peuvent pas partager une requête privée dédupliquée;
* le payload CCP n'est pas transformé en zéro, tableau vide ou valeur synthétique en cas d'erreur;
* les métadonnées de transport sont conservées lorsque CCP les fournit : ETag, expiration, Last-Modified, Cache-Control, X-Pages, compatibilité ESI, rate-limit et Retry-After;
* un `304 Not Modified` reste un résultat de cache sans corps JSON;
* un succès de transport sans payload exploitable produit une réponse fail-closed `INVALID_ESI_RESPONSE`;
* les erreurs ESI gardent leur statut et leur classification au niveau HTTP.

La suite dédiée `server/__tests__/character_routes_contract.test.ts` couvre la chaîne HTTP complète avec un transport CCP mocké et vérifie également l'isolation des credentials et les routes corporation legacy.

---

## 🔄 Flux d'Authentification EVE SSO v2

```
[Navigateur Utilisateur]
       │
       ├── 1. Clic sur "Connecter mon Personnage EVE"
       │
       ▼
[/api/auth/url] ──> Génère l'URL d'autorisation EVE SSO v2 avec State CSRF (TTL 10 min)
       │
       ▼
[Page de Connexion CCP Games] (login.eveonline.com)
       │
       ├── 2. Le joueur s'authentifie et choisit son personnage
       │
       ▼
[/auth/callback?code=AUTH_CODE&state=STATE]
       │
       ├── 3. Le serveur valide le jeton State et échange AUTH_CODE
       │      contre access_token + refresh_token via Basic Auth (Secret serveur)
       │
       ├── 4. Décodage du JWT payload (CharacterID, CharacterName, Scopes)
       │
       ▼
[Client React]
       │
       └── 5. Stockage sécurisé de la session dans `safeStorage` (IndexedDB / memory)
              et synchronisation périodique des compétences, ordres et portefeuille.
```

---

## 🛡️ Gestion des Limites de Requêtes (*Error Budget & Rate Limiting*)

Le client ESI centralisé distingue les mécanismes de limitation documentés par CCP :
* **Error Limit** : `X-ESI-Error-Limit-Remain` / `X-ESI-Error-Limit-Reset` indiquent le budget d'erreurs restant et le délai avant réinitialisation.
* **Rate Limit par bucket** : `X-Ratelimit-Group`, `X-Ratelimit-Limit`, `X-Ratelimit-Remaining` et `X-Ratelimit-Used` sont capturés lorsqu'ils sont fournis par la route.
* **`Retry-After`** : le délai en secondes est conservé et utilisé par la politique de reprise pour les réponses `420/429` compatibles.
* **`420` et `5xx`** : la politique de retry reste bornée et ne contourne jamais un error budget épuisé.
* **Cache HTTP** : `ETag`, `Expires`, `Last-Modified`, `Cache-Control` et `304 Not Modified` font partie des métadonnées transportées par le gateway.
* **Pagination** : l'en-tête `X-Pages` est exposé en valeur brute `xPages` pour compatibilité et en valeur numérique dans les métadonnées typées.
* **Compatibilité ESI** : chaque requête porte la date d'application `X-Compatibility-Date`, centralisée dans `server/utils/esiTypes.ts` et surchargeable uniquement via configuration explicite.
* **User-Agent** : tous les appels backend vers ESI passent par `server/utils/esiClient.ts`.

---

## 🔁 Gestion du Cycle de Vie des Tokens EVE SSO

* **Durée de validité du Token d'accès :** 1200 secondes (20 minutes).
* **Détection d'expiration anticipée :** `AuthService.isTokenExpiredOrExpiringSoon` vérifie si `Date.now() >= expires_at - 120000` (marge de sécurité de 2 minutes).
* **Verrouillage Mutex Anti-Course :** `AuthService.getFreshToken(characterId)` utilise un verrou en mémoire (`refreshLockMap`) pour agréger les requêtes concurrentes sur un seul appel réseau de renouvellement.
* **Résilience aux Révocations :** En cas d'invalidation explicite du refresh token (code `400 Invalid Grant`), la session est marquée comme expirée et notifiée dans l'interface sans planter le store.

## 🏢 Corporation ESI — Phase 4.6

Les ressources corporation actuellement consommées par EVE Trade passent par `CorporationEsiGateway` :

| Endpoint ESI | Scope | Principal transport |
|---|---|---|
| `/corporations/{corporation_id}/` | Public | anonymous |
| `/corporations/{corporation_id}/wallets/` | `esi-wallet.read_corporation_wallets.v1` | authenticated character |
| `/corporations/{corporation_id}/divisions/` | `esi-corporations.read_divisions.v1` | authenticated character |

Le `corporation_id` est d'abord résolu via l'identité publique du personnage. Les credentials du personnage ne sont utilisés que pour les endpoints corporation authentifiés.

La chaîne backend est :

```text
charactersRouter
  -> CharacterEsiGateway
  -> CorporationEsiGateway
  -> EsiGateway
  -> fetchEsi
  -> CCP
```

Cette frontière est volontairement neutre vis-à-vis du métier. Elle constitue le point d'extension pour de futures données corporation, notamment les domaines industrie, assets ou orders, sans les implémenter dans cette phase.

### Trésorerie corporation

Le mode `treasury_source_mode = corporation` sélectionne exclusivement une source corporation marquée `esi` ou `manual`. Une donnée de wallet personnage, même négative, ne peut pas réduire ni remplacer le capital corporation.

Une source ESI indisponible est représentée distinctement et ne provoque pas la réutilisation silencieuse d'un ancien `available_capital`.

Une ancienne configuration persistée sans `corporation_wallet_source`, ou avec une valeur inconnue, est normalisée vers `unavailable`. Le solde numérique hérité reste consultable, mais n'est pas certifié comme capital ESI ou budget manuel tant qu'il n'a pas été explicitement requalifié.


## Phase 4.7 — Corporation trading orders

The corporation trading order boundary now supports:

| Endpoint ESI | Scope SSO | Principal transport |
|---|---|---|
| `/corporations/{corporation_id}/orders/` | `esi-markets.read_corporation_orders.v1` | authenticated character |
| `/corporations/{corporation_id}/orders/history/` | `esi-markets.read_corporation_orders.v1` | authenticated character |

The HTTP routes are exposed under `/api/character/:id/corporation/orders` and `/api/character/:id/corporation/orders/history`. The corporation ID is resolved from the character's public identity; callers do not supply an arbitrary corporation ID.

Both routes preserve ESI payloads and transport metadata and use the authenticated character as the ESI principal. The corporation itself is never represented as an authentication principal.


## Phase 4.7 — Character collection state semantics

Character collection methods in `EsiService` no longer expose failure as a plain empty array. The frontend service returns an explicit data-state contract so consumers can distinguish a genuinely empty character dataset from unavailable/error data.

Business consumers must pass collection results through `EsiService.requireUsableCollection()`. Only `AVAILABLE` and `EMPTY` are released to calculations; `PARTIAL`, `UNAVAILABLE` and `ERROR` propagate into degraded-data handling.


## Phase 4.7 — Corporation order normalization flow

The corporation trading flow is:

`Character OAuth -> corporation identity resolution -> authenticated corporation orders -> pure ownership normalization -> character snapshot`.

The authenticated character remains the ESI principal throughout the flow. The corporation is represented only as the economic owner in the normalized order contract.

When the same order is visible through both character and corporation feeds, the corporation feed is authoritative and the canonical OrderId prevents double representation.


## Phase 4.7 — Private request and observation provenance

Authenticated ESI request coalescing is partitioned by the observing character and a cryptographic credential fingerprint. Two characters in the same corporation therefore never share an in-flight private request.

At the application aggregation boundary, one corporation OrderId may legitimately have multiple observers. The normalized ownership record retains additive observer provenance instead of replacing the last observer silently.
