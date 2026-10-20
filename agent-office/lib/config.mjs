// Agent Office config validator. Pure: no file system, so the Pages Function can use it too.
// Spec: docs/sdd/agent-office-live/spec.md R1 (config file, fail closed), R14 (token prices).

/** Where the config lives, for callers that read it from disk (tests, build scripts). */
export const CONFIG_URL = new URL('../projects.config.json', import.meta.url);

/** The role keys of Plan B §2a that the catalogue must hold, in rank order. */
export const ROLE_KEYS = ['head', 'po', 'ba', 'tl', 'dev', 'qal', 'qa'];

/** Source kinds the function knows how to read (R2, E4). */
export const SOURCE_KINDS = ['github-labels', 'mac-snapshot', 'none'];

/** The four sizes of R60, smallest first. */
export const SIZES = ['S', 'M', 'L', 'XL'];

/** The menu triggers of R61 ค่าเสบียง: none of them feeds another cost line (R62). */
export const SUPPLY_TRIGGERS = /** @type {const} */ (['activeAgentDays', 'runsStarted', 'reviewRuns', 'issuesClosed']);

/** The meal groups of the supplies menu file (R61). */
export const MENU_GROUPS = ['breakfast', 'lunch/dinner', 'dessert', 'snack', 'drink'];

/** Where the supplies menu lives, beside the config (R61, owner 17 Oct 2026). */
export const MENU_URL = new URL('../supplies-menu.json', import.meta.url);

/** Paths where `null` is allowed: none since the owner answered Q18 to Q20 (16 Oct 2026). */
const NULL_OK = new Set();

/** Daily mission difficulties and missions (R55, Q18), and the live missions (R55, Q19, mock v61 LIVE). */
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
export const DAILY_MISSIONS = ['close2', 'noBlocked', 'cache70', 'payoff'];
export const LIVE_MISSIONS = ['ciFirst', 'reviewFirst', 'close1', 'lean'];

/**
 * @typedef {{ kind: 'github-labels', repo: string, labelPrefix: string, releaseBranch: string } | { kind: 'mac-snapshot', variable: string } | { kind: 'none' }} Source
 * @typedef {{ id: string, name: string, tag: string, description: string, key: string, source: Source }} Project
 * @typedef {{ label: string, color: string, rank: number, duty: string, own: string }} Role
 * @typedef {{ role: string, duty?: string }} RosterEntry
 * @typedef {{ model: string, input: number, cacheRead: number, output: number, unit: string, source: string }} Prices
 * @typedef {{
 *   version: number, projects: Project[], roster: RosterEntry[], roles: Record<string, Role>,
 *   prices: Prices, buildLimit: number, releaseBatch: number, economyStart: string,
 *   tiers: Record<string, number|string>, bonusCapPct: number, bonusCapSource: string, bonuses: Record<string, number|string>,
 *   sizing: { weights: { rule: number, file: number, riskFlag: number }, thresholds: { S: number, M: number, L: number }, budgetTokens: Record<string, number>, source: string },
 *   missions: {
 *     streak: Record<string, number>, weeklyXl: number, weeklyNoOvernightDebt: number,
 *     daily: { easy: number, medium: number, hard: number }, dailyDifficulty: Record<string, 'easy'|'medium'|'hard'>,
 *     thresholds: { closesPerDay: number, cacheReadPct: number, leanTokensPerHour: number },
 *     live: { order: string[], rewards: Record<string, number> }, weekStart: 'monday',
 *     source: string, origin: Record<string, string>
 *   },
 *   office: {
 *     workflows: string[],
 *     prices: Record<'actionsMinute'|'freeMinutesPerMonth'|'workersRequestsPerMillion', Price>,
 *     supplies: { menuFile: string, breakfastBeforeHour: number, triggers: Record<string, string[]> }
 *   }
 * }} OfficeConfig
 * @typedef {{ value: number, unit: string, label?: string, url: string, fetched: string }} Price
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Every problem with the config, as one message per problem. Empty means valid.
 * @param {unknown} cfg
 * @returns {string[]}
 */
export function configProblems(cfg) {
  /** @type {string[]} */
  const out = [];
  if (!isObj(cfg)) return ['config: not an object'];

  /** @param {string} path @param {unknown} v */
  const str = (path, v) => {
    if (typeof v !== 'string' || v.trim() === '') out.push(`${path}: must be a non-empty string`);
  };
  /** @param {string} path @param {unknown} v @param {{ min?: number, int?: boolean }} [o] */
  const num = (path, v, o = {}) => {
    if (v === null && NULL_OK.has(path)) return;
    if (typeof v !== 'number' || !Number.isFinite(v)) return void out.push(`${path}: must be a number`);
    if (o.min !== undefined && v < o.min) out.push(`${path}: must be at least ${o.min}`);
    if (o.int && !Number.isInteger(v)) out.push(`${path}: must be an integer`);
  };
  /** @param {string} path @param {unknown} v @returns {v is Record<string, unknown>} */
  const obj = (path, v) => {
    if (v === null && NULL_OK.has(path)) return false;
    if (!isObj(v)) {
      out.push(`${path}: must be an object`);
      return false;
    }
    return true;
  };
  /** Every value of a map must be a number (keys free). @param {string} path @param {unknown} v */
  const numMap = (path, v) => {
    if (!obj(path, v)) return;
    for (const [k, x] of Object.entries(v)) if (k !== 'source') num(`${path}.${k}`, x, { min: 0 });
  };

  if (cfg.version !== 1) out.push('version: must be 1');

  // projects
  if (!Array.isArray(cfg.projects) || cfg.projects.length === 0) out.push('projects: must be a non-empty list');
  else {
    const ids = new Set();
    cfg.projects.forEach((p, i) => {
      const at = `projects[${i}]`;
      if (!obj(at, p)) return;
      for (const k of ['id', 'name', 'tag', 'description', 'key']) str(`${at}.${k}`, p[k]);
      if (typeof p.key === 'string' && !p.key.includes('{n}')) out.push(`${at}.key: must contain {n}`);
      if (ids.has(p.id)) out.push(`${at}.id: duplicate ${String(p.id)}`);
      ids.add(p.id);
      if (!obj(`${at}.source`, p.source)) return;
      const kind = p.source.kind;
      if (typeof kind !== 'string' || !SOURCE_KINDS.includes(kind)) {
        out.push(`${at}.source.kind: unknown ${JSON.stringify(kind)}, expected one of ${SOURCE_KINDS.join(', ')}`);
        return;
      }
      if (kind === 'github-labels') {
        str(`${at}.source.repo`, p.source.repo);
        if (typeof p.source.repo === 'string' && !/^[\w.-]+\/[\w.-]+$/.test(p.source.repo)) out.push(`${at}.source.repo: must be owner/name`);
        str(`${at}.source.labelPrefix`, p.source.labelPrefix);
        str(`${at}.source.releaseBranch`, p.source.releaseBranch);
      }
      // ols-real R13: the repository variable the Mac writes the project's board into
      if (kind === 'mac-snapshot' && !(typeof p.source.variable === 'string' && /^[A-Z][A-Z0-9_]*$/.test(p.source.variable))) {
        out.push(`${at}.source.variable: must be an upper-case repository variable name`);
      }
    });
  }

  // roles catalogue
  if (obj('roles', cfg.roles)) {
    for (const k of ROLE_KEYS) {
      const r = cfg.roles[k];
      if (!isObj(r)) {
        out.push(`roles.${k}: missing`);
        continue;
      }
      for (const f of ['label', 'color', 'duty', 'own']) str(`roles.${k}.${f}`, r[f]);
      if (typeof r.color === 'string' && !/^#[0-9a-f]{6}$/i.test(r.color)) out.push(`roles.${k}.color: must be #rrggbb`);
      num(`roles.${k}.rank`, r.rank, { min: 1, int: true });
    }
    for (const k of Object.keys(cfg.roles)) if (!ROLE_KEYS.includes(k)) out.push(`roles.${k}: unknown role`);
  }

  // roster
  if (!Array.isArray(cfg.roster) || cfg.roster.length === 0) out.push('roster: must be a non-empty list');
  else {
    const roles = isObj(cfg.roles) ? cfg.roles : {};
    cfg.roster.forEach((m, i) => {
      if (!isObj(m) || typeof m.role !== 'string' || !(m.role in roles) || !ROLE_KEYS.includes(m.role)) {
        out.push(`roster[${i}].role: ${JSON.stringify(isObj(m) ? m.role : m)} is not in roles`);
        return;
      }
      if (m.duty !== undefined) str(`roster[${i}].duty`, m.duty);
    });
  }

  // prices (R14)
  if (obj('prices', cfg.prices)) {
    for (const k of ['input', 'cacheRead', 'output']) num(`prices.${k}`, cfg.prices[k], { min: 0 });
    for (const k of ['model', 'unit', 'source']) str(`prices.${k}`, cfg.prices[k]);
  }

  num('buildLimit', cfg.buildLimit, { min: 1, int: true });
  num('releaseBatch', cfg.releaseBatch, { min: 1, int: true });
  if (typeof cfg.economyStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cfg.economyStart) || Number.isNaN(Date.parse(cfg.economyStart))) {
    out.push('economyStart: must be a YYYY-MM-DD calendar day');
  }

  // tiers (R53)
  if (obj('tiers', cfg.tiers)) {
    for (const s of SIZES) num(`tiers.${s}`, cfg.tiers[s], { min: 0 });
    str('tiers.source', cfg.tiers.source);
  }
  num('bonusCapPct', cfg.bonusCapPct, { min: 0 });
  str('bonusCapSource', cfg.bonusCapSource);
  if (obj('bonuses', cfg.bonuses)) {
    for (const k of ['planOnce', 'testsOnce', 'ciFirstGreen', 'reviewOnce', 'tokenLean', 'noBlock', 'paidUp']) num(`bonuses.${k}`, cfg.bonuses[k], { min: 0 });
    str('bonuses.source', cfg.bonuses.source);
  }

  // sizing (R60)
  if (obj('sizing', cfg.sizing)) {
    const s = cfg.sizing;
    if (obj('sizing.weights', s.weights)) for (const k of ['rule', 'file', 'riskFlag']) num(`sizing.weights.${k}`, s.weights[k], { min: 0 });
    if (obj('sizing.thresholds', s.thresholds)) {
      for (const k of ['S', 'M', 'L']) num(`sizing.thresholds.${k}`, s.thresholds[k], { min: 0 });
      const t = s.thresholds;
      if (typeof t.S === 'number' && typeof t.M === 'number' && typeof t.L === 'number' && !(t.S < t.M && t.M < t.L)) {
        out.push('sizing.thresholds: must rise S < M < L');
      }
    }
    if (obj('sizing.budgetTokens', s.budgetTokens)) for (const k of SIZES) num(`sizing.budgetTokens.${k}`, s.budgetTokens[k], { min: 0 });
    str('sizing.source', s.source);
  }

  // missions (R55)
  if (obj('missions', cfg.missions)) {
    const m = cfg.missions;
    numMap('missions.streak', m.streak);
    num('missions.weeklyXl', m.weeklyXl, { min: 0 });
    num('missions.weeklyNoOvernightDebt', m.weeklyNoOvernightDebt, { min: 0 });
    if (obj('missions.daily', m.daily)) for (const d of DIFFICULTIES) num(`missions.daily.${d}`, m.daily[d], { min: 0 });
    if (obj('missions.dailyDifficulty', m.dailyDifficulty)) {
      for (const id of DAILY_MISSIONS) {
        const d = m.dailyDifficulty[id];
        if (typeof d !== 'string' || !DIFFICULTIES.includes(d)) out.push(`missions.dailyDifficulty.${id}: must be one of ${DIFFICULTIES.join(', ')}`);
      }
    }
    if (obj('missions.thresholds', m.thresholds)) {
      num('missions.thresholds.closesPerDay', m.thresholds.closesPerDay, { min: 1, int: true });
      num('missions.thresholds.cacheReadPct', m.thresholds.cacheReadPct, { min: 0 });
      num('missions.thresholds.leanTokensPerHour', m.thresholds.leanTokensPerHour, { min: 0 });
    }
    if (obj('missions.live', m.live)) {
      const order = m.live.order;
      if (!Array.isArray(order) || order.length === 0 || order.some((x) => !LIVE_MISSIONS.includes(x)) || new Set(order).size !== order.length) {
        out.push(`missions.live.order: must list distinct missions of ${LIVE_MISSIONS.join(', ')}`);
      }
      if (obj('missions.live.rewards', m.live.rewards)) for (const id of LIVE_MISSIONS) num(`missions.live.rewards.${id}`, m.live.rewards[id], { min: 0 });
    }
    if (m.weekStart !== 'monday') out.push('missions.weekStart: must be monday (owner answer Q20, 16 Oct 2026)');
    str('missions.source', m.source);
    if (obj('missions.origin', m.origin)) {
      for (const k of ['streak', 'weekly', 'daily', 'dailyDifficulty', 'thresholds', 'live', 'weekStart']) str(`missions.origin.${k}`, m.origin[k]);
    }
  }

  // office (R61, owner popups 16 Oct 2026 about 00:15): every price is a provider's, with url and date.
  if (obj('office', cfg.office)) {
    const o = cfg.office;
    const w = o.workflows;
    if (!Array.isArray(w) || w.length === 0 || !w.every((x) => typeof x === 'string' && /\.ya?ml$/.test(x))) {
      out.push('office.workflows: must be a list of workflow file names');
    }
    /** @param {string} path @param {unknown} p @param {RegExp} unit */
    const price = (path, p, unit) => {
      if (!obj(path, p)) return;
      const q = /** @type {Record<string, unknown>} */ (p);
      num(`${path}.value`, q.value, { min: 0 });
      if (typeof q.unit !== 'string' || !unit.test(q.unit)) out.push(`${path}.unit: must match ${unit}`);
      if (typeof q.url !== 'string' || !/^https:\/\/\S+$/.test(q.url)) out.push(`${path}.url: must be the https page the price was read from`);
      if (typeof q.fetched !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(q.fetched)) out.push(`${path}.fetched: must be the YYYY-MM-DD day the price was read`);
      for (const [k, v] of Object.entries(q)) if (typeof v === 'string' && /\bmock\b/i.test(v)) out.push(`${path}.${k}: a price must come from the provider, never the mock`);
    };
    if (obj('office.prices', o.prices)) {
      price('office.prices.actionsMinute', o.prices.actionsMinute, /^USD\b/);
      price('office.prices.freeMinutesPerMonth', o.prices.freeMinutesPerMonth, /^minutes\b/);
      price('office.prices.workersRequestsPerMillion', o.prices.workersRequestsPerMillion, /^USD\b/);
    }
    if (obj('office.supplies', o.supplies)) {
      const sp = o.supplies;
      if (sp.menuFile !== 'supplies-menu.json') out.push('office.supplies.menuFile: must be supplies-menu.json, beside the config');
      num('office.supplies.breakfastBeforeHour', sp.breakfastBeforeHour, { min: 0, int: true });
      if (obj('office.supplies.triggers', sp.triggers)) {
        const keys = Object.keys(sp.triggers).sort();
        if (JSON.stringify(keys) !== JSON.stringify([...SUPPLY_TRIGGERS].sort())) out.push(`office.supplies.triggers: must name exactly ${SUPPLY_TRIGGERS.join(', ')} (R62: minutes and fix rounds already feed electricity and water)`);
        for (const [t, groups] of Object.entries(sp.triggers)) {
          if (!Array.isArray(groups) || !groups.length || !groups.every((g) => MENU_GROUPS.includes(g))) out.push(`office.supplies.triggers.${t}: must list groups of ${MENU_GROUPS.join(', ')}`);
        }
      }
    }
  }

  return out;
}

/** True for a provider price entry with its page and day (R61). */
const PRICE_KEYS_TEXT = ['unit', 'item', 'source', 'formula', 'note'];

/**
 * The problems of the supplies menu file (R61, owner 17 Oct 2026): every price `{value, unit, item,
 * url, fetched}`, `value` null only with `pending: true`, no mock origin; every item in a known group
 * and naming a known price.
 * @param {unknown} menu
 * @returns {string[]}
 */
export function menuProblems(menu) {
  const out = [];
  if (!isObj(menu)) return ['menu: must be an object'];
  const m = /** @type {Record<string, any>} */ (menu);
  if (m.version !== 1) out.push('menu.version: must be 1');
  if (!isObj(m.credit) || typeof m.credit.text !== 'string' || !Array.isArray(m.credit.urls) || !m.credit.urls.length || typeof m.credit.licence !== 'string') out.push('menu.credit: must name the text, the licence and the source urls');
  if (!isObj(m.priceLink) || typeof m.priceLink.url !== 'string' || !/^https:\/\/www\.numbeo\.com\//.test(m.priceLink.url)) out.push('menu.priceLink.url: must link back to Numbeo (its terms of use)');
  if (!isObj(m.prices) || !Object.keys(m.prices).length) out.push('menu.prices: must be an object of prices');
  else {
    for (const [k, p] of Object.entries(m.prices)) {
      const path = `menu.prices.${k}`;
      if (!isObj(p)) { out.push(`${path}: must be an object`); continue; }
      if (p.value === null) { if (p.pending !== true) out.push(`${path}.value: null only with pending: true`); }
      else if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0) out.push(`${path}.value: must be a non-negative number`);
      if (typeof p.unit !== 'string' || !/^THB\b/.test(p.unit)) out.push(`${path}.unit: must be in THB`);
      if (typeof p.item !== 'string' || p.item === '') out.push(`${path}.item: must name the item priced`);
      if (typeof p.url !== 'string' || !/^https:\/\/\S+$/.test(p.url)) out.push(`${path}.url: must be the https page the price was read from`);
      if (typeof p.fetched !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.fetched)) out.push(`${path}.fetched: must be the YYYY-MM-DD day the price was read`);
      for (const f of PRICE_KEYS_TEXT) if (typeof p[f] === 'string' && /\bmock\b/i.test(p[f])) out.push(`${path}.${f}: a price must come from its source, never the mock`);
    }
  }
  if (!Array.isArray(m.items) || !m.items.length) out.push('menu.items: must list the menu');
  else {
    m.items.forEach((it, k) => {
      if (!isObj(it) || typeof it.name !== 'string' || it.name === '') return void out.push(`menu.items.${k}: must have a name`);
      if (!MENU_GROUPS.includes(it.group)) out.push(`menu.items.${k}.group: must be one of ${MENU_GROUPS.join(', ')}`);
      if (!isObj(m.prices) || !isObj(m.prices[it.price])) out.push(`menu.items.${k}.price: must name a price of menu.prices`);
    });
  }
  return out;
}

/** Throws with every problem listed; never falls back (R1, R61). @param {unknown} menu */
export function validateMenu(menu) {
  const problems = menuProblems(menu);
  if (problems.length) throw new Error(`supplies menu is invalid:\n- ${problems.join('\n- ')}`);
  return menu;
}

/** Parses and validates the menu file's text. @param {string} text */
export const loadMenu = (text) => validateMenu(JSON.parse(text));

/**
 * Throws with every problem listed when the config is invalid; never falls back to defaults (R1).
 * @param {unknown} cfg
 * @returns {OfficeConfig}
 */
export function validateConfig(cfg) {
  const problems = configProblems(cfg);
  if (problems.length) throw new Error(`agent-office config is invalid:\n- ${problems.join('\n- ')}`);
  return /** @type {OfficeConfig} */ (cfg);
}

/**
 * Parse and validate the config text.
 * @param {string} text
 * @returns {OfficeConfig}
 */
export function loadConfig(text) {
  return validateConfig(JSON.parse(text));
}
