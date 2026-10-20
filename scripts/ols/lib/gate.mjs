// The owner's gate: drafts to the Slack DM and the `passed` reply. Spec: docs/sdd/ols-real/spec.md R7, R8. Pure.
import { DUTY_TH } from './classify.mjs';

/** P4: AI Agent Bot <-> owner DM, and the owner's Slack user. */
export const CHANNEL = 'D0ASX9ML4G6';
export const OWNER = 'U06QB9UVAG4';

/** R8: the whole reply is `passed`, any case, an optional trailing `.` or `!`. */
export const isPassed = (text) => /^passed[.!]?$/.test(String(text ?? '').trim().toLowerCase());

/** R8: the latest owner reply later than the draft decides; nothing else counts. */
export function verdict({ replies, draftTs }) {
  const mine = (replies ?? []).filter((m) => m.user === OWNER && Number(m.ts) > Number(draftTs));
  if (mine.length === 0) return { kind: 'none' };
  const last = mine.reduce((a, b) => (Number(b.ts) > Number(a.ts) ? b : a));
  return isPassed(last.text) ? { kind: 'passed', ts: last.ts } : { kind: 'feedback', text: String(last.text ?? ''), ts: last.ts };
}

const describe = (a) => {
  switch (a?.type) {
    case 'jira.comment': return 'คอมเมนต์ใน Jira (ข้อความตามร่างด้านบน)';
    case 'jira.transition': return `เปลี่ยนสถานะเป็น ${a.to}`;
    case 'jira.tcStatus': return `ตั้ง TC Status เป็น ${a.value}`;
    case 'jira.assign': return 'มอบหมายกลับให้ dev';
    case 'sheet.createTab': return `สร้าง tab เทสเคส ${Array.isArray(a.rows) ? a.rows.length : 0} แถวในชีท QA`;
    case 'e2e.merge': return `merge PR #${a.pr} แล้วรันเคสและชุดเต็มซ้ำบน dev`;
    default: return String(a?.type ?? 'ไม่ทราบ');
  }
};

/** R7: what the owner reads before replying `passed`. Slack caps a message near 40k; drafts stay well under. */
export function draftText(job, draft, actions) {
  const head = `[${job.key}] ${DUTY_TH[job.duty] ?? job.duty} · ร่างรออนุมัติ`;
  const list = (actions ?? []).map((a, i) => `${i + 1}. ${describe(a)}`).join('\n') || '(ไม่มีการเขียนใดๆ)';
  return `${head}\n\n${String(draft).slice(0, 30000)}\n\nสิ่งที่จะทำเมื่ออนุมัติ:\n${list}\n\nตอบ passed ในเธรดนี้เพื่ออนุมัติครับ ถ้าต้องแก้ พิมพ์สิ่งที่ต้องแก้ในเธรดนี้ได้เลยครับ`;
}
