// Office costs, priced on the real resources the agents use (owner popups, 16 Oct 2026 about 00:15),
// and supplies served from the Sims 4 menu file at sourced prices (owner, 17 Oct 2026).
// Spec: docs/sdd/agent-office-live/spec.md R40, R61, R62, R63. No price lives in this file: every
// price is the config's `office.prices` entry or the menu file's `prices`, each with url and date.
import { bangkokDay, bangkokMidnight } from './economy.mjs';
import { SUPPLY_TRIGGERS } from './config.mjs';

export { SUPPLY_TRIGGERS };

/**
 * The real input each cost line reads (R62). A test asserts no two lines share an input and that
 * tokens feed only the AI cost.
 * @type {Record<string, string[]>}
 */
export const LINE_INPUTS = {
  ai: ['tokens'],
  electricity: ['agentJobMinutes'],
  water: ['reworkJobMinutes'],
  internet: ['functionRequests'],
  supplies: [...SUPPLY_TRIGGERS],
};

/** True when no input appears in two lines. @param {Record<string, string[]>} lines */
export function inputsDisjoint(lines) {
  const seen = new Set();
  for (const ins of Object.values(lines)) {
    for (const i of ins) {
      if (seen.has(i)) return false;
      seen.add(i);
    }
  }
  return true;
}

/**
 * @typedef {{ rate: number, at: string|null, fact: string }} Fx
 * @typedef {{ id: number, workflow?: string, started_at: string|null, completed_at: string|null }} Job
 * @typedef {{ id: number, head_sha: string, created_at: string, jobs: Job[] }} BranchRun
 * @typedef {{ issue: number, runs: BranchRun[], checks: { head_sha: string, conclusion: string|null, completed_at: string|null }[] }} Branch
 * @typedef {{ activities: { issue: number, role: string, at: string }[], runsStartedAt: string[], reviewsAt: string[], closesAt: string[] }} Activity
 * @typedef {{ jobs: Job[], branches: Branch[], requests: Record<string, number>|null, activity: Activity }} Facts
 */

/** A job's billed minutes: completed − started, rounded up to a whole minute, as GitHub bills. @param {Job} j */
export function billedMinutes(j) {
  if (!j?.started_at || !j?.completed_at) return 0;
  return Math.ceil(Math.max(0, Date.parse(j.completed_at) - Date.parse(j.started_at)) / 60000);
}

/** USD to THB at the day's recorded rate, or null with no rate (R40, R61). @param {number} usd @param {Fx|null} fx */
const toThb = (usd, fx) => (fx && Number.isFinite(fx.rate) ? usd * fx.rate : null);

/**
 * The rework runs of each `agent/issue-N` branch (R61 water): runs started after a check run
 * concluded failure on an earlier, different head sha of that branch.
 * @param {Branch[]} branches
 * @returns {{ issue: number, run: BranchRun }[]}
 */
export function reworkRuns(branches) {
  const out = [];
  for (const b of branches ?? []) {
    const failures = (b.checks ?? []).filter((c) => c.conclusion === 'failure' && c.completed_at);
    for (const run of b.runs ?? []) {
      const t = Date.parse(run.created_at);
      if (failures.some((c) => c.head_sha !== run.head_sha && Date.parse(String(c.completed_at)) < t)) out.push({ issue: b.issue, run });
    }
  }
  return out;
}

/** Every job id counted for water, on any day: never in electricity (R62). @param {Branch[]} branches */
export const reworkJobIds = (branches) => new Set(reworkRuns(branches).flatMap(({ run }) => (run.jobs ?? []).map((j) => j.id)));

/**
 * Electricity (R61): billed minutes of the agent workflows' jobs completed that Bangkok day, less
 * the rework jobs, × the GitHub-hosted Linux minute price, × the day's rate.
 * @param {{ day: string, jobs: Job[], exclude?: Set<number>, cfg: any, fx: Fx|null }} input
 */
export function electricity({ day, jobs, exclude = new Set(), cfg, fx }) {
  const o = cfg.office;
  const mine = (jobs ?? []).filter((j) => o.workflows.includes(String(j.workflow)) && !exclude.has(j.id) && j.completed_at && bangkokDay(j.completed_at) === day);
  const minutes = mine.reduce((s, j) => s + billedMinutes(j), 0);
  const usd = minutes * o.prices.actionsMinute.value;
  return { minutes, usd, thb: toThb(usd, fx), ids: mine.map((j) => j.id) };
}

/**
 * Water (R61): billed minutes of the rework runs' jobs completed that day × the same minute price.
 * @param {{ day: string, branches: Branch[], cfg: any, fx: Fx|null }} input
 */
export function water({ day, branches, cfg, fx }) {
  const jobs = reworkRuns(branches).flatMap(({ issue, run }) => (run.jobs ?? []).map((j) => ({ ...j, issue })));
  const mine = jobs.filter((j) => j.completed_at && bangkokDay(j.completed_at) === day);
  const minutes = mine.reduce((s, j) => s + billedMinutes(j), 0);
  const usd = minutes * cfg.office.prices.actionsMinute.value;
  return { minutes, usd, thb: toThb(usd, fx), ids: mine.map((j) => j.id), issues: [...new Set(mine.map((j) => j.issue))] };
}

/**
 * Internet (R61): Pages Function requests that day × the price per million. No count, no line (R40).
 * @param {{ day: string, requests: Record<string, number>|null, cfg: any, fx: Fx|null }} input
 */
export function internet({ day, requests, cfg, fx }) {
  if (!requests) return { requests: null, usd: null, thb: null };
  const n = Number.isFinite(requests[day]) ? requests[day] : 0;
  const usd = (n / 1e6) * cfg.office.prices.workersRequestsPerMillion.value;
  return { requests: n, usd, thb: toThb(usd, fx) };
}

/**
 * The people with work that day (R61 `activeAgentDays`): per role, its distinct issues ordered by
 * their first work of the day, each on the next roster slot of that role, capped at that role's
 * people. Each person carries the time their first work started.
 * @param {{ day: string, activity: Activity, roster: { role: string }[] }} input
 * @returns {{ slot: number, role: string, issue: number, firstAt: string }[]}
 */
export function workingPeople({ day, activity, roster }) {
  /** @type {Map<string, Map<number, string>>} */
  const per = new Map();
  for (const a of activity?.activities ?? []) {
    if (!a.at || bangkokDay(a.at) !== day) continue;
    if (!per.has(a.role)) per.set(a.role, new Map());
    const m = per.get(a.role);
    const was = m?.get(a.issue);
    if (!was || Date.parse(a.at) < Date.parse(was)) m?.set(a.issue, a.at);
  }
  const out = [];
  for (const [role, issues] of per) {
    const slots = (roster ?? []).map((r, k) => (r.role === role ? k : -1)).filter((k) => k >= 0);
    const ordered = [...issues].sort((x, y) => Date.parse(x[1]) - Date.parse(y[1]) || x[0] - y[0]);
    ordered.slice(0, slots.length).forEach(([issue, firstAt], k) => out.push({ slot: slots[k], role, issue, firstAt }));
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/**
 * The day's count of each menu trigger (R61).
 * @param {{ day: string, activity: Activity, roster: { role: string }[] }} input
 * @returns {Record<typeof SUPPLY_TRIGGERS[number], number>}
 */
export function supplyCounts({ day, activity, roster }) {
  const inDay = (/** @type {string} */ t) => Boolean(t) && bangkokDay(t) === day;
  return {
    activeAgentDays: workingPeople({ day, activity, roster }).length,
    runsStarted: (activity?.runsStartedAt ?? []).filter(inDay).length,
    reviewRuns: (activity?.reviewsAt ?? []).filter(inDay).length,
    issuesClosed: (activity?.closesAt ?? []).filter(inDay).length,
  };
}

/** Days since 1970-01-01 of a calendar day, the rotation's day key. @param {string} day */
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);

/**
 * The menu item of one serving (R61): a fixed rotation through the group's items, keyed by the day,
 * the roster slot and a counter. No randomness: the same day gives the same items on every read, and
 * as days pass every item comes round.
 * @param {{ name: string }[]} pool @param {string} day @param {number} slot @param {number} counter
 */
export function rotate(pool, day, slot, counter) {
  if (!pool.length) return null;
  const k = dayNumber(day) * 97 + (slot + 1) * 13 + counter;
  return pool[((k % pool.length) + pool.length) % pool.length];
}

/**
 * Supplies (R61, owner 17 Oct 2026): the day's servings from the menu file, one per count of each
 * trigger, each charged at its price category in THB. A pending price charges 0 and says "รอราคา".
 * Without a menu there is no line (R40).
 * @param {{ day: string, activity: Activity, roster: { role: string }[], cfg: any, menu: any }} input
 */
export function supplies({ day, activity, roster, cfg, menu }) {
  const counts = supplyCounts({ day, activity, roster });
  if (!menu || !Array.isArray(menu.items) || !menu.items.length) return { counts, items: [], thb: null };
  const sp = cfg.office.supplies;
  const pool = (/** @type {string[]} */ groups) => menu.items.filter((/** @type {any} */ i) => groups.includes(i.group));
  /** @type {{ name: string, trigger: string, group: string, category: string, price: string, thb: number, pending: boolean, priceItem: string, url: string, fetched: string, slot: number }[]} */
  const items = [];
  const serve = (/** @type {any} */ it, /** @type {string} */ trigger, /** @type {number} */ slot) => {
    if (!it) return;
    const p = menu.prices[it.price];
    const pending = p.value === null;
    items.push({ name: it.name, trigger, group: it.group, category: it.category, price: it.price, thb: pending ? 0 : p.value, pending, priceItem: p.item, url: p.url, fetched: p.fetched, slot });
  };
  const [breakfast, mains] = sp.triggers.activeAgentDays;
  for (const person of workingPeople({ day, activity, roster })) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23' }).format(new Date(person.firstAt)));
    serve(rotate(pool([hour < sp.breakfastBeforeHour ? breakfast : mains]), day, person.slot, 0), 'activeAgentDays', person.slot);
  }
  for (const trigger of ['runsStarted', 'reviewRuns', 'issuesClosed']) {
    const groups = sp.triggers[trigger];
    for (let c = 0; c < counts[/** @type {keyof typeof counts} */ (trigger)]; c++) serve(rotate(pool(groups), day, -1 - SUPPLY_TRIGGERS.indexOf(/** @type {any} */ (trigger)), c), trigger, -1);
  }
  return { counts, items, thb: items.reduce((s, i) => s + i.thb, 0) };
}

/**
 * The agent workflows' billed minutes in one Bangkok month, against the free quota (R61).
 * @param {{ month: string, jobs: Job[], cfg: any }} input `month` as YYYY-MM
 */
export function freeQuota({ month, jobs, cfg }) {
  const o = cfg.office;
  const minutes = (jobs ?? [])
    .filter((j) => o.workflows.includes(String(j.workflow)) && j.completed_at && bangkokDay(j.completed_at).slice(0, 7) === month)
    .reduce((s, j) => s + billedMinutes(j), 0);
  return { month, minutes, free: o.prices.freeMinutesPerMonth.value };
}

/**
 * One day's four lines (R61) and their bill (R63): the sum of the lines that have a THB figure; with
 * none, no bill. `missing` names the lines left out. `food` equals supplies (R36).
 * @param {{ day: string, facts: Facts, roster: { role: string }[], cfg: any, fx: Fx|null, menu?: any }} input
 */
export function officeDay({ day, facts, roster, cfg, fx, menu = null }) {
  const exclude = reworkJobIds(facts.branches);
  const e = electricity({ day, jobs: facts.jobs, exclude, cfg, fx });
  const w = water({ day, branches: facts.branches, cfg, fx });
  const n = internet({ day, requests: facts.requests, cfg, fx });
  const s = supplies({ day, activity: facts.activity, roster, cfg, menu });
  const lines = { electricity: e.thb, water: w.thb, internet: n.thb, supplies: s.thb };
  const missing = Object.entries(lines).filter(([, v]) => v === null).map(([k]) => k);
  const util = [e.thb, w.thb, n.thb].filter((v) => v !== null);
  const all = Object.values(lines).filter((v) => v !== null);
  return {
    day, electricity: e, water: w, internet: n, supplies: s,
    utilities: util.length ? util.reduce((a, b) => a + /** @type {number} */ (b), 0) : null,
    food: s.thb,
    total: all.length ? all.reduce((a, b) => a + /** @type {number} */ (b), 0) : null,
    missing,
  };
}

/**
 * The bills of every ended day from economyStart, for the ledger (R63), and today's running lines
 * outside it, marked "ยังไม่ตัดรอบ". `fxForDay(day)` gives the day's recorded rate or null.
 * @param {{ start: string, now: string|number, facts: Facts, roster: { role: string }[], cfg: any, fxForDay: (day: string) => Fx|null, menu?: any }} input
 */
export function officeBills({ start, now, facts, roster, cfg, fxForDay, menu = null }) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const today = bangkokDay(nowMs);
  /** @type {Record<string, number|null>} */
  const bills = {};
  /** @type {Record<string, string[]>} */
  const missing = {};
  for (let ms = bangkokMidnight(start); ; ms += 24 * 3600 * 1000) {
    const day = bangkokDay(ms);
    if (day >= today) break;
    const d = officeDay({ day, facts, roster, cfg, fx: fxForDay(day), menu });
    bills[day] = d.total;
    if (d.missing.length) missing[day] = d.missing;
  }
  const running = today >= start ? officeDay({ day: today, facts, roster, cfg, fx: fxForDay(today), menu }) : null;
  return { bills, missing, today: { day: today, note: 'ยังไม่ตัดรอบ', lines: running } };
}
