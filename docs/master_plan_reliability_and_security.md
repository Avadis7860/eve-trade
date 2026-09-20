# Master-Plan Professionnel : EVE Trade Reliability & Security Architecture

Ce document constitue le **Master-Plan de Référence** pour l'évolution, le durcissement architectural et la fiabilité opérationnelle d'**EVE Trade**.

Il intègre et décline l'ensemble des constats et recommandations de l'audit architectural (Score d'étape : 80/100), avec pour objectif d'élever chaque dimension clé à plus de **90+/100**, et de transformer EVE Trade en un système de trading institutionnel digne de confiance.

---

## 📊 1. Synthèse de l'Audit & Objectifs Cibles

| Dimension                          | Avant | Actuel (Audit) | Objectif Cible | Priorité |
| :--------------------------------- | ----: | -------------: | -------------: | :------: |
| **Sécurité SSO / OAuth**           |    58 |         **76** |        **95+** |  **P0**  |
| **Fiabilité des Données & Types**  |    61 |         **79** |        **95+** |  **P1**  |
| **Résilience ESI & Réseau**        |    64 |         **76** |        **90+** |  **P1**  |
| **Modèle de Session & Persistance**|    58 |         **76** |        **95+** |  **P1**  |
| **Observabilité & Métriques**      |    52 |         **86** |        **95+** |  **P2**  |
| **Trading Safety & Gating**        |    70 |         **80** |        **90+** |  **P2**  |
| **Architecture Globale**           |    72 |         **84** |        **90+** |  **P2**  |

### Question Directrice Fondamentale
> *Avant :* « Est-ce que l'outil sait calculer et trouver des opportunités ? »
>
> **Désormais :** **« Est-ce que je peux faire confiance à l'opportunité que l'outil vient de me présenter ? »**

---

## 🛡️ 2. Feuille de Route en 5 Phases

```
                  CCP ESI & EVE SSO
                         │
                         ▼
       ┌───────────────────────────────────┐
       │   PHASE R1 : Security Hardening   │
       │  • State CSRF Strictement Bloquant│
       │  • Whitelist Stricte Redirect URIs│
       └─────────────────┬─────────────────┘
                         │
                         ▼
       ┌───────────────────────────────────┐
       │     PHASE R2 : Data Integrity     │
       │  • Typage NO_DATA ≠ ZERO_DATA     │
       │  • Statut Santé Catalogue Granulé │
       └─────────────────┬─────────────────┘
                         │
                         ▼
       ┌───────────────────────────────────┐
       │   PHASE R3 : ESI Reliability      │
       │  • Circuit Breaker & Error Budget │
       │  • Retry Exponential + Jitter     │
       └─────────────────┬─────────────────┘
                         │
                         ▼
       ┌───────────────────────────────────┐
       │   PHASE R4 : Session & Quality    │
       │  • Modèle de Session Formalisé    │
       │  • 6 États Déterministes          │
       └─────────────────┬─────────────────┘
                         │
                         ▼
       ┌───────────────────────────────────┐
       │   PHASE R5 : Trading Safety       │
       │  • Data Quality Gate              │
       │  • Risk Gate & Liquidity Gate     │
       └───────────────────────────────────┘
```

---

## 🔒 3. Détail des Phases Stratégiques

### Phase R1 — Security Hardening (P0 Immédiat)
1. **Validation Bloquante du State OAuth :**
   * Dans `/auth/callback` et `/api/auth/token`, la validation du jeton CSRF `state` généré avec `crypto.randomBytes(32)` doit être **inconditionnellement bloquante**.
   * `state absent` $\to$ **HTTP 400** immédiat (aucun appel EVE SSO).
   * `state invalide ou expiré` $\to$ **HTTP 400** immédiat avec trace d'audit.
   * `state valide` $\to$ Consommation unique (one-time token) et continuation.
   * Élimination stricte du schéma `warn -> continue anyway`.
2. **Whitelist Stricte des `redirect_uri` :**
   * `EVE_CALLBACK_URL` configuré dans l'environnement est la **source de vérité unique**.
   * Définition d'une liste blanche inviolable (`ALLOWED_REDIRECT_URIS`) interdisant tout `redirect_uri` arbitraire injecté par un attaquant.
   * Tout paramètre non homologué est rejeté avec `HTTP 400 INVALID_REDIRECT_URI`.

### Phase R2 — Data Integrity & Hiérarchie du Catalogue de Types
1. **Granularité Explicite de l'État de Santé (`/api/health`) :**
   * `CATALOG_LOADED` (catalogue complet validé sur disque) $\to$ `status: 'healthy'` (HTTP 200).
   * `CATALOG_FALLBACK_CORE` (catalogue restreint de secours) $\to$ `status: 'degraded'` (HTTP 200).
   * `CATALOG_EMPTY` (fichier vide ou 0 types valides) $\to$ `status: 'unhealthy'` (HTTP 503).
   * `CATALOG_CORRUPTED` (JSON invalide ou corruption de données) $\to$ `status: 'unhealthy'` (HTTP 503).
2. **Règle Absolue : `NO_DATA ≠ ZERO_DATA` :**
   * Différenciation obligatoire dans toute la chaîne de traitement :
     * `NO_DATA` : requête échouée, timeout, ESI indisponible $\to$ Pas de supposition, score de confiance nul.
     * `ZERO_DATA` : carnet interrogé avec succès et confirmant 0 ordres existants $\to$ Volume 0 vérifié.
     * `STALE_DATA` : données en cache expirées ou dont l'âge dépasse le TTL.
     * `PARTIAL_DATA` : pagination incomplète ou réponse tronquée.
     * `INVALID_DATA` : violation des règles métier EVE (prix négatif, volume erroné).

### Phase R3 — ESI Reliability & Couche de Transport Résiliente
1. **Gestion du Rate Limiting & Erreurs ESI :**
   * Prise en compte prioritaire du code `420 Error Limit Exceeded` et `429 Rate Limit`.
   * Lecture du header `x-esi-error-limit-remain` et temporisation automatique si le quota descend sous 20 erreurs.
   * Retry intelligent avec backoff exponentiel et jitter aléatoire (50-200ms) pour éviter les tempêtes de requêtes (thundering herd).
2. **Circuit Breaker Transverse :**
   * Si le taux d'erreur sur une région ESI dépasse 50% sur les 10 dernières requêtes, basculer temporairement sur le cache local ou le mode dégradé pendant 30 secondes avant de retenter une sonde.

### Phase R4 — Formalisation Complète du Modèle de Session (`AuthService`)
1. **Modèle de Session Versionné (Version 2) :**
   * Chaque session personnage comporte désormais :
     * `session_version`: `number` (2)
     * `character_id`: `number`
     * `character_name`: `string`
     * `access_token`: `string`
     * `refresh_token`: `string`
     * `expires_at`: `number` (timestamp ms)
     * `last_validated_at`: `string` (horodatage ISO du dernier contact ESI réussi)
     * `auth_status`: `SessionAuthStatus`
2. **Cycle de Vie Déterministe à 6 États :**
   * `SESSION_VALID` : Jeton valide, non expiré (> 2 min restantes), vérifié.
   * `SESSION_EXPIRING` : Jeton valide mais proche de l'expiration (< 2 min restantes), déclenchement proactif du renouvellement.
   * `SESSION_REFRESHING` : Renouvellement en cours, verrou atomique (`refreshLockMap`) actif pour éviter les doubles requêtes.
   * `SESSION_EXPIRED` : Jeton expiré, renouvelable via `refresh_token`.
   * `SESSION_REVOKED` : Jeton révoqué par CCP (401 direct ou `invalid_grant` au refresh).
   * `SESSION_CORRUPTED` : Session altérée (champs obligatoires manquants ou invalides).

### Phase R5 — Trading Safety & Portes de Validation (Quality Gates)
1. **Chaîne de Contrôle Préalable à Toute Recommandation :**
   $$\text{Donnée Brute ESI} \longrightarrow \text{Data Quality Gate} \longrightarrow \text{Risk Gate} \longrightarrow \text{Liquidity Gate} \longrightarrow \text{Profit Gate} \longrightarrow \text{Opportunité Certifiée}$$
2. **Non-Suppression Silencieuse :**
   * Aucune opportunité suspecte n'est éliminée sans trace : elle est étiquetée avec ses métadonnées de qualité (`is_anomalous`, `rejection_reasons`, `data_quality.confidence_score`).
   * L'utilisateur est informé de la cause exacte de mise à l'écart (ex. `Prix 95% sous la médiane Jita`, `Carnet source partiel`, `Données périmées de 45 minutes`).

---

## 📐 4. Invariants Opérationnels & Règles Non Négociables

1. **Moteurs Purs (`src/engine/*`) :** Zéro appel réseau, zéro import React, zéro accès `localStorage`, zéro état global mutable. Fonctions déterministes pures.
2. **Contraintes CCP Officielles :** Formules officielles de Broker Fee, Sales Tax, Relist Fee et Tick Sizes respectées au centième d'ISK.
3. **Multi-Personnages Strict :** Prise en charge sans faille d'une flotte de personnages (`EveCharacterSession[]`) avec renouvellement asynchrone indépendant.
4. **Validation Systématique :** Aucune livraison de code sans le passage réussi à 100% de `npm test`, `npm run lint` et `npm run build`.
