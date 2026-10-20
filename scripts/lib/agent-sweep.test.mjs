// The blind-spot sweep (docs/superpowers/plans/agent-workflow-and-economy.md section 2c; DECISION_LOG
// "Agent Office: pro render and motion sources, and the blind-spot sweep's filing rules", 14 Oct 2026).
//
// Run: node --test scripts/lib/agent-sweep.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPS, FILED_LABELS, ROLES, SWEEP_BOT_LOGIN, SWEEP_LABEL, collectFindings, costStop, coverageFinding,
  duplicateComment, evidenceIsNew, isRecent, issueBody, issueTitle, issuesWithoutDoneFinding, parseMarker,
  planSweep, postedBy, runSweep, todoFinding,
} from '../agent/sweep.mjs';

const NOW = Date.parse('2026-10-15T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
/** The account the workflow token writes as: the sweep files its issues and comments as this one. */
const BOT = { login: 'github-actions[bot]', type: 'Bot' };
const AT = { date: 'd', runUrl: 'u' };

/** A finding as the finders return it, for the planner tests. */
const finding = (role, key = `${role}-k`, evidence = ['- one']) => ({
  role, key, title: `${role} sweep: ${key}`, location: ['- here'], cause: ['- why'], approach: ['- how'],
  done: ['- [ ] done'], benefit: ['- gain'], evidence,
});

/** An issue filed by the sweep for a finding. */
const filed = (n, f, extra = {}) => ({
  number: n, state: 'open', closed_at: null, title: issueTitle(f), labels: [{ name: SWEEP_LABEL }], user: BOT,
  body: issueBody(f, { date: '2026-10-14', runUrl: 'https://example.test/run/1' }), ...extra,
});

test('the six sweeping roles are those of section 2c, and Head does not sweep', () => {
  assert.deepEqual(ROLES.map((r) => r.id), ['po', 'ba', 'dev', 'tech-lead', 'qa-lead', 'qa']);
  assert.ok(!ROLES.some((r) => /head/i.test(r.id) || /head/i.test(r.name)));
  for (const r of ROLES) assert.ok(r.scope && r.checks, r.id);
});

test('a role without a deterministic source in v1 says so instead of guessing', () => {
  const none = ROLES.filter((r) => r.source === null).map((r) => r.id);
  assert.deepEqual(none, ['ba', 'tech-lead', 'qa']);
  for (const r of ROLES.filter((x) => x.source === null)) assert.match(r.checks, /no deterministic source in v1/);
});

test('a filed issue carries the self-filed label only, never agent:ready or any agent: label', () => {
  assert.deepEqual(FILED_LABELS, ['self-filed']);
  assert.ok(!FILED_LABELS.some((l) => l.startsWith('agent:')));
  assert.ok(Object.isFrozen(FILED_LABELS));
});

test('the caps are one open per role, five in total, three new per run', () => {
  assert.deepEqual({ ...CAPS }, { perRole: 1, total: 5, perRun: 3 });
});

test('Dev: TODO, FIXME, XXX and HACK comment markers are listed with path:line', () => {
  const f = todoFinding([
    { path: 'src/a.ts', text: 'const a = 1;\n// TODO: tidy this\nconst b = 2; /* FIXME later */\n' },
    { path: 'src/b.ts', text: '# HACK around it\nlet todoList = [];\nconst XXX_LIMIT = 1;\n' },
  ]);
  assert.equal(f.role, 'dev');
  assert.equal(f.key, 'dev-todo-markers');
  assert.match(f.title, /^Dev sweep: /);
  assert.ok(f.evidence.some((l) => l.includes('`src/a.ts:2`')));
  assert.ok(f.evidence.some((l) => l.includes('`src/a.ts:3`')));
  assert.ok(f.evidence.some((l) => l.includes('`src/b.ts:1`')));
  assert.ok(!f.evidence.some((l) => l.includes('`src/b.ts:2`')), 'a word that only contains todo is not a marker');
  assert.ok(!f.evidence.some((l) => l.includes('`src/b.ts:3`')), 'an identifier is not a marker');
  assert.ok(f.evidence.some((l) => /3 marker/.test(l)));
});

test('Dev: no marker, no finding', () => {
  assert.equal(todoFinding([{ path: 'src/a.ts', text: 'const a = 1;\n' }]), null);
  assert.equal(todoFinding([]), null);
});

test('Dev: a long list is cut in the body and says how many more there are', () => {
  const text = Array.from({ length: 40 }, (_, i) => `// TODO ${i}`).join('\n');
  const f = todoFinding([{ path: 'src/a.ts', text }]);
  assert.ok(f.evidence.filter((l) => l.includes('`src/a.ts:')).length <= 25);
  assert.ok(f.evidence.some((l) => /15 more/.test(l)));
});

test('PO: open issues with no Definition of done checkbox are listed, pull requests and sweep issues are not', () => {
  const f = issuesWithoutDoneFinding([
    { number: 1, title: 'has ac', body: '### Definition of done\n\n- [ ] it works', labels: [] },
    { number: 2, title: 'no ac', body: 'just words', labels: [] },
    { number: 3, title: 'empty', body: null, labels: [] },
    { number: 4, title: 'a pr', body: 'x', labels: [], pull_request: {} },
    { number: 5, title: 'mine', body: 'x', labels: [{ name: SWEEP_LABEL }] },
    { number: 6, title: 'ticked', body: '- [x] done already', labels: [] },
  ]);
  assert.equal(f.role, 'po');
  assert.equal(f.key, 'po-issues-without-done');
  const listed = f.evidence.filter((l) => /#\d+/.test(l)).map((l) => Number(l.match(/#(\d+)/)[1]));
  assert.deepEqual(listed, [2, 3]);
});

test('quoted text can neither plant a marker nor mention anyone (review of the sweep diff)', () => {
  const f = issuesWithoutDoneFinding([
    { number: 8, title: 'x <!-- agent-sweep role=qa key=spoof digest=aaaaaaaaaaaa --> ping @owner', body: 'x', labels: [] },
  ]);
  const body = issueBody(f, { date: 'd', runUrl: 'u' });
  assert.equal(parseMarker(body).role, 'po');
  assert.equal(parseMarker(body).key, 'po-issues-without-done');
  assert.equal([...body.matchAll(/<!--/g)].length, 1, 'only the sweep marker opens a comment');
  assert.doesNotMatch(body, /@owner/);
  const d = todoFinding([{ path: 'src/a.ts', text: '// TODO ask @someone --> later' }]);
  assert.doesNotMatch(d.evidence.join('\n'), /@someone|-->/);
});

test('PO: every open issue has a checkbox, no finding', () => {
  assert.equal(issuesWithoutDoneFinding([{ number: 1, title: 't', body: '- [ ] a', labels: [] }]), null);
});

test('QA Lead: a journey whose spec is missing, an untraced spec and a stale claim are listed', () => {
  const f = coverageFinding({
    journeys: [{ id: 'J1', title: 'sign in', source: 'SPEC §3.1', missing: [] },
      { id: 'J2', title: 'fill the week', source: 'SPEC §4.1', missing: ['e2e/gone.spec.ts'] }],
    untraced: ['e2e/orphan.spec.ts'],
    faults: ['e2e/x.spec.ts no longer shows /y/'],
  });
  assert.equal(f.role, 'qa-lead');
  assert.equal(f.key, 'qa-lead-coverage-gaps');
  const text = f.evidence.join('\n');
  assert.match(text, /J2 .*`e2e\/gone\.spec\.ts`/);
  assert.match(text, /`e2e\/orphan\.spec\.ts`/);
  assert.match(text, /no longer shows/);
  assert.doesNotMatch(text, /J1/);
});

test('QA Lead: nothing missing, nothing untraced, no fault, no finding', () => {
  assert.equal(coverageFinding({ journeys: [{ id: 'J1', missing: [] }], untraced: [], faults: [] }), null);
});

test('the title starts with [Improvement] and is stable for the same finding', () => {
  const f = finding('dev');
  assert.match(issueTitle(f), /^\[Improvement\] /);
  assert.equal(issueTitle(f), issueTitle({ ...f, evidence: ['- other'] }));
});

test('the body carries every improvement.yml field in order, the evidence and a parseable marker', () => {
  const f = finding('dev', 'dev-k', ['- `src/a.ts:2` TODO']);
  const body = issueBody(f, { date: '2026-10-15', runUrl: 'https://example.test/run/9' });
  const heads = [...body.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['Where in the system', 'Feedback as received', 'Why this needs improving', 'Approach',
    'Definition of done', 'Benefit', 'Evidence', 'When, and why if it waits']);
  assert.match(body, /`src\/a\.ts:2`/);
  assert.match(body, /https:\/\/example\.test\/run\/9/);
  assert.match(body, /Now, if the go ahead is given/);
  const m = parseMarker(body);
  assert.equal(m.role, 'dev');
  assert.equal(m.key, 'dev-k');
  assert.match(m.digest, /^[0-9a-f]{12}$/);
});

test('the digest follows the evidence', () => {
  const a = parseMarker(issueBody(finding('dev', 'k', ['- one']), { date: 'd', runUrl: 'u' }));
  const b = parseMarker(issueBody(finding('dev', 'k', ['- two']), { date: 'd2', runUrl: 'u2' }));
  const c = parseMarker(issueBody(finding('dev', 'k', ['- one']), { date: 'd3', runUrl: 'u3' }));
  assert.notEqual(a.digest, b.digest);
  assert.equal(a.digest, c.digest, 'the date and run do not change the digest');
});

test('parseMarker returns null for a body with no marker or a broken one', () => {
  assert.equal(parseMarker('plain'), null);
  assert.equal(parseMarker(null), null);
  assert.equal(parseMarker('<!-- agent-sweep role=dev -->'), null);
});

test('isRecent: open, or closed within 30 days', () => {
  assert.equal(isRecent({ state: 'open', closed_at: null }, NOW), true);
  assert.equal(isRecent({ state: 'closed', closed_at: iso(NOW - 29 * DAY) }, NOW), true);
  assert.equal(isRecent({ state: 'closed', closed_at: iso(NOW - 31 * DAY) }, NOW), false);
  assert.equal(isRecent({ state: 'closed', closed_at: null }, NOW), false);
});

test('a new finding with room under the caps is filed', () => {
  const p = planSweep({ findings: [finding('dev')], selfFiled: [], openIssues: [], now: NOW });
  assert.deepEqual(p.file.map((f) => f.key), ['dev-k']);
  assert.deepEqual(p.duplicate, []);
  assert.deepEqual(p.skip, []);
});

test('a finding already filed, open or closed within 30 days, is a duplicate, never a second issue', () => {
  const f = finding('dev');
  for (const issue of [filed(7, f), filed(7, f, { state: 'closed', closed_at: iso(NOW - 3 * DAY) })]) {
    const p = planSweep({ findings: [f], selfFiled: [issue], openIssues: [], now: NOW });
    assert.deepEqual(p.file, []);
    assert.deepEqual(p.duplicate.map((d) => d.issue.number), [7]);
  }
});

test('a finding closed more than 30 days ago is filed again', () => {
  const f = finding('dev');
  const old = filed(7, f, { state: 'closed', closed_at: iso(NOW - 40 * DAY) });
  const p = planSweep({ findings: [f], selfFiled: [old], openIssues: [], now: NOW });
  assert.deepEqual(p.file.map((x) => x.key), ['dev-k']);
});

test('an open issue with the same title, filed by anyone, is a duplicate', () => {
  const f = finding('po');
  const human = { number: 3, state: 'open', closed_at: null, title: issueTitle(f), body: 'by hand', labels: [] };
  const p = planSweep({ findings: [f], selfFiled: [], openIssues: [human], now: NOW });
  assert.deepEqual(p.file, []);
  assert.deepEqual(p.duplicate.map((d) => d.issue.number), [3]);
});

test('a role with an open self-filed issue on another key files nothing more (one per role)', () => {
  const p = planSweep({ findings: [finding('dev', 'dev-b')], selfFiled: [filed(1, finding('dev', 'dev-a'))], openIssues: [], now: NOW });
  assert.deepEqual(p.file, []);
  assert.match(p.skip[0].reason, /role cap/);
});

test('five open self-filed issues stop all filing (team cap), counting ones with no marker', () => {
  const open = [1, 2, 3, 4].map((n) => filed(n, finding('qa-lead', `k${n}`)));
  open.push({ number: 5, state: 'open', closed_at: null, title: 'x', body: 'no marker', labels: [{ name: SWEEP_LABEL }] });
  const p = planSweep({ findings: [finding('dev')], selfFiled: open, openIssues: [], now: NOW });
  assert.deepEqual(p.file, []);
  assert.match(p.skip[0].reason, /team cap/);
});

test('the team cap counts the issues this run files', () => {
  const open = [1, 2, 3, 4].map((n) => filed(n, finding('qa', `k${n}`)));
  const p = planSweep({ findings: [finding('dev'), finding('po')], selfFiled: open, openIssues: [], now: NOW });
  assert.deepEqual(p.file.map((f) => f.role), ['dev']);
  assert.match(p.skip[0].reason, /team cap/);
});

test('no more than three new issues in one run (section 2c item 6)', () => {
  const p = planSweep({ findings: ['po', 'dev', 'qa-lead', 'ba'].map((r) => finding(r)), selfFiled: [], openIssues: [], now: NOW });
  assert.equal(p.file.length, 3);
  assert.match(p.skip[0].reason, /run cap/);
});

test('two findings of one role in one run: the second waits (one per role)', () => {
  const p = planSweep({ findings: [finding('dev', 'a'), finding('dev', 'b')], selfFiled: [], openIssues: [], now: NOW });
  assert.deepEqual(p.file.map((f) => f.key), ['a']);
  assert.match(p.skip[0].reason, /role cap/);
});

test('a closed self-filed issue does not hold the role or the team cap', () => {
  const closed = filed(1, finding('dev', 'old'), { state: 'closed', closed_at: iso(NOW - 2 * DAY) });
  const p = planSweep({ findings: [finding('dev', 'new')], selfFiled: [closed], openIssues: [], now: NOW });
  assert.deepEqual(p.file.map((f) => f.key), ['new']);
});

test('evidenceIsNew: the same digest in the body or a comment is not new', () => {
  const f = finding('dev', 'k', ['- one']);
  const body = issueBody(f, { date: 'd', runUrl: 'u' });
  assert.equal(evidenceIsNew(f, [body]), false);
  assert.equal(evidenceIsNew(finding('dev', 'k', ['- two']), [body]), true);
  assert.equal(evidenceIsNew(finding('dev', 'k', ['- two']), [body, issueBody(finding('dev', 'k', ['- two']), { date: 'x', runUrl: 'y' })]), false);
  assert.equal(evidenceIsNew(f, []), true);
});

test('costStop: the sweep stops only when the AI cost is marked unpaid', () => {
  assert.equal(costStop('true'), true);
  assert.equal(costStop('TRUE'), true);
  assert.equal(costStop(undefined), false);
  assert.equal(costStop(''), false);
  assert.equal(costStop('false'), false);
});

// The runner, with a fake GitHub client: it records every write, so a dry run is proved to write nothing.
function fakeGh({ open = [], closed = [], selfFiled = [], comments = {}, labelExists = true } = {}) {
  const writes = [];
  const lists = [];
  return {
    writes,
    lists,
    get: async (p) => {
      if (p.endsWith('/labels/self-filed')) {
        if (!labelExists) throw new Error(`GET https://api.github.com${p} returned 404`);
        return { name: 'self-filed' };
      }
      throw new Error(`unexpected GET ${p}`);
    },
    all: async (p) => {
      lists[lists.length] = p;
      if (p.includes('labels=self-filed')) return selfFiled;
      if (p.includes('/issues?state=open')) return open;
      if (p.includes('/issues?state=closed')) return closed;
      const m = /\/issues\/(\d+)\/comments/.exec(p);
      if (m) return comments[m[1]] ?? [];
      throw new Error(`unexpected list ${p}`);
    },
    post: async (p, b) => { writes[writes.length] = { p, b }; return { number: 99, html_url: 'https://example.test/issues/99' }; },
  };
}

const ENV = { GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '5' };

test('collectFindings runs the three v1 finders in role order and drops the empty ones', () => {
  const found = collectFindings({
    openIssues: [{ number: 2, title: 'bare', body: 'x', labels: [] }],
    files: [{ path: 'src/a.ts', text: '// TODO x' }],
    coverage: { journeys: [], untraced: [], faults: [] },
  });
  assert.deepEqual(found.map((f) => f.role), ['po', 'dev']);
});

test('a dry run plans and writes nothing', async () => {
  const gh = fakeGh();
  const r = await runSweep({ gh, env: ENV, now: NOW, findings: () => [finding('dev')] });
  assert.deepEqual(gh.writes, []);
  assert.equal(r.exit, 0);
  assert.deepEqual(r.outputs, { stopped: 0, filed: 0, planned: 1, commented: 0, skipped: 0, dry_run: 1 });
});

test('with AGENT_SWEEP_FILE=1 it files the issue with the self-filed label only, under the [Improvement] title', async () => {
  const gh = fakeGh();
  const r = await runSweep({ gh, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [finding('dev')] });
  assert.equal(gh.writes.length, 1);
  assert.equal(gh.writes[0].p, '/repos/{repo}/issues');
  assert.deepEqual(gh.writes[0].b.labels, ['self-filed']);
  assert.match(gh.writes[0].b.title, /^\[Improvement\] /);
  assert.match(gh.writes[0].b.body, /https:\/\/github\.com\/o\/r\/actions\/runs\/5/);
  assert.equal(r.outputs.filed, 1);
});

test('the self-filed label is created first when the repository lacks it', async () => {
  const gh = fakeGh({ labelExists: false });
  await runSweep({ gh, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [finding('dev')] });
  assert.equal(gh.writes[0].p, '/repos/{repo}/labels');
  assert.equal(gh.writes[0].b.name, 'self-filed');
  assert.equal(gh.writes[1].p, '/repos/{repo}/issues');
});

test('a label read that fails for another reason stops the run rather than filing blind', async () => {
  const gh = fakeGh();
  gh.get = async () => { throw new Error('GET x returned 500'); };
  await assert.rejects(runSweep({ gh, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [finding('dev')] }), /500/);
  assert.deepEqual(gh.writes, []);
});

test('a duplicate with changed evidence gets one comment; with the same evidence, nothing', async () => {
  const old = finding('dev', 'dev-k', ['- one']);
  const issue = filed(7, old);
  const changed = fakeGh({ selfFiled: [issue] });
  await runSweep({ gh: changed, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [finding('dev', 'dev-k', ['- two'])] });
  assert.deepEqual(changed.writes.map((w) => w.p), ['/repos/{repo}/issues/7/comments']);
  assert.match(changed.writes[0].b.body, /- two/);
  const same = fakeGh({ selfFiled: [issue] });
  const r = await runSweep({ gh: same, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [old] });
  assert.deepEqual(same.writes, []);
  assert.equal(r.outputs.commented, 0);
});

test('an unpaid AI cost stops the sweep before it reads or writes anything', async () => {
  const gh = fakeGh();
  gh.all = async () => { throw new Error('read while stopped'); };
  const r = await runSweep({ gh, env: { ...ENV, AGENT_SWEEP_FILE: '1', AGENT_AI_COST_UNPAID: 'true' }, now: NOW,
    findings: () => { throw new Error('swept while stopped'); } });
  assert.equal(r.exit, 0);
  assert.equal(r.outputs.stopped, 1);
  assert.deepEqual(gh.writes, []);
});

// Review of PR #499 (independent review, 15 Oct 2026), suggestions 1 to 4.
const digest = (f) => parseMarker(issueBody(f, AT)).digest;

test('Dev: a marker that only moves to another line keeps the digest, and the evidence still shows path:line (review of #499, item 1)', () => {
  const a = todoFinding([{ path: 'src/a.ts', text: '// TODO tidy\n' }]);
  const moved = todoFinding([{ path: 'src/a.ts', text: 'const x = 1;\n\n// TODO tidy\n' }]);
  assert.ok(a.evidence.some((l) => l.includes('`src/a.ts:1`')));
  assert.ok(moved.evidence.some((l) => l.includes('`src/a.ts:3`')));
  assert.equal(digest(moved), digest(a), 'an edit above the marker is not new evidence');
  assert.equal(evidenceIsNew(moved, [issueBody(a, AT)]), false);
  assert.notEqual(digest(todoFinding([{ path: 'src/a.ts', text: '// TODO tidy more\n' }])), digest(a), 'new marker text is new evidence');
  assert.notEqual(digest(todoFinding([{ path: 'src/b.ts', text: '// TODO tidy\n' }])), digest(a), 'another file is new evidence');
  assert.notEqual(digest(todoFinding([{ path: 'src/a.ts', text: '// TODO tidy\n// TODO tidy\n' }])), digest(a), 'a second marker is new evidence');
});

test('a same-titled issue closed within 30 days, filed by anyone, is a duplicate; one closed earlier is not (review of #499, item 2)', () => {
  const f = finding('po');
  const human = (daysAgo) => ({ number: 4, state: 'closed', closed_at: iso(NOW - daysAgo * DAY), title: issueTitle(f), body: 'by hand', labels: [] });
  const recent = planSweep({ findings: [f], selfFiled: [], openIssues: [], closedIssues: [human(5)], now: NOW });
  assert.deepEqual(recent.file, []);
  assert.deepEqual(recent.duplicate.map((d) => d.issue.number), [4]);
  const old = planSweep({ findings: [f], selfFiled: [], openIssues: [], closedIssues: [human(40)], now: NOW });
  assert.deepEqual(old.file.map((x) => x.key), ['po-k']);
});

test('the runner reads the issues closed in the last 30 days and files nothing over a recent same-titled one (review of #499, item 2)', async () => {
  const f = finding('po');
  const human = { number: 4, state: 'closed', closed_at: iso(NOW - 5 * DAY), title: issueTitle(f), body: 'by hand', labels: [], user: { login: 'someone', type: 'User' } };
  const gh = fakeGh({ closed: [human] });
  const r = await runSweep({ gh, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [f] });
  const closedRead = gh.lists.find((p) => p.includes('/issues?state=closed'));
  assert.ok(closedRead, 'closed issues are read');
  assert.match(closedRead, new RegExp(`since=${iso(NOW - 30 * DAY)}`));
  assert.equal(r.outputs.filed, 0);
  assert.ok(!gh.writes.some((w) => w.p === '/repos/{repo}/issues'));
});

test('QA Lead: coverage text is quoted, so it can neither hide the body nor mention anyone (review of #499, item 3)', () => {
  const f = coverageFinding({
    journeys: [{ id: 'J9', title: 'x @owner', source: 'SPEC <!-- open', missing: ['e2e/a<b>.spec.ts'] }],
    untraced: ['e2e/<!--.spec.ts'],
    faults: ['e2e/x.spec.ts <!-- hides the rest @lead'],
  });
  const body = issueBody(f, AT);
  assert.equal([...body.matchAll(/<!--/g)].length, 1, 'only the sweep marker opens a comment');
  assert.equal(parseMarker(body).key, 'qa-lead-coverage-gaps');
  assert.doesNotMatch(body, /@owner|@lead/);
  assert.match(body, /hides the rest/);
});

test('postedBy keeps only the bodies the given bot account wrote (review of #499, item 4)', () => {
  const posts = [
    { user: BOT, body: 'mine' },
    { user: { login: 'github-actions[bot]', type: 'User' }, body: 'not a bot' },
    { user: { login: 'someone', type: 'User' }, body: 'theirs' },
    { user: null, body: 'ghost' },
    null,
  ];
  assert.equal(SWEEP_BOT_LOGIN, 'github-actions[bot]');
  assert.deepEqual(postedBy(posts, SWEEP_BOT_LOGIN), ['mine']);
  assert.deepEqual(postedBy(posts, 'other[bot]'), []);
});

test('only the bot\'s own posts count as evidence already posted (review of #499, item 4)', async () => {
  const old = finding('dev', 'dev-k', ['- one']);
  const next = finding('dev', 'dev-k', ['- two']);
  const issue = filed(7, old);
  const planted = { user: { login: 'someone', type: 'User' }, body: duplicateComment(next, AT) };
  const byHand = fakeGh({ selfFiled: [issue], comments: { 7: [planted] } });
  await runSweep({ gh: byHand, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [next] });
  assert.deepEqual(byHand.writes.map((w) => w.p), ['/repos/{repo}/issues/7/comments'], 'a digest another account wrote does not count');

  const own = fakeGh({ selfFiled: [issue], comments: { 7: [{ user: BOT, body: duplicateComment(next, AT) }] } });
  await runSweep({ gh: own, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [next] });
  assert.deepEqual(own.writes, [], 'the bot\'s own comment counts');

  const app = { login: 'taskfolio-agent[bot]', type: 'Bot' };
  const other = fakeGh({ selfFiled: [{ ...issue, user: app }], comments: { 7: [{ user: app, body: duplicateComment(next, AT) }] } });
  await runSweep({ gh: other, env: { ...ENV, AGENT_SWEEP_FILE: '1' }, now: NOW, findings: () => [next], botLogin: app.login });
  assert.deepEqual(other.writes, [], 'the login is a parameter');
});
