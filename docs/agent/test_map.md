# Agent Test Map

A task is not complete until its affected validation surface is identified.

| Change area | First validation surface | Additional checks |
|---|---|---|
| `src/engine/**` | Matching suite under `src/engine/__tests__/` | Full test, lint, build |
| ESI client/routes | ESI/server tests | Full test, lint, build |
| Character transactions | Transaction ingestion/normalization tests | Execution correlation tests |
| Execution correlation/outcome | Execution tests | Persistence/integration tests |
| IndexedDB | Persistence/schema tests | Full test, build |
| Catalog | Catalog integrity/type resolution tests | API status tests |
| React components | Relevant component/integration tests | Build |
| Documentation only | Diff review and link/path consistency | No code validation unless docs change code contracts |

## Mandatory project validation

The repository workflow currently defines:

    npm test
    npm run lint
    npm run build

Agents should report which checks were actually executed rather than claiming validation from documentation alone.
