/**
 * The usage marker of one agent run (docs/sdd/agent-office-live/spec.md R50, R51, R59; tasks.md T25).
 * Pure: the messages of the action's execution file, the exchange rate and the run's own fields in,
 * the marker out. Nothing from the transcript leaves except numbers and one checked model name.
 *
 * Source of the input: claude-code-action at the commit agent.yml pins (1d6de8cb0, v1.0.248)
 * writes every SDK message, as `JSON.stringify(messages)`, to the file its `execution_file` output
 * names (base-action/src/execution-file.ts), and reads `total_cost_usd` from the result message
 * (base-action/src/run-claude-sdk.ts line 149). The token keys below follow the SDK's types
 * (`ModelUsage`: inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD;
 * `usage`: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens) and are
 * UNVERIFIED against a real run until T24 captures one.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MARKER_PREFIX = '<!-- agent-office:usage';

/** The exchange rate R50 records with each run (Plan B §6, the rate the mock already reads). */
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const MODEL_RE = /^[A-Za-z0-9._:@/[\]+-]{1,100}$/;
const JOB_RE = /^[A-Za-z0-9_-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const STEPS = new Set(['work', 'review']);

const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** The four token totals of a result message, or null when any count is not a real count. */
function tokensOf(res) {
  const mu = res.modelUsage;
  if (mu && typeof mu === 'object' && Object.keys(mu).length > 0) {
    const t = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
    for (const u of Object.values(mu)) {
      const row = [count(u?.inputTokens), count(u?.cacheReadInputTokens), count(u?.cacheCreationInputTokens), count(u?.outputTokens)];
      if (row.includes(null)) return null;
      t.input += row[0]; t.cacheRead += row[1]; t.cacheWrite += row[2]; t.output += row[3];
    }
    return t;
  }
  const u = res.usage;
  const row = [count(u?.input_tokens), count(u?.cache_read_input_tokens), count(u?.cache_creation_input_tokens), count(u?.output_tokens)];
  if (row.includes(null)) return null;
  return { input: row[0], cacheRead: row[1], cacheWrite: row[2], output: row[3] };
}

/** The model that cost the most in the run (ties by name), else the init message's model. */
function modelOf(res, messages) {
  const mu = res.modelUsage;
  if (mu && typeof mu === 'object' && Object.keys(mu).length > 0) {
    const [name] = Object.entries(mu)
      .map(([k, u]) => [k, money(u?.costUSD) ?? 0])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return name;
  }
  return messages.find((m) => m?.type === 'system' && m?.subtype === 'init')?.model;
}

/**
 * The usage of the last result message: {model?, input?, cacheRead?, cacheWrite?, output?, costUsd?,
 * missing}. `missing` is ['file'] when `messages` is not an array, ['result'] when it has no result
 * message, else the names of the fields that were not real values.
 */
export function usageFromMessages(messages) {
  if (!Array.isArray(messages)) return { missing: ['file'] };
  const res = messages.filter((m) => m?.type === 'result').at(-1);
  if (!res) return { missing: ['result'] };
  const out = {};
  const missing = [];
  const model = modelOf(res, messages);
  if (typeof model === 'string' && MODEL_RE.test(model)) out.model = model;
  else missing.push('model');
  const t = tokensOf(res);
  if (t) Object.assign(out, t);
  else missing.push('tokens');
  const cost = money(res.total_cost_usd);
  if (cost !== null) out.costUsd = cost;
  else missing.push('costUsd');
  return { ...out, missing };
}

/** THB per USD and its update time from https://open.er-api.com/v6/latest/USD, or null. */
export function fxFromResponse(body) {
  if (!body || body.result !== 'success' || body.base_code !== 'USD') return null;
  const rate = body.rates?.THB;
  const when = body.time_last_update_unix;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isSafeInteger(when) || when <= 0) return null;
  return { fxRate: rate, fxAt: new Date(when * 1000).toISOString() };
}

/**
 * The marker object of R50. `run` holds the workflow's own fields (issue, run_id, run_attempt, job,
 * step, sha, at); each is checked and left out, named in `missing`, when it is not well formed.
 * `fx` is {fxRate, fxAt} or null. `missing` is present only when something is missing.
 */
export function buildMarker({ messages, fx, run = {} }) {
  const usage = usageFromMessages(messages);
  const missing = [...usage.missing];
  const m = { v: 1 };
  const field = (name, value) => { if (value === null || value === undefined) missing.push(name); else m[name] = value; };
  field('issue', count(run.issue) || null);
  field('run_id', count(run.run_id) || null);
  field('run_attempt', count(run.run_attempt) || null);
  field('job', typeof run.job === 'string' && JOB_RE.test(run.job) ? run.job : null);
  field('step', STEPS.has(run.step) ? run.step : null);
  field('sha', typeof run.sha === 'string' && SHA_RE.test(run.sha) ? run.sha : null);
  field('at', isoOrNull(run.at));
  for (const k of ['model', 'input', 'cacheRead', 'cacheWrite', 'output', 'costUsd']) if (k in usage) m[k] = usage[k];
  const rate = fx && money(fx.fxRate) ? fx.fxRate : null;
  const rateAt = fx ? isoOrNull(fx.fxAt) : null;
  if (rate && rateAt) { m.fxRate = rate; m.fxAt = rateAt; } else missing.push('fx');
  // Usage problems first, then the run's fields, then the rate.
  if (missing.length) m.missing = MISSING_ORDER.filter((k) => missing.includes(k));
  return m;
}

/** The comment's one line: `<!-- agent-office:usage {json} -->`. */
export function markerLine(marker) {
  return `${MARKER_PREFIX} ${JSON.stringify(marker)} -->`;
}

const KEY_ORDER = ['v', 'issue', 'run_id', 'run_attempt', 'job', 'step', 'sha', 'at', 'model', 'input', 'cacheRead', 'cacheWrite', 'output', 'costUsd', 'fxRate', 'fxAt', 'missing'];
/** The names `missing` may hold, in the order they are listed; `parser` is the workflow's fallback (R50). */
const MISSING_ORDER = ['parser', 'file', 'result', 'model', 'tokens', 'costUsd', 'issue', 'run_id', 'run_attempt', 'job', 'step', 'sha', 'at', 'fx'];
const MISSING_NAMES = new Set(MISSING_ORDER);
const TOKEN_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'];

/** The R59 ceilings, read when a check runs (the parser's own copy in $RUNNER_TEMP never needs them). */
export function loadUsageLimits() {
  const limits = JSON.parse(readFileSync(new URL('./usage-limits.json', import.meta.url), 'utf8'));
  if (!Number.isSafeInteger(limits.tokensPerStep) || !(limits.costUsdPerStep > 0) || !limits.source) throw new Error('usage-limits.json needs tokensPerStep, costUsdPerStep and source');
  return limits;
}
/** The job id of agent.yml each step runs in. */
const JOB_OF_STEP = { work: 'agent', review: 'review' };
const canonicalIso = (v) => typeof v === 'string' && isoOrNull(v) === v;

/** Why one key's value is not acceptable, or null when it is. */
function badValue(k, v, expect) {
  switch (k) {
    case 'v': return v === 1 ? null : 'version';
    case 'issue': case 'run_id': case 'run_attempt': return v === expect[k] ? null : `${k} is not this run's`;
    case 'step': return v === expect.step ? null : 'step is not this step';
    case 'job': return v === JOB_OF_STEP[expect.step] ? null : 'job is not this step\'s job';
    case 'sha': return typeof v === 'string' && SHA_RE.test(v) ? null : 'sha';
    case 'at': case 'fxAt': return canonicalIso(v) ? null : `${k} is not an ISO time`;
    case 'model': return typeof v === 'string' && MODEL_RE.test(v) ? null : 'model';
    case 'input': case 'cacheRead': case 'cacheWrite': case 'output': return count(v) === null ? `${k} is not a count` : null;
    case 'costUsd': return money(v) === null ? 'costUsd' : null;
    case 'fxRate': return money(v) ? null : 'fxRate';
    case 'missing': return Array.isArray(v) && v.length > 0 && v.every((n) => MISSING_NAMES.has(n)) ? null : 'missing';
    default: return 'unknown key';
  }
}

/**
 * The usage job's check of a line made in a workspace the agent wrote (R50, R59): one line, the
 * marker's shape, only known keys with well-formed values, the issue, run, attempt, step and job of
 * this run, and a cost and token total under the ceilings. `expect.sha` is the head the run read
 * from GitHub: it replaces any sha in the line, and when it is empty sha is dropped and named
 * missing (R50 `sha`). Returns {ok: true, line} re-serialised by this code, or {ok: false, reason};
 * the reason never quotes the line.
 */
export function checkMarkerLine(line, expect, limits = loadUsageLimits()) {
  const s = String(line ?? '');
  if (s.includes('\n') || s.includes('\r')) return { ok: false, reason: 'more than one line' };
  if (!s.startsWith(`${MARKER_PREFIX} {`) || !s.endsWith('} -->')) return { ok: false, reason: 'not the usage marker shape' };
  let m;
  try {
    m = JSON.parse(s.slice(MARKER_PREFIX.length + 1, -4));
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, reason: 'not an object' };
  for (const k of ['v', 'issue', 'run_id', 'run_attempt', 'step']) if (!(k in m)) return { ok: false, reason: `${k} is absent` };
  const out = {};
  for (const k of Object.keys(m)) {
    const bad = badValue(k, m[k], expect);
    if (bad) return { ok: false, reason: bad };
  }
  if ('costUsd' in m && m.costUsd > limits.costUsdPerStep) return { ok: false, reason: `costUsd is above the ceiling of ${limits.costUsdPerStep}` };
  const tokens = TOKEN_KEYS.reduce((s, k) => s + (m[k] ?? 0), 0);
  if (tokens > limits.tokensPerStep) return { ok: false, reason: `tokens are above the ceiling of ${limits.tokensPerStep}` };
  const fixed = { ...m };
  const missing = new Set(m.missing ?? []);
  if (typeof expect.sha === 'string' && SHA_RE.test(expect.sha)) {
    fixed.sha = expect.sha;
    missing.delete('sha');
  } else {
    delete fixed.sha;
    missing.add('sha');
  }
  delete fixed.missing;
  if (missing.size) fixed.missing = MISSING_ORDER.filter((n) => missing.has(n));
  for (const k of KEY_ORDER) if (k in fixed) out[k] = fixed[k];
  return { ok: true, line: markerLine(out) };
}

/**
 * Prints the usage marker of one run and returns 0 whatever happens, so a gap never turns the run
 * red: the gap is named in `missing`. Needs no token, and prints the marker line and nothing else,
 * never the execution file or an error that could quote it. Env: ISSUE, GITHUB_RUN_ID,
 * GITHUB_RUN_ATTEMPT, GITHUB_JOB, USAGE_STEP, USAGE_SHA. Imports node built-ins only, so the review
 * job can run main's copy of this file, taken from git, without running the agent's checkout.
 */
export async function usageMarkerMain(file, env, { fetch: fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let messages = null;
  try {
    if (file) messages = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    messages = null;
  }
  let fx = null;
  try {
    const res = await fetchImpl(FX_URL, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) fx = fxFromResponse(await res.json());
  } catch {
    fx = null;
  }
  const num = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
  console.log(markerLine(buildMarker({
    messages,
    fx,
    run: {
      issue: num(env.ISSUE), run_id: num(env.GITHUB_RUN_ID), run_attempt: num(env.GITHUB_RUN_ATTEMPT),
      job: env.GITHUB_JOB, step: env.USAGE_STEP, sha: env.USAGE_SHA, at: new Date(now()).toISOString(),
    },
  })));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await usageMarkerMain(process.argv[2], process.env);
}
