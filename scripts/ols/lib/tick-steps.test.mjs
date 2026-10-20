// T21 to T24. Spec: docs/sdd/ols-real/spec.md R21, R22, R23, R24; docs/sdd/ols-retest-procedure/spec.md R5, R6, R9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createSlack, markupProblem } from './slack.mjs';
import { makeSay, applyNotice, failureNotice, collectStep, sendStep } from './tick-steps.mjs';

const MARKUP = 'ผิด || ตาราง a\\\\b !shot.png!';
const now = () => '2026-10-20T03:00:00.000Z';
const jobDir = (j) => `/jobs/${j.id}`;

/** A Slack API double: chat.postMessage stores, conversations.replies returns what was stored. */
function fakeSlack({ repliesFailOnce = false, onReplies = () => {} } = {}) {
  const posts = [];
  let n = 0;
  let failed = false;
  const fetch = async (url, init) => {
    const method = new URL(url).pathname.split('/').pop();
    if (method === 'chat.postMessage') {
      const p = JSON.parse(init.body);
      n += 1;
      const ts = `1792100${String(n).padStart(3, '0')}.0`;
      posts.push({ ...p, ts });
      return { json: async () => ({ ok: true, ts }) };
    }
    if (method === 'conversations.replies') {
      onReplies();
      if (repliesFailOnce && !failed) {
        failed = true;
        return { json: async () => ({ ok: false, error: 'ratelimited' }) };
      }
      return { json: async () => ({ ok: true, messages: posts.map((p) => ({ user: 'B', text: p.text, ts: p.ts })) }) };
    }
    throw new Error(`unexpected ${method}`);
  };
  return { slack: createSlack({ token: 'x', fetch }), posts };
}

const fsOf = (files) => ({
  readFileSync: (p) => {
    if (!(p in files)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    return files[p];
  },
});

test('R21: a failure notice whose error carries Jira markup is posted, and the next job is still noticed', async () => {
  const { slack, posts } = fakeSlack();
  const threads = {};
  const jobs = [
    { id: 'OLS-1:test', key: 'OLS-1', duty: 'test', phase: 'failed', error: `action 1 (${MARKUP}) is not allowed for test` },
    { id: 'OLS-2:test', key: 'OLS-2', duty: 'test', phase: 'failed', error: 'no draft.md' },
  ];
  await sendStep({ jobs, jobDir, fs: fsOf({}), say: makeSay({ slack, threads }), threads, record: async () => {}, now });
  assert.equal(posts.length, 2);
  assert.ok(jobs.every((j) => j.noticed === true));
  for (const p of posts) assert.equal(markupProblem(p.text), null, p.text);
  assert.match(posts[0].text, /^\[OLS-1\] งานหยุดครับ: action 1/);
  assert.equal(markupProblem(failureNotice(jobs[0])), null);
});

test('R21: an apply result whose error and lines carry Jira markup is posted', async () => {
  const { slack, posts } = fakeSlack();
  const threads = { 'OLS-3': '1792000000.0' };
  const say = makeSay({ slack, threads });
  const j = { id: 'OLS-3:retest', key: 'OLS-3' };
  await say(j, applyNotice({ ok: false, error: `read-back: ${MARKUP}`, lines: [`คำสั่งจากเจ้าของ: ${MARKUP}`] }));
  await say(j, applyNotice({ ok: true, lines: [`เปลี่ยนสถานะเป็น ${MARKUP} แล้ว`] }));
  assert.equal(posts.length, 2);
  for (const p of posts) assert.equal(markupProblem(p.text), null, p.text);
  assert.match(posts[0].text, /^ทำตามที่อนุมัติไม่ครบครับ: read-back: ผิด/);
});

test('R21: the guard still refuses a draft that carries Jira markup', async () => {
  const { slack } = fakeSlack();
  await assert.rejects(slack.post(`ร่าง ${MARKUP}`, undefined, {}), /Jira wiki markup/);
});

test('R22: a read-back that throws once leaves the draft recorded as sent, and the next pass posts nothing', async () => {
  const files = { [join('/jobs/OLS-4:review-tc', 'draft.md')]: 'ร่าง', [join('/jobs/OLS-4:review-tc', 'actions.json')]: '[]' };
  const jobs = [{ id: 'OLS-4:review-tc', key: 'OLS-4', duty: 'review-tc', phase: 'ready' }];
  let saved = null;
  let atReadBack = null;
  const { slack, posts } = fakeSlack({ repliesFailOnce: true, onReplies: () => { atReadBack = saved; } });
  const threads = {};
  const record = async () => { saved = JSON.parse(JSON.stringify(jobs)); };
  const say = makeSay({ slack, threads });
  await sendStep({ jobs, jobDir, fs: fsOf(files), say, threads, record, now });
  assert.equal(atReadBack?.[0]?.phase, 'draft-sent', 'the post is saved before the read-back');
  assert.equal(saved[0].phase, 'draft-sent');
  assert.equal(saved[0].draftTs, posts[0].ts);
  assert.equal(saved[0].readBacks.at(-1).ok, false);
  assert.match(saved[0].readBacks.at(-1).error, /ratelimited/);
  await sendStep({ jobs, jobDir, fs: fsOf(files), say, threads, record, now });
  assert.equal(posts.length, 1, 'never posted again');
});

test('R22: a failure notice is recorded as noticed before its read-back', async () => {
  const jobs = [{ id: 'OLS-5:test', key: 'OLS-5', duty: 'test', phase: 'failed', error: 'x' }];
  let saved = null;
  let atReadBack = null;
  const { slack, posts } = fakeSlack({ repliesFailOnce: true, onReplies: () => { atReadBack = saved; } });
  const threads = {};
  const record = async () => { saved = JSON.parse(JSON.stringify(jobs)); };
  await sendStep({ jobs, jobDir, fs: fsOf({}), say: makeSay({ slack, threads }), threads, record, now });
  assert.equal(atReadBack?.[0]?.noticed, true);
  await sendStep({ jobs, jobDir, fs: fsOf({}), say: makeSay({ slack, threads }), threads, record, now });
  assert.equal(posts.length, 1);
});

test('R23: a crash after the review order is written leaves the saved job on review, and the next collect does not fail it', async () => {
  const dir = '/jobs/e2e:MLV-1';
  const files = { [join(dir, 'work.done.json')]: '{"ok":true}', [join(dir, 'draft.md')]: 'แก้แล้ว', [join(dir, 'actions.json')]: '[]' };
  const fs = fsOf(files);
  const startedAt = '2026-10-20T02:00:00.000Z';
  const jobs = [
    { id: 'e2e:MLV-1', key: 'MLV-1', kind: 'e2e', duty: 'e2e-fix', phase: 'running', stage: 'work', startedAt },
    { id: 'e2e:MLV-2', key: 'MLV-2', kind: 'e2e', duty: 'e2e-fix', phase: 'running', stage: 'work', startedAt },
  ];
  let saved = null;
  const record = async () => { saved = JSON.parse(JSON.stringify(jobs)); };
  // what tick.mjs writeOrder does to the folder and the job (runner.mjs stageFiles)
  const writeOrder = (j, stage) => {
    for (const f of ['draft.md', 'actions.json']) { files[join(dir, `work-${f}`)] = files[join(dir, f)]; delete files[join(dir, f)]; }
    delete files[join(dir, 'review.done.json')];
    Object.assign(j, { stage, phase: 'review', startedAt: now() });
  };
  const crashing = (j) => { if (j.id === 'e2e:MLV-2') throw new Error('crash'); return jobDir(j); };
  await assert.rejects(collectStep({ jobs, jobDir: crashing, fs, now, writeOrder, record }), /crash/);
  assert.equal(saved?.[0]?.phase, 'review');
  assert.equal(saved[0].stage, 'review');
  const again = saved;
  await collectStep({ jobs: again, jobDir, fs, now, writeOrder: () => assert.fail('no new order'), record });
  assert.equal(again[0].phase, 'review', 'still waiting for the review done file');
  assert.equal(again[0].error ?? null, null);
});

test('R24: a draft whose comment body carries Jira markup fails at collect, with a reason that can be posted', async () => {
  const dir = '/jobs/OLS-6:write-tc';
  const files = {
    [join(dir, 'work.done.json')]: '{"ok":true}',
    [join(dir, 'draft.md')]: 'ร่าง 5 เคส',
    [join(dir, 'actions.json')]: JSON.stringify([{ type: 'jira.comment', body: `ผล ${MARKUP}` }]),
  };
  const jobs = [{ id: 'OLS-6:write-tc', key: 'OLS-6', duty: 'write-tc', phase: 'running', stage: 'work', startedAt: '2026-10-20T02:00:00.000Z' }];
  await collectStep({ jobs, jobDir, fs: fsOf(files), now, writeOrder: () => {}, record: async () => {} });
  assert.equal(jobs[0].phase, 'failed');
  assert.match(jobs[0].error, /Jira wiki markup/);
  assert.equal(markupProblem(failureNotice(jobs[0])), null);
});
