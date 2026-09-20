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
| **Transactions Joueur** | `/characters/{character_id}/wallet/transactions/` | `GET` | `esi-wallet.read_character_wallet.v1` | Reconstitution FIFO des gains/pertes réalisés. |
| **Journal Financier** | `/characters/{character_id}/wallet/journal/` | `GET` | `esi-wallet.read_character_wallet.v1` | Suivi des taxes et frais prélevés par CCP. |
| **Compétences** | `/characters/{character_id}/skills/` | `GET` | `esi-skills.read_skills.v1` | Niveaux d'*Accounting* (ID 3443) et *Broker Relations* (ID 3444). |
| **Univers (Stations)** | `/universe/stations/{station_id}/` | `GET` | *Public* | Résolution des noms et systèmes stellaires des stations PNJ. |
| **Univers (Citadelles)** | `/universe/structures/{structure_id}/` | `GET` | `publicData` | Résolution des noms des structures Upwell privées. |
| **Univers (Types)** | `/universe/types/{type_id}/` | `GET` | *Public* | Résolution des noms et volumes unitaires ($m^3$) des objets. |
| **Résolution d'IDs** | `/universe/ids/` | `POST` | *Public* | Résolution universelle du nom des 35 000+ types d'objets. |

---

## 🖥️ Endpoints Backend Express (`server.ts`)

Le backend local Express fait office de proxy sécurisé, de gestionnaire de session et de contrôleur d'intégrité :

| Endpoint Backend | Méthode | Paramètres / Corps | Rôle & Traitement |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Aucun | Diagnostic de santé, mémoire Node.js, statut du catalogue et sessions. |
| `/api/types/status` | `GET` | Aucun | État du catalogue, nombre de types indexés, source et checksum SHA-256. |
| `/api/types/all` | `GET` | Aucun | Retourne le catalogue complet validé (250+ articles clés ou complet). |
| `/api/types/search` | `GET` | `?q=terme` | Recherche hybride (catalogue local + proxy ESI `/universe/ids/`). |
| `/api/auth/url` | `GET` | `?redirect_uri=...` | Génère l'URL d'autorisation EVE SSO v2 avec jeton CSRF `state`. |
| `/api/auth/token` | `POST` | `{ code, state }` | Échange sécurisé du code d'autorisation contre les tokens JWT. |
| `/api/auth/refresh` | `POST` | `{ refresh_token }` | Renouvellement atomique avec verrouillage anti-concurrence. |
| `/api/character/:id/*` | `GET` | En-tête `Authorization` | Proxy authentifié vers les endpoints ESI privés du personnage. |

---

## 🔄 Flux d'Authentification EVE SSO v2

```
[Navigateur Utilisateur]
       │
       ├── 1. Clic sur "Connecter mon Personnage EVE"
       │
       ▼
[/api/auth/url] ──> Génère l'URL d'autorisation EVE SSO v2 avec State CSRF
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
       │      contre access_token + refresh_token via Basic Auth
       │
       ├── 4. Décodage du JWT payload (CharacterID, CharacterName)
       │
       ▼
[Client React]
       │
       └── 5. Stockage sécurisé de la session dans `safeStorage` (IndexedDB / localStorage)
              et synchronisation automatique des ordres/compétences
```

---

## 🛡️ Gestion des Limites de Requêtes (*Error Budget & Rate Limiting*)

CCP ESI utilise un système d'**Error Budget** strict (100 erreurs autorisées par fenêtre glissante) :
* **En-tête `X-Esi-Error-Limit-Remain`** : Surveillé pour ralentir les requêtes si le nombre d'erreurs restantes descend sous 20.
* **En-tête `X-Esi-Error-Limit-Reset`** : Délai d'attente en secondes en cas de dépassement.
* **Code HTTP `420 Enhance Your Calm`** : Interception globale avec pause exponentielle immédiate.
* **User-Agent Identifiant** : Toutes les requêtes émises par le serveur ou le client incluent l'en-tête obligatoire :
  ```http
  User-Agent: eve-trade-interregional/0.2 (EVE Trade Analytics Platform)
  ```

---

## 🔁 Gestion du Cycle de Vie des Tokens

* **Durée de validité du Token d'accès :** 1200 secondes (20 minutes).
* **Détection d'expiration anticipée :** `AuthService.isTokenExpiredOrExpiringSoon` vérifie si `Date.now() >= expires_at - 120000` (marge de 2 minutes).
* **Renouvellement automatique :**
  ```typescript
  const freshToken = await AuthService.getFreshToken(characterId);
  ```
  Le renouvellement est transparent pour l'utilisateur. En cas d'échec du refresh token (révocation par le joueur), la session est marquée comme expirée et invite à une reconnexion.

