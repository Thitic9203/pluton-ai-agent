// T8. Spec: docs/sdd/ols-real/spec.md R14, E4; agent-office-live R65, E4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOlsBoard } from './ols-board.mjs';

const good = {
  v: 1,
  readAt: '2026-10-17T03:00:00.000Z',
  items: [
    { n: 12, summary: 'หน้า Learning Path', duty: 'write-tc', phase: 'working' },
    { n: 13, summary: 'ปุ่ม Publish', duty: 'retest', phase: 'failed' },
    { n: 14, summary: 'รอ dev', duty: null, phase: 'idle' },
  ],
};

test('R14: OLS cards sit in test-planning with the duty name before the summary; a failed job is blocked from it', () => {
  const b = parseOlsBoard(JSON.stringify(good));
  assert.equal(b.readAt, good.readAt);
  assert.deepEqual(b.issues, [
    { project: 'ols', n: 12, title: 'เขียนเทสเคส · หน้า Learning Path', lane: 'test-planning', from: null, createdAt: good.readAt, labels: [] },
    { project: 'ols', n: 13, title: 'รีเทสบัค · ปุ่ม Publish', lane: 'blocked', from: 'test-planning', createdAt: good.readAt, labels: [] },
    { project: 'ols', n: 14, title: 'รอ dev', lane: 'test-planning', from: null, createdAt: good.readAt, labels: [] },
  ]);
});

test('E4: missing, unparsable or invalid data gives null, never a partial board', () => {
  for (const bad of [undefined, '', 'not json', '[]', JSON.stringify({ ...good, v: 2 }), JSON.stringify({ ...good, readAt: 'x' }),
    JSON.stringify({ ...good, items: [{ ...good.items[0], n: -1 }] }), JSON.stringify({ ...good, items: [{ ...good.items[0], duty: 'deploy' }] }),
    JSON.stringify({ ...good, items: [{ ...good.items[0], phase: 'x' }] }), JSON.stringify({ ...good, items: [{ ...good.items[0], summary: 'x'.repeat(81) }] }),
    JSON.stringify({ ...good, items: Array.from({ length: 201 }, (_, i) => ({ n: i + 1, summary: 's', duty: null, phase: 'idle' })) })]) {
    assert.equal(parseOlsBoard(bad), null, String(bad).slice(0, 60));
  }
});
