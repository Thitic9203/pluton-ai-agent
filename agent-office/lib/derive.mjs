// Pure board derivation: labels to lanes, release queue and phase, blocked step, people, summary.
// Spec: docs/sdd/agent-office-live/spec.md R2 to R10, R16, R20, R30, R31, R33, R34, R57, E3, E4.
import { issueFromBranch, ON_TEST_ENV, BATCH_READY_LABEL } from '../../scripts/agent/release.mjs';

/**
 * @typedef {'work'|'wait'|'idle'|'block'} LaneKind
 * @typedef {{ k: string, th: string, role: string|null, kind: LaneKind, label: boolean }} Lane
 * @typedef {string | { name?: string }} LabelLike
 * @typedef {{ project: string, n: number, lane: string, from: string|null, createdAt: string }} BoardIssue
 * @typedef {{ label: string, color?: string }} RoleLike
 * @typedef {{ id: string, key: string, source: { kind: string } }} ProjectLike
 * @typedef {{ project: string, phase: string, holders: string[], text: string }} ReleaseLike
 * @typedef {{
 *   slot: number, role: string, tag: string, state: 'working'|'waiting'|'blocked'|'sweeping'|'idle',
 *   issue: number|null, project: string|null, release: { project: string, phase: string }|null,
 *   gates: number, doing: string
 * }} Person
 */

/**
 * The lanes of R2, in the table's order; a later lane wins when two labels are on one issue.
 * `label` is false for the release queue, which comes from merged pull requests (R3), not a label.
 * On-test-env is held by the release phase people (R8), so no single role holds its issues.
 * @type {Lane[]}
 */
export const LANES = [
  { k: 'ready', th: 'PO จัดลำดับ ตั้งขอบเขต + AC', role: 'po', kind: 'work', label: true },
  { k: 'planning', th: 'plan รอเจ้าของ', role: 'ba', kind: 'wait', label: true },
  { k: 'test-planning', th: 'test plan รอเจ้าของ', role: 'qal', kind: 'wait', label: true },
  { k: 'queued', th: 'รอคิว', role: null, kind: 'idle', label: true },
  { k: 'building', th: 'เขียนโค้ด + รีวิวแยก', role: 'dev', kind: 'work', label: true },
  { k: 'in-review', th: 'Tech Lead รีวิว PR', role: 'tl', kind: 'work', label: true },
  { k: 'merging', th: 'ผ่าน แล้ว merge เอง', role: 'tl', kind: 'work', label: true },
  { k: 'release-queue', th: 'รอรวมรอบ release', role: null, kind: 'idle', label: false },
  { k: 'on-test-env', th: 'อยู่ในรอบ release', role: null, kind: 'work', label: true },
  { k: 'blocked', th: 'ติดปัญหา', role: null, kind: 'block', label: true },
];

/** @type {Record<string, Lane>} */
const LANE = Object.fromEntries(LANES.map((l) => [l.k, l]));

/** @param {LabelLike[]|undefined} labels @returns {string[]} */
const names = (labels) => (labels ?? []).map((l) => (typeof l === 'string' ? l : String(l?.name ?? '')));

/**
 * The lane of one issue from its labels (R2): the latest state label in table order wins, and a
 * second state label is reported as one warning. A label outside the table gives no lane.
 * @param {LabelLike[]} labels
 * @param {string} prefix the project's label prefix, `agent:`
 * @returns {{ lane: string|null, warnings: string[] }}
 */
export function laneOf(labels, prefix) {
  const have = new Set(names(labels));
  const hits = LANES.filter((l) => l.label && have.has(prefix + l.k));
  if (!hits.length) return { lane: null, warnings: [] };
  const lane = hits[hits.length - 1].k;
  const warnings = hits.length > 1 ? [`state labels ${hits.map((l) => prefix + l.k).join(', ')} together; shown in ${lane}`] : [];
  return { lane, warnings };
}

/**
 * @typedef {{ number?: number, head?: { ref?: string }, base?: { ref?: string }, merged_at?: string|null }} PullLike
 * @typedef {{ number: number, state?: string, labels?: LabelLike[] }} IssueLike
 */

/**
 * Open issues whose agent pull request is merged into the release branch and that are not yet on
 * the test environment (R3). Each issue once, ascending.
 * @param {{ pulls: PullLike[], issues: IssueLike[], branch: string }} input
 * @returns {number[]}
 */
export function releaseQueue({ pulls, issues, branch }) {
  const merged = new Set();
  for (const p of pulls ?? []) {
    if (!p?.merged_at || p.base?.ref !== branch) continue;
    const n = issueFromBranch(p.head?.ref);
    if (n !== null) merged.add(n);
  }
  return (issues ?? [])
    .filter((i) => i.state === 'open' && merged.has(i.number) && !names(i.labels).includes(ON_TEST_ENV))
    .map((i) => i.number)
    .sort((a, b) => a - b);
}

/**
 * The pass rate the Slack E2E message prints (scripts/lib/e2e-slack-report.mjs `message`):
 * passed of executed, one decimal, 0 when nothing executed (R57).
 * @param {{ passed: number, total: number, skipped: number }} c
 */
export function passRate({ passed, total, skipped }) {
  const executed = total - skipped;
  return executed ? Math.round((passed / executed) * 1000) / 10 : 0;
}

/**
 * @typedef {{ state: string, description?: string }} E2eStatus  commit status `agent-office/e2e`,
 *   or `{ state: 'running' }` while the staging E2E run is in progress.
 * @typedef {{
 *   phase: 'collect'|'approve'|'on-test-env'|'regression'|'prod', text: string, holders: string[],
 *   queued: number, batch: number, bar: number, passRate?: number, passedOfExecuted?: string
 * }} ReleasePhase
 */

/** @param {string|undefined} d @returns {{ p: number, s: number, t: number }|null} */
function e2eCounts(d) {
  try {
    const o = JSON.parse(String(d ?? ''));
    return ['p', 's', 't'].every((k) => Number.isInteger(o?.[k]) && o[k] >= 0) ? o : null;
  } catch {
    return null;
  }
}

/**
 * The release card of one project (R3, R8, R34). Order: production deploy, regression, the round
 * on the test environment, approval, collecting. No percentage while the E2E run is in progress.
 * @param {{ queued: IssueLike[], onTestEnv: number, batch: number, prodRunning?: boolean, e2e?: E2eStatus|null }} input
 * @returns {ReleasePhase}
 */
export function releasePhase({ queued, onTestEnv, batch, prodRunning = false, e2e = null }) {
  const n = (queued ?? []).length;
  const base = { queued: n, batch, bar: 1 };
  if (prodRunning) return { ...base, phase: 'prod', text: 'deploy production รอบ release', holders: ['qal'] };
  if (onTestEnv > 0 && e2e) {
    if (e2e.state === 'running' || e2e.state === 'pending') return { ...base, phase: 'regression', text: 'QA รัน regression', holders: ['qa'] };
    const c = e2e.state === 'error' ? null : e2eCounts(e2e.description);
    if (!c) return { ...base, phase: 'regression', text: 'QA รัน regression · ไม่มีรายงาน', holders: ['qa'] };
    const rate = passRate({ passed: c.p, total: c.t, skipped: c.s });
    return { ...base, phase: 'regression', text: `QA รัน regression ${rate}%`, holders: ['qa'], passRate: rate, passedOfExecuted: `${c.p} of ${c.t - c.s}` };
  }
  if (onTestEnv > 0) return { ...base, phase: 'on-test-env', text: 'อยู่ในรอบ release', holders: ['qal', 'qa'] };
  if ((queued ?? []).some((i) => names(i.labels).includes(BATCH_READY_LABEL))) {
    return { ...base, phase: 'approve', text: 'QA Lead อนุมัติ deploy staging', holders: ['qal'] };
  }
  return { ...base, phase: 'collect', text: `รอครบ ${n}/${batch}`, holders: [], bar: batch > 0 ? Math.min(1, n / batch) : 0 };
}

/**
 * @typedef {{ event?: string, label?: { name?: string }, created_at?: string }} TimelineEvent
 */

/**
 * The lane an issue was blocked at (R4): the state label most recently removed before the latest
 * `agent:blocked` was added, from the issue timeline; null when there is none.
 * @param {TimelineEvent[]} timeline
 * @param {string} prefix
 * @returns {string|null}
 */
export function blockedFrom(timeline, prefix) {
  const evs = (timeline ?? [])
    .map((e, i) => ({ e, i, at: Date.parse(String(e?.created_at ?? '')) }))
    .filter((x) => x.e && (x.e.event === 'labeled' || x.e.event === 'unlabeled') && Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const blocked = prefix + 'blocked';
  let at = -1;
  evs.forEach((x, idx) => {
    if (x.e.event === 'labeled' && x.e.label?.name === blocked) at = idx;
  });
  for (let idx = at - 1; idx >= 0; idx--) {
    const { e } = evs[idx];
    const name = String(e.label?.name ?? '');
    if (e.event !== 'unlabeled' || !name.startsWith(prefix)) continue;
    const lane = LANE[name.slice(prefix.length)];
    if (lane && lane.label && lane.k !== 'blocked') return lane.k;
  }
  return null;
}

/**
 * The key of an issue in its project's format (R31): `#{n}` for Taskfolio, `OLS-{n}` for OLS.
 * @param {ProjectLike[]} projects @param {string} project @param {number} n
 */
export function issueKey(projects, project, n) {
  const p = (projects ?? []).find((x) => x.id === project);
  return (p ? p.key : '#{n}').replace('{n}', String(n));
}

/** @param {BoardIssue} i @returns {string|null} */
const roleOf = (i) => (i.lane === 'blocked' ? (i.from && LANE[i.from] ? LANE[i.from].role : null) : LANE[i.lane]?.role ?? null);

/** @param {BoardIssue} i */
const stepOf = (i) => (i.lane === 'blocked' ? (i.from && LANE[i.from] ? `ติดที่ ${LANE[i.from].th}` : 'ติดปัญหา') : LANE[i.lane]?.th ?? '');

/**
 * Give issues to people (R5 to R8, R20, E3): per role, oldest issue first, one per person in roster
 * order; Head waits on every Gate 1 and Gate 2 issue; release phases go to free holders; everyone
 * else rests, or sweeps while an `agent-sweep.yml` run is in progress.
 * @param {{
 *   roster: { role: string }[], roles: Record<string, RoleLike>, projects: ProjectLike[],
 *   issues: BoardIssue[], releases?: ReleaseLike[], sweeping?: boolean
 * }} input
 * @returns {{ people: Person[], issues: (BoardIssue & { holder: number|null, waitText: string|null, step: string })[] }}
 */
export function assignPeople({ roster, roles, projects, issues, releases = [], sweeping = false }) {
  const label = (/** @type {string} */ r) => roles[r]?.label ?? r;
  /** @type {Person[]} */
  const people = roster.map((m, slot) => {
    const same = roster.filter((x) => x.role === m.role);
    const letter = same.length > 1 ? ` - ${String.fromCharCode(65 + roster.slice(0, slot).filter((x) => x.role === m.role).length)}` : '';
    return { slot, role: m.role, tag: label(m.role) + letter, state: 'idle', issue: null, project: null, release: null, gates: 0, doing: '' };
  });

  const ordered = [...(issues ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.n - b.n);
  const out = ordered.map((i) => {
    const role = roleOf(i);
    const step = stepOf(i);
    if (!role) return { ...i, holder: null, waitText: null, step };
    const p = people.find((x) => x.role === role && x.issue === null);
    if (!p) return { ...i, holder: null, waitText: `รอ ${label(role)} รับงาน`, step };
    const kind = LANE[i.lane].kind;
    p.issue = i.n;
    p.project = i.project;
    p.state = kind === 'wait' ? 'waiting' : kind === 'block' ? 'blocked' : 'working';
    p.doing = `${issueKey(projects, i.project, i.n)} · ${step}`;
    return { ...i, holder: p.slot, waitText: null, step };
  });

  const gates = (issues ?? []).filter((i) => LANE[i.lane]?.kind === 'wait').length;
  const head = people.find((p) => p.role === 'head' && p.issue === null);
  if (head && gates > 0) {
    head.state = 'waiting';
    head.gates = gates;
    head.doing = `ส่งเรื่องให้เจ้าของ ${gates} ใบ`;
  }

  for (const r of releases ?? []) {
    for (const role of r.holders) {
      const p = people.find((x) => x.role === role && x.issue === null && x.release === null && x.state === 'idle');
      if (!p) continue;
      p.state = 'working';
      p.release = { project: r.project, phase: r.phase };
      p.doing = r.text;
    }
  }

  for (const p of people) {
    if (p.state !== 'idle') continue;
    if (sweeping) {
      p.state = 'sweeping';
      p.doing = 'ทำงาน · sweep';
    } else p.doing = 'พักเบรก';
  }
  out.sort((a, b) => a.n - b.n);
  return { people, issues: out };
}

/**
 * The line under the summary while the agent is not switched on (R10).
 * @param {boolean} agentEnabled
 */
export function idleNotice(agentEnabled) {
  return agentEnabled === true ? null : 'agent ยังไม่เปิดใช้งาน';
}

/**
 * Summary counts from the people's states (R16); sweeping counts as work.
 * @param {{ state: string }[]} people
 */
export function summary(people) {
  const c = { working: 0, waiting: 0, blocked: 0, idle: 0 };
  for (const p of people ?? []) {
    if (p.state === 'working' || p.state === 'sweeping') c.working++;
    else if (p.state === 'waiting') c.waiting++;
    else if (p.state === 'blocked') c.blocked++;
    else c.idle++;
  }
  return { ...c, text: `ทำงาน ${c.working} · รอเจ้าของ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}` };
}

/**
 * The cap line (R33): building against the dispatcher limit, queued, all cards on the board.
 * @param {{ lane: string }[]} issues @param {number} limit
 */
export function capLine(issues, limit) {
  const list = issues ?? [];
  const building = list.filter((i) => i.lane === 'building').length;
  const queued = list.filter((i) => i.lane === 'queued').length;
  const total = list.length;
  return { building, limit, queued, total, full: building >= limit, text: `เขียนโค้ดพร้อมกัน ${building}/${limit} · รอคิว ${queued} · ทั้งหมด ${total} ใบ` };
}

/** R9: the Improvement tag, by the `[Improvement]` title prefix only. @param {string} title */
export const isImprovement = (title) => String(title ?? '').startsWith('[Improvement]');

/**
 * Board count per project (R30); null for a project with no source yet (E4), never 0. A
 * `mac-snapshot` project counts only when its data arrived this build (`sourced`, ols-real E4).
 * @param {ProjectLike[]} projects @param {{ project: string }[]} issues @param {Set<string>} [sourced]
 */
export function projectCounts(projects, issues, sourced = new Set()) {
  return (projects ?? []).map((p) => {
    const none = p.source.kind === 'none' || (p.source.kind === 'mac-snapshot' && !sourced.has(p.id));
    return { id: p.id, count: none ? null : (issues ?? []).filter((i) => i.project === p.id).length, source: p.source.kind };
  });
}
