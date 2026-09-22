# 🔬 Audit Complet et Traçabilité Algorithmique des Moteurs EVE Trade

Ce document fournit un audit mathématique et fonctionnel exhaustif de tous les moteurs de calcul, algorithmes financiers, modèles prédictifs et services analytiques intégrés dans **EVE Trade**.

Chaque formule est documentée avec ses paramètres d'entrée, ses domaines de validité, ses constantes CCP officielles, ses cas limites (*edge cases*) et sa traçabilité dans le code source.

---

## 📑 Sommaire des Moteurs Audités

1. [Moteur de Frais et Taxes (`FeeEngine`)](#1-moteur-de-frais-et-taxes-feeengine)
2. [Moteur de Profondeur et Carnet d'Ordres (`PriceLadderEngine`)](#2-moteur-de-profondeur-et-carnet-dordres-priceladderengine)
3. [Moteur de Quantité Négociable et Contraintes (`TradableQuantityEngine`)](#3-moteur-de-quantité-négociable-et-contraintes-tradablequantityengine)
4. [Moteur de Rentabilité et Décomposition Financière (`ProfitEngine`)](#4-moteur-de-rentabilité-et-décomposition-financière-profitengine)
5. [Moteur d'Évaluation Multicritère & Détection d'Anomalies (`OpportunityScoringEngine`)](#5-moteur-dévaluation-multicritère--détection-danomalies-opportunityscoringengine)
6. [Moteur de Feature Engineering Temporel (`MarketFeatureEngine`)](#6-moteur-de-feature-engineering-temporel-marketfeatureengine)
7. [Moteur de Prédiction Statistique & Confiance (`PredictionEngine`)](#7-moteur-de-prédiction-statistique--confiance-predictionengine)
8. [Moteur d'Arbitrage Inter-Régional Spatialisé (`InterRegionalFinancialEngine`)](#8-moteur-darbitrage-inter-régional-spatialisé-interregionalfinancialengine)
9. [Moteur d'Optimisation de Portefeuille (`PortfolioOptimizer`)](#9-moteur-doptimisation-de-portefeuille-portfoliooptimizer)
10. [Moteur de Conseil et Recommandation d'Ordres (`OrderAdvisorService`)](#10-moteur-de-conseil-et-recommandation-dordres-orderadvisorservice)
11. [Moteur Analytique P&L et Historique Réalisé (`TraderAnalyticsService`)](#11-moteur-analytique-pl-et-historique-réalisé-traderanalyticsservice)
12. [Gestion d'Intégrité du Catalogue de Types (`TypeCatalogService`)](#12-gestion-dintégrité-du-catalogue-de-types-typecatalogservice)
13. [Entrepôt de Données et Observations Immuables (`IndexedDbStore`)](#13-entrepôt-de-données-et-observations-immuables-indexeddbstore)

---

## 1. Moteur de Frais et Taxes (`FeeEngine`)

**Fichier source :** `src/engine/fee.ts`  
**Rôle :** Calculer avec exactitude toutes les frictions financières imposées par CCP Games (Taxes, Courtage PNJ, Frais de Structure Citadelle, Frais de Réémission, Coûts Logistiques).

### 1.1 Taxe de Vente CCP (*Sales Tax*)
La taxe de vente s'applique sur la valeur brute de chaque vente d'objet.

$$T_{sales}(s_{acc}) = 0.08 \times (1.0 - 0.11 \times s_{acc})$$

* **Paramètre :** $s_{acc} \in [0, 5] \cap \mathbb{Z}$ (Niveau de la compétence *Accounting*).
* **Barème officiel :**
  * Niveau 0 : $8.00\%$ ($0.0800$)
  * Niveau 1 : $7.12\%$ ($0.0712$)
  * Niveau 2 : $6.24\%$ ($0.0624$)
  * Niveau 3 : $5.36\%$ ($0.0536$)
  * Niveau 4 : $4.48\%$ ($0.0448$)
  * Niveau 5 : $3.60\%$ ($0.0360$)
* **Mode Alpha Clone :** Compétence plafonnée automatiquement au niveau 3 ($5.36\%$).

### 1.2 Frais de Courtage Station PNJ (*NPC Broker Fee*)
S'applique lors de la pose d'un ordre d'achat ou de vente au marché (*Maker*).

$$B_{npc}(s_{br}, F, C) = \max\Big(0.01,\ \min\big(0.08,\ 0.03 - 0.003 \cdot s_{br} - 0.0003 \cdot F - 0.0002 \cdot C\big)\Big)$$

* **Paramètres :**
  * $s_{br} \in [0, 5] \cap \mathbb{Z}$ : Niveau de compétence *Broker Relations*.
  * $F \in [-10.0, 10.0]$ : Réputation (*standing*) auprès de la Faction propriétaire de la station.
  * $C \in [-10.0, 10.0]$ : Réputation (*standing*) auprès de la Corporation propriétaire de la station.
* **Valeurs repères :**
  * Base sans compétences ($s_{br}=0, F=0, C=0$) : $3.00\%$
  * Compétence max sans standing ($s_{br}=5, F=0, C=0$) : $1.50\%$
  * Compétence et standings parfaits ($s_{br}=5, F=10, C=10$) : $1.00\%$ (plancher strict CCP).
* **Règle Taker vs Maker :** Un ordre d'achat exécuté directement sur un ordre de vente existant (Taker) engendre **strictement 0.00% de frais de courtage**.

### 1.3 Frais de Courtage en Structure Joueur (*Citadel / Upwell Structure*)
$$B_{citadel} = \max\Big(0.005,\ S_{SCC}(s_{br}) + B_{owner}\Big)$$

* $S_{SCC}(s_{br}) = \max(0.005,\ 0.015 - 0.0015 \times s_{br})$ : Surtaxe réglementaire obligatoire perçue par le SCC (*Secure Commerce Commission*), réductible par la compétence *Broker Relations* ($1.5\% \to 0.75\%$).
* $B_{owner}$ : Taux fixé par le propriétaire de la structure (généralement $0.0\% \sim 5.0\%$, défaut $1.0\%$).

### 1.4 Frais de Réémission (*Relist Fee*)
Lorsqu'un ordre existant est modifié en prix, des frais s'appliquent sur la base du taux de courtage, minorés par la compétence *Advanced Broker Relations*.

$$R(B, s_{adv}) = \max\Big(0.001,\ B \times (1.0 - 0.05 \cdot s_{adv})\Big)$$

* $s_{adv} \in [0, 5]$ : Chaque niveau offre $5\%$ de réduction sur les frais de modification ($0\% \to 25\%$).

### 1.5 Coût Logistique de Fret (*Transport Cost*)
$$C_{transport} = 
\begin{cases} 
0.0 & \text{si } \text{enable\_transport\_costs} = \text{false} \\
(V_{cargo} \times c_{m^3}) + (J \times c_{jump}) + (P_{gross\_buy} \times c_{collat}) + F_{fixed} & \text{sinon}
\end{cases}$$

* $V_{cargo} = Q \times v_{unit}$ : Volume cargo total en $m^3$.
* $J$ : Nombre de sauts stellaires sur la route.
* $c_{m^3}$ : Coût unitaire par $m^3$ transporté (ISK/$m^3$).
* $c_{jump}$ : Coût forfaitaire par saut stellaire (ISK/saut).
* $c_{collat}$ : Pourcentage d'assurance collatérale (ex. $1\%$).
* $F_{fixed}$ : Frais fixes de prise en charge logistique.

---

## 2. Moteur de Profondeur et Carnet d'Ordres (`PriceLadderEngine`)

**Fichier source :** `src/engine/ladder.ts`  
**Rôle :** Agréger les ordres bruts, simuler l'exécution réelle avec glissement de prix (*slippage*) et calculer le coût/revenu moyen pondéré.

### 2.1 Agrégation des Niveaux de Prix
Soit un ensemble d'ordres $O = \{o_1, o_2, \dots, o_n\}$ où chaque ordre $o_i = (p_i, v_i)$.

1. Les ordres ayant le même prix exact $p$ voient leurs volumes additionnés : $V(p) = \sum_{o_i.p = p} o_i.v$.
2. Les paliers sont triés :
   * **Ordres de Vente (Achat Taker)** : Tri par prix croissant ($p_1 < p_2 < \dots < p_k$).
   * **Ordres d'Achat (Vente Taker)** : Tri par prix décroissant ($p_1 > p_2 > \dots > p_k$).
3. Chaque palier calcule son volume cumulé : $C_j = \sum_{m=1}^j V(p_m)$.

### 2.2 Simulation de Consommation de Profondeur (*Fill Simulation*)
Pour une quantité demandée $Q_{target}$ :

$$\text{Soit } q_m = \min\Big(\max(0, Q_{target} - C_{m-1}),\ V(p_m)\Big) \quad \text{pour le palier } m$$

$$\text{Quantité totale exécutée : } Q_{filled} = \sum_{m=1}^k q_m$$

$$\text{Dépense/Revenu total : } E_{total} = \sum_{m=1}^k (q_m \times p_m)$$

$$\text{Prix effectif moyen pondéré : } P_{eff} = \begin{cases} \frac{E_{total}}{Q_{filled}} & \text{si } Q_{filled} > 0 \\ 0.0 & \text{sinon} \end{cases}$$

### 2.3 Calcul du Slippage (Glissement de Prix)
$$\text{Écart absolu : } \Delta_{slip} = |P_{eff} - P_{top}| \quad \text{où } P_{top} = p_1$$

$$\text{Pourcentage de slippage : } Slippage\% = \begin{cases} \frac{\Delta_{slip}}{P_{top}} \times 100 & \text{si } P_{top} > 0 \\ 0.0 & \text{sinon} \end{cases}$$

---

## 3. Moteur de Quantité Négociable et Contraintes (`TradableQuantityEngine`)

**Fichier source :** `src/engine/quantity.ts`  
**Rôle :** Déterminer la quantité maximale transigeable en résolvant un système à quatre contraintes strictes.

### 3.1 Système Multi-Contraintes
La quantité maximale exécutable $Q^*$ est définie par :

$$Q^* = \min\Big(Q_{capital},\ Q_{cargo},\ Q_{source},\ Q_{dest}\Big)$$

Où :
1. **Contrainte de Capital :**
   $$Q_{capital} = \begin{cases} \Big\lfloor \frac{K_{available}}{P_{buy\_est}} \Big\rfloor & \text{si } K_{available} > 0 \text{ et } P_{buy\_est} > 0 \\ 0 & \text{sinon} \end{cases}$$

2. **Contrainte de Cargo :**
   $$Q_{cargo} = \begin{cases} \Big\lfloor \frac{Cargo_{max\_m^3}}{v_{unit}} \Big\rfloor & \text{si } v_{unit} > 0 \\ \infty & \text{si } v_{unit} = 0 \end{cases}$$

3. **Contrainte de Marché Source :**
   $$Q_{source} = \sum_{l \in \text{SourceSellLevels}} Volume(l)$$

4. **Contrainte de Marché Destination :**
   $$Q_{dest} = \begin{cases} 
   \sum_{l \in \text{DestBuyLevels}} Volume(l) & \text{si stratégie 'immediate'} \\
   \max(10,\ Volume_{7d\_median}) & \text{si stratégie 'relist'}
   \end{cases}$$

### 3.2 Identification Déterministe du Goulot d'Étranglement (*Bottleneck*)
$$\text{Bottleneck} = \begin{cases}
\text{'capital'} & \text{si } Q^* = Q_{capital} \\
\text{'cargo'} & \text{si } Q^* = Q_{cargo} \\
\text{'source\_market'} & \text{si } Q^* = Q_{source} \\
\text{'destination\_market'} & \text{si } Q^* = Q_{dest}
\end{cases}$$

---

## 4. Moteur de Rentabilité et Décomposition Financière (`ProfitEngine`)

**Fichier source :** `src/engine/profit.ts`  
**Rôle :** Fournir le compte de résultat complet d'une opération commerciale selon 4 scénarios d'exécution :
* `taker_taker` : Achat direct $\to$ Vente directe au carnet d'achat.
* `taker_maker` : Achat direct $\to$ Pose d'ordre de vente au prix du marché (*relist*).
* `maker_taker` : Ordre d'achat posé en amont $\to$ Vente directe destination.
* `maker_maker` : Arbitrage passif pur stationnaire.

### 4.1 Formules de Décomposition
1. **Coût d'Achat Brut :** $C_{gross\_buy} = P_{eff\_buy} \times Q$
2. **Frais de Courtage Achat :** $Fee_{buy\_broker} = \begin{cases} C_{gross\_buy} \times B_{buy} & \text{si Maker Buy} \\ 0.0 & \text{si Taker Buy (Défaut)} \end{cases}$
3. **Coût Total d'Acquisition :** $C_{acquisition} = C_{gross\_buy} + Fee_{buy\_broker} + C_{transport}$
4. **Revenu Brut :** $R_{gross} = P_{eff\_sell} \times Q$
5. **Taxe de Vente :** $Tax_{sales} = R_{gross} \times T_{sales}$
6. **Frais de Courtage Vente :** $Fee_{sell\_broker} = \begin{cases} R_{gross} \times B_{sell} & \text{si Relist (Maker)} \\ 0.0 & \text{si Immediate (Taker)} \end{cases}$
7. **Frais de Réémission :** $Fee_{relist} = \Delta P \times Q \times R(B_{sell}, s_{adv})$ *(si ajustement de prix)*
8. **Frais de Sortie Totaux :** $Fee_{exit} = Tax_{sales} + Fee_{sell\_broker} + Fee_{relist}$
9. **Revenu Net :** $R_{net} = R_{gross} - Fee_{exit}$
10. **Profit Net :** $\Pi_{net} = R_{net} - C_{acquisition}$

### 4.2 Ratios Financiers Clés
* **Profit Unitaire :** $\pi_{unit} = \frac{\Pi_{net}}{Q}$
* **Retour sur Investissement (ROI) :** $ROI = \begin{cases} \frac{\Pi_{net}}{C_{acquisition}} & \text{si } C_{acquisition} > 0 \\ 0.0 & \text{sinon} \end{cases}$
* **Marge Nette :** $Margin = \begin{cases} \frac{\Pi_{net}}{R_{gross}} & \text{si } R_{gross} > 0 \\ 0.0 & \text{sinon} \end{cases}$

---

## 5. Moteur d'Évaluation Multicritère & Détection d'Anomalies (`OpportunityScoringEngine`)

**Fichier source :** `src/engine/scoring.ts`  
**Rôle :** Noter objectivement chaque opportunité sur 10 dimensions (0 à 100), détecter les fraudes/scams, et estimer le profit capturable effectif.

### 5.1 Décomposition des 10 Sous-Scores (0 à 100)

| Sous-Score | Formule Mathématique | Échelle / Interprétation |
| :--- | :--- | :--- |
| **Profit Score** | $S_{profit} = \min\Big(100,\ \max\big(0,\ \frac{\log_{10}(\max(1, \Pi_{net}))}{8} \times 100\big)\Big)$ | Échelle log : $1\text{M} \to 75$, $50\text{M} \to 96$, $100\text{M}+ \to 100$ |
| **ROI Score** | $S_{roi} = \min\Big(100,\ \max\big(0,\ \frac{ROI}{0.25} \times 100\big)\Big)$ | Linéaire jusqu'à $25\%$ de ROI ($25\%+ \to 100$) |
| **Volume Score** | $S_{vol} = \min\Big(100,\ \max\big(0,\ \frac{\log_{10}(\max(1, V_{daily}))}{6} \times 100\big)\Big)$ | Échelle log sur le volume journalier de la destination |
| **Turnover Score** | $S_{turnover} = \min\Big(100,\ \max\big(0,\ 100 - \frac{T_{days}}{14} \times 80\big)\Big)$ | Vitesse d'absorption : $<0.5\text{j} \to 100$, $7\text{j} \to 60$, $20\text{j}+ \to 0$ |
| **Liquidity Score** | $S_{liq} = \min\Big(100,\ \max\big(10,\ \frac{V_{dest\_depth}}{\max(1, V_{src\_depth})} \times 60 + S_{vol} \times 0.4\big)\Big)$ | Profondeur relative des carnets et activité journalière |
| **Transport Score** | $S_{trans} = \min\Big(100,\ \max\big(0,\ 100 - 2.2 \times Jumps + (SecBonus - 40)\big)\Big)$ | Pénalité par saut ($2.2\text{ pts}$) + Bonus High-Sec ($+30\text{ pts}$) |
| **Capital Efficiency** | $S_{capeff} = \min\Big(100,\ \max\big(0,\ \frac{\Pi_{daily} / C_{acquisition}}{0.05} \times 100\big)\Big)$ | Rendement journalier du capital immobilisé |
| **Competition Score** | $S_{comp} = \min\Big(100,\ \max\big(20,\ 90 - (V_{depth} > 10^6 ? 30 : 10)\big)\Big)$ | Pression concurrentielle estimée |
| **Stability Score** | $S_{stab} = 80 - \text{Pénalités d'Anomalie}$ | Mesure de la régularité des cours et absence de scam |
| **Capturability** | $S_{cap} = \min\Big(100,\ \frac{\Pi_{capturable}}{\max(1, \Pi_{net})} \times 100\Big)$ | Pourcentage du profit théorique réellement capturable |

### 5.2 Pondération Adaptative selon le Profil du Trader
Le score global pondéré s'adapte à la stratégie du joueur (`trader_profile`) :

| Poids | Équilibré (`balanced`) | High-Sec Daytrader | Gros Porteur (`heavy_hauler`) | Station Trader |
| :--- | :---: | :---: | :---: | :---: |
| $w_{profit}$ | 0.15 | 0.15 | 0.25 | 0.20 |
| $w_{roi}$ | 0.15 | 0.10 | 0.15 | 0.25 |
| $w_{liq}$ | 0.15 | 0.20 | 0.10 | 0.15 |
| $w_{turnover}$ | 0.15 | 0.25 | 0.10 | 0.15 |
| $w_{capeff}$ | 0.15 | 0.05 | 0.15 | 0.25 |
| $w_{transport}$ | 0.10 | 0.05 | 0.20 | 0.00 |
| $w_{stability}$ | 0.15 | 0.20 | 0.05 | 0.00 |

### 5.3 Modèle de Profit Capturable (*Discounted Capturable Profit*)
$$F_{turnover} = \min\Big(1.0,\ \max\big(0.15,\ \frac{1.0}{1.0 + T_{days} \times 0.12}\big)\Big)$$

$$F_{liquidity} = \min\Big(1.0,\ \max\big(0.20,\ \frac{S_{liq}}{100}\big)\Big)$$

$$\Pi_{capturable} = \Pi_{net} \times F_{turnover} \times F_{liquidity}$$

$$\Pi_{daily} = \begin{cases} \frac{\Pi_{capturable}}{T_{days}} & \text{si } T_{days} > 0 \\ \Pi_{capturable} & \text{sinon} \end{cases}$$

### 5.4 Détection des Anomalies et Fraudes de Marché
Une opportunité est signalée `is_anomalous = true` si :
1. **ROI Excessif :** $ROI > 60\%$ (Indicateur classique de manipulation de marché, faux carnet ou piège de citadelle).
2. **Déviation Historique Majeure sur Prix Unitaire :**
   $$P_{unit\_buy} = \frac{C_{acquisition}}{Q}$$
   $$\text{Ratio} = \frac{P_{unit\_buy}}{P_{median\_30d}} \implies \text{Anomalie si } \text{Ratio} > 3.0 \text{ ou } \text{Ratio} < 0.25$$

---

## 6. Moteur de Feature Engineering Temporel (`MarketFeatureEngine`)

**Fichier source :** `src/engine/features.ts`  
**Rôle :** Calculer des descripteurs dynamiques et statistiques à partir des séries d'observations immuables (`MarketObservation[]`) pour caractériser l'évolution temporelle du marché.

### 6.1 Vecteur de Caractéristiques (`MarketFeatureVector`)

1. **Spread Momentum 1h et 24h :**
   $$M_{s, 1h} = Spread_{\%, actuel} - Spread_{\%, -1h}$$
   $$M_{s, 24h} = Spread_{\%, actuel} - Spread_{\%, -24h}$$
   *(Un momentum négatif signale une compression du spread par l'arrivée d'arbitragistes concurrents).*

2. **Volume Acceleration (7j vs 30j) :**
   $$A_v = \frac{V_{daily, 7d\_median}}{V_{daily, 30d\_median}}$$
   *(Un ratio $> 1.0$ indique une accélération de la demande sur l'article).*

3. **Competition Velocity (Ordres / heure) :**
   $$V_{comp} = \frac{Ordres_{sell}(t_{recent}) - Ordres_{sell}(t_{old})}{\Delta t_{heures}}$$

4. **Depth Velocity (Volume $m^3$ ou unités / heure) :**
   $$V_{depth} = \frac{Volume_{visible}(t_{recent}) - Volume_{visible}(t_{old})}{\Delta t_{heures}}$$

5. **Spread Persistence Ratio :**
   $$P_s = \frac{\text{Nombre d'observations avec } Spread > 0\%}{\text{Nombre total d'observations}}$$

6. **Volatility Z-Score :**
   $$Z_v = \frac{Spread_{\%}}{\max(0.01,\ \sigma_{price\_volatility})}$$

---

## 7. Moteur de Prédiction Statistique & Confiance (`PredictionEngine`)

**Fichier source :** `src/engine/prediction.ts`  
**Rôle :** Estimer la probabilité de survie du spread et la réalisation effective du profit, en découplant rigoureusement l'attractivité économique de la certitude statistique.

### 7.1 Probabilité de Survie du Spread ($P_{survival}$)
Débute à $95\%$ en exécution immédiate et $82\%$ en réémission :

$$P_{survival} = P_{base} - \min(35,\ T_{days} \times 2.5) + \delta_{momentum} + \delta_{competition} + \delta_{route} + \delta_{persistence}$$

* **Pénalité de rotation :** $-2.5\%$ par jour de rotation estimé.
* **Momentum :** $+5\%$ si $M_{s, 24h} > 2.0\%$, $-10\%$ si $M_{s, 24h} < -3.0\%$.
* **Compétition :** $-8\%$ si $V_{comp} > 2.0\text{ ordres/h}$.
* **Sécurité :** $-15\%$ si route LowSec/NullSec, $-5\%$ si $> 15$ sauts.
* **Persistance :** $+5\%$ si $P_s \ge 90\%$, $-12\%$ si $P_s < 50\%$.
* **Bornage strict :** $P_{survival} \in [5\%,\ 98\%]$.

### 7.2 Probabilité de Réalisation du Profit ($P_{realization}$)
$$P_{realization} = \min\Big(95\%,\ \max\big(5\%,\ P_{survival} \times 0.92 + \delta_{strat} - \delta_{anomalie}\big)\Big)$$

* **Stratégie immédiate :** $+6\%$ (aucun risque de relisting).
* **Part de marché élevée :** $-10\%$ si $TurnoverRatio > 0.50$.
* **Anomalie :** $-20\%$ si anomalie de prix détectée.

### 7.3 Espérance Mathématique du Profit Réalisé
$$\mathbb{E}[\Pi_{realized}] = \Pi_{capturable} \times \frac{P_{realization}}{100}$$

### 7.4 Indice de Confiance Statistique (0 à 100%)
$$Conf = \Big(50 + \text{Bonus}_{obs} + \text{Bonus}_{ESI\_30d} + \text{Bonus}_{Jita} - \text{Malus}_{volatilité}\Big) \times Q_{data}$$

* $\text{Bonus}_{obs} = +20\%$ si $\ge 10$ observations, $+10\%$ si $\ge 3$.
* $\text{Bonus}_{ESI\_30d} = +15\%$ si série chronologique 30j présente.
* $\text{Bonus}_{Jita} = +10\%$ si validé par benchmark Jita IV-4 (sinon $-10\%$).
* $\text{Malus}_{volatilité} = -15\%$ si volatilité $> 25\%$.
* $Q_{data} \in [0.2,\ 1.0]$ : Score de qualité et fraîcheur des données ESI.

### 7.5 Niveaux de Risque
* **`low`** : $P_{survival} \ge 80\%$, $Conf \ge 75\%$, High-Sec exclusif, non-anomalous.
* **`moderate`** : Cas nominal avec liquidité vérifiée.
* **`elevated`** : $P_{survival} < 65\%$ ou $Conf < 50\%$.
* **`speculative`** : $P_{survival} < 50\%$, LowSec/NullSec, ou $ROI > 60\%$.

---

## 8. Moteur d'Arbitrage Inter-Régional Spatialisé (`InterRegionalFinancialEngine`)

**Fichier source :** `src/engine/interRegional.ts`  
**Rôle :** Orchestrer la découverte des opportunités dirigées ($Hub_A \to Hub_B$), en garantissant l'accessibilité spatiale des stations.

### 8.1 Filtrage Spatial Strict (`filterAccessibleOrdersForHub`)
* **Ordres de Vente Source (Achat par le Trader) :**
  $$\text{Condition : } o.location\_id == hub.station\_id$$
  *(Évite d'acheter des marchandises bloquées dans une station PNJ tierce à 15 sauts du Hub).*
* **Ordres d'Achat Destination (Vente Immédiate Taker) :**
  * Si `range == 'station'` : $o.location\_id == hub.station\_id$.
  * Si `range == 'solarsystem'` : $o.system\_id == hub.system\_id$.
  * Si `range == 'region'` : Tout ordre de la région d'arrivée est accessible.
  * Si `range` numérique $N$ : $Jumps(o.system\_id, hub.system\_id) \le N$.
* **Ordres de Vente Destination (Compétition Relist) :**
  $$\text{Condition : } o.location\_id == hub.station\_id$$

---

## 9. Moteur d'Optimisation de Portefeuille (`PortfolioOptimizer`)

**Fichier source :** `src/engine/portfolio.ts`  
**Rôle :** Allouer rationnellement le capital disponible sur un panier d'opportunités en respectant des contraintes de concentration et de diversification.

### 9.1 Algorithme d'Allocation Glouton
1. Filtrer les opportunités viables ($\Pi_{net} > 0$ et $is\_viable = true$).
2. Trier par $S_{overall}$ décroissant.
3. Pour chaque opportunité $opp_k$ :
   * Calculer le capital résiduel par type : $Cap_{type\_left} = (K_{total} \times \alpha_{type}) - Cap_{type\_used}$.
   * Calculer le capital résiduel par groupe : $Cap_{group\_left} = (K_{total} \times \beta_{group}) - Cap_{group\_used}$.
   * Allouer :
     $$K_{alloc} = \min\Big(K_{remaining},\ MaxPerTrade,\ Cap_{type\_left},\ Cap_{group\_left},\ opp_k.costs.C_{acquisition}\Big)$$
   * Si $K_{alloc} > 100\,000\text{ ISK}$, créer la position et déduire le capital.

### 9.2 Diversification et ROI Pondéré du Portefeuille
$$ROI_{portfolio} = \frac{\sum_{pos} \Pi_{expected}(pos)}{\sum_{pos} K_{allocated}(pos)}$$

---

## 10. Moteur de Conseil et Recommandation d'Ordres (`OrderAdvisorService`)

**Fichier source :** `src/services/orderAdvisor.ts`  
**Rôle :** Analyser en continu les ordres actifs du joueur et recommander l'action optimale (`keep`, `lower_price`, `relocate`, `cancel`).

### 10.1 Arbre de Décision Déterministe

```
                       [Ordre de Vente Joueur]
                                  │
                  Le volume local est-il mort ?
                  (V_daily <= 0.2 et concurrence)
                                  ├── OUI ──> [ACTION: CANCEL (Marché Inactif)]
                                  │
                                  └── NON
                                       │
            Existe-t-il un Hub à proximité offrant un gain net
            supérieur à +3M ISK après déduction des frais de saut ?
                                       ├── OUI ──> [ACTION: RELOCATE (Arbitrage de Hub)]
                                       │
                                       └── NON
                                            │
                             L'ordre est-il dépassé en prix ?
                             (P_joueur > P_lowest_local)
                                            ├── NON ──> [ACTION: KEEP (1er Vendeur)]
                                            │
                                            └── OUI
                                                 │
                                 S'aligner à (P_lowest - 0.01)
                                 préserve-t-il un ROI >= 4% ?
                                                 ├── OUI ──> [ACTION: LOWER_PRICE]
                                                 └── NON ──> [ACTION: CANCEL (Guerre des Prix)]
```

---

## 11. Moteur Analytique P&L et Historique Réalisé (`TraderAnalyticsService`)

**Fichier source :** `src/services/traderAnalytics.ts`  
**Rôle :** Reconstituer les cycles complets d'achat/revente selon la méthode comptable **FIFO** (*First-In, First-Out*) avec coût moyen pondéré.

### 11.1 Algorithme d'Appariement Chronologique FIFO
1. Récupérer toutes les transactions du joueur via ESI et les trier chronologiquement : $t_1 \le t_2 \le \dots \le t_N$.
2. Pour chaque transaction d'achat ($tx_{buy}$) : empiler le lot dans l'inventaire $\{date, quantity, price\}$.
3. Pour chaque transaction de vente ($tx_{sell}$) :
   * Consommer les lots les plus anciens jusqu'à épuisement de la quantité vendue.
   * Calculer le coût d'acquisition effectif : $C_{buy\_matched} = \sum (q_i \times p_i)$.
   * Calculer le revenu de vente : $R_{sell} = q_{matched} \times p_{sell}$.
   * Calculer les frais payés : $Fees = (C_{buy\_matched} \times B) + (R_{sell} \times B) + (R_{sell} \times T_{sales})$.
   * Enregistrer le cycle :
     $$\Pi_{cycle} = R_{sell} - C_{buy\_matched} - Fees$$
     $$HoldDays = \frac{Date(tx_{sell}) - Date_{pondérée}(tx_{buy})}{86\,400\,000\text{ ms}}$$

### 11.2 Boucle de Rétroaction Personnalisée (*Personal Calibration Fit*)
* **Spécialité Prouvée :** Flips réussis avec gain $>10\text{M ISK}$ $\implies$ Bonus de confiance $+18\%$.
* **Perte Historique :** Perte nette constatée par le passé $\implies$ Pénalité de confiance $-15\%$.

---

## 12. Gestion d'Intégrité du Catalogue de Types (`TypeCatalogService`)

**Fichier source :** `src/services/typeCatalog.ts`  
**Rôle :** Garantir le chargement, la validation structurelle et la vérification cryptographique de l'intégralité des types de marché EVE Online (15 801+ articles).

### 12.1 États et Métadonnées Formelles (`TypeCatalogMetadata`)
* **`CATALOG_LOADED`** : Fichier JSON complet validé avec succès, intégrité et types conformes.
* **`CATALOG_FALLBACK_CORE`** : Utilisation du catalogue de secours validé en cas de fichier absent ou vide.
* **`CATALOG_CORRUPTED`** : Fichier présent mais corrompu (signalement explicite "Fail-Loud").
* **`CATALOG_UNAVAILABLE`** : Échec d'accès disque et indisponibilité du catalogue.

### 12.2 Empreinte Cryptographique SHA-256
Chaque chargement calcule un hachage SHA-256 complet sur le contenu brut pour assurer la traçabilité des versions et la détection de modifications impromptues.

---

## 13. Entrepôt de Données et Observations Immuables (`IndexedDbStore`)

**Fichier source :** `src/services/indexedDbStore.ts`  
**Rôle :** Assurer la persistance durable côté client des carnets, des séries chronologiques, des observations de marché, des transactions ESI et des enregistrements de suivi d'exécution selon 11 magasins d'objets (Schéma v5) :

1. `snapshots` : Derniers snapshots d'ordres par paire `type_id:region_id`.
2. `history` : Statistiques historiques calculées.
3. `universe_opportunities` : Cache des opportunités détectées lors des scans globaux.
4. `http_cache` : Cache HTTP avec gestion des ETags et des dates d'expiration ESI.
5. `market_observations` : Entrepôt immuable *Append-Only* des captures de carnet (avec hachage de déduplication).
6. `opportunity_observations` : Traçabilité des opportunités à $T_0$ pour le suivi des résultats (*Outcome Tracking* à 1h, 6h, 24h, 3j, 7j) et preuves 4 piliers.
7. `market_history_daily` : Séries chronologiques brutes ESI quotidiennes.
8. `eve_types` : Cache permanent des types résolus d'EVE Online.
9. `catalog_metadata` : Métadonnées d'intégrité et empreinte cryptographique SHA-256 du catalogue.
10. `character_transactions` : Historique des transactions portefeuille ESI normalisées et immuables.
11. `character_executions` : Suivi d'exécution corrélé entre transactions réelles et opportunités recommandées.

---

## 14. Moteur de Preuve Cryptographique & Certification 4 Piliers (`OpportunityEvidenceEngine`)

**Fichier source :** `src/engine/evidence.ts`  
**Rôle :** Forger un instantané cryptographique immuable pour chaque opportunité d'arbitrage générée, garantissant son auditabilité et sa non-altération dans le temps.

### 14.1 Protocole de Certification `4-pillars-v1`
Chaque opportunité est validée selon 4 piliers indépendants :
1. **Pilier 1 : Market Data**
   * Empreintes SHA-256 des carnets source et destination (`source_market_hash`, `dest_market_hash`).
   * Âge maximal toléré : $\le 300\text{ s}$ (mode Live) ou $\le 900\text{ s}$ (mode Cache).
   * Statuts acceptés : `HEALTHY` ou `STALE`.
2. **Pilier 2 : Catalog**
   * Empreinte SHA-256 du catalogue de référence.
   * Statut de résolution : `RESOLVED_CATALOG` ou `RESOLVED_DYNAMIC`.
   * Volume physique $m^3$ strictement positif et non altéré.
3. **Pilier 3 : Universe**
   * Validation topologique des stations et structures (`source_station_id`, `dest_station_id`).
   * Vérification de l'existence et de la cohérence de la route de saut stellaire (`JumpRoute`).
4. **Pilier 4 : Financial Engine**
   * Déterminisme des calculs financiers ($\Pi_{net} > 0$, $ROI > 0$).
   * Résolution explicite du goulot d'étranglement (`capital`, `cargo`, `source_market`, `destination_market`).
   * Prise en compte exacte du slippage de profondeur et des taxes.

### 14.2 Canonicalisation & Hachage SHA-256
$$\text{evidence\_hash} = \text{SHA-256}\Big(\text{CanonicalJSON}\big(\text{Evidence} \setminus \{\text{evidence\_hash}\}\big)\Big)$$

* **Tri lexicographique** des clés à tous les niveaux d'imbrication.
* **Normalisation des flottants** à 6 décimales pour éliminer toute disparité d'arrondi binaire.
* **Vérification d'intégrité :** `OpportunityEvidenceEngine.verifyEvidence(evidence)` recalcule l'empreinte et vérifie l'absence d'altération en temps réel.

---

## 15. Sémantique de Défaillance & Santé des Données (`FailureSemantics`)

**Fichier source :** `src/engine/failureSemantics.ts`  
**Rôle :** Définir formellement les états de santé et de complétude des données selon le principe absolu **"Fail-Loud"** (`NO DATA ≠ ZERO DATA`).

### 15.1 Hiérarchie des États de Santé (`DataHealthState`)
$$\text{ERROR} \succ \text{UNKNOWN} \succ \text{PARTIAL} \succ \text{STALE} \succ \text{CACHE} \succ \text{LIVE}$$

* **`LIVE`** : Donnée fraîche directe ESI ($age \le 300\text{ s}$).
* **`CACHE`** : Donnée en cache valide ($age \le 900\text{ s}$).
* **`STALE`** : Donnée historique ou expirée ($age \le 86\,400\text{ s}$).
* **`PARTIAL`** : Donnée incomplète (ex: transaction isolée sans lot d'acquisition, carnet tronqué).
* **`UNKNOWN`** : Donnée non encore synchronisée ou indisponible.
* **`ERROR`** : Défaillance réseau, désérialisation invalide ou corruption.

---

## 16. Normalisation des Transactions Portefeuille (`CharacterTransactionEngine`)

**Fichier source :** `src/engine/characterTransaction.ts`  
**Rôle :** Valider, nettoyer et normaliser les transactions financières brutes issues de CCP ESI (`/characters/{id}/wallet/transactions/`).

### 16.1 Validation Pure (`validateRawCharacterTransaction`)
* Enregistrement rejeté immédiatement si l'un des champs critiques (`transaction_id`, `character_id`, `type_id`, `location_id`, `quantity`, `unit_price`) est `null`, `undefined`, `NaN`, non fini ou négatif.
* Contrôle strict d'intégrité entière via `Number.isSafeInteger` sur tous les IDs et quantités.
* Rejet catégorique des identifiants synthétiques (`transaction_id = 0`).

### 16.2 Normalisation & Invariants
* Exigence stricte d'un horodatage d'ingestion explicite (`ingestedAt`) fourni par l'orchestrateur (aucun appel `Date.now()` dans le moteur pur).
* Préservation des timestamps ISO-8601 UTC d'origine.
* Objet retourné sous forme immuable `Readonly<PersistedCharacterTransaction>`.
* Fusion idempotente (`mergePersistedCharacterTransactions`) préservant `first_seen_at` et mettant à jour `last_seen_at`.

---

## 17. Moteur de Corrélation d'Exécution (`ExecutionCorrelationEngine`)

**Fichier source :** `src/engine/executionCorrelation.ts`  
**Rôle :** Associer de manière déterministe les transactions réelles du joueur aux opportunités d'arbitrage observées à $T_0$.

### 17.1 Évaluation Multicritère sur 5 Piliers
1. **Identité d'Article :** $tx.type\_id == opp.type\_id$.
2. **Localisation Spatiale :**
   * Achat : $tx.location\_id == opp.source\_station\_id$ ou même système.
   * Vente : $tx.location\_id == opp.dest\_station\_id$ ou même région.
3. **Fenêtre Temporelle :** $tx.timestamp \ge opp.detected\_at$ et $(tx.timestamp - opp.detected\_at) \le \Delta T_{max}$ (défaut 72h).
4. **Alignement de Prix :**
   $$|tx.unit\_price - P_{expected}| \le P_{expected} \times \text{Tolerance}_{\%}$$
5. **Cohérence de Quantité :** $tx.quantity \le opp.tradable\_quantity \times 1.5$.

### 17.2 Niveaux d'Appariement Déterministes
* **`DIRECT_MATCH`** : Station exacte, prix $\le 5\%$, fenêtre $\le 24\text{h}$.
* **`STRONG_MATCH`** : Station ou système exact, prix $\le 10\%$, fenêtre $\le 48\text{h}$.
* **`PROBABLE_MATCH`** : Région conforme, prix $\le 15\%$, fenêtre $\le 72\text{h}$.
* **`AMBIGUOUS`** : Multiples opportunités concurrentes candidates (aucun choix arbitraire).
* **`UNMATCHED`** : Transaction orpheline sans opportunité candidate correspondante.

---

## 18. Moteur de Suivi du Cycle de Vie & Calcul VWAP (`ExecutionOutcomeEngine`)

**Fichier source :** `src/engine/executionOutcome.ts`  
**Rôle :** Calculer la rentabilité réelle et le statut d'achèvement d'une position exécutée.

### 18.1 Algorithme d'Appariement FIFO des Transactions Attribuées
Pour une opportunité corrélée donnée, les transactions d'achat ($tx_{buy}$) et de vente ($tx_{sell}$) sont ordonnées chronologiquement :
1. Calcul du **Volume Weighted Average Price (VWAP)** d'achat et de vente :
   $$VWAP_{buy} = \frac{\sum (q_{buy, i} \times p_{buy, i})}{\sum q_{buy, i}}, \quad VWAP_{sell} = \frac{\sum (q_{sell, j} \times p_{sell, j})}{\sum q_{sell, j}}$$
2. Calcul du P&L Réalisé Net :
   $$\Pi_{realized} = Revenue_{net} - Cost_{gross} - Fees_{paid}$$
3. Détection des Fuites & Ventes à Découvert :
   * Si $\sum q_{sell} > \sum q_{buy}$, l'enregistrement est marqué `has_inventory_inconsistency = true` et `data_state = PARTIAL`.

### 18.2 Statuts du Cycle de Vie d'Exécution
* **`NOT_STARTED`** : Aucune transaction enregistrée.
* **`BUY_PARTIAL`** : Achat partiel en cours ($0 < q_{buy} < q_{target}$).
* **`BOUGHT`** : Achat cible complété ($q_{buy} \ge q_{target}$), en attente de revente.
* **`SELL_PARTIAL`** : Revente partielle en cours ($0 < q_{sell} < q_{buy}$).
* **`CLOSED`** : Position liquidée intégralement ($q_{sell} \ge q_{buy}$).
* **`AMBIGUOUS`** : Transactions présentant des conflits de correspondance.

---

## 19. Suivi Empirique des Résultats de Marché (`MarketOutcomeTracker`)

**Fichier source :** `src/services/marketOutcomeTracker.ts`  
**Rôle :** Confronter périodiquement les opportunités $T_0$ aux carnets réels observés sur 5 horizons temporels (`1h`, `6h`, `24h`, `3d`, `7d`).

### 19.1 Métriques Rétrospectives
* **Spread Résiduel Réel :** Différentiel brut et net constaté au moment du contrôle.
* **Érosion du Spread (*Spread Decay*) :**
  $$Decay_{\%} = 1.0 - \frac{Spread_{T+H}}{Spread_{T0}}$$
* **Volume Absorbé :** Évolution des volumes consommés en tête de carnet.
* **Statut de Résultat :**
  * `SURVIVED` : Spread préservé à $\ge 50\%$.
  * `DECAYED` : Spread positif mais érodé à $< 50\%$.
  * `INVERTED` : Spread devenu négatif (marché inversé).
  * `EXHAUSTED` : Volume de carnet complètement épuisé.

---

## 20. Ingestion ESI & Traçabilité Opérationnelle

**Fichiers sources :** `src/services/characterTransactionSyncService.ts`, `src/services/executionTrackingService.ts`  
**Rôle :** Orchestrer l'ingestion résiliente des transactions de portefeuille ESI et la corrélation multi-personnages.

* **Pagination ascendante/descendante :** Utilisation de l'ancre `from_id` avec arrêt automatique dès le raccordement sur les IDs locaux déjà enregistrés.
* **Résilience Réseau & Rate Limiting :**
  * Détection proactive de l'expiration du token SSO (marge 2 minutes).
  * Traitement des erreurs `429` (en-tête `Retry-After`) et `420` (`X-Esi-Error-Limit-Reset`).
* **Commit Persistant Prioritaire :** Enregistrement atomique dans `IndexedDbStore` avant mise à jour de l'état réactif mémoire.

---

## 21. Moteur Financier des Résultats Réalisés (`RealizedFinancialOutcomeEngine`)

**Fichiers sources :** `src/engine/realizedFinancialOutcome.ts`, `src/services/traderAnalytics.ts`  
**Rôle :** Source unique de vérité comptable pour le calcul des profits et pertes réalisés, du coût de revient FIFO causal, de la décomposition des taxes et du courtage, et de la complétude financière.

### 21.1 Principes Fondamentaux (Chantier 3B-4A.1 & 3B-4A.2)
1. **FIFO Causal Temporel :**
   * L'ordre chronologique strict `timestamp ASC, transaction_id ASC` régit l'attribution des stocks d'achat aux ventes.
   * Interdiction absolue de consommer un achat futur pour couvrir une vente passée.
2. **Non-fabrication de Coût :**
   * Pour toute vente non couverte ou partiellement couverte par des achats antérieurs, aucun coût artificiel à `0.00 ISK` n'est fabriqué. La quantité excédentaire est marquée explicitement comme `unmatched_sell_quantity`.
3. **Taxonomie de Complétude Financière (`FinancialCompleteness`) :**
   * `OBSERVED` : Tous les flux (achat, vente, courtage, taxes) sont directement constatés à partir de transactions ou entrées de journal ESI.
   * `ESTIMATED` : Les frais ont été déduits à partir des compétences du personnage (ex. rôle MAKER sur station) mais ne constituent pas des faits bruts d'observation.
   * `PARTIAL` : L'exécution ou le stock est incomplet (ventes sans achat antérieur suffisant).
   * `UNAVAILABLE` : Données de configuration ou de marché insuffisantes (`NO DATA ≠ ZERO DATA`).
4. **Convergence Complète des Consommateurs UI :**
   * `TraderAnalyticsService` délègue l'intégralité du calcul FIFO et P&L à `RealizedFinancialOutcomeEngine.calculateForTransactions`.
   * `MyOrdersView` et `TraderPerformanceModal` affichent le statut de complétude, la décomposition brute/frais/nette et les avertissements d'intégrité comptable sans fabrication de données.

---

## 🧪 Validation & Couverture des Tests

L'intégralité des moteurs, services et modèles de données est couverte par les suites de tests unitaires automatisées dans `src/engine/__tests__/` (100% de réussite) :

1. `engine.test.ts` : Taxes, courtage, slippage, arbitrage inter-hubs, goulots d'étranglement et features temporelles.
2. `security_and_advisory.test.ts` : Conseiller d'ordres, arbre de décision, sécurité des tokens EVE SSO et verrouillage mutex.
3. `character_transaction.test.ts` : Validation pure, normalisation, déduplication et fusion idempotente des transactions.
4. `character_transaction_sync.test.ts` : Ingestion résiliente, pagination `from_id`, rate-limiting HTTP 429/420 et commit IndexedDB.
5. `execution_tracking_service.test.ts` : Corrélation d'exécution, isolation multi-personnages, rejeux déterministes et audit.
6. `evidence_and_tracking.test.ts` : Certification 4 piliers, hachage SHA-256, détection d'altération et suivi d'outcomes.
7. `failure_semantics.test.ts` : Modèle de santé des données, transitions d'état et principe "Fail-Loud".
8. `market_outcome_tracker.test.ts` : Planificateur multi-horizons, évaluation empirique du spread et immuabilité $T_0$.


