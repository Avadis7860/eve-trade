#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WORK_FILE = path.join(ROOT, '.eve-trade', 'current-work.json');

function value(name, fallback = '') {
  const result = process.env[name];
  return typeof result === 'string' && result.length > 0 ? result : fallback;
}

const branch = value('CONTEXT_BRANCH', value('GITHUB_HEAD_REF'));
const baseBranch = value('CONTEXT_BASE_BRANCH', value('GITHUB_BASE_REF', 'main'));
const baseSha = value('CONTEXT_BASE_SHA', value('GITHUB_BASE_SHA'));
const prRaw = value('CONTEXT_PR_NUMBER');
const pr = prRaw ? Number(prRaw) : null;

if (!branch) {
  console.error('[context-work] CONTEXT_BRANCH or GITHUB_HEAD_REF is required');
  process.exit(1);
}
if (!baseSha) {
  console.error('[context-work] CONTEXT_BASE_SHA or GITHUB_BASE_SHA is required');
  process.exit(1);
}
if (prRaw && !Number.isInteger(pr)) {
  console.error('[context-work] CONTEXT_PR_NUMBER must be an integer');
  process.exit(1);
}

const manifest = {
  schema_version: 3,
  purpose: 'Ephemeral checkout-scoped state for the currently active technical chantier. Never persist this file on stable main.',
  state: 'ACTIVE',
  branch,
  pull_request: pr,
  base_branch: baseBranch,
  base_sha: baseSha,
  delivery_rule: 'one_chantier_one_branch_one_pr',
};

fs.mkdirSync(path.dirname(WORK_FILE), { recursive: true });
fs.writeFileSync(WORK_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('[context-work] generated active manifest for ' + branch + (pr === null ? '' : ' / PR #' + pr));
