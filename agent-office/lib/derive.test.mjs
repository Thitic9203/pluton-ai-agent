// T7 to T11. Spec: docs/sdd/agent-office-live/spec.md R2 to R10, R16, R30, R33, R34, E3, E4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LANES, laneOf, releaseQueue, releasePhase, passRate, blockedFrom, assignPeople, idleNotice,
  summary, capLine, isImprovement, projectCounts, issueKey,
} from './derive.mjs';
import { CONFIG_URL, validateConfig } from './config.mjs';
import { message } from '../../scripts/lib/e2e-slack-report.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));

// ---------- T7: label to lane (R2, Q1) ----------

const TABLE = [
  ['agent:ready', 'ready'], ['agent:planning', 'planning'], ['agent:test-planning', 'test-planning'],
  ['agent:queued', 'queued'], ['agent:building', 'building'], ['agent:in-review', 'in-review'],
  ['agent:merging', 'merging'], ['agent:on-test-env', 'on-test-env'], ['agent:blocked', 'blocked'],
];
for (const [label, lane] of TABLE) {
  test(`T7 R2: ${label} maps to ${lane}`, () => {
    const r = laneOf([{ name: label }, { name: 'bug' }], 'agent:');
    assert.equal(r.lane, lane);
    assert.deepEqual(r.warnings, []);
  });
}

test('T7 R2: building and in-review together give in-review with one warning', () => {
  const r = laneOf(['agent:building', 'agent:in-review'], 'agent:');
  assert.equal(r.lane, 'in-review');
  assert.equal(r.warnings.length, 1);
});

test('T7 R2 Q1: no input yields an analysis lane; unknown agent labels give no lane', () => {
  assert.equal(laneOf(['agent:analysis'], 'agent:').lane, null);
  assert.equal(laneOf([], 'agent:').lane, null);
  assert.ok(!LANES.some((l) => l.k === 'analysis'));
});

test('T7 R2: the lane table follows the spec order and roles', () => {
  assert.deepEqual(LANES.map((l) => l.k), ['ready', 'planning', 'test-planning', 'queued', 'building', 'in-review', 'merging', 'release-queue', 'on-test-env', 'blocked']);
  const by = Object.fromEntries(LANES.map((l) => [l.k, l]));
  assert.equal(by.ready.role, 'po');
  assert.equal(by.planning.kind, 'wait');
  assert.equal(by['test-planning'].role, 'qal');
  assert.equal(by.building.role, 'dev');
  assert.equal(by.merging.role, 'tl');
  assert.equal(by.queued.kind, 'idle');
  assert.equal(by.blocked.kind, 'block');
});

// ---------- T8: release queue and phases (R3, R8, R34, Q5) ----------

const pr = (n, o = {}) => ({ number: 1000 + n, head: { ref: `agent/issue-${n}` }, base: { ref: 'release/next' }, merged_at: '2026-10-16T01:00:00Z', ...o });
const iss = (n, labels = [], state = 'open') => ({ number: n, state, labels: labels.map((name) => ({ name })) });

test('T8 R3: a merged agent/issue-7 PR into release/next with no on-test-env is queued, counted once', () => {
  const q = releaseQueue({ pulls: [pr(7), pr(7, { number: 2000 })], issues: [iss(7)], branch: 'release/next' });
  assert.deepEqual(q, [7]);
});

test('T8 R3: on-test-env, unmerged, other base, other head and closed issues are not queued', () => {
  const q = releaseQueue({
    pulls: [pr(1), pr(2, { merged_at: null }), pr(3, { base: { ref: 'main' } }), pr(4, { head: { ref: 'feat/x' } }), pr(5)],
    issues: [iss(1, ['agent:on-test-env']), iss(2), iss(3), iss(4), iss(5, [], 'closed')],
    branch: 'release/next',
  });
  assert.deepEqual(q, []);
});

const noPct = (o) => assert.ok(!Object.keys(o).some((k) => /pct|percent|rate/i.test(k)), `percentage field in ${JSON.stringify(o)}`);

test('T8 R3 R34: collecting shows รอครบ n/10 and a bar of n/10', () => {
  const p = releasePhase({ queued: [iss(1), iss(2), iss(3)], onTestEnv: 0, batch: 10 });
  assert.equal(p.phase, 'collect');
  assert.equal(p.text, 'รอครบ 3/10');
  assert.equal(p.bar, 0.3);
  assert.deepEqual(p.holders, []);
  noPct(p);
});

test('T8 R8: release:batch-ready on the queued issues gives approve, held by QA Lead', () => {
  const p = releasePhase({ queued: [iss(1, ['release:batch-ready'])], onTestEnv: 0, batch: 10 });
  assert.equal(p.phase, 'approve');
  assert.equal(p.text, 'QA Lead อนุมัติ deploy staging');
  assert.deepEqual(p.holders, ['qal']);
  assert.equal(p.bar, 1);
  noPct(p);
});

test('T8 R8: on-test-env issues give the round phase, held by QA Lead and QA', () => {
  const p = releasePhase({ queued: [], onTestEnv: 4, batch: 10 });
  assert.equal(p.phase, 'on-test-env');
  assert.equal(p.text, 'อยู่ในรอบ release');
  assert.deepEqual(p.holders, ['qal', 'qa']);
  noPct(p);
});

test('T8 R8: an in-progress production run gives prod', () => {
  const p = releasePhase({ queued: [], onTestEnv: 4, batch: 10, prodRunning: true, e2e: { state: 'running' } });
  assert.equal(p.phase, 'prod');
  assert.equal(p.text, 'deploy production รอบ release');
  noPct(p);
});

test('T8 R8: an in-progress E2E run shows regression with no percentage', () => {
  const p = releasePhase({ queued: [], onTestEnv: 4, batch: 10, e2e: { state: 'running' } });
  assert.equal(p.phase, 'regression');
  assert.equal(p.text, 'QA รัน regression');
  assert.deepEqual(p.holders, ['qa']);
  noPct(p);
});

test('T8 R8 R57: a finished E2E run shows the pass rate of R57, equal to message()', () => {
  const desc = JSON.stringify({ p: 120, f: 3, k: 2, s: 5, t: 130 });
  const p = releasePhase({ queued: [], onTestEnv: 4, batch: 10, e2e: { state: 'success', description: desc } });
  assert.equal(p.phase, 'regression');
  assert.equal(p.passRate, 96);
  assert.equal(p.text, 'QA รัน regression 96%');
  assert.equal(p.passedOfExecuted, '120 of 125');
  const slack = message({ passed: 120, failed: 3, flaky: 2, skipped: 5, total: 130, notPassing: [] }, { env: 'staging' });
  assert.ok(slack.includes(`${passRate({ passed: 120, total: 130, skipped: 5 })}% (120 of 125 executed)`));
});

test('T8 R57: a run with no report shows ไม่มีรายงาน and no counts', () => {
  const p = releasePhase({ queued: [], onTestEnv: 4, batch: 10, e2e: { state: 'error', description: '' } });
  assert.equal(p.text, 'QA รัน regression · ไม่มีรายงาน');
  noPct(p);
});

// ---------- T9: blocked step (R4) ----------

const ev = (event, name, at) => ({ event, label: { name }, created_at: `2026-10-16T0${at}:00:00Z` });

test('T9 R4: building removed then blocked added gives building', () => {
  const tl = [ev('labeled', 'agent:queued', 1), ev('unlabeled', 'agent:queued', 2), ev('labeled', 'agent:building', 2), ev('unlabeled', 'agent:building', 3), ev('labeled', 'agent:blocked', 3)];
  assert.equal(blockedFrom(tl, 'agent:'), 'building');
});

test('T9 R4: a timeline with only agent:blocked gives null', () => {
  assert.equal(blockedFrom([ev('labeled', 'agent:blocked', 1)], 'agent:'), null);
});

test('T9 R4: the latest blocking counts, and a removal after it does not', () => {
  const tl = [ev('unlabeled', 'agent:ready', 1), ev('labeled', 'agent:blocked', 2), ev('unlabeled', 'agent:blocked', 3), ev('unlabeled', 'agent:in-review', 4), ev('labeled', 'agent:blocked', 5), ev('unlabeled', 'agent:merging', 6)];
  assert.equal(blockedFrom(tl, 'agent:'), 'in-review');
});

// ---------- T10: people (R5, R6, R7, R10, Q6, E3) ----------

const issue = (n, lane, created, o = {}) => ({ project: 'taskfolio', n, lane, from: null, createdAt: `2026-10-${created}T00:00:00Z`, ...o });
const roster2dev = [{ role: 'head' }, { role: 'dev' }, { role: 'dev' }];

test('T10 R5 E3: two Dev and three building issues: the oldest two go to Dev - A and Dev - B, the third waits', () => {
  const r = assignPeople({ roster: roster2dev, roles: cfg.roles, projects: cfg.projects, issues: [issue(3, 'building', 12), issue(1, 'building', 10), issue(2, 'building', 11)] });
  const devs = r.people.filter((p) => p.role === 'dev');
  assert.deepEqual(devs.map((p) => [p.tag, p.issue, p.state]), [['Dev - A', 1, 'working'], ['Dev - B', 2, 'working']]);
  const third = r.issues.find((i) => i.n === 3);
  assert.equal(third.holder, null);
  assert.equal(third.waitText, 'รอ Dev รับงาน');
  assert.equal(devs[0].doing, '#1 · เขียนโค้ด + รีวิวแยก');
});

test('T10 E3: a role with nobody in the roster leaves every issue waiting', () => {
  const r = assignPeople({ roster: roster2dev, roles: cfg.roles, projects: cfg.projects, issues: [issue(4, 'in-review', 10)] });
  assert.equal(r.issues[0].waitText, 'รอ Tech Lead รับงาน');
});

test('T10 R6: one Gate 1 issue gives Head waiting with n 1, and BA waiting on it', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [issue(9, 'planning', 10)] });
  const head = r.people.find((p) => p.role === 'head');
  assert.equal(head.state, 'waiting');
  assert.equal(head.gates, 1);
  assert.equal(head.doing, 'ส่งเรื่องให้เจ้าของ 1 ใบ');
  const ba = r.people.find((p) => p.role === 'ba');
  assert.equal(ba.state, 'waiting');
  assert.equal(ba.issue, 9);
});

test('T10 R7 R10: no issues give every person idle, พักเบรก', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [] });
  assert.ok(r.people.every((p) => p.state === 'idle' && p.doing === 'พักเบรก'));
  assert.equal(r.people.find((p) => p.role === 'head').gates, 0);
});

test('T10 R7 Q6: people without work show sweeping only while a sweep run is in progress', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [issue(1, 'building', 10)], sweeping: true });
  const free = r.people.filter((p) => p.issue === null);
  assert.ok(free.every((p) => p.state === 'sweeping' && p.doing === 'ทำงาน · sweep'));
  assert.equal(r.people.find((p) => p.issue === 1).state, 'working');
});

test('T10 R4: a blocked issue goes to the role of the step it left; without a step to nobody', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [issue(5, 'blocked', 10, { from: 'building' }), issue(6, 'blocked', 11)] });
  const dev = r.people.find((p) => p.issue === 5);
  assert.equal(dev.role, 'dev');
  assert.equal(dev.state, 'blocked');
  assert.equal(dev.doing, '#5 · ติดที่ เขียนโค้ด + รีวิวแยก');
  const six = r.issues.find((i) => i.n === 6);
  assert.equal(six.holder, null);
  assert.equal(six.waitText, null);
  assert.equal(six.step, 'ติดปัญหา');
});

test('T10 R8: a release phase puts a free QA Lead to work on it', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [], releases: [{ project: 'taskfolio', phase: 'approve', holders: ['qal'], text: 'QA Lead อนุมัติ deploy staging' }] });
  const qal = r.people.find((p) => p.role === 'qal');
  assert.equal(qal.state, 'working');
  assert.deepEqual(qal.release, { project: 'taskfolio', phase: 'approve' });
  assert.equal(qal.doing, 'QA Lead อนุมัติ deploy staging');
});

test('T10 R10: the not-enabled line shows only when AGENT_ENABLED is not true', () => {
  assert.equal(idleNotice(false), 'agent ยังไม่เปิดใช้งาน');
  assert.equal(idleNotice(true), null);
});

test('T10 R20: one person of a role has no letter', () => {
  const r = assignPeople({ roster: cfg.roster, roles: cfg.roles, projects: cfg.projects, issues: [] });
  assert.deepEqual(r.people.map((p) => p.tag), ['Head', 'PO', 'BA', 'Dev - A', 'Dev - B', 'Dev - C', 'QA', 'Tech Lead - A', 'Tech Lead - B', 'QA Lead']);
});

// ---------- T11: summary, cap, tags, project counts (R9, R16, R30, R33, E4) ----------

test('T11 R16: summary counts the people states', () => {
  const people = [{ state: 'working' }, { state: 'sweeping' }, { state: 'waiting' }, { state: 'blocked' }, { state: 'idle' }, { state: 'idle' }];
  const s = summary(people);
  assert.deepEqual({ ...s, text: undefined }, { working: 2, waiting: 1, blocked: 1, idle: 2, text: undefined });
  assert.equal(s.text, 'ทำงาน 2 · รอเจ้าของ 1 · ติด 1 · พัก 2');
});

test('T11 R33 R10: cap line from a fixture, and the idle line', () => {
  const issues = [issue(1, 'building', 10), issue(2, 'building', 10), issue(3, 'queued', 10), issue(4, 'ready', 10)];
  const c = capLine(issues, cfg.buildLimit);
  assert.equal(c.text, 'เขียนโค้ดพร้อมกัน 2/3 · รอคิว 1 · ทั้งหมด 4 ใบ');
  assert.equal(c.full, false);
  assert.equal(capLine([], 3).text, 'เขียนโค้ดพร้อมกัน 0/3 · รอคิว 0 · ทั้งหมด 0 ใบ');
  assert.equal(capLine([issue(1, 'building', 1), issue(2, 'building', 1), issue(3, 'building', 1)], 3).full, true);
});

test('T11 R9: an [Improvement] title is tagged and a plain title is not', () => {
  assert.equal(isImprovement('[Improvement] Faster admin list'), true);
  assert.equal(isImprovement('Admin list is slow'), false);
  assert.equal(isImprovement('Fix [Improvement] later'), false);
});

test('T11 R30 E4: project counts; OLS (mac-snapshot) is null until its data arrived (ols-real E4)', () => {
  const issues = [issue(1, 'building', 10), issue(2, 'queued', 10)];
  assert.deepEqual(projectCounts(cfg.projects, issues), [
    { id: 'taskfolio', count: 2, source: 'github-labels' },
    { id: 'ols', count: null, source: 'mac-snapshot' },
  ]);
  const withOls = [...issues, { ...issue(12, 'test-planning', 11), project: 'ols' }];
  assert.deepEqual(projectCounts(cfg.projects, withOls, new Set(['ols']))[1], { id: 'ols', count: 1, source: 'mac-snapshot' });
  const none = [{ id: 'x', source: { kind: 'none' } }];
  assert.deepEqual(projectCounts(none, [], new Set(['x'])), [{ id: 'x', count: null, source: 'none' }]);
});

test('T11 R31: issue keys follow the project key format', () => {
  assert.equal(issueKey(cfg.projects, 'taskfolio', 501), '#501');
  assert.equal(issueKey(cfg.projects, 'ols', 9), 'OLS-9');
});
