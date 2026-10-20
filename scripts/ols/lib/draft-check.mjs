// The draft check (layer 14). Spec: docs/sdd/ols-retest-procedure/spec.md R2, R3. Pure.
//
// A duty that judges cases writes cases.json next to draft.md: one entry per case,
// { ac, status: 'passed'|'failed'|'blocked'|'po-question', source?, conflict?, refusal? }.

/** R2, R3: the duties that judge cases against the ticket, and so must write cases.json. */
export const JUDGING = new Set(['test', 'retest']);

export const CASE_STATUSES = new Set(['passed', 'failed', 'blocked', 'po-question']);

const filled = (v) => String(v ?? '').trim().length > 0;

/** R2, R3: every reason the cases cannot reach the owner; [] when they may. */
export function draftProblems(cases) {
  if (!Array.isArray(cases)) return ['cases.json is not an array'];
  if (cases.length === 0) return ['cases.json lists no case'];
  const out = [];
  for (const [i, c] of cases.entries()) {
    if (!filled(c?.ac)) {
      out.push(`case ${i + 1} names no AC`);
      continue;
    }
    const at = `case ${i + 1} (${c.ac})`;
    if (!CASE_STATUSES.has(c.status)) {
      out.push(`${at} has status "${c?.status}"; use passed, failed, blocked or po-question`);
      continue;
    }
    // R3: FAILED only against a quoted, confirmed source; sources that disagree are a PO question
    if (c.status === 'failed' && !filled(c.source)) out.push(`${at} is failed with no quoted source (R3)`);
    else if (c.status === 'failed' && filled(c.conflict)) out.push(`${at} is failed but its sources disagree (${String(c.conflict).trim()}); mark it po-question (R3)`);
    // R2: BLOCKED only when creating the data is impossible, with the refusal quoted
    if (c.status === 'blocked' && !filled(c.refusal)) out.push(`${at} is blocked with no quoted refusal of creating its data (R2)`);
  }
  return out;
}
