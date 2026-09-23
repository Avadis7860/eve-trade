#!/usr/bin/env node
import fs from 'node:fs';

export function classifyPaths(input) {
  const paths = Array.isArray(input)
    ? input.map((value) => String(value).trim()).filter(Boolean)
    : String(input ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);

  let frontend = false, domain = false, server = false, sde = false;
  let ci = false, config = false, tests = false, docs = false;
  let ambiguous = paths.length === 0;

  for (const path of paths) {
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
