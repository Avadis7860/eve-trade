import fs from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const workflow = process.env.GITHUB_WORKFLOW || 'unknown';
const runSha = process.env.GITHUB_SHA || 'unknown';
const certifiedSha = process.env.CI_CERTIFIED_SHA || runSha;
const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'unknown';
const attempt = Number(process.env.GITHUB_RUN_ATTEMPT || '1');

if (!token || !repository || !runId) {
  throw new Error('GitHub Actions observability requires GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_RUN_ID.');
}

const apiBase = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'eve-trade-ci-observability',
};

const getJson = async (path) => {
  const response = await fetch(apiBase + path, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${path}: ${body.slice(0, 500)}`);
  }
  return response.json();
};

const durationSeconds = (start, end) => {
  if (!start || !end) return null;
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(3)) : null;
};

const classifyStep = (name) => {
  const normalized = name.toLowerCase();
  if (normalized.includes('npm ci') || normalized.includes('install dependencies')) return 'npm_install';
  if (normalized.includes('playwright install') || normalized.includes('install chromium')) return 'browser_setup';
  if (normalized.includes('build')) return 'build';
  if (normalized.includes('test') || normalized.includes('check') || normalized.includes('typecheck') || normalized.includes('smoke')) return 'test_or_check';
  return 'other';
};

const run = await getJson(`/repos/${repository}/actions/runs/${runId}`);
const jobsResponse = await getJson(`/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`);
const historyResponse = await getJson(`/repos/${repository}/actions/workflows/${run.workflow_id}/runs?per_page=50`);

const jobs = jobsResponse.jobs.map((job) => ({
  id: job.id,
  name: job.name,
  status: job.status,
  conclusion: job.conclusion,
  started_at: job.started_at,
  completed_at: job.completed_at,
  queue_seconds: durationSeconds(job.created_at, job.started_at),
  duration_seconds: durationSeconds(job.started_at, job.completed_at),
  steps: (job.steps || []).map((step) => ({
    number: step.number,
    name: step.name,
    status: step.status,
    conclusion: step.conclusion,
    started_at: step.started_at,
    completed_at: step.completed_at,
    duration_seconds: durationSeconds(step.started_at, step.completed_at),
    category: classifyStep(step.name),
  })),
}));

const recentRuns = historyResponse.workflow_runs || [];
const completedRuns = recentRuns.filter((item) => item.status === 'completed');
const currentBranchRuns = completedRuns.filter((item) => item.head_branch === (process.env.GITHUB_HEAD_REF || ref));
const countBy = (items, key) => items.reduce((acc, item) => {
  const value = item[key] || 'unknown';
  acc[value] = (acc[value] || 0) + 1;
  return acc;
}, {});

const workflowDurations = completedRuns
  .map((item) => durationSeconds(item.run_started_at, item.updated_at))
  .filter((value) => value !== null)
  .sort((a, b) => a - b);
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index];
};
const history = {
  sampled_runs: completedRuns.length,
  conclusions: countBy(completedRuns, 'conclusion'),
  rerun_runs: completedRuns.filter((item) => Number(item.run_attempt || 1) > 1).length,
  cancellation_rate: completedRuns.length
    ? Number(((completedRuns.filter((item) => item.conclusion === 'cancelled').length / completedRuns.length) * 100).toFixed(1))
    : 0,
  workflow_duration_seconds: {
    median: percentile(workflowDurations, 0.5),
    p95: percentile(workflowDurations, 0.95),
    minimum: workflowDurations[0] ?? null,
    maximum: workflowDurations[workflowDurations.length - 1] ?? null,
  },
  same_branch_sampled_runs: currentBranchRuns.length,
  same_branch_conclusions: countBy(currentBranchRuns, 'conclusion'),
};

const metrics = {
  schema_version: 1,
  collected_at: new Date().toISOString(),
  workflow: {
    id: run.workflow_id,
    name: run.name,
    run_id: run.id,
    run_number: run.run_number,
    run_attempt: run.run_attempt,
    event: run.event,
    ref,
    head_branch: run.head_branch,
    sha,
    status: run.status,
    conclusion: run.conclusion,
    run_started_at: run.run_started_at,
    updated_at: run.updated_at,
    elapsed_seconds_at_collection: durationSeconds(run.run_started_at, new Date().toISOString()),
  },
  jobs,
  history,
};

fs.mkdirSync(process.env.RUNNER_TEMP || '.', { recursive: true });
const outputPath = process.env.CI_OBSERVABILITY_FILE || `${process.env.RUNNER_TEMP}/ci-observability.json`;
fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2) + '\n');

const summary = [];
summary.push('## CI Observability');
summary.push('');
summary.push(`- Certified head: \`${certifiedSha}\``);\nsummary.push(`- Workflow run SHA: \`${runSha}\``);
summary.push(`- Run: \`${run.run_id}\` / attempt \`${attempt}\``);
summary.push(`- Event: \`${run.event}\``);
summary.push(`- Workflow elapsed at collection: \`${metrics.workflow.elapsed_seconds_at_collection ?? 'n/a'} s\``);
summary.push(`- Recent completed runs sampled: \`${history.sampled_runs}\``);
summary.push(`- Recent cancellation rate: \`${history.cancellation_rate}%\``);
summary.push(`- Recent rerun runs: \`${history.rerun_runs}\``);
summary.push('');
summary.push('| Job | Conclusion | Queue (s) | Duration (s) |');
summary.push('|---|---|---:|---:|');
for (const job of jobs) {
  summary.push(`| ${job.name} | ${job.conclusion ?? job.status} | ${job.queue_seconds ?? 'n/a'} | ${job.duration_seconds ?? 'n/a'} |`);
}
summary.push('');
summary.push('### Slowest observed steps');
summary.push('');
summary.push('| Category | Step | Duration (s) |');
summary.push('|---|---|---:|');
const slowSteps = jobs.flatMap((job) => job.steps.map((step) => ({ job: job.name, ...step })))
  .filter((step) => step.duration_seconds !== null)
  .sort((a, b) => b.duration_seconds - a.duration_seconds)
  .slice(0, 10);
for (const step of slowSteps) {
  summary.push(`| ${step.category} | ${step.job} — ${step.name} | ${step.duration_seconds} |`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) fs.appendFileSync(summaryPath, summary.join('\n') + '\n');
console.log(summary.join('\n'));
