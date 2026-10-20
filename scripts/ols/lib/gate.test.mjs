// T2. Spec: docs/sdd/ols-real/spec.md R7, R8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER, CHANNEL, isPassed, verdict, draftText } from './gate.mjs';

test('R7: the owner and the DM channel are the AI Agent Bot ones of P4', () => {
  assert.equal(OWNER, 'U06QB9UVAG4');
  assert.equal(CHANNEL, 'D0ASX9ML4G6');
});

test('R8: passed is the whole reply, any case, an optional . or !', () => {
  for (const t of ['passed', 'Passed', ' PASSED ', 'passed.', 'passed!']) assert.equal(isPassed(t), true, t);
  for (const t of ['passed?', 'not passed', 'passed แต่แก้ข้อ 2', 'pass', '', null]) assert.equal(isPassed(t), false, String(t));
});

const draftTs = '1792100000.000100';
const m = (user, text, ts) => ({ user, text, ts });

test('R8: the latest owner reply after the draft decides', () => {
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792100001.0')], draftTs }), { kind: 'passed', ts: '1792100001.0' });
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792100001.0'), m(OWNER, 'เดี๋ยวก่อน แก้ข้อ 3', '1792100002.0')], draftTs }), { kind: 'feedback', text: 'เดี๋ยวก่อน แก้ข้อ 3', ts: '1792100002.0' });
});

test('R8: a bot reply, another user and a reply older than the draft never count', () => {
  assert.deepEqual(verdict({ replies: [m('U0ASHNELDF1', 'passed', '1792100003.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [m('U999', 'passed', '1792100003.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792099999.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [], draftTs }), { kind: 'none' });
});

test('R7: the draft names the ticket, the duty, every proposed write and how to approve', () => {
  const t = draftText({ key: 'OLS-12', duty: 'retest' }, 'ผลรีเทส: ผ่าน 5/5', [{ type: 'jira.comment', body: 'x' }, { type: 'jira.transition', to: 'Done' }]);
  assert.match(t, /^\[OLS-12\] รีเทสบัค · ร่างรออนุมัติ/);
  assert.match(t, /ผลรีเทส: ผ่าน 5\/5/);
  assert.match(t, /คอมเมนต์ใน Jira/);
  assert.match(t, /เปลี่ยนสถานะเป็น Done/);
  assert.match(t, /ตอบ passed ในเธรดนี้/);
});
