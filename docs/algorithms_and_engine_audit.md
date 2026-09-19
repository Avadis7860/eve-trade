# 🔬 Audit Complet et Traçabilité Algorithmique des Moteurs EVE Trade

Ce document fournit un audit mathématique et fonctionnel exhaustif de tous les moteurs de calcul, algorithmes financiers et services analytiques intégrés dans **EVE Trade**.

Chaque formule est documentée avec ses paramètres d'entrée, ses domaines de validité, ses constantes CCP officielles, ses cas limites (*edge cases*) et sa traçabilité dans le code source.

---

## 📑 Sommaire des Moteurs Audités

1. [Moteur de Frais et Taxes (`FeeEngine`)](#1-moteur-de-frais-et-taxes-feeengine)
2. [Moteur de Profondeur et Carnet d'Ordres (`PriceLadderEngine`)](#2-moteur-de-profondeur-et-carnet-dordres-priceladderengine)
3. [Moteur de Quantité Négociable et Contraintes (`TradableQuantityEngine`)](#3-moteur-de-quantité-négociable-et-contraintes-tradablequantityengine)
4. [Moteur de Rentabilité et Décomposition Financière (`ProfitEngine`)](#4-moteur-de-rentabilité-et-décomposition-financière-profitengine)
5. [Moteur d'Évaluation Multicritère & Détection d'Anomalies (`OpportunityScoringEngine`)](#5-moteur-dévaluation-multicritère--détection-danomalies-opportunityscoringengine)
6. [Moteur d'Arbitrage Inter-Régional Spatialisé (`InterRegionalFinancialEngine`)](#6-moteur-darbitrage-inter-régional-spatialisé-interregionalfinancialengine)
7. [Moteur d'Optimisation de Portefeuille (`PortfolioOptimizer`)](#7-moteur-doptimisation-de-portefeuille-portfoliooptimizer)
8. [Moteur de Conseil et Recommandation d'Ordres (`OrderAdvisorService`)](#8-moteur-de-conseil-et-recommandation-dordres-orderadvisorservice)
9. [Moteur Analytique P&L et Historique Réalisé (`TraderAnalyticsService`)](#9-moteur-analytique-pl-et-historique-réalisé-traderanalyticsservice)

---

## 1. Moteur de Frais et Taxes (`FeeEngine`)

**Fichier source :** `src/engine/fee.ts`  
**Rôle :** Calculer avec exactitude toutes les frictions financières imposées par CCP Games (Taxes, Courtage PNJ, Frais de Structure Citadelle, Frais de Réémission, Coûts Logistiques).

### 1.1 Taxe de Vente CCP (*Sales Tax*)
La taxe de vente s'applique sur la valeur brute de chaque vente d'objet.

$$T_{sales}(s_{acc}) = \max\Big(0.01,\ 0.08 \times (1.0 - 0.11 \times s_{acc})\Big)$$

* **Paramètre :** $s_{acc} \in [0, 5] \cap \mathbb{Z}$ (Niveau de la compétence *Accounting*).
* **Barème officiel :**
  * Niveau 0 : $8.00\%$
  * Niveau 1 : $7.12\%$
  * Niveau 2 : $6.24\%$
  * Niveau 3 : $5.36\%$
  * Niveau 4 : $4.48\%$
  * Niveau 5 : $3.60\%$
* **Garde-fou :** La taxe minimale est plafonnée à $1.0\%$ par précaution.

### 1.2 Frais de Courtage Station PNJ (*NPC Broker Fee*)
S'applique lors de la pose d'un ordre d'achat ou de vente au marché (*Maker*).

$$B_{npc}(s_{br}, F, C) = \max\Big(0.01,\ \min\big(0.08,\ 0.03 - 0.003 \cdot s_{br} - 0.0003 \cdot F - 0.0002 \cdot C\big)\Big)$$

* **Paramètres :**
  * $s_{br} \in [0, 5] \cap \mathbb{Z}$ : Niveau de compétence *Broker Relations*.
  * $F \in [-10.0, 10.0]$ : Réputation auprès de la Faction propriétaire de la station.
  * $C \in [-10.0, 10.0]$ : Réputation auprès de la Corporation propriétaire de la station.
* **Valeurs extrêmes :**
  * Base sans compétences ($s_{br}=0, F=0, C=0$) : $3.00\%$
  * Compétence max sans standing ($s_{br}=5, F=0, C=0$) : $1.50\%$
  * Compétence et standings parfaits ($s_{br}=5, F=10, C=10$) : $1.00\%$ (plancher strict CCP).

### 1.3 Frais de Courtage en Structure Joueur (*Citadel / Upwell Structure*)
$$B_{citadel} = \max\Big(0.005,\ B_{base} + S_{SCC}\Big)$$

* $B_{base}$ : Taux fixé par le propriétaire de la citadelle (généralement $0.5\% \sim 1.0\%$).
* $S_{SCC} = 0.50\%$ ($0.005$) : Surtaxe réglementaire obligatoire perçue par le SCC (*Secure Commerce Commission*).

### 1.4 Frais de Réémission (*Relist Fee*)
Lorsqu'un ordre existant est modifié en prix, des frais s'appliquent sur la base du taux de courtage, minorés par la compétence *Advanced Broker Relations*.

$$R(B, s_{adv}) = \max\Big(0.001,\ B \times (1.0 - 0.05 \cdot s_{adv})\Big)$$

* $s_{adv} \in [0, 5]$ : Chaque niveau offre $5\%$ de réduction sur les frais de modification ($0\% \to 25\%$).

### 1.5 Coût Logistique de Fret (*Transport Cost*)
$$C_{transport} = 
\begin{cases} 
0.0 & \text{si } \text{enable\_transport\_costs} = \text{false} \\
(V_{cargo} \times c_{m^3}) + (J \times c_{jump}) + (P_{gross\_buy} \times c_{collat}) & \text{sinon}
\end{cases}$$

* $V_{cargo} = Q \times v_{unit}$ : Volume cargo total en $m^3$.
* $J$ : Nombre de sauts stellaires sur la route la plus sûre.
* $c_{m^3}$ : Coût unitaire par $m^3$ transporté (ISK/$m^3$).
* $c_{jump}$ : Coût forfaitaire par saut stellaire (ISK/saut).
* $c_{collat}$ : Pourcentage d'assurance collatérale (ex. $1\%$).

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
   $$Q_{capital} = \begin{cases} \Big\lfloor \frac{K_{available}}{P_{buy\_est} + (v_{unit} \cdot c_{m^3})} \Big\rfloor & \text{si } K_{available} > 0 \text{ et } P_{buy\_est} > 0 \\ 0 & \text{sinon} \end{cases}$$
   *(avec $K_{available} = \min(Capital_{total}, MaxCapitalPerTrade)$)*

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
**Rôle :** Fournir le compte de résultat complet d'une opération commerciale.

```
+-------------------------------------------------------------------------+
|                              REVENU BRUT                                |
|                   Gross Revenue = Q * P_eff_sell                        |
+------------------------------------+------------------------------------+
                                     |
                - Frais de Sortie (Sales Tax + Relist Broker Fee)
                                     |
                                     v
+-------------------------------------------------------------------------+
|                              REVENU NET                                 |
|                 Net Revenue = Gross Revenue - Exit Fees                 |
+------------------------------------+------------------------------------+
                                     |
                - Coût Total d'Acquisition (Purchase + Buy Fee + Freight)
                                     |
                                     v
+-------------------------------------------------------------------------+
|                              PROFIT NET                                 |
|             Net Profit = Net Revenue - Total Acquisition Cost           |
+-------------------------------------------------------------------------+
```

### 4.1 Formules de Décomposition
1. **Coût d'Achat Brut :** $C_{gross\_buy} = P_{eff\_buy} \times Q$
2. **Frais de Courtage Achat :** $Fee_{buy\_broker} = \begin{cases} C_{gross\_buy} \times B_{buy} & \text{si Maker Buy} \\ 0.0 & \text{si Taker Buy (Défaut)} \end{cases}$
3. **Coût Total d'Acquisition :** $C_{acquisition} = C_{gross\_buy} + Fee_{buy\_broker} + C_{transport}$
4. **Revenu Brut :** $R_{gross} = P_{eff\_sell} \times Q$
5. **Taxe de Vente :** $Tax_{sales} = R_{gross} \times T_{sales}$
6. **Frais de Courtage Vente :** $Fee_{sell\_broker} = \begin{cases} R_{gross} \times B_{sell} & \text{si Relist (Maker)} \\ 0.0 & \text{si Immediate (Taker)} \end{cases}$
7. **Frais de Sortie Totaux :** $Fee_{exit} = Tax_{sales} + Fee_{sell\_broker}$
8. **Revenu Net :** $R_{net} = R_{gross} - Fee_{exit}$
9. **Profit Net :** $\Pi_{net} = R_{net} - C_{acquisition}$

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
| **Stability Score** | $S_{stab} = 80 - \text{Pénalités d'Anomalie}$ | Mesure de la régularité des prix et absence de scam |
| **Capturability** | $S_{cap} = \min\Big(100,\ \frac{\Pi_{capturable}}{\max(1, \Pi_{net})} \times 100\Big)$ | Pourcentage du profit théorique réellement capturable |

### 5.2 Formule du Score Global Pondéré
$$S_{overall} = \text{round}\Big(0.15 \cdot S_{profit} + 0.15 \cdot S_{roi} + 0.15 \cdot S_{liq} + 0.15 \cdot S_{turnover} + 0.15 \cdot S_{capeff} + 0.10 \cdot S_{trans} + 0.15 \cdot S_{stab}\Big)$$

### 5.3 Modèle de Profit Capturable (*Discounted Capturable Profit*)
Le profit théorique sur papier est minoré par les coefficients de friction de liquidité et de rotation :

$$F_{turnover} = \min\Big(1.0,\ \max\big(0.15,\ \frac{1.0}{1.0 + T_{days} \times 0.12}\big)\Big)$$

$$F_{liquidity} = \min\Big(1.0,\ \max\big(0.20,\ \frac{S_{liq}}{100}\big)\Big)$$

$$\Pi_{capturable} = \Pi_{net} \times F_{turnover} \times F_{liquidity}$$

$$\Pi_{daily} = \begin{cases} \frac{\Pi_{capturable}}{T_{days}} & \text{si } T_{days} > 0 \\ \Pi_{capturable} & \text{sinon} \end{cases}$$

### 5.4 Détection des Anomalies et Fraudes de Marché
Une opportunité est signalée `is_anomalous = true` si :
1. **ROI Excessif :** $ROI > 60\%$ (Indicateur classique de faux carnet / manipulation de marché / scam).
2. **Déviation Historique Majeure :** $\frac{P_{spot}}{P_{median\_30d}} > 3.0$ ou $< 0.25$.

---

## 6. Moteur d'Arbitrage Inter-Régional Spatialisé (`InterRegionalFinancialEngine`)

**Fichier source :** `src/engine/interRegional.ts`  
**Rôle :** Orchestrer la découverte des opportunités dirigées ($Hub_A \to Hub_B$), en garantissant l'accessibilité spatiale des stations.

### 6.1 Filtrage Spatial Strict (`filterAccessibleOrdersForHub`)
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

## 7. Moteur d'Optimisation de Portefeuille (`PortfolioOptimizer`)

**Fichier source :** `src/engine/portfolio.ts`  
**Rôle :** Allouer rationnellement le capital disponible sur un panier d'opportunités en respectant des contraintes de concentration et de diversification.

### 7.1 Algorithme d'Allocation Glouton
1. Filtrer les opportunités viables ($\Pi_{net} > 0$ et $is\_viable = true$).
2. Trier par $S_{overall}$ décroissant.
3. Pour chaque opportunité $opp_k$ :
   * Calculer le capital résiduel par type : $Cap_{type\_left} = (K_{total} \times \alpha_{type}) - Cap_{type\_used}$.
   * Calculer le capital résiduel par groupe : $Cap_{group\_left} = (K_{total} \times \beta_{group}) - Cap_{group\_used}$.
   * Allouer :
     $$K_{alloc} = \min\Big(K_{remaining},\ MaxPerTrade,\ Cap_{type\_left},\ Cap_{group\_left},\ opp_k.costs.C_{acquisition}\Big)$$
   * Si $K_{alloc} > 100\,000\text{ ISK}$, créer la position et déduire le capital.

### 7.2 Diversification et ROI Pondéré du Portefeuille
$$ROI_{portfolio} = \frac{\sum_{pos} \Pi_{expected}(pos)}{\sum_{pos} K_{allocated}(pos)}$$

---

## 8. Moteur de Conseil et Recommandation d'Ordres (`OrderAdvisorService`)

**Fichier source :** `src/services/orderAdvisor.ts`  
**Rôle :** Analyser en continu les ordres actifs du joueur et recommander l'action optimale (`keep`, `lower_price`, `relocate`, `cancel`).

### 8.1 Arbre de Décision Déterministe

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

## 9. Moteur Analytique P&L et Historique Réalisé (`TraderAnalyticsService`)

**Fichier source :** `src/services/traderAnalytics.ts`  
**Rôle :** Reconstituer les cycles complets d'achat/revente selon la méthode comptable **FIFO** (*First-In, First-Out*) avec coût moyen pondéré.

### 9.1 Algorithme d'Appariement Chronologique FIFO
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

### 9.2 Boucle de Rétroaction Personnalisée (*Personal Calibration Fit*)
Les métriques historiques du joueur alimentent directement le scanner :
* **Spécialité Prouvée :** Flips réussis avec gain $>10\text{M ISK}$ $\implies$ Bonus de confiance $+18\%$.
* **Perte Historique :** Perte nette constatée par le passé $\implies$ Pénalité de confiance $-15\%$.

---

## 🧪 Validation & Couverture des Tests

La suite de tests unitaires valide l'intégralité des moteurs ci-dessus :
* `src/engine/__tests__/engine.test.ts` : 100% des formules de taxes, échelons de compétences, consommation de carnet, slippage et arbitrage spatialisé.
* `src/engine/__tests__/security_and_advisory.test.ts` : 100% des règles du conseiller d'ordres et de la gestion de jeton EVE SSO.
