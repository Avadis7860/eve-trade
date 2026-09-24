#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MAP_FILE = path.join(ROOT, '.eve-trade', 'context-map.json');
const WORK_FILE = path.join(ROOT, '.eve-trade', 'current-work.json');
let failed = false;
function fail(message) { console.error('[context-integrity] FAIL:', message); failed = true; }
function exists(relativePath) { return fs.existsSync(path.join(ROOT, relativePath)); }

let map;
try { map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
catch (error) { fail('cannot parse .eve-trade/context-map.json: ' + error.message); process.exit(1); }

if (map.schema_version !== 1) fail('unsupported context map schema_version');
let work;
try { work = JSON.parse(fs.readFileSync(WORK_FILE, 'utf8')); }
catch (error) { fail('cannot parse .eve-trade/current-work.json: ' + error.message); work = {}; }

if (work.schema_version !== 1) fail('unsupported current-work schema_version');
if (typeof work.branch !== 'string' || !work.branch) fail('current work branch is missing');
if (!Number.isInteger(work.pull_request) || work.pull_request <= 0) fail('current work pull_request is invalid');
if (work.base_branch !== 'main') fail('current work base_branch is not main');
if (!/^[0-9a-f]{40}$/.test(work.base_sha || '')) fail('current work base_sha is not a full SHA');
if (map.load_order?.[0] !== '.eve-trade/current-work.json') fail('load-order must start with current-work manifest');

for (const file of map.load_order || []) if (!exists(file)) fail('missing load-order file: ' + file);
const workflowDir = path.join(ROOT, '.github', 'workflows');
const workflowSources = fs.readdirSync(workflowDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()
  .map((name) => fs.readFileSync(path.join(workflowDir, name), 'utf8'))
  .join('\n');
const workflowJobIds = new Set(
  [...workflowSources.matchAll(/^  ([A-Za-z0-9_-]+):[ \t]*$/gm)].map((match) => match[1]),
);

for (const [domainName, domain] of Object.entries(map.domains || {})) {
  const references = [...(domain.canonical_code || []), ...(domain.contracts || []), ...(domain.invariants || []), ...(domain.decisions || []), ...(domain.tests || [])];
  if (!domain.canonical_code?.length) fail(domainName + ': no canonical_code');
  if (!domain.tests?.length) fail(domainName + ': no tests');
  for (const file of references) if (!exists(file)) fail(domainName + ': missing referenced path ' + file);
  for (const lane of domain.ci_lanes || []) if (!workflowJobIds.has(lane)) fail(domainName + ': CI lane does not exist: ' + lane);
}

let packageJson;
try { packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); }
catch (error) { fail('cannot parse package.json: ' + error.message); packageJson = {}; }
if (!packageJson.scripts?.['test:context']) fail('package.json is missing test:context');

try {
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (path.resolve(gitRoot) !== path.resolve(ROOT)) fail('run test:context from repository root');
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (branch && branch !== 'main' && branch !== work.branch) fail('working branch ' + branch + ' does not match active work branch');
} catch (error) { fail('git repository/base SHA verification failed: ' + error.message); }

if (failed) { console.error('[context-integrity] Context metadata is stale or inconsistent.'); process.exit(1); }

console.log('[context-integrity] Context map, active work manifest, and CI lane references passed.');