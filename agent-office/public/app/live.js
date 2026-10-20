// Agent Office live page: everything the page shows comes from GET /data/state.json (plan.md "Data shapes").
// Spec: docs/sdd/agent-office-live/spec.md R0, R8, R10, R11, R13, R16, R17, R21, R24, R32, R33, R34, R36, R40,
// R45, R49, R58. Tasks T17, T34.
//
// The pure part (viewOf, issuesOf, releaseText, workEvents, freshText) has no DOM and no network, so node --test
// runs it on fixtures. start() is the only browser part: Google sign-in through Firebase Auth, then a read every
// 60 seconds while the tab is visible and never while it is hidden.
import { NO_SOURCE, fmtBangkok, sourceLine, boardSources, sizeNote } from './sources.js';

export { NO_SOURCE, fmtBangkok };
export const STATE_PATH = '/data/state.json'; // the published snapshot, guarded by functions/data/_middleware.ts (R42)
export const POLL_MS = 60 * 1000; // R11: at most every 60 seconds
export const AGENT_OFF = 'agent ยังไม่เปิดใช้งาน'; // R10
export const NO_FX = 'ยังอ่านอัตราไม่ได้'; // R13
export const NOT_CUT = 'ยังไม่ตัดรอบ'; // R63
export const NO_SIZE = 'ยังไม่ประเมินขนาด'; // R32
export const NO_REPORT = 'ไม่มีรายงาน'; // R57

export const baht = n => '฿' + Math.round(n).toLocaleString('en-US');
export const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

/** R11: the freshness line. */
export function freshText(readAt, failed) {
  const t = fmtBangkok(readAt);
  if (!t) return failed ? 'อ่านข้อมูลไม่สำเร็จ' : '';
  return failed ? `ข้อมูลล่าสุดเมื่อ ${t} · อ่านไม่สำเร็จ` : `อัปเดตล่าสุด ${t}`;
}

/** A shown value: its text and its R58 line. A number with no line shows the R40 text instead (R0). */
function cell(text, entry) {
  const line = sourceLine(entry);
  if (text === null || text === undefined || !line) return { text: NO_SOURCE, line: null, none: true };
  return { text: String(text), line, none: false };
}

/** Issues in the shape the mock's render code reads (n, title, lane, from, project name, size, kind). */
export function issuesOf(state) {
  const projects = (state && state.projects) || [];
  const nameOf = id => { const p = projects.find(x => x.id === id); return (p && (p.name || p.id)) || id; };
  return ((state && state.issues) || []).map(i => ({
    // key: the function's, from agent-office/lib/derive.mjs issueKey (review N8); the page has no key rule of its own
    n: i.n, key: i.key ?? null, title: i.title, lane: i.lane, from: i.from ?? null, project: nameOf(i.project), projectId: i.project, url: i.url,
    size: i.size && i.size.size ? i.size.size : null, sizeNote: sizeNote(i.size), kind: i.improvement ? 'improvement' : undefined
  }));
}

/** Projects with their config fields (name, tag, description, key format), as the Projects tab and the chips need. */
export function projectsOf(state) {
  return ((state && state.projects) || []).map(p => ({ ...p, name: p.name || p.id }));
}

/** R68: the function writes the label's phase `on-test-env`; the page's tables key it `on-test`. */
export const phaseKey = (phase) => (phase === 'on-test-env' ? 'on-test' : phase);

/** R8, R68: the text of a release holder's phase, from the holder's `{ project, phase }`. */
const HOLDER_TEXT = { approve: 'QA Lead อนุมัติ deploy staging', 'on-test': 'อยู่ในรอบ release', regression: 'QA รัน regression', prod: 'deploy production รอบ release' };
export function holderText(release) {
  if (!release) return null;
  return HOLDER_TEXT[phaseKey(release.phase)] || NO_SOURCE;
}

/** R8, R34, R57: what a project's release card says. */
export function releaseText(rel, nameOfProject) {
  if (!rel) return { t: NO_SOURCE, p: NO_SOURCE, bar: 0, phase: null };
  const batch = rel.batch, q = rel.queued, n = rel.inRound ?? q;
  const wait = `รอครบ ${q}/${batch}`;
  switch (phaseKey(rel.phase)) {
    case 'approve': return { t: wait, p: `QA Lead อนุมัติ deploy staging · ${q} ใบ`, bar: 100, phase: 'approve' };
    case 'on-test': return { t: wait, p: `อยู่ในรอบ release · ${n} ใบ`, bar: 100, phase: 'on-test' };
    case 'regression': {
      const e = rel.e2e;
      if (!e || e.state === 'running') return { t: wait, p: `QA รัน regression · ${n} ใบ`, bar: 100, phase: 'regression' };
      if (e.state === 'none') return { t: wait, p: `QA รัน regression · ${NO_REPORT}`, bar: 100, phase: 'regression' };
      return { t: wait, p: `QA รัน regression ${e.pct}% · ผ่าน ${e.passed} จาก ${e.executed}`, bar: 100, phase: 'regression' };
    }
    case 'prod': return { t: wait, p: `deploy production รอบ release · ${n} ใบ`, bar: 100, phase: 'prod' };
    default: return { t: wait, p: `merge แล้ว รอรวมให้ครบ ${batch} ใบ`, bar: batch ? Math.min(100, q / batch * 100) : 0, phase: 'collect' };
  }
}

/**
 * The money section, the HUD and the pills (R17, R36, R40, R58), from state.money. Keyed by element id.
 * Every value carries its line from state.money.sources; a missing value or a missing source shows NO_SOURCE.
 */
export function viewOf(state, fx) {
  const m = (state && state.money) || {};
  const s = m.sources || {};
  const v = {};
  const money = (k, src) => cell(isNum(m[k]) ? baht(m[k]) : null, s[src || k]);
  v.fundVal = money('fund'); v.kFund = v.fundVal; v.hudFund = v.fundVal;
  v.debtHead = money('aiOwed'); v.debtVal = v.debtHead; v.hudDebt = v.debtHead;
  // R17: "ชำระเรียบร้อยแล้ว" only when the amount owed is exactly 0
  v.debtChip = isNum(m.aiOwed) && v.debtHead.line ? { text: m.aiOwed === 0 ? 'ชำระเรียบร้อยแล้ว' : 'ค้างชำระ ' + baht(m.aiOwed), line: v.debtHead.line, none: false } : { text: '', line: null, none: true };
  v.officeHead = money('officeOwed'); v.expOwe = v.officeHead;
  v.officeChip = isNum(m.officeOwed) && v.officeHead.line ? { text: m.officeOwed === 0 ? 'ชำระเรียบร้อยแล้ว' : 'ค้างชำระ ' + baht(m.officeOwed), line: v.officeHead.line, none: false } : { text: '', line: null, none: true };
  v.paidOff = money('aiPaid'); v.saved = money('saved'); v.costTotal = money('costThb');
  const t = m.tokens || {};
  v.tokIn = cell(isNum(t.input) ? fmtTok(t.input) : null, s.tokens);
  v.tokCache = cell(isNum(t.cacheRead) ? fmtTok(t.cacheRead) : null, s.tokens);
  v.tokOut = cell(isNum(t.output) ? fmtTok(t.output) : null, s.tokens);
  const day = (m.office && m.office.today) || {};
  const thb = o => o && isNum(o.thb) ? o.thb : null;
  // R61 (T37, owner 17 Oct 2026): real resources in the mock's own nodes: job minutes, rework minutes,
  // Function requests and the menu's servings, each in baht with its source; no source shows R40's text.
  const n0 = n => n.toLocaleString('en-US');
  v.expElec = cell(thb(day.elec) !== null && isNum(day.elec.minutes) ? `${n0(day.elec.minutes)} นาที · ${baht(day.elec.thb)}` : null, s.elec);
  v.expWater = cell(thb(day.water) !== null && isNum(day.water.minutes) ? `${n0(day.water.minutes)} นาที · ${baht(day.water.thb)}` : null, s.water);
  v.expNet = cell(thb(day.net) !== null && isNum(day.net.requests) ? `${n0(day.net.requests)} request · ${baht(day.net.thb)}` : null, s.net);
  const utilSrc = s.elec || s.water || s.net || null;
  v.expUtil = cell(isNum(day.utilities) && utilSrc ? `${baht(day.utilities)} · ${NOT_CUT}` : null, utilSrc);
  const items = day.sup && Array.isArray(day.sup.items) ? day.sup.items : null;
  v.expSup = cell(thb(day.sup) !== null && items ? `${items.length} รายการ · ${baht(day.sup.thb)} · ${NOT_CUT}` : null, s.sup);
  v.expFood = cell(thb(day.sup) !== null && items && items.length ? items.map(i => `${i.name} ${i.pending ? 'รอราคา' : baht(i.thb)}`).join(' · ') : null, s.sup);
  v.fxVal = fx && isNum(fx.rate) ? { text: '฿' + fx.rate.toFixed(2), line: sourceLine({ fact: 'open.er-api.com', time: fx.at }), none: false } : { text: NO_FX, line: null, none: true };
  return v;
}

/** The repeated rows of the money section: missions (R55), paid (R53, R54), tiers (R53), rate card (R13, R14). */
export function moneyRows(state, fx) {
  const m = (state && state.money) || {};
  const s = m.sources || {};
  const missions = (Array.isArray(m.missions) ? m.missions : []).map(x => ({
    th: x.th, done: !!x.done, value: isNum(x.value) ? x.value : null, goal: isNum(x.goal) ? x.goal : null,
    progress: cell(isNum(x.value) && isNum(x.goal) ? (x.done ? 'สำเร็จแล้ว' : `${Math.min(x.value, x.goal)} / ${x.goal}`) : null, x.source),
    reward: cell(isNum(x.reward) ? '+' + baht(x.reward) : null, x.rewardSource || null)
  }));
  const paid = (Array.isArray(m.paid) ? m.paid : []).slice(0, 5).map(x => ({ t: `${x.key} ${x.title}`, amt: cell(isNum(x.amount) ? '+' + baht(x.amount) : null, x.source), note: x.note || '' }));
  const tiers = m.tiers && typeof m.tiers === 'object' ? Object.entries(m.tiers).map(([k, t]) => ({ k, th: t.th, thb: cell(isNum(t.thb) ? baht(t.thb) : null, s.tiers) })) : [];
  const p = m.prices || null;
  const rate = p ? [['input', p.input], ['cache read', p.cacheRead], ['output', p.output]].map(([k, usd]) => ({
    k, text: cell(isNum(usd) ? `$${usd.toFixed(2)}` + (fx && isNum(fx.rate) ? ` · ${baht(usd * fx.rate)}` : '') : null, s.prices)
  })) : [];
  // R61, R64: the link back to Numbeo its terms require; only an https URL is ever rendered.
  const pl = m.priceLink && typeof m.priceLink.url === 'string' && /^https:\/\//.test(m.priceLink.url) ? { text: String(m.priceLink.text || m.priceLink.url), url: m.priceLink.url } : null;
  return { missions, paid, tiers, rate, model: p && p.model ? p.model : null, costMethod: Array.isArray(m.costMethod) ? m.costMethod : null, priceLink: pl };
}

/** The board's own numbers with their lines (R16, R30, R33, R34, R58). */
export function boardLines(state) {
  const src = boardSources(state), out = {};
  for (const [k, e] of Object.entries(src)) out[k] = sourceLine(e);
  return out;
}

const WORK_LANES = new Set(['ready', 'analysis', 'building', 'in-review', 'merging']);

/**
 * R21, R24: bubbles and toasts only for a fact that changed between two real reads. The first read has nothing to
 * compare with, so it produces none. `label(slot)` names the person ("Dev - A"); `key(issue)` formats the issue key.
 */
export function workEvents(prev, next, label, key) {
  const out = { bubbles: [], toasts: [] };
  if (!prev || !next) return out;
  const prevIssue = new Map((prev.issues || []).map(i => [i.project + ':' + i.n, i]));
  const nextIssue = new Map((next.issues || []).map(i => [i.project + ':' + i.n, i]));
  const prevHeld = new Map((prev.people || []).map(p => [p.slot, p]));
  for (const p of next.people || []) {
    if (p.issue === null || p.issue === undefined) continue;
    const ref = typeof p.issue === 'object' ? p.issue.project + ':' + p.issue.n : (p.project || 'taskfolio') + ':' + p.issue;
    const i = nextIssue.get(ref); if (!i || !WORK_LANES.has(i.lane)) continue;
    const before = prevIssue.get(ref), was = prevHeld.get(p.slot);
    const wasRef = was && was.issue !== null && was.issue !== undefined ? (typeof was.issue === 'object' ? was.issue.project + ':' + was.issue.n : (was.project || 'taskfolio') + ':' + was.issue) : null;
    if (before && before.lane === i.lane && wasRef === ref) continue; // nothing happened
    out.bubbles.push({ slot: p.slot, text: `หยิบ ${key(i)} เองเลย งานของ ${label(p.slot, p.role)}` });
  }
  const prevRel = new Map((prev.projects || []).map(p => [p.id, p.release && phaseKey(p.release.phase)])); // R68
  for (const p of next.projects || []) {
    const was = prevRel.get(p.id), now = p.release && phaseKey(p.release.phase), name = p.name || p.id;
    if (!now || was === undefined || was === now) continue;
    if (now === 'approve') out.toasts.push([[`รอบ release ${name} ครบ `, false], [`${p.release.batch} ใบ`, true], [' · แจ้ง QA Lead แล้ว', false]]);
    else if (now === 'on-test' || now === 'regression') { if (was === 'approve') out.toasts.push([['QA Lead ', true], [`อนุมัติ deploy staging รอบ ${name} แล้ว`, false]]); }
    else if (now === 'prod') out.toasts.push([['regression ', false], ['ผ่านครบ', true], [` · รอบ ${name} กำลัง deploy production`, false]]);
    else if (now === 'collect' && was === 'prod') out.toasts.push([['QA Lead ', true], [`deploy production ${name} แล้ว`, false]]);
  }
  return out;
}

/**
 * Owner answer to Q7 (16 Oct 2026): casual speech is allowed, but a line that is not a real work event must never
 * state a work fact. A casual line is dropped when it holds a number (counts, keys, money, times), a placeholder that
 * would be filled with work, or a word that names work or its state. Work talk comes only from workEvents.
 */
const WORK_WORDS = [
  '#', '฿', '{', 'issue', 'ticket', 'pull request', 'PR', 'merge', 'deploy', 'staging', 'production', 'prod', 'release',
  'CI', 'E2E', 'regression', 'review', 'gate', 'plan', 'spec', 'AC', 'bug', 'backlog', 'sprint', 'commit', 'branch', 'token',
  'sweep', 'improvement', 'requirement', 'test', 'agent', 'label', 'blocked', 'blocker',
  'รีวิว', 'เทสต์', 'เทส', 'บัค', 'บั๊ก', 'งานใหญ่', 'ปิดงาน', 'ส่งงาน', 'รับงาน', 'หยิบ', 'เสร็จ', 'ผ่าน', 'ติด', 'ค้าง',
  'อนุมัติ', 'เงิน', 'ค่าใช้จ่าย', 'จ่าย', 'โบนัส', 'ภารกิจ', 'จุดบอด', 'รอเจ้าของ', 'เจ้าของ', 'ขึ้นระบบ', 'แก้โค้ด', 'โค้ด'
];
const ASCII_WORD = /^[A-Za-z0-9 ]+$/;
const WORK_RE = new RegExp(WORK_WORDS.map(w => ASCII_WORD.test(w) ? `\\b${w.replace(/ /g, '\\s+')}\\b` : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
export function isFlavourSafe(line) {
  if (typeof line !== 'string' || !line.trim()) return false;
  if (/[0-9๐-๙]/.test(line)) return false;
  return !WORK_RE.test(line);
}

/** R10: true when the page must show the idle state (agent off, or no labelled issue). */
export const isIdle = state => !state || state.agentEnabled !== true || !(state.issues || []).length;

// ---------------------------------------------------------------------------------------------------------------
// Browser part. Firebase Auth web SDK at the version the Taskfolio app pins (package.json "firebase": "^12.19.0"):
// the ES module builds of the npm package, vendored under ../vendor/ (review B3), so no third-party script runs.
// The environment's Firebase web config is read from ./app/env.json, written per environment at deploy (R48);
// without it no sign-in is offered and no state is read.
const FB = '../vendor/firebase@12.19.0';

/**
 * One read of the state. `isCurrent()` is checked after every await, so an answer that arrives after a sign-out or
 * an account switch is dropped (review N6). Returns 'state', 'forbidden', 'stale' or throws.
 */
export async function readState(user, doFetch, isCurrent, onState, onForbidden) {
  const token = await user.getIdToken();
  if (!isCurrent()) return 'stale';
  const r = await doFetch(STATE_PATH, { headers: { Authorization: 'Bearer ' + token }, credentials: 'omit' });
  if (!isCurrent()) return 'stale';
  if (r.status === 403) { onForbidden(); return 'forbidden'; } // R42: refused account, not a failed read (review N11)
  if (!r.ok) throw new Error('state ' + r.status);
  const state = await r.json();
  if (!isCurrent()) return 'stale';
  onState(state); return 'state';
}

export function start({ onState, onFail, onForbidden, onSignedOut, onSignedIn, onConfigMissing, fetchImpl }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let user = null, timer = 0, last = 0, busy = false, auth = null, mod = null, gen = 0;
  async function read() {
    if (!user || busy || document.hidden) return;
    busy = true;
    const mine = gen, who = user;
    try {
      const got = await readState(who, doFetch, () => mine === gen && user === who, onState, () => { clearInterval(timer); onForbidden(); });
      if (got === 'state') last = Date.now();
    } catch (e) { if (mine === gen) onFail(e); } finally { busy = false; }
  }
  function schedule() {
    clearInterval(timer);
    if (!user || document.hidden) return; // R11: never while hidden
    timer = setInterval(read, POLL_MS);
    if (Date.now() - last >= POLL_MS) read();
  }
  document.addEventListener('visibilitychange', schedule);
  (async () => {
    let config = null;
    try { const r = await doFetch('./app/env.json', { cache: 'no-store' }); if (r.ok) config = await r.json(); } catch { /* handled below */ }
    if (!config || !config.firebase || !config.firebase.apiKey) { onConfigMissing(); return; }
    const [app, a] = await Promise.all([import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`)]);
    mod = a; auth = a.getAuth(app.initializeApp(config.firebase));
    a.onAuthStateChanged(auth, u => {
      gen++; last = 0; // every sign-in, sign-out or account switch makes earlier reads stale
      user = u || null;
      if (user) { onSignedIn(user.email || ''); schedule(); } else { clearInterval(timer); onSignedOut(); }
    });
  })().catch(e => onFail(e));
  return {
    async signIn() {
      if (!auth) return;
      const p = new mod.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      await mod.signInWithPopup(auth, p);
    },
    async signOut() { gen++; if (auth) await mod.signOut(auth); }
  };
}
