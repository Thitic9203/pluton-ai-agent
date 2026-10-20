// The money block of the Agent Office snapshot (task T36): the T33 history, the config and the agent
// App login, turned into `state.money` in the shape public/app/live.js `viewOf` and `moneyRows` read
// (plan.md "Data shapes"). Every rule is a function of economy.mjs, office.mjs, size.mjs or
// cost-method.mjs; this file only joins their inputs and attaches each number's R58 source.
// Spec: docs/sdd/agent-office-live/spec.md R40, R51 to R56, R58, R59, R61 to R64 (T36, T37).
//
// R40: a field with no source is null, never 0. With no history (the agent is off), no agent App
// login (markers could not be vouched for), or a day before `economyStart` (no ledger yet), every
// ledger field is null and the reason is in `warnings`; the config facts (tiers, prices, the panel)
// keep their source, the config file.
import { acceptedUsageMarkers } from './history.mjs';
import {
  markerFields, aiCost, cacheSaved, gateOnce, ciFirstGreen, reviewOnce, tokenLean, noBlock, earnedBonuses,
  closedByRelease, dailyMissions, weeklyMissions, missionEvents, runLedger, bangkokDay, mondayOf,
} from './economy.mjs';
import { officeBills, freeQuota } from './office.mjs';
import { sizeAtGate1 } from './size.mjs';
import { costMethod, fmtRate, SUPPLY_TRIGGER_TH } from './cost-method.mjs';
import { source, NO_SOURCE } from './sources.mjs';
import { LANES, issueKey } from './derive.mjs';

/** An agent App login as Actions writes it, `<slug>[bot]` (an empty slug gives `[bot]`, refused). */
export const isAppLogin = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\[bot\]$/.test(s);

/** The fields that exist only once a ledger does. */
export const LEDGER_FIELDS = /** @type {const} */ (['fund', 'aiOwed', 'aiPaid', 'officeOwed', 'saved', 'costThb', 'tokens']);

const BONUS_TH = { planOnce: 'Plan รอบเดียว', testsOnce: 'Test plan รอบเดียว', ciFirstGreen: 'CI เขียวรอบแรก', reviewOnce: 'รีวิวผ่านรอบเดียว', tokenLean: 'ประหยัด token', noBlock: 'ไม่ติดขัด', paidUp: 'ชำระครบ' };
const ROLE_OF_LANE = Object.fromEntries(LANES.map((l) => [l.k, l.role]));
const sizeOfLabel = (name) => /^size:(S|M|L|XL)$/.exec(String(name ?? ''))?.[1] ?? null;
const byTime = (a, b) => Date.parse(String(a)) - Date.parse(String(b));

/** The history's slim timeline (`label` a name) in the shape economy.mjs and size.mjs read. */
const timelineOf = (issue) => (issue.timeline ?? []).map((e) => ({ ...e, label: e.label === undefined ? undefined : { name: e.label } }));

/** The rows that carry a figure for today in the panel's last column (R64). */
const TODAY_ROWS = new Set(['income', 'ai', 'cache', 'electricity', 'water', 'internet', 'supplies', 'dailyBill', 'aiOwed']);

/**
 * The page's panel rows (R64) from cost-method.mjs, in its order, filling the page's four slots in
 * R64's columns: `input` what it counts, `where` the formula, `formula` the price with its source and
 * date, `rates` one entry for today's figure. `today` maps a row id to {text, fact}; a row of
 * TODAY_ROWS (or a menu sub-row) with no entry shows the no-source text (R40).
 * @param {any} config @param {Record<string, { text: string, fact: string }|null>|null} today
 */
function panelRows(config, today, menu = null, served = []) {
  const cm = costMethod(config, menu);
  const rows = cm.entries.map((e) => {
    const t = today ? today[e.id] : null;
    const wantsToday = TODAY_ROWS.has(e.id);
    return {
      id: e.id,
      group: e.group,
      line: e.title,
      input: `นับจาก: ${e.input} (อ่านจาก ${e.readFrom})`,
      where: `สูตร: ${[e.formula, ...(e.notes ?? [])].join(' · ')}`,
      formula: e.rates.length ? `ราคา: ${e.rates.map((r) => `${r.name} ${fmtRate(r.value)} ${r.unit} (ที่มา: ${r.origin})`).join(' · ')}` : '',
      rates: wantsToday ? [{ text: `วันนี้ ${t ? t.text : NO_SOURCE}`, origin: t ? t.fact : 'ยังไม่มีการอ่านข้อมูล' }] : [],
    };
  });
  // R61, R64: the supplies row expands into today's servings: name | what it counts | price with its source | baht.
  const at = rows.findIndex((r) => r.id === 'supplies') + 1;
  rows.splice(at, 0, ...served.map((it, k) => ({
    id: `supplies:item:${k}`, group: 'cost', line: `· ${it.name}`,
    input: `นับจาก: ${SUPPLY_TRIGGER_TH[it.trigger] ?? it.trigger}`,
    where: '',
    formula: `ราคา: ${it.price} (${it.priceItem}) · ที่มา ${it.url} · อ่านเมื่อ ${it.fetched}`,
    rates: [{ text: it.pending ? 'รอราคา' : `฿${it.thb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, origin: `${it.category} → ${it.price}` }],
  })));
  rows.push({ id: 'r62', group: 'rules', line: 'ข้อมูลจริงหนึ่งอย่างไม่ถูกนับซ้ำ (R62)', input: '', where: '', formula: cm.r62, rates: [] });
  return rows;
}

/** The config facts: real whatever the ledger, sourced from the config file. */
function configFacts(config, readAt, today = null, menu = null, served = []) {
  const tiers = Object.fromEntries(['S', 'M', 'L', 'XL'].filter((k) => typeof config.tiers[k] === 'number').map((k) => [k, { thb: config.tiers[k] }]));
  const p = config.prices;
  return {
    tiers,
    prices: { model: p.model, input: p.input, cacheRead: p.cacheRead, output: p.output, unit: p.unit },
    costMethod: panelRows(config, today, menu, served),
    sources: {
      tiers: source(`ไฟล์ตั้งค่า projects.config.json tiers (${config.tiers.source})`, [], readAt),
      prices: source(`ไฟล์ตั้งค่า projects.config.json prices (${p.source})`, [], readAt),
    },
  };
}

/** The block with no ledger (R40), and the reason. */
function noLedger(config, readAt, reason, menu = null) {
  const facts = configFacts(config, readAt, null, menu);
  return {
    money: { ...Object.fromEntries(LEDGER_FIELDS.map((k) => [k, null])), office: null, paid: [], missions: [], ...facts, reads: null, priceLink: menu?.priceLink ? { text: menu.priceLink.text, url: menu.priceLink.url } : null },
    warnings: [`money: ${reason}; the fund, the costs and the office lines have no source yet (R40)`],
  };
}

/**
 * `fx` is the snapshot's own open.er-api.com read, for a day with no marker rate (R61); `requests`
 * the Pages Function requests per Bangkok day, or null with `requestsWhy` (R61 internet, R40).
 * @param {{ config: any, history: any, botLogin: string|null|undefined, now: number|string|Date, readAt: string, offReason?: string,
 *   fx?: { rate: number, at: string, fact: string }|null, requests?: Record<string, number>|null, requestsWhy?: string }} input
 * @returns {{ money: Record<string, unknown>, warnings: string[] }}
 */
export function buildMoney({ config, history, botLogin, now, readAt, offReason, fx = null, requests = null, requestsWhy = 'no Cloudflare analytics read', menu = null }) {
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  const start = config.economyStart;
  if (!isAppLogin(botLogin)) return noLedger(config, readAt, 'no agent App login (AGENT_APP_LOGIN), so no usage marker can be vouched for (R59)', menu);
  if (bangkokDay(nowMs) < start) return noLedger(config, readAt, `the ledger starts on economyStart ${start}`, menu);
  if (!history) return noLedger(config, readAt, offReason ?? 'GitHub history was not read', menu);

  const t = history.readAt ?? readAt;
  const warnings = [];
  const accepted = acceptedUsageMarkers(history, { botLogin });
  warnings.push(...accepted.warnings);
  const markers = accepted.markers.map((m) => ({ ...markerFields(m), at: typeof m.at === 'string' && m.at ? m.at : m.commentAt }));
  const runIds = markers.map((m) => m.run_id);

  // R51, R52
  const ai = aiCost(markers);
  const saved = cacheSaved(markers, config.prices);

  // R53, R54: per issue, its close by the release workflow, its Gate-1 size and its bonus facts.
  const closes = [];
  const reviewsAt = [];
  const incomes = [];
  const ciGreens = [];
  const approvals = [];
  const blockedAt = [];
  const activities = [];
  const branches = [];
  const titles = new Map();
  for (const issue of history.issues ?? []) {
    const n = issue.number;
    titles.set(n, issue.title ?? '');
    const timeline = timelineOf(issue);
    const comments = issue.comments ?? [];
    const plan = gateOnce(comments, '/approve-plan', null);
    const tests = gateOnce(comments, '/approve-tests', '/approve-plan');
    const sized = sizeAtGate1(timeline, plan.at);
    for (const w of sized.warnings) warnings.push(`#${n}: ${w}`);
    const runs = issue.runs ?? [];
    const firstHead = [...runs].sort((a, b) => byTime(a.created_at, b.created_at) || a.id - b.id)[0]?.head_sha ?? null;
    const ciGreen = firstHead !== null && ciFirstGreen(runs, firstHead);
    if (ciGreen) {
      const first = runs.filter((r) => r.head_sha === firstHead && /(^|\/)ci\.yml$/.test(String(r.path ?? ''))).sort((a, b) => byTime(a.created_at, b.created_at))[0];
      const at = first?.updated_at ?? first?.created_at;
      if (at) ciGreens.push(at);
    }
    const pulls = [...(issue.pulls ?? [])].sort((a, b) => a.number - b.number);
    const firstReviews = pulls[0]?.reviews ?? [];
    const reviewed = reviewOnce(firstReviews, botLogin);
    for (const p of pulls) {
      for (const r of p.reviews ?? []) if (r.user?.login === botLogin && r.submitted_at) reviewsAt.push(r.submitted_at);
      const first = (p.reviews ?? []).filter((r) => r.user?.login === botLogin).sort((a, b) => byTime(a.submitted_at, b.submitted_at))[0];
      if (first?.state === 'APPROVED' && first.submitted_at) approvals.push(first.submitted_at);
    }
    const mine = markers.filter((m) => m.issue === n);
    const total = mine.reduce((s, m) => s + m.input + m.cacheRead + m.cacheWrite + m.output, 0);
    const facts = {
      planOnce: plan.approved && plan.once,
      testsOnce: tests.approved && tests.once,
      ciFirstGreen: ciGreen,
      reviewOnce: reviewed,
      tokenLean: tokenLean(total, sized.size, config.sizing.budgetTokens),
      noBlock: noBlock(timeline, comments),
    };
    const closedAt = issue.state === 'closed' ? closedByRelease(timeline, botLogin) : null;
    if (closedAt) {
      const earned = earnedBonuses(facts, config.bonuses);
      closes.push({ n, at: closedAt, size: sized.size });
      incomes.push({
        at: closedAt, kind: 'income', ref: `#${n}`, keys: earned.keys,
        income: { base: sized.size === null ? null : config.tiers[sized.size] ?? null, pct: earned.pct, paidUpPct: Number(config.bonuses.paidUp), capPct: config.bonusCapPct },
      });
    }
    // R55 no-blocked, R61 supplies: the label facts.
    const prefix = 'agent:';
    for (const e of timeline) {
      const name = e.label?.name ?? '';
      if (e.event !== 'labeled' || !name.startsWith(prefix)) continue;
      const lane = name.slice(prefix.length);
      if (lane === 'blocked') blockedAt.push(e.created_at);
      const role = ROLE_OF_LANE[lane];
      if (role) activities.push({ issue: n, role, at: e.created_at });
    }
    // R61 supplies: each run, its step mapped to the role holding the issue's lane at the run (review to Tech Lead).
    for (const m of mine) {
      if (!m.at) continue;
      if (m.step === 'review') { activities.push({ issue: n, role: 'tl', at: m.at }); continue; }
      const lane = timeline
        .filter((e) => e.event === 'labeled' && String(e.label?.name ?? '').startsWith(prefix) && Date.parse(e.created_at) <= Date.parse(m.at))
        .sort((a, b) => byTime(a.created_at, b.created_at)).at(-1)?.label?.name?.slice(prefix.length);
      const role = lane ? ROLE_OF_LANE[lane] : null;
      if (role) activities.push({ issue: n, role, at: m.at });
    }
    // R61 water: the runs of agent/issue-N with their jobs, and the check runs of its heads.
    branches.push({
      issue: n,
      runs: runs.map((r) => ({ id: r.id, head_sha: r.head_sha, created_at: r.created_at, jobs: r.jobs ?? [] })),
      checks: Object.values(issue.checkRuns ?? {}).flat(),
    });
  }

  // R61 electricity: every job of the agent workflows.
  const jobs = (history.agentRuns ?? []).flatMap((r) => (r.jobs ?? []).map((j) => ({ id: j.id, run_id: r.id, workflow: r.workflow, started_at: j.started_at, completed_at: j.completed_at })));
  // R61: a day's rate is the latest vouched marker's rate up to that day's end, else the snapshot's.
  const rated = markers.filter((m) => m.fxRate !== null && m.at).sort((a, b) => byTime(a.at, b.at));
  const fxForDay = (/** @type {string} */ day) => {
    const end = Date.parse(`${day}T00:00:00+07:00`) + 24 * 3600 * 1000;
    const m = rated.filter((x) => Date.parse(x.at) < end).at(-1);
    if (m) return { rate: /** @type {number} */ (m.fxRate), at: m.fxAt ?? m.at, fact: `fxRate ของ usage marker run ${m.run_id}` };
    return fx ? { ...fx, fact: fx.fact ?? 'open.er-api.com' } : null;
  };
  if (!requests) warnings.push(`money: the internet line has no source: ${requestsWhy} (R40)`);
  const officeFacts = {
    jobs,
    branches,
    requests,
    activity: { activities, runsStartedAt: (history.agentRuns ?? []).map((r) => r.created_at).filter(Boolean), reviewsAt, closesAt: closes.map((c) => c.at) },
  };
  const office = officeBills({ start, now: nowMs, facts: officeFacts, roster: config.roster, cfg: config, fxForDay, menu });
  for (const [day, lines] of Object.entries(office.missing)) warnings.push(`money: the bill of ${day} leaves out ${lines.join(', ')}: no source (R40)`);

  // R51, R55, R56, R63: the ledger.
  const aiEvents = markers.map((m) => ({
    at: m.at, kind: 'aiCost', ref: `run ${m.run_id}/${m.run_attempt}/${m.step}`,
    amount: m.costUsd !== null && m.fxRate !== null ? m.costUsd * m.fxRate : null, reason: 'the run recorded no costUsd or fxRate (R51)',
  })).filter((e) => e.amount !== null);
  const rewards = missionEvents({ start, now: nowMs, closes, ciGreens, approvals, markers, cfg: config });
  const ledger = runLedger({
    start, now: nowMs, events: [...incomes, ...aiEvents, ...rewards], bills: office.bills, streak: config.missions.streak,
    missions: { cfg: config, blockedAt, markers },
  });
  for (const l of ledger.leftOut) warnings.push(`money: ${l.ref} left out of the ledger: ${l.reason}`);

  // The page's rows.
  const today = bangkokDay(nowMs);
  const missionSrc = source('issue ที่ปิด, label agent:blocked, usage marker และบัญชีกองทุน บน GitHub', closes.map((c) => `#${c.n}`), t);
  const toRow = (m) => ({ th: m.th, done: m.done, value: m.progress[0], goal: m.progress[1], reward: m.reward, rewardSource: source(m.rewardSource, [], t), source: missionSrc });
  const missions = [
    ...dailyMissions({ day: today, closes, blockedAt, markers, dayEnd: null, cfg: config }),
    ...weeklyMissions({ weekStart: mondayOf(today), closes, days: ledger.days, cfg: config }),
  ].map(toRow);

  const incomeEntries = ledger.entries.filter((e) => e.kind === 'income').sort((a, b) => b.at - a.at);
  const paid = incomeEntries.slice(0, 5).map((e) => {
    const n = Number(e.ref.slice(1));
    const inc = incomes.find((x) => x.ref === e.ref);
    const base = inc?.income.base ?? null;
    // The bonus shown is the one the ledger applied (R53 cap, R54 paid-up at the close time).
    const shown = base ? Math.round(((e.amount - base) / base) * 100) : 0;
    const keys = [...(inc?.keys ?? [])];
    if (inc && e.amount > incomeOrBase(inc) + 1e-9) keys.push('paidUp');
    return {
      key: issueKey(config.projects, (config.projects.find((p) => p.source?.kind === 'github-labels') ?? {}).id, n),
      title: titles.get(n) ?? '',
      amount: e.amount,
      note: `โบนัส +${shown}%${keys.length ? ` · ${keys.map((k) => BONUS_TH[k] ?? k).join(', ')}` : ''}`,
      source: source(`issue ปิดโดย release workflow (agent App) · ขนาด label size:* ตอน Gate 1 · tiers ในไฟล์ตั้งค่า`, [e.ref], new Date(e.at).toISOString()),
    };
  });

  const lines = office.today.lines;
  const lastDay = Object.keys(office.bills).sort().at(-1) ?? null;
  const quota = freeQuota({ month: today.slice(0, 7), jobs, cfg: config });
  const quotaText = quota.minutes <= quota.free
    ? `ใช้ไป ${quota.minutes.toLocaleString('en-US')}/${quota.free.toLocaleString('en-US')} นาทีเดือนนี้ · จ่ายจริง ฿0 ภายในโควตาฟรี`
    : `ใช้ไป ${quota.minutes.toLocaleString('en-US')}/${quota.free.toLocaleString('en-US')} นาทีเดือนนี้ · เกินโควตาฟรี ${(quota.minutes - quota.free).toLocaleString('en-US')} นาที`;
  const dayFx = lines === null ? null : fxForDay(office.today.day);
  const officeBlock = {
    today: lines === null ? null : {
      day: office.today.day,
      note: office.today.note,
      fx: dayFx,
      elec: { minutes: lines.electricity.minutes, usd: lines.electricity.usd, thb: lines.electricity.thb },
      water: { minutes: lines.water.minutes, usd: lines.water.usd, thb: lines.water.thb },
      net: { requests: lines.internet.requests, usd: lines.internet.usd, thb: lines.internet.thb },
      sup: { counts: lines.supplies.counts, items: lines.supplies.items, thb: lines.supplies.thb },
      utilities: lines.utilities,
      total: lines.total,
      missing: lines.missing,
    },
    quota: { ...quota, text: quotaText },
    lastBill: lastDay === null ? null : { day: lastDay, thb: office.bills[lastDay] },
  };

  const lacking = ai.runsWithoutCost;
  const runFact = `usage marker ของ ${ai.runs} run${lacking ? ` (${lacking} run ไม่มี costUsd หรือ fxRate)` : ''}`;
  const ledgerFact = `บัญชีกองทุนจาก economyStart ${start}: ${ledger.entries.length} รายการ${ledger.leftOut.length ? ` · เว้นไว้ ${ledger.leftOut.length} รายการ` : ''}`;
  const sources = {
    ...configFacts(config, t).sources,
    fund: source(ledgerFact, incomeEntries.map((e) => e.ref), t),
    aiOwed: source(`${ledgerFact} · ${runFact}`, runIds, t),
    aiPaid: source(`${ledgerFact} · ${runFact}`, runIds, t),
    officeOwed: source(`${ledgerFact} · บิลรายวันตอน 00:00 Asia/Bangkok`, Object.keys(office.bills), t),
    costThb: source(runFact, runIds, t),
    saved: source(`${runFact} · ราคา input และ cache read ในไฟล์ตั้งค่า`, runIds, t),
    tokens: source(runFact, runIds, t),
  };
  const fxFact = dayFx ? ` · อัตรา ${dayFx.rate} บาท/USD จาก ${dayFx.fact}` : ' · ยังไม่มีอัตรา USD→THB';
  const pr = config.office.prices;
  const priceFact = (k) => `${pr[k].value} ${pr[k].unit} (${pr[k].url} · อ่านเมื่อ ${pr[k].fetched})`;
  if (lines !== null) {
    if (lines.electricity.thb !== null) sources.elec = source(`นาทีของ job ใน workflow ของ agent (Actions API) × ${priceFact('actionsMinute')}${fxFact} · ${quotaText}`, lines.electricity.ids, t);
    if (lines.water.thb !== null) sources.water = source(`นาทีของงานแก้ซ้ำบน branch agent/issue-N หลัง check ล้ม × ${priceFact('actionsMinute')}${fxFact} · ${quotaText}`, lines.water.ids, t);
    if (lines.internet.thb !== null) sources.net = source(`request ของ Pages Function จาก Cloudflare Analytics × ${priceFact('workersRequestsPerMillion')}${fxFact}`, [office.today.day], t);
    if (lines.supplies.thb !== null) sources.sup = source(`${lines.supplies.items.length} รายการจากเมนู The Sims 4 (Sims Wiki, CC BY-SA) ตามกิจกรรมจริงของวันนั้น · ราคาตามหมวดใน supplies-menu.json (Numbeo ${menu?.priceLink?.url ?? ''}, Starbucks Thailand, Big Mac index, เมนูโรงแรม)`, lines.supplies.items.map((x) => x.name), t);
  }

  // The panel's "today" column (R64).
  const baht = (n) => `฿${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fig = (thb, fact, extra = '') => (thb === null || thb === undefined ? null : { text: `${baht(thb)}${extra}`, fact });
  const todays = markers.filter((m) => m.at && bangkokDay(m.at) === today);
  const todayAi = aiCost(todays);
  const todaySaved = cacheSaved(todays, config.prices);
  const incomeToday = ledger.entries.filter((e) => e.kind === 'income' && bangkokDay(e.at) === today).reduce((a, e) => a + e.amount, 0);
  /** @type {Record<string, { text: string, fact: string }|null>} */
  const todayRows = {
    income: fig(incomeToday, 'บัญชีกองทุน: เงินเข้าจาก issue ที่ปิดวันนี้'),
    ai: fig(todayAi.thb, `usage marker ของ ${todayAi.runs} run วันนี้`),
    cache: fig(todaySaved.thb, `usage marker ของ ${todayAi.runs} run วันนี้`),
    electricity: lines && fig(lines.electricity.thb, sources.elec?.fact ?? '', ` · ${lines.electricity.minutes} นาที · ${quotaText}`),
    water: lines && fig(lines.water.thb, sources.water?.fact ?? '', ` · ${lines.water.minutes} นาที`),
    internet: lines && fig(lines.internet.thb, sources.net?.fact ?? '', lines.internet.requests === null ? '' : ` · ${lines.internet.requests.toLocaleString('en-US')} request`),
    supplies: lines && fig(lines.supplies.thb, sources.sup?.fact ?? ''),
    dailyBill: lastDay === null ? null : fig(office.bills[lastDay], `บิลของวันที่ ${lastDay}`),
    aiOwed: fig(ledger.aiOwed, ledgerFact),
  };

  const facts = configFacts(config, t, todayRows, menu, lines?.supplies.items ?? []);
  return {
    money: {
      fund: ledger.fund, aiOwed: ledger.aiOwed, aiPaid: ledger.aiPaid, officeOwed: ledger.officeOwed,
      saved: saved.thb, costThb: ai.thb, tokens: ai.tokens,
      office: officeBlock, paid, missions,
      tiers: facts.tiers, prices: facts.prices, costMethod: facts.costMethod,
      priceLink: menu?.priceLink ? { text: menu.priceLink.text, url: menu.priceLink.url } : null,
      menuCredit: menu?.credit ? { text: menu.credit.text, licence: menu.credit.licence, urls: menu.credit.urls } : null,
      sources, reads: Number.isFinite(history.calls) ? history.calls : null,
    },
    warnings,
  };
}

/** The base-plus-capped-bonus income of an income event without the paid-up bonus. */
function incomeOrBase(inc) {
  if (!inc || inc.income.base === null) return Infinity;
  return inc.income.base + (inc.income.base * Math.min(inc.income.capPct, inc.income.pct)) / 100;
}
