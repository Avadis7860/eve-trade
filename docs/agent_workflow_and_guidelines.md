# 🧭 Guide Opérationnel & Workflow pour Agents IA (agent_workflow_and_guidelines.md)

Ce document présente les étapes types, les pièges à éviter, les protocoles de validation et les procédures recommandées pour tout agent d'intelligence artificielle intervenant sur le projet **EVE Trade**.

---

## 🚀 Prise en Main d'une Nouvelle Tâche

Lors de la réception d'une instruction utilisateur :
1. **Consulter la cartographie agentique** : `docs/agent/repository_map.md`, puis les contrats et invariants concernés.
2. **Consulter la cartographie des modules** :
   * Modélisation financière & mathématiques pures $\implies$ `/src/engine/`
   * Intégration ESI, synchro, persistance & transactions $\implies$ `/src/services/`
   * Interface graphique React $\implies$ `/src/components/`
   * Typage commun $\implies$ `/src/types.ts`
   * Proxy Express backend $\implies$ `/server/` et `/server.ts`
3. **Ne jamais modifier les signatures de fonctions mathématiques** sans mettre à jour les tests associés dans `/src/engine/__tests__/`.
4. **Respecter l'absence totale d'effets de bord dans `/src/engine/`** : Ne jamais introduire d'appels `fetch`, `localStorage`, `IndexedDbStore`, `Date.now()` direct ou `useState` dans un fichier de moteur mathématique.

---

## 📋 Checklist de Validation Obligatoire Avant Fin de Tour

Chaque modification doit impérativement être validée par les 3 commandes de contrôle qualité dans l'ordre :

```bash
# Étape 1 : Tests unitaires et intégration (100% verts requis)
npm test

# Étape 2 : Linter & Typage strict (Zéro erreur TypeScript)
npm run lint

# Étape 3 : Compilation de production (Vite + esbuild CJS)
npm run build
```

---

## ⚠️ Pièges Fréquents & Invariants Critiques

| Domaine | Invariant / Piège Fréquent | Règle & Pratique Conforme |
| :--- | :--- | :--- |
| **Taxes & Frais** | Division par zéro sur le ROI | Toujours vérifier `if (cost <= 0) return 0;` |
| **Courtage Achat** | Broker fee d'achat sur ordre Taker | Le broker fee d'achat vaut **strictement $0.00\%$** lors de l'achat direct sur un ordre de vente existant. |
| **Fret & Logistique** | Frais de transport désactivés | Si `enable_transport_costs === false`, retourner **strictement `0.00 ISK`**. |
| **Portefeuille** | Plafond de concentration | Vérifier les limites par type et par groupe avant d'allouer du capital. |
| **Topologie Spatiale** | Filtrage des stations distantes | Ne jamais supprimer le filtre spatial `o.location_id === hub.station_id` sur les hubs sources. |
| **Monnaie ISK** | Formatage des montants | Utiliser systématiquement `formatIsk()`, `formatCompactIsk()` ou `formatPercent()` de `src/engine/money.ts`. |
| **Score vs Confiance** | Confusion des métriques | Découpler rigoureusement le score d'opportunité (attractivité 0-100) et la confiance statistique (certitude 0-100%). |
| **Santé des Données** | Masquage d'erreurs en faux zéro | Respecter strictement `NO DATA ≠ ZERO DATA`. Lever des erreurs explicites (`CATALOG_CORRUPTED`, `CATALOG_UNAVAILABLE`). |
| **Persistance** | Observations immuables | Enregistrer les observations et preuves de façon immuable dans `IndexedDbStore` sans écraser l'existant. |
| **Transactions ESI** | Normalisation pure & IDs | Rejeter les IDs non entiers ou négatifs via `Number.isSafeInteger`. Ne jamais synthétiser `transaction_id=0` ou inventer un `order_id`. |
| **Corrélation d'Exécution** | Isolation multi-personnages | Ne jamais lier une transaction d'un personnage à l'enregistrement d'un autre (`CrossCharacterMappingViolationError`). |

