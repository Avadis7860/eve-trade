# 🤖 EVE Trade — Guide des Directives IA (GEMINI.md)

Ce fichier étend et applique les instructions opérationnelles pour le modèle **Gemini** et la plateforme **Google AI Studio Build**.

## 📌 Références Essentielles
* **Directives complètes pour les Agents :** Voir [`AGENTS.md`](./AGENTS.md).
* **Audit et Traçabilité des Algorithmes :** Voir [`docs/algorithms_and_engine_audit.md`](./docs/algorithms_and_engine_audit.md).
* **Architecture Technique Globale :** Voir [`ARCHITECTURE.md`](./ARCHITECTURE.md).
* **Intégration API CCP ESI :** Voir [`docs/api_and_esi_integration.md`](./docs/api_and_esi_integration.md).

---

## ⚡ Résumé des Invariants Opérationnels
1. **Moteurs purs (`/src/engine/*`)** : Aucune dépendance réseau, React ou localStorage. Uniquement des calculs mathématiques purs.
2. **Cycle de validation** : Toujours exécuter `npm test`, `npm run lint` et `npm run build` après modification de code.
3. **Formatage monétaire** : Toujours utiliser les fonctions centralisées de `src/engine/money.ts` (`formatIsk`, `formatCompactIsk`, `formatPercent`).
4. **Authentification EVE SSO** : Gérée via `AuthService` avec renouvellement automatique et support multi-personnages.
