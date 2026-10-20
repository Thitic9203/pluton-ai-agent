// Applying approved writes, once each. Spec: docs/sdd/ols-real/spec.md R9, R12, E5.

/** E5: the writes each duty may propose (plan.md "actions.json"). */
export const ALLOWED = {
  'write-tc': ['sheet.createTab', 'jira.comment', 'jira.tcStatus'],
  'review-tc': ['jira.comment', 'jira.tcStatus'],
  test: ['jira.comment', 'jira.transition'],
  retest: ['jira.comment', 'jira.transition', 'jira.assign'],
  'e2e-fix': ['e2e.merge'],
};
const TC_VALUE = { 'write-tc': 'DONE', 'review-tc': 'QA REVIEWED' };

/** E5: null when every action is allowed and well formed, else the reason. */
export function checkActions(duty, actions) {
  if (!Array.isArray(actions)) return 'actions is not an array';
  const allowed = ALLOWED[duty] ?? [];
  for (const [i, a] of actions.entries()) {
    const at = `action ${i + 1} (${a?.type})`;
    if (!allowed.includes(a?.type)) return `${at} is not allowed for ${duty}`;
    if (a.type === 'jira.comment' && !String(a.body ?? '').trim()) return `${at} has an empty body`;
    if (a.type === 'jira.transition' && !String(a.to ?? '').trim()) return `${at} names no status`;
    if (a.type === 'jira.tcStatus' && a.value !== TC_VALUE[duty]) return `${at} must set ${TC_VALUE[duty]}`;
    if (a.type === 'jira.assign' && !String(a.accountId ?? '').trim()) return `${at} names no account`;
    if (a.type === 'sheet.createTab' && (!Array.isArray(a.rows) || a.rows.length === 0)) return `${at} has no rows`;
    if (a.type === 'e2e.merge' && !Number.isInteger(a.pr)) return `${at} names no pull request`;
  }
  return null;
}

/**
 * R9: apply in order; each action is recorded (job.applied + record()) before the next, so a crash or
 * a failed call resumes after the last applied one and never repeats it. R12: an e2e merge reruns.
 */
export async function applyJob({ job, actions, clients, record }) {
  const bad = checkActions(job.duty, actions);
  if (bad) return { ok: false, error: bad };
  job.applied = job.applied ?? [];
  const lines = [];
  try {
    for (const [i, a] of actions.entries()) {
      const id = `${i}:${a.type}`;
      if (job.applied.includes(id)) continue;
      switch (a.type) {
        case 'jira.comment': await clients.jira.comment(job.key, a.body); lines.push('คอมเมนต์ใน Jira แล้ว'); break;
        case 'jira.transition': await clients.jira.transition(job.key, a.to); lines.push(`เปลี่ยนสถานะเป็น ${a.to} แล้ว`); break;
        case 'jira.tcStatus': await clients.jira.tcStatus(job.key, a.value); lines.push(`TC Status เป็น ${a.value} แล้ว`); break;
        case 'jira.assign': await clients.jira.assign(job.key, a.accountId); lines.push('มอบหมายกลับให้ dev แล้ว'); break;
        case 'sheet.createTab':
          await clients.sheet.createTab(job.key, a.rows, { dryRun: true }); // P10: --dry-run first
          await clients.sheet.createTab(job.key, a.rows, { dryRun: false });
          lines.push(`สร้าง tab ${job.key} ${a.rows.length} แถวแล้ว`);
          break;
        case 'e2e.merge': {
          await clients.gh.merge(a.pr);
          lines.push(`merge PR #${a.pr}`);
          job.applied.push(id);
          await record(job);
          const r = await clients.e2e.rerun(job.key);
          if (!r.ok) return { ok: false, error: `รันซ้ำบน dev ไม่ผ่าน: ${r.summary}`, lines };
          lines.push(`รันซ้ำบน dev: ${r.summary}`);
          continue;
        }
      }
      job.applied.push(id);
      await record(job);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), lines };
  }
  return { ok: true, lines };
}
