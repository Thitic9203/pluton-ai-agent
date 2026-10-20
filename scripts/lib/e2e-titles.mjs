// The title convention of e2e/README.md section 5, made a check (owner popup, 13 Oct 2026:
// "บังคับทุกชื่อ"). Every `test.describe` reads `<screen>: <what is tested> <ref>` in 60 code points
// or fewer; every `test` reads `[<role>] <action> → <expected result> (<ref>)` in 90 code points or
// fewer, with one arrow. The references are real sources, never a made up number:
//   - `#NNN`, a GitHub issue or pull request;
//   - `SPEC 4.8` or `DATA_MODEL 3.1`, a section;
//   - a case id the test-case tables define (`C1`, `AUTH-04`), owner popup 13 Oct 2026
//     "ใช้รหัสเคส/SPEC แทน #NNN";
//   - `DL YYYY-MM-DD`, the date of a docs/DECISION_LOG.md entry the test traces, owner popup
//     13 Oct 2026 "อ้าง DECISION_LOG ได้". The date must be the date of a real entry heading.
// A describe ends with one of them after a space; a test ends with them in parentheses.
//
// Pure: `titleViolations` takes the titles and returns what is wrong with each; `caseIdsFromMarkdown`
// and `decisionDatesFrom` read what the documents define; `titlesFromList` reads the output of
// `npx playwright test --list`, where every templated title (`${ROLE_TH[role]}`) is already expanded.
// scripts/e2e-titles.mjs gathers and exits on the verdict.

import { e2eEnv } from './e2e-env.mjs';

/**
 * The environment `playwright test --list` runs in. Every caller E2E_ variable is cleared, so a tag,
 * a scope or a shard cannot narrow what is checked, and E2E_GROUP=full reads the touch specs too.
 * The ports and project id are then added the way scripts/e2e.mjs builds its own listing env
 * (`e2eEnv`): in CI playwright.config.ts refuses to load without E2E_PROJECT_ID and E2E_APP_PORT
 * (scripts/lib/e2e-project.mjs, scripts/lib/e2e-port.mjs), which turned CI run 38411852421 red.
 * A listing starts no emulator and no server, so the drawn ports are never bound, and the project
 * id only has to satisfy resolveProjectId: the per-run id scripts/e2e.mjs derives exists so two
 * emulator runs on one host never share firebase-tools' registry key (docs/PITFALLS.md 6.27), and a
 * listing registers nothing. LIST_PROJECT_ID is that one fixed `demo-` id.
 */
export const LIST_PROJECT_ID = 'demo-taskfolio-e2e-titles';

export function listEnv(base, { firestore, auth, app, project = LIST_PROJECT_ID }) {
  const cleared = Object.fromEntries(Object.entries(base).filter(([k]) => !k.startsWith('E2E_')));
  return { ...e2eEnv(cleared, { firestore, auth, app, project }), E2E_GROUP: 'full' };
}

/** The role labels of README section 5, in the order the README lists them. */
export const ROLE_LABELS = [
  'พนักงาน',
  'หัวหน้าทีม',
  'ผู้บริหาร',
  'แอดมิน',
  'ผู้ที่ยังไม่เข้าระบบ',
  'บัญชีรออนุมัติ',
  'บัญชีที่ถูกปิด',
  'คนนอกบริษัท',
  'พนักงานที่ถูกเชิญ',
  'ระบบ',
];

/** README section 5: on a touch device the label gains this word, `[พนักงาน บนมือถือ]`. */
export const TOUCH_SUFFIX = 'บนมือถือ';

export const DESCRIBE_MAX = 60;
export const TEST_MAX = 90;
export const ARROW = '→';

const ISSUE = /^#[1-9]\d*$/;
const SECTION = /^(?:SPEC|DATA_MODEL) [1-9]\d*(?:\.\d+)*[a-z]?$/;
const DECISION = /^DL (\d{4}-\d{2}-\d{2})$/;
export const CASE_ID = /^[A-Z]{1,8}-?\d+[a-z]?$/;

/*
 * A case id counts only when a test-case table defines it. A test-case table is one whose header is
 * `| No. | Check | ...` (the Layer C table of docs/e2e/E2E_MASTER_PLAN.md, C1 to C5) or starts with
 * `| ID |` and has an `Expected` column (the beta case lists under docs/action-items/prep/, AUTH-04,
 * SUB-05). A table of risks, decisions, batches or journeys defines no case id, so R72, OD-43, D1,
 * B3 or J4 never pass as one (independent review, 13 Oct 2026).
 */
function isCaseTableHeader(cells) {
  if (cells[0] === 'No.' && cells[1] === 'Check') return true;
  return cells[0] === 'ID' && cells.some((c) => /^Expected\b/.test(c));
}

const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** The case ids the test-case tables of a markdown text define: the first cell of each data row. */
export function caseIdsFromMarkdown(text) {
  const ids = new Set();
  const lines = text.split('\n');
  let inCaseTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) { inCaseTable = false; continue; }
    const next = lines[i + 1] ?? '';
    if (/^\s*\|?\s*:?-{3,}/.test(next)) { inCaseTable = isCaseTableHeader(cellsOf(line)); i++; continue; }
    if (!inCaseTable) continue;
    const first = cellsOf(line)[0];
    if (CASE_ID.test(first)) ids.add(first);
  }
  return ids;
}

/** The dates of the DECISION_LOG entries: every heading that ends `· YYYY-MM-DD`. */
export function decisionDatesFrom(text) {
  const dates = new Set();
  for (const line of text.split('\n')) {
    const m = /^#{2,6} .*· (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (m) dates.add(m[1]);
  }
  return dates;
}

/**
 * Whether `ref` is one reference. `caseIds` and `decisionDates`, when given, are what the documents
 * define; a case id or a DL date outside them is refused. scripts/e2e-titles.mjs always gives both.
 */
export function isRef(ref, { caseIds, decisionDates } = {}) {
  if (ISSUE.test(ref) || SECTION.test(ref)) return true;
  const dl = DECISION.exec(ref);
  if (dl) return decisionDates === undefined || decisionDates.has(dl[1]);
  if (!CASE_ID.test(ref)) return false;
  return caseIds === undefined || caseIds.has(ref);
}

/** The reference a describe ends with, after a space, or null. */
const DESCRIBE_TAIL = / (#\d+|(?:SPEC|DATA_MODEL) \d+(?:\.\d+)*[a-z]?|DL \d{4}-\d{2}-\d{2}|[A-Z]{1,8}-?\d+[a-z]?)$/;

/**
 * The length a limit is measured in: Unicode code points, not UTF-16 units and not visible
 * characters. A Thai vowel or tone mark above or below a consonant is its own code point and counts
 * as one, so `ที่` is 3 although it draws as one cell.
 */
export function length(title) {
  return [...title].length;
}

/**
 * Whether `label` (the text inside the leading brackets) is a role label of README section 5:
 * one role, or several joined by ` + ` with none repeated, optionally followed by ` บนมือถือ`.
 */
export function isRoleLabel(label) {
  let people = label;
  if (people.endsWith(` ${TOUCH_SUFFIX}`)) people = people.slice(0, -TOUCH_SUFFIX.length - 1);
  const parts = people.split(' + ');
  return parts.length > 0 && parts.every((p) => ROLE_LABELS.includes(p)) && new Set(parts).size === parts.length;
}

/** Whether the parenthesised tail of a test title is one or more references, comma separated. */
export function isRefList(inner, known = {}) {
  const refs = inner.split(', ');
  return refs.length > 0 && refs.every((r) => isRef(r, known));
}

const REF_WORDS = '#NNN, SPEC 4.8, DL YYYY-MM-DD of a real entry, or a case id a test-case table defines';

/**
 * What is wrong with each title. `titles` is a list of `{ file, line, kind, title }` with `kind`
 * either 'describe' or 'test'; the result lists `{ file, line, kind, title, reasons }` for every
 * title with at least one reason, in input order. `known` is `{ caseIds, decisionDates }`.
 */
export function titleViolations(titles, known = {}) {
  const out = [];
  for (const t of titles) {
    const reasons = [];
    const n = length(t.title);
    // Any @, so a tag after a bracket or quote and an email address are refused alike.
    if (t.title.includes('@')) reasons.push('contains @ (a tag belongs in { tag }, an address never goes in a title)');
    if (t.kind === 'describe') {
      if (n > DESCRIBE_MAX) reasons.push(`${n} code points, the limit is ${DESCRIBE_MAX}`);
      if (!/^[^:]*\S: \S/.test(t.title)) reasons.push('does not start with "<screen name>: "');
      const tail = DESCRIBE_TAIL.exec(t.title);
      if (!tail || !isRef(tail[1], known)) reasons.push(`does not end with a reference after a space: ${REF_WORDS}`);
    } else if (t.kind === 'test') {
      if (n > TEST_MAX) reasons.push(`${n} code points, the limit is ${TEST_MAX}`);
      const arrows = t.title.split(ARROW).length - 1;
      if (arrows !== 1) reasons.push(`${arrows} arrows, a test title has exactly one ${ARROW}`);
      const lead = /^\[([^\]]+)\] /.exec(t.title);
      if (!lead) reasons.push('does not start with "[<role>] "');
      else if (!isRoleLabel(lead[1])) reasons.push(`"[${lead[1]}]" is not a role label of e2e/README.md section 5, or repeats a role`);
      const tail = / \(([^()]+)\)$/.exec(t.title);
      if (!tail || !isRefList(tail[1], known)) reasons.push(`does not end with " (<ref>)": ${REF_WORDS}`);
      if (arrows === 1 && lead && tail) {
        const action = t.title.slice(lead[0].length, t.title.indexOf(ARROW));
        const result = t.title.slice(t.title.indexOf(ARROW) + ARROW.length, t.title.length - tail[0].length);
        if (!/^\S.*\S $|^\S $/.test(action)) reasons.push(`the action before ${ARROW} is empty or not set off by single spaces`);
        if (!/^ \S(.*\S)?$/.test(result)) reasons.push(`the result after ${ARROW} is empty or not set off by single spaces`);
      }
    } else {
      reasons.push(`unknown kind "${t.kind}"`);
    }
    if (reasons.length) out.push({ ...t, reasons });
  }
  return out;
}

/**
 * The titles in the output of `npx playwright test --list`, one entry per distinct title (a test
 * listed once per project is one title). A line reads
 * `  [project] › file.spec.ts:12:3 › describe › inner describe › test`. `fileOf` turns the path
 * Playwright prints, which is relative to the config's test directory, into the repository path;
 * the caller knows the config. A describe carries the file and line of the first test under it.
 */
export function titlesFromList(text, fileOf = (p) => `e2e/${p}`) {
  const seen = new Set();
  const out = [];
  for (const raw of text.split('\n')) {
    const parts = raw.trim().split(' › ');
    if (parts.length < 3 || !/^\[[^\]]+\]$/.test(parts[0])) continue;
    const loc = /^(.+?):(\d+):\d+$/.exec(parts[1]);
    if (!loc) continue;
    const file = fileOf(loc[1]);
    const line = Number(loc[2]);
    const chain = parts.slice(2);
    chain.forEach((title, i) => {
      const kind = i === chain.length - 1 ? 'test' : 'describe';
      const key = kind === 'test' ? `test|${file}:${line}|${title}` : `describe|${file}|${chain.slice(0, i + 1).join(' › ')}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ file, line, kind, title });
    });
  }
  return out;
}
