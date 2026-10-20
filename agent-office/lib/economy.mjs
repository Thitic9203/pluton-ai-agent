// The money of the Agent Office, computed from recorded GitHub facts only.
// Spec: docs/sdd/agent-office-live/spec.md R51 to R56, R59. Every rate comes from the config.
import { isOwnerAct, parseCommand, isEdited } from '../../scripts/agent/gates.mjs';

const USAGE = /<!--\s*agent-office:usage\s+(\{.*?\})\s*-->/;
const TOKEN_KEYS = /** @type {const} */ (['input', 'cacheRead', 'cacheWrite', 'output']);

/**
 * @typedef {{ login?: string, type?: string }} Actor
 * @typedef {{ id?: number, user?: Actor, body?: string, created_at?: string, updated_at?: string }} Comment
 * @typedef {{
 *   issue: number|null, run_id: number|null, run_attempt: number|null, step: string|null, at: string|null,
 *   input: number, cacheRead: number, cacheWrite: number, output: number,
 *   costUsd: number|null, fxRate: number|null, fxAt: string|null, missing: string[]
 * }} UsageMarker
 */

/** @param {unknown} v */
const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
/** @param {unknown} v */
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
/** @param {unknown} v */
const intOrNull = (v) => (Number.isInteger(v) ? /** @type {number} */ (v) : null);
/** @param {unknown} v */
const strOrNull = (v) => (typeof v === 'string' && v !== '' ? v : null);
/** @param {Actor|undefined} u @param {string} botLogin */
const isBot = (u, botLogin) => Boolean(u) && u?.login === botLogin && u?.type === 'Bot';

/**
 * Usage markers from issue comments (R50, R51). Only the agent App's comments count (R59); a marker
 * from anyone else is ignored and warned, and a run recorded twice counts once.
 * @param {Comment[]} comments
 * @param {string} botLogin the agent App login, `<app>[bot]`
 * @returns {{ markers: UsageMarker[], warnings: string[] }}
 */
export function usageMarkers(comments, botLogin) {
  /** @type {UsageMarker[]} */
  const markers = [];
  /** @type {string[]} */
  const warnings = [];
  const seen = new Set();
  for (const c of comments ?? []) {
    const m = USAGE.exec(String(c?.body ?? ''));
    if (!m) continue;
    if (!isBot(c.user, botLogin)) {
      warnings.push(`usage marker in comment ${String(c.id)} by ${String(c.user?.login)} ignored: not the agent App`);
      continue;
    }
    /** @type {Record<string, unknown>} */
    let o;
    try {
      o = JSON.parse(m[1]);
    } catch {
      warnings.push(`usage marker in comment ${String(c.id)} is not JSON`);
      continue;
    }
    const key = `${String(o.run_id)}/${String(o.run_attempt)}/${String(o.step)}`;
    if (o.run_id !== undefined && seen.has(key)) {
      warnings.push(`usage marker for run ${key} repeated; counted once`);
      continue;
    }
    seen.add(key);
    markers.push(markerFields(o));
  }
  return { markers, warnings };
}

/**
 * The fields of one parsed marker JSON (R50, R51), with no invented number: a count that is not a
 * non-negative number is 0 tokens, a cost or rate that is not one is null. Shared by `usageMarkers`
 * and the snapshot's money block, which takes markers from `history.mjs` `acceptedUsageMarkers`.
 * @param {Record<string, unknown>} o
 * @returns {UsageMarker}
 */
export function markerFields(o) {
  return {
    issue: intOrNull(o?.issue),
    run_id: intOrNull(o?.run_id),
    run_attempt: intOrNull(o?.run_attempt),
    step: strOrNull(o?.step),
    at: strOrNull(o?.at),
    input: n0(o?.input),
    cacheRead: n0(o?.cacheRead),
    cacheWrite: n0(o?.cacheWrite),
    output: n0(o?.output),
    costUsd: numOrNull(o?.costUsd),
    fxRate: numOrNull(o?.fxRate),
    fxAt: strOrNull(o?.fxAt),
    missing: Array.isArray(o?.missing) ? o.missing.map(String) : [],
  };
}

/**
 * AI cost and tokens (R51): THB = Σ costUsd × the run's own fxRate. A run without either counts its
 * tokens but no cost. `tokIn` adds cache write to input, as the rate card has no line for it.
 * @param {UsageMarker[]} markers
 */
export function aiCost(markers) {
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let usd = 0;
  let thb = 0;
  let runsWithoutCost = 0;
  for (const m of markers ?? []) {
    for (const k of TOKEN_KEYS) tokens[k] += m[k];
    if (m.costUsd === null || m.fxRate === null) {
      runsWithoutCost++;
      continue;
    }
    usd += m.costUsd;
    thb += m.costUsd * m.fxRate;
  }
  return { runs: (markers ?? []).length, usd, thb, tokens, tokIn: tokens.input + tokens.cacheWrite, runsWithoutCost };
}

/**
 * Saved by cache (R52): Σ cacheRead × (price.input − price.cacheRead) / 1,000,000 × the run's rate.
 * @param {{ cacheRead: number, fxRate: number|null }[]} markers
 * @param {{ input: number, cacheRead: number }} prices
 */
export function cacheSaved(markers, prices) {
  let thb = 0;
  let runsWithoutRate = 0;
  for (const m of markers ?? []) {
    if (m.fxRate === null) {
      runsWithoutRate++;
      continue;
    }
    thb += (m.cacheRead * (prices.input - prices.cacheRead)) / 1e6 * m.fxRate;
  }
  return { thb, runsWithoutRate };
}

/** The owner's valid commands, oldest first (R59: owner User account, unedited). @param {Comment[]} comments */
function ownerCommands(comments) {
  return (comments ?? [])
    .filter((c) => isOwnerAct(c.user) && !isEdited(c))
    .map((c) => ({ cmd: parseCommand(c.body), at: String(c.created_at), t: Date.parse(String(c.created_at)) }))
    .filter((x) => x.cmd !== null && Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * A gate approved at the first try (R54 "Plan รอบเดียว", "Test plan รอบเดียว"): the first owner
 * `approve` command, with no owner `/revise` between the previous gate's approval and it.
 * @param {Comment[]} comments
 * @param {string} approve `/approve-plan` or `/approve-tests`
 * @param {string|null} previous the previous gate's command, or null for Gate 1
 * @returns {{ approved: boolean, once: boolean, at: string|null }}
 */
export function gateOnce(comments, approve, previous) {
  const cmds = ownerCommands(comments);
  const from = previous === null ? -Infinity : cmds.find((x) => x.cmd?.command === previous)?.t;
  if (from === undefined) return { approved: false, once: false, at: null };
  const ok = cmds.find((x) => x.cmd?.command === approve && x.t > from);
  if (!ok) return { approved: false, once: false, at: null };
  const revised = cmds.some((x) => x.cmd?.command === '/revise' && x.t > from && x.t < ok.t);
  return { approved: true, once: !revised, at: ok.at };
}

/**
 * "CI เขียวรอบแรก" (R54): the first `ci.yml` run of the pull request's first head sha has
 * run_attempt 1 and conclusion success.
 * @param {{ path?: string, head_sha?: string, run_attempt?: number, conclusion?: string|null, created_at?: string, id?: number }[]} runs
 * @param {string} firstHeadSha
 */
export function ciFirstGreen(runs, firstHeadSha) {
  const mine = (runs ?? [])
    .filter((r) => r.head_sha === firstHeadSha && /(^|\/)ci\.yml$/.test(String(r.path ?? '')))
    .sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)) || (a.id ?? 0) - (b.id ?? 0));
  const first = mine[0];
  return Boolean(first) && first.run_attempt === 1 && first.conclusion === 'success';
}

/**
 * "รีวิวผ่านรอบเดียว" (R54): the first review by the agent App is APPROVED.
 * @param {{ user?: Actor, state?: string, submitted_at?: string }[]} reviews
 * @param {string} botLogin
 */
export function reviewOnce(reviews, botLogin) {
  const first = (reviews ?? [])
    .filter((r) => r.user?.login === botLogin)
    .sort((a, b) => Date.parse(String(a.submitted_at)) - Date.parse(String(b.submitted_at)))[0];
  return Boolean(first) && first.state === 'APPROVED';
}

/**
 * "ประหยัด token" (R54): the issue's token total within the budget of its size (R60).
 * @param {number} total @param {string|null} size @param {Record<string, number>} budgetTokens
 */
export function tokenLean(total, size, budgetTokens) {
  return size !== null && typeof budgetTokens[size] === 'number' && total <= budgetTokens[size];
}

/**
 * "ไม่ติดขัด" (R54): never carried `agent:blocked`, not counting a blocked period that ended with the
 * owner's `/approve-mock` inside it. A period still open fails.
 * @param {{ event?: string, label?: { name?: string }, created_at?: string }[]} timeline
 * @param {Comment[]} comments
 */
export function noBlock(timeline, comments) {
  const evs = (timeline ?? [])
    .filter((e) => e.label?.name === 'agent:blocked' && (e.event === 'labeled' || e.event === 'unlabeled'))
    .map((e) => ({ event: e.event, t: Date.parse(String(e.created_at)) }))
    .sort((a, b) => a.t - b.t);
  const mocks = ownerCommands(comments).filter((x) => x.cmd?.command === '/approve-mock').map((x) => x.t);
  /** @type {number|null} */
  let open = null;
  for (const e of evs) {
    if (e.event === 'labeled' && open === null) open = e.t;
    else if (e.event === 'unlabeled' && open !== null) {
      const start = open;
      if (!mocks.some((t) => t >= start && t <= e.t)) return false;
      open = null;
    }
  }
  return open === null;
}

/** The bonus keys of R54, in the order of Plan B §7.3. */
export const BONUS_KEYS = /** @type {const} */ (['planOnce', 'testsOnce', 'ciFirstGreen', 'reviewOnce', 'tokenLean', 'noBlock', 'paidUp']);

/**
 * The bonuses an issue earned and their sum, with the percents from the config.
 * @param {Partial<Record<typeof BONUS_KEYS[number], boolean>>} facts
 * @param {Record<string, number|string>} bonuses config `bonuses`
 */
export function earnedBonuses(facts, bonuses) {
  const keys = BONUS_KEYS.filter((k) => facts[k] === true);
  return { keys, pct: keys.reduce((s, k) => s + Number(bonuses[k]), 0) };
}

/**
 * Income of one closed issue (R53): base by size × (1 + min(cap, Σ bonus %) / 100). No size, no
 * income, with the reason.
 * @param {{ size: string|null, pct: number }} input
 * @param {{ tiers: Record<string, number|string>, bonusCapPct: number }} cfg
 */
export function incomeFor({ size, pct }, cfg) {
  const capped = Math.min(cfg.bonusCapPct, pct);
  if (size === null || typeof cfg.tiers[size] !== 'number') {
    return { base: null, pct, capped, amount: null, reason: 'closed with no size label' };
  }
  const base = /** @type {number} */ (cfg.tiers[size]);
  return { base, pct, capped, amount: incomeAmount(base, pct, cfg.bonusCapPct), reason: null };
}

/**
 * The one income formula (R53), used by `incomeFor` and the ledger: base × (1 + min(cap, pct) / 100),
 * written as base + base × capped / 100 so whole-baht cases stay exact.
 * @param {number} base @param {number} pct @param {number} capPct
 */
export function incomeAmount(base, pct, capPct) {
  return base + (base * Math.min(capPct, pct)) / 100;
}

/**
 * When the release workflow closed the issue (R53): the latest `closed` event, by the agent App,
 * not followed by a reopen. Null otherwise.
 * @param {{ event?: string, actor?: Actor, created_at?: string }[]} timeline
 * @param {string} botLogin
 * @returns {string|null}
 */
export function closedByRelease(timeline, botLogin) {
  const evs = (timeline ?? [])
    .filter((e) => e.event === 'closed' || e.event === 'reopened')
    .sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
  const last = evs[evs.length - 1];
  return last && last.event === 'closed' && isBot(last.actor, botLogin) ? String(last.created_at) : null;
}

// ---------- Days, missions, streak and the fund ledger (R55, R56, R63) ----------

/** Bangkok is UTC+7 all year (no daylight saving). */
const BKK_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** The Asia/Bangkok calendar day of an instant. @param {string|number} t */
export function bangkokDay(t) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return new Date(ms + BKK_MS).toISOString().slice(0, 10);
}

/** 00:00 Asia/Bangkok of a calendar day, in epoch ms. @param {string} day */
export const bangkokMidnight = (day) => Date.parse(`${day}T00:00:00Z`) - BKK_MS;

/** @param {string} day @param {number} n */
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The Monday of a calendar day's week (Q20, owner 16 Oct 2026: weeks start Monday). @param {string} day */
export function mondayOf(day) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/**
 * @typedef {{ n: number, at: string, size: string|null }} Close
 * @typedef {{ id: string, th: string, progress: [number, number], done: boolean, final: boolean, reward: number, rewardSource: string }} Mission
 * @typedef {{ at: string|null, input: number, cacheRead: number, cacheWrite?: number, output?: number }} RunTokens
 * @typedef {Pick<import('./config.mjs').OfficeConfig, 'missions'>} MissionConfig
 */

/** The reward of a daily mission by its difficulty (Q18). @param {string} id @param {MissionConfig} cfg */
const dailyReward = (id, cfg) => cfg.missions.daily[cfg.missions.dailyDifficulty[id]];

/**
 * Today's missions with their real progress and their reward by difficulty (R55, Q18). `dayEnd` is
 * the ledger's record of that day once it has ended, or null for a day still running.
 * @param {{ day: string, closes: Close[], blockedAt: string[], markers: RunTokens[], dayEnd: { aiOwed: number }|null, cfg: MissionConfig }} input
 * @returns {Mission[]}
 */
export function dailyMissions({ day, closes, blockedAt, markers, dayEnd, cfg }) {
  const th = cfg.missions.thresholds;
  const inDay = (/** @type {string|null} */ t) => t !== null && bangkokDay(t) === day;
  const ended = dayEnd !== null;
  const closed = (closes ?? []).filter((c) => inDay(c.at)).length;
  const blocked = (blockedAt ?? []).filter(inDay).length;
  const runs = (markers ?? []).filter((m) => inDay(m.at));
  const input = runs.reduce((s, m) => s + m.input, 0);
  const cache = runs.reduce((s, m) => s + m.cacheRead, 0);
  const paid = ended && dayEnd.aiOwed === 0;
  const source = `config missions.daily (${cfg.missions.origin.daily})`;
  /** @type {[string, string, [number, number], boolean, boolean][]} */
  const rows = [
    ['close2', `ปิด ${th.closesPerDay} issue วันนี้`, [closed, th.closesPerDay], closed >= th.closesPerDay, true],
    ['noBlocked', 'ทั้งวันไม่มีงานติด blocked', [blocked === 0 ? 1 : 0, 1], ended && blocked === 0, ended],
    ['cache70', `cache read ≥ ${th.cacheReadPct}% ของ input`, [input > 0 ? Math.floor((cache / input) * 100) : 0, th.cacheReadPct], input > 0 && cache * 100 >= th.cacheReadPct * input, ended],
    ['payoff', 'ชำระค่าใช้จ่ายด้าน AI หมดก่อนเที่ยงคืน', [paid ? 1 : 0, 1], paid, ended],
  ];
  return rows.map(([id, text, progress, done, final]) => ({ id, th: text, progress, done, final: final || (done && id === 'close2'), reward: dailyReward(id, cfg), rewardSource: source }));
}

/**
 * This week's missions (R55), for the Monday-start week of `weekStart` (Q20). `paid` says the
 * reward is due into the ledger.
 * @param {{ weekStart: string, closes: Close[], days: { day: string, aiOwed: number }[], cfg: MissionConfig }} input
 * @returns {(Mission & { paid: boolean })[]}
 */
export function weeklyMissions({ weekStart, closes, days, cfg }) {
  const end = addDays(weekStart, 7);
  /** @param {string} d */
  const inWeek = (d) => d >= weekStart && d < end;
  const xl = (closes ?? []).filter((c) => c.size === 'XL' && inWeek(bangkokDay(c.at))).length;
  const weekDays = (days ?? []).filter((d) => inWeek(d.day));
  const clean = weekDays.filter((d) => d.aiOwed === 0).length;
  const source = `config missions (${cfg.missions.origin.weekly}; สัปดาห์เริ่มวันจันทร์ ${cfg.missions.origin.weekStart})`;
  return [
    { id: 'xl', th: 'ปิดงาน XL 1 ใบ', progress: [xl, 1], done: xl >= 1, final: xl >= 1, reward: cfg.missions.weeklyXl, paid: xl >= 1, rewardSource: source },
    { id: 'noOvernightDebt', th: 'ไม่มีค่าใช้จ่ายด้าน AI ค้างชำระข้ามคืนทั้งสัปดาห์', progress: [clean, 7], done: clean === 7, final: weekDays.length === 7, reward: cfg.missions.weeklyNoOvernightDebt, paid: clean === 7, rewardSource: source },
  ];
}

/** Index of the Asia/Bangkok clock hour of an instant, counted from the epoch. @param {number} ms */
export const bangkokHourIndex = (ms) => Math.floor((ms + BKK_MS) / 3600e3);

const LIVE_TH = /** @type {Record<string, string>} */ ({
  ciFirst: 'Dev ส่ง PR ที่ CI เขียวรอบแรก',
  reviewFirst: 'Tech Lead รีวิวผ่านในรอบเดียว',
  close1: 'ปิด issue ให้ได้ 1 ใบ',
  lean: 'ทีมใช้ token ไม่เกินกำหนดในชั่วโมงนี้',
});

/**
 * The live mission of the clock hour holding `t` (R55, Q19): the config order, by the Bangkok hour
 * index, never random, so anyone can recompute it.
 * @param {number|string} t @param {MissionConfig} cfg
 */
export function liveMissionAt(t, cfg) {
  const ms = typeof t === 'number' ? t : Date.parse(t);
  const h = bangkokHourIndex(ms);
  const order = cfg.missions.live.order;
  const id = order[h % order.length];
  const start = h * 3600e3 - BKK_MS;
  return { id, th: LIVE_TH[id] ?? id, reward: cfg.missions.live.rewards[id], hourStart: new Date(start).toISOString(), hourEnd: new Date(start + 3600e3).toISOString() };
}

/**
 * Reward events that do not depend on the ledger (R55): "ปิด n issue" at the n-th close of a day,
 * "ปิดงาน XL" at the first XL close of a Monday week, and the live mission of each hour at its fact
 * (lean at the hour's last millisecond). Day-judged and week-judged missions are entered by
 * `runLedger` at the day's end.
 * @param {{ start: string, now: string|number, closes: Close[], ciGreens: string[], approvals: string[], markers: RunTokens[], cfg: MissionConfig }} input
 * @returns {MoneyEvent[]}
 */
export function missionEvents({ start, now, closes, ciGreens, approvals, markers, cfg }) {
  const startMs = bangkokMidnight(start);
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  /** @param {string|null} at */
  const inRange = (at) => at !== null && Date.parse(at) >= startMs && Date.parse(at) <= nowMs;
  /** @type {MoneyEvent[]} */
  const out = [];
  const sorted = [...(closes ?? [])].filter((c) => inRange(c.at)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  /** @type {Map<string, number>} */
  const perDay = new Map();
  const xlWeeks = new Set();
  for (const c of sorted) {
    const day = bangkokDay(c.at);
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    if (n === cfg.missions.thresholds.closesPerDay) out.push({ at: c.at, kind: 'reward', amount: dailyReward('close2', cfg), ref: `ภารกิจ close2 ${day}` });
    const week = mondayOf(day);
    if (c.size === 'XL' && !xlWeeks.has(week)) {
      xlWeeks.add(week);
      out.push({ at: c.at, kind: 'reward', amount: cfg.missions.weeklyXl, ref: `ภารกิจสัปดาห์ xl ${week}` });
    }
  }

  /** @type {Map<number, { id: string, at: string }>} */
  const live = new Map();
  /** @param {string} id @param {string[]} times */
  const firstFact = (id, times) => {
    for (const at of [...times].filter(inRange).sort((a, b) => Date.parse(a) - Date.parse(b))) {
      const h = bangkokHourIndex(Date.parse(at));
      if (liveMissionAt(Date.parse(at), cfg).id === id && !live.has(h)) live.set(h, { id, at });
    }
  };
  firstFact('ciFirst', ciGreens ?? []);
  firstFact('reviewFirst', approvals ?? []);
  firstFact('close1', sorted.map((c) => c.at));
  /** @type {Map<number, number>} */
  const leanHours = new Map();
  for (const m of markers ?? []) {
    if (!inRange(m.at)) continue;
    const h = bangkokHourIndex(Date.parse(String(m.at)));
    leanHours.set(h, (leanHours.get(h) ?? 0) + m.input + m.cacheRead + (m.cacheWrite ?? 0) + (m.output ?? 0));
  }
  for (const [h, total] of leanHours) {
    const end = h * 3600e3 - BKK_MS + 3600e3 - 1;
    if (end > nowMs || total > cfg.missions.thresholds.leanTokensPerHour) continue;
    if (liveMissionAt(end, cfg).id === 'lean') live.set(h, { id: 'lean', at: new Date(end).toISOString() });
  }
  for (const [, v] of [...live].sort((a, b) => a[0] - b[0])) {
    out.push({ at: v.at, kind: 'reward', amount: cfg.missions.live.rewards[v.id], ref: `ภารกิจสด ${v.id} ${v.at}` });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * @typedef {{ base: number|null, pct: number, paidUpPct: number, capPct: number }} IncomeSpec
 * @typedef {{ at: string, kind: 'income'|'reward'|'aiCost', ref: string, amount?: number|null, income?: IncomeSpec, reason?: string }} MoneyEvent
 * @typedef {{ day: string, aiOwed: number, officeOwed: number, fund: number, streak: number, reward: number|null, bill: number|null }} DayEnd
 */

/**
 * The fund ledger (R56, with R55's streak and R63's daily bill). Events from economyStart are taken
 * in time order; at each Bangkok midnight the ended day is checked (streak, reward), then its office
 * bill is entered. After every entry Head pays the AI cost owed first, then the office cost owed,
 * each `min(fund, owed)`. An event whose amount is null is left out and listed with its reason.
 * The current day is not cut: its bill is not entered (R63 "ยังไม่ตัดรอบ").
 * With `missions`, the missions judged over a whole day (no blocked, cache read, paid before
 * midnight) and over a whole Monday week (no AI cost owed overnight) pay at that day's end (R55);
 * the others come in `events` from `missionEvents`.
 * @param {{
 *   start: string, now: string|number, events: MoneyEvent[], bills?: Record<string, number|null>,
 *   streak: Record<string, number>, missions?: { cfg: MissionConfig, blockedAt: string[], markers: RunTokens[] }
 * }} input
 */
export function runLedger({ start, now, events, bills = {}, streak, missions }) {
  const s = { fund: 0, aiOwed: 0, aiPaid: 0, officeOwed: 0, officePaid: 0, streak: 0 };
  /** @type {{ ref: string, reason: string }[]} */
  const leftOut = [];
  /** @type {{ at: number, kind: string, ref: string, amount: number }[]} */
  const entries = [];
  /** @type {DayEnd[]} */
  const days = [];

  const pay = () => {
    const ai = Math.min(s.fund, s.aiOwed);
    s.fund -= ai;
    s.aiOwed -= ai;
    s.aiPaid += ai;
    const off = Math.min(s.fund, s.officeOwed);
    s.fund -= off;
    s.officeOwed -= off;
    s.officePaid += off;
  };
  /** @param {number} at @param {string} kind @param {string} ref @param {number} amount */
  const enter = (at, kind, ref, amount) => {
    if (kind === 'aiCost') s.aiOwed += amount;
    else if (kind === 'officeBill') s.officeOwed += amount;
    else s.fund += amount;
    entries.push({ at, kind, ref, amount });
    pay();
  };
  /** @param {MoneyEvent} e @param {number} t */
  const apply = (e, t) => {
    if (e.kind === 'income' && e.income) {
      const { base, pct, paidUpPct, capPct } = e.income;
      if (base === null) return void leftOut.push({ ref: e.ref, reason: 'closed with no size label' });
      return enter(t, 'income', e.ref, incomeAmount(base, pct + (s.aiOwed === 0 ? paidUpPct : 0), capPct));
    }
    if (typeof e.amount !== 'number' || !Number.isFinite(e.amount)) return void leftOut.push({ ref: e.ref, reason: e.reason ?? 'amount has no source' });
    enter(t, e.kind, e.ref, e.amount);
  };

  const startMs = bangkokMidnight(start);
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const queue = (events ?? [])
    .map((e, i) => ({ e, i, t: Date.parse(e.at) }))
    .filter((x) => Number.isFinite(x.t) && x.t >= startMs && x.t <= nowMs)
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const steps = Object.entries(streak ?? {}).map(([k, v]) => [Number(k), v]);

  let qi = 0;
  for (let day = start; bangkokMidnight(addDays(day, 1)) <= nowMs; day = addDays(day, 1)) {
    const midnight = bangkokMidnight(addDays(day, 1));
    while (qi < queue.length && queue[qi].t < midnight) apply(queue[qi].e, queue[qi++].t);
    const aiOwed = s.aiOwed;
    s.streak = aiOwed === 0 ? s.streak + 1 : 0;
    const hit = steps.find(([n]) => n === s.streak);
    const reward = hit ? hit[1] : null;
    if (reward !== null) enter(midnight - 1, 'reward', `streak ${s.streak}`, reward);
    if (missions) {
      const judged = dailyMissions({ day, closes: [], blockedAt: missions.blockedAt, markers: missions.markers, dayEnd: { aiOwed }, cfg: missions.cfg });
      for (const m of judged) if (m.id !== 'close2' && m.done) enter(midnight - 1, 'reward', `ภารกิจ ${m.id} ${day}`, m.reward);
      const week = mondayOf(day);
      if (addDays(week, 6) === day) {
        const weekDays = [...days, { day, aiOwed }].filter((d) => d.day >= week);
        const [, clean] = weeklyMissions({ weekStart: week, closes: [], days: weekDays, cfg: missions.cfg });
        if (clean.paid) enter(midnight - 1, 'reward', `ภารกิจสัปดาห์ ${clean.id} ${week}`, clean.reward);
      }
    }
    const bill = bills[day];
    if (bill === null) leftOut.push({ ref: `office ${day}`, reason: 'bill has no source' });
    else if (typeof bill === 'number') enter(midnight, 'officeBill', `office ${day}`, bill);
    days.push({ day, aiOwed, officeOwed: s.officeOwed, fund: s.fund, streak: s.streak, reward, bill: typeof bill === 'number' ? bill : null });
  }
  while (qi < queue.length) apply(queue[qi].e, queue[qi++].t);

  return { ...s, days, leftOut, entries };
}
