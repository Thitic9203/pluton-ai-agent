// The path after merge (docs/superpowers/plans/always-on-dev-agent.md row 12;
// agent-workflow-and-economy.md section 2b): staged issues, the batch of 10, the QA Lead's release.
//
// Run: TZ=UTC node --test scripts/lib/agent-release.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BATCH_SIZE,
  BATCH_READY_LABEL,
  ON_TEST_ENV,
  RELEASE_BRANCH,
  batchDecision,
  deployStagingPassed,
  findDispatchedRun,
  issueFromBranch,
  qaLeadMessage,
  releaseInputProblem,
  roundIssues,
  stagedIssues,
  waitingIssues,
} from '../agent/release.mjs';

const SHA = 'a'.repeat(40);
const pr = (n, { base = RELEASE_BRANCH, merged = true, head = `agent/issue-${n}`, merge = `m${n}` } = {}) => ({
  number: 100 + n,
  base: { ref: base },
  head: { ref: head },
  merged_at: merged ? '2026-10-15T00:00:00Z' : null,
  merge_commit_sha: merge,
});
const issue = (n, labels = [], state = 'open') => ({ number: n, state, labels: labels.map((name) => ({ name })) });

test('the constants are the ones the plan names', () => {
  assert.equal(BATCH_SIZE, 10);
  assert.equal(RELEASE_BRANCH, 'release/next');
  assert.equal(ON_TEST_ENV, 'agent:on-test-env');
  assert.equal(BATCH_READY_LABEL, 'release:batch-ready');
});

test('issueFromBranch reads only an exact agent/issue-N branch', () => {
  assert.equal(issueFromBranch('agent/issue-42'), 42);
  for (const ref of ['agent/issue-', 'agent/issue-4x', 'refs/heads/agent/issue-4', 'agent/lane-a', 'agent/issue-04', '', undefined]) {
    assert.equal(issueFromBranch(ref), null, String(ref));
  }
});

test('deployStagingPassed needs the Deploy staging job itself to have succeeded', () => {
  assert.equal(deployStagingPassed([{ name: 'Deploy staging', conclusion: 'success' }, { name: 'Slack', conclusion: 'failure' }]), true);
  assert.equal(deployStagingPassed([{ name: 'Deploy staging', conclusion: 'skipped' }]), false);
  assert.equal(deployStagingPassed([{ name: 'Deploy staging', conclusion: 'failure' }]), false);
  assert.equal(deployStagingPassed([{ name: 'Application', conclusion: 'success' }]), false);
  assert.equal(deployStagingPassed([]), false);
});

test('stagedIssues: merged agent pull requests whose merge commit the deployed sha contains', () => {
  const pulls = [pr(1), pr(2, { base: 'main' }), pr(3, { merged: false }), pr(4, { head: 'feature/x' }), pr(5), pr(1, { merge: 'm1b' }), pr(6, { base: 'other' })];
  const contained = new Set(['m1', 'm2', 'm3', 'm4', 'm1b', 'm6']);
  assert.deepEqual(stagedIssues({ pulls, isAncestor: (c) => contained.has(c) }), [1, 2]);
});

test('waitingIssues: open, merged into release/next, not yet on the test environment', () => {
  const pulls = [pr(1), pr(2), pr(3), pr(4, { base: 'main' }), pr(5, { merged: false })];
  const issues = [issue(1), issue(2, [ON_TEST_ENV]), issue(3, [], 'closed'), issue(4), issue(5)];
  assert.deepEqual(waitingIssues({ pulls, issues }), [1]);
});

test('batchDecision: below ten nothing happens', () => {
  const issues = Array.from({ length: 9 }, (_, i) => issue(i + 1));
  assert.deepEqual(batchDecision({ waiting: issues.map((i) => i.number), issues }), { ready: false, notify: false, toLabel: [] });
});

test('batchDecision: at ten the QA Lead is told once, and every waiting issue is labelled', () => {
  const issues = Array.from({ length: 10 }, (_, i) => issue(i + 1));
  const waiting = issues.map((i) => i.number);
  assert.deepEqual(batchDecision({ waiting, issues }), { ready: true, notify: true, toLabel: waiting });
  const told = issues.map((i) => issue(i.number, [BATCH_READY_LABEL]));
  assert.deepEqual(batchDecision({ waiting, issues: told }), { ready: true, notify: false, toLabel: [] });
  const eleventh = [...told, issue(11)];
  assert.deepEqual(batchDecision({ waiting: [...waiting, 11], issues: eleventh }), { ready: true, notify: true, toLabel: [11] });
});

test('qaLeadMessage names the QA Lead, the count, every issue and the release workflow', () => {
  const text = qaLeadMessage({ waiting: [3, 1, 2], qaLead: 'qa-lead', repo: 'o/r' });
  assert.match(text, /^@qa-lead /);
  assert.match(text, /3 issues/);
  assert.match(text, /#1, #2, #3/);
  assert.match(text, /release\/next/);
  assert.match(text, /agent-release\.yml/);
  assert.throws(() => qaLeadMessage({ waiting: [1], qaLead: '', repo: 'o/r' }), /QA Lead/);
});

test('releaseInputProblem: only the QA Lead, a full sha and a Slack regression link', () => {
  const ok = { sha: SHA, regressionUrl: 'https://skilllane.slack.com/archives/C0C8TSRK1PE/p1760000000000000', actor: 'qa-lead', qaLead: 'qa-lead' };
  assert.equal(releaseInputProblem(ok), null);
  assert.match(releaseInputProblem({ ...ok, qaLead: '' }), /AGENT_QA_LEAD/);
  assert.match(releaseInputProblem({ ...ok, actor: 'someone' }), /QA Lead/);
  assert.match(releaseInputProblem({ ...ok, sha: 'abc' }), /40/);
  assert.match(releaseInputProblem({ ...ok, sha: 'A'.repeat(40) }), /40/);
  for (const url of ['', 'http://skilllane.slack.com/archives/C1/p1', 'https://evil.example/archives/C1/p1', 'https://slack.com.evil.example/archives/C/p1']) {
    assert.match(releaseInputProblem({ ...ok, regressionUrl: url }), /Slack/, url);
  }
});

test('roundIssues: open issues on the test environment whose merge the released sha contains', () => {
  const pulls = [pr(1), pr(2), pr(3), pr(4)];
  const issues = [issue(1, [ON_TEST_ENV]), issue(2), issue(3, [ON_TEST_ENV], 'closed'), issue(4, [ON_TEST_ENV])];
  const contained = new Set(['m1', 'm2', 'm3']);
  assert.deepEqual(roundIssues({ pulls, issues, isAncestor: (c) => contained.has(c) }), [1]);
});

const BOT = { login: 'github-actions[bot]' };
const run = (id, over = {}) => ({ id, event: 'workflow_dispatch', head_branch: 'main', created_at: '2026-10-15T10:00:01Z', triggering_actor: BOT, ...over });

test('findDispatchedRun: the one dispatch on main by the workflow token at or after the request', () => {
  const runs = [
    run(1, { created_at: '2026-10-15T09:59:59Z' }),
    run(2),
    run(3, { head_branch: 'other' }),
    run(4, { event: 'push' }),
    run(5, { triggering_actor: { login: 'qa-lead' } }),
  ];
  assert.deepEqual(findDispatchedRun(runs, '2026-10-15T10:00:00Z'), { run: runs[1], problem: null });
});

test('findDispatchedRun: a person\'s manual deploy in the same window is never taken as this release', () => {
  const runs = [run(5, { triggering_actor: { login: 'qa-lead' } }), run(6, { triggering_actor: null })];
  assert.deepEqual(findDispatchedRun(runs, '2026-10-15T10:00:00Z'), { run: null, problem: null });
});

test('findDispatchedRun: none yet waits, and more than one bot dispatch is refused', () => {
  assert.deepEqual(findDispatchedRun([run(1)], '2026-10-15T11:00:00Z'), { run: null, problem: null });
  const two = findDispatchedRun([run(1), run(2, { created_at: '2026-10-15T10:00:05Z' })], '2026-10-15T10:00:00Z');
  assert.equal(two.run, null);
  assert.match(two.problem, /2 production runs/);
});
