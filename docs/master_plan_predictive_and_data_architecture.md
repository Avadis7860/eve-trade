# Master-Plan de Travail Professionnel : Architecture Prédictive, Données Immuables & Gestion Complète des Types EVE Online

Ce document formalise la feuille de route d'ingénierie pour corriger les faiblesses structurelles et mathématiques identifiées, mettre en place une couche d'observations persistantes et étendre la couverture du marché à l'intégralité de l'univers EVE Online (15 801+ types).

---

## 1. Diagnostic des Faiblesses et État des Lieux

### 1.1 Faiblesses Mathématiques dans le Moteur de Scoring (`src/engine/scoring.ts`)
* **Bug d'anomalie de prix (`priceRatio`) :**
  L'expression précédente comparait le coût d'achat global (`costs.purchase_cost`, en dizaines ou centaines de millions d'ISK) à la médiane unitaire 30 jours (`history.price_median_30d`, ex. 100 ISK).
  Pour toute transaction portant sur plus de 3 unités, `priceRatio` dépassait systématiquement 3.0, déclenchant à tort le flag `isAnomalous = true` et pénalisant arbitrairement le `stabilityScore` de 30 points.
* **Calcul de délai de rotation (`rawDays`) :**
  La formule de fallback intégrait une redondance dimensionnelle (`costs.purchase_cost / (dailyVolume * (costs.purchase_cost / profit_per_unit))`), équivalant à `profit_per_unit / dailyVolume`, ce qui mélangeait unités physiques et ISK.
* **Confusion entre métriques globales et unitaires :**
  Nécessité de découpler explicitement le prix effectif unitaire d'achat (`unitEffectiveBuyPrice`), le prix effectif de vente (`unitEffectiveSellPrice`) et les totaux financiers du lot.

### 1.2 Faiblesses dans l'Architecture des Données de Marché
* **Écrasement destructeur des carnets :**
  Le système écrasait le snapshot précédent sans archiver les états successifs. Impossible de calculer des dynamiques temporelles (taux de consommation des ordres, vélocité du carnet, persistance du spread).
* **Perte des données d'historique brutes :**
  Les séries quotidiennes ESI (`DailyMarketHistory[]`) étaient agrégées en moyennes/médianes, puis jetées au lieu d'être conservées pour le calcul de volatilité, de z-score et de modèles de probabilité.

### 1.3 Faiblesse de Couverture du Catalogue EVE Online
* **Catalogue statique limité :**
  L'application reposait sur un échantillon restreint de ~55 types, alors que le marché EVE Online compte plus de 15 800 articles échangeables avec des historiques ESI distincts.
* **Absence de recherche universelle dynamique :**
  L'utilisateur ne pouvait pas saisir le nom ou l'identifiant de n'importe quel vaisseau, module de faction ou composant de structure sans que l'application ne dispose d'un proxy de résolution universel.

---

## 2. Piliers d'Architecture & Spécifications Techniques

### Pilier 1 : Rétablissement de la Rigueur Mathématique Pure
* **Indépendance des Moteurs :**
  Conformément aux règles fondamentales d'`AGENTS.md`, tous les moteurs dans `src/engine/` demeurent des fonctions mathématiques pures, sans effet de bord, testables unitairement et reproductibles.
* **Correction des Ratios Unitaires :**
  * `unitEffectiveBuyPrice` = `costs.purchase_cost / quantity`.
  * `priceDeviationPct` = `((unitEffectiveBuyPrice - history.price_median_30d) / history.price_median_30d) * 100`.
  * Détection d'anomalie stricte : `unitPriceRatio > 3.0 || unitPriceRatio < 0.25` appliquée sur les **prix unitaires réels**.
* **Découplage de la Rotation :**
  * `rawDays` = `actualQuantity / Math.max(1, dailyVolume)`.
  * `expectedDaysToSell` prend en compte la profondeur devant l'ordre (`volumeAhead`) et la part de marché capturable (`expectedCapturableVolumePerDay`).

### Pilier 2 : Entrepôt d'Observations Immuables (`MarketObservationStore` & `OpportunityObservationStore`)
* **Modèle Append-Only :**
  Toute synchronisation produit une `MarketObservation` et, le cas échéant, une `OpportunityObservation` stockée de façon permanente dans IndexedDB.
* **Dédoublonnage par Hash :**
  Génération d'un `observation_hash = hash(type_id + region_id + bucket_time + best_buy + best_sell)` pour éviter la redondance d'observations identiques dans la même fenêtre temporelle.
* **Schéma de Données :**
  * `market_observations` : captures successives du haut de carnet, profondeur visible, volume ESI 24h, métadonnées de fraîcheur.
  * `opportunity_observations` : snapshot complet à $T_0$ de chaque opportunité détectée avec scores, contraintes, prix et métriques de slippage.
  * `market_history_daily` : séries chronologiques brutes ESI (date, volume, moyenne, haut, bas, nombre d'ordres).

### Pilier 3 : Moteur de Feature Engineering Temporel (`src/engine/features.ts`)
Calcul de métriques dynamiques à partir des séries d'observations :
1. **Spread Momentum ($M_s$) :** Évolution relative du spread sur 1h, 6h et 24h.
2. **Volume Acceleration ($A_v$) :** Rapport entre le volume 7j et le volume 30j normalisé.
3. **Competition Velocity ($V_c$) :** Vitesse d'apparition de nouveaux ordres concurrents à la destination.
4. **Spread Persistence ($P_s$) :** Proportion du temps pendant laquelle le spread est resté positif et exploitable.
5. **Volatility Z-Score ($Z_p$) :** Écart-type du prix spot par rapport à la moyenne mobile.

### Pilier 4 : Moteur de Prévision Déterministe & Découplage Score vs Confiance (`src/engine/prediction.ts`)
* **Séparation Conceptuelle Claire :**
  * **Opportunity Score (0 - 100) :** Attractivité économique brute (profit potentiel, ROI, efficacité du capital, transport).
  * **Prediction Confidence (0 - 100) :** Certitude statistique et fiabilité des données (taille de l'échantillon historique, volatilité, fraîcheur ESI, stabilité du spread).
* **Probabilités Déterministes :**
  * **Survival Probability ($P_{surv}$) :** Probabilité que le spread survive le temps que les marchandises soient transportées et vendues.
  * **Profit Realization Probability ($P_{real}$) :** Facteur d'amortissement prenant en compte le slippage, le relisting et la concurrence.
  * **Expected Realized Profit :** $\text{Profit Capturable} \times P_{real}$.

### Pilier 5 : Gestion Complète des 15 801+ Types d'EVE Online
* **Catalogue Élargi de Référence :**
  Expansion de `src/data/allMarketTypes.json` à plus de 250+ articles clés couvrant tous les segments majeurs (Vaisseaux T1/T2/Faction, Modules, Munitions, Drones, Industrie Planétaire, Minerais, Salvage, Implants, Injecteurs).
* **Résolution Universelle ESI Hybride :**
  * Backend Express (`/api/types/search`) : Recherche dans la base locale complétée dynamiquement par l'endpoint ESI `/universe/ids/` pour résoudre n'importe quel terme exact ou approchant parmi les 35 000+ types EVE.
  * Cache permanent IndexedDB (`eve_types`) : Tout article résolu ou recherché par l'utilisateur est instantanément mémorisé localement.
* **Sélecteur Dynamique dans l'UI :**
  Mise à jour de `MarketTree.tsx` et `GlobalMarketSyncModal.tsx` permettant à l'utilisateur de basculer entre catalogue restreint, catalogue étendu, et recherche globale dans l'univers complet.

### Pilier 6 : Suivi des Résultats & Validation Continue (`OutcomeTracker`)
* **Tracking à Horizonts Fixes :**
  Évaluation des opportunités observées à $T+1\text{h}$, $T+6\text{h}$, $T+24\text{h}$, $T+3\text{j}$, et $T+7\text{j}$.
* **Mesure de l'Erreur de Prédiction :**
  Calcul du taux de rétention de spread et comparaison entre le profit net prédit et le profit réellement réalisable aux conditions de marché ultérieures.

---

## 3. Plan d'Exécution Détaillé

| Étape | Action | Composants / Fichiers | Objectif |
| :--- | :--- | :--- | :--- |
| **1** | Corrections mathématiques | `src/engine/scoring.ts`, `src/engine/interRegional.ts` | Éliminer les faux positifs d'anomalies et fiabiliser les calculs unitaires |
| **2** | Types et Interfaces Unifiés | `src/types.ts` | Définir `MarketObservation`, `OpportunityObservation`, `PredictionForecast` |
| **3** | Moteurs Purs de Feature & Prédiction | `src/engine/features.ts`, `src/engine/prediction.ts` | Calculs déterministes de vélocité, momentum et probabilités de profit |
| **4** | Évolution du Stockage Durable | `src/services/indexedDbStore.ts`, `src/services/marketDataStore.ts` | Persistance append-only des observations et historiques bruts |
| **5** | Couverture Étendue des Types EVE | `src/data/allMarketTypes.json`, `server.ts`, `src/services/esi.ts` | 250+ types pré-indexés + résolution live universelle sur 15 801 types |
| **6** | Intégration UI & Affichage Clair | `OpportunityModal.tsx`, `MarketTree.tsx`, `GlobalMarketSyncModal.tsx` | Badges de confiance vs score, horizons temporels et sélecteur universel |
| **7** | Tests Automatisés & Validation | `src/engine/__tests__/*`, `npm test`, `npm run lint` | 100% de passage des tests sans régression |
