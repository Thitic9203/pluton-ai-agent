// Missions after the owner answers to Q18, Q19, Q20 (popup 16 Oct 2026), and the thresholds in config (N2).
// Spec: docs/sdd/agent-office-live/spec.md R55, R56.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyMissions, weeklyMissions, runLedger, missionEvents, liveMissionAt, bangkokHourIndex } from './economy.mjs';
import { CONFIG_URL, validateConfig } from './config.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));
const OWNER = 'owner popup 16 Oct 2026';

test('Q18: daily rewards by difficulty ฿200 / ฿350 / ฿500 come from the config with the owner origin', () => {
  assert.deepEqual(cfg.missions.daily, { easy: 200, medium: 350, hard: 500 });
  assert.equal(cfg.missions.origin.daily, OWNER);
  const ms = Object.fromEntries(dailyMissions({ day: '2026-10-16', closes: [], blockedAt: [], markers: [], dayEnd: null, cfg }).map((m) => [m.id, m]));
  assert.equal(ms.close2.reward, 500);
  assert.equal(ms.noBlocked.reward, 350);
  assert.equal(ms.cache70.reward, 350);
  assert.equal(ms.payoff.reward, 200);
  assert.match(ms.close2.rewardSource, /owner popup 16 Oct 2026/);
});

test('N2: the mission thresholds are config constants with an origin', () => {
  assert.equal(cfg.missions.thresholds.closesPerDay, 2);
  assert.equal(cfg.missions.thresholds.cacheReadPct, 70);
  assert.equal(typeof cfg.missions.origin.thresholds, 'string');
  const c2 = structuredClone(cfg);
  c2.missions.thresholds.closesPerDay = 3;
  c2.missions.thresholds.cacheReadPct = 80;
  const closes = [{ n: 1, at: '2026-10-16T01:00:00Z', size: 'S' }, { n: 2, at: '2026-10-16T02:00:00Z', size: 'S' }];
  const markers = [{ at: '2026-10-16T03:00:00Z', input: 1000, cacheRead: 750, cacheWrite: 0, output: 0 }];
  const ms = Object.fromEntries(dailyMissions({ day: '2026-10-16', closes, blockedAt: [], markers, dayEnd: null, cfg: c2 }).map((m) => [m.id, m]));
  assert.deepEqual(ms.close2.progress, [2, 3]);
  assert.equal(ms.close2.done, false);
  assert.deepEqual(ms.cache70.progress, [75, 80]);
  assert.equal(ms.cache70.done, false);
  assert.match(ms.close2.th, /ปิด 3 issue/);
});

test('Q18 R55: the daily rewards enter the ledger: close2 at the second close, the day-judged ones at the day end', () => {
  const closes = [{ n: 1, at: '2026-10-20T01:00:00Z', size: 'S' }, { n: 2, at: '2026-10-20T03:00:00Z', size: 'S' }];
  const markers = [{ at: '2026-10-20T02:00:00Z', input: 1000, cacheRead: 800, cacheWrite: 0, output: 0 }];
  const events = missionEvents({ start: '2026-10-20', now: '2026-10-21T01:00:00Z', closes, ciGreens: [], approvals: [], markers: [], cfg });
  const close2 = events.find((e) => e.ref.startsWith('ภารกิจ close2'));
  assert.equal(close2.at, '2026-10-20T03:00:00Z');
  assert.equal(close2.amount, 500);
  const l = runLedger({ start: '2026-10-20', now: '2026-10-21T01:00:00Z', events: events.filter((e) => e.ref.startsWith('ภารกิจ close2')), streak: {}, missions: { cfg, blockedAt: [], markers } });
  const refs = l.entries.filter((e) => e.kind === 'reward').map((e) => [e.ref, e.amount]);
  assert.deepEqual(refs, [['ภารกิจ close2 2026-10-20', 500], ['ภารกิจ noBlocked 2026-10-20', 350], ['ภารกิจ cache70 2026-10-20', 350], ['ภารกิจ payoff 2026-10-20', 200]]);
  assert.equal(l.fund, 1400);
});

test('Q19: the live mission is a pure function of the Bangkok hour, in the fixed mock v61 order', () => {
  assert.deepEqual(cfg.missions.live.order, ['ciFirst', 'reviewFirst', 'close1', 'lean']);
  const t0 = Date.parse('2026-10-20T00:30:00Z');
  const a = liveMissionAt(t0, cfg);
  assert.deepEqual(liveMissionAt(t0, cfg), a);
  const ids = [0, 1, 2, 3, 4].map((h) => liveMissionAt(t0 + h * 3600e3, cfg).id);
  const k = cfg.missions.live.order.indexOf(ids[0]);
  assert.deepEqual(ids, [0, 1, 2, 3, 4].map((h) => cfg.missions.live.order[(k + h) % 4]));
  assert.equal(cfg.missions.live.order[bangkokHourIndex(t0) % 4], a.id);
  assert.equal(a.hourStart, '2026-10-20T00:00:00.000Z');
  assert.equal(a.reward, cfg.missions.live.rewards[a.id]);
});

test('Q19: a live mission pays only for its own fact inside its own hour; lean needs a run and stays under the limit', () => {
  const at = (h) => new Date(Date.parse('2026-10-20T00:00:00Z') + h * 3600e3).toISOString();
  const idOf = (h) => liveMissionAt(Date.parse(at(h)) + 60e3, cfg).id;
  const hourOf = (id) => [0, 1, 2, 3].find((h) => idOf(h) === id);
  const inHour = (id, min) => new Date(Date.parse(at(hourOf(id))) + min * 60e3).toISOString();
  const facts = {
    ciGreens: [inHour('ciFirst', 10), inHour('reviewFirst', 10)],
    approvals: [inHour('reviewFirst', 20)],
    closes: [{ n: 9, at: inHour('ciFirst', 30), size: 'S' }],
    markers: [{ at: inHour('lean', 5), input: 100000, cacheRead: 100000, cacheWrite: 0, output: 50000 }],
  };
  const ev = missionEvents({ start: '2026-10-20', now: at(5), ...facts, cfg }).filter((e) => e.ref.startsWith('ภารกิจสด'));
  const got = ev.map((e) => e.ref.split(' ')[1]).sort();
  assert.deepEqual(got, ['ciFirst', 'lean', 'reviewFirst']);
  const lean = ev.find((e) => e.ref.includes('lean'));
  assert.equal(lean.at, new Date(Date.parse(at(hourOf('lean'))) + 3600e3 - 1).toISOString());
  const heavy = missionEvents({ start: '2026-10-20', now: at(5), ciGreens: [], approvals: [], closes: [], markers: [{ at: inHour('lean', 5), input: 300001, cacheRead: 0, cacheWrite: 0, output: 0 }], cfg });
  assert.equal(heavy.filter((e) => e.ref.includes('lean')).length, 0);
  const idle = missionEvents({ start: '2026-10-20', now: at(5), ciGreens: [], approvals: [], closes: [], markers: [], cfg });
  assert.equal(idle.length, 0);
});

test('Q20: weekly missions use Monday weeks and pay into the ledger', () => {
  const closes = [{ n: 1, at: '2026-10-21T03:00:00Z', size: 'XL' }, { n: 2, at: '2026-10-22T03:00:00Z', size: 'XL' }];
  const ws = Object.fromEntries(weeklyMissions({ weekStart: '2026-10-19', closes, days: [], cfg }).map((m) => [m.id, m]));
  assert.equal(ws.xl.paid, true);
  assert.equal(cfg.missions.weekStart, 'monday');
  const ev = missionEvents({ start: '2026-10-19', now: '2026-10-27T00:00:00Z', closes, ciGreens: [], approvals: [], markers: [], cfg }).filter((e) => e.ref.startsWith('ภารกิจสัปดาห์ xl'));
  assert.deepEqual(ev.map((e) => [e.at, e.amount]), [['2026-10-21T03:00:00Z', cfg.missions.weeklyXl]]);
  const l = runLedger({ start: '2026-10-19', now: '2026-10-26T01:00:00Z', events: [], streak: {}, missions: { cfg, blockedAt: [], markers: [] } });
  const weekly = l.entries.filter((e) => e.ref.startsWith('ภารกิจสัปดาห์ noOvernightDebt'));
  assert.deepEqual(weekly.map((e) => [e.ref, e.amount]), [['ภารกิจสัปดาห์ noOvernightDebt 2026-10-19', cfg.missions.weeklyNoOvernightDebt]]);
});

test('Q20: a week that starts before economyStart has fewer than 7 days and pays no weekly reward', () => {
  const l = runLedger({ start: '2026-10-21', now: '2026-10-26T01:00:00Z', events: [], streak: {}, missions: { cfg, blockedAt: [], markers: [] } });
  assert.equal(l.entries.filter((e) => e.ref.startsWith('ภารกิจสัปดาห์')).length, 0);
});
