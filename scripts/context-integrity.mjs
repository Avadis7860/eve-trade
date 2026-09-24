#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MAP_FILE = path.join(ROOT, '.eve-trade', 'context-map.json');
const WORK_FILE = path.join(ROOT, '.eve-trade', 'current-work.json');
let failed = false;

function fail(message) {
  console.error('[context-integrity] FAIL:', message);
  failed = true;
}

function exists(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) return false;
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`cannot parse ${label}: ${error.message}`); return null; }
}

function workflowJobIds(source, workflowPath) {
  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex < 0) {
    fail(`${workflowPath}: missing jobs section`);
    return new Set();
  }
  const ids = new Set();
  for (let index = jobsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && line.trim() !== '') break;
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (match) ids.add(match[1]);
  }
  return ids;
}

const map = readJson(MAP_FILE, '.eve-trade/context-map.json');
const work = readJson(WORK_FILE, '.eve-trade/current-work.json');
const mode = process.env.CONTEXT_MODE || 'active';

if (!map || !work) process.exit(1);
if (!['active', 'stable'].includes(mode)) fail('CONTEXT_MODE must be active or stable');

if (map.schema_version !== 2) fail('unsupported context map schema_version');
if (work.schema_version !== 1) fail('unsupported current-work schema_version');
if (Object.prototype.hasOwnProperty.call(map, 'current_work')) fail('stable context map must not embed current work state');
if (map.read_sequence?.[0] !== '.eve-trade/current-work.json') fail('read_sequence must start with current-work manifest');

if (typeof work.branch !== 'string' || !work.branch) fail('current work branch is missing');
if (!(work.pull_request === null || (Number.isInteger(work.pull_request) && work.pull_request > 0))) fail('current work pull_request must be null or a positive integer');
if (work.base_branch !== 'main') fail('current work base_branch is not main');
if (!/^[0-9a-f]{40}$/.test(work.base_sha || '')) fail('current work base_sha is not a full SHA');
if (work.delivery_rule !== 'one_chantier_one_branch_one_pr') fail('current work delivery_rule is invalid');

for (const file of map.read_sequence || []) if (!exists(file)) fail('missing read-sequence file: ' + file);

const workflowCache = new Map();
function checkWorkflowLane(lane, context) {
  if (!lane || typeof lane.workflow !== 'string' || typeof lane.job !== 'string') {
    fail(`${context}: invalid ci_lanes entry`);
    return;
  }
  if (!exists(lane.workflow)) {
    fail(`${context}: missing workflow file ${lane.workflow}`);
    return;
  }
  let ids = workflowCache.get(lane.workflow);
  if (!ids) {
    ids = workflowJobIds(fs.readFileSync(path.join(ROOT, lane.workflow), 'utf8'), lane.workflow);
    workflowCache.set(lane.workflow, ids);
  }
  if (!ids.has(lane.job)) fail(`${context}: CI job does not exist: ${lane.workflow}#${lane.job}`);
}

for (const [domainName, domain] of Object.entries(map.domains || {})) {
  if (!Array.isArray(domain.canonical_code) || domain.canonical_code.length === 0) fail(`${domainName}: no canonical_code`);
  if (!Array.isArray(domain.tests) || domain.tests.length === 0) fail(`${domainName}: no tests`);
  for (const key of ['canonical_code', 'contracts', 'invariants', 'decisions', 'tests']) {
    for (const file of domain[key] || []) if (!exists(file)) fail(`${domainName}: missing referenced path ${file}`);
  }
  if (!Array.isArray(domain.ci_lanes) || domain.ci_lanes.length === 0) fail(`${domainName}: no ci_lanes`);
  for (const lane of domain.ci_lanes) checkWorkflowLane(lane, domainName);
}

for (const file of map.history?.current_documents || []) if (!exists(file)) fail('history: missing current document ' + file);

for (const [hotspotGroup, paths] of Object.entries(map.hotspots || {})) {
  if (hotspotGroup === 'rule') continue;
  for (const file of paths || []) if (!exists(file)) fail(`hotspot ${hotspotGroup}: missing referenced path ${file}`);
}

let packageJson;
try { packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); }
catch (error) { fail('cannot parse package.json: ' + error.message); packageJson = {}; }
if (!packageJson.scripts?.['test:context']) fail('package.json is missing test:context');

if (mode === 'active') {
  const envBranch = process.env.CONTEXT_BRANCH || process.env.GITHUB_HEAD_REF || '';
  const envPr = process.env.CONTEXT_PR_NUMBER || process.env.PR_NUMBER || '';
  const envBase = process.env.CONTEXT_BASE_SHA || process.env.GITHUB_BASE_SHA || '';
  if (envBranch && envBranch !== work.branch) fail(`active work branch mismatch: manifest=${work.branch} environment=${envBranch}`);
  if (envPr && work.pull_request !== null && Number(work.pull_request) !== Number(envPr)) fail(`active work PR mismatch: manifest=${work.pull_request} environment=${envPr}`);
  if (envBase && envBase !== work.base_sha) fail(`active work base SHA mismatch: manifest=${work.base_sha} environment=${envBase}`);

  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (path.resolve(gitRoot) !== path.resolve(ROOT)) fail('run test:context from repository root');
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (branch && branch !== work.branch) fail(`working branch mismatch: manifest=${work.branch} local=${branch}`);
  } catch (error) {
    fail('git repository verification failed: ' + error.message);
  }
} else {
  console.log('[context-integrity] Stable mode: active branch/PR/base matching is delegated to PR certification.');
}
if (failed) {
  console.error('[context-integrity] Context metadata is stale or inconsistent.');
  process.exit(1);
}

console.log('[context-integrity] Stable context map and active work manifest references passed.');
