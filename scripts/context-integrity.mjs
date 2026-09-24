#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyPaths } from './ci-scope.mjs';

const ROOT = process.cwd();
const MAP_FILE = path.join(ROOT, '.eve-trade', 'context-map.json');
const WORK_FILE = path.join(ROOT, '.eve-trade', 'current-work.json');
const CURRENT_STATE_FILE = path.join(ROOT, 'docs', 'state', 'current-state.md');
const BOOTSTRAP_REQUIRED = [
  'AGENTS.md',
  'GEMINI.md',
  'CONTRIBUTING.md',
  'docs/index.md',
  'docs/documentation-guide.md',
  'docs/state/current-state.md',
  'docs/state/truth-matrix.md',
  'docs/roadmap/current-chunk.md',
  'docs/roadmap/master-plan.md',
  'docs/roadmap/backlog.md',
  'docs/contracts/index.md',
  'docs/invariants/index.md',
  'docs/validation/index.md',
  'docs/domains/index.md',
  'docs/operations/index.md',
  'docs/architecture/index.md',
  'docs/operations/agent-context.md',
  '.eve-trade/context-map.json',
  '.eve-trade/current-work.json',
  'scripts/context-integrity.mjs',
  'scripts/ci-scope.mjs',
];

function exists(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split('/').includes('..')
  ) return false;
  return fs.existsSync(path.join(ROOT, relativePath));
}

function fail(message) {
  console.error('[context-integrity] FAIL:', message);
  return false;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${label}: ${error.message}`);
    return null;
  }
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
let failed = false;
const mark = (condition, message) => {
  if (!condition) {
    fail(message);
    failed = true;
  }
};

if (!map || !work) process.exit(1);
mark(['active', 'stable'].includes(mode), 'CONTEXT_MODE must be active or stable');
mark(map.schema_version === 4, 'unsupported context map schema_version');
mark(map.ci_routing?.route_property === 'ci_lanes[].route', 'context map must declare functional CI routing semantics');
mark(work.schema_version === 2, 'unsupported current-work schema_version');
mark(['ACTIVE', 'CLOSING', 'IDLE'].includes(work.state), 'current-work state must be ACTIVE, CLOSING or IDLE');
mark(!Object.prototype.hasOwnProperty.call(map, 'current_work'), 'stable context map must not embed current work state');
mark(map.read_sequence?.[0] === '.eve-trade/current-work.json', 'read_sequence must start with current-work manifest');

for (const file of BOOTSTRAP_REQUIRED) mark(exists(file), 'missing bootstrap-critical file: ' + file);
for (const file of map.read_sequence || []) mark(exists(file), 'missing read-sequence file: ' + file);

const agents = exists('AGENTS.md') ? fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8') : '';
const gemini = exists('GEMINI.md') ? fs.readFileSync(path.join(ROOT, 'GEMINI.md'), 'utf8') : '';
mark(agents.includes('.eve-trade/context-map.json') && agents.includes('.eve-trade/current-work.json'), 'AGENTS.md must expose both context layers');
mark(gemini.includes('.eve-trade/context-map.json') && gemini.includes('.eve-trade/current-work.json'), 'GEMINI.md must expose both context layers');
const currentState = exists('docs/state/current-state.md') ? fs.readFileSync(CURRENT_STATE_FILE, 'utf8') : '';

const workflowCache = new Map();
function checkWorkflowLane(lane, context) {
  mark(
    lane && typeof lane.workflow === 'string' && typeof lane.job === 'string',
    `${context}: invalid ci_lanes entry`
  );
  if (!lane || typeof lane.workflow !== 'string' || typeof lane.job !== 'string') return;
  const supportedRoutes = new Set(Object.keys(map.ci_routing?.classes || {}));

  if (!exists(lane.workflow)) {
    fail(`${context}: missing workflow file ${lane.workflow}`);
    failed = true;
    return;
  }
  let ids = workflowCache.get(lane.workflow);
  if (!ids) {
    ids = workflowJobIds(fs.readFileSync(path.join(ROOT, lane.workflow), 'utf8'), lane.workflow);
    workflowCache.set(lane.workflow, ids);
  }
  mark(ids.has(lane.job), `${context}: CI job does not exist: ${lane.workflow}#${lane.job}`);
  mark(supportedRoutes.has(lane.route), `${context}: unsupported functional routing class ${lane.route}`);
}

function checkRouting(domainName, domain) {
  const probes = (domain.canonical_code || [])
    .filter((file) => typeof file === 'string' && exists(file))
    .map((file) => ({ file, result: classifyPaths([file], { respectContextCritical: false }) }));

  mark(probes.length > 0, `${domainName}: no routable canonical_code path`);

  for (const lane of domain.ci_lanes || []) {
    if (lane.workflow === '.github/workflows/ci.yml') {
      const outputByJob = {
        static: 'run_static',
        unit_domain: 'run_unit_domain',
        server: 'run_server',
        build: 'run_build',
        'browser-auth': 'run_browser',
        'browser-operations': 'run_browser',
      };
      const output = outputByJob[lane.job];
      if (lane.route) {
        mark(
          probes.some(({ result }) => result[lane.route] === true),
          `${domainName}: canonical paths do not classify for routing class ${lane.route}`
        );
        if (output) {
          mark(
            probes.some(({ result }) => result[lane.route] === true && result[output] === true),
            `${domainName}: routing class ${lane.route} does not activate CI output ${output}`
          );
        }
      }
    }
    if (lane.workflow === '.github/workflows/phase-2.7c-sde.yml' && lane.job === 'sde-truth' && lane.route) {
      mark(
        probes.some(({ result }) => result[lane.route] === true),
        `${domainName}: no canonical path classifies for routing class ${lane.route}`
      );
    }
  }
}

for (const [domainName, domain] of Object.entries(map.domains || {})) {
  mark(Array.isArray(domain.canonical_code) && domain.canonical_code.length > 0, `${domainName}: no canonical_code`);
  mark(Array.isArray(domain.tests) && domain.tests.length > 0, `${domainName}: no tests`);
  for (const key of ['canonical_code', 'contracts', 'invariants', 'decisions', 'tests']) {
    for (const file of domain[key] || []) mark(exists(file), `${domainName}: missing referenced path ${file}`);
  }
  mark(Array.isArray(domain.ci_lanes) && domain.ci_lanes.length > 0, `${domainName}: no ci_lanes`);
  for (const lane of domain.ci_lanes || []) checkWorkflowLane(lane, domainName);
  checkRouting(domainName, domain);
}

for (const document of Object.values(map.domain_documentation || {})) {
  mark(Array.isArray(document), 'domain_documentation entries must be arrays');
  for (const mapDomain of document || []) mark(Boolean(map.domains?.[mapDomain]), `domain_documentation references unknown map domain: ${mapDomain}`);
}

for (const [edgeIndex, edge] of (map.impact_chains || []).entries()) {
  mark(
    Array.isArray(edge) && edge.length === 2 && edge.every((name) => Boolean(map.domains?.[name])),
    `impact_chains[${edgeIndex}] references an unknown domain`
  );
}

for (const file of map.history?.current_documents || []) mark(exists(file), 'history: missing current document ' + file);

for (const [hotspotGroup, paths] of Object.entries(map.hotspots || {})) {
  if (hotspotGroup === 'rule') continue;
  for (const file of paths || []) mark(exists(file), `hotspot ${hotspotGroup}: missing referenced path ${file}`);
}

let packageJson = {};
try {
  packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
} catch (error) {
  fail('cannot parse package.json: ' + error.message);
  failed = true;
}
mark(Boolean(packageJson.scripts?.['test:context']), 'package.json is missing test:context');

if (mode === 'active') {
  mark(work.state !== 'IDLE', 'active context cannot use IDLE state');
  const envBranch = process.env.CONTEXT_BRANCH || process.env.GITHUB_HEAD_REF || '';
  const envPr = process.env.CONTEXT_PR_NUMBER || process.env.PR_NUMBER || '';
  const envBase = process.env.CONTEXT_BASE_SHA || process.env.GITHUB_BASE_SHA || '';

  mark(Boolean(envBranch) && envBranch === work.branch, `active work branch mismatch: manifest=${work.branch} environment=${envBranch}`);
  mark(work.pull_request !== null && Boolean(envPr) && Number(work.pull_request) === Number(envPr), `active work PR mismatch: manifest=${work.pull_request} environment=${envPr}`);
  mark(Boolean(envBase) && envBase === work.base_sha, `active work base SHA mismatch: manifest=${work.base_sha} environment=${envBase}`);
  mark(currentState.includes(work.base_sha), 'current-state must identify the active PR base SHA');

  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
    mark(path.resolve(gitRoot) === path.resolve(ROOT), 'run test:context from repository root');
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
    mark(!branch || branch === work.branch, `working branch mismatch: manifest=${work.branch} local=${branch}`);
  } catch (error) {
    fail('git repository verification failed: ' + error.message);
    failed = true;
  }
} else {
  mark(work.state !== 'ACTIVE', 'stable main context cannot remain ACTIVE after a delivery is merged');
  let anchor = '';
  let head = '';
  try {
    const commitMetadata = execFileSync('git', ['show', '-s', '--format=%H %P', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\s+/);
    head = commitMetadata[0] || '';
    anchor = commitMetadata[1] || head;
  } catch (error) {
    fail('git stable-anchor verification failed: ' + error.message);
    failed = true;
  }
  if (anchor) {
    mark(currentState.includes(anchor), `current-state must identify stable integration anchor ${anchor}`);
    mark(work.base_sha === anchor, `stable integration anchor mismatch: manifest=${work.base_sha} git-first-parent=${anchor}`);
  }
}

if (failed) {
  console.error('[context-integrity] Context metadata is stale or inconsistent.');
  process.exit(1);
}

console.log(`[context-integrity] Context validation passed in ${mode} mode (${work.state}).`);
