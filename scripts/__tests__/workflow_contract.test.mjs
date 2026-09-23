import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8');

const ci = read('.github/workflows/ci.yml');
const sde = read('.github/workflows/phase-2.7c-sde.yml');

const ACTION_PINS = {
  checkout: '11d5960a326750d5838078e36cf38b85af677262',
  setupNode: '49933ea5288caeca8642d1e84afbd3f7d6820020',
  uploadArtifact: 'ea165f8d65b6e75b540449e92b4886f43607fa02',
};

const requiredCiCommands = [
  'npm run test:e2e',
  'npm ci --no-audit --no-fund',
  'npm run typecheck',
  'npm run typecheck:server',
  'npm run test:truth',
  'npm run test:corporation-boundary',
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

for (const [action, sha] of Object.entries(ACTION_PINS)) {
  const labels = {
    checkout: 'actions/checkout',
    setupNode: 'actions/setup-node',
    uploadArtifact: 'actions/upload-artifact',
  };
  assert.ok(
    ci.includes(`${labels[action]}@${sha}`),
    `CI must pin ${labels[action]} to an immutable SHA`,
  );
}

assert.match(ci, /permissions:\s*\n\s+contents:\s+read/, 'CI must declare read-only repository permissions');
assert.match(
  ci,
  /Checkout repository[\s\S]*persist-credentials: false/,
  'CI checkout must not persist the GitHub token in the repository config',
);
assert.match(ci, /node-version: 22\.23\.2/, 'CI runtime must pin the Node 22 patch release');
assert.ok(ci.includes('test "$(node --version)" = "v22.23.2"'), 'CI must verify the selected Node runtime');
assert.ok(ci.includes('test "$(npm --version)" = "10.9.8"'), 'CI must verify the npm version bundled with the pinned Node release');
assert.match(
  ci,
  /Setup Node\.js 22\.23\.2[\s\S]*setup-node@/,
  'CI must make the pinned Node runtime explicit in the setup step',
);

assert.match(
  ci,
  /Install dependencies[\s\S]*Frontend typecheck[\s\S]*Backend typecheck/,
  'CI validation order must keep dependency installation before typechecks',
);
assert.match(
  ci,
  /browser-e2e:[\s\S]*npx playwright install --with-deps chromium[\s\S]*npm run test:e2e/,
  'CI must execute the deterministic Playwright browser gate',
);
assert.equal(
  (ci.match(/persist-credentials: false/g) || []).length,
  2,
  'Both CI jobs must disable checkout credential persistence',
);
assert.ok(
  !ci.match(/uses: actions\/(?:checkout|setup-node|upload-artifact)@v\d/),
  'CI action references must use immutable SHAs, not moving version tags',
);

assert.match(
  sde,
  /permissions:\s*\n\s+contents:\s+read/,
  'SDE truth gate must remain read-only',
);
assert.ok(
  sde.includes(`actions/checkout@${ACTION_PINS.checkout}`),
  'SDE checkout must remain pinned to an immutable SHA',
);
assert.ok(
  sde.includes(`actions/setup-node@${ACTION_PINS.setupNode}`),
  'SDE setup-node must remain pinned to an immutable SHA',
);
assert.ok(sde.includes('node-version: 22.23.2'), 'SDE must use the pinned Node 22 patch release');
assert.ok(sde.includes('test "$(node --version)" = "v22.23.2"'), 'SDE must verify the selected Node runtime');
assert.ok(sde.includes('test "$(npm --version)" = "10.9.8"'), 'SDE must verify the npm version bundled with the pinned Node release');
assert.equal(
  (sde.match(/persist-credentials: false/g) || []).length,
  2,
  'Both SDE checkouts must disable credential persistence',
);
assert.ok(
  !sde.match(/uses: actions\/(?:checkout|setup-node)@v\d/),
  'SDE action references must use immutable SHAs, not moving version tags',
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
