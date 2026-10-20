/**
 * The owner's gates for the always-on dev agent (docs/superpowers/plans/always-on-dev-agent.md,
 * "Gates" and Decisions Q2, Q4): only the owner's unedited comments count, read from the issue's
 * history; only the agent's own plan comment, whose body matches its hash, anchors the gates; a
 * newer plan voids every approval; /revise rejects the gate that is waiting and nothing else.
 *
 * Run with `TZ=UTC node --test scripts/lib/agent-gates.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OWNER, isOwnerAct, isReadyLabeler, parseCommand, planHashOf, gateState } from '../agent/gates.mjs';

const BOT_LOGIN = 'taskfolio-agent[bot]';
const owner = { login: 'Thitic9203', type: 'User' };
const bot = { login: BOT_LOGIN, type: 'Bot' };
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const PLAN = 'Plan v1\n\n1. Do the thing.';
const HASH = sha(PLAN);

let nextId = 1;
const at = (sec) => new Date(Date.UTC(2026, 9, 14, 0, 0, sec)).toISOString();
/** One comment at second `sec`, never edited unless `edited` gives the edit second. */
function c(user, body, sec, edited) {
  return { id: nextId++, user, body, created_at: at(sec), updated_at: at(edited ?? sec) };
}
/** A plan comment: `text` plus its marker, by the agent unless `user` says otherwise. */
function plan(sec, { text = PLAN, hash = sha(text), edited, user = bot } = {}) {
  return c(user, `${text}\n<!-- agent-plan sha256:${hash} -->`, sec, edited);
}
const state = (comments, opts = {}) => gateState(comments, { planHash: HASH, botLogin: BOT_LOGIN, ...opts });

test('OWNER is the one account that approves', () => {
  assert.equal(OWNER, 'Thitic9203');
});

test('isOwnerAct needs the exact login and a User account', () => {
  assert.equal(isOwnerAct(owner), true);
  assert.equal(isOwnerAct({ login: 'Thitic9203', type: 'Bot' }), false);
  assert.equal(isOwnerAct({ login: 'thitic9203', type: 'User' }), false);
  assert.equal(isOwnerAct({ login: 'someone-else', type: 'User' }), false);
  assert.equal(isOwnerAct(null), false);
  assert.equal(isOwnerAct(undefined), false);
});

test('parseCommand reads the first non-empty line only', () => {
  assert.deepEqual(parseCommand('/approve-plan'), { command: '/approve-plan', arg: '' });
  assert.deepEqual(parseCommand('\n  \n/approve-tests  \nthanks'), { command: '/approve-tests', arg: '' });
  assert.deepEqual(parseCommand('/approve-result'), { command: '/approve-result', arg: '' });
  assert.equal(parseCommand('looks good\n/approve-plan'), null);
  assert.equal(parseCommand('/approve-plan please'), null);
  assert.equal(parseCommand('/approve-planx'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand(null), null);
});

/* /approve-mock is still parsed, so Agent Office (agent-office/lib/economy.mjs) can read old comments,
   but it gates nothing since 17 Oct 2026 (docs/sdd/remove-mock-first R10). */
test('parseCommand needs a url for /approve-mock and a reason for /revise', () => {
  assert.deepEqual(
    parseCommand('/approve-mock https://claude.ai/code/artifact/a8e25181'),
    { command: '/approve-mock', arg: 'https://claude.ai/code/artifact/a8e25181' },
  );
  assert.equal(parseCommand('/approve-mock'), null);
  assert.equal(parseCommand('/approve-mock   '), null);
  assert.equal(parseCommand('/approve-mock not-a-url'), null);
  assert.deepEqual(parseCommand('/revise split the table'), { command: '/revise', arg: 'split the table' });
  assert.equal(parseCommand('/revise'), null);
  assert.equal(parseCommand('/revise    '), null);
});

test('planHashOf hashes the body with marker lines removed, LF endings, trimmed', () => {
  const marker = `<!-- agent-plan sha256:${'0'.repeat(64)} -->`;
  assert.equal(planHashOf(`${PLAN}\n${marker}`), HASH);
  assert.equal(planHashOf(`${marker}\n${PLAN}\n`), HASH);
  assert.equal(planHashOf(`${PLAN.replace(/\n/g, '\r\n')}\r\n${marker}`), HASH);
  assert.equal(planHashOf(`  ${PLAN}  \n\n${marker}\n`), HASH);
  assert.notEqual(planHashOf(`${PLAN}!\n${marker}`), HASH);
  assert.equal(planHashOf(null), sha(''));
});

test('the owner approves the plan after the agent plan comment', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2)]);
  assert.equal(s.plan, true);
  assert.equal(s.next, 'tests');
});

test('nothing is approved before any plan comment exists', () => {
  const s = state([c(owner, '/approve-plan', 2)]);
  assert.equal(s.plan, false);
  assert.equal(s.next, 'plan');
});

test('without botLogin no plan comment counts, so nothing is approved', () => {
  const s = gateState([plan(1), c(owner, '/approve-plan', 2)], { planHash: HASH });
  assert.equal(s.plan, false);
});

test('a bot posting approve text never counts', () => {
  const s = state([plan(1), c(bot, '/approve-plan', 2)]);
  assert.equal(s.plan, false);
});

test('a wrong-case owner login and another user never count', () => {
  const s = state([
    plan(1),
    c({ login: 'thitic9203', type: 'User' }, '/approve-plan', 2),
    c({ login: 'someone-else', type: 'User' }, '/approve-plan', 3),
    c({ login: 'Thitic9203', type: 'Bot' }, '/approve-plan', 4),
  ]);
  assert.equal(s.plan, false);
});

test('an edited approval comment is ignored', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2, 3)]);
  assert.equal(s.plan, false);
});

test('an approval with an edit marker never counts, whatever its timestamps say', () => {
  const edited = (field, value) => ({ ...c(owner, '/approve-plan', 2), [field]: value });
  assert.equal(state([plan(1), edited('last_edited_at', at(3))]).plan, false);
  assert.equal(state([plan(1), edited('lastEditedAt', at(3))]).plan, false);
  // An explicit null is not an edit.
  assert.equal(state([plan(1), edited('last_edited_at', null)]).plan, true);
  assert.equal(state([plan(1), edited('lastEditedAt', null)]).plan, true);
});

test('an edit marker on a /revise means it is not a revision', () => {
  const s = state([plan(1), { ...c(owner, '/revise split it', 2), lastEditedAt: at(3) }]);
  assert.deepEqual(s.revisions, []);
});

test('a forged plan marker from a user is ignored entirely', () => {
  const forger = { login: 'someone-else', type: 'User' };
  assert.equal(state([plan(1, { user: forger }), c(owner, '/approve-plan', 2)]).plan, false);
  // A forged plan posted after a real approval does not void it either: it is not a plan.
  assert.equal(state([plan(1), c(owner, '/approve-plan', 2), plan(3, { user: forger, text: 'evil' })]).plan, true);
});

test('a plan marker from another bot is ignored entirely', () => {
  const other = { login: 'feedback-bot[bot]', type: 'Bot' };
  assert.equal(state([plan(1, { user: other }), c(owner, '/approve-plan', 2)]).plan, false);
  assert.equal(state([plan(1, { user: { login: BOT_LOGIN, type: 'User' } }), c(owner, '/approve-plan', 2)]).plan, false);
});

test('an agent plan whose body does not match its marker anchors nothing', () => {
  const s = state([plan(1, { hash: HASH, text: 'Plan v1, changed' }), c(owner, '/approve-plan', 2)]);
  assert.equal(s.plan, false);
  // And it voids an earlier approval, failing closed.
  const after = state([plan(1), c(owner, '/approve-plan', 2), plan(3, { hash: HASH, text: 'tampered' })]);
  assert.equal(after.plan, false);
});

test('the plan must be the one the agent is working to', () => {
  const s = state([plan(1, { text: 'Plan v2' }), c(owner, '/approve-plan', 2)]);
  assert.equal(s.plan, false);
});

test('an approval before the newest plan comment is void', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2), plan(3)]);
  assert.equal(s.plan, false);
  assert.equal(s.next, 'plan');
});

test('a plan comment edited after the approval voids it', () => {
  const s = state([plan(1, { edited: 5 }), c(owner, '/approve-plan', 2)]);
  assert.equal(s.plan, false);
});

test('a plan edited with only an edit marker set voids the earlier approval (G9)', () => {
  // Plan A posted at 10:00, approved at 10:05, its body changed to plan B at 10:06 with only the
  // edit marker moving; the agent now works to plan B.
  const B = 'Plan B\n\n1. Something else.';
  const tenAm = (min) => new Date(Date.UTC(2026, 9, 14, 10, min)).toISOString();
  for (const field of ['last_edited_at', 'lastEditedAt']) {
    const edited = {
      id: nextId++,
      user: bot,
      body: `${B}\n<!-- agent-plan sha256:${sha(B)} -->`,
      created_at: tenAm(0),
      updated_at: tenAm(0),
      [field]: tenAm(6),
    };
    const approval = { id: nextId++, user: owner, body: '/approve-plan', created_at: tenAm(5), updated_at: tenAm(5) };
    const s = gateState([edited, approval], { planHash: sha(B), botLogin: BOT_LOGIN });
    assert.equal(s.plan, false, field);
    assert.equal(s.next, 'plan', field);
    // An approval after the edit counts.
    const later = { id: nextId++, user: owner, body: '/approve-plan', created_at: tenAm(7), updated_at: tenAm(7) };
    assert.equal(gateState([edited, approval, later], { planHash: sha(B), botLogin: BOT_LOGIN }).plan, true, field);
  }
});

test('an approval in the same second as the plan comment does not count, in either order', () => {
  assert.equal(state([plan(1), c(owner, '/approve-plan', 1)]).plan, false);
  assert.equal(state([c(owner, '/approve-plan', 1), plan(1)]).plan, false);
});

test('an approval in the same second as the plan edit does not count, in either order', () => {
  assert.equal(state([plan(1, { edited: 4 }), c(owner, '/approve-plan', 4)]).plan, false);
  assert.equal(state([c(owner, '/approve-plan', 4), plan(1, { edited: 4 })]).plan, false);
});

test('/revise rejects the waiting gate and keeps an earlier approval', () => {
  const s = state([
    plan(1),
    c(owner, '/approve-plan', 2),
    c(owner, '/revise more edge cases', 3),
  ]);
  assert.equal(s.plan, true);
  assert.equal(s.tests, false);
  assert.equal(s.next, 'tests');
  assert.equal(s.revisions.length, 1);
  assert.deepEqual(
    { gate: s.revisions[0].gate, reason: s.revisions[0].reason },
    { gate: 'tests', reason: 'more edge cases' },
  );
  assert.equal(typeof s.revisions[0].id, 'number');
});

test('/revise on the plan is reported against the plan gate', () => {
  const s = state([plan(1), c(owner, '/revise split it', 2)]);
  assert.equal(s.plan, false);
  assert.deepEqual(s.revisions.map((r) => [r.gate, r.reason]), [['plan', 'split it']]);
});

test('/revise without a reason, or from someone else, is not a revision', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2), c(owner, '/revise', 3), c(bot, '/revise no', 4)]);
  assert.equal(s.plan, true);
  assert.deepEqual(s.revisions, []);
});

test('a new plan comment clears earlier revisions with the approvals', () => {
  const s = state([plan(1), c(owner, '/revise split it', 2), plan(3), c(owner, '/approve-plan', 4)]);
  assert.equal(s.plan, true);
  assert.deepEqual(s.revisions, []);
});

test('the gates go in order: plan, tests, result', () => {
  const s = state([
    plan(1),
    c(owner, '/approve-plan', 2),
    c(owner, '/approve-tests', 3),
    c(owner, '/approve-result', 4),
  ]);
  /* The mock field left the state on 17 Oct 2026 (docs/sdd/remove-mock-first R10). */
  assert.deepEqual(
    { plan: s.plan, tests: s.tests, result: s.result, next: s.next },
    { plan: true, tests: true, result: true, next: null },
  );
});

test('an approval for a later gate does not count before the earlier gate', () => {
  const s = state([plan(1), c(owner, '/approve-tests', 2), c(owner, '/approve-plan', 3)]);
  assert.equal(s.plan, true);
  assert.equal(s.tests, false);
  assert.equal(s.next, 'tests');
});

/* Until 17 Oct 2026 a UI issue waited for /approve-mock between the plan and the tests; the owner
   removed that gate (docs/sdd/remove-mock-first R10), so the expected values of these cases changed. */
test('a UI issue goes from the plan straight to the tests gate', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2), c(owner, '/approve-tests', 3)], { ui: true });
  assert.equal(s.tests, true);
  assert.equal(s.next, 'result');
  assert.equal('mock' in s, false, 'the gate state names no mock gate');
  assert.equal('mockUrl' in s, false);
});

test('/approve-mock gates nothing, on any issue', () => {
  for (const ui of [false, true]) {
    const s = state([
      plan(1),
      c(owner, '/approve-plan', 2),
      c(owner, '/approve-mock https://claude.ai/code/artifact/a8e25181', 3),
    ], { ui });
    assert.equal(s.next, 'tests', `ui ${ui}`);
    assert.equal(s.tests, false);
  }
});

test('a new plan comment voids every later gate too', () => {
  const s = state([plan(1), c(owner, '/approve-plan', 2), c(owner, '/approve-tests', 3), plan(4)]);
  assert.equal(s.plan, false);
  assert.equal(s.tests, false);
});

test('history is read in time order whatever order the array is in', () => {
  const s = state([c(owner, '/approve-plan', 2), plan(1)]);
  assert.equal(s.plan, true);
});

// docs/sdd/agent-po-triage R1, E1: the owner or the agent's own App may apply agent:ready.
test('isReadyLabeler accepts the owner and the App bot, nobody else', () => {
  const app = 'taskfolio-agent[bot]';
  assert.equal(isReadyLabeler({ login: OWNER, type: 'User' }, app), true);
  assert.equal(isReadyLabeler({ login: app, type: 'Bot' }, app), true);
  for (const s of [
    { login: app, type: 'User' },
    { login: 'other-app[bot]', type: 'Bot' },
    { login: 'TASKFOLIO-AGENT[bot]', type: 'Bot' },
    { login: OWNER, type: 'Bot' },
    undefined,
    null,
  ]) assert.equal(isReadyLabeler(s, app), false, JSON.stringify(s));
});

test('isReadyLabeler fails closed when the App login is unknown (E1)', () => {
  for (const app of [undefined, '', '[bot]']) {
    assert.equal(isReadyLabeler({ login: '[bot]', type: 'Bot' }, app), false);
    assert.equal(isReadyLabeler({ login: OWNER, type: 'User' }, app), true);
  }
});
