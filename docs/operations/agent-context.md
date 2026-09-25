# Agent Context & Change Navigation

Status: STABLE
Scope: stable developer and AI navigation guidance
Navigation source: .eve-trade/context-map.json
Delivery source: GitHub Issue / Pull Request
Repository state source: Git
Validation: npm run test:context

## Purpose

Cette couche réduit le coût de reconstruction du contexte sans créer une seconde source de vérité pour les chantiers. La navigation du dépôt est durable ; le suivi des livraisons est géré par GitHub.

## Standard load order

1. Consulter l'Issue GitHub et la PR lorsqu'un chantier actif est concerné.
2. Lire docs/state/current-state.md pour l'état logiciel actuellement intégré.
3. Lire docs/state/truth-matrix.md pour la synthèse des domaines.
4. Lire docs/roadmap/master-plan.md et docs/roadmap/backlog.md pour la stratégie durable.
5. Lire .eve-trade/context-map.json pour localiser code, contrats, invariants, tests et CI.
6. Lire seulement les sources du domaine concerné.

## Navigation versus truth

La navigation indique où chercher. Elle ne devient jamais une vérité métier ou une copie du cycle de vie GitHub.

Autorité :
1. contrats normatifs, invariants et décisions acceptées ;
2. implémentation courante, tests certifiés et CI ;
3. état logiciel et roadmap durable ;
4. métadonnées de navigation.

Pour le delivery :
- GitHub Issue porte le chantier, son objectif et son suivi ;
- GitHub PR porte branche, commits, Draft/Ready, CI et merge ;
- Git représente l'arbre intégré et son historique ;
- GitHub Actions fournit la preuve de certification.

## Change-impact chain

GitHub Issue/PR -> repository state -> domain -> canonical source -> contract -> invariant -> tests -> CI lane -> downstream impact

## Stable-map maintenance

Mettre à jour context-map.json uniquement lorsque changent :
- la propriété canonique ;
- une frontière de domaine ;
- la propriété d'un contrat ou invariant ;
- la propriété d'une validation ;
- le statut de remplacement d'une implémentation legacy.

Ne pas modifier la carte pour suivre l'ouverture, l'avancement ou la fermeture d'une Issue/PR.

## Context integrity

npm run test:context vérifie directement :
- les fichiers de navigation et de bootstrap ;
- les références de domaines, contrats, invariants et tests ;
- les workflows et jobs référencés ;
- le routage fonctionnel des domaines vers les lanes CI ;
- la cohérence observable du checkout PR ou stable via Git/GitHub.

Aucun manifeste versionné ou généré ne fait partie de cette certification.

## Anti-duplication

Un document stable doit expliquer une règle, une capacité, une architecture ou une stratégie durable. Il ne doit pas recopier :
- le numéro d'une Issue active ;
- le numéro d'une PR active ;
- sa branche ;
- sa phase ;
- son statut Draft/Ready ;
- une action administrative attendue après merge.

Le dépôt ne doit pas nécessiter de PR de synchronisation uniquement parce qu'un chantier GitHub a changé d'état.
