// History reads for money, progress and size (docs/sdd/agent-office-live/spec.md R50 to R63, R43,
// R47; plan.md "Polling and the free quotas"; tasks.md T33). A fake GitHub counts calls: a second
// read inside 10 minutes makes 0 calls, a closed final issue is never re-read, a completed run's jobs
// and a finished release sha's statuses are read once, and every call is a GET path of the one repo.
//
// Run: TZ=UTC node --test scripts/lib/agent-office-history.test.mjs (in scripts/lib so CI's script runner reaches it)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_WORKFLOWS, HISTORY_TTL_MS, USAGE_JOB_NAME, acceptedUsageMarkers, bangkokDay, createHistory, isFinalIssue } from '../../agent-office/lib/history.mjs';

const REPO = 'Thitic9203/pluton-timesheet';
const START = '2026-10-16';
const T0 = Date.parse('2026-10-18T05:00:00Z'); // 12:00 Bangkok, 18 Oct

const issue = (number, state, closed_at = null, labels = ['agent:building']) => ({
  number, state, closed_at, labels: labels.map((name) => ({ name })), title: 't', body: 'secret body', user: { login: 'x' },
});

/** A fake GitHub: answers by path, counts every call, refuses anything outside the repo. */
function fakeGitHub(world) {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    assert.ok(path.startsWith(`/repos/${REPO}/`), `outside the repo: ${path}`);
    const p = path.split('?')[0];
    const tail = p.slice(`/repos/${REPO}/`.length);
    let m;
    if (tail === 'issues') return world.issues;
    if ((m = /^issues\/(\d+)\/comments$/.exec(tail))) return [{ id: Number(m[1]) * 10, user: { login: 'app[bot]', type: 'Bot' }, body: '<!-- agent-office:usage {} -->', created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z', reactions: { total: 1 } }];
    if ((m = /^issues\/(\d+)\/timeline$/.exec(tail))) return [{ event: 'labeled', label: { name: 'agent:building' }, actor: { login: 'app[bot]', type: 'Bot' }, created_at: '2026-10-17T00:00:00Z' }];
    if (tail === 'pulls') {
      const n = Number(/agent\/issue-(\d+)/.exec(decodeURIComponent(path))[1]);
      return [{ number: n + 1000, state: 'closed', head: { sha: `${n}`.padStart(40, 'a'), ref: `agent/issue-${n}` }, merged_at: null }];
    }
    if ((m = /^pulls\/(\d+)\/reviews$/.exec(tail))) return [{ id: 1, user: { login: 'app[bot]', type: 'Bot' }, state: 'APPROVED', commit_id: 'x', submitted_at: '2026-10-17T01:00:00Z', body: 'long text' }];
    if (tail === 'actions/runs') {
      const n = Number(/agent%2Fissue-(\d+)/.exec(path)[1]);
      return { total_count: 1, workflow_runs: [{ id: n * 100, name: 'CI', path: '.github/workflows/ci.yml', head_sha: 'b'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'failure', event: 'pull_request', created_at: '2026-10-17T02:00:00Z' }] };
    }
    if ((m = /^commits\/([0-9a-f]{40})\/check-runs$/.exec(tail))) return { total_count: 1, check_runs: [{ id: 7, name: 'app', head_sha: m[1], status: 'completed', conclusion: 'failure', started_at: '2026-10-17T02:00:00Z', completed_at: '2026-10-17T02:05:00Z', output: { text: 'big' } }] };
    if ((m = /^actions\/workflows\/([a-z-]+\.yml)\/runs$/.exec(tail))) return { workflow_runs: (world.runs[m[1]] ?? []) };
    if ((m = /^actions\/runs\/(\d+)\/jobs$/.exec(tail))) return { jobs: [{ id: 1, name: 'Agent work', run_attempt: 1, status: 'completed', conclusion: 'success', started_at: '2026-10-17T03:00:00Z', completed_at: '2026-10-17T03:30:00Z', steps: [{ name: 'x' }] }] };
    if ((m = /^commits\/([0-9a-f]{40})\/statuses$/.exec(tail))) return [
      { context: 'agent-office/e2e', state: 'success', description: '{"p":1,"f":0,"k":0,"s":0,"t":1}', target_url: 'https://x', created_at: '2026-10-17T04:00:00Z', creator: { login: 'github-actions[bot]', type: 'Bot' } },
      { context: 'agent/review', state: 'success', description: 'x', created_at: '2026-10-17T04:00:00Z', creator: { login: 'app[bot]', type: 'Bot' } },
    ];
    throw new Error(`unexpected path ${path}`);
  };
  return { get, calls };
}

const world = () => ({
  issues: [
    issue(1, 'closed', '2026-10-17T10:00:00Z'), // closed on a Bangkok day that has ended: final
    issue(2, 'open'),
    issue(3, 'closed', '2026-10-18T03:00:00Z'), // closed today (Bangkok): its bill day is not cut yet
    issue(4, 'open', null, ['bug']), // not an agent issue
    { ...issue(5, 'open'), pull_request: { url: 'x' } }, // a pull request, not an issue
  ],
  runs: {
    'agent.yml': [
      { id: 900, status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-10-17T03:00:00Z', head_sha: 'c'.repeat(40), event: 'issues' },
      { id: 901, status: 'in_progress', conclusion: null, run_attempt: 1, created_at: '2026-10-18T04:00:00Z', head_sha: 'c'.repeat(40), event: 'issues' },
    ],
    'ci.yml': [
      { id: 950, status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-10-17T03:00:00Z', head_sha: 'd'.repeat(40), event: 'push' },
      { id: 951, status: 'in_progress', conclusion: null, run_attempt: 1, created_at: '2026-10-18T04:00:00Z', head_sha: 'e'.repeat(40), event: 'push' },
    ],
  },
});

const perIssue = (calls, n) => calls.filter((p) => p.includes(`/issues/${n}/`) || p.includes(`issue-${n}`) || p.includes(`/pulls/${n + 1000}/`));

test('the Bangkok day and the final rule: closed, and its close day has ended in Asia/Bangkok', () => {
  assert.equal(bangkokDay(Date.parse('2026-10-17T16:59:59Z')), '2026-10-17');
  assert.equal(bangkokDay(Date.parse('2026-10-17T17:00:00Z')), '2026-10-18');
  assert.equal(isFinalIssue({ state: 'closed', closed_at: '2026-10-17T10:00:00Z' }, T0), true);
  assert.equal(isFinalIssue({ state: 'closed', closed_at: '2026-10-18T03:00:00Z' }, T0), false);
  assert.equal(isFinalIssue({ state: 'open', closed_at: null }, T0), false);
});

test('R50 to R63: one read returns the agent issues with their facts, the agent workflow jobs and the E2E statuses', async () => {
  const gh = fakeGitHub(world());
  const h = createHistory({ get: gh.get, repo: REPO, economyStart: START, now: () => T0 });
  const r = await h.read();
  assert.deepEqual(r.issues.map((i) => [i.number, i.final]), [[1, true], [2, false], [3, false]]);
  const one = r.issues[0];
  assert.deepEqual(one.labels, ['agent:building']);
  assert.equal('body' in one, false, 'the issue text is not carried');
  assert.deepEqual(Object.keys(one.comments[0]).sort(), ['body', 'created_at', 'id', 'updated_at', 'user']);
  assert.equal(one.pulls[0].reviews[0].state, 'APPROVED');
  assert.equal('body' in one.pulls[0].reviews[0], false);
  assert.equal(one.runs[0].conclusion, 'failure');
  assert.equal(one.checkRuns['b'.repeat(40)][0].conclusion, 'failure');
  assert.equal('output' in one.checkRuns['b'.repeat(40)][0], false);
  assert.deepEqual(r.agentRuns.map((x) => [x.workflow, x.id, x.jobs.length]), [['agent.yml', 900, 1], ['agent.yml', 901, 1]]);
  assert.deepEqual(r.e2e.map((x) => [x.sha.slice(0, 1), x.statuses.map((s) => s.context)]), [['d', ['agent-office/e2e']], ['e', ['agent-office/e2e']]]);
  assert.equal(r.calls, gh.calls.length);
  assert.equal(r.readAt, new Date(T0).toISOString());
  for (const w of AGENT_WORKFLOWS) assert.ok(gh.calls.some((p) => p.includes(`/actions/workflows/${w}/runs`)), w);
  assert.ok(gh.calls[0].includes(`since=${encodeURIComponent('2026-10-15T17:00:00.000Z')}`), 'since economyStart, Bangkok midnight');
});

test('R47: a second read inside 10 minutes makes 0 calls', async () => {
  let now = T0;
  const gh = fakeGitHub(world());
  const h = createHistory({ get: gh.get, repo: REPO, economyStart: START, now: () => now });
  const first = await h.read();
  const n = gh.calls.length;
  now += HISTORY_TTL_MS - 1;
  const second = await h.read();
  assert.equal(gh.calls.length, n);
  assert.equal(second, first);
  assert.equal(HISTORY_TTL_MS, 10 * 60 * 1000);
});

test('R47: after 10 minutes a closed final issue is never re-read; open and not-yet-final ones are', async () => {
  let now = T0;
  const gh = fakeGitHub(world());
  const h = createHistory({ get: gh.get, repo: REPO, economyStart: START, now: () => now });
  await h.read();
  const before = gh.calls.length;
  now += HISTORY_TTL_MS;
  const r = await h.read();
  const after = gh.calls.slice(before);
  assert.deepEqual(perIssue(after, 1), [], 'issue 1 is final');
  assert.ok(perIssue(after, 2).length > 0, 'issue 2 is open');
  assert.ok(perIssue(after, 3).length > 0, 'issue 3 closed today');
  assert.equal(r.issues.find((i) => i.number === 1).comments.length, 1, 'the cached facts are still returned');
  // A completed run's jobs and a completed release run's statuses are read once.
  assert.equal(after.filter((p) => p.includes('/actions/runs/900/jobs')).length, 0);
  assert.equal(after.filter((p) => p.includes('/actions/runs/901/jobs')).length, 1);
  assert.equal(after.filter((p) => p.includes(`/commits/${'d'.repeat(40)}/statuses`)).length, 0);
  assert.equal(after.filter((p) => p.includes(`/commits/${'e'.repeat(40)}/statuses`)).length, 1);
  assert.equal(r.calls, after.length);
});

test('R43: every call is a path of the configured repo, never a method or a body', async () => {
  const seen = [];
  const get = async (...args) => { seen.push(args.length); return fakeGitHub(world()).get(args[0]); };
  await createHistory({ get, repo: REPO, economyStart: START, now: () => T0 }).read();
  assert.ok(seen.length > 0);
  assert.ok(seen.every((n) => n === 1), 'get is called with the path alone');
});

test('a failed read is not cached: the next read tries again', async () => {
  let fail = true;
  const inner = fakeGitHub(world());
  const get = async (p) => { if (fail) throw new Error('403 rate limit'); return inner.get(p); };
  const h = createHistory({ get, repo: REPO, economyStart: START, now: () => T0 });
  await assert.rejects(h.read(), /403/);
  fail = false;
  const r = await h.read();
  assert.equal(r.issues.length, 3);
});

test('R59: jobs are read for every attempt, and a re-run attempt is read again even after the run completed once', async () => {
  let now = T0;
  const w = world();
  const gh = fakeGitHub(w);
  const h = createHistory({ get: gh.get, repo: REPO, economyStart: START, now: () => now });
  await h.read();
  assert.ok(gh.calls.filter((p) => p.includes('/actions/runs/900/jobs')).every((p) => p.includes('filter=all')));
  w.runs['agent.yml'][0] = { ...w.runs['agent.yml'][0], run_attempt: 2, status: 'completed' };
  now += HISTORY_TTL_MS;
  const before = gh.calls.length;
  const r = await h.read();
  assert.equal(gh.calls.slice(before).filter((p) => p.includes('/actions/runs/900/jobs')).length, 1, 'attempt 2 is new');
  assert.equal(r.agentRuns[0].jobs[0].run_attempt, 1, 'each job keeps its own attempt');
});

// ---- R59: which usage markers count.

const APP = 'taskfolio-agent[bot]';
const usage = (o) => `<!-- agent-office:usage ${JSON.stringify({ v: 1, issue: 7, run_id: 900, run_attempt: 1, job: 'agent', step: 'work', input: 10, ...o })} -->`;
let cid = 1;
const comment = (body, at, user = { login: APP, type: 'Bot' }) => ({ id: cid++, user, body, created_at: at, updated_at: at });
const runOf = (id, jobs) => ({ workflow: 'agent.yml', id, run_attempt: 1, status: 'completed', jobs });
const job = (name, run_attempt, conclusion) => ({ id: cid++, name, run_attempt, status: 'completed', conclusion });

function historyOf(comments, runs) {
  return {
    issues: [{ number: 7, comments }],
    agentRuns: runs ?? [
      runOf(900, [job('Agent work', 1, 'success'), job(USAGE_JOB_NAME, 1, 'success'), job(USAGE_JOB_NAME, 2, 'failure')]),
      runOf(901, [job(USAGE_JOB_NAME, 1, 'failure')]),
      { ...runOf(902, [job(USAGE_JOB_NAME, 1, 'success')]), workflow: 'agent-sweep.yml' },
    ],
  };
}

test('R59: a marker counts only when its run\'s usage job succeeded in that attempt, on its own issue, by the App', () => {
  assert.equal(USAGE_JOB_NAME, 'Agent usage');
  const h = historyOf([
    comment(usage({}), '2026-10-17T01:00:00Z'),
    comment(usage({ step: 'review', job: 'review' }), '2026-10-17T01:05:00Z'),
    comment(usage({ run_attempt: 2 }), '2026-10-17T01:10:00Z'), // usage job failed in attempt 2
    comment(usage({ run_id: 901 }), '2026-10-17T01:15:00Z'), // usage job failed
    comment(usage({ run_id: 902 }), '2026-10-17T01:20:00Z'), // not an agent.yml run
    comment(usage({ run_id: 999 }), '2026-10-17T01:25:00Z'), // no such run read
    comment(usage({ issue: 8 }), '2026-10-17T01:30:00Z'), // another issue's marker
    comment(usage({}), '2026-10-17T01:35:00Z', { login: 'Thitic9203', type: 'User' }), // not the App
    comment(usage({}), '2026-10-17T01:40:00Z', { login: APP, type: 'User' }), // a User named like the App
    comment('<!-- agent-office:usage {broken -->', '2026-10-17T01:45:00Z'),
  ]);
  const { markers, warnings } = acceptedUsageMarkers(h, { botLogin: APP });
  assert.deepEqual(markers.map((m) => [m.run_id, m.run_attempt, m.step]), [[900, 1, 'work'], [900, 1, 'review']]);
  assert.equal(markers[0].input, 10);
  assert.equal(markers[0].commentAt, '2026-10-17T01:00:00Z');
  assert.equal(warnings.length, 8);
  for (const [i, why] of [[0, /usage job/], [1, /usage job/], [2, /not an agent\.yml run/], [3, /not an agent\.yml run/], [4, /another issue/], [5, /not by the agent App/], [6, /not by the agent App/], [7, /not JSON/]]) {
    assert.match(warnings[i], why, warnings[i]);
  }
});

test('R59: markers are de-duplicated by run, attempt and step, the earliest comment counting', () => {
  const h = historyOf([
    comment(usage({ input: 99 }), '2026-10-17T02:00:00Z'),
    comment(usage({ input: 10 }), '2026-10-17T01:00:00Z'),
  ]);
  const { markers, warnings } = acceptedUsageMarkers(h, { botLogin: APP });
  assert.deepEqual(markers.map((m) => m.input), [10]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duplicate/);
});

test('bad input fails closed', () => {
  assert.throws(() => createHistory({ get: async () => [], repo: 'no-slash', economyStart: START }), /repo/);
  assert.throws(() => createHistory({ get: async () => [], repo: REPO, economyStart: '16 Oct' }), /economyStart/);
  assert.throws(() => createHistory({ repo: REPO, economyStart: START }), /get/);
});
