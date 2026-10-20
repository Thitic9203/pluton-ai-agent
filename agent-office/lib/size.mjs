// Work size by relative T-shirt estimation, with the facts it was sized from.
// Spec: docs/sdd/agent-office-live/spec.md R32, R60.

/** The risk flags of R60: UI or mock, security rules, workflows or secrets, stored data. */
export const RISK_FLAGS = ['ui', 'rules', 'workflow', 'data'];

const SIZE_LABEL = /^size:(S|M|L|XL)$/;
const MARKER = /<!--\s*agent-office:size\s+(\{.*?\})\s*-->/;

/**
 * @typedef {{ rules: number, files: number, risk: string[] }} PlanFacts
 * @typedef {{ size: 'S'|'M'|'L'|'XL', rules: number, files: number, risk: string[], score: number|null }} SizeMarker
 */

/**
 * Score = rules × w.rule + files × w.file + distinct known risk flags × w.riskFlag (R60).
 * @param {PlanFacts} facts
 * @param {{ rule: number, file: number, riskFlag: number }} weights
 */
export function sizeScore({ rules, files, risk }, weights) {
  const flags = new Set((risk ?? []).filter((r) => RISK_FLAGS.includes(r)));
  return rules * weights.rule + files * weights.file + flags.size * weights.riskFlag;
}

/**
 * S up to thresholds.S, M up to thresholds.M, L up to thresholds.L, XL above (R60).
 * @param {number} score
 * @param {{ S: number, M: number, L: number }} t
 * @returns {'S'|'M'|'L'|'XL'}
 */
export function sizeFromScore(score, t) {
  if (score <= t.S) return 'S';
  if (score <= t.M) return 'M';
  if (score <= t.L) return 'L';
  return 'XL';
}

/**
 * The PO's size marker in a comment body, or null when absent or malformed.
 * @param {string} body
 * @returns {SizeMarker|null}
 */
export function parseSizeMarker(body) {
  const m = MARKER.exec(String(body ?? ''));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    const ok = ['S', 'M', 'L', 'XL'].includes(o?.size) && Number.isInteger(o.rules) && o.rules >= 0 && Number.isInteger(o.files) && o.files >= 0 && Array.isArray(o.risk) && o.risk.every((r) => typeof r === 'string');
    if (!ok) return null;
    return { size: o.size, rules: o.rules, files: o.files, risk: o.risk, score: Number.isFinite(o.score) ? o.score : null };
  } catch {
    return null;
  }
}

/**
 * The size label as it stood when Gate 1 was approved (R60). A later change is ignored and warned.
 * With no Gate 1 yet, the current label counts.
 * @param {{ event?: string, label?: { name?: string }, created_at?: string }[]} timeline
 * @param {string|null} gate1At ISO time of the Gate 1 approval, or null
 * @returns {{ size: 'S'|'M'|'L'|'XL'|null, warnings: string[] }}
 */
export function sizeAtGate1(timeline, gate1At) {
  const cut = gate1At === null ? Infinity : Date.parse(gate1At);
  const evs = (timeline ?? [])
    .map((e, i) => ({ e, i, at: Date.parse(String(e?.created_at ?? '')), m: SIZE_LABEL.exec(String(e?.label?.name ?? '')) }))
    .filter((x) => x.m && (x.e.event === 'labeled' || x.e.event === 'unlabeled') && Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  /** @type {Set<string>} */
  const on = new Set();
  let changedAfter = false;
  for (const x of evs) {
    if (x.at > cut) {
      changedAfter = true;
      continue;
    }
    if (x.e.event === 'labeled') on.add(x.m[1]);
    else on.delete(x.m[1]);
  }
  const warnings = changedAfter ? ['size label changed after Gate 1; the Gate-1 size counts'] : [];
  if (on.size > 1) warnings.push(`several size labels at Gate 1: ${[...on].join(', ')}`);
  const size = on.size === 1 ? /** @type {'S'|'M'|'L'|'XL'} */ ([...on][0]) : null;
  return { size, warnings };
}

/**
 * The "how sized" note shown with a size (R32, R58, R60).
 * @param {SizeMarker|null} marker
 */
export function sizeNote(marker) {
  const facts = marker ? `spec ${marker.rules} ข้อ · ไฟล์ ${marker.files} · ความเสี่ยง ${new Set(marker.risk.filter((r) => RISK_FLAGS.includes(r))).size}` : 'ไม่มีบันทึกข้อมูลที่ใช้ประเมิน';
  return `ขนาดแบบ T-shirt (relative estimation): ${facts} · วิธี: Mountain Goat Software, Atlassian`;
}

/** The size on a card, or the unsized text (R32). @param {string|null} size */
export const cardSize = (size) => size ?? 'ยังไม่ประเมินขนาด';
