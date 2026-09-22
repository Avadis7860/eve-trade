# Stable Domains

Status: STABLE
Scope: fondations à ne pas rouvrir sans preuve
Source of truth: implémentations et tests liés

| Domaine | Pourquoi stable | Implémentation | Validation | Ne pas rouvrir sauf |
|---|---|---|---|---|
| Catalog truth | cardinalité + checksum canoniques | `src/domain/catalog/*` + manifest | catalog/truth suites | changement catalogue ou régression |
| Universe truth | graph SDE complet + identité de build | `src/domain/universe/*` + manifest | route/SDE suites | nouveau SDE ou défaut de graphe |
| Order identity | aucune perte de précision | `src/engine/orderIdentity.ts` | `order_identity.test.ts` | changement transport/persistance |
| Trading ownership | observateur ≠ propriétaire économique | `orderScoping.ts`, `corporationOrder.ts` | order/corporation suites | nouveau scope économique |
| Corporation ESI | credential du personnage, objet économique corporation | `corporationEsiGateway.ts` | corporation ESI gate | nouveau endpoint CCP |
| ESI collection state | AVAILABLE/EMPTY/PARTIAL/UNAVAILABLE/ERROR sont distincts | `src/services/esi.ts` | ESI suites | changement de contrat |
| Financial Truth | FIFO causal + statuts explicites | `realizedFinancialOutcome.ts` | realized-financial suite | régression comptable prouvée |
| Private cache boundary | pas de données métier privées dans cache owner-neutral | `esiGateway.ts`, `indexedDbStore.ts` | ESI/cache tests | introduction d'un cache privé |
