#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROADMAP_DIR = path.join(ROOT, 'docs', 'roadmap');
const ACTIVE_ROADMAPS = [
  'index.md',
  'master-plan.md',
  'backlog.md',
  'completed.md',
  'public-readiness.md',
  'ux-program.md',
  'ci-management-refactor.md',
  'p0-market-reliability.md',
  'financial-truth-reconciliation.md',
];

const EXECUTION_HEADING = /^#{2,6}\s+(?:Phase|Étape|Step|Task(?:-\d+)?)(?:\s|$)/im;
const FORBIDDEN_LIVE_MARKERS = [
  /Branche de chantier\s*:/i,
  /\.eve-trade\/(?:current-work|stable-context)\.json/i,
  /Draft\s*\/\s*Ready for Review/i,
  /Current active branch/i,
];

for (const file of ACTIVE_ROADMAPS) {
  const fullPath = path.join(ROADMAP_DIR, file);
  assert.ok(fs.existsSync(fullPath), `Active roadmap is missing: ${file}`);
  const source = fs.readFileSync(fullPath, 'utf8');
  assert.equal(
    EXECUTION_HEADING.test(source),
    false,
    `${file} contains an execution-phase/task heading; move the living plan to the GitHub Issue`,
  );
  for (const marker of FORBIDDEN_LIVE_MARKERS) {
    assert.equal(
      marker.test(source),
      false,
      `${file} contains live delivery metadata: ${marker}`,
    );
  }
}

assert.equal(
  fs.existsSync(path.join(ROOT, 'docs', 'roadmap', 'current-chunk.md')),
  false,
  'Legacy current-chunk roadmap must not return',
);

const licensePath = path.join(ROOT, 'LICENSE');
const thirdPartyNoticesPath = path.join(ROOT, 'THIRD-PARTY-NOTICES.md');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const contributing = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
const license = fs.readFileSync(licensePath, 'utf8');
const thirdPartyNotices = fs.readFileSync(thirdPartyNoticesPath, 'utf8');

assert.equal(packageJson.license, 'MIT', 'package.json must declare MIT');
assert.match(license, /^MIT License/m, 'LICENSE must publish the MIT License');
assert.match(license, /Copyright \(c\) 2026 Avadis7860/, 'LICENSE must identify the project copyright holder');
assert.match(readme, /\*\*MIT\*\*/i, 'README must expose the published MIT license');
assert.match(readme, /THIRD-PARTY-NOTICES\.md/i, 'README must point to third-party license boundaries');
assert.match(contributing, /licensed under MIT/i, 'CONTRIBUTING must document contribution licensing');
assert.match(thirdPartyNotices, /CCP Developer License Agreement/i, 'third-party notices must identify CCP terms');
assert.match(thirdPartyNotices, /not relicensed under the EVE Trade MIT license/i, 'third-party notices must prevent broad relicensing interpretation');

console.log('Documentation governance checks passed.');
