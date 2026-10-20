// docs/sdd/repo-split/spec.md R15, R16: a repository_dispatch from pluton-timesheet is rebuilt into the
// event the scripts judged before the split, from the API, and the payload decides nothing but which
// object to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PAYLOAD_KEYS, TYPES, payloadProblem, rehydrate } from '../agent/relay-event.mjs';
import { dispatchDecision } from '../agent/cli.mjs';

const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const owner = { login: 'Thitic9203', type: 'User' };
const app = { login: 'taskfolio-dev-agent[bot]', type: 'Bot' };

/** A fake of the cli api(): GET only, keyed by path with {repo} left in; a missing path is a 404. */
function fakeGh(routes) {
  const seen = [];
  const get = async (p) => {
    seen.push(p);
    if (!(p in routes)) throw new Error(`GET https://api.github.com${p} returned 404`);
    return routes[p];
  };
  return { seen, get, all: get, pages: async (p) => [await get(p)] };
}

const issue7 = (labels, state = 'open') => ({ number: 7, state, labels: labels.map((name) => ({ name })), user: owner });
const labeledTimeline = (label, actor, event = 'labeled') => [
  { event: 'labeled', label: { name: label }, actor: owner, created_at: '2026-10-20T01:00:00Z' },
  { event, label: { name: label }, actor, created_at: '2026-10-20T02:00:00Z' },
];

test('R15: the types map to the old event names, and the payload keys are identifiers only', () => {
  assert.deepEqual(TYPES, {
    'ts-issues': 'issues', 'ts-issue-comment': 'issue_comment', 'ts-pr-review': 'pull_request_review',
    'ts-ci-completed': 'workflow_run', 'ts-ci-main-completed': 'workflow_run', 'ts-status': 'status', 'ts-release-next': 'push', 'ts-main-push': 'push',
    'ts-deploy-production': 'workflow_run',
  });
  assert.ok(PAYLOAD_KEYS.length <= 10, 'GitHub allows at most 10 top-level client_payload keys');
  assert.ok(!PAYLOAD_KEYS.some((k) => /^(body|text|sender|user|login|state|labels|issue|comment|pull_request|workflow_run)$/.test(k)), 'no body, sender or state key');
});

test('R16: a payload with an unknown key, a body, or a malformed identifier is refused', () => {
  assert.equal(payloadProblem({ number: 7, action: 'labeled', label: 'agent:ready' }), null);
  assert.match(payloadProblem({ number: 7, body: '/approve-plan' }), /body/);
  assert.match(payloadProblem({ number: -1 }), /number/);
  assert.match(payloadProblem({ sha: 'xyz' }), /sha/);
  assert.match(payloadProblem({ action: { nested: true } }), /action/);
  assert.match(payloadProblem(null), /object/);
});

test('R16: ts-issues labeled is rebuilt with the labeller read from the timeline, not the payload', async () => {
  const gh = fakeGh({
    '/repos/{repo}/issues/7': issue7(['agent:ready']),
    '/repos/{repo}/issues/7/timeline?per_page=100': labeledTimeline('agent:ready', app),
  });
  const { eventName, event } = await rehydrate({ type: 'ts-issues', payload: { action: 'labeled', number: 7, label: 'agent:ready' } }, gh);
  assert.equal(eventName, 'issues');
  assert.equal(event.action, 'labeled');
  assert.equal(event.label.name, 'agent:ready');
  assert.deepEqual(event.sender, app);
  assert.equal(event.issue.number, 7);
});

test('R16: ts-issues labeled with a label the issue does not carry is ignored by the dispatcher', async () => {
  const gh = fakeGh({
    '/repos/{repo}/issues/7': issue7([]),
    '/repos/{repo}/issues/7/timeline?per_page=100': labeledTimeline('agent:ready', owner),
  });
  const { eventName, event } = await rehydrate({ type: 'ts-issues', payload: { action: 'labeled', number: 7, label: 'agent:ready' } }, gh);
  const d = dispatchDecision({ eventName, event, building: [], repo: 'Thitic9203/pluton-timesheet', mods: {} });
  assert.equal(d.action, 'ignore');
});

test('R16: ts-issues closed on an open issue, and unlabeled of a label still on it, are ignored', async () => {
  const gh = fakeGh({
    '/repos/{repo}/issues/7': issue7(['agent:building']),
    '/repos/{repo}/issues/7/timeline?per_page=100': labeledTimeline('agent:building', app, 'unlabeled'),
  });
  for (const payload of [{ action: 'closed', number: 7 }, { action: 'unlabeled', number: 7, label: 'agent:building' }]) {
    const { eventName, event } = await rehydrate({ type: 'ts-issues', payload }, gh);
    const d = dispatchDecision({ eventName, event, building: [], repo: 'r', mods: {} });
    assert.equal(d.action, 'ignore', JSON.stringify(payload));
  }
});

test('R16: ts-issues closed on a closed agent issue drains, unlabeled agent:building drains', async () => {
  const closed = fakeGh({ '/repos/{repo}/issues/7': { ...issue7(['agent:building'], 'closed'), closed_by: owner } });
  let r = await rehydrate({ type: 'ts-issues', payload: { action: 'closed', number: 7 } }, closed);
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'r', mods: {} }).action, 'drain');
  const unl = fakeGh({
    '/repos/{repo}/issues/7': issue7([]),
    '/repos/{repo}/issues/7/timeline?per_page=100': labeledTimeline('agent:building', app, 'unlabeled'),
  });
  r = await rehydrate({ type: 'ts-issues', payload: { action: 'unlabeled', number: 7, label: 'agent:building' } }, unl);
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'r', mods: {} }).action, 'drain');
});

test('R16: ts-issue-comment reads the comment text and author from the API', async () => {
  const gh = fakeGh({
    '/repos/{repo}/issues/comments/55': { id: 55, body: '/approve-plan', user: owner, issue_url: 'https://api.github.com/repos/Thitic9203/pluton-timesheet/issues/7' },
    '/repos/{repo}/issues/7': issue7(['agent:planning']),
  });
  const { eventName, event } = await rehydrate({ type: 'ts-issue-comment', payload: { action: 'created', number: 7, comment_id: 55 } }, gh);
  assert.equal(eventName, 'issue_comment');
  assert.equal(event.comment.body, '/approve-plan');
  assert.deepEqual(event.sender, owner);
  const d = dispatchDecision({ eventName, event, building: [], repo: 'r', mods: { isOwnerAct: (s) => s.login === 'Thitic9203', parseCommand: (b) => (b.startsWith('/') ? { command: b.slice(1) } : null), LIMIT: 3 } });
  assert.equal(d.action, 'continue');
});

test('R16: a comment of another issue, or one that does not exist, is ignored', async () => {
  const gh = fakeGh({
    '/repos/{repo}/issues/comments/55': { id: 55, body: '/approve-plan', user: owner, issue_url: 'https://api.github.com/repos/Thitic9203/pluton-timesheet/issues/8' },
    '/repos/{repo}/issues/7': issue7(['agent:planning']),
  });
  for (const comment_id of [55, 56]) {
    const r = await rehydrate({ type: 'ts-issue-comment', payload: { action: 'created', number: 7, comment_id } }, gh);
    assert.equal(dispatchDecision({ ...r, building: [], repo: 'r', mods: {} }).action, 'ignore', String(comment_id));
  }
});

test('R16: ts-pr-review reads the pull request and the review; a pending review is ignored', async () => {
  const pr = { number: 9, head: { ref: 'agent/issue-7', repo: { full_name: 'Thitic9203/pluton-timesheet' } } };
  const gh = fakeGh({
    '/repos/{repo}/pulls/9': pr,
    '/repos/{repo}/pulls/9/reviews/3': { id: 3, state: 'APPROVED', user: owner },
    '/repos/{repo}/pulls/9/reviews/4': { id: 4, state: 'PENDING', user: owner },
  });
  let r = await rehydrate({ type: 'ts-pr-review', payload: { action: 'submitted', number: 9, review_id: 3 } }, gh);
  assert.equal(r.eventName, 'pull_request_review');
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'Thitic9203/pluton-timesheet', mods: {} }).action, 'merge-check');
  r = await rehydrate({ type: 'ts-pr-review', payload: { action: 'submitted', number: 9, review_id: 4 } }, gh);
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'Thitic9203/pluton-timesheet', mods: {} }).action, 'ignore');
});

test('R16: ts-ci-completed reads the run; only a completed run named CI counts', async () => {
  const run = { id: 11, name: 'CI', status: 'completed', head_sha: SHA, head_branch: 'agent/issue-7', head_repository: { full_name: 'Thitic9203/pluton-timesheet' } };
  const gh = fakeGh({
    '/repos/{repo}/actions/runs/11': run,
    '/repos/{repo}/actions/runs/12': { ...run, id: 12, name: 'Agent' },
    '/repos/{repo}/actions/runs/13': { ...run, id: 13, status: 'in_progress' },
  });
  let r = await rehydrate({ type: 'ts-ci-completed', payload: { action: 'completed', run_id: 11 } }, gh);
  const d = dispatchDecision({ ...r, building: [], repo: 'Thitic9203/pluton-timesheet', mods: {} });
  assert.equal(d.action, 'merge-check');
  assert.equal(d.sha, SHA);
  for (const run_id of [12, 13, 14]) {
    r = await rehydrate({ type: 'ts-ci-completed', payload: { action: 'completed', run_id } }, gh);
    assert.equal(dispatchDecision({ ...r, building: [], repo: 'Thitic9203/pluton-timesheet', mods: {} }).action, 'ignore', String(run_id));
  }
});

test('R15, R16: ts-ci-main-completed needs CI of a main branch run started by a git event', async () => {
  const run = { id: 31, name: 'CI', status: 'completed', event: 'push', head_branch: 'main', head_sha: SHA };
  const gh = fakeGh({
    '/repos/{repo}/actions/runs/31': run,
    '/repos/{repo}/actions/runs/32': { ...run, id: 32, head_branch: 'agent/issue-7' },
    '/repos/{repo}/actions/runs/33': { ...run, id: 33, event: 'pull_request' },
  });
  const ok = await rehydrate({ type: 'ts-ci-main-completed', payload: { run_id: 31 } }, gh);
  assert.equal(ok.event.workflow_run.head_sha, SHA);
  for (const run_id of [32, 33]) {
    const r = await rehydrate({ type: 'ts-ci-main-completed', payload: { run_id } }, gh);
    assert.equal(r.event.action, 'relay-unconfirmed', String(run_id));
  }
});

test('R16: ts-deploy-production needs a completed run named Deploy production', async () => {
  const gh = fakeGh({ '/repos/{repo}/actions/runs/21': { id: 21, name: 'Deploy production', status: 'completed', conclusion: 'success' } });
  const r = await rehydrate({ type: 'ts-deploy-production', payload: { run_id: 21 } }, gh);
  assert.equal(r.eventName, 'workflow_run');
  assert.equal(r.event.action, 'completed');
  assert.equal(r.event.workflow_run.name, 'Deploy production');
});

test('R16: ts-status reads the state and the branches of the sha; a context not on it is ignored', async () => {
  const gh = fakeGh({
    [`/repos/{repo}/commits/${SHA}/statuses?per_page=100`]: [{ context: 'agent/review', state: 'success' }, { context: 'agent/review', state: 'pending' }],
    [`/repos/{repo}/commits/${SHA}/branches-where-head`]: [{ name: 'agent/issue-7' }],
    [`/repos/{repo}/commits/${SHA2}/statuses?per_page=100`]: [{ context: 'other', state: 'success' }],
    [`/repos/{repo}/commits/${SHA2}/branches-where-head`]: [{ name: 'agent/issue-7' }],
  });
  let r = await rehydrate({ type: 'ts-status', payload: { sha: SHA, context: 'agent/review' } }, gh);
  assert.equal(r.eventName, 'status');
  assert.equal(r.event.state, 'success', 'the newest status of the context');
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'r', mods: {} }).action, 'merge-check');
  r = await rehydrate({ type: 'ts-status', payload: { sha: SHA2, context: 'agent/review' } }, gh);
  assert.equal(dispatchDecision({ ...r, building: [], repo: 'r', mods: {} }).action, 'ignore');
});

test('R16: ts-main-push and ts-release-next keep a range only when the API puts it on that branch', async () => {
  const gh = fakeGh({
    [`/repos/{repo}/compare/${SHA2}...main`]: { status: 'identical' },
    [`/repos/{repo}/compare/${SHA}...${SHA2}`]: { status: 'ahead' },
    [`/repos/{repo}/compare/${SHA2}...release/next`]: { status: 'diverged' },
  });
  let r = await rehydrate({ type: 'ts-main-push', payload: { before: SHA, after: SHA2 } }, gh);
  assert.deepEqual(r, { eventName: 'push', event: { ref: 'refs/heads/main', before: SHA, after: SHA2 } });
  r = await rehydrate({ type: 'ts-release-next', payload: { before: SHA, after: SHA2 } }, gh);
  assert.equal(r.event.action, 'relay-unconfirmed', 'a sha not on release/next');
  assert.equal(r.event.after, undefined);
});

test('R16: an unknown dispatch type throws, so a new relay type is never judged silently', async () => {
  await assert.rejects(rehydrate({ type: 'ts-other', payload: {} }, fakeGh({})), /ts-other/);
});

test('R16, R18: cli main() rebuilds a dispatch from the product API before any command reads it', async () => {
  const { main, productRepo, eventOutputs } = await import('../agent/cli.mjs');
  const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  assert.equal(productRepo({ PRODUCT_REPO: 'Thitic9203/pluton-timesheet', GITHUB_REPOSITORY: 'Thitic9203/pluton-ai-agent' }), 'Thitic9203/pluton-timesheet');
  assert.equal(productRepo({ GITHUB_REPOSITORY: 'Thitic9203/pluton-timesheet' }), 'Thitic9203/pluton-timesheet');
  assert.deepEqual(eventOutputs('issues', {}), { name: 'issues', action: '', number: '', label: '', sender: '', sha: '', branch: '', run_id: '' });
  assert.deepEqual(eventOutputs('workflow_run', { action: 'completed', workflow_run: { id: 11, head_sha: SHA, head_branch: 'main' } }),
    { name: 'workflow_run', action: 'completed', number: '', label: '', sender: '', sha: SHA, branch: 'main', run_id: 11 });

  const dir = mkdtempSync(join(tmpdir(), 'relay-'));
  const eventPath = join(dir, 'event.json');
  const out = join(dir, 'out');
  writeFileSync(out, '');
  // The payload claims the owner labelled; the timeline says the App did, and the App wins.
  writeFileSync(eventPath, JSON.stringify({ action: 'ts-issues', client_payload: { action: 'labeled', number: 7, label: 'agent:blocked' }, sender: owner }));
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    const body = url.endsWith('/issues/7') ? issue7(['agent:blocked'])
      : url.includes('/issues/7/timeline') ? labeledTimeline('agent:blocked', app) : null;
    return { ok: body !== null, status: body ? 200 : 404, json: async () => body, headers: { get: () => null } };
  };
  const log = console.log;
  console.log = () => {};
  try {
    const code = await main(['event'], {
      GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'Thitic9203/pluton-ai-agent', PRODUCT_REPO: 'Thitic9203/pluton-timesheet',
      GITHUB_EVENT_NAME: 'repository_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: out,
    });
    assert.equal(code, 0);
  } finally {
    globalThis.fetch = realFetch;
    console.log = log;
  }
  assert.ok(urls.every((u) => u.startsWith('https://api.github.com/repos/Thitic9203/pluton-timesheet/')), urls.join(' '));
  const lines = readFileSync(out, 'utf8');
  assert.match(lines, /name=issues/);
  assert.match(lines, /action=labeled/);
  assert.match(lines, /label=agent:blocked/);
  assert.match(lines, /sender=taskfolio-dev-agent\[bot\]/);
});
