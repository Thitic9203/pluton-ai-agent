// OLS intake: which duty a ticket gets. Spec: docs/sdd/ols-real/spec.md R1, R2, R3. Pure.

/** R1: the owner's QA work (P1, P3: QA Owner only; READY TO TEST is To Do category, so statusCategory). */
export const JQL = 'project = OLS AND cf[12120] = currentUser() AND statusCategory != Done';
export const FIELDS = ['summary', 'status', 'issuetype', 'customfield_12128', 'created'];

/** The mock's Thai names (mock lines 423, 633 to 634). */
export const DUTY_TH = { 'write-tc': 'เขียนเทสเคส', 'review-tc': 'รีวิวเทสเคส', test: 'ทดสอบ', retest: 'รีเทสบัค', 'e2e-fix': 'แก้เคส e2e' };

const IN_TEST = new Set(['READY TO TEST', 'TESTING']);
const HAS_TC = new Set(['DONE', 'QA REVIEWED']);
const up = (v) => String(v ?? '').trim().toUpperCase();
const optionValue = (f) => (f && typeof f === 'object' ? f.value : f);

/** @returns {{ key: string, n: number, summary: string, type: string, status: string, tcStatus: string, created: string|null } | null} */
export function normalize(raw) {
  const m = /^OLS-(\d+)$/.exec(String(raw?.key ?? ''));
  if (!m) return null;
  const f = raw.fields ?? {};
  const created = f.created ? new Date(f.created) : null;
  return {
    key: raw.key,
    n: Number(m[1]),
    summary: String(f.summary ?? ''),
    type: String(f.issuetype?.name ?? '').trim().toLowerCase(),
    status: up(f.status?.name),
    tcStatus: up(optionValue(f.customfield_12128)),
    created: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
  };
}

/** R2: one duty per ticket, or null when it waits. R3 follows from TC Status moving after each approval. */
export function dutyOf(t) {
  if (!t) return null;
  const inTest = IN_TEST.has(t.status);
  if (t.type === 'story') {
    if (!HAS_TC.has(t.tcStatus)) return 'write-tc';
    if (t.tcStatus === 'DONE') return 'review-tc';
    return inTest ? 'test' : null;
  }
  if (t.type === 'bug' || t.type === 'task') return inTest ? 'retest' : null;
  return null;
}
