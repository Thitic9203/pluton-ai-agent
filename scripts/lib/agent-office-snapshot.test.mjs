// T13 (snapshot half): the board snapshot the workflow builds in Node and publishes as
// agent-office/public/data/state.json (docs/sdd/agent-office-live/spec.md R2 to R10, R16, R30, R33,
// R65, E1). The GitHub client is faked at its method level; derive.mjs and the config are real.
// Run: TZ=UTC node --test scripts/lib/agent-office-snapshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot, snapshotToFile } from './agent-office-snapshot.mjs';
import { loadConfig, loadMenu, MENU_URL } from '../../agent-office/lib/config.mjs';

const config = loadConfig(readFileSync(new URL('../../agent-office/projects.config.json', import.meta.url), 'utf8'));
const REPO = 'Thitic9203/pluton-timesheet';
const menu = loadMenu(readFileSync(MENU_URL, 'utf8'));
const NOW = '2026-10-16T09:00:00.000Z';
const now = () => new Date(NOW);

const issue = (n, labels, extra = {}) => ({
  number: n,
  title: `issue ${n}`,
  state: 'open',
  labels: labels.map((name) => ({ name })),
  created_at: `2026-10-0${Math.min(9, n)}T00:00:00Z`,
  html_url: `https://github.com/${REPO}/issues/${n}`,
  ...extra,
});

function fakeClient({ issues = [], pulls = [], timelines = {}, runs = {}, fail = null } = {}) {
  const calls = [];
  const rec = (name, ...args) => {
    calls.push([name, ...args]);
    if (fail) throw fail;
  };
  return {
    calls,
    async openIssues(repo) { rec('openIssues', repo); return issues; },
    async releasePulls(repo, base) { rec('releasePulls', repo, base); return pulls; },
    async timeline(repo, n) { rec('timeline', repo, n); return timelines[n] ?? []; },
    async runsInProgress(repo, file) { rec('runsInProgress', repo, file); return runs[file] ?? []; },
  };
}

test('R10: with the agent switched off, the board is truly idle and GitHub is not read', async () => {
  const client = fakeClient({ issues: [issue(1, ['agent:building'])] });
  const s = await buildSnapshot({ config, client, agentEnabled: false, now });
  assert.equal(client.calls.length, 0);
  assert.equal(s.readAt, NOW);
  assert.equal(s.agentEnabled, false);
  assert.equal(s.notice, 'agent ยังไม่เปิดใช้งาน');
  assert.deepEqual(s.issues, []);
  assert.ok(s.people.length === config.roster.length && s.people.every((p) => p.state === 'idle' && p.doing === 'พักเบรก'));
  assert.equal(s.cap.text, 'เขียนโค้ดพร้อมกัน 0/3 · รอคิว 0 · ทั้งหมด 0 ใบ');
  const tf = s.projects.find((p) => p.id === 'taskfolio');
  assert.equal(tf.count, 0);
  assert.equal(tf.release.text, 'รอครบ 0/10');
  assert.equal(s.projects.find((p) => p.id === 'ols').count, null, 'E4: a project with no source counts null, never 0');
});

test('R2 to R9: lanes, release queue, blocked step, holders, Head and the Improvement tag', async () => {
  const client = fakeClient({
    issues: [
      issue(1, ['agent:building']),
      issue(2, ['agent:planning']),
      issue(3, ['agent:merging']),
      issue(4, ['agent:blocked']),
      issue(5, ['bug']),
      issue(6, ['agent:ready'], { title: '[Improvement] faster' }),
      issue(7, ['agent:building', 'agent:in-review']),
    ],
    pulls: [{ number: 30, merged_at: '2026-10-15T00:00:00Z', head: { ref: 'agent/issue-3' }, base: { ref: 'release/next' } }],
    timelines: {
      4: [
        { event: 'labeled', label: { name: 'agent:building' }, created_at: '2026-10-15T00:00:00Z' },
        { event: 'unlabeled', label: { name: 'agent:building' }, created_at: '2026-10-15T01:00:00Z' },
        { event: 'labeled', label: { name: 'agent:blocked' }, created_at: '2026-10-15T01:00:01Z' },
      ],
    },
  });
  const s = await buildSnapshot({ config, client, agentEnabled: true, now });
  const lane = Object.fromEntries(s.issues.map((i) => [i.n, i.lane]));
  assert.deepEqual(lane, { 1: 'building', 2: 'planning', 3: 'release-queue', 4: 'blocked', 6: 'ready', 7: 'in-review' });
  assert.equal(s.issues.find((i) => i.n === 4).from, 'building');
  assert.equal(s.issues.find((i) => i.n === 6).improvement, true);
  assert.equal(s.issues.find((i) => i.n === 1).improvement, false);
  assert.equal(s.issues.find((i) => i.n === 1).url, `https://github.com/${REPO}/issues/1`);
  assert.equal(s.warnings.length, 1, 'R2: two state labels on #7 give one warning');
  assert.deepEqual(client.calls.filter((c) => c[0] === 'timeline').map((c) => c[2]), [4], 'R4: only blocked issues read a timeline');
  const head = s.people.find((p) => p.role === 'head');
  assert.equal(head.state, 'waiting');
  assert.equal(head.gates, 1);
  const tf = s.projects.find((p) => p.id === 'taskfolio');
  assert.equal(tf.count, 6);
  assert.equal(tf.release.queued, 1);
  assert.equal(tf.release.text, 'รอครบ 1/10');
  assert.equal(s.cap.building, 1, 'R33: only lane building counts: #1, not #7 (in review) nor the blocked #4');
  assert.equal(s.summary.waiting, 2, 'R16 counts people: BA holding Gate 1 issue #2, and Head');
});

test('R7: an agent-sweep run in progress shows the resting people sweeping', async () => {
  const client = fakeClient({ runs: { 'agent-sweep.yml': [{ id: 1, event: 'schedule' }] } });
  const s = await buildSnapshot({ config, client, agentEnabled: true, now });
  assert.ok(s.people.every((p) => p.state === 'sweeping'));
});

test('R8: a production run dispatched by the release workflow gives the prod phase; a person\'s run does not', async () => {
  const run = (login) => ({ id: 9, event: 'workflow_dispatch', head_branch: 'main', triggering_actor: { login }, created_at: NOW });
  const byRelease = await buildSnapshot({ config, client: fakeClient({ runs: { 'deploy-production.yml': [run('github-actions[bot]')] } }), agentEnabled: true, now });
  assert.equal(byRelease.projects.find((p) => p.id === 'taskfolio').release.phase, 'prod');
  const byHand = await buildSnapshot({ config, client: fakeClient({ runs: { 'deploy-production.yml': [run('Thitic9203')] } }), agentEnabled: true, now });
  assert.equal(byHand.projects.find((p) => p.id === 'taskfolio').release.phase, 'collect');
});

test('R40, T36: with the agent off, or without the agent App login, money reads nothing and its ledger is null, never 0', async () => {
  for (const [agentEnabled, agentAppLogin] of [[false, 'taskfolio-agent[bot]'], [true, undefined], [true, '[bot]']]) {
    const client = fakeClient();
    const s = await buildSnapshot({ config: { ...config, economyStart: '2026-10-15' }, client, agentEnabled, agentAppLogin, now });
    assert.ok(!client.calls.some(([name]) => name === 'history'), 'no history read');
    for (const k of ['fund', 'aiOwed', 'aiPaid', 'officeOwed', 'saved', 'costThb', 'tokens']) assert.equal(s.money[k], null, k);
    assert.equal(s.money.tiers.L.thb, config.tiers.L, 'the config facts keep their source');
    assert.ok(s.money.warnings.length >= 1);
  }
});

test('T36, R51 to R56, R61: with the agent on, money comes from the T33 history read through client.history', async () => {
  const BOT = 'taskfolio-agent[bot]';
  const APP = { login: BOT, type: 'Bot' };
  const OWNER = { login: 'Thitic9203', type: 'User' };
  const sha = 'a'.repeat(40);
  const marker = `<!-- agent-office:usage ${JSON.stringify({ v: 1, issue: 10, run_id: 500, run_attempt: 1, job: 'agent', step: 'work', at: '2026-10-15T05:30:00Z', input: 1000000, cacheRead: 2000000, cacheWrite: 0, output: 100000, costUsd: 10, fxRate: 33 })} -->`;
  const routes = (path) => {
    const tail = path.split('?')[0].slice(`/repos/${REPO}/`.length);
    if (tail === 'issues') return [{ number: 10, title: 'Export button', state: 'closed', closed_at: '2026-10-15T08:00:00Z', created_at: '2026-10-15T01:00:00Z', labels: [{ name: 'size:L' }] }];
    if (tail === 'issues/10/comments') return [
      { id: 1, user: OWNER, body: '/approve-plan', created_at: '2026-10-15T03:00:00Z', updated_at: '2026-10-15T03:00:00Z' },
      { id: 3, user: APP, body: marker, created_at: '2026-10-15T05:32:00Z', updated_at: '2026-10-15T05:32:00Z' },
    ];
    if (tail === 'issues/10/timeline') return [
      { event: 'labeled', label: { name: 'size:L' }, actor: APP, created_at: '2026-10-15T02:00:00Z' },
      { event: 'closed', actor: APP, created_at: '2026-10-15T08:00:00Z' },
    ];
    if (tail === 'pulls') return [];
    if (tail === 'actions/runs') return { workflow_runs: [] };
    if (tail === 'actions/workflows/agent.yml/runs') return { workflow_runs: [{ id: 500, name: 'agent', path: '.github/workflows/agent.yml', head_sha: sha, run_attempt: 1, status: 'completed', conclusion: 'success', event: 'issues', created_at: '2026-10-15T05:00:00Z' }] };
    if (/^actions\/workflows\/[a-z-]+\.yml\/runs$/.test(tail)) return { workflow_runs: [] };
    if (tail === 'actions/runs/500/jobs') return { jobs: [{ id: 2, name: 'Agent usage', run_attempt: 1, status: 'completed', conclusion: 'success', started_at: '2026-10-15T05:30:00Z', completed_at: '2026-10-15T05:31:00Z' }] };
    throw new Error(`unexpected history path ${path}`);
  };
  const client = fakeClient();
  client.history = async (path) => { client.calls.push(['history', path]); return routes(path); };
  const ranges = [];
  const s = await buildSnapshot({
    config: { ...config, economyStart: '2026-10-15' }, client, agentEnabled: true, agentAppLogin: BOT, now, menu,
    readFx: async () => { throw new Error('open.er-api.com answered 503'); },
    readRequests: async (range) => { ranges.push(range); return { '2026-10-16': 500000 }; },
  });
  assert.equal(s.money.costThb, 330);
  // T37: the requests are read for the history's range; a failed rate read is a warning, and the
  // marker's own rate (33) still prices today.
  assert.deepEqual(ranges, [{ since: '2026-10-14T17:00:00.000Z', until: NOW }]);
  assert.equal(s.money.office.today.net.thb, 0.5 * config.office.prices.workersRequestsPerMillion.value * 33);
  assert.ok(s.money.warnings.some((w) => /open\.er-api\.com was not read: open\.er-api\.com answered 503/.test(w)));
  assert.equal(s.money.office.today.sup.thb, 0, 'no one worked, ran, reviewed or closed on 16 Oct: nothing served');
  assert.deepEqual(s.money.tokens, { input: 1000000, cacheRead: 2000000, cacheWrite: 0, output: 100000 });
  assert.equal(s.money.paid[0].key, '#10');
  assert.ok(s.money.paid[0].amount >= config.tiers.L, 'the L issue earned at least its base');
  assert.equal(s.money.aiPaid + s.money.aiOwed, 330);
  assert.equal(s.money.office.today.day, '2026-10-16');
  assert.ok(s.money.sources.fund.fact && s.money.sources.fund.time);
  assert.equal(s.money.reads, client.calls.filter(([name]) => name === 'history').length, 'reads counts the history GETs');
  assert.ok(!client.calls.some(([name, p]) => name === 'history' && /statuses/.test(p)), 'no E2E status read for money');
});

test('E1, R65: a GitHub failure writes no file, so the site keeps the last snapshot', async () => {
  const writes = [];
  await assert.rejects(
    snapshotToFile({ config, client: fakeClient({ fail: new Error('GitHub answered 403') }), agentEnabled: true, now, write: (path, text) => writes.push([path, text]) }),
    /403/,
  );
  assert.deepEqual(writes, []);
});

test('R65: a good read writes one JSON file that holds no token', async () => {
  const writes = [];
  const s = await snapshotToFile({ config, client: fakeClient({ issues: [issue(1, ['agent:building'])] }), agentEnabled: true, now, write: (path, text) => writes.push([path, text]) });
  assert.equal(writes.length, 1);
  assert.match(writes[0][0], /agent-office\/public\/data\/state\.json$/);
  assert.deepEqual(JSON.parse(writes[0][1]), s);
  assert.doesNotMatch(writes[0][1], /ghs_|ghp_|github_pat_|Bearer/);
});

// ols-real T8: the OLS cards the Mac sends through the OLS_BOARD repository variable (R13, R14, E4).
const olsBoard = JSON.stringify({
  v: 1,
  readAt: '2026-10-16T08:30:00.000Z',
  items: [
    { n: 12, summary: 'หน้า Learning Path', duty: 'write-tc', phase: 'working' },
    { n: 13, summary: 'ปุ่ม Publish', duty: 'retest', phase: 'failed' },
  ],
});

test('ols-real R14: valid OLS_BOARD cards join the board in test-planning, the QA Lead holds one, OLS counts them', async () => {
  const s = await buildSnapshot({ config, client: fakeClient({ issues: [issue(1, ['agent:building'])] }), agentEnabled: true, now, boards: { OLS_BOARD: olsBoard } });
  const ols = s.issues.filter((i) => i.project === 'ols');
  assert.deepEqual(ols.map((i) => [i.n, i.lane, i.title]), [[12, 'test-planning', 'เขียนเทสเคส · หน้า Learning Path'], [13, 'blocked', 'รีเทสบัค · ปุ่ม Publish']]);
  assert.equal(s.projects.find((p) => p.id === 'ols').count, 2);
  assert.ok(s.people.some((p) => p.role === 'qal' && p.project === 'ols'));
  assert.equal(s.issues.filter((i) => i.project === 'taskfolio').length, 1);
});

test('ols-real E4: no or invalid OLS_BOARD adds no card, OLS counts null, and the reason is a warning', async () => {
  for (const boards of [{}, { OLS_BOARD: '{"v":1}' }]) {
    const s = await buildSnapshot({ config, client: fakeClient(), agentEnabled: true, now, boards });
    assert.equal(s.issues.filter((i) => i.project === 'ols').length, 0);
    assert.equal(s.projects.find((p) => p.id === 'ols').count, null);
    if (boards.OLS_BOARD) assert.ok(s.warnings.includes('OLS: OLS_BOARD did not validate, no OLS cards'));
  }
});

test('R67: every project carries its config name, tag, description and key, so the page finds it by name', async () => {
  const { projectsOf, releaseText } = await import('../../agent-office/public/app/live.js');
  const s = await buildSnapshot({ config, client: fakeClient(), agentEnabled: true, agentAppLogin: null, now });
  for (const p of s.projects) {
    const c = config.projects.find((x) => x.id === p.id);
    assert.deepEqual([p.name, p.tag, p.description, p.key], [c.name, c.tag, c.description, c.key], p.id);
  }
  const tf = projectsOf(s).find((p) => p.name === 'Taskfolio');
  assert.ok(tf, 'the page finds Taskfolio by the name it shows');
  assert.equal(releaseText(tf.release).t, 'รอครบ 0/10');
});

test('R66: on the real config, a day after the agent was turned on is past economyStart, so money is read', () => {
  const day = (s) => new Date(new Date(s).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  assert.ok(config.economyStart <= day('2026-10-16T16:50:30Z'), 'the ledger starts on or before the enable day');
  assert.ok(day(NOW) >= config.economyStart, 'the test clock is inside the ledger');
});
