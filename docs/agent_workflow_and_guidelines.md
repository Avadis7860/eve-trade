# 🧭 Guide Opérationnel & Workflow pour Agents IA

Ce document présente les étapes types, les pièges à éviter et les procédures recommandées pour tout agent d'intelligence artificielle intervenant sur le projet **EVE Trade**.

---

## 🚀 Prise en Main d'une Nouvelle Tâche

Lors de la réception d'une instruction utilisateur :
1. **Consulter la cartographie des modules** :
   * Modélisation financière $\implies$ `/src/engine/`
   * Intégration ESI ou synchro $\implies$ `/src/services/`
   * Interface graphique $\implies$ `/src/components/`
   * Typage commun $\implies$ `/src/types.ts`
2. **Ne jamais modifier les signatures de fonctions mathématiques** sans mettre à jour les tests associés dans `/src/engine/__tests__/`.
3. **Respecter l'absence d'effets de bord dans `/src/engine/`** : Ne jamais introduire d'appels `fetch`, `localStorage` ou `useState` dans un fichier de moteur.

---

## 📋 Checklist de Validation Avant Fin de Tour

Chaque modification doit être validée par les 3 commandes de contrôle qualité :

```bash
# Étape 1 : Tests unitaires
npm test

# Étape 2 : Linter & Typage strict
npm run lint

# Étape 3 : Compilation de production
npm run build
```

---

## ⚠️ Pièges Fréquents & Bonnes Pratiques

| Piège | Bonne Pratique |
| :--- | :--- |
| **Division par zéro sur le ROI** | Toujours vérifier `if (cost <= 0) return 0;` |
| **Calcul du Broker Fee sur achat Taker** | Le broker fee d'achat est de $0.00\%$ pour un ordre Taker (achat direct sur ordre de vente existant). |
| **Frais de transport désactivés** | Si `enable_transport_costs === false`, retourner `0.00 ISK` immédiatement. |
| **Plafond de concentration portefeuille** | Vérifier les limites par type et par groupe avant d'allouer du capital. |
| **Filtrage des stations distantes** | Ne jamais supprimer le filtre `o.location_id === hub.station_id` lors de l'évaluation d'un hub. |
| **Formatage des montants ISK** | Utiliser systématiquement `formatIsk()`, `formatCompactIsk()` ou `formatPercent()` de `src/engine/money.ts`. |
| **Confusion Score vs Confiance** | Ne jamais amalgamer le score d'opportunité (attractivité 0-100) et la confiance statistique (certitude 0-100%). |
| **Masquage d'erreurs en faux zéro** | Respecter strictement `NO DATA ≠ ZERO DATA`. Lever des erreurs explicites (`CATALOG_CORRUPTED`, `CATALOG_UNAVAILABLE`). |
| **Persistance des observations** | Enregistrer les observations de façon immuable dans `IndexedDbStore` sans écraser les données historiques. |

