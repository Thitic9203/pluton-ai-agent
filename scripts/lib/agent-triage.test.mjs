/**
 * The PO/BA triage of the always-on dev agent (docs/sdd/agent-po-triage/spec.md R3, R6 to R10, E2).
 *
 * Run: node --test scripts/lib/agent-triage.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, JUDGE_LIMIT, MARK, triageCandidates, applyPlan } from '../agent/triage.mjs';

const APP = 'taskfolio-agent[bot]';
const app = { login: APP, type: 'Bot' };
const owner = { login: 'Thitic9203', type: 'User' };
const at = (h) => new Date(Date.UTC(2026, 9, 17, h)).toISOString();
const iss = (number, labels = [], extra = {}) => ({ number, title: `t${number}`, body: 'b', labels: labels.map((name) => ({ name })), author_association: 'OWNER', created_at: at(0), ...extra });
const c = (user, body, h = 1) => ({ user, body, created_at: at(h) });
const cand = (r) => triageCandidates(r.issues, { commentsOf: (n) => r.comments?.[n] ?? [], appLogin: APP });

test('CAP is three', () => assert.equal(CAP, 3));

test('R3: only collaborator issues without agent state, self-filed or a pull request are candidates', () => {
  const issues = [
    iss(1),
    iss(2, [], { author_association: 'MEMBER' }),
    iss(3, [], { author_association: 'COLLABORATOR' }),
    iss(4, [], { author_association: 'NONE' }),
    iss(5, [], { author_association: 'CONTRIBUTOR' }),
    iss(6, ['self-filed']),
    iss(7, ['agent:ready']),
    iss(8, ['agent:building']),
    iss(9, ['agent:needs-info']),
    iss(10, [], { pull_request: {} }),
  ];
  assert.deepEqual(cand({ issues }).map((x) => x.number), [1, 2, 3, 9]);
});

test('R3: at most JUDGE_LIMIT candidates, oldest first', () => {
  const issues = Array.from({ length: JUDGE_LIMIT + 4 }, (_, i) => iss(100 - i, [], { created_at: at(i) }));
  const got = cand({ issues });
  assert.equal(got.length, JUDGE_LIMIT);
  assert.equal(got[0].number, 100);
});

test('R9: an issue whose gap was sent waits until the owner comments after it', () => {
  const issues = [iss(9, ['agent:needs-info'])];
  const gap = c(app, `x ${MARK.gapDm}`, 5);
  assert.deepEqual(cand({ issues, comments: { 9: [gap] } }), []);
  assert.deepEqual(cand({ issues, comments: { 9: [gap, c({ login: 'mallory', type: 'User' }, 'hi', 6)] } }), []);
  assert.equal(cand({ issues, comments: { 9: [gap, c(owner, 'answer', 6)] } }).length, 1);
});

test('sweeps and DM markers count only from the App', () => {
  const issues = [iss(9, ['agent:needs-info'])];
  const comments = { 9: [c(app, MARK.needsInfo), c(app, MARK.needsInfo), c(owner, MARK.needsInfo), c({ login: APP, type: 'User' }, MARK.questionDm)] };
  const [x] = cand({ issues, comments });
  assert.equal(x.sweeps, 2);
  assert.equal(x.questionDmSent, false);
});

const ready = (number) => ({ number, verdict: 'ready', reason: 'confirmed bug', enrichment: 'AC from SPEC §3', ownerQuestion: '' });
const needs = (number, q = '') => ({ number, verdict: 'needs-info', reason: 'no AC', enrichment: 'BA: SPEC §2', ownerQuestion: q });
const kinds = (acts, n) => acts.filter((a) => a.number === n).map((a) => (a.type === 'dm' ? 'dm' : `${a.type}:${a.label ?? ''}`));

test('R6: ready comments first, labels agent:ready, removes needs-info, at most three', () => {
  const candidates = cand({ issues: [1, 2, 3, 4].map((n) => iss(n, n === 1 ? ['agent:needs-info'] : [])) });
  const acts = applyPlan({ candidates, verdicts: [1, 2, 3, 4].map(ready) });
  assert.deepEqual(kinds(acts, 1), ['comment:', 'remove-label:agent:needs-info', 'add-label:agent:ready']);
  assert.deepEqual(kinds(acts, 2), ['comment:', 'add-label:agent:ready']);
  assert.equal(acts.filter((a) => a.label === 'agent:ready').length, 3);
  assert.deepEqual(kinds(acts, 4), []);
  assert.match(acts[0].body, new RegExp(MARK.ready));
});

test('R7: needs-info comments with a sweep marker and labels once', () => {
  const candidates = cand({ issues: [iss(1), iss(2, ['agent:needs-info'])] });
  const acts = applyPlan({ candidates, verdicts: [needs(1), needs(2)] });
  assert.deepEqual(kinds(acts, 1), ['comment:', 'add-label:agent:needs-info']);
  assert.deepEqual(kinds(acts, 2), ['comment:']);
  assert.match(acts[0].body, new RegExp(MARK.needsInfo));
  assert.match(acts[0].body, /BA: SPEC §2/);
});

test('R8: an owner question is DMed once per issue, with its marker comment', () => {
  const candidates = cand({ issues: [iss(1)] });
  const acts = applyPlan({ candidates, verdicts: [needs(1, 'Which month?')] });
  assert.deepEqual(kinds(acts, 1), ['comment:', 'add-label:agent:needs-info', 'dm', 'comment:']);
  assert.match(acts.find((a) => a.type === 'dm').text, /Which month\?/);
  const again = cand({ issues: [iss(1, ['agent:needs-info'])], comments: { 1: [c(app, MARK.questionDm)] } });
  assert.deepEqual(kinds(applyPlan({ candidates: again, verdicts: [needs(1, 'Which month?')] }), 1), ['comment:']);
});

test('R9: the third sweep DMs the gap once', () => {
  const two = { 1: [c(app, MARK.needsInfo), c(app, MARK.needsInfo)] };
  const candidates = cand({ issues: [iss(1, ['agent:needs-info'])], comments: two });
  const acts = applyPlan({ candidates, verdicts: [needs(1)] });
  assert.deepEqual(kinds(acts, 1), ['comment:', 'dm', 'comment:']);
  assert.match(acts.at(-1).body, new RegExp(MARK.gapDm));
});

test('R10, E2: a verdict for a non-candidate or a malformed verdict does nothing', () => {
  const candidates = cand({ issues: [iss(1), iss(2, [], { author_association: 'NONE' })] });
  for (const v of [[ready(2)], [ready(99)], [{ number: 1, verdict: 'ship-it' }], [{ number: '1', verdict: 'ready' }], null, 'x']) {
    assert.deepEqual(applyPlan({ candidates, verdicts: v }), [], JSON.stringify(v));
  }
});

test('one verdict per issue: a duplicate is ignored', () => {
  const candidates = cand({ issues: [iss(1)] });
  assert.equal(applyPlan({ candidates, verdicts: [ready(1), ready(1)] }).filter((a) => a.label === 'agent:ready').length, 1);
});

test('E3, R10: triage-apply recomputes candidates, skips the DM marker without Slack, never labels a non-collaborator', async () => {
  const { runTriageApply } = await import('../agent/cli.mjs');
  const calls = [];
  const issues = [iss(1), iss(2, [], { author_association: 'NONE' })];
  const gh = {
    all: async (p) => (p.includes('/comments') ? [] : issues),
    get: async () => ({}),
    post: async (p, b) => { calls.push([p, b]); return {}; },
    del: async (p) => { calls.push([p]); return null; },
  };
  const env = { AGENT_APP_LOGIN: APP, TRIAGE_VERDICTS: JSON.stringify({ verdicts: [needs(1, 'Which month?'), ready(2)] }) };
  await runTriageApply(env, gh, {}, [], { log: () => {} });
  assert.deepEqual(calls.map(([p]) => p), ['/repos/{repo}/issues/1/comments', '/repos/{repo}/issues/1/labels']);
  assert.doesNotMatch(JSON.stringify(calls), /question-dm/);
});
