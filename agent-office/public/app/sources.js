// Agent Office live page: the R58 source line of every number, and the Bangkok time format of the clock.
// Spec: docs/sdd/agent-office-live/spec.md R0, R11, R12, R40, R58. Task T34.
// Pure: no DOM, no network. The page imports it from ./app/sources.js; the function imports it through
// agent-office/lib/sources.mjs, which re-exports this file, so both sides format a source line the same way
// (one shared function, memory "No logic conflict").

/** R40: the text of a value that has no source. Never "฿0", "0" or a dash. */
export const NO_SOURCE = 'ยังไม่มีแหล่งข้อมูล';

/** R12: "Fri 16 Oct 2026 6.45 PM" in Asia/Bangkok, the mock's `tick` format. Returns '' for a missing or bad time. */
export function fmtBangkok(time) {
  if (time === null || time === undefined || time === '') return '';
  const d = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(d.getTime())) return '';
  const o = {};
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Bangkok' })
    .formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return `${o.weekday} ${o.day} ${o.month} ${o.year} ${o.hour}.${o.minute} ${String(o.dayPeriod).toUpperCase()}`;
}

const MAX_IDS = 8;
function idList(ids) {
  if (!Array.isArray(ids) || !ids.length) return '';
  const shown = ids.slice(0, MAX_IDS).map(String).join(', ');
  return ids.length > MAX_IDS ? `${shown} +${ids.length - MAX_IDS}` : shown;
}

/**
 * A source entry: { fact, ids?, time }. `fact` names the real fact ("label agent:building บน GitHub"),
 * `ids` the issues, runs or shas it counted, `time` the data's own time.
 */
export function source(fact, ids, time) {
  return { fact: String(fact), ids: Array.isArray(ids) ? ids.slice() : [], time: time ?? null };
}

/** R58: "ที่มา: <source> · <time>". Null when the entry is missing or names no fact or no valid time. */
export function sourceLine(entry) {
  if (!entry || !entry.fact) return null;
  const when = fmtBangkok(entry.time);
  if (!when) return null;
  const ids = idList(entry.ids);
  return `ที่มา: ${entry.fact}${ids ? ' ของ ' + ids : ''} · ${when}`;
}

// An issue's key is the function's (agent-office/lib/derive.mjs issueKey, review N8); no second key rule here.
const keyOf = i => i.key || String(i.n);

/**
 * The source entries of the board's numbers, computed from the state the function returned (plan.md "Data shapes").
 * Keyed by the id of the element, or by "<kind>:<id>" for repeated elements. Money numbers are not here: the
 * function sends them in state.money.sources, because only it reads the usage markers and the ledger.
 */
export function boardSources(state) {
  const out = {};
  if (!state || !state.readAt) return out;
  const t = state.readAt;
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const issues = Array.isArray(state.issues) ? state.issues : [];
  const keys = list => list.map(keyOf);
  out.summaryText = source('สถานะของคนจาก label agent:* บน GitHub', keys(issues), t);
  out.hudTeam = out.summaryText;
  const lane = l => issues.filter(i => i.lane === l);
  out.cap = source('label agent:building และ agent:queued บน GitHub · limit จากไฟล์ตั้งค่า', keys([...lane('building'), ...lane('queued')]), t);
  for (const p of projects) {
    if (p.source === 'none' || p.count === null || p.count === undefined) continue;
    // ols-real R13: a mac-snapshot project is counted from Jira on the Mac, not from GitHub labels
    const fact = p.source === 'mac-snapshot' ? `ticket ของ ${p.name || p.id} ที่ QA Owner เป็นเจ้าของ จาก Jira (ส่งจาก Mac)` : `issue ที่มี label agent:* ของ ${p.name || p.id}`;
    out['project:' + p.id] = source(fact, keys(issues.filter(i => i.project === p.id)), t);
    if (p.release) out['release:' + p.id] = source('PR agent/issue-N ที่ merge เข้า release/next · ขนาดรอบจาก release.mjs', keys(issues.filter(i => i.project === p.id && (i.lane === 'release-queue' || i.lane === 'on-test-env'))), t);
  }
  return out;
}

/** R60 and R32: the "how sized" note of a size, or null when the issue has no size marker. */
export function sizeNote(size) {
  if (!size || !size.size) return null;
  const risk = Array.isArray(size.risk) ? size.risk.length : Number(size.risk) || 0;
  return `ขนาดแบบ T-shirt (relative estimation): spec ${size.rules} ข้อ · ไฟล์ ${size.files} · ความเสี่ยง ${risk} · วิธี: Mountain Goat Software, Atlassian`;
}
