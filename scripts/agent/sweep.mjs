/**
 * The blind-spot sweep (docs/superpowers/plans/agent-workflow-and-economy.md section 2c; always-on-dev-agent.md
 * row 16 and "กฎการทำงานของทีม agent" item 4; DECISION_LOG "Agent Office: pro render and motion sources, and the
 * blind-spot sweep's filing rules", 14 Oct 2026). A role whose box is empty looks for blind spots in its own
 * scope and files an `[Improvement]` issue for what it finds.
 *
 * Filing rules, each from the plan:
 * - The body follows the fields of .github/ISSUE_TEMPLATE/improvement.yml, with the evidence in it (2c item 2).
 * - The one label is `self-filed`. Never `agent:ready` or any `agent:` label: `decide()` in dispatch.mjs counts
 *   agent:ready only when the owner's own account applied it, and the `agent:` prefix belongs to the
 *   dispatcher. The owner adds agent:ready to start one (2c item 2).
 * - Before filing, open issues and issues closed within 30 days are searched, by the sweep's marker and by
 *   title; a duplicate gets a comment with the new evidence instead, and only when the evidence changed
 *   (2c item 4). Only the sweep's own posts say what evidence was already given.
 * - Caps: one open self-filed issue per role, five for the team (2c item 5), and three new per run, after
 *   which the sweep rests (2c item 6).
 * - When the AI cost is unpaid the sweep stops (2c item 7). The repository keeps no AI cost state yet, so
 *   the hook point is the repository variable AGENT_AI_COST_UNPAID: 'true' stops the sweep. Whoever settles
 *   the cost (the Head role) clears it.
 *
 * v1 finds only what the repository can decide by itself, cheaply and without a model call. Three roles have
 * no deterministic source yet and find nothing (ROLES, `source: null`); Head does not sweep at all.
 *
 * Pure functions plus two small file readers. Imports node:* only, because the script suite runs with no
 * install step.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const SWEEP_LABEL = 'self-filed';
/** The account the workflow token writes as; runSweep takes another login as its botLogin parameter. */
export const SWEEP_BOT_LOGIN = 'github-actions[bot]';
export const FILED_LABELS = Object.freeze([SWEEP_LABEL]);
export const CAPS = Object.freeze({ perRole: 1, total: 5, perRun: 3 });
const RECENT_DAYS = 30;
const LIST_LIMIT = 25;

/** The roles that sweep (section 2c item 1), what their scope is and what v1 checks of it. */
export const ROLES = Object.freeze([
  { id: 'po', name: 'PO', scope: 'backlog with no AC, duplicate issues, an order that does not follow value',
    source: 'issues', checks: 'open issues (not pull requests, not self-filed) whose body has no Definition of done checkbox' },
  { id: 'ba', name: 'BA', scope: 'flows and business rules with no edge case in SPEC',
    source: null, checks: 'no deterministic source in v1: judging whether a SPEC rule lacks an edge case needs a reader, not a pattern' },
  { id: 'dev', name: 'Dev', scope: 'TODO, dead code, dependencies behind, duplicated code',
    source: 'files', checks: 'TODO, FIXME, XXX and HACK comment markers in src/, functions/src/ and e2e/ (dead exports and outdated dependencies need an installed tree, not in v1)' },
  { id: 'tech-lead', name: 'Tech Lead', scope: 'architecture, security, performance',
    source: null, checks: 'no deterministic source in v1: npm audit and the size and performance budgets already gate CI' },
  { id: 'qa-lead', name: 'QA Lead', scope: 'AC with no test covering it (coverage gap)',
    source: 'e2e-coverage', checks: 'journeys of scripts/lib/e2e-coverage.mjs with a missing spec, specs with no traceTo source, and stale coverage claims' },
  { id: 'qa', name: 'QA', scope: 'exploratory test on staging',
    source: null, checks: 'no deterministic source in v1: exploratory testing needs a browser on staging, which the daily job does not start' },
]);

const roleName = (id) => ROLES.find((r) => r.id === id)?.name ?? id;
const labelNames = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));

/** Up to LIST_LIMIT lines, then one line saying how many more there are. */
function capped(lines) {
  return lines.length <= LIST_LIMIT ? lines : [...lines.slice(0, LIST_LIMIT), `- ... and ${lines.length - LIST_LIMIT} more`];
}

/**
 * Text quoted from an issue title or a source line, made inert: it cannot open or close an HTML comment,
 * so it can never plant a sweep marker, and it mentions nobody.
 */
const quote = (text) => String(text ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '(at)');

const MARKER = /(?:\/\/|\/\*|^\s*\*|#|<!--)\s*(TODO|FIXME|XXX|HACK)\b/;

/**
 * Dev: comment markers left in the source, shown as `path:line`. `files` is [{path, text}]. The digest is
 * taken over path and marker text without the line number (`digestLines`), so an edit above a marker is
 * not new evidence (review of PR #499, item 1).
 */
export function todoFinding(files) {
  const hits = [];
  const digestLines = [];
  for (const { path, text } of files ?? []) {
    String(text).split('\n').forEach((line, i) => {
      const m = MARKER.exec(line);
      if (!m) return;
      const said = `${m[1]}: ${quote(line.trim().slice(0, 120))}`;
      hits.push(`- \`${path}:${i + 1}\` ${said}`);
      digestLines.push(`${path} ${said}`);
    });
  }
  if (!hits.length) return null;
  return {
    role: 'dev', key: 'dev-todo-markers',
    title: 'Dev sweep: TODO and FIXME markers left in the source',
    location: ['- Files: `src/`, `functions/src/`, `e2e/`', '- Roles: none (code only)'],
    cause: ['- A marker records work someone meant to finish and did not; nothing tracks it outside the file',
      '- An issue is where unfinished work is tracked here (CLAUDE.md, "A bug takes a different route")'],
    approach: ['- Read each marker and decide: finish it, file it as its own item, or remove it as obsolete',
      '- Fix causes, not symptoms (hard constraint 6): no marker is removed without its work being done or tracked'],
    done: ['- [ ] `node scripts/agent/cli.mjs sweep` lists no marker for the files below',
      '- [ ] Every marker that was real work has its own issue or its fix merged'],
    benefit: ['- Unfinished work is visible in one place instead of hidden in comments'],
    evidence: [`- ${hits.length} marker(s) found by \`node scripts/agent/cli.mjs sweep\`:`, ...capped(hits)],
    digestLines,
  };
}

const CHECKBOX = /^\s*[-*] \[[ xX]\]/m;

/** PO: open issues with no Definition of done checkbox (no measurable AC). */
export function issuesWithoutDoneFinding(openIssues) {
  const bare = (openIssues ?? []).filter((i) => i && !i.pull_request && !labelNames(i).includes(SWEEP_LABEL) && !CHECKBOX.test(i.body ?? ''));
  if (!bare.length) return null;
  return {
    role: 'po', key: 'po-issues-without-done',
    title: 'PO sweep: open issues with no Definition of done',
    location: ['- GitHub issues of this repository, open, not pull requests', '- Roles: PO and BA, who set and analyse AC'],
    cause: ['- An issue with no checkbox has no measurable AC, so nobody can say when it is done',
      '- The issue forms require a Definition of done; these issues predate the forms or bypassed them'],
    approach: ['- For each issue below, PO states the outcome and BA writes measurable checkboxes, or the issue is closed with a reason'],
    done: ['- [ ] `node scripts/agent/cli.mjs sweep` lists none of the issues below as lacking a checkbox'],
    benefit: ['- Every open item can be planned, tested and closed against something measurable'],
    evidence: [`- ${bare.length} open issue(s) with no \`- [ ]\` checkbox in the body:`,
      ...capped(bare.map((i) => `- #${i.number} ${quote(String(i.title ?? '').slice(0, 100))}`))],
  };
}

/** QA Lead: gaps reported by coverage() of scripts/lib/e2e-coverage.mjs. */
export function coverageFinding(result) {
  const lines = [];
  for (const j of result?.journeys ?? []) {
    if (j.missing?.length) lines.push(`- ${quote(j.id)} ${quote(j.title)} (${quote(j.source ?? 'no source')}): missing ${j.missing.map((s) => `\`${quote(s)}\``).join(', ')}`);
  }
  for (const s of result?.untraced ?? []) lines.push(`- untraced spec \`${quote(s)}\`: it names no source with traceTo()`);
  for (const f of result?.faults ?? []) lines.push(`- stale claim: ${quote(f)}`);
  if (!lines.length) return null;
  return {
    role: 'qa-lead', key: 'qa-lead-coverage-gaps',
    title: 'QA Lead sweep: end to end coverage gaps',
    location: ['- `scripts/lib/e2e-coverage.mjs` (JOURNEYS, coverage()) and the specs under `e2e/`', '- Plan: `docs/e2e/E2E_MASTER_PLAN.md`'],
    cause: ['- A journey whose spec is gone, or a spec with no source, means an AC is claimed covered when it is not, or a test proves nothing traceable'],
    approach: ['- Restore or replace each missing spec, add traceTo() to each untraced one, and refresh each stale claim',
      '- Use playwright-best-practices for every spec change (plan section 2a2)'],
    done: ['- [ ] `node scripts/e2e-coverage.mjs` exits 0 and lists none of the gaps below'],
    benefit: ['- The gap matrix the owner reads matches what the suite really runs'],
    evidence: [`- ${lines.length} gap(s) from coverage() of \`scripts/lib/e2e-coverage.mjs\`:`, ...capped(lines)],
  };
}

export const issueTitle = (finding) => `[Improvement] ${finding.title}`;

/** The digest of what was found, not of when or where it ran: `digestLines` when the finder gives them, else the evidence. */
function digestOf(finding) {
  const lines = finding.digestLines ?? finding.evidence;
  return createHash('sha256').update([finding.role, finding.key, ...lines].join('\n')).digest('hex').slice(0, 12);
}

const markerLine = (finding) => `<!-- agent-sweep role=${finding.role} key=${finding.key} digest=${digestOf(finding)} -->`;

/** The marker of a body the sweep wrote, or null. The sweep writes its own marker last, so the last one counts. */
export function parseMarker(body) {
  const all = [...String(body ?? '').matchAll(/<!-- agent-sweep role=([a-z-]+) key=([A-Za-z0-9_-]+) digest=([0-9a-f]{12}) -->/g)];
  const m = all.at(-1);
  return m ? { role: m[1], key: m[2], digest: m[3] } : null;
}

/** The issue body, in the fields and order of improvement.yml. */
export function issueBody(finding, { date, runUrl }) {
  const section = (head, lines) => [`### ${head}`, '', ...lines, ''];
  return [
    ...section('Where in the system', finding.location),
    ...section('Feedback as received', [
      `- Raised by the blind-spot sweep for the ${roleName(finding.role)} role on ${date} (docs/superpowers/plans/agent-workflow-and-economy.md section 2c)`,
      `- Run: ${runUrl}`,
      '- Self-filed under the owner\'s standing permission with caps (popup, 14 Oct 2026: "อนุญาตถาวร มีเพดาน"). Not labelled agent:ready; the owner adds it to start the work',
    ]),
    ...section('Why this needs improving', finding.cause),
    ...section('Approach', finding.approach),
    ...section('Definition of done', finding.done),
    ...section('Benefit', finding.benefit),
    ...section('Evidence', finding.evidence),
    ...section('When, and why if it waits', ['Now, if the go ahead is given']),
    markerLine(finding),
  ].join('\n');
}

/** The comment for a duplicate whose evidence changed, carrying the new digest. */
export function duplicateComment(finding, { date, runUrl }) {
  return [`The blind-spot sweep found this again on ${date} with changed evidence (run: ${runUrl}).`, '',
    ...finding.evidence, '', markerLine(finding)].join('\n');
}

/**
 * The bodies of the posts (an issue or its comments) that `botLogin` (one login, or a list: repo-split R21)
 * wrote as a Bot. Only these say what
 * evidence the sweep already gave, so another account cannot quiet it by pasting a digest (review of
 * PR #499, item 4).
 */
export function postedBy(posts, botLogin) {
  const logins = [].concat(botLogin);
  return (posts ?? []).filter((p) => logins.includes(p?.user?.login) && p?.user?.type === 'Bot').map((p) => p.body);
}

/** True when the digest of this finding appears in none of the texts (the bodies postedBy() returns). */
export function evidenceIsNew(finding, texts) {
  const digest = digestOf(finding);
  return !(texts ?? []).some((t) => {
    for (const m of String(t ?? '').matchAll(/<!-- agent-sweep [^>]*digest=([0-9a-f]{12}) -->/g)) if (m[1] === digest) return true;
    return false;
  });
}

/** Open, or closed within the last 30 days. */
export function isRecent(issue, now) {
  if (issue?.state === 'open') return true;
  const closed = Date.parse(issue?.closed_at ?? '');
  return Number.isFinite(closed) && now - closed <= RECENT_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * What to file, what is a duplicate and what waits. `selfFiled` is every issue labelled self-filed, any
 * state; `openIssues` is every open issue; `closedIssues` is the closed issues updated in the last 30 days
 * (each is checked by its own closed_at). Findings are taken in order.
 */
export function planSweep({ findings, selfFiled, openIssues, closedIssues = [], now }) {
  const recent = (selfFiled ?? []).filter((i) => isRecent(i, now));
  const titled = [...(openIssues ?? []), ...(closedIssues ?? [])].filter((i) => i && !i.pull_request && isRecent(i, now));
  const openSelf = (selfFiled ?? []).filter((i) => i.state === 'open');
  const held = new Map();
  for (const i of openSelf) {
    const role = parseMarker(i.body)?.role;
    if (role) held.set(role, (held.get(role) ?? 0) + 1);
  }
  let total = openSelf.length;
  let filedNow = 0;
  const plan = { file: [], duplicate: [], skip: [] };
  for (const f of findings ?? []) {
    const dup = recent.find((i) => { const m = parseMarker(i.body); return m?.role === f.role && m?.key === f.key; })
      ?? titled.find((i) => i.title === issueTitle(f));
    if (dup) { plan.duplicate.push({ issue: dup, finding: f }); continue; }
    if ((held.get(f.role) ?? 0) >= CAPS.perRole) { plan.skip.push({ finding: f, reason: `role cap: ${roleName(f.role)} already has ${CAPS.perRole} open self-filed issue` }); continue; }
    if (total >= CAPS.total) { plan.skip.push({ finding: f, reason: `team cap: ${CAPS.total} self-filed issues are open` }); continue; }
    if (filedNow >= CAPS.perRun) { plan.skip.push({ finding: f, reason: `run cap: ${CAPS.perRun} filed this run, the sweep rests (section 2c item 6)` }); continue; }
    plan.file.push(f);
    held.set(f.role, (held.get(f.role) ?? 0) + 1);
    total += 1;
    filedNow += 1;
  }
  return plan;
}

/** True when the AI cost is marked unpaid (repository variable AGENT_AI_COST_UNPAID). */
export const costStop = (value) => String(value ?? '').trim().toLowerCase() === 'true';

/** The v1 findings, in the order of ROLES; roles with nothing found are left out. */
export function collectFindings({ openIssues, files, coverage }) {
  return [issuesWithoutDoneFinding(openIssues), todoFinding(files), coverageFinding(coverage)].filter(Boolean);
}

/** Reads the label; creates it only when GitHub says it does not exist. Any other failure stops the run. */
async function ensureLabel(gh) {
  try {
    await gh.get(`/repos/{repo}/labels/${SWEEP_LABEL}`);
  } catch (e) {
    if (!/ returned 404$/.test(String(e?.message))) throw e;
    await gh.post('/repos/{repo}/labels', {
      name: SWEEP_LABEL, color: 'c5def5',
      description: 'Filed by the agent blind-spot sweep; the owner adds agent:ready to start it',
    });
  }
}

/**
 * One sweep. `gh` is the api() of cli.mjs (get, all, post); `findings({openIssues})` returns the findings
 * and is called only after the cost check. Files and comments only when env.AGENT_SWEEP_FILE is '1'.
 * `botLogin` is the account the token writes as; only its posts count as evidence already given.
 */
export async function runSweep({ gh, env, now, findings, botLogin = SWEEP_BOT_LOGIN, log = console.log }) {
  const dryRun = env.AGENT_SWEEP_FILE !== '1';
  const outputs = { stopped: 0, filed: 0, planned: 0, commented: 0, skipped: 0, dry_run: dryRun ? 1 : 0 };
  if (costStop(env.AGENT_AI_COST_UNPAID)) {
    log('sweep: stopped, the AI cost is marked unpaid (AGENT_AI_COST_UNPAID; plan section 2c item 7)');
    return { exit: 0, outputs: { ...outputs, stopped: 1 } };
  }
  const notPull = (i) => i && !i.pull_request;
  // `since` filters by updated_at, which is never before closed_at, so this holds every issue closed in the window.
  const since = new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [openIssues, closedIssues, selfFiled] = await Promise.all([
    gh.all('/repos/{repo}/issues?state=open&per_page=100'),
    gh.all(`/repos/{repo}/issues?state=closed&since=${since}&per_page=100`),
    gh.all(`/repos/{repo}/issues?state=all&labels=${SWEEP_LABEL}&per_page=100`),
  ]);
  const plan = planSweep({
    findings: await findings({ openIssues }), selfFiled: selfFiled.filter(notPull),
    openIssues: openIssues.filter(notPull), closedIssues: closedIssues.filter(notPull), now,
  });
  const date = new Date(now).toISOString().slice(0, 10);
  const runUrl = `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  outputs.planned = plan.file.length;
  outputs.skipped = plan.skip.length;
  for (const s of plan.skip) log(`sweep: waits, ${s.finding.key}: ${s.reason}`);

  const changed = [];
  for (const d of plan.duplicate) {
    const comments = await gh.all(`/repos/{repo}/issues/${d.issue.number}/comments?per_page=100`);
    if (evidenceIsNew(d.finding, postedBy([d.issue, ...comments], botLogin))) changed.push(d);
    else log(`sweep: ${d.finding.key} is #${d.issue.number} with the same evidence, nothing to add`);
  }
  if (dryRun) {
    for (const f of plan.file) log(`sweep (dry run): would file "${issueTitle(f)}" labelled ${FILED_LABELS.join(', ')}; ${f.evidence[0]}`);
    for (const d of changed) log(`sweep (dry run): would comment the new evidence of ${d.finding.key} on #${d.issue.number}`);
    return { exit: 0, outputs };
  }
  if (plan.file.length) await ensureLabel(gh);
  for (const f of plan.file) {
    const issue = await gh.post('/repos/{repo}/issues', { title: issueTitle(f), body: issueBody(f, { date, runUrl }), labels: [...FILED_LABELS] });
    log(`sweep: filed #${issue?.number} ${issueTitle(f)}`);
    outputs.filed += 1;
  }
  for (const d of changed) {
    await gh.post(`/repos/{repo}/issues/${d.issue.number}/comments`, { body: duplicateComment(d.finding, { date, runUrl }) });
    log(`sweep: commented the new evidence of ${d.finding.key} on #${d.issue.number}`);
    outputs.commented += 1;
  }
  return { exit: 0, outputs };
}

const SOURCE_DIRS = ['src', 'functions/src', 'e2e'];
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|css|html)$/;

/** Every source file the Dev check reads, as [{path, text}], paths relative to root. */
export function readSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch (e) {
      if (e?.code === 'ENOENT') return; // a checkout without functions/ or e2e/ has nothing there to read
      throw e;
    }
    for (const name of names) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (SOURCE_EXT.test(name)) out.push({ path: relative(root, full), text: readFileSync(full, 'utf8') });
    }
  };
  for (const d of SOURCE_DIRS) walk(join(root, d));
  return out;
}
