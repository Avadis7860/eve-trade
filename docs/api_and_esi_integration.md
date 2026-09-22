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
| `/api/character/:id/wallet` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/wallet/`. |
| `/api/character/:id/orders` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/orders/`. |
| `/api/character/:id/skills` | `GET` | En-tête `Authorization` | Proxy sécurisé vers `/characters/{id}/skills/`. |
| `/api/character/:id/transactions` | `GET` | `?from_id=...` & `Authorization` | Ingestion paginée des transactions de portefeuille. |

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

