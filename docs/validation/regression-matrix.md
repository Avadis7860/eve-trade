# Regression Matrix

Status: STABLE
Scope: compact domain-to-proof map
Source of truth: current code/tests/CI

| Domain | Implementation | Focused validation | CI |
|---|---|---|---|
| Catalog | `src/domain/catalog/*` | catalog integrity/truth | truth + unit |
| Universe | `src/domain/universe/*` | route/SDE tests | truth + SDE when sensitive |
| Market data | `EsiService`, market store | market quality + ESI | unit + ESI |
| Orders | identity/scoping/corporation order | order suites | unit + corporation + ESI |
| Corporation | gateways/routes/treasury sync | corporation suites | corporation boundary + ESI |
| Financial Truth | realized outcome engine | realized financial | unit |
| Execution | correlation/outcome/tracking | execution suites | unit |
| Evidence | evidence/observation | proof/provenance suites | unit |
| Persistence | IndexedDbStore | persistence/transaction | unit |
| Security | auth/ESI boundaries | security | security + ESI |
| API | Express routes | API/smoke | API + smoke |
| UI | React/hooks | typecheck/build; future browser E2E | typecheck + build |

The matrix identifies the proof surface; it does not replace the detailed validation documents.
