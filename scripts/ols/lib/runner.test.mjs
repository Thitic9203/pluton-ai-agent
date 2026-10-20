// T4, T12. Spec: docs/sdd/ols-real/spec.md R4, R5, R11, R12, R18, R19, E2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, AGENT, RUN_LIMIT_MS, buildOrder, readOutput, readDone, collect, stageFiles, rerunResult } from './runner.mjs';

const paths = { jobDir: '/tmp/jobs/OLS-12-retest', olsQaDir: '/Users/x/GitHub/ols-qa', e2eDir: '/Users/x/GitHub/ols-qa-e2e' };
const ticketJob = (o = {}) => ({ id: 'OLS-12:retest', key: 'OLS-12', duty: 'retest', kind: 'ticket', ...o });
const e2eJob = { id: 'e2e:MLV-008', key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e' };
const fsOf = (files) => ({ readFileSync: (p) => { if (!(p in files)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' }); return files[p]; } });

test('R4, R5: each duty and stage runs its ols-qa skill', () => {
  assert.deepEqual(SKILLS, {
    'write-tc': { work: ['tc-fe-prep-workflow', 'tc-api-prep-workflow'] },
    'review-tc': { work: ['tc-review-workflow'] },
    test: { work: ['testing-ticket-workflow'], review: ['review-result-workflow'] },
    retest: { work: ['retest-bug-workflow'] },
    'e2e-fix': { work: ['playwright-best-practices', 'flaky-test-doctor'], review: ['code-review'] },
  });
});

test('R4: a duty becomes a work order for the ols-qa-worker agent, from ols-qa, with no claude command and no credential path', () => {
  const o = buildOrder({ job: ticketJob(), stage: 'work', ...paths });
  assert.equal(AGENT, 'ols-qa-worker');
  assert.deepEqual(Object.keys(o).sort(), ['agent', 'cwd', 'id', 'jobDir', 'prompt', 'stage', 'writes']);
  assert.deepEqual([o.id, o.stage, o.agent, o.cwd, o.jobDir], ['OLS-12:retest', 'work', 'ols-qa-worker', paths.olsQaDir, paths.jobDir]);
  // ols-retest-procedure R2, R3: a retest also writes cases.json
  assert.deepEqual(o.writes, ['draft.md', 'actions.json', 'cases.json']);
  for (const s of ['skills/retest-bug-workflow/SKILL.md', 'ticket.json', 'draft.md', 'actions.json', 'ห้ามเขียน Jira', paths.olsQaDir, 'ห้ามใช้ MCP']) assert.ok(o.prompt.includes(s), s);
  for (const s of ['claude -p', '.jira_token', '.ols-qa-secrets', 'slack.env', 'xoxb']) assert.ok(!o.prompt.includes(s), s);
});

test('R17: the work prompt tells the worker the description, criteria and comments are in ticket.json', () => {
  const o = buildOrder({ job: ticketJob(), stage: 'work', ...paths });
  for (const s of ['description', 'criteria', 'comments']) assert.ok(o.prompt.includes(s), s);
});

test('R8: feedback from the owner is carried into the rework prompt', () => {
  const o = buildOrder({ job: ticketJob({ feedback: 'ขอหลักฐานจอ 375 เพิ่ม' }), stage: 'work', ...paths });
  assert.match(o.prompt, /ขอหลักฐานจอ 375 เพิ่ม/);
});

test('R5: the test review stage is its own order: review-result as QA Lead on the first stage output', () => {
  const o = buildOrder({ job: ticketJob({ id: 'OLS-12:test', duty: 'test' }), stage: 'review', ...paths });
  assert.equal(o.stage, 'review');
  assert.match(o.prompt, /review-result-workflow/);
  assert.match(o.prompt, /QA Lead/);
  assert.match(o.prompt, /คนละตัว/);
  assert.match(o.prompt, /work-draft\.md/);
  assert.match(o.prompt, /work-actions\.json/);
});

test('R5, E2: stageFiles keeps the work output for the review and removes every file the order writes', () => {
  const w = stageFiles('work');
  assert.deepEqual(w.move, []);
  for (const f of ['draft.md', 'actions.json', 'work-draft.md', 'work-actions.json', 'work.done.json', 'review.done.json']) assert.ok(w.remove.includes(f), f);
  const r = stageFiles('review');
  // ols-retest-procedure R2, R3: the cases of the first stage are kept for the review too
  assert.deepEqual(r.move, [['draft.md', 'work-draft.md'], ['actions.json', 'work-actions.json'], ['cases.json', 'work-cases.json']]);
  for (const f of ['draft.md', 'actions.json', 'review.done.json']) assert.ok(r.remove.includes(f), f);
  const rr = stageFiles('rerun', 41);
  assert.deepEqual(rr, { move: [], remove: ['rerun-41.json', 'rerun.done.json'] });
  // whatever an order writes is removed before it goes out
  for (const [stage, job, pr] of [['work', ticketJob(), undefined], ['review', ticketJob({ duty: 'test' }), undefined], ['rerun', e2eJob, 41]]) {
    for (const f of buildOrder({ job, stage, pr, ...paths }).writes) assert.ok(stageFiles(stage, pr).remove.includes(f), `${stage} ${f}`);
  }
});

test('R19, E2: rerunResult reads rerun-<pr>.json, waits, and fails at once on a failed or empty done file', () => {
  const at0 = '2026-10-19T09:00:00.000Z';
  const now = '2026-10-19T09:10:00.000Z';
  const late = '2026-10-19T11:10:00.000Z';
  const f = (files) => fsOf(files);
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({ '/j/rerun-41.json': '{"ok":true,"summary":"3/3"}' }), orderedAt: at0, now }), { ok: true, summary: '3/3' });
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({ '/j/rerun-41.json': 'x' }), orderedAt: at0, now }), { ok: false, summary: 'rerun-41.json is not valid JSON' });
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({}), orderedAt: at0, now }), { pending: true });
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({}), orderedAt: at0, now: late }), { ok: false, summary: 'no rerun-41.json 2 hours after the order' });
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({ '/j/rerun.done.json': '{"ok":false,"error":"VPN down"}' }), orderedAt: at0, now }), { ok: false, summary: 'VPN down' });
  assert.deepEqual(rerunResult({ dir: '/j', pr: 41, fs: f({ '/j/rerun.done.json': '{"ok":true}' }), orderedAt: at0, now }), { ok: false, summary: 'rerun.done.json says ok but rerun-41.json is missing' });
});

test('R11: the e2e prompt triages first, forbids skip, fixme, retries and timeouts, names the branch and the worktree', () => {
  const o = buildOrder({ job: e2eJob, stage: 'work', ...paths });
  assert.equal(o.cwd, paths.e2eDir);
  for (const s of ['agent/e2e-MLV-008', 'git worktree', 'origin/main', 'test.skip', 'test.fixme', 'retries', 'timeout', 'app bug', 'flaky', 'full', 'baseline']) assert.ok(o.prompt.includes(s), s);
  const rv = buildOrder({ job: e2eJob, stage: 'review', ...paths });
  assert.match(rv.prompt, /code-review/);
  assert.match(rv.prompt, /gh pr create/);
});

test('R12, R19: the rerun order names the pull request and writes rerun-<pr>.json; only e2e jobs rerun', () => {
  const o = buildOrder({ job: e2eJob, stage: 'rerun', pr: 41, ...paths });
  assert.deepEqual(o.writes, ['rerun-41.json']);
  for (const s of ['origin/main', 'git worktree', 'MLV-008', 'full', 'dev', 'rerun-41.json', '#41']) assert.ok(o.prompt.includes(s), s);
  assert.throws(() => buildOrder({ job: ticketJob(), stage: 'rerun', pr: 1, ...paths }), /rerun is e2e only/);
  assert.throws(() => buildOrder({ job: e2eJob, stage: 'rerun', ...paths }), /rerun needs a pull request/);
});

test('E2: readOutput needs draft.md and an actions.json array', () => {
  const files = { '/j/draft.md': 'ร่าง', '/j/actions.json': '[{"type":"jira.comment","body":"x"}]' };
  const fs = { readFileSync: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; } };
  assert.deepEqual(readOutput('/j', fs), { ok: true, draft: 'ร่าง', actions: [{ type: 'jira.comment', body: 'x' }] });
  assert.equal(readOutput('/k', fs).ok, false);
  const bad = { readFileSync: (p) => (p.endsWith('draft.md') ? 'x' : '{"not":"array"}') };
  assert.deepEqual(readOutput('/j', bad), { ok: false, error: 'actions.json is not an array' });
});

test('ols-retest-procedure R2, R3: a judging duty must also write cases.json, and a case that breaks the rules fails the run', () => {
  const base = { '/j/draft.md': 'ร่าง', '/j/actions.json': '[]' };
  assert.deepEqual(readOutput('/j', fsOf(base), 'retest'), { ok: false, error: 'no cases.json (R2, R3: a retest lists every case it judged)' });
  assert.deepEqual(readOutput('/j', fsOf({ ...base, '/j/cases.json': '[{"ac":"AC1","status":"failed"}]' }), 'test'), { ok: false, error: 'cases.json: case 1 (AC1) is failed with no quoted source (R3)' });
  assert.deepEqual(readOutput('/j', fsOf({ ...base, '/j/cases.json': 'x' }), 'retest'), { ok: false, error: 'cases.json is not valid JSON' });
  const cases = [{ ac: 'AC1', status: 'passed' }];
  assert.deepEqual(readOutput('/j', fsOf({ ...base, '/j/cases.json': JSON.stringify(cases) }), 'retest'), { ok: true, draft: 'ร่าง', actions: [], cases });
  // the other duties judge no case
  assert.deepEqual(readOutput('/j', fsOf(base), 'write-tc'), { ok: true, draft: 'ร่าง', actions: [] });
  // the order says so, and the file is cleared before each stage and kept for the review
  for (const s of ['cases.json', 'po-question', 'source', 'refusal']) assert.ok(buildOrder({ job: ticketJob(), stage: 'work', ...paths }).prompt.includes(s), s);
  assert.deepEqual(buildOrder({ job: ticketJob(), stage: 'work', ...paths }).writes, ['draft.md', 'actions.json', 'cases.json']);
  assert.ok(!buildOrder({ job: ticketJob({ duty: 'write-tc' }), stage: 'work', ...paths }).prompt.includes('cases.json'));
  assert.ok(stageFiles('work').remove.includes('cases.json') && stageFiles('work').remove.includes('work-cases.json'));
  assert.deepEqual(stageFiles('review').move.at(-1), ['cases.json', 'work-cases.json']);
  assert.match(buildOrder({ job: ticketJob({ duty: 'test' }), stage: 'review', ...paths }).prompt, /work-cases\.json/);
  // collect checks the cases of the job's duty
  const done = { '/j/work.done.json': '{"ok":true}', ...base };
  assert.equal(collect({ job: { stage: 'work', startedAt: started, duty: 'retest' }, dir: '/j', fs: fsOf(done), now: at(1) }).ok, false);
});

const started = '2026-10-19T09:00:00.000Z';
const at = (ms) => new Date(Date.parse(started) + ms).toISOString();

test('R18, E2: readDone reads the stage done file; missing is waiting until 2 hours, then stale', () => {
  assert.equal(RUN_LIMIT_MS, 2 * 60 * 60 * 1000);
  assert.deepEqual(readDone('/j', 'work', fsOf({ '/j/work.done.json': '{"ok":true}' }), { startedAt: started, now: at(60000) }), { state: 'done', ok: true, error: null });
  assert.deepEqual(readDone('/j', 'work', fsOf({ '/j/work.done.json': '{"ok":false,"error":"ols-qa-worker not available"}' }), { startedAt: started, now: at(1) }), { state: 'done', ok: false, error: 'ols-qa-worker not available' });
  assert.deepEqual(readDone('/j', 'work', fsOf({ '/j/work.done.json': 'not json' }), { startedAt: started, now: at(1) }), { state: 'done', ok: false, error: 'work.done.json is not valid JSON' });
  assert.deepEqual(readDone('/j', 'work', fsOf({}), { startedAt: started, now: at(RUN_LIMIT_MS - 1) }), { state: 'waiting' });
  assert.deepEqual(readDone('/j', 'work', fsOf({}), { startedAt: started, now: at(RUN_LIMIT_MS + 1) }), { state: 'stale' });
});

test('R18, E2: collect gives null while waiting, a failure for a failed, stale or empty run, and the output otherwise', () => {
  const job = { stage: 'work', startedAt: started };
  assert.equal(collect({ job, dir: '/j', fs: fsOf({}), now: at(1000) }), null);
  assert.deepEqual(collect({ job, dir: '/j', fs: fsOf({}), now: at(RUN_LIMIT_MS + 1) }), { ok: false, error: 'no work.done.json 2 hours after the order' });
  assert.deepEqual(collect({ job, dir: '/j', fs: fsOf({ '/j/work.done.json': '{"ok":false,"error":"Agent error"}' }), now: at(1) }), { ok: false, error: 'Agent error' });
  assert.deepEqual(collect({ job, dir: '/j', fs: fsOf({ '/j/work.done.json': '{"ok":false}' }), now: at(1) }), { ok: false, error: 'worker reported a failure' });
  assert.equal(collect({ job, dir: '/j', fs: fsOf({ '/j/work.done.json': '{"ok":true}' }), now: at(1) }).ok, false);
  const done = { '/j/work.done.json': '{"ok":true}', '/j/draft.md': 'ร่าง', '/j/actions.json': '[]' };
  assert.deepEqual(collect({ job, dir: '/j', fs: fsOf(done), now: at(1) }), { ok: true, draft: 'ร่าง', actions: [] });
});
