// T6 (layer 14). Spec: docs/sdd/ols-retest-procedure/spec.md R2, R3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUDGING, CASE_STATUSES, draftProblems } from './draft-check.mjs';

test('R2, R3: the duties that judge cases are test and retest; a case is passed, failed, blocked or po-question', () => {
  assert.deepEqual([...JUDGING].sort(), ['retest', 'test']);
  assert.deepEqual([...CASE_STATUSES].sort(), ['blocked', 'failed', 'passed', 'po-question']);
});

test('R3: a FAILED case without a quoted source is refused; with one it passes', () => {
  assert.deepEqual(draftProblems([{ ac: 'AC1', status: 'failed' }]), ['case 1 (AC1) is failed with no quoted source (R3)']);
  assert.deepEqual(draftProblems([{ ac: 'AC1', status: 'failed', source: '  ' }]), ['case 1 (AC1) is failed with no quoted source (R3)']);
  assert.deepEqual(draftProblems([{ ac: 'AC1', status: 'failed', source: 'OLS-12 AC1: "ปุ่มบันทึกต้องเป็นสีเขียว"' }]), []);
});

test('R3: a FAILED case whose sources disagree is a question for the PO, never FAILED', () => {
  assert.deepEqual(draftProblems([{ ac: 'AC2', status: 'failed', source: 'AC2 "x"', conflict: 'Figma node 12:3 shows y' }]), [
    'case 1 (AC2) is failed but its sources disagree (Figma node 12:3 shows y); mark it po-question (R3)',
  ]);
});

test('R2: a BLOCKED case without a quoted refusal is refused; with one it passes', () => {
  assert.deepEqual(draftProblems([{ ac: 'AC3', status: 'blocked' }]), ['case 1 (AC3) is blocked with no quoted refusal of creating its data (R2)']);
  assert.deepEqual(draftProblems([{ ac: 'AC3', status: 'blocked', refusal: 'create_course.py: "403 Forbidden on /admin/courses"' }]), []);
});

test('R2, R3: the cases must be a non-empty array of known statuses, each naming its AC', () => {
  assert.deepEqual(draftProblems('x'), ['cases.json is not an array']);
  assert.deepEqual(draftProblems([]), ['cases.json lists no case']);
  assert.deepEqual(draftProblems([{ ac: 'AC1', status: 'pass' }]), ['case 1 (AC1) has status "pass"; use passed, failed, blocked or po-question']);
  assert.deepEqual(draftProblems([{ status: 'passed' }]), ['case 1 names no AC']);
  assert.deepEqual(draftProblems([{ ac: 'AC1', status: 'passed' }, { ac: 'AC2', status: 'po-question' }]), []);
});
