#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyPaths } from './ci-scope.mjs';

const ROOT = process.cwd();
const MAP_FILE = path.join(ROOT, '.eve-trade', 'context-map.json');

const BOOTSTRAP_REQUIRED = [
  'AGENTS.md',
  'GEMINI.md',
  'CONTRIBUTING.md',
  'docs/index.md',
  'docs/documentation-guide.md',
  'docs/state/current-state.md',
  'docs/state/truth-matrix.md',
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
  'scripts/context-integrity.mjs',
  'scripts/ci-scope.mjs',
];

const FORBIDDEN_CONTEXT_ARTIFACTS = [
  '.eve-trade/current-work.json',
  '.eve-trade/stable-context.json',
  'scripts/context-work.mjs',
  'docs/roadmap/current-chunk.md',
];

function exists(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) return false;
  return fs.existsSync(path.join(ROOT, relativePath));
}

function fail(message) {
  console.error('[context-integrity] FAIL:', message);
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail('cannot parse ' + label + ': ' + error.message); return null; }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function workflowJobIds(source, workflowPath) {
  const lines = source.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndex < 0) { fail(workflowPath + ': missing jobs section'); return new Set(); }
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
const mode = process.env.CONTEXT_MODE || 'active';
let failed = false;
const mark = (condition, message) => { if (!condition) { fail(message); failed = true; } };

if (!map) process.exit(1);
mark(['active', 'stable'].includes(mode), 'CONTEXT_MODE must be active or stable');
mark(map.schema_version === 5, 'unsupported context map schema_version');
mark(map.ci_routing?.route_property === 'ci_lanes[].route', 'context map must declare functional CI routing semantics');
mark(map.delivery_authority?.work_tracking === 'github_issue_and_pull_request', 'context map must declare GitHub as the delivery authority');
mark(Array.isArray(map.read_sequence) && map.read_sequence.length >= 3, 'context map read_sequence is too small');
mark(!map.read_sequence?.some((entry) => FORBIDDEN_CONTEXT_ARTIFACTS.includes(entry)), 'read_sequence must not reference removed context artifacts');

for (const file of FORBIDDEN_CONTEXT_ARTIFACTS) mark(!exists(file), 'forbidden context artifact must not exist: ' + file);
for (const file of BOOTSTRAP_REQUIRED) mark(exists(file), 'missing bootstrap-critical file: ' + file);
for (const file of map.read_sequence || []) mark(exists(file), 'missing read-sequence file: ' + file);

const agents = exists('AGENTS.md') ? fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8') : '';
const gemini = exists('GEMINI.md') ? fs.readFileSync(path.join(ROOT, 'GEMINI.md'), 'utf8') : '';
mark(/(?:GitHub Issue|Issue GitHub)/.test(agents) && /Pull Request/.test(agents) && agents.includes('.eve-trade/context-map.json'), 'AGENTS.md must expose GitHub delivery authority and stable navigation');
mark(gemini.includes('Issue GitHub') && gemini.includes('Pull Request') && gemini.includes('.eve-trade/context-map.json'), 'GEMINI.md must expose GitHub delivery authority and stable navigation');

const currentState = exists('docs/state/current-state.md') ? fs.readFileSync(path.join(ROOT, 'docs/state/current-state.md'), 'utf8') : '';
mark(!currentState.includes('Active PR context') && !currentState.includes('Current chantier / sequencing'), 'current-state must not contain live delivery sections');
mark(currentState.includes('Delivery sequencing'), 'current-state must preserve durable delivery sequencing guidance');

const workflowCache = new Map();
function checkWorkflowLane(lane, context) {
  mark(lane && typeof lane.workflow === 'string' && typeof lane.job === 'string', context + ': invalid ci_lanes entry');
  if (!lane || typeof lane.workflow !== 'string' || typeof lane.job !== 'string') return;
  const supportedRoutes = new Set(Object.keys(map.ci_routing?.classes || {}));
  if (!exists(lane.workflow)) { fail(context + ': missing workflow file ' + lane.workflow); failed = true; return; }
  let ids = workflowCache.get(lane.workflow);
  if (!ids) { ids = workflowJobIds(fs.readFileSync(path.join(ROOT, lane.workflow), 'utf8'), lane.workflow); workflowCache.set(lane.workflow, ids); }
  mark(ids.has(lane.job), context + ': CI job does not exist: ' + lane.workflow + '#' + lane.job);
  mark(supportedRoutes.has(lane.route), context + ': unsupported functional routing class ' + lane.route);
}

function checkRouting(domainName, domain) {
  const probes = (domain.canonical_code || []).filter((file) => typeof file === 'string' && exists(file)).map((file) => ({ result: classifyPaths([file], { respectContextCritical: false }) }));
  mark(probes.length > 0, domainName + ': no routable canonical_code path');
  for (const lane of domain.ci_lanes || []) {
    if (lane.workflow === '.github/workflows/ci.yml') {
      const outputByJob = { static: 'run_static', unit_domain: 'run_unit_domain', server: 'run_server', build: 'run_build', 'browser-auth': 'run_browser', 'browser-operations': 'run_browser' };
      const output = outputByJob[lane.job];
      if (lane.route) {
        mark(probes.some(({ result }) => result[lane.route] === true), domainName + ': canonical paths do not classify for routing class ' + lane.route);
        if (output) mark(probes.some(({ result }) => result[lane.route] === true && result[output] === true), domainName + ': routing class ' + lane.route + ' does not activate CI output ' + output);
      }
    }
    if (lane.workflow === '.github/workflows/phase-2.7c-sde.yml' && lane.job === 'sde-truth' && lane.route) mark(probes.some(({ result }) => result[lane.route] === true), domainName + ': no canonical path classifies for routing class ' + lane.route);
  }
}

for (const [domainName, domain] of Object.entries(map.domains || {})) {
  mark(Array.isArray(domain.canonical_code) && domain.canonical_code.length > 0, domainName + ': no canonical_code');
  mark(Array.isArray(domain.tests) && domain.tests.length > 0, domainName + ': no tests');
  for (const key of ['canonical_code', 'contracts', 'invariants', 'decisions', 'tests']) for (const file of domain[key] || []) mark(exists(file), domainName + ': missing referenced path ' + file);
  mark(Array.isArray(domain.ci_lanes) && domain.ci_lanes.length > 0, domainName + ': no ci_lanes');
  for (const lane of domain.ci_lanes || []) checkWorkflowLane(lane, domainName);
  checkRouting(domainName, domain);
}

for (const document of Object.values(map.domain_documentation || {})) {
  mark(Array.isArray(document), 'domain_documentation entries must be arrays');
  for (const mapDomain of document || []) mark(Boolean(map.domains?.[mapDomain]), 'domain_documentation references unknown map domain: ' + mapDomain);
}

for (const [edgeIndex, edge] of (map.impact_chains || []).entries()) mark(Array.isArray(edge) && edge.length === 2 && edge.every((name) => Boolean(map.domains?.[name])), 'impact_chains[' + edgeIndex + '] references an unknown domain');
for (const file of map.history?.current_documents || []) mark(exists(file), 'history: missing current document ' + file);
for (const [hotspotGroup, paths] of Object.entries(map.hotspots || {})) if (hotspotGroup !== 'rule') for (const file of paths || []) mark(exists(file), 'hotspot ' + hotspotGroup + ': missing referenced path ' + file);

try {
  const head = git(['rev-parse', '--verify', 'HEAD']);
  mark(/^[0-9a-f]{40}$/.test(head), 'git HEAD must resolve to a full commit SHA');
  const expectedHead = process.env.CONTEXT_HEAD_SHA || process.env.GITHUB_SHA || '';
  if (expectedHead) mark(head === expectedHead, 'checkout HEAD mismatch: git=' + head + ' expected=' + expectedHead);
  const branch = git(['branch', '--show-current']);
  const envBranch = process.env.CONTEXT_BRANCH || process.env.GITHUB_HEAD_REF || '';
  if (mode === 'active') {
    mark(Boolean(branch || envBranch), 'active context must have a branch identity');
    if (envBranch) mark(!branch || branch === envBranch, 'active branch mismatch: git=' + branch + ' environment=' + envBranch);
    const baseBranch = process.env.CONTEXT_BASE_BRANCH || process.env.GITHUB_BASE_REF || '';
    const baseSha = process.env.CONTEXT_BASE_SHA || process.env.GITHUB_BASE_SHA || '';
    if (process.env.GITHUB_ACTIONS === 'true' || process.env.GITHUB_HEAD_REF) {
      mark(baseBranch === 'main', 'active PR base branch must be main, got ' + baseBranch);
      mark(/^[0-9a-f]{40}$/.test(baseSha), 'active PR must expose a full base SHA');
      if (/^[0-9a-f]{40}$/.test(baseSha)) execFileSync('git', ['cat-file', '-e', baseSha + '^{commit}'], { cwd: ROOT, stdio: 'ignore' });
    }
  } else {
    const envRef = process.env.GITHUB_REF_NAME || '';
    if (envRef) mark(envRef === 'main', 'stable CI ref must be main, got ' + envRef);
  }
} catch (error) {
  fail('git checkout verification failed: ' + error.message);
  failed = true;
}

if (failed) {
  console.error('[context-integrity] Context metadata or repository navigation is inconsistent.');
  process.exit(1);
}
console.log('[context-integrity] Context validation passed in ' + mode + ' mode.');
