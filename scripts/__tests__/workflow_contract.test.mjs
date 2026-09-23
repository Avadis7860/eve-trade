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

const EXECUTION_JOB_IDS = [
  'static',
  'unit_domain',
  'server',
  'build',
  'browser-auth',
  'browser-operations',
];

const AGGREGATOR_JOB_IDS = ['validate', 'browser-e2e'];
const ALL_JOB_IDS = [...EXECUTION_JOB_IDS, ...AGGREGATOR_JOB_IDS];

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

const jobsSection = ci.match(/^jobs:\s*\n([\s\S]*)$/m)?.[1];
assert.ok(jobsSection, 'CI workflow must declare a jobs section');

const jobIds = [...jobsSection.matchAll(/^  ([A-Za-z0-9_-]+):[ \t]*$/gm)].map((match) => match[1]);
assert.deepEqual(
  jobIds,
  ALL_JOB_IDS,
  'CI topology drifted: execution and compatibility job IDs must be reviewed explicitly',
);

const jobEntries = jobsSection.split(/\n(?=  [A-Za-z0-9_-]+:[ \t]*(?:\n|$))/);

const jobBlock = (jobId) => {
  const entry = jobEntries.find((candidate) => candidate.startsWith(`  ${jobId}:`));
  assert.ok(entry, `CI job block missing: ${jobId}`);
  return entry.slice(entry.indexOf('\n') + 1);
};

for (const jobId of EXECUTION_JOB_IDS) {
  const block = jobBlock(jobId);
  assert.ok(block.includes(`actions/checkout@${ACTION_PINS.checkout}`), `Execution job ${jobId} must pin checkout to an immutable SHA`);
  assert.ok(block.includes(`actions/setup-node@${ACTION_PINS.setupNode}`), `Execution job ${jobId} must pin setup-node to an immutable SHA`);
  assert.ok(block.includes('persist-credentials: false'), `Execution job ${jobId} must disable checkout credential persistence`);
  assert.ok(block.includes('node-version: 22.23.2'), `Execution job ${jobId} must use the pinned Node runtime`);
  assert.ok(block.includes('test "$(node --version)" = "v22.23.2"'), `Execution job ${jobId} must verify the selected Node runtime`);
  assert.ok(block.includes('test "$(npm --version)" = "10.9.8"'), `Execution job ${jobId} must verify the npm version bundled with the pinned Node release`);
}

for (const jobId of ['browser-auth', 'browser-operations']) {
  assert.doesNotMatch(jobBlock(jobId), /^\s+needs:/m, `Browser job ${jobId} must remain independently runnable`);
}

assert.match(ci, /permissions:\s*\n\s+contents:\s+read/, 'CI must declare read-only repository permissions');

assert.match(
  jobBlock('validate'),
  /^\s+if: \$\{\{ always\(\) \}\}\s*$/m,
  'The historical validate check must remain an unconditional compatibility aggregator',
);
assert.match(
  jobBlock('validate'),
  /^\s+needs: \[static, unit_domain, server, build\]\s*$/m,
  'The historical validate check must continue aggregating the non-browser execution lanes',
);
assert.match(
  jobBlock('browser-e2e'),
  /^\s+if: \$\{\{ always\(\) \}\}\s*$/m,
  'The historical browser-e2e check must remain an unconditional compatibility aggregator',
);
assert.match(
  jobBlock('browser-e2e'),
  /^\s+needs: \[browser-auth, browser-operations\]\s*$/m,
  'The historical browser-e2e check must continue aggregating both browser responsibility lanes',
);

assert.match(
  jobBlock('static'),
  /npm run typecheck[\s\S]*npm run typecheck:server[\s\S]*npm run test:ci-config[\s\S]*npm run test:config[\s\S]*npm run test:auth-token/,
  'Static lane ownership drifted',
);
assert.match(
  jobBlock('unit_domain'),
  /npm run test:truth[\s\S]*npm run test:corporation-boundary[\s\S]*npm test/,
  'Unit/domain lane ownership drifted',
);
assert.match(
  jobBlock('server'),
  /npm run test:api[\s\S]*npm run test:smoke[\s\S]*npm run test:security[\s\S]*npm run test:esi/,
  'Server lane ownership drifted',
);
assert.match(jobBlock('build'), /npm run build/, 'Build lane ownership drifted');
assert.match(
  jobBlock('browser-auth'),
  /npx playwright install --with-deps chromium[\s\S]*npm run test:e2e:auth/,
  'Browser Auth lane must execute the deterministic Playwright gate',
);
assert.match(
  jobBlock('browser-operations'),
  /npx playwright install --with-deps chromium[\s\S]*npm run test:e2e:operations/,
  'Browser Operations lane must execute the deterministic Playwright gate',
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
