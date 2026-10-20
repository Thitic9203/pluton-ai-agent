// T5. Spec: docs/sdd/ols-real/spec.md R6, E2, E3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, reconcile, pick, afterRun, afterVerdict, afterApply } from './dispatch.mjs';

const NOW = '2026-10-17T03:00:00.000Z';
const t = (n, duty, created = `2026-10-0${n % 9 + 1}T00:00:00.000Z`) => ({ key: `OLS-${n}`, n, summary: `s${n}`, duty, created });

test('R6: the cap is 3 per project', () => assert.equal(CAP, 3));

test('reconcile makes one queued job per ticket duty and per failing e2e case', () => {
  const jobs = reconcile({ jobs: [], tickets: [t(1, 'write-tc'), t(2, null), t(3, 'retest')], failing: [{ id: 'MLV-008', title: 'x', file: 'f', error: 'e' }], now: NOW });
  assert.deepEqual(jobs.map((j) => [j.id, j.phase, j.kind]), [['OLS-1:write-tc', 'queued', 'ticket'], ['OLS-3:retest', 'queued', 'ticket'], ['e2e:MLV-008', 'queued', 'e2e']]);
  assert.equal(jobs[0].createdAt, '2026-10-02T00:00:00.000Z');
});

test('reconcile keeps an existing job, applied included, while its ticket keeps the duty', () => {
  const before = reconcile({ jobs: [], tickets: [t(1, 'retest')], failing: [], now: NOW });
  before[0].phase = 'applied';
  const after = reconcile({ jobs: before, tickets: [t(1, 'retest')], failing: [], now: NOW });
  assert.equal(after.length, 1);
  assert.equal(after[0].phase, 'applied');
});

test('E3: a ticket that leaves the intake, or changes duty, drops its old job; a sent draft is not applied', () => {
  const jobs = reconcile({ jobs: [], tickets: [t(1, 'write-tc'), t(2, 'retest')], failing: [], now: NOW });
  jobs[0].phase = 'draft-sent';
  const after = reconcile({ jobs, tickets: [t(1, 'review-tc')], failing: [], now: NOW });
  assert.deepEqual(after.map((j) => j.id), ['OLS-1:review-tc']);
});

test('an e2e job stays while it is in flight even if the next run passes; a queued one drops', () => {
  const jobs = reconcile({ jobs: [], tickets: [], failing: [{ id: 'A-1' }, { id: 'A-2' }], now: NOW });
  jobs[0].phase = 'draft-sent';
  assert.deepEqual(reconcile({ jobs, tickets: [], failing: [], now: NOW }).map((j) => j.id), ['e2e:A-1']);
});

test('R6: pick starts at most 3 running jobs, oldest first; waiting jobs hold no slot', () => {
  const jobs = reconcile({ jobs: [], tickets: [1, 2, 3, 4, 5, 6].map((n) => t(n, 'retest')), failing: [], now: NOW });
  jobs[0].phase = 'running';
  jobs[1].phase = 'draft-sent';
  jobs[2].phase = 'failed';
  const started = pick(jobs);
  assert.deepEqual(started.map((j) => j.id), ['OLS-4:retest', 'OLS-5:retest']);
  jobs[5].phase = 'rework';
  jobs[3].phase = 'running';
  jobs[4].phase = 'running';
  assert.deepEqual(pick(jobs).map((j) => j.id), []);
});

test('afterRun: output moves to review (test) or draft; a missing output fails without retry (E2)', () => {
  const job = { id: 'x', duty: 'test', phase: 'running' };
  assert.equal(afterRun({ ...job }, { ok: true }, 'work', NOW).phase, 'review');
  assert.equal(afterRun({ ...job }, { ok: true }, 'review', NOW).phase, 'ready');
  assert.equal(afterRun({ ...job, duty: 'retest' }, { ok: true }, 'work', NOW).phase, 'ready');
  const f = afterRun({ ...job }, { ok: false, error: 'claude -p exit 1' }, 'work', NOW);
  assert.deepEqual([f.phase, f.error], ['failed', 'claude -p exit 1']);
  assert.deepEqual(pick([f]), []);
});

test('afterVerdict: passed approves; feedback reworks with the text; a failed job reworks on a reply', () => {
  assert.equal(afterVerdict({ phase: 'draft-sent' }, { kind: 'passed', ts: '1' }, NOW).phase, 'approved');
  const r = afterVerdict({ phase: 'draft-sent' }, { kind: 'feedback', text: 'แก้ข้อ 2', ts: '2' }, NOW);
  assert.deepEqual([r.phase, r.feedback], ['rework', 'แก้ข้อ 2']);
  assert.equal(afterVerdict({ phase: 'failed', thread: '9' }, { kind: 'feedback', text: 'ลองใหม่', ts: '3' }, NOW).phase, 'rework');
  assert.equal(afterVerdict({ phase: 'draft-sent' }, { kind: 'none' }, NOW).phase, 'draft-sent');
});

test('afterApply: done is applied; an e2e rerun that fails goes back to triage', () => {
  assert.equal(afterApply({ phase: 'approved', kind: 'ticket' }, { ok: true }, NOW).phase, 'applied');
  const e = afterApply({ phase: 'approved', kind: 'e2e' }, { ok: false, error: 'rerun failed' }, NOW);
  assert.deepEqual([e.phase, e.feedback], ['rework', 'rerun failed']);
});
