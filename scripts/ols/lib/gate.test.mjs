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

// ols-retest-procedure R7 supersedes the exact-reply rule: a bare `passed` approves with no instructions.
test('R8: the latest owner reply after the draft decides', () => {
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792100001.0')], draftTs }), { kind: 'passed', ts: '1792100001.0', instructions: [] });
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792100001.0'), m(OWNER, 'เดี๋ยวก่อน แก้ข้อ 3', '1792100002.0')], draftTs }), { kind: 'feedback', text: 'เดี๋ยวก่อน แก้ข้อ 3', ts: '1792100002.0' });
});

test('R8: a bot reply, another user and a reply older than the draft never count', () => {
  assert.deepEqual(verdict({ replies: [m('U0ASHNELDF1', 'passed', '1792100003.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [m('U999', 'passed', '1792100003.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [m(OWNER, 'passed', '1792099999.0')], draftTs }), { kind: 'none' });
  assert.deepEqual(verdict({ replies: [], draftTs }), { kind: 'none' });
});

test('ols-retest-procedure R7: a first line `passed` approves and every later line is an instruction', () => {
  const text = 'passed\nตรวจสอบว่าทิคเกตอยู่สถานะไรในตอนนี้\n\n  อัปเดตผลในชีท qa  \nสถานะ ไป blocked และเมนชั่น PO';
  assert.deepEqual(verdict({ replies: [m(OWNER, text, '1792100004.0')], draftTs }), {
    kind: 'passed',
    ts: '1792100004.0',
    instructions: ['ตรวจสอบว่าทิคเกตอยู่สถานะไรในตอนนี้', 'อัปเดตผลในชีท qa', 'สถานะ ไป blocked และเมนชั่น PO'],
  });
  assert.equal(verdict({ replies: [m(OWNER, 'Passed.\nแก้สถานะเป็น Done', '1792100005.0')], draftTs }).kind, 'passed');
  // the first line alone decides: `passed` with more words on that line is still feedback
  assert.equal(verdict({ replies: [m(OWNER, 'passed แต่แก้ข้อ 2\nข้อ 2 ผิด', '1792100006.0')], draftTs }).kind, 'feedback');
  assert.equal(verdict({ replies: [m(OWNER, 'แก้ก่อน\npassed', '1792100007.0')], draftTs }).kind, 'feedback');
});

test('ols-retest-procedure R8: the draft names the sheet results, the PO mention and the status read that comes first', () => {
  const t = draftText({ key: 'OLS-12', duty: 'retest' }, 'ผล', [
    { type: 'jira.comment', body: 'x' },
    { type: 'sheet.results', sheet: 'S', tab: 'OLS-12', gid: 1, rows: [{}, {}] },
    { type: 'jira.transition', to: 'BLOCKED' },
    { type: 'jira.mentionPo', accountId: 'po', cases: ['AC2', 'AC4'], body: 'รอ PO CF' },
  ]);
  assert.match(t, /อ่านสถานะ ticket และ QA Owner ปัจจุบันก่อนเขียน/);
  assert.match(t, /อัปเดตผล 2 แถวในชีท QA tab OLS-12/);
  assert.match(t, /เมนชั่น PO ในเคสที่รอ PO CF: AC2, AC4/);
  assert.ok(!draftText({ key: 'OLS-1', duty: 'write-tc' }, 'x', []).includes('อ่านสถานะ ticket'));
});

test('R24: the draft shows every comment and mention body, and the PO account, exactly as they will be posted', () => {
  const comment = 'ผลรีเทส OLS-12\nAC1 ผ่าน\nAC2 รอ PO CF';
  const mention = 'รบกวนยืนยัน AC2 ครับ';
  const t = draftText({ key: 'OLS-12', duty: 'retest' }, 'ผล', [
    { type: 'jira.comment', body: comment },
    { type: 'jira.transition', to: 'BLOCKED' },
    { type: 'jira.mentionPo', accountId: '712020:po-account', cases: ['AC2'], body: mention },
  ]);
  assert.ok(t.includes(comment), 'comment body verbatim');
  assert.ok(t.includes(mention), 'mention body verbatim');
  assert.ok(t.includes('712020:po-account'), 'the PO account');
  assert.ok(!t.includes('ข้อความตามร่างด้านบน'));
});

test('R7: the draft names the ticket, the duty, every proposed write and how to approve', () => {
  const t = draftText({ key: 'OLS-12', duty: 'retest' }, 'ผลรีเทส: ผ่าน 5/5', [{ type: 'jira.comment', body: 'x' }, { type: 'jira.transition', to: 'Done' }]);
  assert.match(t, /^\[OLS-12\] รีเทสบัค · ร่างรออนุมัติ/);
  assert.match(t, /ผลรีเทส: ผ่าน 5\/5/);
  assert.match(t, /คอมเมนต์ใน Jira/);
  assert.match(t, /เปลี่ยนสถานะเป็น Done/);
  assert.match(t, /ตอบ passed ในเธรดนี้/);
});
