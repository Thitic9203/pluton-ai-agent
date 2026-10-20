// The OLS cards of the board, from the `OLS_BOARD` repository variable the Mac sets
// (docs/sdd/ols-real/spec.md R13, R14, E4; agent-office-live R65, E4). Pure; data only, never code.

const DUTY_TH = { 'write-tc': 'เขียนเทสเคส', 'review-tc': 'รีวิวเทสเคส', test: 'ทดสอบ', retest: 'รีเทสบัค', 'e2e-fix': 'แก้เคส e2e' };
const PHASES = new Set(['queued', 'working', 'waiting', 'failed', 'done', 'idle']);
const MAX_ITEMS = 200;

const validItem = (x) =>
  x && typeof x === 'object' &&
  Number.isInteger(x.n) && x.n > 0 &&
  typeof x.summary === 'string' && x.summary.length <= 80 &&
  (x.duty === null || Object.hasOwn(DUTY_TH, x.duty)) &&
  PHASES.has(x.phase);

/**
 * E4: null unless the whole payload validates. R14: lane `test-planning` (mock lines 633 to 634, 7115),
 * `blocked` from it when the job failed; the title is the duty in Thai, then the summary.
 * @param {string|undefined} text
 * @returns {{ readAt: string, issues: object[] } | null}
 */
export function parseOlsBoard(text) {
  let d;
  try {
    d = JSON.parse(String(text ?? ''));
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) return null;
  if (typeof d.readAt !== 'string' || Number.isNaN(Date.parse(d.readAt))) return null;
  if (!Array.isArray(d.items) || d.items.length > MAX_ITEMS || !d.items.every(validItem)) return null;
  const issues = d.items.map((x) => ({
    project: 'ols',
    n: x.n,
    title: x.duty ? `${DUTY_TH[x.duty]} · ${x.summary}` : x.summary,
    lane: x.phase === 'failed' ? 'blocked' : 'test-planning',
    from: x.phase === 'failed' ? 'test-planning' : null,
    createdAt: d.readAt,
    labels: [],
  }));
  return { readAt: d.readAt, issues };
}
