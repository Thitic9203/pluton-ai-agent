// T30. AI cost, cache saving, income and bonuses. Spec: docs/sdd/agent-office-live/spec.md R51 to R54, R59.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  usageMarkers, aiCost, cacheSaved, gateOnce, ciFirstGreen, reviewOnce, tokenLean, noBlock,
  earnedBonuses, incomeFor, closedByRelease,
} from './economy.mjs';
import { CONFIG_URL, validateConfig } from './config.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));
const BOT = 'taskfolio-agent[bot]';
const bot = { login: BOT, type: 'Bot' };
const owner = { login: 'Thitic9203', type: 'User' };
const marker = (o) => `<!-- agent-office:usage ${JSON.stringify({ v: 1, issue: 501, run_id: 1, run_attempt: 1, job: 'agent', step: 'work', sha: 'abc', at: '2026-10-16T01:00:00Z', model: 'claude-opus-5-5', ...o })} -->`;
const c = (user, body, at = '2026-10-16T01:00:00Z', o = {}) => ({ id: Math.random(), user, body, created_at: at, updated_at: at, ...o });

// ---------- R51, R59 ----------

test('R51: three runs at different fxRate give the THB total = Σ costUsd × own rate', () => {
  const { markers } = usageMarkers([
    c(bot, marker({ run_id: 1, input: 1000, cacheRead: 5000, cacheWrite: 200, output: 300, costUsd: 1.5, fxRate: 33 })),
    c(bot, marker({ run_id: 2, input: 2000, cacheRead: 0, cacheWrite: 0, output: 100, costUsd: 2, fxRate: 34 })),
    c(bot, marker({ run_id: 3, input: 10, cacheRead: 10, cacheWrite: 10, output: 10, costUsd: 0.25, fxRate: 32.5 })),
  ], BOT);
  const r = aiCost(markers);
  assert.equal(r.runs, 3);
  assert.equal(r.thb.toFixed(2), (1.5 * 33 + 2 * 34 + 0.25 * 32.5).toFixed(2));
  assert.equal(r.usd, 3.75);
  assert.deepEqual(r.tokens, { input: 3010, cacheRead: 5010, cacheWrite: 210, output: 410 });
  assert.equal(r.tokIn, 3010 + 210);
  assert.equal(r.runsWithoutCost, 0);
});

test('R51: a run missing costUsd or fxRate counts tokens but no cost, and is counted', () => {
  const { markers } = usageMarkers([
    c(bot, marker({ input: 100, cacheRead: 0, cacheWrite: 0, output: 10, costUsd: 1, fxRate: 33 })),
    c(bot, marker({ run_id: 2, input: 50, cacheRead: 0, cacheWrite: 0, output: 5, missing: ['fx'] })),
  ], BOT);
  const r = aiCost(markers);
  assert.equal(r.thb, 33);
  assert.equal(r.tokens.input, 150);
  assert.equal(r.runsWithoutCost, 1);
});

test('R51 R59: a marker by any other author is ignored and warned', () => {
  const r = usageMarkers([
    c({ login: 'someone', type: 'User' }, marker({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 99, fxRate: 33 })),
    c({ login: BOT, type: 'User' }, marker({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 99, fxRate: 33 })),
    c(bot, 'no marker here'),
  ], BOT);
  assert.equal(r.markers.length, 0);
  assert.equal(r.warnings.length, 2);
});

test('R51: a repeated run (same run_id, attempt and step) counts once', () => {
  const body = marker({ run_id: 7, input: 1, cacheRead: 0, cacheWrite: 0, output: 1, costUsd: 1, fxRate: 30 });
  const r = usageMarkers([c(bot, body), c(bot, body)], BOT);
  assert.equal(r.markers.length, 1);
  assert.equal(r.warnings.length, 1);
});

// ---------- R52 ----------

test('R52: saved by cache matches the formula to the satang', () => {
  const ms = [{ cacheRead: 14_600_000, fxRate: 33.576409 }, { cacheRead: 1_234_567, fxRate: 34.1 }, { cacheRead: 999, fxRate: null }];
  const want = 14_600_000 * (4 - 0.2) / 1e6 * 33.576409 + 1_234_567 * (4 - 0.2) / 1e6 * 34.1;
  const r = cacheSaved(ms, cfg.prices);
  assert.equal(r.thb.toFixed(2), want.toFixed(2));
  assert.equal(r.runsWithoutRate, 1);
});

// ---------- R54 bonuses, each pass and fail ----------

const at = (h) => `2026-10-16T${String(h).padStart(2, '0')}:00:00Z`;

test('R54 plan รอบเดียว: approved with no /revise before passes; with one fails', () => {
  assert.deepEqual(gateOnce([c(owner, '/approve-plan', at(2))], '/approve-plan', null), { approved: true, once: true, at: at(2) });
  const r = gateOnce([c(owner, '/revise tighten scope', at(1)), c(owner, '/approve-plan', at(2))], '/approve-plan', null);
  assert.equal(r.approved, true);
  assert.equal(r.once, false);
});

test('R54 R59: an edited, non-owner or bot approval does not count', () => {
  assert.equal(gateOnce([c(owner, '/approve-plan', at(2), { updated_at: at(3) })], '/approve-plan', null).approved, false);
  assert.equal(gateOnce([c({ login: 'Thitic9203', type: 'Bot' }, '/approve-plan', at(2))], '/approve-plan', null).approved, false);
  assert.equal(gateOnce([c({ login: 'other', type: 'User' }, '/approve-plan', at(2))], '/approve-plan', null).approved, false);
});

test('R54 test plan รอบเดียว: a /revise after Gate 1 and before Gate 2 fails; one before Gate 1 does not', () => {
  const pass = [c(owner, '/revise x', at(1)), c(owner, '/approve-plan', at(2)), c(owner, '/approve-tests', at(4))];
  assert.equal(gateOnce(pass, '/approve-tests', '/approve-plan').once, true);
  const fail = [c(owner, '/approve-plan', at(2)), c(owner, '/revise y', at(3)), c(owner, '/approve-tests', at(4))];
  assert.equal(gateOnce(fail, '/approve-tests', '/approve-plan').once, false);
});

test('R54 CI เขียวรอบแรก: first run of the first head sha, attempt 1, success', () => {
  const run = (o) => ({ id: 1, name: 'CI', path: '.github/workflows/ci.yml', head_sha: 'aaa', run_attempt: 1, conclusion: 'success', created_at: at(1), ...o });
  assert.equal(ciFirstGreen([run({}), run({ id: 2, head_sha: 'bbb', conclusion: 'failure', created_at: at(2) })], 'aaa'), true);
  assert.equal(ciFirstGreen([run({ run_attempt: 2 })], 'aaa'), false);
  assert.equal(ciFirstGreen([run({ conclusion: 'failure' }), run({ id: 2, created_at: at(2) })], 'aaa'), false);
  assert.equal(ciFirstGreen([run({ path: '.github/workflows/other.yml' })], 'aaa'), false);
});

test('R54 รีวิวผ่านรอบเดียว: the first review by the agent App is APPROVED', () => {
  const rv = (user, state, h) => ({ user, state, submitted_at: at(h) });
  assert.equal(reviewOnce([rv(owner, 'COMMENTED', 1), rv(bot, 'APPROVED', 2)], BOT), true);
  assert.equal(reviewOnce([rv(bot, 'CHANGES_REQUESTED', 1), rv(bot, 'APPROVED', 2)], BOT), false);
  assert.equal(reviewOnce([], BOT), false);
});

test('R54 ประหยัด token: the issue total within the budget of its size', () => {
  assert.equal(tokenLean(5_240_000, 'M', cfg.sizing.budgetTokens), true);
  assert.equal(tokenLean(5_240_001, 'M', cfg.sizing.budgetTokens), false);
  assert.equal(tokenLean(1, null, cfg.sizing.budgetTokens), false);
});

const lab = (event, name, h) => ({ event, label: { name }, created_at: at(h) });

test('R54 ไม่ติดขัด: never blocked passes; a code block fails; a block ended by /approve-mock keeps it', () => {
  assert.equal(noBlock([lab('labeled', 'agent:building', 1)], []), true);
  assert.equal(noBlock([lab('labeled', 'agent:blocked', 1), lab('unlabeled', 'agent:blocked', 3)], []), false);
  const mockWait = [lab('labeled', 'agent:blocked', 1), lab('unlabeled', 'agent:blocked', 3)];
  assert.equal(noBlock(mockWait, [c(owner, '/approve-mock https://claude.ai/artifact/x', at(2))]), true);
  assert.equal(noBlock([lab('labeled', 'agent:blocked', 1)], [c(owner, '/approve-mock https://claude.ai/artifact/x', at(2))]), false);
});

test('R54: bonuses from facts use the config percents', () => {
  const r = earnedBonuses({ planOnce: true, testsOnce: false, ciFirstGreen: true, reviewOnce: false, tokenLean: true, noBlock: true }, cfg.bonuses);
  assert.deepEqual(r.keys, ['planOnce', 'ciFirstGreen', 'tokenLean', 'noBlock']);
  assert.equal(r.pct, 10 + 15 + 15 + 5);
});

// ---------- R53 ----------

test('R53: size:L with +10 +15 +10 +15 +10 +5 (65%) earns ฿2,000 × 1.60 = ฿3,200', () => {
  const b = earnedBonuses({ planOnce: true, testsOnce: true, ciFirstGreen: true, reviewOnce: true, tokenLean: true, noBlock: true }, cfg.bonuses);
  assert.equal(b.pct, 65);
  const r = incomeFor({ size: 'L', pct: b.pct }, cfg);
  assert.equal(r.base, 2000);
  assert.equal(r.capped, 60);
  assert.equal(r.amount, 3200);
});

test('R53: an unlabelled issue earns nothing and says why', () => {
  const r = incomeFor({ size: null, pct: 30 }, cfg);
  assert.equal(r.amount, null);
  assert.match(r.reason, /size/);
});

test('R53: closed by the release workflow means a closed event by the agent App', () => {
  assert.equal(closedByRelease([{ event: 'closed', actor: bot, created_at: at(5) }], BOT), at(5));
  assert.equal(closedByRelease([{ event: 'closed', actor: owner, created_at: at(5) }], BOT), null);
  assert.equal(closedByRelease([{ event: 'closed', actor: bot, created_at: at(5) }, { event: 'reopened', actor: owner, created_at: at(6) }], BOT), null);
});
