/* The end to end result as one Slack post with the Playwright HTML report attached (owner popups,
 * 14 Oct 2026; DECISION_LOG "Every end to end run posts its result and report to Slack").
 *
 * A port of ols-qa-e2e-slack's scripts/slack-e2e-report.ts, not a redesign: the same message shape,
 * the same reading of the report.json Playwright embeds in the very index.html that is attached (so
 * the text and the file cannot disagree), and the same upload (files.getUploadURLExternal, POST the
 * bytes, files.completeUploadExternal with the summary as its initial_comment). What differs:
 *   - Taskfolio titles read `[<role>] <action> → <result> (<ref>)` (e2e/README.md section 5,
 *     scripts/lib/e2e-titles.mjs), so the role and the case id come from the title, not from tags;
 *   - Playwright 1.57 writes `<script id="playwrightReportBase64" type="application/zip">`, which the
 *     OLS pattern (no attribute between id and `>`) does not match;
 *   - when the upload is refused (files:write is not granted yet), the summary still goes by
 *     chat.postMessage and the caller exits non-zero, so the channel hears the result and the job
 *     log names the Slack error. */

import { inflateRawSync } from 'node:zlib';
import { ROLE_LABELS, TOUCH_SUFFIX } from './e2e-titles.mjs';
import { slackCall } from './slack.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const PRODUCT = 'Taskfolio';

/** `8 Oct 2026, 3:52 PM` in Asia/Bangkok. */
export function stamp(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour) % 24;
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${h % 12 || 12}:${p.minute} ${h < 12 ? 'AM' : 'PM'}`;
}

export function duration(seconds) {
  const s = Math.round(seconds);
  if (s < 1) return '<1s';
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** The bracketed role label a title starts with; ranked in README order, a touch label with its base. */
export function roleOf(title) {
  const m = /^\[([^\]]+)\]\s*/.exec(title);
  if (!m) return { role: 'Other', roleRank: ROLE_LABELS.length + 1 };
  const role = m[1].trim();
  const base = role.endsWith(` ${TOUCH_SUFFIX}`) ? role.slice(0, -TOUCH_SUFFIX.length - 1) : role;
  const i = ROLE_LABELS.indexOf(base);
  return { role, roleRank: i >= 0 ? i : ROLE_LABELS.length };
}

/** The reference in the trailing parentheses (`(C1)` → `C1`); the whole title when there is none. */
export function caseIdOf(title) {
  return /\(([^()]+)\)\s*$/.exec(title)?.[1].trim() ?? title;
}

const withoutRole = (title) => title.replace(/^\[[^\]]+\]\s*/, '');

function zipEntries(html) {
  const m = /id="playwrightReportBase64"[^>]*>data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(html);
  if (!m) throw new Error('HTML has no embedded Playwright report; is this a playwright html report index.html?');
  const zip = Buffer.from(m[1], 'base64');
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('embedded report is not a zip archive');
  const out = new Map();
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** report.json from the attached index.html, plus each file's detail (`<fileId>.json`). */
export function readEmbeddedReport(html) {
  const entries = zipEntries(html);
  const main = entries.get('report.json');
  if (!main) throw new Error('embedded report has no report.json');
  const report = JSON.parse(main.toString('utf8'));
  report.details = {};
  for (const f of report.files ?? []) {
    const d = entries.get(`${f.fileId}.json`);
    if (d) report.details[f.fileId] = JSON.parse(d.toString('utf8'));
  }
  return report;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const REASON_MAX = 240;

function clip(s) {
  if (s.length <= REASON_MAX) return s;
  const cut = s.slice(0, REASON_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), REASON_MAX * 0.6)).trimEnd()}…`;
}

/** The assertion's first line, its locator, Expected / Received, verbatim from Playwright's error. */
export function reasonFromError(raw) {
  const lines = raw.replace(ANSI, '').split('\n');
  const parts = [];
  const head = lines.find((l) => l.trim())?.trim().replace(/^Error:\s*/, '');
  if (head) parts.push(head);
  for (const key of ['Locator:', 'Expected:', 'Received:']) {
    const l = lines.find((x) => x.trim().startsWith(key));
    if (l) parts.push(l.trim().replace(/\s+/g, ' '));
  }
  const diffExp = lines.find((l) => /^\s*-\s{2,}\S/.test(l));
  const diffRec = lines.find((l) => /^\s*\+\s{2,}\S/.test(l));
  if (diffExp && diffRec)
    parts.push(`Expected: ${diffExp.replace(/^\s*-\s+/, '').replace(/,$/, '')} · Received: ${diffRec.replace(/^\s*\+\s+/, '').replace(/,$/, '')}`);
  if (lines.some((l) => l.trim() === 'Error: element(s) not found')) parts.push('element(s) not found');
  return clip(parts.join(' · '));
}

function reasonOf(t, detail) {
  if (t.outcome === 'skipped') {
    const ann = [...(detail?.annotations ?? t.annotations ?? []), ...(detail?.results ?? []).flatMap((r) => r.annotations ?? [])];
    const skip = ann.find((a) => a.type === 'skip' && a.description?.trim());
    return skip ? clip(skip.description.trim().replace(/\s+/g, ' ')) : undefined;
  }
  const attempts = (detail?.results ?? []).filter((r) => (r.errors ?? []).length > 0);
  const attempt = t.outcome === 'flaky' ? attempts[0] : attempts[attempts.length - 1];
  const err = attempt?.errors?.[0];
  const msg = typeof err === 'string' ? err : err?.message;
  return msg ? reasonFromError(msg) : undefined;
}

/** The counts of Playwright's own report header, plus every case that did not pass. */
export function summarize(report) {
  const st = report?.stats;
  if (!st || ['expected', 'unexpected', 'flaky', 'skipped'].some((k) => typeof st[k] !== 'number'))
    throw new Error('report has no `stats` block; is this a Playwright HTML report?');
  const notPassing = (report.files ?? []).flatMap((f) =>
    f.tests
      .filter((t) => t.outcome === 'unexpected' || t.outcome === 'flaky' || t.outcome === 'skipped')
      .map((t) => {
        const detail = report.details?.[f.fileId]?.tests.find((d) => d.testId === t.testId);
        const reason = reasonOf(t, detail);
        return { title: t.title, ...roleOf(t.title), project: t.projectName, outcome: t.outcome, ...(reason ? { reason } : {}) };
      }),
  );
  notPassing.sort((a, b) => a.roleRank - b.roleRank || a.title.localeCompare(b.title));
  return {
    passed: st.expected,
    failed: st.unexpected,
    flaky: st.flaky,
    skipped: st.skipped,
    total: st.expected + st.unexpected + st.flaky + st.skipped,
    startTime: new Date(report.startTime),
    durationS: report.duration / 1000,
    notPassing,
  };
}

/** Where the suite ran: the CI emulators of the runner, on main's short sha, and the device group. */
export function envLabel({ sha, group, target } = {}) {
  if (!sha) throw new Error('envLabel needs the commit sha');
  /* Owner, 15 Oct 2026: the post reports the staging run against the deployed site (ci.yml e2e-staging). */
  if (target === 'staging') return `Staging taskfolio-staging.web.app, main ${sha.slice(0, 7)}`;
  if (target !== undefined && target !== null) throw new Error(`envLabel: unknown target ${JSON.stringify(target)}`);
  return `CI emulators, main ${sha.slice(0, 7)}${group ? `, device group ${group}` : ''}`;
}

/** `20261008-Taskfolio-E2E-<env slug>-Playwright-Test-Report.html`, the date in Asia/Bangkok. */
export function reportFileName(startTime, env) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(startTime).replaceAll('-', '');
  const slug = env.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${ymd}-${PRODUCT}-E2E-${slug}-Playwright-Test-Report.html`;
}

const SECTIONS = [
  { outcome: 'unexpected', label: 'Failed', icon: '❌' },
  { outcome: 'flaky', label: 'Flaky', icon: '⚠️' },
  { outcome: 'skipped', label: 'Skipped', icon: '⏭️' },
];

const header = (env) => `*${PRODUCT} Automation test by Playwright \u2014 ${env}*`;
const runLine = (o) => (o.runUrl ? `• *Run:* <${o.runUrl}|${o.runLabel ?? 'GitHub Actions run'}>` : null);

/** Slack mrkdwn for the upload's comment, in the OLS notify shape. */
export function message(sum, o) {
  const executed = sum.total - sum.skipped;
  const rate = executed ? Math.round((sum.passed / executed) * 1000) / 10 : 0;
  const sections = SECTIONS.flatMap(({ outcome, label, icon }) => {
    const cases = sum.notPassing.filter((c) => c.outcome === outcome);
    if (!cases.length) return [];
    // A reason shared by several cases is said once, after the list, naming their case ids.
    const reasonText = (c) => c.reason ?? 'no reason recorded in the report';
    const byReason = new Map();
    for (const c of cases) byReason.set(reasonText(c), [...(byReason.get(reasonText(c)) ?? []), c]);
    const shared = [...byReason].filter(([, cs]) => cs.length > 1);
    const sharedSet = new Set(shared.map(([r]) => r));
    return [
      '',
      `*${label} (${cases.length}):*`,
      ...cases.flatMap((c) => [
        `• ${icon} *${c.role}${c.project ? ` (${c.project})` : ''}:* ${withoutRole(c.title)}`,
        ...(sharedSet.has(reasonText(c)) ? [] : [`      ◦ ${reasonText(c)}`]),
      ]),
      ...(shared.length
        ? ['_Same reason for several cases:_', ...shared.map(([r, cs]) => `      ◦ *${cs.map((c) => caseIdOf(c.title)).join(' · ')}* \u2014 ${r}`)]
        : []),
    ];
  });
  return [
    header(o.env),
    '',
    `Automation test by Playwright on *${o.env}* is complete.`,
    '',
    `• *Environment:* ${o.env}`,
    `• *Started:* ${stamp(sum.startTime)} · *Duration:* ${duration(sum.durationS)}`,
    `• *Result:* ✅ ${sum.passed} passed · ❌ ${sum.failed} failed · ⚠️ ${sum.flaky} flaky · ⏭️ ${sum.skipped} skipped · ${sum.total} total`,
    `• *Pass rate:* ${rate}% (${sum.passed} of ${executed} executed)`,
    runLine(o),
    ...sections,
    '',
    'See the attached file for details:',
    `• *${o.filename}*`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/**
 * Why there is no report, from e2e-report/meta.json: a merge error, the running counts the failure
 * log reporter kept (scripts/lib/e2e-failure-log.mjs, copied in by merge), or neither. A run the
 * ci-turn limit killed has counts but never ended, and must not read as one that never started
 * (docs/sdd/e2e-staging-after-deploy/spec.md R13; run 38738001653).
 * @param {{ mergeError?: unknown, progress?: { total: number, passed: number, failed: number, skipped: number, ended: boolean, status: string | null } }} meta
 */
export function noReportReason(meta) {
  if (meta.mergeError) return `the HTML report could not be built (${String(meta.mergeError)}); the run's own log has every result`;
  const p = meta.progress;
  if (p) {
    const done = p.passed + p.failed + p.skipped;
    const where = 'each failure is printed in the job log of the end to end step';
    if (!p.ended) {
      return `the run stopped before it finished (time limit, cancel or a lost runner) after ${done} of ${p.total} tests: ${p.passed} passed, ${p.failed} failed, ${p.skipped} skipped; ${where}`;
    }
    return `Playwright ended with status ${p.status ?? 'unknown'} after ${done} of ${p.total} tests (${p.passed} passed, ${p.failed} failed, ${p.skipped} skipped) but wrote no blob report; ${where}`;
  }
  return 'the E2E job wrote no blob report (it stopped before Playwright ran, or E2E_OFF is true)';
}

/** The post when the E2E job left no report to read (it failed before Playwright wrote one). */
export function noReportMessage(o) {
  return [
    header(o.env),
    '',
    `Automation test by Playwright on *${o.env}* finished without a report.`,
    '',
    `• *Environment:* ${o.env}`,
    `• *Job result:* ${o.result}`,
    runLine(o),
    '',
    `No Playwright report was produced: ${o.why}.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Upload `bytes` as `filename` into `channel` with `comment` as the post text; returns the file id. */
export async function uploadReport({ fetchImpl = globalThis.fetch, token, channel, filename, bytes, comment }) {
  const got = await slackCall(token, 'files.getUploadURLExternal', { filename, length: String(bytes.length) }, fetchImpl);
  if (!got.upload_url || !got.file_id) throw new Error('files.getUploadURLExternal returned no upload_url / file_id');
  const sent = await fetchImpl(got.upload_url, { method: 'POST', body: bytes });
  if (!sent.ok) throw new Error(`Slack upload of ${filename} failed: HTTP ${sent.status}`);
  await slackCall(
    token,
    'files.completeUploadExternal',
    { files: JSON.stringify([{ id: got.file_id, title: filename }]), channel_id: channel, initial_comment: comment },
    fetchImpl,
  );
  return got.file_id;
}

/** The upload; when Slack refuses it, the summary alone by chat.postMessage, then a throw naming why. */
export async function sendReport(input) {
  try {
    return await uploadReport(input);
  } catch (uploadErr) {
    const text = `${input.comment}\n\n⚠️ The report could not be attached: ${uploadErr.message}`;
    try {
      await slackCall(input.token, 'chat.postMessage', { channel: input.channel, text }, input.fetchImpl);
    } catch (postErr) {
      throw new Error(`${uploadErr.message}; the summary could not be posted either: ${postErr.message}`);
    }
    throw new Error(`${uploadErr.message}; the summary was posted without the file`);
  }
}
