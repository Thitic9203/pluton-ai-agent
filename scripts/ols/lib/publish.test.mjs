// T9. Spec: docs/sdd/ols-real/spec.md R13, R14.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardPayload, publishIfChanged, REPO } from './publish.mjs';

const tickets = [
  { key: 'OLS-12', n: 12, summary: 'หน้า Learning Path', duty: 'write-tc', created: '2026-10-01T00:00:00.000Z' },
  { key: 'OLS-13', n: 13, summary: 'ปุ่ม Publish', duty: 'retest', created: '2026-10-02T00:00:00.000Z' },
  { key: 'OLS-14', n: 14, summary: 'x'.repeat(200), duty: null, created: '2026-10-03T00:00:00.000Z' },
];
const jobs = [{ id: 'OLS-12:write-tc', key: 'OLS-12', phase: 'draft-sent' }, { id: 'OLS-13:retest', key: 'OLS-13', phase: 'failed' }];

test('R13: the board carries key number, summary (80 max), duty and phase, no secret field', () => {
  const p = boardPayload({ tickets, jobs, readAt: '2026-10-17T03:00:00.000Z' });
  assert.deepEqual(p.items, [
    { n: 12, summary: 'หน้า Learning Path', duty: 'write-tc', phase: 'waiting' },
    { n: 13, summary: 'ปุ่ม Publish', duty: 'retest', phase: 'failed' },
    { n: 14, summary: 'x'.repeat(80), duty: null, phase: 'idle' },
  ]);
  assert.deepEqual(Object.keys(p), ['v', 'readAt', 'items']);
});

test('R13: unchanged items publish nothing; a change sets the variable then starts one refresh', async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args]); return ''; };
  const p = boardPayload({ tickets, jobs, readAt: '2026-10-17T03:00:00.000Z' });
  const first = await publishIfChanged({ payload: p, lastHash: null, run });
  assert.equal(first.changed, true);
  assert.deepEqual(calls.map((c) => c.slice(0, 4)), [['gh', 'variable', 'set', 'OLS_BOARD'], ['gh', 'workflow', 'run', 'deploy-agent-office.yml']]);
  assert.ok(calls[0].includes(REPO) && calls[1].includes('target=refresh'));
  const later = boardPayload({ tickets, jobs, readAt: '2026-10-17T03:30:00.000Z' });
  const second = await publishIfChanged({ payload: later, lastHash: first.hash, run });
  assert.equal(second.changed, false);
  assert.equal(calls.length, 2);
});
