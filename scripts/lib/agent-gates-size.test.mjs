/**
 * Gate 1 waits for the PO's size (docs/sdd/agent-office-live/spec.md R60; tasks.md T29): with
 * `requireSize`, /approve-plan counts only when the agent's App posted a well-formed size marker
 * `<!-- agent-office:size {...} -->` for the current plan, unedited, before the approval. The size
 * that counted is returned, since R53 and R54 use the size as it stood at Gate 1. The context
 * summary the agent reads (cli.mjs gateSummary) always asks with requireSize.
 *
 * Run with `TZ=UTC node --test scripts/lib/agent-gates-size.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { gateState, parseSizeMarker, planHashOf } from '../agent/gates.mjs';
import { gateSummary } from '../agent/cli.mjs';

const BOT_LOGIN = 'taskfolio-agent[bot]';
const owner = { login: 'Thitic9203', type: 'User' };
const bot = { login: BOT_LOGIN, type: 'Bot' };
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const PLAN = 'Plan v1\n\n1. Do the thing.';
const HASH = sha(PLAN);

let nextId = 1;
const at = (sec) => new Date(Date.UTC(2026, 9, 16, 0, 0, sec)).toISOString();
const c = (user, body, sec, edited) => ({ id: nextId++, user, body, created_at: at(sec), updated_at: at(edited ?? sec) });
const plan = (sec, text = PLAN) => c(bot, `${text}\n<!-- agent-plan sha256:${sha(text)} -->`, sec);
const SIZE = { v: 1, size: 'M', rules: 6, files: 4, risk: ['ui'], score: 15 };
const sizeLine = (s = SIZE) => `<!-- agent-office:size ${JSON.stringify(s)} -->`;
const sized = (comments, opts = {}) => gateState(comments, { planHash: HASH, botLogin: BOT_LOGIN, requireSize: true, ...opts });

test('R60: parseSizeMarker reads a well-formed marker and nothing else', () => {
  assert.deepEqual(parseSizeMarker(`text\n${sizeLine()}\nmore`), SIZE);
  assert.deepEqual(parseSizeMarker(sizeLine({ ...SIZE, size: 'XL', risk: [] })), { ...SIZE, size: 'XL', risk: [] });
  for (const bad of [
    '', 'no marker', '<!-- agent-office:size {not json} -->',
    sizeLine({ ...SIZE, size: 'XXL' }), sizeLine({ ...SIZE, v: 2 }), sizeLine({ ...SIZE, rules: -1 }),
    sizeLine({ ...SIZE, files: 1.5 }), sizeLine({ ...SIZE, risk: ['ui', 'ui'] }), sizeLine({ ...SIZE, risk: ['cosmic'] }),
    sizeLine({ ...SIZE, risk: 'ui' }), `${sizeLine()}\n${sizeLine({ ...SIZE, size: 'L' })}`,
  ]) assert.equal(parseSizeMarker(bad), null, bad);
});

test('R60: without a size marker, /approve-plan does not count', () => {
  const s = sized([plan(1), c(owner, '/approve-plan', 3)]);
  assert.equal(s.plan, false);
  assert.equal(s.next, 'plan');
  assert.equal(s.size, null);
});

test('R60: an App size marker for the current plan before the approval lets it count, and is returned', () => {
  const s = sized([plan(1), c(bot, `Sized.\n${sizeLine()}`, 2), c(owner, '/approve-plan', 3)]);
  assert.equal(s.plan, true);
  assert.equal(s.next, 'tests');
  assert.deepEqual(s.size, SIZE);
});

test('R60: the size line may sit in the plan comment itself', () => {
  const text = `${PLAN}\n\n${sizeLine()}`;
  const s = sized([plan(1, text), c(owner, '/approve-plan', 3)], { planHash: sha(text) });
  assert.equal(planHashOf(`${text}\n<!-- agent-plan sha256:${sha(text)} -->`), sha(text));
  assert.equal(s.plan, true);
  assert.deepEqual(s.size, SIZE);
});

test('R59, R60: a size marker by anyone but the App, edited, malformed, after the approval or for an older plan does not count', () => {
  const someone = { login: 'someone', type: 'User' };
  const forged = { login: BOT_LOGIN, type: 'User' };
  for (const [why, history] of [
    ['owner wrote it', [plan(1), c(owner, sizeLine(), 2), c(owner, '/approve-plan', 3)]],
    ['another account', [plan(1), c(someone, sizeLine(), 2), c(owner, '/approve-plan', 3)]],
    ['a User named like the App', [plan(1), c(forged, sizeLine(), 2), c(owner, '/approve-plan', 3)]],
    ['edited', [plan(1), c(bot, sizeLine(), 2, 4), c(owner, '/approve-plan', 5)]],
    ['malformed', [plan(1), c(bot, sizeLine({ ...SIZE, size: 'XXL' }), 2), c(owner, '/approve-plan', 3)]],
    ['after the approval', [plan(1), c(owner, '/approve-plan', 3), c(bot, sizeLine(), 4)]],
    ['same second as the approval', [plan(1), c(bot, sizeLine(), 3), c(owner, '/approve-plan', 3)]],
    ['for the plan before', [c(bot, sizeLine(), 1), plan(2), c(owner, '/approve-plan', 3)]],
  ]) {
    const s = sized(history);
    assert.equal(s.plan, false, why);
  }
});

test('R60: the size that counted is the one standing at Gate 1; a later one is not returned', () => {
  const later = { ...SIZE, size: 'XL', score: 40 };
  const s = sized([plan(1), c(bot, sizeLine(), 2), c(owner, '/approve-plan', 3), c(bot, sizeLine(later), 4)]);
  assert.equal(s.plan, true);
  assert.deepEqual(s.size, SIZE);
});

test('R60: without requireSize the gates behave as before and return no size field', () => {
  const s = gateState([plan(1), c(owner, '/approve-plan', 3)], { planHash: HASH, botLogin: BOT_LOGIN });
  assert.equal(s.plan, true);
  assert.equal('size' in s, false);
});

test('R60: the agent prompt and Plan A "Gates" ask the PO for the size marker and one size label before Gate 1', () => {
  const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');
  const prompt = read('.github/workflows/agent.yml');
  assert.ok(prompt.includes('Size the issue before Gate 1 (docs/sdd/agent-office-live/spec.md R60'));
  assert.ok(prompt.includes('<!-- agent-office:size {"v":1,"size":"M","rules":6,"files":4,"risk":["ui"],"score":15} -->'));
  assert.ok(prompt.includes('size:S, size:M, size:L, size:XL'));
  const doc = read('docs/superpowers/plans/always-on-dev-agent.md');
  assert.ok(doc.includes('**PO ประเมินขนาดก่อน Gate 1**'));
  assert.ok(doc.includes('`requireSize`'));
  // The marker the prompt shows parses as a valid size, so the example cannot drift from the gate.
  assert.deepEqual(parseSizeMarker(prompt.match(/<!-- agent-office:size [^\n]*-->/)[0]), SIZE);
});

test('R60: the context summary the agent reads always asks with requireSize', () => {
  const calls = [];
  const fake = (comments, opts) => { calls.push(opts); return {}; };
  gateSummary({ comments: [plan(1)], botLogin: BOT_LOGIN, planHashOf, gateState: fake });
  assert.deepEqual(calls.map((o) => o.requireSize), [true]);
});
