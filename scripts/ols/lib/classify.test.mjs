// T1. Spec: docs/sdd/ols-real/spec.md R1, R2, R3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JQL, FIELDS, normalize, dutyOf, DUTY_TH } from './classify.mjs';

const raw = (type, status, tc, key = 'OLS-12') => ({
  key,
  fields: { summary: 'หน้า Learning Path', issuetype: { name: type }, status: { name: status }, customfield_12128: tc === null ? null : { value: tc }, created: '2026-10-10T03:00:00.000+0700' },
});

test('R1: the intake JQL is the QA Owner rule, and reads TC Status', () => {
  assert.equal(JQL, 'project = OLS AND cf[12120] = currentUser() AND statusCategory != Done');
  assert.ok(FIELDS.includes('customfield_12128'));
});

test('normalize keeps key, number, type, status and TC Status in upper case', () => {
  const t = normalize(raw('Story', 'Ready to Test', 'QA Reviewed', 'OLS-290'));
  assert.deepEqual({ key: t.key, n: t.n, type: t.type, status: t.status, tcStatus: t.tcStatus }, { key: 'OLS-290', n: 290, type: 'story', status: 'READY TO TEST', tcStatus: 'QA REVIEWED' });
  assert.equal(normalize({ key: 'OLS-1', fields: { customfield_12128: 'DONE' } }).tcStatus, 'DONE');
  assert.equal(normalize({ key: 'nope', fields: {} }), null);
});

test('R2: a Story with no test cases is write-tc in any status', () => {
  for (const s of ['To Do', 'In Progress', 'READY TO TEST', 'TESTING']) {
    for (const tc of [null, 'Not Started', 'In Progress']) assert.equal(dutyOf(normalize(raw('Story', s, tc))), 'write-tc', `${s} ${tc}`);
  }
});

test('R2: a Story with TC Status DONE is review-tc', () => {
  assert.equal(dutyOf(normalize(raw('Story', 'To Do', 'DONE'))), 'review-tc');
  assert.equal(dutyOf(normalize(raw('Story', 'TESTING', 'Done'))), 'review-tc');
});

test('R2: a Story in test with QA REVIEWED is test; not yet in test it waits', () => {
  assert.equal(dutyOf(normalize(raw('Story', 'READY TO TEST', 'QA REVIEWED'))), 'test');
  assert.equal(dutyOf(normalize(raw('Story', 'Testing', 'QA REVIEWED'))), 'test');
  assert.equal(dutyOf(normalize(raw('Story', 'In Progress', 'QA REVIEWED'))), null);
});

test('R2: a Bug or Task in test is retest; otherwise it waits; Subtask is never a duty', () => {
  assert.equal(dutyOf(normalize(raw('Bug', 'READY TO TEST', null))), 'retest');
  assert.equal(dutyOf(normalize(raw('Task', 'TESTING', null))), 'retest');
  assert.equal(dutyOf(normalize(raw('Bug', 'In Progress', null))), null);
  assert.equal(dutyOf(normalize(raw('Subtask', 'READY TO TEST', null))), null);
  assert.equal(dutyOf(normalize(raw('Sub-task', 'READY TO TEST', null))), null);
});

test('R3: a Story in test with no cases flows write-tc, review-tc, test as TC Status moves', () => {
  const steps = [null, 'DONE', 'QA REVIEWED'].map((tc) => dutyOf(normalize(raw('Story', 'READY TO TEST', tc))));
  assert.deepEqual(steps, ['write-tc', 'review-tc', 'test']);
});

test('every duty has its Thai name from the mock', () => {
  assert.deepEqual(DUTY_TH, { 'write-tc': 'เขียนเทสเคส', 'review-tc': 'รีวิวเทสเคส', test: 'ทดสอบ', retest: 'รีเทสบัค', 'e2e-fix': 'แก้เคส e2e' });
});
