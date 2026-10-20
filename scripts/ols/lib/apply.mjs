// Applying approved writes, once each. Spec: docs/sdd/ols-real/spec.md R9, R12, R19, E5;
// docs/sdd/ols-retest-procedure/spec.md R7, R8, R9 (layers 15 to 17).
import { JUDGING } from './draft-check.mjs';

/** E5: the writes each duty may propose (plan.md "actions.json"). */
export const ALLOWED = {
  'write-tc': ['sheet.createTab', 'jira.comment', 'jira.tcStatus'],
  'review-tc': ['jira.comment', 'jira.tcStatus'],
  test: ['jira.comment', 'sheet.results', 'jira.transition', 'jira.mentionPo'],
  retest: ['jira.comment', 'sheet.results', 'jira.transition', 'jira.assign', 'jira.mentionPo'],
  'e2e-fix': ['e2e.merge'],
};
const TC_VALUE = { 'write-tc': 'DONE', 'review-tc': 'QA REVIEWED' };

/**
 * ols-retest-procedure R8 (layer 15): after the automatic read of status and QA Owner, a judging
 * duty writes the comment, then the QA sheet, then the status (and the assignee), then the PO mention.
 */
const RANK = { 'jira.comment': 1, 'sheet.results': 2, 'jira.transition': 3, 'jira.assign': 3, 'jira.mentionPo': 4 };

const filled = (v) => String(v ?? '').trim().length > 0;

/** R8 (layers 15, 16): order, and BLOCKED plus a PO mention when any case is a question for the PO. */
function procedureProblem(actions, cases) {
  if (!Array.isArray(cases)) return 'a judging duty applies only with the cases it judged (cases.json)';
  let last = null;
  for (const a of actions) {
    if (!(a.type in RANK)) continue;
    if (last && RANK[a.type] < RANK[last]) return `order: ${a.type} must come before ${last} (ols-retest-procedure R8)`;
    last = a.type;
  }
  const questions = cases.filter((c) => c?.status === 'po-question').map((c) => String(c.ac));
  if (questions.length === 0) return null;
  const moves = actions.filter((a) => a.type === 'jira.transition');
  if (moves.length === 0 || moves.some((a) => String(a.to).trim().toUpperCase() !== 'BLOCKED')) {
    return `po-question cases (${questions.join(', ')}) need the status set to BLOCKED and no other (ols-retest-procedure R8)`;
  }
  const named = new Set(actions.filter((a) => a.type === 'jira.mentionPo').flatMap((a) => a.cases ?? []).map(String));
  const missing = questions.filter((q) => !named.has(q));
  if (missing.length) return `mention the PO on ${missing.join(', ')} (ols-retest-procedure R8)`;
  return null;
}

/** E5: null when every action is allowed and well formed, else the reason. */
export function checkActions(duty, actions, cases) {
  if (!Array.isArray(actions)) return 'actions is not an array';
  const allowed = ALLOWED[duty] ?? [];
  for (const [i, a] of actions.entries()) {
    const at = `action ${i + 1} (${a?.type})`;
    // ols-retest-procedure R7: a line the owner wrote after `passed` (dispatch.applyActions), any duty
    if (a?.type === 'owner.instruction') {
      if (!filled(a.text)) return `${at} is empty`;
      continue;
    }
    if (!allowed.includes(a?.type)) return `${at} is not allowed for ${duty}`;
    if (a.type === 'jira.comment' && !filled(a.body)) return `${at} has an empty body`;
    if (a.type === 'jira.transition' && !filled(a.to)) return `${at} names no status`;
    if (a.type === 'jira.tcStatus' && a.value !== TC_VALUE[duty]) return `${at} must set ${TC_VALUE[duty]}`;
    if (a.type === 'jira.assign' && !filled(a.accountId)) return `${at} names no account`;
    if (a.type === 'jira.mentionPo' && !filled(a.accountId)) return `${at} names no account`;
    if (a.type === 'jira.mentionPo' && (!Array.isArray(a.cases) || a.cases.length === 0 || !filled(a.body))) return `${at} names no case or has an empty body`;
    if (a.type === 'sheet.createTab' && (!Array.isArray(a.rows) || a.rows.length === 0)) return `${at} has no rows`;
    if (a.type === 'sheet.results' && (!filled(a.sheet) || !filled(a.tab) || !Number.isInteger(a.gid))) return `${at} names no sheet, tab or gid`;
    if (a.type === 'sheet.results' && (!Array.isArray(a.rows) || a.rows.length === 0)) return `${at} has no rows`;
    if (a.type === 'e2e.merge' && !Number.isInteger(a.pr)) return `${at} names no pull request`;
  }
  return JUDGING.has(duty) ? procedureProblem(actions, cases) : null;
}

const up = (v) => String(v ?? '').trim().toUpperCase();

/**
 * ols-retest-procedure R9 (layer 17): read each write back. Returns the read-back line, or throws
 * with what was found. The sheet script reads its own write back (its L3 audit, exit 0 = clean).
 */
async function readBack(clients, key, a, result) {
  switch (a.type) {
    case 'jira.comment':
    case 'jira.mentionPo': {
      const id = result?.id;
      const found = id ? await clients.jira.readComment(key, id) : null;
      if (!found) throw new Error(`read-back: comment ${id ?? '(no id)'} on ${key} not found`);
      return `comment ${id}`;
    }
    case 'jira.transition': {
      const s = await clients.jira.state(key);
      if (up(s.status) !== up(a.to)) throw Object.assign(new Error(`read-back: ${key} status is ${s.status}, not ${a.to}`), { readBack: `status ${s.status}` });
      return `status ${s.status}`;
    }
    case 'jira.tcStatus': {
      const s = await clients.jira.state(key);
      if (up(s.tcStatus) !== up(a.value)) throw Object.assign(new Error(`read-back: ${key} TC Status is ${s.tcStatus}, not ${a.value}`), { readBack: `TC Status ${s.tcStatus}` });
      return `TC Status ${s.tcStatus}`;
    }
    case 'jira.assign': {
      const s = await clients.jira.state(key);
      if (String(s.assignee ?? '') !== String(a.accountId)) throw Object.assign(new Error(`read-back: ${key} is not assigned to ${a.accountId}`), { readBack: `assignee ${s.assignee}` });
      return `assignee ${s.assignee}`;
    }
    case 'sheet.createTab':
    case 'sheet.results':
      return 'sheet_write.py read-back clean (exit 0)';
    default:
      return 'recorded';
  }
}

/**
 * R9: apply in order; each action is recorded (job.applied + record()) before the next, so a crash or
 * a failed call resumes after the last applied one and never repeats it. R12, R19: an e2e merge reruns;
 * a rerun still on a worker order answers { pending: true } and the next apply resumes after the merge.
 * ols-retest-procedure R8, R9: a judging duty first reads the ticket's status and QA Owner; every
 * write is read back, and each step goes into job.steps as { step, ok, readBack }.
 */
export async function applyJob({ job, actions, cases, clients, record }) {
  const bad = checkActions(job.duty, actions, cases);
  if (bad) return { ok: false, error: bad };
  job.applied = job.applied ?? [];
  job.steps = job.steps ?? [];
  const lines = [];
  const step = (s) => {
    job.steps = [...job.steps, s].slice(-50);
  };
  try {
    if (JUDGING.has(job.duty)) {
      // R8: the ticket as it is now, before any write
      const s = await clients.jira.state(job.key);
      step({ step: 'read-state', ok: true, readBack: `status ${s.status}, QA Owner ${s.qaOwner || '(none)'}` });
      await record(job);
    }
    for (const [i, a] of actions.entries()) {
      const id = `${i}:${a.type}`;
      if (a.type === 'e2e.merge') {
        // R12, R19: the merge is recorded once; the rerun may still be pending on a worker order
        if (!job.applied.includes(id)) {
          await clients.gh.merge(a.pr);
          lines.push(`merge PR #${a.pr}`);
          job.applied.push(id);
          await record(job);
        }
        if (job.applied.includes(`${id}:rerun`)) continue;
        const r = await clients.e2e.rerun(job.key, a.pr);
        if (r.pending) return { ok: false, pending: true, lines };
        if (!r.ok) return { ok: false, error: `รันซ้ำบน dev ไม่ผ่าน: ${r.summary}`, lines };
        lines.push(`รันซ้ำบน dev: ${r.summary}`);
        job.applied.push(`${id}:rerun`);
        await record(job);
        continue;
      }
      if (job.applied.includes(id)) continue;
      let result;
      switch (a.type) {
        case 'jira.comment': result = await clients.jira.comment(job.key, a.body); lines.push('คอมเมนต์ใน Jira แล้ว'); break;
        case 'jira.transition': result = await clients.jira.transition(job.key, a.to); lines.push(`เปลี่ยนสถานะเป็น ${a.to} แล้ว`); break;
        case 'jira.tcStatus': result = await clients.jira.tcStatus(job.key, a.value); lines.push(`TC Status เป็น ${a.value} แล้ว`); break;
        case 'jira.assign': result = await clients.jira.assign(job.key, a.accountId); lines.push('มอบหมายกลับให้ dev แล้ว'); break;
        case 'jira.mentionPo': result = await clients.jira.mention(job.key, a.accountId, a.body); lines.push(`เมนชั่น PO ในเคส ${a.cases.join(', ')} แล้ว`); break;
        case 'sheet.createTab':
          await clients.sheet.createTab(job.key, a.rows, { dryRun: true }); // P10: --dry-run first
          await clients.sheet.createTab(job.key, a.rows, { dryRun: false });
          lines.push(`สร้าง tab ${job.key} ${a.rows.length} แถวแล้ว`);
          break;
        case 'sheet.results':
          await clients.sheet.results(a, { dryRun: true }); // P10: --dry-run first
          await clients.sheet.results(a, { dryRun: false });
          lines.push(`อัปเดตผล ${a.rows.length} แถวในชีท tab ${a.tab} แล้ว`);
          break;
        // ols-retest-procedure R7: free text has no automatic step (spec open question Q2); it is
        // recorded and said back in the thread so it is never silently dropped
        case 'owner.instruction': lines.push(`คำสั่งจากเจ้าของที่ยังต้องทำต่อ: ${a.text}`); break;
      }
      try {
        step({ step: id, ok: true, readBack: await readBack(clients, job.key, a, result) });
      } catch (e) {
        step({ step: id, ok: false, readBack: e?.readBack ?? (e instanceof Error ? e.message : String(e)) });
        await record(job);
        throw e;
      }
      job.applied.push(id);
      await record(job);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), lines };
  }
  return { ok: true, lines };
}
