// The owner's gate: drafts to the Slack DM and the `passed` reply. Spec: docs/sdd/ols-real/spec.md R7, R8
// (R8 as amended by docs/sdd/ols-retest-procedure/spec.md R7: `passed` on the first line, instructions after). Pure.
import { DUTY_TH } from './classify.mjs';
import { JUDGING } from './draft-check.mjs';

/** P4: AI Agent Bot <-> owner DM, and the owner's Slack user. */
export const CHANNEL = 'D0ASX9ML4G6';
export const OWNER = 'U06QB9UVAG4';

/** R8: one line is `passed`, any case, an optional trailing `.` or `!`. */
export const isPassed = (text) => /^passed[.!]?$/.test(String(text ?? '').trim().toLowerCase());

/**
 * ols-retest-procedure R7 (supersedes the whole-reply rule of ols-real R8): the first line is
 * `passed`; every non-empty line after it is an instruction for the same apply. null when not approved.
 */
export function approval(text) {
  const [first, ...rest] = String(text ?? '').trim().split('\n');
  if (!isPassed(first)) return null;
  return { instructions: rest.map((l) => l.trim()).filter(Boolean) };
}

/** R8: the latest owner reply later than the draft decides; nothing else counts. */
export function verdict({ replies, draftTs }) {
  const mine = (replies ?? []).filter((m) => m.user === OWNER && Number(m.ts) > Number(draftTs));
  if (mine.length === 0) return { kind: 'none' };
  const last = mine.reduce((a, b) => (Number(b.ts) > Number(a.ts) ? b : a));
  const ok = approval(last.text);
  return ok ? { kind: 'passed', ts: last.ts, instructions: ok.instructions } : { kind: 'feedback', text: String(last.text ?? ''), ts: last.ts };
}

/** ols-real R24: a body is shown exactly as it will be posted, between code fences. */
const verbatim = (body) => `\n\`\`\`\n${String(body ?? '')}\n\`\`\``;

const describe = (a) => {
  switch (a?.type) {
    case 'jira.comment': return `คอมเมนต์ใน Jira ข้อความนี้ตรงตัว:${verbatim(a.body)}`;
    case 'jira.transition': return `เปลี่ยนสถานะเป็น ${a.to}`;
    case 'jira.tcStatus': return `ตั้ง TC Status เป็น ${a.value}`;
    case 'jira.assign': return 'มอบหมายกลับให้ dev';
    case 'sheet.createTab': return `สร้าง tab เทสเคส ${Array.isArray(a.rows) ? a.rows.length : 0} แถวในชีท QA`;
    case 'sheet.results': return `อัปเดตผล ${Array.isArray(a.rows) ? a.rows.length : 0} แถวในชีท QA tab ${a.tab}`;
    case 'jira.mentionPo': return `เมนชั่น PO ในเคสที่รอ PO CF: ${(a.cases ?? []).join(', ')} (บัญชี ${a.accountId}) ข้อความนี้ตรงตัว:${verbatim(a.body)}`;
    case 'e2e.merge': return `merge PR #${a.pr} แล้วรันเคสและชุดเต็มซ้ำบน dev`;
    default: return String(a?.type ?? 'ไม่ทราบ');
  }
};

/** R7: what the owner reads before replying `passed`. Slack caps a message near 40k; drafts stay well under. */
export function draftText(job, draft, actions) {
  const head = `[${job.key}] ${DUTY_TH[job.duty] ?? job.duty} · ร่างรออนุมัติ`;
  const writes = (actions ?? []).map((a, i) => `${i + 1}. ${describe(a)}`).join('\n') || '(ไม่มีการเขียนใดๆ)';
  // ols-retest-procedure R8: a judging duty reads the ticket as it is now before its first write
  const list = JUDGING.has(job.duty) ? `0. อ่านสถานะ ticket และ QA Owner ปัจจุบันก่อนเขียน\n${writes}` : writes;
  return `${head}\n\n${String(draft).slice(0, 30000)}\n\nสิ่งที่จะทำเมื่ออนุมัติ:\n${list}\n\nตอบ passed ในเธรดนี้เพื่ออนุมัติครับ (บรรทัดถัดจาก passed คือคำสั่งที่จะทำเพิ่มในรอบเดียวกัน) ถ้าต้องแก้ พิมพ์สิ่งที่ต้องแก้ในเธรดนี้ได้เลยครับ`;
}
