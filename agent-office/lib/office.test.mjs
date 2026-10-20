// T32, T37. Office costs on the real resources the agents use. Spec: docs/sdd/agent-office-live/spec.md
// R40, R61, R62, R63 (owner popups, 16 Oct 2026 about 00:15). Prices are read from the config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  electricity, water, internet, supplies, supplyCounts, freeQuota, officeDay, officeBills, billedMinutes,
  reworkJobIds, LINE_INPUTS, SUPPLY_TRIGGERS, inputsDisjoint, workingPeople, rotate,
} from './office.mjs';
import { runLedger, aiCost } from './economy.mjs';
import { CONFIG_URL, MENU_URL, validateConfig, loadMenu } from './config.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));
const menu = loadMenu(readFileSync(MENU_URL, 'utf8'));
const MIN = cfg.office.prices.actionsMinute.value;
const PER_M = cfg.office.prices.workersRequestsPerMillion.value;
const FX = { rate: 33, at: '2026-10-21T00:00:00Z', fact: 'open.er-api.com' };
const day = '2026-10-21';
const t = (h, m = 0, s = 0) => new Date(Date.UTC(2026, 9, 21, h, m, s)).toISOString(); // Bangkok day 21 until 17:00 UTC

const jobs = [
  { id: 1, workflow: 'agent.yml', started_at: t(2), completed_at: t(2, 30) }, // 30
  { id: 2, workflow: 'agent-sweep.yml', started_at: t(3), completed_at: t(3, 10, 1) }, // 10 min 1 s → 11
  { id: 3, workflow: 'ci.yml', started_at: t(4), completed_at: t(5) }, // not an agent workflow
  { id: 4, workflow: 'agent.yml', started_at: t(17, 10), completed_at: t(17, 40) }, // the next Bangkok day
  { id: 5, workflow: 'agent.yml', started_at: t(6), completed_at: t(6, 5) }, // a rework job, below
];
const branches = [{
  issue: 7,
  checks: [{ head_sha: 'a', conclusion: 'failure', completed_at: t(5) }],
  runs: [
    { id: 70, head_sha: 'a', created_at: t(4), jobs: [{ id: 701, started_at: t(4), completed_at: t(4, 20) }] }, // before the failure
    { id: 71, head_sha: 'b', created_at: t(5, 30), jobs: [{ id: 702, started_at: t(5, 30), completed_at: t(5, 42, 30) }, { id: 5, started_at: t(6), completed_at: t(6, 5) }] },
    { id: 72, head_sha: 'a', created_at: t(6), jobs: [{ id: 703, started_at: t(6), completed_at: t(6, 9) }] }, // same head as the failure
  ],
}];
const activity = {
  activities: [
    { issue: 1, role: 'dev', at: t(1) }, { issue: 2, role: 'dev', at: t(2) }, { issue: 3, role: 'dev', at: t(3) }, { issue: 4, role: 'dev', at: t(4) },
    { issue: 5, role: 'tl', at: t(5) }, { issue: 5, role: 'tl', at: t(6) }, { issue: 6, role: 'qa', at: t(18) },
  ],
  runsStartedAt: [t(1), t(2), t(18)],
  reviewsAt: [t(3)],
  closesAt: [t(9), t(10)],
};
test('R61: a job is billed in whole minutes, rounded up as GitHub bills', () => {
  assert.equal(billedMinutes({ started_at: t(1), completed_at: t(1, 0, 1) }), 1);
  assert.equal(billedMinutes({ started_at: t(1), completed_at: t(1, 2) }), 2);
  assert.equal(billedMinutes({ started_at: null, completed_at: t(1) }), 0);
});

test('R61 electricity: agent workflow minutes that day, less rework jobs, × the minute price × the day\'s rate', () => {
  const e = electricity({ day, jobs, exclude: reworkJobIds(branches), cfg, fx: FX });
  assert.equal(e.minutes, 41);
  assert.deepEqual(e.ids, [1, 2]);
  assert.equal(e.usd, 41 * MIN);
  assert.equal(e.thb, 41 * MIN * 33);
  assert.equal(electricity({ day, jobs, cfg, fx: null }).thb, null, 'R40: no rate, no THB');
});

test('R61 water: rework minutes, of runs after a failure on an earlier, different head', () => {
  const w = water({ day, branches, cfg, fx: FX });
  assert.deepEqual(w.ids, [702, 5]);
  assert.equal(w.minutes, 13 + 5);
  assert.equal(w.thb, 18 * MIN * 33);
  assert.deepEqual(w.issues, [7]);
});

test('R61 internet: Function requests × the price per million; no count is no line (R40)', () => {
  const n = internet({ day, requests: { [day]: 250000 }, cfg, fx: FX });
  assert.equal(n.requests, 250000);
  assert.equal(n.usd, 0.25 * PER_M);
  assert.equal(n.thb, 0.25 * PER_M * 33);
  assert.deepEqual(internet({ day, requests: null, cfg, fx: FX }), { requests: null, usd: null, thb: null });
});

test('R61 supplies: one meal per working person (breakfast before 11:00), a drink per run, a snack or dessert per review, a dessert per close', () => {
  assert.deepEqual(supplyCounts({ day, activity, roster: cfg.roster }), { activeAgentDays: 4, runsStarted: 2, reviewRuns: 1, issuesClosed: 2 });
  const people = workingPeople({ day, activity, roster: cfg.roster });
  assert.deepEqual(people.map((p) => [p.role, p.issue]), [['dev', 1], ['dev', 2], ['dev', 3], ['tl', 5]], 'four devs worked, the roster holds three');
  const s = supplies({ day, activity, roster: cfg.roster, cfg, menu });
  const by = (t) => s.items.filter((i) => i.trigger === t);
  assert.deepEqual(by('activeAgentDays').map((i) => i.group), ['breakfast', 'breakfast', 'breakfast', 'lunch/dinner'], 'dev work began 08:00 to 10:00 Bangkok, Tech Lead 12:00');
  assert.ok(by('runsStarted').length === 2 && by('runsStarted').every((i) => i.group === 'drink'));
  assert.ok(by('reviewRuns').length === 1 && ['snack', 'dessert'].includes(by('reviewRuns')[0].group));
  assert.ok(by('issuesClosed').length === 2 && by('issuesClosed').every((i) => i.group === 'dessert'));
  for (const i of s.items) assert.equal(i.thb, menu.prices[i.price].value, `${i.name} at its ${i.price} price`);
  assert.equal(s.thb, s.items.reduce((a, i) => a + i.thb, 0));
});

test('R61 supplies: the rotation is fixed, so a reload gives the same items, and every item comes round', () => {
  const a = supplies({ day, activity, roster: cfg.roster, cfg, menu });
  const b = supplies({ day, activity, roster: cfg.roster, cfg, menu });
  assert.deepEqual(a.items.map((i) => i.name), b.items.map((i) => i.name));
  for (const group of ['breakfast', 'lunch/dinner', 'dessert', 'snack', 'drink']) {
    const pool = menu.items.filter((i) => i.group === group);
    const seen = new Set();
    for (let d = 0; d < pool.length; d++) {
      const dd = new Date(Date.UTC(2026, 9, 20) + d * 86400000).toISOString().slice(0, 10);
      seen.add(rotate(pool, dd, 3, 0).name);
    }
    assert.equal(seen.size, pool.length, `${group}: every item comes round in ${pool.length} days`);
  }
});

test('R61 supplies: alcohol is charged at its sourced price; a pending price shows รอราคา and charges 0', () => {
  for (const k of ['beer', 'wine', 'cocktail', 'spirits']) assert.ok(menu.prices[k].value > 0 && menu.prices[k].url.startsWith('https://'), k);
  assert.ok(menu.items.some((i) => i.price === 'beer') && menu.items.some((i) => i.price === 'cocktail'));
  const m2 = structuredClone(menu);
  for (const p of Object.values(m2.prices)) { p.value = null; p.pending = true; }
  const s = supplies({ day, activity, roster: cfg.roster, cfg, menu: m2 });
  assert.ok(s.items.length > 0 && s.items.every((i) => i.pending && i.thb === 0));
  assert.equal(s.thb, 0);
});

test('R40: without the menu there is no supplies line, never ฿0', () => {
  assert.equal(supplies({ day, activity, roster: cfg.roster, cfg, menu: null }).thb, null);
});

test('R61: the free quota counts the agent workflows\' billed minutes of the month', () => {
  assert.deepEqual(freeQuota({ month: '2026-10', jobs, cfg }), { month: '2026-10', minutes: 30 + 11 + 30 + 5, free: cfg.office.prices.freeMinutesPerMonth.value });
});

test('R61, R63: the bill sums the sourced lines and names the missing ones; no sourced line, no bill', () => {
  const facts = { jobs, branches, requests: null, activity };
  const o = officeDay({ day, facts, roster: cfg.roster, cfg, fx: FX });
  assert.deepEqual(o.missing, ['internet', 'supplies']);
  assert.equal(o.utilities, o.electricity.thb + o.water.thb);
  assert.equal(o.total, o.electricity.thb + o.water.thb);
  assert.equal(officeDay({ day, facts, roster: cfg.roster, cfg, fx: null }).total, null);
});

test('R61: every price is read from the config', () => {
  const c2 = structuredClone(cfg);
  c2.office.prices.actionsMinute.value = 0.01;
  c2.office.prices.workersRequestsPerMillion.value = 1;
  assert.equal(electricity({ day, jobs, cfg: c2, fx: { ...FX, rate: 1 } }).usd, (30 + 11 + 5) * 0.01);
  assert.equal(internet({ day, requests: { [day]: 2e6 }, cfg: c2, fx: FX }).usd, 2);
});

test('R62: the five lines read disjoint inputs; tokens reach only the AI cost; triggers are the config\'s', () => {
  assert.equal(inputsDisjoint(LINE_INPUTS), true);
  assert.deepEqual(Object.entries(LINE_INPUTS).filter(([, ins]) => ins.includes('tokens')).map(([k]) => k), ['ai']);
  assert.deepEqual(LINE_INPUTS.supplies, [...SUPPLY_TRIGGERS]);
  for (const forbidden of ['agentJobMinutes', 'reworkJobMinutes', 'fixRounds', 'jobHours', 'tokens']) assert.ok(!SUPPLY_TRIGGERS.includes(forbidden), forbidden);
  assert.equal(inputsDisjoint({ a: ['x'], b: ['x'] }), false);
});

test('R62: a rework job is charged to water only, never to electricity too', () => {
  const ids = reworkJobIds(branches);
  const e = electricity({ day, jobs, exclude: ids, cfg, fx: FX });
  const w = water({ day, branches, cfg, fx: FX });
  assert.ok(!e.ids.some((id) => w.ids.includes(id)));
});

test('R63: ended days give bills, the current day runs outside the ledger as ยังไม่ตัดรอบ', () => {
  const facts = { jobs, branches, requests: { '2026-10-20': 1e6 }, activity };
  const r = officeBills({ start: '2026-10-20', now: '2026-10-21T05:00:00Z', facts, roster: cfg.roster, cfg, fxForDay: () => FX });
  assert.deepEqual(Object.keys(r.bills), ['2026-10-20']);
  assert.equal(r.bills['2026-10-20'], PER_M * 33);
  assert.deepEqual(r.missing['2026-10-20'], ['supplies']);
  assert.equal(r.today.day, '2026-10-21');
  assert.equal(r.today.note, 'ยังไม่ตัดรอบ');
});

test('R63: a bill larger than the fund leaves office cost owed, paid on the next income', () => {
  const bills = { '2026-10-20': 500 };
  const events = [
    { at: '2026-10-20T03:00:00Z', kind: 'income', amount: 200, ref: '#1' },
    { at: '2026-10-21T03:00:00Z', kind: 'income', amount: 1000, ref: '#2' },
  ];
  const before = runLedger({ start: '2026-10-20', now: '2026-10-21T01:00:00Z', events, bills, streak: {} });
  assert.equal(before.officeOwed, 300);
  assert.equal(before.fund, 0);
  const after = runLedger({ start: '2026-10-20', now: '2026-10-21T05:00:00Z', events, bills, streak: {} });
  assert.equal(after.officeOwed, 0);
  assert.equal(after.officePaid, 500);
  assert.equal(after.fund, 700);
});

// B1 R62: behaviour, not the table. Changing one kind of input must move only its own line.
function world(o = {}) {
  const tok = o.tokens ?? 1000;
  const all = { input: tok, cacheRead: tok, cacheWrite: tok, output: tok, tokens: tok };
  const jobsW = [{ id: 1, workflow: 'agent.yml', started_at: t(2), completed_at: new Date(Date.parse(t(2)) + (o.minutes ?? 30) * 60e3).toISOString(), ...all }];
  const runs = [{ id: 71, head_sha: 'b', created_at: t(5, 30), jobs: [{ id: 702, started_at: t(5, 30), completed_at: new Date(Date.parse(t(5, 30)) + (o.rework ?? 10) * 60e3).toISOString(), ...all }], ...all }];
  const branchesW = [{ issue: 7, checks: [{ head_sha: 'a', conclusion: 'failure', completed_at: t(5), ...all }], runs }];
  const act = {
    activities: [{ issue: 1, role: 'dev', at: t(1), ...all }, ...(o.extraWork ? [{ issue: 2, role: 'dev', at: t(2) }] : [])],
    runsStartedAt: o.extraRun ? [t(1), t(2)] : [t(1)], reviewsAt: [], closesAt: [],
  };
  const markers = [{ at: t(2), costUsd: tok / 1000, fxRate: 33, ...all, issue: 1, run_id: 1, run_attempt: 1, step: 'work', fxAt: null, missing: [] }];
  return { facts: { jobs: jobsW, branches: branchesW, requests: { [day]: o.requests ?? 1000 }, activity: act }, markers };
}
function lines(w) {
  const o = officeDay({ day, facts: w.facts, roster: cfg.roster, cfg, fx: FX, menu });
  return { ai: aiCost(w.markers).thb, electricity: o.electricity.thb, water: o.water.thb, internet: o.internet.thb, supplies: o.supplies.thb };
}
const changed = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

test('B1 R62: tokens move only the AI cost', () => assert.deepEqual(changed(lines(world()), lines(world({ tokens: 9_000_000 }))), ['ai']));
test('B1 R62: agent job minutes move only electricity', () => assert.deepEqual(changed(lines(world()), lines(world({ minutes: 90 }))), ['electricity']));
test('B1 R62: rework minutes move only water', () => assert.deepEqual(changed(lines(world()), lines(world({ rework: 40 }))), ['water']));
test('B1 R62: Function requests move only internet', () => assert.deepEqual(changed(lines(world()), lines(world({ requests: 5e6 }))), ['internet']));
test('B1 R62: a working agent or a started run moves only supplies', () => {
  assert.deepEqual(changed(lines(world()), lines(world({ extraWork: true }))), ['supplies']);
  assert.deepEqual(changed(lines(world()), lines(world({ extraRun: true }))), ['supplies']);
});
