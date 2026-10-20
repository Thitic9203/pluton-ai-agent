// The I/O half of the path after merge, against a fake GitHub (scripts/agent/release-cli.mjs).
//
// Run: TZ=UTC node --test scripts/lib/agent-release-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCount, runRelease, runStaged } from '../agent/release-cli.mjs';

const SHA = 'b'.repeat(40);
const pull = (n, base = 'release/next') => ({ number: 100 + n, base: { ref: base }, head: { ref: `agent/issue-${n}` }, merged_at: '2026-10-15T00:00:00Z', merge_commit_sha: `m${n}` });
const issue = (n, labels = [], state = 'open') => ({ number: n, state, labels: labels.map((name) => ({ name })) });

function fakeGh({ jobs = [], pulls = { 'release/next': [], main: [] }, issues = [], runs = [] } = {}) {
  const calls = [];
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  return {
    calls,
    get: async (p) => {
      calls.push(['GET', p]);
      const m = p.match(/\/issues\/(\d+)$/);
      if (m) return byNumber.get(Number(m[1]));
      if (p.includes('/deploy-production.yml/runs')) return { workflow_runs: runs };
      throw new Error(`unexpected GET ${p}`);
    },
    all: async (p) => {
      calls.push(['ALL', p]);
      if (p.includes('/jobs')) return jobs;
      const base = decodeURIComponent(p.match(/base=([^&]+)/)[1]);
      return pulls[base] ?? [];
    },
    post: async (p, b) => { calls.push(['POST', p, b]); return null; },
    patch: async (p, b) => { calls.push(['PATCH', p, b]); return null; },
  };
}
const writes = (gh) => gh.calls.filter(([m]) => m === 'POST' || m === 'PATCH');

test('runStaged writes nothing when Deploy staging did not succeed', async () => {
  const gh = fakeGh({ jobs: [{ name: 'Deploy staging', conclusion: 'skipped' }], pulls: { 'release/next': [pull(1)], main: [] }, issues: [issue(1)] });
  assert.deepEqual(await runStaged({ RUN_ID: '9' }, { gh, isAncestor: () => true }), []);
  assert.deepEqual(writes(gh), []);
});

test('runStaged labels each staged open issue once, and skips one already labelled or closed', async () => {
  const gh = fakeGh({
    jobs: [{ name: 'Deploy staging', conclusion: 'success' }],
    pulls: { 'release/next': [pull(1), pull(2), pull(3)], main: [pull(4, 'main')] },
    issues: [issue(1), issue(2, ['agent:on-test-env']), issue(3, [], 'closed'), issue(4)],
  });
  assert.deepEqual(await runStaged({ RUN_ID: '9' }, { gh, isAncestor: () => true }), [1, 4]);
  assert.deepEqual(writes(gh).map(([, p, b]) => [p, b.labels]), [
    ['/repos/{repo}/issues/1/labels', ['agent:on-test-env']],
    ['/repos/{repo}/issues/4/labels', ['agent:on-test-env']],
  ]);
});

test('runCount: nine waiting tells nobody; ten labels all and comments once with the QA Lead named', async () => {
  const nine = Array.from({ length: 9 }, (_, i) => i + 1);
  const gh9 = fakeGh({ pulls: { 'release/next': nine.map((n) => pull(n)) }, issues: nine.map((n) => issue(n)) });
  const r9 = await runCount({ AGENT_QA_LEAD: 'qa', GITHUB_REPOSITORY: 'o/r' }, { gh: gh9 });
  assert.equal(r9.notify, false);
  assert.deepEqual(writes(gh9), []);

  const ten = Array.from({ length: 10 }, (_, i) => i + 1);
  const gh10 = fakeGh({ pulls: { 'release/next': ten.map((n) => pull(n)) }, issues: ten.map((n) => issue(n)) });
  const r10 = await runCount({ AGENT_QA_LEAD: 'qa', GITHUB_REPOSITORY: 'o/r' }, { gh: gh10 });
  assert.equal(r10.notify, true);
  const posts = writes(gh10);
  assert.equal(posts.filter(([, p]) => p.endsWith('/labels')).length, 10);
  const comments = posts.filter(([, p]) => p.endsWith('/comments'));
  assert.equal(comments.length, 1);
  assert.match(comments[0][2].body, /^@qa 10 issues/);
});

// Plan row 14: the Slack step of the count job replies in each waiting issue's thread, so the
// numbers it needs are a step output, space separated.
test('runCount: the waiting issues are an output for the Slack step', async () => {
  const { mkdtempSync, readFileSync: readOut, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'release-count-'));
  try {
    const out = join(dir, 'out');
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    const gh = fakeGh({ pulls: { 'release/next': ten.map((n) => pull(n)) }, issues: ten.map((n) => issue(n)) });
    const log = console.log;
    console.log = () => {};
    try {
      await runCount({ AGENT_QA_LEAD: 'qa', GITHUB_REPOSITORY: 'o/r', GITHUB_OUTPUT: out }, { gh });
    } finally {
      console.log = log;
    }
    assert.match(readOut(out, 'utf8'), /^waiting_issues=1 2 3 4 5 6 7 8 9 10$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const releaseEnv = { RELEASE_SHA: SHA, REGRESSION_URL: 'https://t.slack.com/archives/C0C8TSRK1PE/p1', TRIGGERING_ACTOR: 'qa', AGENT_QA_LEAD: 'qa' };
const noWait = { now: () => new Date('2026-10-15T10:00:00Z'), sleep: async () => {}, pollMs: 0, maxPolls: 2 };

test('runRelease refuses anyone but the QA Lead before it dispatches anything', async () => {
  const gh = fakeGh();
  await assert.rejects(runRelease({ ...releaseEnv, TRIGGERING_ACTOR: 'someone' }, { gh, isAncestor: () => true, ...noWait }), /QA Lead/);
  assert.deepEqual(gh.calls, []);
});

test('runRelease closes no issue when the production run failed', async () => {
  const gh = fakeGh({
    pulls: { 'release/next': [pull(1)], main: [] },
    issues: [issue(1, ['agent:on-test-env'])],
    runs: [{ event: 'workflow_dispatch', head_branch: 'main', created_at: '2026-10-15T10:00:01Z', triggering_actor: { login: 'github-actions[bot]' }, status: 'completed', conclusion: 'failure', html_url: 'u' }],
  });
  await assert.rejects(runRelease(releaseEnv, { gh, isAncestor: () => true, ...noWait }), /failure/);
  assert.deepEqual(writes(gh).map(([m, p]) => [m, p]), [['POST', '/repos/{repo}/actions/workflows/deploy-production.yml/dispatches']]);
});

test('runRelease dispatches production with the sha on main, then closes the round on success', async () => {
  const gh = fakeGh({
    pulls: { 'release/next': [pull(1), pull(2), pull(3)], main: [] },
    issues: [issue(1, ['agent:on-test-env']), issue(2, ['agent:on-test-env']), issue(3)],
    runs: [{ event: 'workflow_dispatch', head_branch: 'main', created_at: '2026-10-15T10:00:01Z', triggering_actor: { login: 'github-actions[bot]' }, status: 'completed', conclusion: 'success', html_url: 'u' }],
  });
  assert.deepEqual(await runRelease(releaseEnv, { gh, isAncestor: (c) => c !== 'm2', ...noWait }), [1]);
  const w = writes(gh);
  assert.deepEqual(w[0], ['POST', '/repos/{repo}/actions/workflows/deploy-production.yml/dispatches', { ref: 'main', inputs: { sha: SHA } }]);
  assert.deepEqual(w.slice(1).map(([m, p]) => [m, p]), [['POST', '/repos/{repo}/issues/1/comments'], ['PATCH', '/repos/{repo}/issues/1']]);
  assert.deepEqual(w[2][2], { state: 'closed', state_reason: 'completed' });
});

const onlyDispatch = (gh) => assert.deepEqual(writes(gh).map(([m, p]) => [m, p]), [['POST', '/repos/{repo}/actions/workflows/deploy-production.yml/dispatches']]);
const done = (over) => ({ event: 'workflow_dispatch', head_branch: 'main', created_at: '2026-10-15T10:00:01Z', triggering_actor: { login: 'github-actions[bot]' }, status: 'completed', conclusion: 'success', html_url: 'u', ...over });

test('runRelease closes nothing when only a person\'s manual production run is found', async () => {
  const gh = fakeGh({
    pulls: { 'release/next': [pull(1)], main: [] },
    issues: [issue(1, ['agent:on-test-env'])],
    runs: [done({ triggering_actor: { login: 'qa' } })],
  });
  await assert.rejects(runRelease(releaseEnv, { gh, isAncestor: () => true, ...noWait }), /did not finish in time|no production run/i);
  onlyDispatch(gh);
});

test('runRelease refuses and closes nothing when two workflow-token production runs match', async () => {
  const gh = fakeGh({
    pulls: { 'release/next': [pull(1)], main: [] },
    issues: [issue(1, ['agent:on-test-env'])],
    runs: [done({ id: 1 }), done({ id: 2, created_at: '2026-10-15T10:00:03Z' })],
  });
  await assert.rejects(runRelease(releaseEnv, { gh, isAncestor: () => true, ...noWait }), /2 production runs/);
  onlyDispatch(gh);
});
