// T31. Missions, streak and ledger. Spec: docs/sdd/agent-office-live/spec.md R55, R56, R63; Q18 to Q20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bangkokDay, mondayOf, runLedger, dailyMissions, incomeFor, incomeAmount } from './economy.mjs';
import { CONFIG_URL, validateConfig } from './config.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));
const streak = cfg.missions.streak;

test('R55: Bangkok days turn at 17:00 UTC; weeks start Monday (Q20)', () => {
  assert.equal(bangkokDay('2026-10-16T16:59:59Z'), '2026-10-16');
  assert.equal(bangkokDay('2026-10-16T17:00:00Z'), '2026-10-17');
  assert.equal(mondayOf('2026-10-16'), '2026-10-12');
  assert.equal(mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
});

test('R55: missions across a Bangkok midnight count each close in its own day', () => {
  const closes = [{ n: 1, at: '2026-10-16T10:00:00Z', size: 'M' }, { n: 2, at: '2026-10-16T16:30:00Z', size: 'S' }, { n: 3, at: '2026-10-16T17:30:00Z', size: 'XL' }];
  const d16 = dailyMissions({ day: '2026-10-16', closes, blockedAt: [], markers: [], dayEnd: null, cfg });
  const d17 = dailyMissions({ day: '2026-10-17', closes, blockedAt: [], markers: [], dayEnd: null, cfg });
  const close2 = (ms) => ms.find((m) => m.id === 'close2');
  assert.deepEqual(close2(d16).progress, [2, 2]);
  assert.equal(close2(d16).done, true);
  assert.deepEqual(close2(d17).progress, [1, 2]);
  assert.equal(close2(d17).done, false);
});

test('R55: no-blocked, cache ≥ 70% and paid-before-midnight missions', () => {
  const markers = [{ at: '2026-10-16T03:00:00Z', input: 1000, cacheRead: 700 }, { at: '2026-10-15T03:00:00Z', input: 1000, cacheRead: 0 }];
  const ms = dailyMissions({ day: '2026-10-16', closes: [], blockedAt: ['2026-10-16T18:00:00Z'], markers, dayEnd: { aiOwed: 0 }, cfg });
  const by = Object.fromEntries(ms.map((m) => [m.id, m]));
  assert.equal(by.noBlocked.done, true);
  assert.deepEqual(by.cache70.progress, [70, 70]);
  assert.equal(by.cache70.done, true);
  assert.equal(by.payoff.done, true);
  const bad = Object.fromEntries(dailyMissions({ day: '2026-10-16', closes: [], blockedAt: ['2026-10-16T05:00:00Z'], markers: [{ at: '2026-10-16T03:00:00Z', input: 1000, cacheRead: 699 }], dayEnd: { aiOwed: 1 }, cfg }).map((m) => [m.id, m]));
  assert.equal(bad.noBlocked.done, false);
  assert.equal(bad.cache70.done, false);
  assert.equal(bad.payoff.done, false);
});

test('R55 R56: the streak reaches 3 and 7, paying the config rewards into the fund', () => {
  const l = runLedger({ start: '2026-10-20', now: '2026-10-27T05:00:00Z', events: [], streak });
  assert.equal(l.days.length, 7);
  assert.equal(l.streak, 7);
  assert.deepEqual(l.days.filter((d) => d.reward).map((d) => [d.day, d.reward]), [['2026-10-22', 300], ['2026-10-26', 1000]]);
  assert.equal(l.fund, 1300);
});

test('R55: a day ending with AI cost owed resets the streak; paying it starts again', () => {
  const events = [
    { at: '2026-10-23T05:00:00Z', kind: 'aiCost', amount: 5000, ref: 'run 1' },
    { at: '2026-10-24T05:00:00Z', kind: 'income', amount: 10000, ref: '#7' },
  ];
  const l = runLedger({ start: '2026-10-20', now: '2026-10-25T05:00:00Z', events, streak });
  assert.deepEqual(l.days.map((d) => d.streak), [1, 2, 3, 0, 1]);
  assert.equal(l.days[3].aiOwed, 4700);
  assert.equal(l.aiOwed, 0);
  assert.equal(l.aiPaid, 5000);
  assert.equal(l.fund, 300 + 10000 - 5000);
});

test('R56 R63: Head pays the AI cost owed before the office cost owed', () => {
  const events = [
    { at: '2026-10-20T01:00:00Z', kind: 'aiCost', amount: 100, ref: 'run 1' },
    { at: '2026-10-21T05:00:00Z', kind: 'income', amount: 120, ref: '#1' },
  ];
  const l = runLedger({ start: '2026-10-20', now: '2026-10-21T06:00:00Z', events, bills: { '2026-10-20': 50 }, streak });
  assert.equal(l.aiPaid, 100);
  assert.equal(l.aiOwed, 0);
  assert.equal(l.officePaid, 20);
  assert.equal(l.officeOwed, 30);
  assert.equal(l.fund, 0);
});

test('R56: income with the paid-up bonus counts it only when no AI cost is owed at close', () => {
  const income = { base: 2000, pct: 55, paidUpPct: 5, capPct: 60 };
  const clean = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T05:00:00Z', kind: 'income', income, ref: '#1' }], streak });
  assert.equal(clean.fund, 3200);
  const owing = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T01:00:00Z', kind: 'aiCost', amount: 100, ref: 'run 1' }, { at: '2026-10-20T05:00:00Z', kind: 'income', income, ref: '#1' }], streak });
  assert.equal(owing.fund, 2000 + 1100 - 100);
  const unsized = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T05:00:00Z', kind: 'income', income: { ...income, base: null }, ref: '#2' }], streak });
  assert.equal(unsized.fund, 0);
  assert.equal(unsized.leftOut[0].ref, '#2');
});

test('R56: events before economyStart are not in the ledger; the current day is not cut', () => {
  const l = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-19T05:00:00Z', kind: 'income', amount: 999, ref: '#0' }], bills: { '2026-10-20': 10 }, streak });
  assert.equal(l.fund, 0);
  assert.equal(l.days.length, 0);
  assert.equal(l.officeOwed, 0);
});

test('B2 R53 R56: the ledger caps the bonus at the config cap, paid-up bonus included', () => {
  const income = { base: 2000, pct: 58, paidUpPct: 5, capPct: cfg.bonusCapPct };
  const l = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T05:00:00Z', kind: 'income', income, ref: '#1' }], streak });
  assert.equal(l.fund, 3200);
  const over = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T05:00:00Z', kind: 'income', income: { ...income, pct: 200 }, ref: '#2' }], streak });
  assert.equal(over.fund, 3200);
});

test('N1 R53: one income formula serves incomeFor and the ledger', () => {
  assert.equal(incomeAmount(2000, 65, 60), 3200);
  assert.equal(incomeAmount(800, 10, 60), 880);
  for (const pct of [0, 25, 60, 65, 200]) {
    const a = incomeFor({ size: 'M', pct }, cfg).amount;
    const l = runLedger({ start: '2026-10-20', now: '2026-10-20T06:00:00Z', events: [{ at: '2026-10-20T05:00:00Z', kind: 'income', income: { base: cfg.tiers.M, pct, paidUpPct: 0, capPct: cfg.bonusCapPct }, ref: '#3' }], streak });
    assert.equal(a, incomeAmount(cfg.tiers.M, pct, cfg.bonusCapPct));
    assert.equal(l.fund, a);
  }
});
