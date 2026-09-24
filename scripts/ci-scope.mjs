#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadContextCriticalPaths() {
  const file = '.eve-trade/context-map.json';
  const critical = new Set([
    '.eve-trade/context-map.json',
    '.eve-trade/current-work.json',
    'docs/operations/agent-context.md',
    'scripts/context-integrity.mjs',
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
  ]);
  if (!fs.existsSync(file)) return critical;
  try {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const domain of Object.values(map.domains || {})) {
      for (const key of ['canonical_code', 'contracts', 'invariants', 'decisions', 'tests']) {
        for (const path of domain[key] || []) critical.add(path);
      }
    }
    for (const path of map.history?.current_documents || []) critical.add(path);
    for (const paths of Object.values(map.hotspots || {})) {
      if (Array.isArray(paths)) for (const path of paths) critical.add(path);
    }
  } catch {
    critical.add(file);
  }
  return critical;
}

const CONTEXT_CRITICAL_PATHS = loadContextCriticalPaths();
export function classifyPaths(input) {
  const paths = Array.isArray(input)
    ? input.map((value) => String(value).trim()).filter(Boolean)
    : String(input ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);

  let frontend = false, domain = false, server = false, sde = false;
  let ci = false, config = false, tests = false, docs = false;
  let ambiguous = paths.length === 0;

  for (const path of paths) {
    if (path.startsWith('.eve-trade/') || CONTEXT_CRITICAL_PATHS.has(path)) {
      ambiguous = true;
      if (path.startsWith('docs/')) docs = true;
      continue;
    }
    if (path.startsWith('.github/workflows/') || path === '.github/dependabot.yml') ci = true;
    else if (path.startsWith('src/engine/')) domain = true;
    else if (path.startsWith('src/services/') || path.startsWith('server/') || path === 'server.ts') server = true;
    else if (
      path === 'src/data/universeGraph.json' ||
      path === 'src/data/universeGraphManifest.ts' ||
      path === 'scripts/build-universe-graph.mjs' ||
      path === 'scripts/universe-graph-builder.mjs' ||
      path === 'scripts/write-universe-graph-manifest.mjs' ||
      path === 'scripts/__tests__/universe_graph_builder.test.mjs'
    ) sde = true;
    else if (
      path.startsWith('src/components/') || path.startsWith('src/pages/') ||
      path.startsWith('src/hooks/') || path === 'src/App.tsx' ||
      path === 'src/App.jsx' || path === 'src/main.tsx' ||
      path === 'src/main.jsx' || path.startsWith('public/')
    ) frontend = true;
    else if (
      path.startsWith('tests/') || path.includes('/__tests__/') ||
      path.endsWith('.test.ts') || path.endsWith('.test.tsx') ||
      path.endsWith('.test.mjs')
    ) tests = true;
    else if (
      path === 'package.json' || path === 'package-lock.json' ||
      path.startsWith('tsconfig') || path.startsWith('vite.config.') ||
      path.startsWith('postcss.config.') || path.startsWith('tailwind.config.')
    ) config = true;
    else if (path.startsWith('docs/') || path === 'CONTRIBUTING.md' || path === 'README.md') docs = true;
    else ambiguous = true;
  }

  const full_certification = ambiguous || ci || config || domain || server || sde || tests;

  return {
    frontend, domain, server, sde, ci, config, tests, docs, ambiguous,
    full_certification,
    run_static: full_certification || frontend,
    run_unit_domain: full_certification,
    run_server: full_certification,
    run_build: full_certification || frontend,
    run_browser: full_certification || frontend,
  };
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const result = classifyPaths(fs.readFileSync(0, 'utf8'));
  const lines = Object.entries(result).map(([key, value]) => key + '=' + value);

  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '## Change Scope', '',
      '| Domain | Changed |', '|---|---:|',
      '| Frontend | ' + result.frontend + ' |',
      '| Engine/domain | ' + result.domain + ' |',
      '| Server/API/ESI | ' + result.server + ' |',
      '| SDE/data | ' + result.sde + ' |',
      '| CI/workflows | ' + result.ci + ' |',
      '| Package/config | ' + result.config + ' |',
      '| Tests | ' + result.tests + ' |',
      '| Documentation | ' + result.docs + ' |',
      '| Ambiguous/unclassified | ' + result.ambiguous + ' |', ''
    ];
    summary.push(
      result.full_certification
        ? '**Conservative fallback:** full certification remains required for this scope.'
        : result.run_static
          ? '**Targeted certification:** frontend/static proof is required; domain/server certification is not.'
          : '**Documentation-only scope:** execution lanes remain skipped; only routing is evaluated.'
    );
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
  } else {
    process.stdout.write(lines.join('\n') + '\n');
  }
}
