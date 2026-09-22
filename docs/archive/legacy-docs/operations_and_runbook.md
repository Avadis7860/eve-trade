# 🛠️ Runbook d'Exploitation & Diagnostic (operations_and_runbook.md)

Ce document constitue le manuel d'exploitation opérationnel, de diagnostic d'incidents et de procédures de maintenance pour la plateforme **EVE Trade**.

---

## 🎯 1. Procédures de Diagnostic & Santé du Système

### 1.1 Diagnostic de l'API Backend & Statut Global
Le point d'entrée d'observabilité principal est l'endpoint `/api/health` :

```bash
# Vérifier l'état de santé du backend
curl -s http://localhost:3000/api/health | jq .
```

**Champs retournés et valeurs attendues :**
* `status` : `"ok"` (ou `"degraded"` en cas d'indisponibilité du catalogue).
* `uptime` : Temps d'exécution du processus Express en secondes.
* `memory` : Empreinte mémoire Node.js (`heapUsed`, `heapTotal`, `rss`).
* `catalog` :
  * `loaded` : `true`
  * `totalTypes` : Nombre de types indexés ; vérifier la valeur retournée au lieu de supposer un seuil fixe.
  * `source` : Source effective renvoyée par `/api/types/status`.
  * `state` : `"CATALOG_LOADED"` ou `"CATALOG_FALLBACK_CORE"`.
  * `checksum` : Empreinte SHA-256 déterministe.
* `activeOAuthStates` : Nombre de flux d'authentification SSO en cours.

### 1.2 Diagnostic du Stockage Durable IndexedDB
Ouvrir les outils de développement du navigateur (`F12` $\to$ Onglet *Application* $\to$ *Storage* $\to$ *IndexedDB* $\to$ `eve_trade_durable_store` (Version 5)) :

1. **Vérifier les 11 magasins d'objets :**
   * `snapshots` : Présence des clés `typeId:regionId`.
   * `catalog_metadata` : Clé unique `singleton` avec `checksum` et `state`.
   * `character_transactions` : Enregistrements indexés par `character_id`.
   * `character_executions` : Suivi d'exécution corrélé.
   * `opportunity_observations` : Snapshots $T_0$ et outcomes multi-horizons.
2. **Audit des écritures (`storageAudit`) :**
   Vérifier que `writeFailuresCount === 0` et `lastWriteStatus === 'IDLE' | 'SUCCESS'`.

---

## 🚨 2. Gestion des Incidents & Dépannage

### 2.1 Incident ESI : Erreurs `429 Too Many Requests` ou `420 Enhance Your Calm`
* **Symptôme :** Les requêtes vers CCP ESI échouent avec le code HTTP 429 ou 420.
* **Comportement Automatisé :** `EsiService` et `CharacterTransactionSyncService` interceptent l'en-tête `Retry-After` ou `X-Esi-Error-Limit-Reset` et suspendent automatiquement les requêtes sortantes.
* **Action Opérateur :**
  1. Vérifier le taux de rafraîchissement automatique dans `ConfigurationPanel`.
  2. Éviter de déclencher des scans globaux simultanés sur plusieurs régions.
  3. Les synchronisations en arrière-plan reprendront automatiquement dès l'expiration du délai.

### 2.2 Incident Authentification : Expiration ou Révocation de Token EVE SSO
* **Symptôme :** Erreur `401 Unauthorized` lors de l'accès aux données privées d'un personnage (`wallet`, `orders`, `skills`).
* **Comportement Automatisé :** `AuthService` tente un rafraîchissement atomique avec verrouillage mutex (`/api/auth/refresh`).
* **Résolution en cas d'échec de Refresh :**
  1. Si le joueur a révoqué l'application sur le portail CCP, la session passe en statut `expired`.
  2. L'interface affiche un badge rouge "Session Expirée" invitant le joueur à cliquer sur "Reconnecter".

### 2.3 Incident Catalogue : État `CATALOG_CORRUPTED` ou Dégradation
* **Symptôme :** L'en-tête de l'application affiche un badge d'alerte rouge `Catalogue Corrompu` ou `état dégradé`.
* **Procédure de Résolution :**
  1. Vérifier la validité syntaxique du fichier JSON du catalogue :
     ```bash
     node -e "JSON.parse(require('fs').readFileSync('src/data/allMarketTypes.json'))"
     ```
  2. Forcer la purge et la reconstruction du cache local IndexedDB via la méthode atomique :
     `IndexedDbStore.replaceCatalog(...)`.

---

## 🔄 3. Procédures de Synchronisation & Maintenance

### 3.1 Synchronisation Paginée des Transactions Portefeuille (`from_id`)
1. L'ingestion des transactions s'exécute de façon incrémentale par lot de 2500 transactions maximum (limite CCP).
2. L'orchestrateur `CharacterTransactionSyncService` utilise l'ancre `from_id` décroissante.
3. Dès qu'un `transaction_id` correspond à un enregistrement déjà présent dans `character_transactions`, la pagination s'arrête immédiatement (*gap bridging*).
4. Les nouvelles transactions sont commitées dans IndexedDB avant d'être répercutées dans l'état de l'application.

### 3.2 Rejeux Déterministes de Corrélation d'Exécution
Si de nouvelles opportunités $T_0$ ou de nouvelles transactions sont injectées a posteriori :
```typescript
// Déclenche une corrélation idempotente pour le personnage actif
await ExecutionTrackingService.recomputeCharacterExecutions(characterId);
```
Cette opération recalcule tous les appariements multicritères sans modifier les transactions historiques.

---

## 🧪 4. Protocole de Validation Technique

Avant toute mise en production ou validation de changements :

```bash
# 1. Vérification de tous les calculs mathématiques et flux
npm test

# 2. Vérification statique TypeScript sans émission
npm run lint

# 3. Compilation complète de production (Vite + Express Bundle)
npm run build
```
