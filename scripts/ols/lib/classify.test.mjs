// T1. Spec: docs/sdd/ols-real/spec.md R1, R2, R3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JQL, FIELDS, normalize, dutyOf, DUTY_TH, adfText, ticketContext, TEXT_CAP, COMMENT_CAP, TICKET_CAP } from './classify.mjs';

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

const doc = (...paras) => ({ type: 'doc', version: 1, content: paras });
const p = (...texts) => ({ type: 'paragraph', content: texts.map((t) => (t === '\n' ? { type: 'hardBreak' } : { type: 'text', text: t })) });

test('R17: adfText turns Jira document format into plain text, lists as dashes, strings pass through', () => {
  const d = doc(
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'AC' }] },
    p('AC_01 ', 'ผู้ใช้บันทึกได้', '\n', 'บรรทัดสอง'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('EC_01 ห้ามว่าง')] }, { type: 'listItem', content: [p('EC_02 ยาวเกิน')] }] },
  );
  assert.equal(adfText(d), 'AC\nAC_01 ผู้ใช้บันทึกได้\nบรรทัดสอง\n- EC_01 ห้ามว่าง\n- EC_02 ยาวเกิน');
  assert.equal(adfText('plain text'), 'plain text');
  assert.equal(adfText(null), '');
});

const comment = (i, text = `c${i}`) => ({ author: { displayName: `dev${i}` }, created: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000+0700`, body: doc(p(text)) });

test('R17: ticketContext carries description, criteria fields found by name, the newest comment page oldest first, and caps with a note', () => {
  // the comment endpoint answers newest first (orderBy=-created): ids 119 down to 70, total 120
  const page = { comments: Array.from({ length: COMMENT_CAP }, (_, k) => comment(119 - k)), total: 120 };
  const issue = {
    key: 'OLS-910',
    names: { description: 'Description', customfield_13000: 'Acceptance Criteria', customfield_13001: 'Edge Cases', customfield_13002: 'Story Points' },
    fields: {
      description: doc(p('x'.repeat(TEXT_CAP + 10))),
      customfield_13000: doc(p('AC_01 บันทึกได้')),
      customfield_13001: 'EC_01 ห้ามว่าง',
      customfield_13002: 5,
      comment: { comments: [comment(0, 'oldest page only')] }, // the issue's own field is never used
    },
  };
  const c = ticketContext(issue, page);
  assert.equal(c.description.length, TEXT_CAP);
  assert.deepEqual(c.criteria, [{ name: 'Acceptance Criteria', text: 'AC_01 บันทึกได้' }, { name: 'Edge Cases', text: 'EC_01 ห้ามว่าง' }]);
  assert.equal(c.comments.length, COMMENT_CAP);
  assert.deepEqual(c.comments[0], { author: 'dev70', created: comment(70).created, text: 'c70' });
  assert.deepEqual(c.comments.at(-1), { author: 'dev119', created: comment(119).created, text: 'c119' });
  assert.ok(!JSON.stringify(c).includes('oldest page only'));
  assert.deepEqual(c.cut, ['description cut at 20000 characters', 'comments: newest 50 of 120']);
  // ols-retest-procedure R1 added `history` to the shape
  assert.deepEqual(ticketContext({ fields: {} }), { description: '', criteria: [], history: [], comments: [], cut: [] });
  assert.deepEqual(ticketContext({ fields: {} }, { comments: [comment(1)], total: 1 }).cut, []);
});

test('ols-retest-procedure R1, R3: the context carries the change history of the description and the criteria fields, oldest first', () => {
  const issue = {
    names: { description: 'Description', customfield_13000: 'Acceptance Criteria', customfield_13002: 'Story Points' },
    fields: { description: 'ตอนนี้', customfield_13000: 'AC_01 ใหม่' },
    changelog: {
      histories: [
        { author: { displayName: 'PO' }, created: '2026-10-18T09:00:00.000+0700', items: [{ field: 'description', fieldId: 'description', fromString: 'ก่อน', toString: 'ตอนนี้' }, { field: 'status', fieldId: 'status', fromString: 'A', toString: 'B' }] },
        { author: { displayName: 'BA' }, created: '2026-10-17T09:00:00.000+0700', items: [{ field: 'Acceptance Criteria', fieldId: 'customfield_13000', fromString: 'AC_01 เก่า', toString: 'AC_01 ใหม่' }] },
        { author: { displayName: 'Dev' }, created: '2026-10-16T09:00:00.000+0700', items: [{ field: 'Story Points', fieldId: 'customfield_13002', fromString: '3', toString: '5' }] },
      ],
    },
  };
  assert.deepEqual(ticketContext(issue).history, [
    { author: 'BA', created: '2026-10-17T09:00:00.000+0700', field: 'Acceptance Criteria', from: 'AC_01 เก่า', to: 'AC_01 ใหม่' },
    { author: 'PO', created: '2026-10-18T09:00:00.000+0700', field: 'description', from: 'ก่อน', to: 'ตอนนี้' },
  ]);
});

test('ols-retest-procedure R1: the history counts toward the total cap and is cut after the comments, oldest first', () => {
  const long = 'h'.repeat(TEXT_CAP);
  const histories = Array.from({ length: 20 }, (_, k) => ({ author: { displayName: `p${k}` }, created: `2026-10-${String(k + 1).padStart(2, '0')}T00:00:00.000+0700`, items: [{ field: 'description', fieldId: 'description', fromString: long, toString: long }] }));
  const c = ticketContext({ names: {}, fields: { description: 'd' }, changelog: { histories } }, { comments: [comment(1)], total: 1 });
  assert.ok(JSON.stringify(c).length <= TICKET_CAP, String(JSON.stringify(c).length));
  assert.equal(c.comments.length, 0);
  assert.ok(c.history.length > 0 && c.history.length < 20);
  assert.equal(c.history.at(-1).author, 'p19');
  assert.match(c.cut.at(-1), new RegExp(`^history: dropped ${20 - c.history.length} oldest to keep ticket.json under ${TICKET_CAP} characters$`));
});

test('R17: ticket.json context stays under the total cap by dropping the oldest comments first', () => {
  const long = 'y'.repeat(TEXT_CAP);
  const page = { comments: Array.from({ length: 20 }, (_, k) => comment(19 - k, `${19 - k} ${long}`)), total: 20 };
  const c = ticketContext({ fields: { description: doc(p(long)) } }, page);
  assert.ok(JSON.stringify(c).length <= TICKET_CAP, String(JSON.stringify(c).length));
  assert.equal(c.comments.at(-1).author, 'dev19');
  assert.ok(c.comments.length < 20);
  assert.match(c.cut.at(-1), new RegExp(`^comments: dropped ${20 - c.comments.length} oldest to keep ticket.json under ${TICKET_CAP} characters$`));
});
