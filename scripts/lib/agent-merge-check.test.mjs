/**
 * Gate 3 of the always-on agent: the merge job checks and reports, and the owner presses Merge
 * (docs/superpowers/plans/always-on-dev-agent.md, Decisions Q3 and Q5). These cases pin each way
 * the verdict must refuse, so a loosened rule fails here before it reaches a pull request.
 *
 * Run with `node --test scripts/lib/agent-merge-check.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeVerdict, formatReport, OWNER_LOGIN } from '../agent/merge-check.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const pr = { number: 7, head: { sha: HEAD } };

const review = (state, extra = {}) => ({
  user: { login: OWNER_LOGIN, type: 'User' },
  commit_id: HEAD,
  state,
  submitted_at: '2026-10-14T08:00:00Z',
  ...extra,
});
const job = (sha, result, completed_at = '2026-10-14T08:30:00Z') => ({ sha, result, completed_at });
const check = (name, conclusion, status = 'completed') => ({ name, head_sha: HEAD, status, conclusion });

/** A pull request that passes every condition; each case below breaks exactly one thing. */
const good = () => ({
  pr,
  reviews: [review('APPROVED')],
  reviewJob: job(HEAD, 'APPROVE'),
  checkRuns: [check('Unit tests', 'success'), check('Parity', 'skipped')],
});

test('all good: owner approval on head, reviewer approves, checks green', () => {
  const v = mergeVerdict(good());
  assert.deepEqual(v, { ok: true, reasons: [] });
});

test('an approval on an older sha does not count', () => {
  const v = mergeVerdict({ ...good(), reviews: [review('APPROVED', { commit_id: OLD })] });
  assert.equal(v.ok, false);
  assert.equal(v.reasons.length, 1);
  assert.match(v.reasons[0], /no approval from Thitic9203 on the head commit/);
});

test('owner approves, then requests changes on the same sha: changes requested wins', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [
      review('APPROVED', { submitted_at: '2026-10-14T08:00:00Z' }),
      review('CHANGES_REQUESTED', { submitted_at: '2026-10-14T09:00:00Z' }),
    ],
  });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /CHANGES_REQUESTED/);
});

test('order follows submitted_at, not array position', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [
      review('CHANGES_REQUESTED', { submitted_at: '2026-10-14T07:00:00Z' }),
      review('APPROVED', { submitted_at: '2026-10-14T08:00:00Z' }),
    ],
  });
  assert.equal(v.ok, true);
});

test('a dismissed owner approval on the head sha does not count', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [review('APPROVED'), review('DISMISSED', { submitted_at: '2026-10-14T09:00:00Z' })],
  });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /DISMISSED/);
});

test('a later comment from the owner does not undo the approval', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [review('APPROVED'), review('COMMENTED', { submitted_at: '2026-10-14T09:00:00Z' })],
  });
  assert.equal(v.ok, true);
});

test('an approval from a Bot account named Thitic9203 does not count', () => {
  const v = mergeVerdict({ ...good(), reviews: [review('APPROVED', { user: { login: OWNER_LOGIN, type: 'Bot' } })] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /no approval from Thitic9203/);
});

test('an approval from a login that differs only in case does not count', () => {
  const v = mergeVerdict({ ...good(), reviews: [review('APPROVED', { user: { login: 'thitic9203', type: 'User' } })] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /no approval from Thitic9203/);
});

test('an approval from another user does not count', () => {
  const v = mergeVerdict({ ...good(), reviews: [review('APPROVED', { user: { login: 'someone', type: 'User' } })] });
  assert.equal(v.ok, false);
});

test('the separate reviewer asking for changes refuses', () => {
  const v = mergeVerdict({ ...good(), reviewJob: job(HEAD, 'REQUEST_CHANGES') });
  assert.equal(v.ok, false);
  assert.equal(v.reasons.length, 1);
  assert.match(v.reasons[0], /reviewer job .*REQUEST_CHANGES/);
});

test('a reviewer approval of an older sha refuses', () => {
  const v = mergeVerdict({ ...good(), reviewJob: job(OLD, 'APPROVE') });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /reviewer job/);
});

test('no reviewer result at all refuses', () => {
  const v = mergeVerdict({ ...good(), reviewJob: null });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /reviewer job/);
});

test('a pending check refuses', () => {
  const v = mergeVerdict({ ...good(), checkRuns: [check('Unit tests', 'success'), check('E2E', null, 'in_progress')] });
  assert.equal(v.ok, false);
  assert.equal(v.reasons.length, 1);
  assert.match(v.reasons[0], /still running: E2E/);
});

test('a failed check refuses', () => {
  const v = mergeVerdict({ ...good(), checkRuns: [check('Unit tests', 'failure'), check('Parity', 'success')] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /not green: Unit tests \(failure\)/);
});

test('zero checks refuses', () => {
  const v = mergeVerdict({ ...good(), checkRuns: [] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /no check runs/);
});

test('check runs on another sha are not counted', () => {
  const v = mergeVerdict({ ...good(), checkRuns: [{ name: 'Unit tests', head_sha: OLD, status: 'completed', conclusion: 'success' }] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /no check runs/);
});

test('a check run that names no sha is not counted', () => {
  const v = mergeVerdict({ ...good(), checkRuns: [{ name: 'Unit tests', status: 'completed', conclusion: 'success' }] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /no check runs/);
});

test('a pull request with no head sha is refused, never approved by default', () => {
  for (const head of [{}, { sha: '' }, { sha: 42 }, undefined]) {
    const v = mergeVerdict({
      pr: { number: 7, head },
      reviews: [{ user: { login: OWNER_LOGIN, type: 'User' }, state: 'APPROVED' }],
      reviewJob: { result: 'APPROVE' },
      checkRuns: [{ name: 'Unit tests', status: 'completed', conclusion: 'success' }],
    });
    assert.equal(v.ok, false);
    assert.match(v.reasons[0], /no head commit sha/);
  }
});

test('reviewer results as an array: the latest on the head sha counts', () => {
  const runs = [
    { sha: HEAD, result: 'APPROVE', completed_at: '2026-10-14T08:00:00Z' },
    { sha: HEAD, result: 'REQUEST_CHANGES', completed_at: '2026-10-14T09:00:00Z' },
    { sha: OLD, result: 'APPROVE', completed_at: '2026-10-14T10:00:00Z' },
  ];
  const v = mergeVerdict({ ...good(), reviewJob: runs });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /REQUEST_CHANGES/);
  const ok = mergeVerdict({ ...good(), reviewJob: [runs[1], { ...runs[0], completed_at: '2026-10-14T09:30:00Z' }] });
  assert.equal(ok.ok, true);
});

test('reviewer results as an array with nothing on the head sha refuses', () => {
  const v = mergeVerdict({ ...good(), reviewJob: [{ sha: OLD, result: 'APPROVE', completed_at: '2026-10-14T10:00:00Z' }] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /reviewer job has no result/);
});

test('an owner decision on the head sha with no submitted_at refuses, whatever its position', () => {
  for (const reviews of [
    [review('APPROVED'), review('CHANGES_REQUESTED', { submitted_at: undefined })],
    [review('APPROVED', { submitted_at: undefined })],
    [review('APPROVED'), review('DISMISSED', { submitted_at: 'not a date' })],
  ]) {
    const v = mergeVerdict({ ...good(), reviews });
    assert.equal(v.ok, false);
    assert.equal(v.reasons.length, 1);
    assert.match(v.reasons[0], /no readable submitted_at/);
  }
});

test('an owner review without submitted_at on an older sha or a comment does not block', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [review('APPROVED'), review('CHANGES_REQUESTED', { commit_id: OLD, submitted_at: undefined }),
      review('COMMENTED', { submitted_at: undefined })],
  });
  assert.equal(v.ok, true);
});

test('two owner decisions on the head sha at the same instant refuse rather than guess', () => {
  const v = mergeVerdict({ ...good(), reviews: [review('CHANGES_REQUESTED'), review('APPROVED')] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /same time/);
});

test('a reviewer result on the head sha with no completed_at refuses', () => {
  for (const reviewJob of [{ sha: HEAD, result: 'APPROVE' }, [job(HEAD, 'APPROVE'), { sha: HEAD, result: 'APPROVE' }]]) {
    const v = mergeVerdict({ ...good(), reviewJob });
    assert.equal(v.ok, false);
    assert.equal(v.reasons.length, 1);
    assert.match(v.reasons[0], /reviewer job .*no readable completed_at/);
  }
});

test('two reviewer results on the head sha at the same instant refuse rather than guess', () => {
  const v = mergeVerdict({ ...good(), reviewJob: [job(HEAD, 'APPROVE'), job(HEAD, 'REQUEST_CHANGES')] });
  assert.equal(v.ok, false);
  assert.match(v.reasons[0], /same time/);
});

test('null entries in reviews, reviewer results and check runs are skipped safely', () => {
  const v = mergeVerdict({
    ...good(),
    reviews: [null, review('APPROVED'), undefined],
    reviewJob: [null, job(HEAD, 'APPROVE')],
    checkRuns: [null, check('Unit tests', 'success'), undefined],
  });
  assert.deepEqual(v, { ok: true, reasons: [] });
});

test('every failing condition is reported, one reason each', () => {
  const v = mergeVerdict({ pr, reviews: [], reviewJob: null, checkRuns: [] });
  assert.equal(v.ok, false);
  assert.equal(v.reasons.length, 3);
});

test('formatReport is short markdown naming the result and each reason', () => {
  const pass = formatReport(mergeVerdict(good()));
  assert.match(pass, /Ready to merge/);
  const fail = formatReport(mergeVerdict({ pr, reviews: [], reviewJob: null, checkRuns: [] }));
  assert.match(fail, /Not ready to merge/);
  assert.equal(fail.split('\n').filter((l) => l.startsWith('- ')).length, 3);
  assert.ok(fail.split('\n').length <= 10);
});
