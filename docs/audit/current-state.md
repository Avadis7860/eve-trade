# EVE Trade — État courant de l'audit

**Date de référence : 22 septembre 2026**

Ce document est le point de synthèse de l'audit actif. Les rapports de lots historiques restent utiles pour la traçabilité, mais ne doivent pas être utilisés comme description de l'état courant lorsqu'ils divergent de `main`.

## État de la branche de référence

- Branche de référence : `main`
- Phases documentaires déjà fusionnées : synchronisation de la base agentique, audit de l'architecture des index et cartographie des contrats.
- Client ESI backend durci : pagination, ETag/304, expiration, budget d'erreur ESI et Retry-After exposés.
- IndexedDB : version 5, 11 object stores.
- Types : contrats organisés sous `src/types/`, avec `src/types.ts` conservée comme façade de compatibilité.
- CI : typecheck frontend/backend, tests unitaires, API, smoke, sécurité, ESI et build.

## Corrections apportées par la Phase 2.4

### Source de vérité agentique

`AGENTS.md` est la source de vérité opérationnelle. Les index `docs/agent/*` décrivent la navigation, les invariants, les tests et les contrats du dépôt réel.

`GEMINI.md` est uniquement un point d'entrée de compatibilité et ne définit aucune règle concurrente.

### Reproductibilité npm

Le dépôt utilise désormais un `package-lock.json` canonique et le CI doit utiliser :

```bash
npm ci --no-audit --no-fund
```

Le cache npm de `setup-node` est activé.

Le lockfile a été restauré à partir du commit historique qui l'avait déjà généré pour ce même `package.json`. Il doit rester synchronisé avec toute modification future des dépendances.

### Documentation d'audit

`docs/audit/MASTER-PLAN.md` est explicitement identifié comme historique. Le présent document, les index `docs/agent/*` et le code de `main` constituent la référence pour les décisions courantes.

Les rapports `baseline.md`, `lot-002.md`, `lot-003.md` et la matrice de régression restent des preuves historiques datées ; leurs chiffres ou statuts antérieurs ne doivent pas être interprétés comme des mesures actuelles.

## Dette restante identifiée

1. Consolider le client ESI frontend/backend.
2. Renforcer la véracité du catalogue et des données d'univers.
3. Introduire une couverture E2E navigateur déterministe.
4. Décomposer progressivement `IndexedDbStore`.
5. Découpler les gros services applicatifs et composants React.
6. Mesurer puis réduire le bundle initial.
7. Activer progressivement les contrôles TypeScript inutilisés après les refactorings.

## Règle de changement

Chaque étape doit rester isolée sur une branche dédiée, préserver les contrats existants, ajouter les tests nécessaires et passer le gate CI avant fusion.

La prochaine phase après 2.4 est **Phase 2.5 — Consolidation ESI frontend/backend**.
