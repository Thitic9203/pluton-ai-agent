// T6. Spec: docs/sdd/ols-real/spec.md R9, R12, E5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, checkActions, applyJob } from './apply.mjs';

function fakes() {
  const calls = [];
  return {
    calls,
    clients: {
      jira: {
        comment: async (k, b) => calls.push(['comment', k, b]),
        transition: async (k, to) => calls.push(['transition', k, to]),
        tcStatus: async (k, v) => calls.push(['tcStatus', k, v]),
        assign: async (k, a) => calls.push(['assign', k, a]),
      },
      sheet: { createTab: async (k, rows, o) => calls.push(['createTab', k, rows.length, o.dryRun]) },
      gh: { merge: async (pr) => calls.push(['merge', pr]) },
      e2e: { rerun: async (id) => (calls.push(['rerun', id]), { ok: true, summary: 'case 3/3, full suite 87 passed' }) },
    },
  };
}

test('E5: each duty allows only its own writes', () => {
  assert.deepEqual(Object.keys(ALLOWED).sort(), ['e2e-fix', 'retest', 'review-tc', 'test', 'write-tc']);
  assert.equal(checkActions('review-tc', [{ type: 'jira.comment', body: 'x' }, { type: 'jira.tcStatus', value: 'QA REVIEWED' }]), null);
  assert.match(checkActions('review-tc', [{ type: 'jira.transition', to: 'Done' }]), /not allowed/);
  assert.match(checkActions('write-tc', [{ type: 'jira.tcStatus', value: 'QA REVIEWED' }]), /DONE/);
  assert.match(checkActions('retest', [{ type: 'jira.comment', body: '' }]), /empty/);
  assert.match(checkActions('test', 'x'), /array/);
});

test('R9: approved writes apply in order; the sheet tab runs a dry run first', async () => {
  const { calls, clients } = fakes();
  const job = { key: 'OLS-12', duty: 'write-tc', kind: 'ticket', applied: [] };
  const actions = [{ type: 'sheet.createTab', rows: [{ a: 1 }, { a: 2 }] }, { type: 'jira.comment', body: 'TC ready' }, { type: 'jira.tcStatus', value: 'DONE' }];
  const r = await applyJob({ job, actions, clients, record: async () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [['createTab', 'OLS-12', 2, true], ['createTab', 'OLS-12', 2, false], ['comment', 'OLS-12', 'TC ready'], ['tcStatus', 'OLS-12', 'DONE']]);
  assert.deepEqual(job.applied, ['0:sheet.createTab', '1:jira.comment', '2:jira.tcStatus']);
});

test('R9: a crash after the first write never posts it twice', async () => {
  const { calls, clients } = fakes();
  const job = { key: 'OLS-3', duty: 'retest', kind: 'ticket', applied: [] };
  const actions = [{ type: 'jira.comment', body: 'retest pass' }, { type: 'jira.transition', to: 'Done' }];
  clients.jira.transition = async () => { throw new Error('Jira 502 on /transitions'); };
  const first = await applyJob({ job, actions, clients, record: async () => {} });
  assert.deepEqual([first.ok, first.error], [false, 'Jira 502 on /transitions']);
  const again = fakes();
  await applyJob({ job, actions, clients: again.clients, record: async () => {} });
  assert.deepEqual(again.calls, [['transition', 'OLS-3', 'Done']]);
  assert.deepEqual(calls, [['comment', 'OLS-3', 'retest pass']]);
});

test('R12: an approved e2e job merges, then reruns from merged main', async () => {
  const { calls, clients } = fakes();
  const job = { key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e', applied: [] };
  const r = await applyJob({ job, actions: [{ type: 'e2e.merge', pr: 41 }], clients, record: async () => {} });
  assert.deepEqual(calls, [['merge', 41], ['rerun', 'MLV-008']]);
  assert.deepEqual(r, { ok: true, lines: ['merge PR #41', 'รันซ้ำบน dev: case 3/3, full suite 87 passed'] });
});

test('E5: a write outside the allow-list applies nothing', async () => {
  const { calls, clients } = fakes();
  const r = await applyJob({ job: { key: 'OLS-1', duty: 'test', kind: 'ticket', applied: [] }, actions: [{ type: 'jira.assign', accountId: 'a' }], clients, record: async () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(calls, []);
});
