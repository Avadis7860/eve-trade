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
  'npm run test:e2e:auth',
  'npm run test:e2e:operations',
  'npm ci --no-audit --no-fund',
  'npm run typecheck',
  'npm run typecheck:server',
  'npm run test:ci-config',
  'npm run test:config',
  'npm run test:auth-token',
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
  assert.ok(ci.includes(`${labels[action]}@${sha}`), `CI must pin ${labels[action]} to an immutable SHA`);
}

assert.match(ci, /permissions:\s*\n\s+contents:\s+read/, 'CI must declare read-only repository permissions');
assert.equal((ci.match(/persist-credentials: false/g) || []).length, 6, 'All six execution jobs must disable checkout credential persistence');
assert.equal((ci.match(/node-version: 22\.23\.2/g) || []).length, 6, 'All six execution jobs must use the pinned Node runtime');
assert.equal((ci.match(/test "\$\(node --version\)" = "v22\.23\.2"/g) || []).length, 5, 'All six execution jobs must verify the selected Node runtime');
assert.equal((ci.match(/test "\$\(npm --version\)" = "10\.9\.8"/g) || []).length, 5, 'All six execution jobs must verify the npm version bundled with the pinned Node release');

assert.match(
  ci,
  /validate:\s*\n\s+name: Validation & Non-Regression Gate[\s\S]*if: \$\{\{ always\(\) \}\}[\s\S]*needs: \[static, unit_domain, server, build\]/,
  'The historical validate check must remain as an unconditional compatibility aggregator',
);
assert.match(ci,/browser-auth:[\s\S]*npm run test:e2e:auth/,'Browser Auth lane ownership drifted');
assert.match(ci,/browser-operations:[\s\S]*npm run test:e2e:operations/,'Browser Operations lane ownership drifted');
assert.doesNotMatch(ci,/browser-auth:[\s\S]*needs:/,'Browser Auth must remain independently runnable');
assert.doesNotMatch(ci,/browser-operations:[\s\S]*needs:/,'Browser Operations must remain independently runnable');
assert.match(ci,/browser-e2e:[\s\S]*if: \$\{\{ always\(\) \}\}[\s\S]*needs: \[browser-auth, browser-operations\]/,'Historical browser-e2e check must remain as compatibility aggregator');
assert.match(
  ci,
  /static:[\s\S]*npm run typecheck[\s\S]*npm run typecheck:server[\s\S]*npm run test:ci-config[\s\S]*npm run test:config[\s\S]*npm run test:auth-token/,
  'Static lane ownership drifted',
);
assert.match(
  ci,
  /unit_domain:[\s\S]*npm run test:truth[\s\S]*npm run test:corporation-boundary[\s\S]*npm test/,
  'Unit/domain lane ownership drifted',
);
assert.match(
  ci,
  /server:[\s\S]*npm run test:api[\s\S]*npm run test:smoke[\s\S]*npm run test:security[\s\S]*npm run test:esi/,
  'Server lane ownership drifted',
);
assert.match(ci, /build:[\s\S]*npm run build/, 'Build lane ownership drifted');
assert.match(ci,/browser-auth:[\s\S]*npx playwright install --with-deps chromium[\s\S]*npm run test:e2e:auth/,'Browser Auth lane must execute the deterministic Playwright gate');
assert.match(ci,/browser-operations:[\s\S]*npx playwright install --with-deps chromium[\s\S]*npm run test:e2e:operations/,'Browser Operations lane must execute the deterministic Playwright gate');
assert.ok(
  !ci.match(/uses: actions\/(?:checkout|setup-node|upload-artifact)@v\d/),
  'CI action references must use immutable SHAs, not moving version tags',
);

assert.match(
  sde,
  /permissions:\s*\n\s+contents:\s+read/,
  'SDE truth gate must remain read-only',
);
assert.ok(sde.includes(`actions/checkout@${ACTION_PINS.checkout}`), 'SDE checkout must remain pinned to an immutable SHA');
assert.ok(sde.includes(`actions/setup-node@${ACTION_PINS.setupNode}`), 'SDE setup-node must remain pinned to an immutable SHA');
assert.ok(sde.includes('node-version: 22.23.2'), 'SDE must use the pinned Node 22 patch release');
assert.ok(sde.includes('test "$(node --version)" = "v22.23.2"'), 'SDE must verify the selected Node runtime');
assert.ok(sde.includes('test "$(npm --version)" = "10.9.8"'), 'SDE must verify the bundled npm');
assert.equal((sde.match(/persist-credentials: false/g) || []).length, 2, 'Both SDE checkouts must disable credential persistence');
assert.ok(!sde.match(/uses: actions\/(?:checkout|setup-node)@v\d/), 'SDE action references must use immutable SHAs');
assert.ok(sde.includes('fetch-depth: 0'), 'SDE detector must have local history for PR-base comparison');
assert.ok(!sde.includes('git fetch origin'), 'SDE detector must not depend on unauthenticated remote fetches');
assert.ok(!sde.includes('git push'), 'SDE truth gate must never push');
assert.ok(!sde.includes('git commit'), 'SDE truth gate must never auto-commit');
assert.ok(sde.includes("SDE_BUILD: '3503375'"), 'SDE build must remain explicitly pinned');
assert.ok(sde.includes('git diff --quiet -- src/data/universeGraph.json src/data/universeGraphManifest.ts'), 'SDE gate must compare canonical artifacts');
assert.ok(sde.includes('exit 1'), 'SDE gate must fail on drift');

const packageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts['test:corporation-boundary'], 'tsx src/services/__tests__/corporationTreasurySync.test.ts', 'Corporation boundary script must contain only its canonical unique proof');
assert.ok(packageJson.scripts['test:corporation-boundary:full'], 'Full historical corporation-boundary composition must remain available for recovery/full certification');

console.log('Workflow contract checks passed.');
