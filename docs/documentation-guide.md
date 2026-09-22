# Gouvernance documentaire

Status: STABLE
Scope: documentation active et archives
Source of truth: structure `docs/` et règles de ce fichier
Implementation: documentation uniquement
Tests: audit de liens et recherche des doublons
CI gate: validation documentaire de PR

## Où placer l'information

- État actuel → `docs/state/`
- Structure technique → `docs/architecture/`
- Comportement métier → `docs/domains/`
- Contrat normatif → `docs/contracts/`
- Invariant → `docs/invariants/`
- Validation → `docs/validation/`
- Orchestration future → `docs/roadmap/`
- Procédure → `docs/operations/`
- Décision durable → `docs/decisions/ADR-*.md`
- Audit historique → `docs/audits/archive/`
- Ancien document sans valeur opérationnelle → `docs/archive/`

## Une question par document

Un document actif répond à une question principale. Viser moins de 300 lignes ; dépasser cette limite n'est acceptable que si le contenu reste cohérent.

Utiliser autant que possible :
```text
Status:
Scope:
Source of truth:
Implementation:
Tests:
CI gate:
```

## Anti-duplication

Une règle normative a une seule source documentaire principale. Les autres documents la référencent.

## Contract / invariant / validation

Un contrat décrit la forme et la sémantique. Un invariant décrit ce qui doit toujours être vrai. Une validation explique comment le prouver. Un changement de contrat doit synchroniser code, tests et documentation.

## ADR

Créer un ADR pour une décision transversale, durable et difficilement réversible ; pas pour un commit.

## Archive

Le chemin d'archive est hors surface active. Une information historique ne doit pas être utilisée comme état courant.

## Revue

Avant fusion : liens valides, statuts cohérents, noms de fichiers actuels, absence de doublons normatifs et absence de dépendance aux vieux audits.
