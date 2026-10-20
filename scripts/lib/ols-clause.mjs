/**
 * The OLS retest procedure clause stays word for word in every OLS prompt (layer 19 of
 * docs/sdd/ols-retest-procedure/spec.md). Owner, 20 Oct 2026: "ให้ Agent จดจำสเตปการทำงานนี้ไว้",
 * "เสมอ", "สร้างแนวป้องกัน 20 ชั้นไม่ให้พลาด".
 *
 * One pure function, so docs-check and its test can never disagree.
 */

/** Layer 7: the brief that holds the clause. */
export const BRIEF = 'docs/agent-brief-ols.md';

/** Layers 5 and 6: the prompts that must carry it. */
export const PROMPT_FILES = ['.claude/agents/ols-qa-worker.md', 'scripts/ols/scheduled-task/ols-agent/SKILL.md'];

/** The fenced text block under the "The clause" heading of the brief, or null. */
export function clauseOf(brief) {
  const m = /^## The clause\s*\n+```text\n([\s\S]*?)\n```/m.exec(String(brief ?? ''));
  return m ? m[1] : null;
}

/**
 * docs-check verdict: the brief holds the clause with its catch-ai step (layers 7, 20), and every
 * prompt file carries it word for word (layers 5, 6, 19).
 * @param {{ brief: string, files: Record<string, string | null> }} input
 * @returns {string[]}
 */
export function olsClauseProblems({ brief, files }) {
  const clause = clauseOf(brief);
  if (!clause) return [`${BRIEF}: the fenced clause under "The clause" is missing (layer 7)`];
  const problems = [];
  if (!clause.includes('(catch-ai)')) problems.push(`${BRIEF}: the clause no longer names the catch-ai audit before a report (layer 20)`);
  for (const [path, text] of Object.entries(files ?? {})) {
    if (text == null) problems.push(`${path}: missing (spec docs/sdd/ols-retest-procedure, layer 19)`);
    else if (!text.includes(clause)) problems.push(`${path}: the OLS retest procedure clause of ${BRIEF} is missing or not word for word (spec docs/sdd/ols-retest-procedure, layer 19)`);
  }
  return problems;
}
