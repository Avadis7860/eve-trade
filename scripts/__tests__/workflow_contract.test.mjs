import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8');

const ci = read('.github/workflows/ci.yml');
const sde = read('.github/workflows/phase-2.7c-sde.yml');

const ACTION_PINS = {
  checkout: '3d3c42e5aac5ba805825da76410c181273ba90b1',
  setupNode: '820762786026740c76f36085b0efc47a31fe5020',
  uploadArtifact: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
};

const DETECTION_JOB_ID = 'detect-changes';

const EXECUTION_JOB_IDS = [
  'static',
  'unit_domain',
  'server',
  'build',
  'browser-auth',
  'browser-operations',
];

const AGGREGATOR_JOB_IDS = ['validate', 'browser-e2e'];
const ALL_JOB_IDS = [DETECTION_JOB_ID, ...EXECUTION_JOB_IDS, ...AGGREGATOR_JOB_IDS, 'required-gate'];

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

const jobsSection = ci.match(/^jobs:[ \t]*\n([\s\S]*)$/m)?.[1];
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

const detectionBlock = jobBlock(DETECTION_JOB_ID);
assert.ok(detectionBlock.includes(`actions/checkout@${ACTION_PINS.checkout}`), 'Change detection must pin checkout to an immutable SHA');
assert.ok(detectionBlock.includes('fetch-depth: 0'), 'Change detection must have repository history for PR-base comparison');
assert.ok(detectionBlock.includes('persist-credentials: false'), 'Change detection must disable checkout credential persistence');
assert.ok(detectionBlock.includes('BASE_SHA:'), 'Change detection must define an explicit base SHA');
assert.ok(detectionBlock.includes('HEAD_SHA:'), 'Change detection must define an explicit head SHA');
const scopeClassifier = read('scripts/ci-scope.mjs');
assert.ok(scopeClassifier.includes('ambiguous = paths.length === 0'), 'Scope classifier must use a conservative ambiguity fallback');
assert.ok(scopeClassifier.includes('const full_certification = ambiguous || ci || config || domain || server || sde || tests;'), 'Scope classifier must force full certification for high-impact or ambiguous scope');
assert.ok(detectionBlock.includes('run_static='), 'Change detection must publish run_static selection');
assert.ok(detectionBlock.includes('run_unit_domain='), 'Change detection must publish run_unit_domain selection');
assert.ok(detectionBlock.includes('run_server='), 'Change detection must publish run_server selection');
assert.ok(detectionBlock.includes('run_build='), 'Change detection must publish run_build selection');
assert.ok(detectionBlock.includes('run_browser='), 'Change detection must publish run_browser selection');
assert.ok(ci.includes('steps.scope.outputs.run_unit_domain'), 'CI must expose run_unit_domain output');
assert.ok(ci.includes('steps.scope.outputs.run_server'), 'CI must expose run_server output');
assert.ok(ci.includes('steps.scope.outputs.run_build'), 'CI must expose run_build output');
assert.ok(ci.includes('steps.scope.outputs.run_browser'), 'CI must expose run_browser output');
assert.ok(scopeClassifier.includes('tests = true'), 'Scope classifier must detect test changes');
assert.ok(scopeClassifier.includes('frontend = true'), 'Scope classifier must detect frontend changes');
assert.ok(detectionBlock.includes('scripts/ci-scope.mjs'), 'Change detection must use the tested scope classifier');
assert.ok(detectionBlock.includes('scripts/__tests__/ci_scope.test.mjs'), 'Change detection must execute the scope classifier tests');
assert.ok(scopeClassifier.includes('GITHUB_STEP_SUMMARY'), 'Change classifier must publish an observable scope summary');

for (const jobId of EXECUTION_JOB_IDS) {
  const block = jobBlock(jobId);
  assert.ok(block.includes(`actions/checkout@${ACTION_PINS.checkout}`), `Execution job ${jobId} must pin checkout to an immutable SHA`);
  assert.ok(block.includes(`actions/setup-node@${ACTION_PINS.setupNode}`), `Execution job ${jobId} must pin setup-node to an immutable SHA`);
  assert.ok(block.includes('persist-credentials: false'), `Execution job ${jobId} must disable checkout credential persistence`);
  assert.ok(block.includes('node-version: 22.23.2'), `Execution job ${jobId} must use the pinned Node runtime`);
  assert.ok(block.includes('test "$(node --version)" = "v22.23.2"'), `Execution job ${jobId} must verify the selected Node runtime`);
  assert.ok(block.includes('test "$(npm --version)" = "10.9.8"'), `Execution job ${jobId} must verify the npm version bundled with the pinned Node release`);
}

for (const jobId of ['unit_domain', 'server', 'build', 'browser-auth', 'browser-operations']) {
  assert.match(jobBlock(jobId), /^[ \t]+needs: \[detect-changes\][ \t]*$/m, `Conditional job ${jobId} must depend on the change detector`);
}
assert.match(jobBlock('static'), /^[ \t]+needs: \[detect-changes\][ \t]*$/m, 'Static lane must be routed through change detection');
assert.match(jobBlock('static'), /needs\.detect-changes\.outputs\.run_static/, 'Static lane must be conditional by scope');

assert.match(ci, /permissions:[ \t]*\n[ \t]+contents:[ \t]+read/, 'CI must declare read-only repository permissions');

assert.match(
  jobBlock('validate'),
  /^[ \t]+if: \$\{\{ always\(\) \}\}[ \t]*$/m,
  'The historical validate check must remain an unconditional compatibility aggregator',
);
assert.match(
  jobBlock('validate'),
  /^[ \t]+needs: \[detect-changes, static, unit_domain, server, build\][ \t]*$/m,
  'The validation compatibility gate must aggregate change detection and all non-browser lanes',
);
assert.match(
  jobBlock('browser-e2e'),
  /^[ \t]+if: \$\{\{ always\(\) \}\}[ \t]*$/m,
  'The historical browser-e2e check must remain an unconditional compatibility aggregator',
);
assert.match(
  jobBlock('browser-e2e'),
  /^[ \t]+needs: \[detect-changes, browser-auth, browser-operations\][ \t]*$/m,
  'The browser compatibility gate must aggregate change detection and both browser responsibility lanes',
);

const requiredGateBlock = jobBlock('required-gate');
assert.match(
  requiredGateBlock,
  /^[ \t]+if: \$\{\{ always\(\) \}\}[ \t]*$/m,
  'Stable required-gate must always evaluate',
);
assert.match(
  requiredGateBlock,
  /^[ \t]+needs: \[detect-changes, validate, browser-e2e\][ \t]*$/m,
  'Stable required-gate must aggregate detection plus both compatibility validation surfaces',
);
assert.ok(requiredGateBlock.includes('needs.detect-changes.result'), 'Stable required-gate must inspect change detection result');
assert.ok(requiredGateBlock.includes('needs.validate.result'), 'Stable required-gate must inspect non-browser validation result');
assert.ok(requiredGateBlock.includes('needs.browser-e2e.result'), 'Stable required-gate must inspect browser validation result');

assert.match(jobBlock('validate'), /^[ \t]+needs: \[detect-changes, static, unit_domain, server, build\][ \t]*$/m, 'Validation compatibility gate must aggregate detector and non-browser lanes');
assert.match(jobBlock('browser-e2e'), /^[ \t]+needs: \[detect-changes, browser-auth, browser-operations\][ \t]*$/m, 'Browser compatibility gate must aggregate detector and browser lanes');
assert.ok(jobBlock('validate').includes('needs.detect-changes.outputs.run_static'), 'Validation gate must inspect static selection');
assert.ok(jobBlock('validate').includes('needs.detect-changes.outputs.run_unit_domain'), 'Validation gate must inspect unit/domain selection');
assert.ok(jobBlock('validate').includes('needs.detect-changes.outputs.run_server'), 'Validation gate must inspect server selection');
assert.ok(jobBlock('validate').includes('needs.detect-changes.outputs.run_build'), 'Validation gate must inspect build selection');
assert.ok(jobBlock('browser-e2e').includes('needs.detect-changes.outputs.run_browser'), 'Browser gate must inspect browser selection');
assert.ok(jobBlock('validate').includes('= "skipped"'), 'Validation gate must explicitly validate skipped lanes');
assert.ok(jobBlock('browser-e2e').includes('= "skipped"'), 'Browser gate must explicitly validate skipped lanes');

const expectedJobCommands = {
  static: [
    'npm run test:ci-config',
    'npm run typecheck',
    'npm run typecheck:server',
    'npm run test:config',
    'npm run test:auth-token',
  ],
  unit_domain: [
    'npm run test:truth',
    'npm run test:corporation-boundary',
    'npm test',
  ],
  server: [
    'npm run test:api',
    'npm run test:smoke',
    'npm run test:security',
    'npm run test:esi',
  ],
  build: ['npm run build'],
  'browser-auth': [
    'npx playwright install --with-deps chromium',
    'npm run test:e2e:auth',
  ],
  'browser-operations': [
    'npx playwright install --with-deps chromium',
    'npm run test:e2e:operations',
  ],
};

for (const [jobId, commands] of Object.entries(expectedJobCommands)) {
  const block = jobBlock(jobId);
  for (const command of commands) {
    assert.ok(block.includes(command), `Job ${jobId} lost required command: ${command}`);
  }
}
assert.match(jobBlock('build'), /npm run build/, 'Build lane ownership drifted');
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
assert.equal(packageJson.scripts['test:ci-scope'], 'node scripts/__tests__/ci_scope.test.mjs', 'CI scope router must have a direct test command');
assert.equal(packageJson.scripts['test:corporation-boundary'], 'tsx src/services/__tests__/corporationTreasurySync.test.ts', 'Corporation boundary script must contain only its canonical unique proof');
assert.ok(packageJson.scripts['test:corporation-boundary:full'], 'Full historical corporation-boundary composition must remain available for recovery/full certification');

console.log('Workflow contract checks passed.');
