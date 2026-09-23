import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8');

const script = read('scripts/ci-observability.mjs');
const ci = read('.github/workflows/ci.yml');
const mainSmoke = read('.github/workflows/ci-main-smoke.yml');
const fullCertification = read('.github/workflows/ci-full-certification.yml');

assert.ok(script.includes('actions/runs/'), 'Observability must read workflow-run metadata from GitHub Actions');
assert.ok(script.includes('/jobs?per_page=100'), 'Observability must collect job and step timing data');
assert.ok(script.includes('/actions/workflows/'), 'Observability must sample recent runs for churn metrics');
assert.ok(script.includes('cancellation_rate'), 'Observability must report cancellation rate');
assert.ok(script.includes('rerun_runs'), 'Observability must report rerun frequency');
assert.ok(script.includes('duration_seconds'), 'Observability must report workflow/job/step durations');
assert.ok(script.includes('test_or_check'), 'Observability must classify test/check steps');
assert.ok(script.includes('npm_install'), 'Observability must separate npm install timing');
assert.ok(script.includes('browser_setup'), 'Observability must separate browser setup timing');
assert.ok(script.includes('GITHUB_STEP_SUMMARY'), 'Observability must publish a durable run summary');
assert.ok(script.includes('CI_OBSERVABILITY_FILE'), 'Observability must persist machine-readable metrics');
assert.ok(script.includes('CI_CERTIFIED_SHA'), 'Observability must record an explicit certified SHA separate from GITHUB_SHA');
assert.match(ci, /^  observability:$/m, 'PR CI must include an observability job');
assert.match(mainSmoke, /^  observability:$/m, 'Main smoke must include an observability job');
assert.match(fullCertification, /^  observability:$/m, 'Full certification must include an observability job');
for (const workflow of [ci, mainSmoke, fullCertification]) {
  assert.ok(workflow.includes('actions: read'), 'Observability jobs must use read-only Actions permission');
  assert.ok(workflow.includes('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'), 'Observability artifact upload must use an immutable SHA');
  assert.ok(workflow.includes('ci-observability.json'), 'Observability workflows must upload machine-readable metrics');
  assert.ok(workflow.includes('CI_OBSERVABILITY_FILE:'), 'Observability file path must be explicit');
  assert.ok(workflow.includes('CI_CERTIFIED_SHA:'), 'Observability workflow must pass an explicit certified SHA');
  assert.ok(workflow.includes('retention-days: 30'), 'Observability artifacts must have an explicit retention period');
}
console.log('CI observability contract checks passed.');
