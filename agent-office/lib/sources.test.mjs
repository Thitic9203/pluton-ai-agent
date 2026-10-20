// T34. Spec: docs/sdd/agent-office-live/spec.md R0, R12, R40, R58, R60.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_SOURCE, fmtBangkok, source, sourceLine, boardSources, sizeNote } from './sources.mjs';

test('R12: the clock format is Bangkok time as the mock prints it', () => {
  assert.equal(fmtBangkok('2026-10-16T11:45:00Z'), 'Fri 16 Oct 2026 6.45 PM');
  assert.equal(fmtBangkok(null), '');
  assert.equal(fmtBangkok('not a time'), '');
});

test('R58: "ที่มา: <source> · <time>", with the ids it counted', () => {
  assert.equal(sourceLine(source('label agent:building บน GitHub', ['#501', '#504'], '2026-10-16T11:45:00Z')), 'ที่มา: label agent:building บน GitHub ของ #501, #504 · Fri 16 Oct 2026 6.45 PM');
  assert.equal(sourceLine(source('open.er-api.com', [], '2026-10-16T00:00:00Z')), 'ที่มา: open.er-api.com · Fri 16 Oct 2026 7.00 AM');
  const many = sourceLine(source('usage marker', Array.from({ length: 12 }, (_, i) => 'run ' + i), '2026-10-16T11:45:00Z'));
  assert.match(many, /run 7 \+4 · /);
});

test('R0: an entry with no fact or no valid time gives no line, so the page shows the no-source text', () => {
  assert.equal(sourceLine(null), null);
  assert.equal(sourceLine({ fact: 'x', ids: [], time: null }), null);
  assert.equal(sourceLine({ fact: '', ids: [], time: '2026-10-16T11:45:00Z' }), null);
  assert.equal(NO_SOURCE, 'ยังไม่มีแหล่งข้อมูล');
});

test('R16, R30, R33, R34: board numbers carry the issues they counted; a project with no source gets none (E4)', () => {
  const s = boardSources({
    readAt: '2026-10-16T11:45:00Z',
    projects: [{ id: 'taskfolio', name: 'Taskfolio', key: '#{n}', count: 2, source: 'github-labels', release: { phase: 'collect', queued: 1, batch: 10 } }, { id: 'ols', name: 'OLS', count: null, source: 'none' }],
    issues: [{ project: 'taskfolio', n: 501, key: '#501', lane: 'building' }, { project: 'taskfolio', n: 508, key: '#508', lane: 'release-queue' }]
  });
  assert.deepEqual(s.summaryText.ids, ['#501', '#508']);
  assert.deepEqual(s.cap.ids, ['#501']);
  assert.deepEqual(s['release:taskfolio'].ids, ['#508']);
  assert.ok(s['project:taskfolio']);
  assert.equal(s['project:ols'], undefined);
  assert.deepEqual(boardSources(null), {});
});

test('ols-real R13: a mac-snapshot count names Jira on the Mac as its source; no data means no line (E4)', () => {
  const s = boardSources({
    readAt: '2026-10-17T03:00:00Z',
    projects: [{ id: 'ols', name: 'OLS', key: 'OLS-{n}', count: 1, source: 'mac-snapshot' }],
    issues: [{ project: 'ols', n: 12, key: 'OLS-12', lane: 'test-planning' }]
  });
  assert.equal(s['project:ols'].fact, 'ticket ของ OLS ที่ QA Owner เป็นเจ้าของ จาก Jira (ส่งจาก Mac)');
  assert.equal(boardSources({ readAt: '2026-10-17T03:00:00Z', projects: [{ id: 'ols', name: 'OLS', count: null, source: 'mac-snapshot' }], issues: [] })['project:ols'], undefined);
});

test('R60: the size note names its facts and both published sources', () => {
  assert.equal(sizeNote({ size: 'M', rules: 6, files: 4, risk: ['ui'] }), 'ขนาดแบบ T-shirt (relative estimation): spec 6 ข้อ · ไฟล์ 4 · ความเสี่ยง 1 · วิธี: Mountain Goat Software, Atlassian');
  assert.equal(sizeNote(null), null);
});
