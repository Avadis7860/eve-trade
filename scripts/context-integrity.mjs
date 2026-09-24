#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const MAP_FILE = path.join(ROOT, '.eve-trade', 'context-map.json');
let failed = false;
function fail(message) { console.error('[context-integrity] FAIL:', message); failed = true; }
function exists(relativePath) { return fs.existsSync(path.join(ROOT, relativePath)); }

let map;
try { map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); }
catch (error) { fail('cannot parse .eve-trade/context-map.json: ' + error.message); process.exit(1); }

if (map.schema_version !== 1) fail('unsupported context map schema_version');
if (map.current_work?.branch !== 'ux-03/allocation-contract') fail('current work branch is not ux-03/allocation-contract');
if (map.current_work?.pull_request !== 71) fail('current work PR is not 71');
if (map.current_work?.base_branch !== 'main') fail('current work base branch is not main');
if (!/^[0-9a-f]{40}$/.test(map.current_work?.base_sha || '')) fail('current work base_sha is not a full SHA');

for (const file of map.load_order || []) if (!exists(file)) fail('missing load-order file: ' + file);
for (const [domainName, domain] of Object.entries(map.domains || {})) {
  const references = [...(domain.canonical_code || []), ...(domain.contracts || []), ...(domain.invariants || []), ...(domain.decisions || []), ...(domain.tests || [])];
  if (!domain.canonical_code?.length) fail(domainName + ': no canonical_code');
  if (!domain.tests?.length) fail(domainName + ': no tests');
  for (const file of references) if (!exists(file)) fail(domainName + ': missing referenced path ' + file);
}

let packageJson;
try { packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); }
catch (error) { fail('cannot parse package.json: ' + error.message); packageJson = {}; }
if (!packageJson.scripts?.['test:context']) fail('package.json is missing test:context');

try {
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (path.resolve(gitRoot) !== path.resolve(ROOT)) fail('run test:context from repository root');
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (branch && branch !== map.current_work.branch) fail('working branch ' + branch + ' does not match context map');
  execFileSync('git', ['cat-file', '-e', map.current_work.base_sha], { cwd: ROOT, stdio: 'ignore' });
} catch (error) { fail('git repository/base SHA verification failed: ' + error.message); }

if (failed) { console.error('[context-integrity] Context metadata is stale or inconsistent.'); process.exit(1); }
console.log('[context-integrity] Context map references and working-context contract passed.');
