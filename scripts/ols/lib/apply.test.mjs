// T6. Spec: docs/sdd/ols-real/spec.md R9, R12, E5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED, checkActions, applyJob } from './apply.mjs';

// writes go to `calls`; the reads that check them (ols-retest-procedure R9) go to `reads`
function fakes() {
  const calls = [];
  const reads = [];
  const live = { status: 'TESTING', qaOwner: 'QA A', tcStatus: '', assignee: '' };
  let n = 0;
  return {
    calls,
    reads,
    live,
    clients: {
      jira: {
        comment: async (k, b) => (calls.push(['comment', k, b]), { id: String(++n) }),
        mention: async (k, acc, text) => (calls.push(['mention', k, acc, text]), { id: String(++n) }),
        transition: async (k, to) => (calls.push(['transition', k, to]), (live.status = to.toUpperCase())),
        tcStatus: async (k, v) => (calls.push(['tcStatus', k, v]), (live.tcStatus = v)),
        assign: async (k, a) => (calls.push(['assign', k, a]), (live.assignee = a)),
        state: async (k) => (reads.push(['state', k]), { ...live }),
        readComment: async (k, id) => (reads.push(['readComment', k, id]), { id }),
      },
      sheet: {
        createTab: async (k, rows, o) => calls.push(['createTab', k, rows.length, o.dryRun]),
        results: async (a, o) => calls.push(['results', a.tab, a.rows.length, o.dryRun]),
      },
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
  // ols-retest-procedure R3, R8: a retest applies with the cases it judged
  const judged = [{ ac: 'AC1', status: 'passed' }];
  const first = await applyJob({ job, actions, cases: judged, clients, record: async () => {} });
  assert.deepEqual([first.ok, first.error], [false, 'Jira 502 on /transitions']);
  const again = fakes();
  await applyJob({ job, actions, cases: judged, clients: again.clients, record: async () => {} });
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

test('ols-retest-procedure R7: an owner instruction is allowed for every duty, recorded once and said back in the thread', async () => {
  for (const duty of Object.keys(ALLOWED)) assert.equal(checkActions(duty, [{ type: 'owner.instruction', text: 'x' }], [{ ac: 'AC1', status: 'passed' }]), null, duty);
  assert.match(checkActions('retest', [{ type: 'owner.instruction', text: ' ' }]), /empty/);
  const { calls, clients } = fakes();
  const job = { key: 'OLS-7', duty: 'retest', kind: 'ticket', applied: [] };
  const r = await applyJob({ job, actions: [{ type: 'jira.comment', body: 'ผล' }, { type: 'owner.instruction', text: 'เมนชั่น PO' }], cases: [{ ac: 'AC1', status: 'passed' }], clients, record: async () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [['comment', 'OLS-7', 'ผล']]);
  assert.deepEqual(job.applied, ['0:jira.comment', '1:owner.instruction']);
  assert.ok(r.lines.some((l) => l.includes('เมนชั่น PO')), r.lines.join('|'));
});

test('E5: a write outside the allow-list applies nothing', async () => {
  const { calls, clients } = fakes();
  const r = await applyJob({ job: { key: 'OLS-1', duty: 'test', kind: 'ticket', applied: [] }, actions: [{ type: 'jira.assign', accountId: 'a' }], clients, record: async () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(calls, []);
});

test('R19: a pending rerun keeps the merge recorded and finishes on the next apply without merging again', async () => {
  const calls = [];
  let answer = { pending: true };
  const clients = {
    gh: { merge: async (pr) => calls.push(['merge', pr]) },
    e2e: { rerun: async (id, pr) => (calls.push(['rerun', id, pr]), answer) },
  };
  const job = { key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e', applied: [] };
  const actions = [{ type: 'e2e.merge', pr: 41 }];
  const first = await applyJob({ job, actions, clients, record: async () => {} });
  assert.deepEqual(first, { ok: false, pending: true, lines: ['merge PR #41'] });
  assert.deepEqual(job.applied, ['0:e2e.merge']);
  answer = { ok: true, summary: 'case 3/3' };
  const second = await applyJob({ job, actions, clients, record: async () => {} });
  assert.deepEqual(second, { ok: true, lines: ['รันซ้ำบน dev: case 3/3'] });
  assert.deepEqual(calls, [['merge', 41], ['rerun', 'MLV-008', 41], ['rerun', 'MLV-008', 41]]);
});

// T7 (layers 15 to 17). Spec: docs/sdd/ols-retest-procedure/spec.md R8, R9.
const SHEET = { type: 'sheet.results', sheet: 'S1', tab: 'OLS-12', gid: 7, rows: [{ row: 5, tc: 'TC_01', status: 'PASSED' }] };
const PO = { type: 'jira.mentionPo', accountId: 'po-1', cases: ['AC2'], body: 'รอ PO CF: AC2' };
const cases = [{ ac: 'AC1', status: 'passed' }, { ac: 'AC2', status: 'po-question' }];
const passedOnly = [{ ac: 'AC1', status: 'passed' }];

test('R8 (layer 15): a judging duty runs read status, comment, sheet, transition, mention, in that order', async () => {
  const { calls, reads, clients } = fakes();
  const job = { key: 'OLS-12', duty: 'retest', kind: 'ticket', applied: [] };
  const actions = [{ type: 'jira.comment', body: 'ผลรีเทส' }, SHEET, { type: 'jira.transition', to: 'Blocked' }, PO];
  assert.equal(checkActions('retest', actions, cases), null);
  const r = await applyJob({ job, actions, cases, clients, record: async () => {} });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(reads[0], ['state', 'OLS-12'], 'the current status and QA Owner are read before any write');
  assert.deepEqual(calls.map((c) => c[0]), ['comment', 'results', 'results', 'transition', 'mention']);
  assert.deepEqual(calls[1], ['results', 'OLS-12', 1, true], 'the sheet runs a dry run first');
  assert.deepEqual(job.steps.map((s) => s.step), ['read-state', '0:jira.comment', '1:sheet.results', '2:jira.transition', '3:jira.mentionPo']);
  assert.deepEqual(job.steps[0], { step: 'read-state', ok: true, readBack: 'status TESTING, QA Owner QA A' });
});

test('R8 (layer 15): actions out of that order are refused before anything is written', async () => {
  const wrong = [SHEET, { type: 'jira.comment', body: 'ผล' }];
  assert.match(checkActions('retest', wrong, passedOnly), /order: jira\.comment must come before sheet\.results/);
  const { calls, clients } = fakes();
  const r = await applyJob({ job: { key: 'OLS-1', duty: 'retest', kind: 'ticket', applied: [] }, actions: wrong, cases: passedOnly, clients, record: async () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(calls, []);
  // an owner instruction may follow anything
  assert.equal(checkActions('retest', [{ type: 'jira.comment', body: 'x' }, { type: 'owner.instruction', text: 'y' }], passedOnly), null);
});

test('R8 (layer 16): any po-question case forces a transition to BLOCKED and a PO mention naming every such case', () => {
  const comment = { type: 'jira.comment', body: 'ผล' };
  assert.match(checkActions('retest', [comment], cases), /po-question .*BLOCKED/);
  assert.match(checkActions('retest', [comment, { type: 'jira.transition', to: 'Done' }, PO], cases), /po-question .*BLOCKED/);
  assert.match(checkActions('retest', [comment, { type: 'jira.transition', to: 'BLOCKED' }], cases), /mention the PO on AC2/);
  assert.match(checkActions('retest', [comment, { type: 'jira.transition', to: 'blocked' }, { ...PO, cases: ['AC9'] }], cases), /mention the PO on AC2/);
  assert.equal(checkActions('retest', [comment, { type: 'jira.transition', to: 'blocked' }, PO], cases), null);
  assert.match(checkActions('retest', [comment, { ...PO, accountId: '' }], passedOnly), /names no account/);
  // a judging duty's actions are always checked against its cases
  assert.match(checkActions('retest', [comment]), /cases/);
});

test('R9 (layer 17): every write is read back; a read-back that does not match stops the apply', async () => {
  const { reads, clients } = fakes();
  const job = { key: 'OLS-12', duty: 'retest', kind: 'ticket', applied: [] };
  const r = await applyJob({ job, actions: [{ type: 'jira.comment', body: 'ผล' }, { type: 'jira.transition', to: 'Done' }], cases: passedOnly, clients, record: async () => {} });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(reads, [['state', 'OLS-12'], ['readComment', 'OLS-12', '1'], ['state', 'OLS-12']]);
  assert.ok(job.steps.every((s) => s.ok && s.readBack), JSON.stringify(job.steps));
  // a transition Jira did not make
  const f = fakes();
  f.clients.jira.transition = async (k, to) => f.calls.push(['transition', k, to]);
  const job2 = { key: 'OLS-13', duty: 'retest', kind: 'ticket', applied: [] };
  const r2 = await applyJob({ job: job2, actions: [{ type: 'jira.transition', to: 'Done' }], cases: passedOnly, clients: f.clients, record: async () => {} });
  assert.deepEqual([r2.ok, r2.error], [false, 'read-back: OLS-13 status is TESTING, not Done']);
  assert.deepEqual(job2.steps.at(-1), { step: '0:jira.transition', ok: false, readBack: 'status TESTING' });
  assert.ok(!job2.applied.includes('0:jira.transition'), 'a write that did not read back is not recorded as applied');
  // a comment that cannot be read back
  const g = fakes();
  g.clients.jira.readComment = async () => null;
  const r3 = await applyJob({ job: { key: 'OLS-14', duty: 'retest', kind: 'ticket', applied: [] }, actions: [{ type: 'jira.comment', body: 'x' }], cases: passedOnly, clients: g.clients, record: async () => {} });
  assert.deepEqual([r3.ok, r3.error], [false, 'read-back: comment 1 on OLS-14 not found']);
});
