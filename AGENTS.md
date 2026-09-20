# 🤖 Directives & Protocole de Travail pour Agents IA (AGENTS.md)

Ce document constitue la **source de vérité absolue** pour tout agent d'intelligence artificielle (Gemini, Claude, GPT, Antigravity, etc.) reprenant le développement, l'audit ou la maintenance de ce dépôt.

---

## 🎯 Principes Directeurs & Invariants Majeurs

### 1. Invariants Mathématiques des Moteurs de Trading (`/src/engine/*`)
* **Aucun effet de bord dans les moteurs :** Tous les fichiers dans `/src/engine/` (`fee.ts`, `ladder.ts`, `money.ts`, `profit.ts`, `quantity.ts`, `scoring.ts`, `features.ts`, `prediction.ts`, `interRegional.ts`, `portfolio.ts`) sont des modules mathématiques purs. Ils ne doivent jamais contenir d'appels réseau, d'accès direct au `localStorage`, ou de hooks React.
* **Respect strict des formules officielles CCP Games :**
  * *Sales Tax* : Décroissance de 11% par niveau de compétence *Accounting* ($8.0\% \to 3.6\%$).
  * *NPC Broker Fee* : Décroissance via *Broker Relations*, faction standing et corp standing ($3.0\% \to 1.0\%$).
  * *Taker vs Maker* : L'achat direct sur un ordre de vente existant (Taker) **n'engendre AUCUN broker fee** ($0\%$). Le broker fee d'achat ne s'applique que lors de la création d'un ordre d'achat limite (*Maker*).
  * *Relist Fee* : Réduction de 5% par niveau de compétence *Advanced Broker Relations*.
  * *Transport Cost* : Si `enable_transport_costs === false`, le coût doit valoir **strictement 0.00 ISK**.
* **Déduplication stricte des carnets d'ordres :** Toujours dédupliquer sur `order_id` (identifiant unique CCP).

### 2. Architecture des Données, Observations, Preuves & Persistance
* **Chaîne de Preuve & Certification 4 Piliers Immuable :** Chaque opportunité générée par `InterRegionalFinancialEngine` est accompagnée d'un instantané cryptographique `OpportunityEvidence` (`4-pillars-v1`).
  * Empreinte déterministe SHA-256 (`evidence_hash`) calculée par `OpportunityEvidenceEngine` via sérialisation canonique.
  * Auditabilité complète : vérification en temps réel des 4 piliers (`MarketData`, `Catalog`, `Universe`, `FinancialEngine`).
* **Centralisation & Entrepôt Immuable :** Toutes les données de marché synchronisées sont stockées et notifiées via `src/services/marketDataStore.ts` et archivées de façon immuable dans `src/services/indexedDbStore.ts` (IndexedDB v3).
* **Sécurité des Tokens EVE SSO :**
  * Les tokens d'accès JWT expirent au bout de 20 minutes (1200 secondes).
  * Toujours vérifier `AuthService.isTokenExpiredOrExpiringSoon(session)` avant d'exécuter un appel nécessitant une authentification.
  * Si ESI retourne un code `401 Unauthorized`, déclencher immédiatement le renouvellement via `AuthService.getFreshToken(characterId)` ou `/api/auth/refresh`.

---

## 🛠️ Commandes & Cycle de Validation

Avant de clore toute tâche ou de proposer des modifications, l'agent IA **DOIT impérativement** exécuter et valider les trois étapes suivantes :

### 1. Tests Unitaires Mathématiques
```bash
npm test
```
*Vérifie la conformité de tous les calculs de taxes, de slippage de carnet, d'arbitrage inter-hubs et de sécurité des sessions.*

### 2. Vérification du Typage TypeScript
```bash
npm run lint
```
*Exécute `tsc --noEmit`. Aucune erreur TypeScript ne doit subsister.*

### 3. Compilation de Production
```bash
npm run build
```
*Compile le frontend React avec Vite et bundle le backend Express dans `dist/server.cjs`.*

---

## 📁 Répertoire & Responsabilités des Modules

```
/
├── server.ts                 # Backend Express (Endpoints API, Proxy ESI, Échange SSO)
├── src/
│   ├── types.ts              # Types TypeScript unifiés (Point central de typage)
│   ├── engine/               # Moteurs de calcul déterministes (PURS, SANS EFFETS DE BORD)
│   │   ├── fee.ts            # Calculateur de taxes, courtage et fret
│   │   ├── ladder.ts         # Agrégation de carnet, profondeur et slippage
│   │   ├── quantity.ts       # Résolution multi-contraintes (capital, cargo, carnet)
│   │   ├── profit.ts         # Compte de résultat, ROI, marge et profit net
│   │   ├── scoring.ts        # Moteur de notation 10 critères et détection d'anomalies
│   │   ├── features.ts       # Feature engineering temporel (momentum, accélération)
│   │   ├── prediction.ts     # Modélisation prédictive & probabilité de survie/profit
│   │   ├── interRegional.ts  # Pipeline d'arbitrage spatialisé directionnel
│   │   ├── evidence.ts       # Moteur de preuve d'opportunité & hachage déterministe SHA-256
│   │   ├── portfolio.ts      # Optimiseur de portefeuille et limites de concentration
│   │   ├── money.ts          # Formatage monétaire ISK et conversions
│   │   └── __tests__/        # Suites de tests automatisés
│   ├── services/             # Couche d'intégration & services d'orchestration
│   │   ├── authService.ts    # Gestion multi-personnages EVE SSO et tokens
│   │   ├── esi.ts            # Client HTTP CCP ESI avec retry et gestion d'erreurs
│   │   ├── indexedDbStore.ts # Stockage persistant IndexedDB v2 (8 object stores)
│   │   ├── marketDataStore.ts# Cache central d'ordres et statistiques
│   │   ├── scanner.ts        # Scanner d'opportunités inter-hubs
│   │   ├── orderAdvisor.ts   # Moteur de recommandations d'ajustement d'ordres
│   │   ├── traderAnalytics.ts# Traitement comptable FIFO des transactions
│   │   ├── typeCatalog.ts    # Validation structurelle et cryptographique du catalogue
│   │   └── globalMarketSync.ts # Orchestrateur de synchronisation d'univers
│   ├── components/           # Composants UI modulaires React 18 + Tailwind
│   └── data/                 # Référentiel statique New Eden (Hubs, Routes, Groupes)
└── docs/                     # Documentation d'audit et manuels d'ingénierie
```

---

## 🚫 Règles d'Or pour les Modifications de Code

1. **Ne jamais altérer `types.ts` sans répercuter sur les moteurs :** Toute modification d'interface doit être synchrone dans `src/types.ts` et dans les moteurs mathématiques.
2. **Ne jamais supprimer les gardes-fous division par zéro :** Toujours utiliser `safeDiv` ou des vérifications `if (denominator > 0)` pour éviter les `NaN` ou `Infinity`.
3. **Respecter l'accessibilité des stations :** Ne jamais simplifier le filtrage spatial des ordres dans `interRegional.ts`. Un ordre d'achat ne peut être pris que dans la station où les marchandises sont situées ou selon son champ de validité (`order_range`).
4. **Pas d'icônes SVG custom :** Utiliser exclusivement `lucide-react`.
5. **Préserver le mode multi-comptes :** Toute fonctionnalité relative aux personnages doit être compatible avec la liste `EveCharacterSession[]` gérée par `AuthService`.
