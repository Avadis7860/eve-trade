# Development

Status: CURRENT
Scope: local development workflow
Source of truth: `package.json`, `tsconfig*.json`, Vite/Express entrypoints

## Setup

Use Node.js 22 and npm. Install with `npm ci`.

## Run

`npm run dev` starts the TypeScript Express server which serves the application during development.

## Validate

```bash
npm run typecheck
npm run typecheck:server
npm test
npm run build
```

Use targeted scripts during iteration; report exactly what was executed.
