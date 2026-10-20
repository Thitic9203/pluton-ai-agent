// The usage steps of agent.yml (docs/sdd/agent-office-live/spec.md R50, R59; tasks.md T26; security
// review of ca701944d B1, N2, N3). Right after each job's first checkout (main) and before the agent
// or the reviewer runs, main's parser is copied to $RUNNER_TEMP. After each claude-code-action step a
// step that runs whatever that step's result was, with no token, runs that copy on the execution
// file and hands the marker line on as a job output; when the copy fails it writes the
// missing:["parser"] fallback with the shell alone and exits 0, so no later step is skipped. The
// `usage` job, on a fresh runner, checks each line with main's code and posts it with an App token
// that may only write issues. The execution file is never uploaded, printed or summarised, and
// nothing lets a red step pass (scripts/lib/workflow-silent-pass.test.mjs).
//
// Run: TZ=UTC node --test scripts/lib/agent-usage-workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkMarkerLine } from '../agent/usage-marker.mjs';
import { USAGE_JOB_NAME } from '../../agent-office/lib/history.mjs';

const YAML = readFileSync(fileURLToPath(new URL('../../.github/workflows/agent.yml', import.meta.url)), 'utf8');
const ACTION = 'anthropics/claude-code-action@';
const PARSER = '"$RUNNER_TEMP/agent-office-usage/usage-marker.mjs"';

/** Map of job id to its YAML body, by two-space ids under the jobs mapping. */
function jobsOf(yaml) {
  const body = yaml.slice(yaml.search(/^jobs:\s*$/m));
  const heads = [...body.matchAll(/^  ([a-z][a-z0-9_-]*)\s*:\s*$/gm)];
  return new Map(heads.map((m, i) => [m[1], body.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : body.length)]));
}

/** The steps of a job, each as its text from its `- ` line to the next, comments left out. */
function stepsOf(job) {
  const lines = job.split('\n').filter((l) => !/^\s*#/.test(l));
  const steps = [];
  for (const l of lines) {
    if (/^ {6}- /.test(l)) steps.push(l);
    else if (steps.length && /^ {7,}\S/.test(l)) steps[steps.length - 1] += `\n${l}`;
  }
  return steps;
}

const field = (step, key) => step.match(new RegExp(`^ {6}[- ] ${key}:\\s*(.*)$`, 'm'))?.[1]?.trim();
const code = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
/** The shell of a step's `run: |` block, dedented. */
const runBlock = (step) => step.slice(step.indexOf('run: |') + 'run: |'.length + 1).split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n').trimEnd();

const ACTION_STEPS = [
  { job: 'agent', name: 'Work the issue', id: 'work', output: 'usage_work' },
  { job: 'review', name: 'Review the branch', id: 'review', output: 'usage_review' },
];

test('R50: there are exactly two claude-code-action steps, one per job named here', () => {
  const uses = [...jobsOf(YAML)].flatMap(([id, job]) => stepsOf(job).filter((s) => s.includes(ACTION)).map(() => id));
  assert.deepEqual(uses, ACTION_STEPS.map((a) => a.job));
});

for (const a of ACTION_STEPS) {
  test(`B1: in ${a.job}, main's parser is copied right after the first checkout, before any agent-written code or reviewer runs`, () => {
    const steps = stepsOf(jobsOf(YAML).get(a.job));
    const copy = steps.findIndex((s) => field(s, 'name') === "Keep main's usage parser");
    assert.ok(copy > 0, 'the copy step exists');
    const checkouts = steps.map((s, i) => [s, i]).filter(([s]) => s.includes('uses: actions/checkout@')).map(([, i]) => i);
    assert.ok(checkouts[0] < copy, 'after the first checkout');
    // docs/sdd/repo-split/spec.md R19: the first checkout is this repository at its default branch (a
    // dispatch runs there, so no ref), and pluton-timesheet is checked out only after the copy.
    assert.doesNotMatch(steps[checkouts[0]], /repository:|ref:/, 'the first checkout is main of this repository');
    for (const later of checkouts.slice(1)) assert.ok(copy < later, 'before any other checkout (the agent branch)');
    assert.ok(copy < steps.findIndex((s) => s.includes(ACTION)), 'before the action');
    assert.equal(field(steps[copy], 'if'), undefined, 'it always runs');
    assert.deepEqual(runBlock(steps[copy]).split('\n'), [
      'mkdir -p "$RUNNER_TEMP/agent-office-usage"',
      'cp scripts/agent/usage-marker.mjs "$RUNNER_TEMP/agent-office-usage/usage-marker.mjs"',
    ]);
  });

  test(`R50: "${a.name}" (id ${a.id}) is followed by a usage step that runs always(), holds no token, runs only the copy, and outputs the line`, () => {
    const job = jobsOf(YAML).get(a.job);
    const steps = stepsOf(job);
    const i = steps.findIndex((s) => s.includes(ACTION));
    assert.equal(field(steps[i], 'name'), a.name);
    assert.equal(field(steps[i], 'id'), a.id);
    const usage = steps[i + 1];
    assert.equal(field(usage, 'id'), `usage-${a.id}`);
    assert.equal(field(usage, 'if'), `always() && steps.${a.id}.outcome != 'skipped'`);
    assert.match(usage, new RegExp(`EXECUTION_FILE: \\$\\{\\{ steps\\.${a.id}\\.outputs\\.execution_file \\}\\}`));
    assert.match(usage, new RegExp(`USAGE_STEP: ${a.id}\\b`));
    assert.equal(/USAGE_SHA/.test(usage), false, 'sha is set by the usage job from the run (N3)');
    assert.equal(/TOKEN|secrets\./.test(usage), false, 'no token reaches the step that reads the file');
    assert.equal(/continue-on-error/.test(usage), false);
    assert.ok(runBlock(usage).includes(`node ${PARSER} "$EXECUTION_FILE"`));
    assert.equal(/scripts\//.test(runBlock(usage)), false, 'no file of the workspace runs');
    assert.ok(code(job).includes(`${a.output}: \${{ steps.usage-${a.id}.outputs.line }}`), `${a.job} outputs ${a.output}`);
  });
}

test('N2: the usage step is the same shell in both jobs', () => {
  const [w, r] = ACTION_STEPS.map((a) => {
    const steps = stepsOf(jobsOf(YAML).get(a.job));
    return runBlock(steps[steps.findIndex((s) => s.includes(ACTION)) + 1]);
  });
  assert.equal(w, r);
});

// ---- B1: the step's own shell, run with a broken parser, writes the fallback and exits 0.

const usageShell = () => {
  const steps = stepsOf(jobsOf(YAML).get('agent'));
  return runBlock(steps[steps.findIndex((s) => s.includes(ACTION)) + 1]);
};
const RUN = { ISSUE: '501', GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'agent', USAGE_STEP: 'work' };
const GOOD = '<!-- agent-office:usage {"v":1,"issue":501,"run_id":123456789,"run_attempt":2,"job":"agent","step":"work","input":1,"cacheRead":2,"cacheWrite":3,"output":4,"missing":["sha","at","model","costUsd","fx"]} -->';
const FALLBACK = '<!-- agent-office:usage {"v":1,"issue":501,"run_id":123456789,"run_attempt":2,"job":"agent","step":"work","missing":["parser"]} -->';

/** Runs the usage step as Actions does (bash -e -o pipefail) with `parser` as the copied parser's source. */
function runUsageStep(parser) {
  const temp = mkdtempSync(join(tmpdir(), 'usage-step-'));
  mkdirSync(join(temp, 'agent-office-usage'));
  if (parser !== null) writeFileSync(join(temp, 'agent-office-usage', 'usage-marker.mjs'), parser);
  const output = join(temp, 'github_output');
  writeFileSync(output, '');
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', usageShell()], {
    cwd: temp,
    encoding: 'utf8',
    env: { ...process.env, ...RUN, PATH: `${dirname(process.execPath)}:${process.env.PATH}`, RUNNER_TEMP: temp, GITHUB_OUTPUT: output, EXECUTION_FILE: join(temp, 'nope.json') },
  });
  return { status: r.status, stdout: r.stdout, output: readFileSync(output, 'utf8') };
}

const print = (text) => `console.log(${JSON.stringify(text)});`;

test('B1: a working copy passes its line through unchanged', () => {
  const r = runUsageStep(print(GOOD));
  assert.equal(r.status, 0);
  assert.equal(r.output, `line=${GOOD}\n`);
});

for (const [why, parser] of [
  ['the copy exits non-zero', 'process.exit(3);'],
  ['the copy does not parse', 'export const = ;'],
  ['the copy is missing', null],
  ['the copy prints nothing', ''],
  ['the copy prints two lines (N5)', print(`${GOOD}\nsecond line`)],
  ['the copy prints a line of the wrong shape', print('<!-- agent-office:usage not json -->')],
  ['the copy prints a marker then exits non-zero', `${print(GOOD)} process.exit(1);`],
]) {
  test(`B1: ${why}: the step writes the parser fallback and exits 0`, () => {
    const r = runUsageStep(parser);
    assert.equal(r.status, 0, 'the job stays green, so no later step is skipped');
    assert.equal(r.output, `line=${FALLBACK}\n`);
  });
}

test('B1: the fallback line passes main\'s usage-check, so the gap is recorded rather than lost', () => {
  const c = checkMarkerLine(FALLBACK, { issue: 501, run_id: 123456789, run_attempt: 2, step: 'work', sha: 'a'.repeat(40) });
  assert.equal(c.ok, true, c.reason);
});

test('R50: the usage job posts both lines on a fresh runner with an issues-only token and the run\'s own head sha', () => {
  const job = jobsOf(YAML).get('usage');
  assert.ok(job, 'a usage job exists');
  const c = code(job);
  // R59: the page counts a marker only when this job, by this name, succeeded in the marker's attempt.
  assert.equal(USAGE_JOB_NAME, 'Agent usage');
  assert.match(c, new RegExp(`^ {4}name: ${USAGE_JOB_NAME}$`, 'm'));
  assert.match(c, /^ {4}needs: \[dispatch, agent, review\]$/m);
  assert.match(c, /^ {4}if: vars\.AGENT_ENABLED == 'true' && always\(\) && \(needs\.agent\.outputs\.usage_work != '' \|\| needs\.review\.outputs\.usage_review != ''\)$/m);
  assert.match(c, /^ {4}runs-on: ubuntu-latest$/m);
  // docs/sdd/repo-split/spec.md R1, R19: pluton-ai-agent is private, so checking out its main needs
  // contents: read for the workflow token; nothing else, and no ref (a dispatch runs on main).
  assert.match(c, /^ {4}permissions:\n {6}contents: read\n {4}steps:/m);
  const steps = stepsOf(job);
  assert.equal(steps.length, 4);
  const [checkout, node, mint, post] = steps;
  assert.match(checkout, /uses: actions\/checkout@[0-9a-f]{40}/);
  assert.doesNotMatch(checkout, /repository:|ref:/);
  assert.match(checkout, /persist-credentials: false/);
  assert.match(node, /uses: actions\/setup-node@[0-9a-f]{40}/);
  assert.match(mint, /uses: actions\/create-github-app-token@[0-9a-f]{40}/);
  assert.deepEqual(mint.match(/permission-[a-z-]+: \w+/g), ['permission-issues: write']);
  assert.match(post, /GH_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
  assert.match(post, /WORK: \$\{\{ needs\.agent\.outputs\.usage_work \}\}/);
  assert.match(post, /REVIEW: \$\{\{ needs\.review\.outputs\.usage_review \}\}/);
  assert.match(post, /WORK_SHA: \$\{\{ needs\.agent\.outputs\.head_sha \}\}/);
  assert.match(post, /REVIEW_SHA: \$\{\{ needs\.review\.outputs\.head_sha \}\}/);
  assert.match(post, /ISSUE: \$\{\{ needs\.dispatch\.outputs\.issue \}\}/);
  assert.match(post, /checked=\$\(GH_TOKEN= node scripts\/agent\/cli\.mjs usage-check "\$step" "\$line" "\$sha"\)/);
  assert.match(post, /gh issue comment "\$ISSUE" --repo "\$PRODUCT_REPO" --body "\$checked"/);
  assert.equal(/continue-on-error|\|\|/.test(post + mint), false, 'nothing lets a red step pass');
  // The review job hands on the head it read from GitHub (N3).
  assert.ok(code(jobsOf(YAML).get('review')).includes('head_sha: ${{ steps.head.outputs.sha }}'));
});

test('R50: no other job needs the usage job, so its result changes nothing that follows', () => {
  for (const [id, job] of jobsOf(YAML)) {
    if (id === 'usage') continue;
    assert.equal(/needs:.*\busage\b/.test(code(job)), false, id);
  }
});

test('R50: the execution file is never uploaded, printed or written to the summary', () => {
  assert.equal(/upload-artifact/.test(YAML), false, 'agent.yml uploads no artifact');
  const lines = YAML.split('\n').filter((l) => !/^\s*#/.test(l));
  const named = lines.filter((l) => /execution_file|EXECUTION_FILE|claude-execution-output/.test(l)).map((l) => l.trim());
  assert.deepEqual(named, [
    'EXECUTION_FILE: ${{ steps.work.outputs.execution_file }}',
    `if line=$(node ${PARSER} "$EXECUTION_FILE"); then`,
    'EXECUTION_FILE: ${{ steps.review.outputs.execution_file }}',
    `if line=$(node ${PARSER} "$EXECUTION_FILE"); then`,
  ]);
  for (const l of lines) {
    assert.equal(/\b(cat|echo|printf|tee|head|tail|less|base64)\b.*EXECUTION_FILE/.test(l), false, l);
    assert.equal(/GITHUB_STEP_SUMMARY/.test(l) && /usage|EXECUTION/.test(l), false, l);
  }
});

test('R50: the workflow stays inert: every job still needs AGENT_ENABLED', () => {
  for (const [id, job] of jobsOf(YAML)) assert.match(job, /vars\.AGENT_ENABLED == 'true'/, id);
});
