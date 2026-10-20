// The agent workflows stay off, least privileged and off the Mac for anything a fork sends
// (docs/superpowers/plans/always-on-dev-agent.md step 8; security review of 09dde08f0, items 1, 3,
// 5 and 6). Each test reads the files as they are, so an edit that widens one turns the suite red.
//
// Run: node --test scripts/lib/agent-workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MERGE_JOB_NAME } from '../agent/cli.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FILES = ['agent.yml', 'agent-main-audit.yml', 'agent-sweep.yml', 'agent-release.yml', 'agent-triage.yml'];
const read = (file) => readFileSync(join(ROOT, '.github/workflows', file), 'utf8');

/** The jobs that run agent-written code or hold the App token after it (fifth review, R84). */
export const AGENT_CODE_JOBS = ['agent', 'open-pr', 'review'];

/** Job id to its body, by two-space ids under `jobs:`. */
function jobsOf(yaml) {
  const body = yaml.slice(yaml.search(/^jobs:\s*$/m));
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):\s*$/gm)];
  return new Map(heads.map((m, i) => [m[1], body.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : body.length)]));
}

/** A job's `if:`, joined when it is a folded block. */
function ifOf(job) {
  const m = job.match(/^ {4}if: (?:>-\n((?: {6}.*\n)+)|(.*)\n)/m);
  return m ? (m[1] ?? m[2]).replace(/\s+/g, ' ').trim() : '';
}

/** Every line inside a `run:` value, inline or block. */
function runLines(yaml) {
  const lines = yaml.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    if (!/^[|>]/.test(m[2])) { out.push(lines[i]); continue; }
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].match(/^(\s*)/)[1].length > indent); j += 1) out.push(lines[j]);
  }
  return out;
}

for (const file of FILES) {
  const yaml = read(file);
  const jobs = jobsOf(yaml);

  test(`${file}: the workflow token has no permission at the top`, () => {
    assert.match(yaml, /^permissions: \{\}$/m);
  });

  test(`${file}: every job is off until vars.AGENT_ENABLED is 'true'`, () => {
    assert.ok(jobs.size > 0);
    for (const [id, body] of jobs) assert.match(ifOf(body), /^vars\.AGENT_ENABLED == 'true'(?: && |$)/, `${file} ${id}`);
  });

  test(`${file}: no expression is pasted into a run block, so event text never becomes shell`, () => {
    const pasted = runLines(yaml).filter((l) => l.includes('${{'));
    assert.deepEqual(pasted, []);
  });

  // Main thread decision on PR #496 (CI run 38525239755, runner-cost.test.mjs): every job of the
  // agent workflows is GitHub-hosted, so nothing they run reaches the Mac and the cost guard's free
  // set holds; minutes start only when AGENT_ENABLED is set, after Q6.
  test(`${file}: every job runs on ubuntu-latest, and the file never names vars.RUNNER`, () => {
    for (const [id, body] of jobs) {
      assert.equal(body.match(/^ {4}runs-on: (.*)$/m)?.[1], 'ubuntu-latest', `${file} ${id}`);
    }
    assert.doesNotMatch(yaml, /vars\.RUNNER/);
  });

  test(`${file}: no job asks for an OIDC token or a workflow, admin or secrets permission`, () => {
    assert.doesNotMatch(yaml, /^\s*id-token:/m);
    assert.doesNotMatch(yaml, /permission-(workflows|administration|secrets):/);
    // docs/sdd/repo-split/spec.md R17: agent-release.yml's App tokens carry the actions scopes its jobs'
    // workflow token had on pluton-timesheet (staged read, release write); asserted by job below.
    if (file !== 'agent-release.yml') assert.doesNotMatch(yaml, /permission-actions:/);
  });
}

// The blind-spot sweep (agent-workflow-and-economy.md section 2c; popups "วันละครั้ง", "ต่อจาก #496 เลย").
test('agent-sweep.yml runs once a day and by hand, nothing else', () => {
  const yaml = read('agent-sweep.yml');
  const on = yaml.slice(yaml.search(/^on:\s*$/m), yaml.search(/^permissions:/m));
  assert.match(on, /^ {2}schedule:\n {4}- cron: '\d{1,2} \d{1,2} \* \* \*'$/m);
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['schedule', 'workflow_dispatch']);
});

test('agent-sweep.yml: its one job also waits for vars.AGENT_SWEEP_ENABLED, writes issues only, and is bounded', () => {
  const jobs = jobsOf(read('agent-sweep.yml'));
  assert.deepEqual([...jobs.keys()], ['sweep']);
  const job = jobs.get('sweep');
  assert.equal(ifOf(job), "vars.AGENT_ENABLED == 'true' && vars.AGENT_SWEEP_ENABLED == 'true'");
  const perms = job.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '';
  // docs/sdd/repo-split/spec.md R17: the workflow token only checks out this repository; the issues
  // write moved to the App token, which reaches pluton-timesheet.
  assert.deepEqual(perms.split('\n').filter(Boolean).map((l) => l.replace(/\s+#.*$/, '').trim()).sort(), ['contents: read']);
  const app = job.split(/\n {6}- /).find((s) => /create-github-app-token@/.test(s)) ?? '';
  assert.deepEqual([...app.matchAll(/^\s+(permission-[a-z-]+: (?:read|write))/gm)].map((m) => m[1]).sort(), ['permission-contents: read', 'permission-issues: write']);
  const minutes = Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)?.[1]);
  assert.ok(minutes > 0 && minutes <= 10, `timeout ${minutes}`);
  assert.match(job, /^\s+run: node "\$RUNNER_TEMP\/pluton-ai-agent\/scripts\/agent\/cli\.mjs" sweep$/m);
  assert.match(job, /^\s+persist-credentials: false$/m);
});

test('agent-sweep.yml: a scheduled run files, a dispatch can be a dry run, and the cost stop is wired', () => {
  const job = jobsOf(read('agent-sweep.yml')).get('sweep');
  assert.match(job, /^\s+AGENT_SWEEP_FILE: \$\{\{ inputs\.dry_run && '0' \|\| '1' \}\}$/m);
  assert.match(job, /^\s+AGENT_AI_COST_UNPAID: \$\{\{ vars\.AGENT_AI_COST_UNPAID \}\}$/m);
  assert.doesNotMatch(job, /agent:ready/);
});

// Review of PR #499, item 5: the owner's first manual run must be safe.
test('agent-sweep.yml: a manual dispatch is a dry run by default (review of #499, item 5)', () => {
  const yaml = read('agent-sweep.yml');
  const input = yaml.slice(yaml.search(/^ {6}dry_run:\s*$/m), yaml.search(/^permissions:/m));
  assert.match(input, /^ {8}type: boolean$/m);
  assert.match(input, /^ {8}default: true$/m);
});

test('agent.yml answers the events that drain the queue and refresh the merge check', () => {
  // docs/sdd/repo-split/spec.md R15: pluton-timesheet's issues, comments, reviews, CI runs of agent
  // branches and statuses arrive relayed, one repository_dispatch type each.
  const yaml = read('agent.yml');
  assert.match(yaml, /^ {2}repository_dispatch:\n {4}types: \[ts-issues, ts-issue-comment, ts-pr-review, ts-ci-completed, ts-status\]$/m);
});

test('agent.yml: dispatch runs one at a time for the whole repository', () => {
  const dispatch = jobsOf(read('agent.yml')).get('dispatch');
  assert.match(dispatch, /^ {6}group: agent-dispatch\n {6}cancel-in-progress: false\n {6}queue: max$/m);
});

test('agent.yml: the agent and its reviewer share the group of the issue the dispatcher chose', () => {
  const jobs = jobsOf(read('agent.yml'));
  for (const id of ['agent', 'review']) {
    assert.match(jobs.get(id), /^ {6}group: agent-issue-\$\{\{ needs\.dispatch\.outputs\.issue \}\}$/m, id);
  }
});

test('agent.yml: the merge check job carries the name cli.mjs leaves out of the checks', () => {
  assert.match(jobsOf(read('agent.yml')).get('merge-check'), new RegExp(`^ {4}name: ${MERGE_JOB_NAME}$`, 'm'));
});

test('agent.yml: the agent job lists its tools, so the action default never applies', () => {
  const agent = jobsOf(read('agent.yml')).get('agent');
  assert.match(agent, /--allowedTools /);
  assert.match(agent, /--disallowedTools /);
});

test('agent.yml: the header says the App could merge and the audit only detects it (R82)', () => {
  assert.match(read('agent.yml'), /^# .*R82/m);
});

/** The quoted value of one claude_args flag in a job. */
const flag = (job, name) => job.match(new RegExp(`^\\s+--${name} "([^"]*)"$`, 'm'))?.[1] ?? '';

// Second security review of 50690f8fa. Permission rule syntax from
// https://code.claude.com/docs/en/permissions: a rule with no `*` matches one exact command,
// `Bash(git * main)` matches `git push origin main`, and only Edit(path) and Read(path) rules are
// consulted for files (a Write or MultiEdit path rule is accepted and never checked).
test('item 1: the agent pushes only its own branch, by the exact command, and never main', () => {
  const agent = jobsOf(read('agent.yml')).get('agent');
  const allowed = flag(agent, 'allowedTools');
  const denied = flag(agent, 'disallowedTools');
  const pushes = allowed.split(',').filter((r) => r.startsWith('Bash(git push'));
  assert.deepEqual(pushes, ['Bash(git push origin agent/issue-${{ needs.dispatch.outputs.issue }})']);
  assert.doesNotMatch(allowed, /git push[^,]*(?::\*|\*)/);
  assert.match(denied, /Bash\(git \* main\)/);
  assert.match(denied, /Bash\(git push \*main\*\)/);
});

test('item 2: the agent cannot edit .github/, and no pull request opens without the .github check', () => {
  const yaml = read('agent.yml');
  const agent = jobsOf(yaml).get('agent');
  assert.match(flag(agent, 'disallowedTools'), /Edit\(\.github\/\*\*\)/);
  assert.doesNotMatch(flag(agent, 'allowedTools'), /gh pr create/);
  // Since the fourth review the .github check runs in the open-pr job, after the agent job.
  assert.match(jobsOf(yaml).get('open-pr') ?? '', /run: node "\$RUNNER_TEMP\/pluton-ai-agent\/scripts\/agent\/cli\.mjs" pull-request/);
  assert.match(yaml, /lacks the Workflows permission/);
  assert.match(yaml, /residual risk for the owner \(not accepted by AI\)/);
});

test('item 3: the agent runs named commands, not any npm script or any script file', () => {
  const allowed = flag(jobsOf(read('agent.yml')).get('agent'), 'allowedTools');
  assert.doesNotMatch(allowed, /Bash\(npm run:\*\)|Bash\(npm run \*\)|Bash\(node scripts\/:\*\)|Bash\(node \$\{\{ runner\.temp \}\}\/:\*\)/);
  // docs/sdd/repo-split/spec.md R19: plan-marker is this repository's script, run from its copy.
  for (const rule of ['Bash(npm run lint)', 'Bash(npm run typecheck)', 'Bash(npm run test:scripts)',
    'Bash(node ${{ runner.temp }}/pluton-ai-agent/scripts/agent/cli.mjs plan-marker .agent/issue-${{ needs.dispatch.outputs.issue }}/plan.md)']) {
    assert.ok(allowed.split(',').includes(rule), rule);
  }
});

// Third security review of 403c577a0.
test('item 2 (third review): no node or npm rule carries a wildcard', () => {
  const allowed = flag(jobsOf(read('agent.yml')).get('agent'), 'allowedTools').split(',');
  assert.deepEqual(allowed.filter((r) => /^Bash\((node|npm)\b/.test(r) && /\*/.test(r)), []);
  assert.ok(!allowed.some((r) => r.startsWith('Bash(node --test')));
});

// Fourth security review of d191242d6: anything in the agent job's filesystem (git hooks, config,
// a process left running) can reach a later step of the same job, so the pull request is opened
// by its own job, on its own runner, from a clean checkout, given only the issue and the head sha.
test('fourth review: no step of the agent job opens the pull request or checks out a trusted copy', () => {
  const agent = jobsOf(read('agent.yml')).get('agent');
  assert.doesNotMatch(agent, /cli\.mjs pull-request/);
  assert.doesNotMatch(agent, /path: trusted/);
  assert.match(agent, /^ {6}head_sha: \$\{\{ steps\.head\.outputs\.sha \}\}$/m);
});

test('fourth review: open-pr is its own gated job that checks the hand-off and the fetched head', () => {
  const jobs = jobsOf(read('agent.yml'));
  const job = jobs.get('open-pr');
  assert.ok(job, 'open-pr exists');
  assert.match(job, /^ {4}needs: \[dispatch, agent\]$/m);
  assert.match(ifOf(job), /^vars\.AGENT_ENABLED == 'true' && needs\.agent\.result == 'success'/);
  assert.match(job, /^ {6}group: agent-issue-\$\{\{ needs\.dispatch\.outputs\.issue \}\}$/m);
  const steps = job.split(/\n {6}- /);
  // docs/sdd/repo-split/spec.md R19: the clean checkout is pluton-timesheet's main, the git store the
  // pushed branch is fetched into; the script runs from this repository's copy outside it.
  const checkout = steps.findIndex((s) => /^uses: actions\/checkout@/m.test(s) && /repository: Thitic9203\/pluton-timesheet/.test(s));
  const run = steps.findIndex((s) => /^\s*run: node "\$RUNNER_TEMP\/pluton-ai-agent\/scripts\/agent\/cli\.mjs" pull-request$/m.test(s));
  assert.ok(checkout > 0 && run > checkout, 'clean checkout before the run');
  assert.match(steps[checkout], /^\s+ref: main$/m);
  assert.match(steps[checkout], /^\s+persist-credentials: false$/m);
  assert.match(job, /uses: actions\/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3\.3\.0/);
  assert.match(steps[run], /^\s+AGENT_EXPECTED_SHA: \$\{\{ needs\.agent\.outputs\.head_sha \}\}$/m);
  assert.match(steps[run], /^\s+ISSUE: \$\{\{ needs\.dispatch\.outputs\.issue \}\}$/m);
});

test('fifth review: agent, open-pr and review run on ubuntu-latest, fixed, and the header cites R84', () => {
  const jobs = jobsOf(read('agent.yml'));
  for (const id of AGENT_CODE_JOBS) {
    assert.equal(jobs.get(id).match(/^ {4}runs-on: (.*)$/m)?.[1], 'ubuntu-latest', id);
    assert.doesNotMatch(jobs.get(id), /vars\.RUNNER/, id);
  }
  assert.match(read('agent.yml'), /^# .*R84.*agent code never runs on the owner's Mac/m);
});

test('fourth review: the header says a reused self-hosted runner gives no fresh filesystem (R84)', () => {
  assert.match(read('agent.yml'), /does not give a fresh filesystem/);
  assert.match(read('agent.yml'), /R84/);
});

test('item 3 (third review): the header says Write path rules are not consulted, and what protects .github/', () => {
  assert.match(read('agent.yml'), /Write path rules are not consulted/);
});

test('item 5: dispatch is not even allocated a runner for an event it would ignore', () => {
  // docs/sdd/repo-split/spec.md R4, R16: the comment author and text, the closed issue's labels, the
  // run's branch and the review's head are not in the relay payload; the relay filters them at the
  // source and cli.mjs judges them again from the API. Here only the relay's identifiers are tested.
  const cond = ifOf(jobsOf(read('agent.yml')).get('dispatch'));
  assert.match(cond, /github\.event_name == 'repository_dispatch'/);
  assert.match(cond, /github\.event\.action != 'ts-issues' \|\| startsWith\(github\.event\.client_payload\.label, 'agent:'\) \|\| github\.event\.client_payload\.action == 'closed'/);
  assert.match(cond, /github\.event\.action != 'ts-status' \|\| github\.event\.client_payload\.context == 'agent\/review'/);
});

test('item 6: the posted review summary is capped, and the header names the unrestricted Read', () => {
  const yaml = read('agent.yml');
  assert.match(jobsOf(yaml).get('review'), /\$\{SUMMARY:0:4000\}/);
  assert.match(yaml, /reviewer's Read is not limited to paths/);
});

// The path after merge (always-on-dev-agent.md row 12; agent-workflow-and-economy.md section 2b).
// Production stays a person's act: only the QA Lead's own dispatch on main reaches deploy-production.yml.
test('agent-release.yml answers CI on main, a push to release/next and a dispatch, nothing else', () => {
  const yaml = read('agent-release.yml');
  // docs/sdd/repo-split/spec.md R15: CI of pluton-timesheet main and its release/next arrive relayed.
  const on = yaml.slice(yaml.search(/^on:\s*$/m), yaml.search(/^permissions:/m));
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['repository_dispatch', 'workflow_dispatch']);
  assert.match(on, /^ {2}repository_dispatch:\n {4}types: \[ts-ci-main-completed, ts-release-next\]$/m);
});

test('agent-release.yml: each job answers its own event only', () => {
  const jobs = jobsOf(read('agent-release.yml'));
  assert.deepEqual([...jobs.keys()], ['staged', 'count', 'release']);
  assert.match(ifOf(jobs.get('staged')), /&& github\.event_name == 'repository_dispatch' && github\.event\.action == 'ts-ci-main-completed'$/);
  assert.match(ifOf(jobs.get('count')), /&& github\.event_name == 'repository_dispatch' && github\.event\.action == 'ts-release-next'$/);
  // repo-split R16: staged takes the run id and head sha from the run read back from the API.
  assert.match(jobs.get('staged'), /RUN_ID: \$\{\{ steps\.event\.outputs\.run_id \}\}/);
  assert.match(jobs.get('staged'), /if: steps\.event\.outputs\.action == 'completed' && steps\.event\.outputs\.branch == 'main'/);
  assert.equal(
    ifOf(jobs.get('release')),
    "vars.AGENT_ENABLED == 'true' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && vars.AGENT_QA_LEAD != '' && github.triggering_actor == vars.AGENT_QA_LEAD",
  );
  assert.match(jobs.get('release'), /TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/);
  assert.doesNotMatch(read('agent-release.yml'), /github\.actor\b/);
});

test('agent-release.yml: count runs main\'s copy of the scripts, never the agent-written release/next', () => {
  // docs/sdd/repo-split/spec.md R19: the scripts are this repository's; a dispatch runs on its default
  // branch, and count checks out nothing of pluton-timesheet, so release/next is never on disk.
  const count = jobsOf(read('agent-release.yml')).get('count');
  const checkouts = count.split(/\n {6}- /).filter((s) => /^uses: actions\/checkout@/m.test(s));
  assert.equal(checkouts.length, 1);
  assert.doesNotMatch(checkouts[0], /repository:|ref:/);
});

test('agent-release.yml: only the release job may dispatch production, and only it holds actions: write', () => {
  const yaml = read('agent-release.yml');
  const jobs = jobsOf(yaml);
  for (const [id, body] of jobs) {
    assert.equal(/actions: write/.test(body), id === 'release', id);
    assert.equal(/release-cli\.mjs"? release/.test(body), id === 'release', id);
  }
  assert.doesNotMatch(yaml, /contents: write|pull-requests: write/);
  assert.match(jobs.get('staged'), /node scripts\/staging-smoke\.mjs/);
  assert.match(jobs.get('count'), /qa_lead_message/);
});

// Plan row 14 (agent-workflow-and-economy.md section 8): every moment posts in the issue's Slack
// thread through scripts/agent/slack-notify.mjs, with SLACK_BOT_TOKEN from the environment staging,
// the App token (so the thread marker is the App's), and the event passed through env, never ${{ in run.
// repo-split R19: a job that checked pluton-timesheet out runs this repository's copy of the script.
const SLACK_RUN = /node (?:scripts|"\$RUNNER_TEMP\/pluton-ai-agent\/scripts)\/agent\/cli\.mjs"? slack-notify --issue="\$(?:ISSUE|n)" --event="\$SLACK_EVENT"/;

function slackStep(job, event) {
  const step = job.split(/\n {6}- /).find((s) => new RegExp(`^\\s+SLACK_EVENT: ${event}$`, 'm').test(s));
  assert.ok(step, `a slack-notify step for ${event}`);
  assert.match(step, SLACK_RUN, event);
  assert.match(step, /^\s+SLACK_BOT_TOKEN: \$\{\{ secrets\.SLACK_BOT_TOKEN \}\}$/m, event);
  assert.match(step, /^\s+GITHUB_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}$/m, event);
  assert.match(step, /^\s+AGENT_APP_LOGIN: \$\{\{ vars\.AGENT_APP_SLUG \}\}\[bot\]$/m, event);
  assert.match(job, /^ {4}environment: staging/m, event);
  assert.match(job, /^\s+permission-issues: write$/m, event);
  return step;
}

test('row 14: agent.yml posts started, the gates, mock, blocked and merged, each from a job that ran no agent code', () => {
  const jobs = jobsOf(read('agent.yml'));
  const started = jobs.get('slack-started');
  assert.equal(ifOf(started), "vars.AGENT_ENABLED == 'true' && needs.dispatch.outputs.action == 'start'");
  slackStep(started, 'started');
  // Reviewer finding on 29e5221f1: gate1, gate2, mock and blocked come from the issues labeled event
  // itself, whatever job added the label, and only when the App added it, so a crashed agent job or
  // open-pr's agent:blocked is still announced and nobody else can make the bot post.
  assert.equal(jobs.get('slack-gate'), undefined, 'no second path that would post the same gate twice');
  // docs/sdd/repo-split/spec.md R16: the relay carries the action and the label only; who added the
  // label is read from the issue timeline by `cli.mjs event`, and only the App's label posts.
  const label = jobs.get('slack-label');
  assert.equal(
    ifOf(label),
    "vars.AGENT_ENABLED == 'true' && github.event_name == 'repository_dispatch' && github.event.action == 'ts-issues' "
      + "&& github.event.client_payload.action == 'labeled' "
      + "&& (github.event.client_payload.label == 'agent:planning' || github.event.client_payload.label == 'agent:test-planning' || github.event.client_payload.label == 'agent:blocked')",
  );
  assert.doesNotMatch(label, /^ {4}needs:/m);
  const step = slackStep(label, 'auto');
  assert.match(step, /^\s+if: steps\.event\.outputs\.sender == format\('\{0\}\[bot\]', vars\.AGENT_APP_SLUG\) && steps\.event\.outputs\.action == 'labeled'$/m);
  assert.match(step, /^\s+LABEL: \$\{\{ steps\.event\.outputs\.label \}\}$/m);
  assert.match(step, /^\s+ISSUE: \$\{\{ steps\.event\.outputs\.number \}\}$/m);
  assert.match(step, /--label="\$LABEL"$/m);
  assert.match(label, /^ {6}group: agent-slack-\$\{\{ github\.event\.client_payload\.number \}\}$/m);
  // The dispatcher ignores these labels (only agent:ready starts work), so this path never starts the agent.
  const merged = jobs.get('slack-merged');
  assert.equal(ifOf(merged), "vars.AGENT_ENABLED == 'true' && needs.merge-check.outputs.merged == 'success'");
  assert.match(slackStep(merged, 'merged'), /--pr="\$PR"$/m);
  assert.match(jobs.get('merge-check'), /^ {6}merged: \$\{\{ steps\.release-merge\.outcome \}\}$/m);
  assert.match(jobs.get('merge-check'), /^ {8}id: release-merge\n {8}if: steps\.check\.outputs\.ok == 'true'$/m);
  // The token never reaches a job that runs agent-written code (R84).
  for (const id of AGENT_CODE_JOBS) assert.doesNotMatch(jobs.get(id), /SLACK_BOT_TOKEN|slack-notify/, id);
});

test('row 14: agent-release.yml posts release at the batch of 10 and done for each issue it closed', () => {
  const jobs = jobsOf(read('agent-release.yml'));
  const release = slackStep(jobs.get('count'), 'release');
  assert.match(release, /^\s+if: steps\.count\.outputs\.batch_notify == 'true'$/m);
  assert.match(release, /^\s+ISSUES: \$\{\{ steps\.count\.outputs\.waiting_issues \}\}$/m);
  const done = slackStep(jobs.get('release'), 'done');
  assert.match(done, /^\s+if: steps\.release\.outputs\.closed != ''$/m);
  assert.match(done, /^\s+ISSUES: \$\{\{ steps\.release\.outputs\.closed \}\}$/m);
  assert.match(jobs.get('release'), /^ {8}id: release\n/m);
});

// Owner 15 Oct 2026: Spec-Driven Development is a standing rule the agent follows without being
// told (agent-workflow-and-economy.md section 2a4), so the agent prompt must always carry it.
test('agent.yml: the agent prompt carries Spec-Driven Development (spec first, spec is the source of truth)', () => {
  const yaml = readFileSync(join(ROOT, '.github/workflows/agent.yml'), 'utf8');
  assert.match(yaml, /Spec-Driven Development, always/);
  assert.match(yaml, /"when X,\s+the system must Y"/);
  assert.match(yaml, /A change request\s+edits the spec first/);
  assert.match(yaml, /Every test names the spec line it proves/);
});

// Reviewer follow-ups on 7cf23270f. 5: the agent posts its stop comment before agent:blocked, so the
// Slack notice carries the reason. 6: main-audit stops issues with an App token, so slack-label
// fires. 7: an agent job that crashed before any label still reaches Slack through agent-crashed.
test('follow-up 5: the agent prompt says comment first, then label agent:blocked', () => {
  const agent = jobsOf(read('agent.yml')).get('agent');
  const prompt = agent.slice(agent.indexOf('prompt: |'));
  assert.match(prompt, /post the comment first, then add agent:blocked/);
  /* The mock wait it also named left on 17 Oct 2026 (docs/sdd/remove-mock-first R10). */
  assert.doesNotMatch(prompt, /waiting for the mock publish|\/approve-mock/);
  assert.match(prompt, /The app \(src\/\) is the design of record/);
});

test('follow-up 6: main-audit stops issues with an issues-write App token', () => {
  const audit = jobsOf(read('agent-main-audit.yml')).get('audit');
  const steps = audit.split(/\n {6}- /);
  const mint = steps.findIndex((s) => /^\s+id: app-token$/m.test(s));
  const run = steps.findIndex((s) => /run: node scripts\/agent\/cli\.mjs main-audit$/m.test(s));
  assert.ok(mint > 0 && run > mint, 'the token is minted before the audit');
  assert.match(steps[mint], /^\s+permission-issues: write$/m);
  assert.doesNotMatch(steps[mint], /permission-(contents|pull-requests):/);
  assert.match(steps[run], /^\s+AGENT_STOP_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}$/m);
  // docs/sdd/repo-split/spec.md R17: the audit reads pluton-timesheet with an App token holding the
  // workflow token's former permissions there, not with this repository's workflow token.
  assert.match(steps[run], /^\s+GITHUB_TOKEN: \$\{\{ steps\.read-token\.outputs\.token \}\}$/m);
});

test('follow-up 7: agent-crashed comments, then labels agent:blocked, when the agent job failed', () => {
  const job = jobsOf(read('agent.yml')).get('agent-crashed');
  assert.ok(job, 'agent-crashed exists');
  assert.match(job, /^ {4}needs: \[dispatch, agent\]$/m);
  assert.equal(ifOf(job), "vars.AGENT_ENABLED == 'true' && failure() && needs.agent.result == 'failure'");
  assert.doesNotMatch(job, /^ {4}environment:/m, 'no environment, so no deploy-gate rule and no Slack token here');
  assert.match(job, /^\s+permission-issues: write$/m);
  assert.match(job, /^\s+GH_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}$/m);
  const comment = job.indexOf('gh issue comment "$ISSUE"');
  const label = job.indexOf('gh issue edit "$ISSUE" --repo "$PRODUCT_REPO" --add-label agent:blocked');
  assert.ok(comment > 0 && label > comment, 'comment first, then label');
  assert.match(job, /Agent stopped: the agent job failed, run \$\{RUN_URL\}/);
});

// docs/sdd/agent-po-triage R1, R4 to R9: the PO/BA triage. The model judges with read access only;
// a job with no model applies labels with the App token, under the caps of scripts/agent/triage.mjs.
const permsOf = (job) => (job.match(/^ {4}permissions:\n((?: {6}.*\n)+)/m)?.[1] ?? '')
  .split('\n').filter(Boolean).map((l) => l.replace(/\s+#.*$/, '').trim()).sort();

test('agent-triage.yml answers a schedule, a new issue and a dispatch, nothing else', () => {
  const yaml = read('agent-triage.yml');
  const on = yaml.slice(yaml.search(/^on:\s*$/m), yaml.search(/^permissions:/m));
  // docs/sdd/repo-split/spec.md R15: a new pluton-timesheet issue arrives relayed as ts-issues, and
  // judge answers only its opened action.
  assert.deepEqual([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['schedule', 'repository_dispatch', 'workflow_dispatch']);
  assert.match(on, /^ {4}types: \[ts-issues\]$/m);
  assert.match(ifOf(jobsOf(yaml).get('judge')), /&& \(github\.event_name != 'repository_dispatch' \|\| github\.event\.client_payload\.action == 'opened'\)$/);
});

test('agent-triage.yml: judge reads only, holds no App token and no write tool', () => {
  const jobs = jobsOf(read('agent-triage.yml'));
  assert.deepEqual([...jobs.keys()], ['judge', 'apply']);
  const judge = jobs.get('judge');
  // docs/sdd/repo-split/spec.md R17: this repository's workflow token cannot read pluton-timesheet, and
  // a token cannot pass between jobs as an output, so judge mints one App token, read only: the
  // workflow token's former permissions. The model still holds no write token and no Slack token.
  assert.deepEqual(permsOf(judge), ['contents: read']);
  const mints = judge.split(/\n {6}- /).filter((s) => /create-github-app-token@/.test(s));
  assert.equal(mints.length, 1);
  assert.deepEqual([...mints[0].matchAll(/^\s+(permission-[a-z-]+: (?:read|write))/gm)].map((m) => m[1]).sort(), ['permission-contents: read', 'permission-issues: read']);
  assert.doesNotMatch(judge, /: write\b|SLACK_BOT_TOKEN/);
  assert.match(judge, /--allowedTools "Read,Glob,Grep"/);
  assert.match(judge, /--disallowedTools "Edit,Write,MultiEdit,NotebookEdit,Bash,WebFetch,WebSearch"/);
  assert.match(judge, /--json-schema /);
  assert.match(judge, /^\s+persist-credentials: false$/m);
});

test('agent-triage.yml: apply runs no model, mints an issues-only App token, and runs main\'s triage-apply', () => {
  const apply = jobsOf(read('agent-triage.yml')).get('apply');
  assert.deepEqual(permsOf(apply), ['contents: read']);
  assert.match(apply, /^ {4}needs: judge$/m);
  assert.doesNotMatch(apply, /claude-code-action|CLAUDE_CODE_OAUTH_TOKEN/);
  const mint = apply.slice(apply.indexOf('create-github-app-token'));
  assert.deepEqual([...mint.matchAll(/^ {10}(permission-[a-z-]+): (\w+)$/gm)].map((m) => `${m[1]}: ${m[2]}`), ['permission-issues: write']);
  assert.match(apply, /^\s+run: node scripts\/agent\/cli\.mjs triage-apply$/m);
  assert.match(apply, /^\s+AGENT_APP_LOGIN: \$\{\{ vars\.AGENT_APP_SLUG \}\}\[bot\]$/m);
});

test('agent-triage.yml: one triage at a time, bounded, and the cost stop is wired', () => {
  const yaml = read('agent-triage.yml');
  assert.match(yaml, /^ {2}group: agent-triage$/m);
  for (const [, job] of jobsOf(yaml)) {
    const minutes = Number(job.match(/^ {4}timeout-minutes: (\d+)$/m)?.[1]);
    assert.ok(minutes > 0 && minutes <= 15, `timeout ${minutes}`);
    assert.match(ifOf(job), /vars\.AGENT_TRIAGE_ENABLED == 'true'/);
    assert.match(ifOf(job), /vars\.AGENT_AI_COST_UNPAID != 'true'/);
  }
});

// docs/sdd/agent-po-triage R13, E4: run 39012662586 failed before the model ran and the action's
// schema message hid the real error. A failed judge keeps a redacted digest, never the raw file.
/** One step of a job, from its `- name:` line to the next step. */
function stepOf(job, name) {
  const at = job.indexOf(`- name: ${name}\n`);
  if (at < 0) return '';
  const next = job.indexOf('\n      - ', at + 1);
  return job.slice(at, next < 0 ? job.length : next + 1);
}

/** The literal block value of an env key in a step (`KEY: |`), dedented. */
function envBlock(step, key) {
  const m = step.match(new RegExp(`^( +)${key}: \\|\\n((?:\\1 {2}.*\\n|\\s*\\n)+)`, 'm'));
  if (!m) return '';
  const pad = m[1].length + 2;
  return m[2].split('\n').map((l) => l.slice(pad)).join('\n').trim();
}

const DIGEST = 'Keep a redacted digest of the failed judge';
const UPLOAD = 'Upload the redacted digest';

test('agent-triage.yml: judge keeps a redacted digest only when it failed (R13, E4)', () => {
  const judge = jobsOf(read('agent-triage.yml')).get('judge');
  const digest = stepOf(judge, DIGEST);
  const upload = stepOf(judge, UPLOAD);
  assert.ok(digest, `step "${DIGEST}" missing`);
  assert.ok(upload, `step "${UPLOAD}" missing`);
  assert.ok(judge.indexOf(digest) > judge.indexOf('id: judge') && judge.indexOf(upload) > judge.indexOf(digest));
  const when = "if: failure() && steps.judge.outputs.execution_file != ''";
  assert.match(digest, new RegExp(`^ {8}${when.replace(/[()|.*+?]/g, '\\$&')}$`, 'm'));
  assert.match(upload, new RegExp(`^ {8}${when.replace(/[()|.*+?]/g, '\\$&')}$`, 'm'));
  assert.match(digest, /^ {10}EXECUTION_FILE: \$\{\{ steps\.judge\.outputs\.execution_file \}\}$/m);
  assert.match(upload, /uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1$/m);
  assert.match(upload, /^ {10}retention-days: 3$/m);
  assert.match(upload, /^ {10}path: \$\{\{ runner\.temp \}\}\/judge-digest\/digest\.json$/m);
  assert.doesNotMatch(upload.slice(upload.indexOf('with:')), /claude-execution-output|execution_file/, 'the raw execution file is never uploaded');
  assert.doesNotMatch(judge, /show_full_output: *true|display_report: *true/);
});

test('agent-triage.yml: the digest filter keeps the error and drops issue text (R13)', () => {
  const filter = envBlock(stepOf(jobsOf(read('agent-triage.yml')).get('judge'), DIGEST), 'JUDGE_DIGEST');
  assert.ok(filter, 'JUDGE_DIGEST filter missing');
  const SECRET = 'ISSUE-BODY-SENTINEL';
  const messages = [
    { type: 'system', subtype: 'init', model: 'claude-x', apiKeySource: 'none', claude_code_version: '2.0.0', cwd: '/w',
      tools: ['Read'], mcp_servers: [{ name: 'github', status: 'connected' }], session_id: 's' },
    { type: 'user', message: { content: [{ type: 'text', text: `prompt ${SECRET}` }] } },
    { type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Read', input: { file_path: `/t/${SECRET}` } },
      { type: 'text', text: 'API Error: 401 invalid token' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: `body ${SECRET}` }] } },
    { type: 'result', subtype: 'success', is_error: true, result: `Invalid API key ${'x'.repeat(3000)}`,
      duration_ms: 1980, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0 }, modelUsage: {} },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'judge-digest-'));
  const file = join(dir, 'exec.json');
  writeFileSync(file, JSON.stringify(messages));
  const out = execFileSync('jq', [filter, file], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.doesNotMatch(out, new RegExp(SECRET), 'a user message, tool input or tool result leaked');
  const digest = JSON.parse(out);
  assert.deepEqual(digest.map((m) => m.type), ['system', 'assistant', 'result']);
  assert.equal(digest[0].apiKeySource, 'none');
  assert.equal(digest[0].cwd, undefined, 'init keeps named fields only');
  assert.equal(digest[1].text, 'API Error: 401 invalid token');
  assert.equal(digest[2].is_error, true);
  assert.equal(digest[2].total_cost_usd, 0);
  assert.match(digest[2].result, /^Invalid API key x+$/);
  assert.equal(digest[2].result.length, 2000);
});

test('agent.yml: dispatch knows the App login, so the App\'s agent:ready counts (R1)', () => {
  const dispatch = jobsOf(read('agent.yml')).get('dispatch');
  assert.match(dispatch, /^\s+AGENT_APP_LOGIN: \$\{\{ vars\.AGENT_APP_SLUG \}\}\[bot\]$/m);
});

test('agent.yml: the agent job may not add agent:ready or agent:needs-info itself (R102)', () => {
  const agent = jobsOf(read('agent.yml')).get('agent');
  assert.match(agent, /Bash\(gh issue edit \*agent:ready\*\)/);
  assert.match(agent, /Bash\(gh issue edit \*agent:needs-info\*\)/);
  assert.match(agent, /Bash\(gh label:\*\)/);
});
