import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8');

const ci = read('.github/workflows/ci.yml');
const sde = read('.github/workflows/phase-2.7c-sde.yml');

const requiredCiCommands = [
  'npm ci --no-audit --no-fund',
  'npm run typecheck',
  'npm run typecheck:server',
  'npm run test:truth',
  'npm test',
  'npm run test:api',
  'npm run test:smoke',
  'npm run test:security',
  'npm run test:esi',
  'npm run build',
];

for (const command of requiredCiCommands) {
  assert.ok(ci.includes(command), `CI gate lost required command: ${command}`);
}

assert.match(
  ci,
  /Install dependencies[\s\S]*Frontend typecheck[\s\S]*Backend typecheck/,
  'CI validation order must keep dependency installation before typechecks',
);

assert.match(
  sde,
  /permissions:\s*\n\s+contents:\s+read/,
  'SDE truth gate must remain read-only',
);
assert.ok(
  sde.includes('fetch-depth: 0'),
  'SDE detector must have local history for PR-base comparison',
);
assert.ok(
  !sde.includes('git fetch origin'),
  'SDE detector must not depend on unauthenticated remote fetches',
);
assert.ok(!sde.includes('git push'), 'SDE truth gate must never push');
assert.ok(!sde.includes('git commit'), 'SDE truth gate must never auto-commit');
assert.ok(
  sde.includes("SDE_BUILD: '3503375'"),
  'SDE build must remain explicitly pinned',
);
assert.ok(
  sde.includes(
    'git diff --quiet -- src/data/universeGraph.json src/data/universeGraphManifest.ts',
  ),
  'SDE gate must compare regenerated canonical artifacts',
);
assert.ok(
  sde.includes('exit 1'),
  'SDE gate must fail when committed canonical artifacts drift',
);

console.log('Workflow contract checks passed.');
