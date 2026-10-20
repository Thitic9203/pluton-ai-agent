/**
 * The dispatcher of the always-on dev agent (docs/superpowers/plans/always-on-dev-agent.md,
 * Decisions Q1 and Q2): only an issue the owner labelled agent:ready starts, an issue already in
 * an agent state is never started twice, at most three build at once, and the oldest queued issue
 * the owner made ready goes next.
 *
 * Run with `TZ=UTC node --test scripts/lib/agent-dispatch.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, decide, nextFromQueue } from '../agent/dispatch.mjs';

const owner = { login: 'Thitic9203', type: 'User' };
const stranger = { login: 'someone-else', type: 'User' };
const at = (day) => new Date(Date.UTC(2026, 9, day)).toISOString();
const issue = (number, labels, day = 1) => ({ number, labels, created_at: at(day) });
const building = (n) => Array.from({ length: n }, (_, i) => issue(100 + i, ['agent:ready', 'agent:building']));
const byOwner = () => owner;

test('LIMIT is three', () => {
  assert.equal(LIMIT, 3);
});

test('an issue without agent:ready is ignored', () => {
  assert.deepEqual(decide({ issue: issue(1, []), openIssues: [], readyLabeledBy: owner }), { action: 'ignore' });
});

test('agent:ready applied by anyone but the owner is ignored', () => {
  const ready = issue(1, ['agent:ready']);
  for (const sender of [
    { login: 'feedback-bot[bot]', type: 'Bot' },
    { login: 'thitic9203', type: 'User' },
    stranger,
    { login: 'Thitic9203', type: 'Bot' },
    undefined,
  ]) {
    assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: sender }), { action: 'ignore' });
  }
});

test('labels given as objects are read by name', () => {
  const ready = { number: 1, labels: [{ name: 'agent:ready' }], created_at: at(1) };
  assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: owner }), { action: 'start' });
});

test('an owner-ready issue starts under the limit', () => {
  const ready = issue(1, ['agent:ready']);
  assert.deepEqual(decide({ issue: ready, openIssues: building(2), readyLabeledBy: owner }), { action: 'start' });
});

test('the fourth issue queues when exactly three are building', () => {
  const ready = issue(1, ['agent:ready']);
  assert.deepEqual(decide({ issue: ready, openIssues: building(3), readyLabeledBy: owner }), { action: 'queue' });
  assert.deepEqual(decide({ issue: ready, openIssues: building(4), readyLabeledBy: owner }), { action: 'queue' });
});

test('an issue already in any agent state is ignored, never started twice', () => {
  for (const state of [
    'agent:queued', 'agent:planning', 'agent:test-planning', 'agent:building',
    'agent:in-review', 'agent:merging', 'agent:on-test-env', 'agent:blocked',
  ]) {
    const self = issue(1, ['agent:ready', state]);
    assert.deepEqual(decide({ issue: self, openIssues: [self], readyLabeledBy: owner }), { action: 'ignore' }, state);
  }
});

test('an issue listed twice is counted once', () => {
  const ready = issue(1, ['agent:ready']);
  const two = building(2);
  const open = [...two, two[0], two[1]];
  assert.deepEqual(decide({ issue: ready, openIssues: open, readyLabeledBy: owner }), { action: 'start' });
});

test('nextFromQueue is null when nothing is queued', () => {
  assert.equal(nextFromQueue([], { readyLabeledByOf: byOwner }), null);
  assert.equal(nextFromQueue(building(2), { readyLabeledByOf: byOwner }), null);
  assert.equal(nextFromQueue(undefined, { readyLabeledByOf: byOwner }), null);
});

test('nextFromQueue takes the oldest queued issue the owner made ready', () => {
  const open = [
    issue(7, ['agent:ready', 'agent:queued'], 9),
    issue(5, ['agent:ready', 'agent:queued'], 3),
    issue(6, ['agent:ready', 'agent:building'], 1),
    issue(8, ['agent:ready', 'agent:queued'], 5),
  ];
  assert.equal(nextFromQueue(open, { readyLabeledByOf: byOwner }).number, 5);
});

test('nextFromQueue skips a queued issue without agent:ready', () => {
  const open = [issue(5, ['agent:queued'], 3), issue(8, ['agent:ready', 'agent:queued'], 5)];
  assert.equal(nextFromQueue(open, { readyLabeledByOf: byOwner }).number, 8);
  assert.equal(nextFromQueue([open[0]], { readyLabeledByOf: byOwner }), null);
});

test('nextFromQueue skips a queued issue whose agent:ready was not applied by the owner', () => {
  const open = [issue(5, ['agent:ready', 'agent:queued'], 3), issue(8, ['agent:ready', 'agent:queued'], 5)];
  const of = (n) => (n === 5 ? stranger : owner);
  assert.equal(nextFromQueue(open, { readyLabeledByOf: of }).number, 8);
  assert.equal(nextFromQueue(open, { readyLabeledByOf: () => stranger }), null);
  assert.equal(nextFromQueue(open, {}), null);
  assert.equal(nextFromQueue(open), null);
});

test('nextFromQueue skips a queued issue that is also building, blocked or in any other agent state', () => {
  for (const state of [
    'agent:building', 'agent:blocked', 'agent:planning', 'agent:test-planning',
    'agent:in-review', 'agent:merging', 'agent:on-test-env',
  ]) {
    const stuck = issue(5, ['agent:ready', 'agent:queued', state], 3);
    const fine = issue(8, ['agent:ready', 'agent:queued'], 5);
    assert.equal(nextFromQueue([stuck, fine], { readyLabeledByOf: byOwner }).number, 8, state);
    assert.equal(nextFromQueue([stuck], { readyLabeledByOf: byOwner }), null, state);
  }
});

test('copies of one issue that disagree have their labels merged before counting', () => {
  const ready = issue(1, ['agent:ready']);
  const stale = (n) => issue(n, ['agent:ready']);
  const fresh = (n) => issue(n, ['agent:ready', 'agent:building']);
  // Stale copies first: the building label on the later copy still counts.
  const open = [stale(100), stale(101), stale(102), fresh(100), fresh(101), fresh(102)];
  assert.deepEqual(decide({ issue: ready, openIssues: open, readyLabeledBy: owner }), { action: 'queue' });
  const queued = issue(5, ['agent:ready', 'agent:queued'], 3);
  assert.equal(nextFromQueue([...open, queued], { readyLabeledByOf: byOwner }), null);
  // A stale queued copy that a later copy shows as building is skipped too.
  const dupQueued = [issue(5, ['agent:ready', 'agent:queued'], 3), issue(5, ['agent:building'], 3)];
  assert.equal(nextFromQueue(dupQueued, { readyLabeledByOf: byOwner }), null);
});

test('nextFromQueue is null while LIMIT issues are building', () => {
  const queued = issue(5, ['agent:ready', 'agent:queued'], 3);
  assert.equal(nextFromQueue([...building(3), queued], { readyLabeledByOf: byOwner }), null);
  assert.equal(nextFromQueue([...building(2), queued], { readyLabeledByOf: byOwner }).number, 5);
  const dup = building(2);
  assert.equal(nextFromQueue([...dup, dup[0], queued], { readyLabeledByOf: byOwner }).number, 5);
});

// docs/sdd/agent-po-triage R1, R2: the App's agent:ready counts, only on a collaborator's issue.
const APP = 'taskfolio-agent[bot]';
const appBot = { login: APP, type: 'Bot' };
const authored = (n, labels, association) => ({ ...issue(n, labels), author_association: association });

// R12: the App's label counts only with the triage job's marker comment of the same run, and never
// on an issue whose timeline already shows a later agent state (review of the triage change).
const MARKER = '<!-- agent-triage ready -->';
const ts = (m) => new Date(Date.UTC(2026, 9, 17, 3, m)).toISOString();
const labeled = (name, m, actor = appBot) => ({ event: 'labeled', label: { name }, actor, created_at: ts(m) });
const marker = (m, user = appBot, body = `${MARKER}\nready`) => ({ user, body, created_at: ts(m) });
const proven = { timeline: [labeled('agent:ready', 10)], comments: [marker(9)] };

test('agent:ready applied by the App starts a collaborator issue when the triage marker proves it', () => {
  for (const a of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.deepEqual(decide({ issue: authored(1, ['agent:ready'], a), openIssues: [], readyLabeledBy: appBot, appLogin: APP, appEvidence: proven }), { action: 'start' }, a);
  }
});

test('the App label without the triage marker is ignored', () => {
  const ready = authored(1, ['agent:ready'], 'OWNER');
  for (const ev of [
    undefined,
    { timeline: [labeled('agent:ready', 10)], comments: [] },
    { timeline: [labeled('agent:ready', 10)], comments: [marker(9, { login: APP, type: 'User' })] },
    { timeline: [labeled('agent:ready', 10)], comments: [marker(9, owner)] },
    { timeline: [labeled('agent:ready', 10)], comments: [marker(9, appBot, 'ready, no marker')] },
    { timeline: [labeled('agent:ready', 10)], comments: [marker(11)] },
    { timeline: [labeled('agent:ready', 40)], comments: [marker(9)] },
  ]) assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: appBot, appLogin: APP, appEvidence: ev }), { action: 'ignore' }, JSON.stringify(ev));
});

test('the App label after agent:building, or any later agent state, is ignored', () => {
  const ready = authored(1, ['agent:ready'], 'OWNER');
  for (const state of ['agent:building', 'agent:blocked', 'agent:done']) {
    const ev = { timeline: [labeled(state, 1, owner), labeled('agent:ready', 10)], comments: [marker(9)] };
    assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: appBot, appLogin: APP, appEvidence: ev }), { action: 'ignore' }, state);
  }
});

test('agent:ready applied by the App is ignored on a non-collaborator issue (R2)', () => {
  for (const a of ['CONTRIBUTOR', 'NONE', 'FIRST_TIME_CONTRIBUTOR', undefined]) {
    assert.deepEqual(decide({ issue: authored(1, ['agent:ready'], a), openIssues: [], readyLabeledBy: appBot, appLogin: APP, appEvidence: proven }), { action: 'ignore' }, String(a));
  }
});

test('the App bot does not count without appLogin, and another bot never counts (E1)', () => {
  const ready = authored(1, ['agent:ready'], 'OWNER');
  assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: appBot, appEvidence: proven }), { action: 'ignore' });
  assert.deepEqual(decide({ issue: ready, openIssues: [], readyLabeledBy: { login: 'x[bot]', type: 'Bot' }, appLogin: APP, appEvidence: proven }), { action: 'ignore' });
});

test('the owner label is unchanged: no marker needed, even after agent:building in the timeline', () => {
  const ev = { timeline: [labeled('agent:building', 1, owner)], comments: [] };
  assert.deepEqual(decide({ issue: authored(1, ['agent:ready'], 'NONE'), openIssues: [], readyLabeledBy: owner, appLogin: APP }), { action: 'start' });
  assert.deepEqual(decide({ issue: authored(1, ['agent:ready'], 'NONE'), openIssues: [], readyLabeledBy: owner, appLogin: APP, appEvidence: ev }), { action: 'start' });
});

test('nextFromQueue takes an App-readied collaborator issue with its marker, skips one without or a non-collaborator', () => {
  const queued = { timeline: [labeled('agent:ready', 10), labeled('agent:queued', 11, appBot)], comments: [marker(9)] };
  const open = [authored(5, ['agent:ready', 'agent:queued'], 'NONE'), authored(8, ['agent:ready', 'agent:queued'], 'MEMBER'), authored(9, ['agent:ready', 'agent:queued'], 'MEMBER')];
  const of = (n) => (n === 9 ? { timeline: queued.timeline, comments: [] } : queued);
  assert.equal(nextFromQueue(open, { readyLabeledByOf: () => appBot, appLogin: APP, appEvidenceOf: of }).number, 8);
  assert.equal(nextFromQueue([open[0], open[2]], { readyLabeledByOf: () => appBot, appLogin: APP, appEvidenceOf: of }), null);
  assert.equal(nextFromQueue([open[1]], { readyLabeledByOf: () => appBot, appLogin: APP }), null);
});
