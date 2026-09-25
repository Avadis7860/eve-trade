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

console.log('Documentation governance checks passed.');
