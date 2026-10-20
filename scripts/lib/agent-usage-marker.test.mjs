/**
 * Usage marker parser (docs/sdd/agent-office-live/spec.md R50, R59; tasks.md T25).
 *
 * The result message below is shaped from the SDK's own type, `SDKResultSuccess` and `ModelUsage` in
 * @anthropic-ai/claude-agent-sdk 0.3.x sdk.d.ts (the version the pinned claude-code-action
 * 1d6de8cb0 declares, base-action/package.json "^0.3.296"). It is NOT a captured run: T24 replaces
 * it with scripts/agent/fixtures/result-message.json read from the first real agent run, and the key
 * names stay UNVERIFIED until then.
 *
 * Run with `TZ=UTC node --test scripts/lib/agent-usage-marker.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MARKER_PREFIX, buildMarker, checkMarkerLine, fxFromResponse, markerLine, usageFromMessages } from '../agent/usage-marker.mjs';
import { main } from '../agent/cli.mjs';

const SECRET = 'TRANSCRIPT-TEXT-MUST-NOT-LEAK';
const init = { type: 'system', subtype: 'init', session_id: 's-1', model: 'claude-opus-5-5', tools: ['Read'], cwd: `/home/${SECRET}` };
const assistant = { type: 'assistant', message: { content: [{ type: 'text', text: SECRET }] } };
const result = (over = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1000,
  num_turns: 3,
  result: SECRET,
  session_id: 's-1',
  total_cost_usd: 1.2345,
  usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 },
  modelUsage: {
    'claude-opus-5-5': { inputTokens: 100, outputTokens: 400, cacheReadInputTokens: 3000, cacheCreationInputTokens: 200, webSearchRequests: 0, costUSD: 1.2, contextWindow: 200000, maxOutputTokens: 64000 },
    'claude-haiku-4-5': { inputTokens: 5, outputTokens: 6, cacheReadInputTokens: 7, cacheCreationInputTokens: 8, webSearchRequests: 0, costUSD: 0.0345, contextWindow: 200000, maxOutputTokens: 8000 },
  },
  permission_denials: [{ tool_name: 'Bash', tool_input: { command: SECRET } }],
  ...over,
});
const run = { issue: 501, run_id: 123456789, run_attempt: 1, job: 'agent', step: 'work', sha: 'a'.repeat(40), at: '2026-10-16T05:00:00.000Z' };
const fx = { fxRate: 36.12, fxAt: '2026-10-16T00:02:31.000Z' };

/** Every string anywhere in a value, so a test can say no input text survived. */
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

test('R50: a result message gives the marker with every field', () => {
  const m = buildMarker({ messages: [init, assistant, result()], fx, run });
  assert.deepEqual(m, {
    v: 1, issue: 501, run_id: 123456789, run_attempt: 1, job: 'agent', step: 'work', sha: 'a'.repeat(40),
    at: '2026-10-16T05:00:00.000Z', model: 'claude-opus-5-5',
    input: 105, cacheRead: 3007, cacheWrite: 208, output: 406, costUsd: 1.2345,
    fxRate: 36.12, fxAt: '2026-10-16T00:02:31.000Z',
  });
});

test('R50: the last result message is the one read', () => {
  const first = result({ total_cost_usd: 9, modelUsage: { m1: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 1, cacheCreationInputTokens: 1, costUSD: 9 } } });
  const m = buildMarker({ messages: [first, assistant, result()], fx, run });
  assert.equal(m.costUsd, 1.2345);
  assert.equal(m.model, 'claude-opus-5-5');
});

test('R50: with no modelUsage the totals come from usage, the model from the init message', () => {
  const u = usageFromMessages([init, result({ modelUsage: undefined })]);
  assert.deepEqual(u, { model: 'claude-opus-5-5', input: 10, cacheRead: 30, cacheWrite: 20, output: 40, costUsd: 1.2345, missing: [] });
});

test('R50: an array with no result message gives "missing": ["result"] and no numbers', () => {
  const m = buildMarker({ messages: [init, assistant], fx, run });
  assert.deepEqual(m.missing, ['result']);
  for (const k of ['model', 'input', 'cacheRead', 'cacheWrite', 'output', 'costUsd']) assert.equal(k in m, false, k);
  assert.equal(m.fxRate, 36.12, 'the rate is still a real reading of its own');
});

test('R50: a missing or unreadable file gives "missing": ["file"] and no numbers', () => {
  for (const messages of [null, undefined, 'not an array', { type: 'result' }]) {
    const m = buildMarker({ messages, fx, run });
    assert.deepEqual(m.missing, ['file'], JSON.stringify(messages));
    assert.equal('input' in m, false);
  }
});

test('R50: a missing FX rate gives "missing": ["fx"] and no rate', () => {
  const m = buildMarker({ messages: [result()], fx: null, run });
  assert.deepEqual(m.missing, ['fx']);
  assert.equal('fxRate' in m, false);
  assert.equal('fxAt' in m, false);
  assert.equal(m.costUsd, 1.2345, 'the tokens and the USD cost still count');
});

test('R51: a result message with no total_cost_usd keeps its tokens and says costUsd is missing', () => {
  const m = buildMarker({ messages: [result({ total_cost_usd: undefined })], fx, run });
  assert.deepEqual(m.missing, ['costUsd']);
  assert.equal('costUsd' in m, false);
  assert.equal(m.input, 105);
});

test('R50: a number that is not a finite count is never invented or passed on', () => {
  const bad = result({ total_cost_usd: -1, modelUsage: { m: { inputTokens: 'lots', outputTokens: 1, cacheReadInputTokens: 1, cacheCreationInputTokens: 1, costUSD: 1 } }, usage: undefined });
  const m = buildMarker({ messages: [bad], fx, run });
  assert.deepEqual(m.missing, ['tokens', 'costUsd']);
  for (const k of ['input', 'cacheRead', 'cacheWrite', 'output', 'costUsd']) assert.equal(k in m, false, k);
});

test('R50, R59: no text from the input other than model reaches the marker, and model is sanitised', () => {
  const m = buildMarker({ messages: [init, assistant, result()], fx, run });
  const text = JSON.stringify(m);
  assert.equal(text.includes(SECRET), false);
  const inputStrings = new Set(strings([init, assistant, result()]));
  const leaked = strings(m).filter((s) => inputStrings.has(s) && s !== m.model);
  assert.deepEqual(leaked, []);
  // A model name that could close the HTML comment or carry text is refused, not passed on.
  const evil = { ...result(), modelUsage: { 'x --> <b>hi</b>': { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 1, cacheCreationInputTokens: 1, costUSD: 1 } } };
  const m2 = buildMarker({ messages: [evil], fx, run });
  assert.equal('model' in m2, false);
  assert.deepEqual(m2.missing, ['model']);
});

test('R50: run fields come only from the workflow, checked, and a bad one is dropped into missing', () => {
  const m = buildMarker({ messages: [result()], fx, run: { ...run, job: 'agent --> x', step: 'other', sha: 'nothex' } });
  assert.equal('job' in m, false);
  assert.equal('step' in m, false);
  assert.equal('sha' in m, false);
  assert.deepEqual(m.missing, ['job', 'step', 'sha']);
});

test('R50: the line is one HTML comment holding compact JSON', () => {
  const line = markerLine(buildMarker({ messages: [result()], fx, run }));
  assert.ok(line.startsWith(`${MARKER_PREFIX} {`));
  assert.ok(line.endsWith('} -->'));
  assert.equal(line.includes('\n'), false);
  assert.equal((line.match(/-->/g) ?? []).length, 1);
  assert.deepEqual(JSON.parse(line.slice(MARKER_PREFIX.length + 1, -4)).costUsd, 1.2345);
});

test('R50: the open.er-api.com answer gives THB and its update time, anything else gives null', () => {
  assert.deepEqual(
    fxFromResponse({ result: 'success', time_last_update_unix: 1760572951, base_code: 'USD', rates: { THB: 32.45 } }),
    { fxRate: 32.45, fxAt: '2025-10-16T00:02:31.000Z' },
  );
  assert.equal(fxFromResponse({ result: 'error' }), null);
  assert.equal(fxFromResponse({ result: 'success', base_code: 'EUR', time_last_update_unix: 1, rates: { THB: 1 } }), null);
  assert.equal(fxFromResponse({ result: 'success', base_code: 'USD', time_last_update_unix: 1, rates: { THB: 0 } }), null);
  assert.equal(fxFromResponse(null), null);
});

// ---- checkMarkerLine (R50, R59): the usage job re-checks a line made in the agent's workspace.

const expect = { issue: 501, run_id: 123456789, run_attempt: 1, step: 'work', sha: 'a'.repeat(40) };
const good = () => markerLine(buildMarker({ messages: [result()], fx, run }));
const fields = (line) => JSON.parse(line.slice(MARKER_PREFIX.length + 1, -4));

test('N3: usage-check sets sha to the head the run read from GitHub, whatever the line held', () => {
  const other = 'f'.repeat(40);
  const r = checkMarkerLine(good(), { ...expect, sha: other });
  assert.equal(r.ok, true, r.reason);
  assert.equal(fields(r.line).sha, other);
  assert.equal('missing' in fields(r.line), false);
  // A line with no sha (the parser never knows it) gains the run's sha, and sha leaves `missing`.
  const noSha = markerLine(buildMarker({ messages: [result()], fx, run: { ...run, sha: undefined } }));
  assert.deepEqual(fields(noSha).missing, ['sha']);
  const filled = checkMarkerLine(noSha, expect);
  assert.equal(fields(filled.line).sha, 'a'.repeat(40));
  assert.equal('missing' in fields(filled.line), false);
  // No branch found: sha is dropped and named missing, even when the line claimed one.
  const none = checkMarkerLine(good(), { ...expect, sha: '' });
  assert.equal('sha' in fields(none.line), false);
  assert.deepEqual(fields(none.line).missing, ['sha']);
  // The keys keep their order.
  assert.deepEqual(Object.keys(fields(filled.line)), Object.keys(fields(good())));
});

test('N1: usage-check refuses a cost or a token total above the ceilings of usage-limits.json', () => {
  const limits = JSON.parse(readFileSync(new URL('../agent/usage-limits.json', import.meta.url), 'utf8'));
  assert.equal(limits.tokensPerStep, 29_100_000);
  assert.equal(limits.costUsdPerStep, 582);
  assert.match(limits.source, /R60/);
  assert.match(limits.source, /prices/);
  const line = (patch) => markerLine({ ...buildMarker({ messages: [result()], fx, run }), ...patch });
  assert.equal(checkMarkerLine(line({ costUsd: 582 }), expect).ok, true, 'at the ceiling');
  assert.match(checkMarkerLine(line({ costUsd: 582.01 }), expect).reason, /costUsd is above/);
  const at = { input: 29_000_000, cacheRead: 99_997, cacheWrite: 2, output: 1 };
  assert.equal(checkMarkerLine(line(at), expect).ok, true, 'a token total at the ceiling');
  assert.match(checkMarkerLine(line({ ...at, output: 2 }), expect).reason, /tokens are above/);
});

test('N5: a line holding more than one line is refused, whatever follows the newline', () => {
  for (const tail of ['\nsecond line', '\r\n', `\n${good()}`, '\r']) {
    const r = checkMarkerLine(`${good()}${tail}`, expect);
    assert.deepEqual(r, { ok: false, reason: 'more than one line' }, JSON.stringify(tail));
  }
  const inside = good().replace('"v":1', '"v":1\n');
  assert.deepEqual(checkMarkerLine(inside, expect), { ok: false, reason: 'more than one line' });
});

test('B1: the parser fallback is a marker usage-check accepts', () => {
  const fallback = '<!-- agent-office:usage {"v":1,"issue":501,"run_id":123456789,"run_attempt":1,"job":"agent","step":"work","missing":["parser"]} -->';
  const r = checkMarkerLine(fallback, expect);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(fields(r.line).missing, ['parser']);
  assert.equal(fields(r.line).sha, 'a'.repeat(40));
});

test('R59: a well-formed line for this run, issue and step passes, re-serialised the same', () => {
  assert.deepEqual(checkMarkerLine(good(), expect), { ok: true, line: good() });
  const gap = markerLine(buildMarker({ messages: null, fx: null, run }));
  assert.equal(checkMarkerLine(gap, expect).ok, true, 'a marker naming its gaps is still a marker');
});

test('R59: a line for another run, issue, step or job, or with text, is refused without quoting it', () => {
  const swap = (patch) => {
    const m = { ...buildMarker({ messages: [result()], fx, run }), ...patch };
    return markerLine(m);
  };
  const cases = [
    ['', 'empty'],
    [`${good()}\nsecond line`, 'two lines'],
    [good().replace(' -->', ''), 'no end'],
    ['<!-- agent-office:usage {not json} -->', 'not json'],
    [swap({ issue: 502 }), 'issue'],
    [swap({ run_id: 1 }), 'run'],
    [swap({ run_attempt: 2 }), 'attempt'],
    [swap({ step: 'review' }), 'step'],
    [swap({ job: 'review' }), 'job'],
    [swap({ note: SECRET }), 'unknown key'],
    [swap({ model: 'x --> y' }), 'model'],
    [swap({ input: -1 }), 'count'],
    [swap({ input: 1.5 }), 'count'],
    [swap({ costUsd: 'free' }), 'cost'],
    [swap({ fxAt: 'yesterday' }), 'time'],
    [swap({ missing: ['everything'] }), 'missing'],
    [swap({ v: 2 }), 'version'],
  ];
  for (const [line, why] of cases) {
    const r = checkMarkerLine(line, expect);
    assert.equal(r.ok, false, why);
    assert.equal(String(r.reason).includes(SECRET), false, why);
  }
});

// ---- cli.mjs usage-marker (R50): reads the file, fetches the rate, prints the one line, exits 0.

async function runCli(file, { fetchImpl, env = {} } = {}) {
  const lines = [];
  const log = console.log;
  const err = console.error;
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    const exit = await main(['usage-marker', file], {
      ISSUE: '501', GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'review',
      USAGE_STEP: 'review', USAGE_SHA: 'b'.repeat(40), ...env,
    }, { fetch: fetchImpl, now: () => Date.parse('2026-10-16T05:00:00Z') });
    return { exit, lines };
  } finally {
    console.log = log;
    console.error = err;
  }
}
const okFx = async (url) => {
  assert.equal(url, 'https://open.er-api.com/v6/latest/USD');
  return { ok: true, json: async () => ({ result: 'success', base_code: 'USD', time_last_update_unix: 1760572951, rates: { THB: 32.45 } }) };
};
const parseLine = (line) => JSON.parse(line.slice(MARKER_PREFIX.length + 1, -4));

test('R50: the CLI prints only the marker line, built from the file, the env and the rate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-'));
  const file = join(dir, 'claude-execution-output.json');
  writeFileSync(file, JSON.stringify([init, assistant, result()], null, 2));
  const { exit, lines } = await runCli(file, { fetchImpl: okFx });
  assert.equal(exit, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes(SECRET), false);
  const m = parseLine(lines[0]);
  assert.deepEqual(
    [m.issue, m.run_id, m.run_attempt, m.job, m.step, m.sha, m.at, m.fxRate, m.input, m.missing],
    [501, 123456789, 2, 'review', 'review', 'b'.repeat(40), '2026-10-16T05:00:00.000Z', 32.45, 105, undefined],
  );
});

test('R50: no file, a broken file or a failed rate still exit 0 with the gap named, never the text', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-'));
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, `{"oops": "${SECRET}"`);
  const down = async () => { throw new Error('network down'); };
  const notOk = async () => ({ ok: false, status: 503, json: async () => ({}) });
  for (const [file, fetchImpl, want] of [
    ['', okFx, ['file']],
    [join(dir, 'nope.json'), okFx, ['file']],
    [broken, okFx, ['file']],
    [broken, down, ['file', 'fx']],
    [broken, notOk, ['file', 'fx']],
  ]) {
    const { exit, lines } = await runCli(file, { fetchImpl });
    assert.equal(exit, 0, file);
    assert.equal(lines.length, 1, file);
    assert.equal(lines[0].includes(SECRET), false);
    assert.deepEqual(parseLine(lines[0]).missing, want, file);
  }
});

test('R59: the CLI usage-check prints the checked line, or exits 1 naming the reason only', async () => {
  const env = { ISSUE: '501', GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '1' };
  const capture = async (args) => {
    const lines = [];
    const [log, err] = [console.log, console.error];
    console.log = (...a) => lines.push(`out:${a.join(' ')}`);
    console.error = (...a) => lines.push(`err:${a.join(' ')}`);
    try { return { exit: await main(['usage-check', ...args], env), lines }; } finally { console.log = log; console.error = err; }
  };
  const ok = await capture(['work', good(), 'a'.repeat(40)]);
  assert.deepEqual(ok, { exit: 0, lines: [`out:${good()}`] });
  const bad = await capture(['review', good(), 'a'.repeat(40)]);
  assert.equal(bad.exit, 1);
  assert.equal(bad.lines.length, 1);
  assert.match(bad.lines[0], /^err:usage-check: /);
  assert.equal(bad.lines[0].includes('agent-office:usage'), false, 'the refused line is not quoted');
});
