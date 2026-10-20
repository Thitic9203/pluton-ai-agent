// T36: the money block of the snapshot, from the T33 history, the config and the agent App login
// (docs/sdd/agent-office-live/spec.md R40, R51 to R56, R58, R59, R61 to R64). The history is a
// fixture in the shape agent-office/lib/history.mjs returns; the config is the real file with a
// test economyStart; the rates are the config's and are never typed here except to state the
// hand-worked expectation of each line.
// Run: TZ=UTC node --test agent-office/lib/money.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMoney, LEDGER_FIELDS } from './money.mjs';
import { loadConfig, loadMenu, MENU_URL } from './config.mjs';
import { sourceLine, NO_SOURCE } from './sources.mjs';
import { viewOf, moneyRows } from '../public/app/live.js';

const BOT = 'taskfolio-agent[bot]';
const OWNER = { login: 'Thitic9203', type: 'User' };
const APP = { login: BOT, type: 'Bot' };
const base = loadConfig(readFileSync(new URL('../projects.config.json', import.meta.url), 'utf8'));
const config = { ...base, economyStart: '2026-10-16' };
const menu = loadMenu(readFileSync(MENU_URL, 'utf8'));
const NOW = Date.parse('2026-10-18T05:00:00Z'); // 12:00 Bangkok, Sun 18 Oct
const READ_AT = new Date(NOW).toISOString();

const comment = (id, user, body, at) => ({ id, user, body, created_at: at, updated_at: at });
const marker = (o) => `<!-- agent-office:usage ${JSON.stringify({ v: 1, issue: 10, run_id: 500, run_attempt: 1, job: 'agent', step: 'work', ...o })} -->`;

/** One issue, sized L, closed by the release workflow at 12:00 Bangkok on 17 Oct. */
function history({ markerBody } = {}) {
  return {
    readAt: READ_AT,
    since: '2026-10-15T17:00:00.000Z',
    calls: 12,
    issues: [{
      number: 10, title: 'Export button', state: 'closed', created_at: '2026-10-16T01:00:00Z', closed_at: '2026-10-17T05:00:00Z',
      labels: ['size:L'], final: true,
      comments: [
        comment(1, OWNER, '/approve-plan', '2026-10-16T03:00:00Z'),
        comment(2, OWNER, '/approve-tests', '2026-10-16T04:00:00Z'),
        comment(3, APP, markerBody ?? marker({ at: '2026-10-16T05:30:00Z', input: 1000000, cacheRead: 2000000, cacheWrite: 0, output: 100000, costUsd: 10, fxRate: 33 }), '2026-10-16T05:32:00Z'),
      ],
      timeline: [
        { event: 'labeled', label: 'size:L', actor: APP, created_at: '2026-10-16T02:00:00Z' },
        { event: 'labeled', label: 'agent:building', actor: APP, created_at: '2026-10-16T04:30:00Z' },
        { event: 'closed', actor: APP, created_at: '2026-10-17T05:00:00Z' },
      ],
      pulls: [{ number: 1010, state: 'closed', head_sha: 'a'.repeat(40), merged_at: '2026-10-16T08:00:00Z', reviews: [{ id: 1, user: APP, state: 'APPROVED', commit_id: 'a'.repeat(40), submitted_at: '2026-10-16T07:00:00Z' }] }],
      runs: [{ id: 900, name: 'CI', path: '.github/workflows/ci.yml', head_sha: 'a'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'success', event: 'pull_request', created_at: '2026-10-16T06:00:00Z', updated_at: '2026-10-16T06:10:00Z' }],
      checkRuns: { ['a'.repeat(40)]: [{ id: 7, name: 'app', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success', started_at: '2026-10-16T06:00:00Z', completed_at: '2026-10-16T06:10:00Z' }] },
    }],
    agentRuns: [
      {
        workflow: 'agent.yml', id: 500, name: 'agent', path: '.github/workflows/agent.yml', head_sha: 'c'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'success', event: 'issues', created_at: '2026-10-16T05:00:00Z',
        jobs: [
          { id: 1, name: 'Agent work', run_attempt: 1, status: 'completed', conclusion: 'success', started_at: '2026-10-16T05:00:00Z', completed_at: '2026-10-16T05:30:00Z' },
          { id: 2, name: 'Agent usage', run_attempt: 1, status: 'completed', conclusion: 'success', started_at: '2026-10-16T05:30:00Z', completed_at: '2026-10-16T05:31:00Z' },
        ],
      },
      {
        workflow: 'agent-sweep.yml', id: 600, name: 'sweep', path: '.github/workflows/agent-sweep.yml', head_sha: 'd'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'success', event: 'schedule', created_at: '2026-10-18T03:00:00Z',
        jobs: [{ id: 3, name: 'sweep', run_attempt: 1, status: 'completed', conclusion: 'success', started_at: '2026-10-18T03:00:00Z', completed_at: '2026-10-18T03:15:00Z' }],
      },
    ],
    e2e: [],
  };
}

const build = (over = {}) => buildMoney({ config, history: history(), botLogin: BOT, now: NOW, readAt: READ_AT, ...over });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} is not ${b}`);

test('R51, R52: AI cost and tokens from the vouched marker, saving at the run\'s own rate', () => {
  const { money } = build();
  near(money.costThb, 330, 'costThb = 10 USD × 33');
  near(money.saved, (2000000 * (config.prices.input - config.prices.cacheRead)) / 1e6 * 33, 'saved');
  assert.deepEqual(money.tokens, { input: 1000000, cacheRead: 2000000, cacheWrite: 0, output: 100000 });
});

test('R53, R54, R56: the closed L issue earns 2,000 × 1.60 with every bonus, paid up at its close', () => {
  const { money } = build();
  assert.equal(money.paid.length, 1);
  const p = money.paid[0];
  assert.equal(p.key, '#10');
  assert.equal(p.title, 'Export button');
  near(p.amount, 3200, 'income, capped at +60%');
  assert.match(p.note, /\+60%/);
  assert.ok(sourceLine(p.source), 'the income carries its source line');
});

test('R56, R63: the ledger pays AI cost first; owed plus paid equals the cost; nothing is negative', () => {
  const { money } = build();
  near(money.aiPaid + money.aiOwed, money.costThb, 'AI cost is owed or paid');
  for (const k of ['fund', 'aiOwed', 'aiPaid', 'officeOwed']) assert.ok(money[k] >= 0, `${k} ≥ 0`);
  assert.equal(money.aiOwed, 0, 'the fund covered the AI cost');
  assert.ok(money.office.lastBill && money.office.lastBill.day === '2026-10-17', 'the last cut bill is yesterday');
});

test('R61 (T37): today\'s lines are priced on real resources at the day\'s recorded rate', () => {
  const { money } = build();
  const t = money.office.today;
  const min = config.office.prices.actionsMinute.value;
  assert.equal(t.day, '2026-10-18');
  assert.equal(t.fx.rate, 33, 'the latest vouched marker rate up to that day');
  assert.deepEqual([t.elec.minutes, t.elec.usd, t.elec.thb], [15, 15 * min, 15 * min * 33]);
  assert.deepEqual([t.water.minutes, t.water.thb], [0, 0]);
  assert.equal(t.net.thb, null, 'R40: no Cloudflare read, no internet line');
  assert.equal(t.sup.thb, null, 'R40: the empty menu, no supplies line');
  assert.deepEqual(t.missing, ['internet', 'supplies']);
  assert.equal(t.note, 'ยังไม่ตัดรอบ');
  assert.equal(money.office.quota.minutes, 31 + 15);
  assert.equal(money.office.quota.text, 'ใช้ไป 46/2,000 นาทีเดือนนี้ · จ่ายจริง ฿0 ภายในโควตาฟรี');
  assert.match(money.sources.elec.fact, /0\.006 USD per minute .*actions-runner-pricing · อ่านเมื่อ 2026-10-16.*ใช้ไป 46\/2,000/);
  assert.equal(money.sources.net, undefined);
});

test('R61 (T37): with request counts the internet line is priced; with no marker rate the snapshot rate is used', () => {
  const per = config.office.prices.workersRequestsPerMillion.value;
  const { money } = build({ requests: { '2026-10-18': 2e6 } });
  assert.equal(money.office.today.net.thb, 2 * per * 33);
  const h = history();
  h.issues[0].comments.pop();
  const noMarker = buildMoney({ config, history: h, botLogin: BOT, now: NOW, readAt: READ_AT, fx: { rate: 32, at: '2026-10-18T00:00:00Z', fact: 'open.er-api.com' } }).money;
  assert.equal(noMarker.office.today.fx.rate, 32);
  const noRate = buildMoney({ config, history: h, botLogin: BOT, now: NOW, readAt: READ_AT }).money;
  assert.equal(noRate.office.today.elec.thb, null, 'R40: no rate, no THB');
  assert.equal(noRate.office.today.elec.minutes, 15, 'the minutes still show');
});

test('R61 (T37): rework minutes on an agent branch go to water, never to electricity', () => {
  const h = history();
  h.issues[0].checkRuns = { ['a'.repeat(40)]: [{ id: 7, name: 'app', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'failure', started_at: '2026-10-18T01:00:00Z', completed_at: '2026-10-18T01:05:00Z' }] };
  h.issues[0].runs.push({ id: 901, path: '.github/workflows/ci.yml', head_sha: 'b'.repeat(40), run_attempt: 1, conclusion: 'success', created_at: '2026-10-18T02:00:00Z', jobs: [{ id: 3, name: 'sweep', started_at: '2026-10-18T03:00:00Z', completed_at: '2026-10-18T03:15:00Z' }] });
  const { money } = buildMoney({ config, history: h, botLogin: BOT, now: NOW, readAt: READ_AT });
  assert.equal(money.office.today.water.minutes, 15);
  assert.equal(money.office.today.elec.minutes, 0, 'job 3 is rework, so it left electricity');
});

test('R62: tokens feed only the AI cost; the office lines do not move when tokens change', () => {
  const a = build().money;
  const b = buildMoney({ config, history: history({ markerBody: marker({ at: '2026-10-16T05:30:00Z', input: 9e6, cacheRead: 0, cacheWrite: 0, output: 9e5, costUsd: 10, fxRate: 33 }) }), botLogin: BOT, now: NOW, readAt: READ_AT }).money;
  assert.deepEqual(a.office.today, b.office.today);
  assert.notDeepEqual(a.tokens, b.tokens);
});

test('R59: a marker by anyone but the agent App is not counted and is warned', () => {
  const h = history();
  h.issues[0].comments[2].user = OWNER;
  const { money, warnings } = buildMoney({ config, history: h, botLogin: BOT, now: NOW, readAt: READ_AT });
  assert.equal(money.costThb, 0);
  assert.ok(warnings.some((w) => /not by the agent App/.test(w)));
});

test('R40: without the agent App login, before economyStart, or with no history, the ledger is null, never 0', () => {
  const cases = [
    build({ botLogin: '' }),
    build({ botLogin: '[bot]' }),
    build({ config: { ...config, economyStart: '2026-10-20' } }),
    build({ history: null }),
  ];
  for (const { money, warnings } of cases) {
    for (const k of LEDGER_FIELDS) {
      assert.equal(money[k], null, k);
      assert.equal(money.sources[k], undefined, `${k} has no source entry`);
    }
    assert.equal(money.office, null);
    assert.deepEqual(money.paid, []);
    assert.ok(warnings.length >= 1, 'the reason is warned');
    // The config facts keep their source: they are real whatever the ledger.
    assert.equal(money.tiers.L.thb, config.tiers.L);
    assert.equal(money.prices.output, config.prices.output);
    assert.ok(money.costMethod.length >= 10);
  }
});

test('R58: every number the page shows from this block carries a source line', () => {
  const { money } = build();
  const state = { readAt: READ_AT, money };
  const v = viewOf(state, null);
  const r = moneyRows(state, null);
  const cells = [...Object.entries(v).filter(([id]) => id !== 'fxVal'), ...r.missions.flatMap((m, i) => [[`m${i}p`, m.progress], [`m${i}r`, m.reward]]), ...r.paid.map((p, i) => [`p${i}`, p.amt]), ...r.tiers.map((t) => [t.k, t.thb]), ...r.rate.map((x) => [x.k, x.text])];
  for (const [id, c] of cells) {
    if (id === 'debtChip' || id === 'officeChip' || c.text === NO_SOURCE) continue; // R40 shows no number
    assert.ok(c.line && c.line.startsWith('ที่มา: '), `${id} shows "${c.text}" with no source`);
  }
  assert.ok(r.missions.length >= 6, 'four daily and two weekly missions');
  assert.equal(r.tiers.length, 4);
  assert.equal(r.model, config.prices.model);
});

test('R64 (T37): the panel rows follow the owner\'s order and columns, with today\'s figure', () => {
  const { money } = build();
  const ids = money.costMethod.map((e) => e.id);
  assert.deepEqual(ids, ['income', 'bonuses', 'ai', 'cache', 'electricity', 'water', 'internet', 'supplies', 'dailyBill', 'aiOwed', 'missions', 'r62']);
  for (const e of money.costMethod) {
    assert.equal(typeof e.line, 'string');
    for (const r of e.rates) assert.ok(r.text && r.origin);
  }
  const row = (id) => money.costMethod.find((e) => e.id === id);
  assert.match(row('ai').line, /มูลค่าเทียบราคา API · จ่ายจริงเป็นค่าสมาชิก/);
  assert.match(row('electricity').input, /^นับจาก: /);
  assert.match(row('electricity').where, /^สูตร: /);
  assert.match(row('electricity').formula, /^ราคา: .*0\.006 USD per minute \(ที่มา: https:\/\/docs\.github\.com\/en\/billing\/reference\/actions-runner-pricing · อ่านเมื่อ 2026-10-16\)/);
  assert.match(row('electricity').rates[0].text, /^วันนี้ ฿.* · 15 นาที · ใช้ไป 46\/2,000 นาทีเดือนนี้/);
  assert.equal(row('internet').rates[0].text, `วันนี้ ${NO_SOURCE}`);
  assert.equal(row('supplies').rates[0].text, `วันนี้ ${NO_SOURCE}`);
  assert.deepEqual(row('bonuses').rates, []);
  assert.match(row('r62').formula, /ไม่ถูกนับซ้ำ/);
});

test('R61 (T37): with the menu file, today\'s run is served one drink at its sourced price, listed under supplies', () => {
  const { money } = build({ menu });
  const sup = money.office.today.sup;
  // 18 Oct: no one worked an issue, no review, no close; one sweep run started (run 600).
  assert.deepEqual(sup.counts, { activeAgentDays: 0, runsStarted: 1, reviewRuns: 0, issuesClosed: 0 });
  assert.equal(sup.items.length, 1);
  assert.equal(sup.items[0].group, 'drink');
  assert.equal(sup.thb, menu.prices[sup.items[0].price].value);
  assert.deepEqual(money.office.today.missing, ['internet']);
  const ids = money.costMethod.map((e) => e.id);
  assert.deepEqual(ids.slice(ids.indexOf('supplies'), ids.indexOf('supplies') + 2), ['supplies', 'supplies:item:0']);
  const row = money.costMethod.find((e) => e.id === 'supplies:item:0');
  assert.equal(row.line, `· ${sup.items[0].name}`);
  assert.match(row.formula, /^ราคา: .* · ที่มา https:\/\/.* · อ่านเมื่อ 2026-10-17$/);
  assert.match(row.rates[0].text, /^฿\d/);
  const supRow = money.costMethod.find((e) => e.id === 'supplies');
  assert.ok(supRow.where.includes('เมนูจาก The Sims 4 (Sims Wiki, CC BY-SA)'));
  assert.ok(supRow.where.includes(menu.priceLink.url), 'the link back to Numbeo');
  assert.equal(build({ menu }).money.office.today.sup.items[0].name, sup.items[0].name, 'a reload serves the same drink');
});
