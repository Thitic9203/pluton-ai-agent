/*
 * The Agent Office board snapshot (docs/sdd/agent-office-live/spec.md R2 to R10, R16, R30, R33,
 * R65, E1). Built in Node by the workflow .github/workflows/deploy-agent-office.yml, with that job's
 * own GITHUB_TOKEN, and published as agent-office/public/data/state.json beside the page. The Pages
 * Function never imports this file or the libraries it uses (main thread design change, 16 Oct
 * 2026): derive.mjs pulls in scripts/agent/release.mjs, which belongs in Node.
 *
 * Pure apart from the client it is given: every GitHub read goes through the GET-only client of
 * agent-office/lib/github.mjs, and every board rule is a function of agent-office/lib/derive.mjs.
 */
import { fileURLToPath } from 'node:url';
import {
  LANES,
  laneOf,
  releaseQueue,
  releasePhase,
  blockedFrom,
  assignPeople,
  summary,
  capLine,
  isImprovement,
  projectCounts,
  idleNotice,
} from '../../agent-office/lib/derive.mjs';
import { WORKFLOW_TOKEN_LOGIN } from '../agent/release.mjs';
import { createHistory } from '../../agent-office/lib/history.mjs';
import { buildMoney, isAppLogin } from '../../agent-office/lib/money.mjs';
import { bangkokDay } from '../../agent-office/lib/economy.mjs';
import { parseOlsBoard } from '../../agent-office/lib/ols-board.mjs';

export const SNAPSHOT_PATH = fileURLToPath(new URL('../../agent-office/public/data/state.json', import.meta.url));
export const SWEEP_WORKFLOW = 'agent-sweep.yml';
export const PROD_WORKFLOW = 'deploy-production.yml';

const ORDER = Object.fromEntries(LANES.map((l, i) => [l.k, i]));
const labelNames = (labels) => (labels ?? []).map((l) => (typeof l === 'string' ? l : String(l?.name ?? '')));

/** R8: a production deploy the release workflow dispatched (release.mjs `findDispatchedRun`'s test). */
const releaseProdRun = (r) => r?.event === 'workflow_dispatch' && r?.head_branch === 'main' && r?.triggering_actor?.login === WORKFLOW_TOKEN_LOGIN;

/** One `github-labels` project's open issues on the board, its release card and whether a sweep runs. */
async function readProject(project, config, client, warnings) {
  const { repo, labelPrefix: prefix, releaseBranch } = project.source;
  const [open, pulls, sweeps, prodRuns] = await Promise.all([
    client.openIssues(repo),
    client.releasePulls(repo, releaseBranch),
    client.runsInProgress(repo, SWEEP_WORKFLOW),
    client.runsInProgress(repo, PROD_WORKFLOW),
  ]);
  const queuedNs = new Set(releaseQueue({ pulls, issues: open, branch: releaseBranch }));

  const issues = [];
  for (const raw of open) {
    let { lane, warnings: w } = laneOf(raw.labels, prefix);
    // R3: merged into the release branch and not yet on the test environment. The table's order
    // decides against a state label still on the issue: a later lane (blocked) keeps the issue.
    if (queuedNs.has(raw.number) && (lane === null || ORDER[lane] < ORDER['release-queue'])) lane = 'release-queue';
    if (lane === null) continue;
    for (const text of w) warnings.push(`#${raw.number}: ${text}`);
    issues.push({
      project: project.id,
      n: raw.number,
      title: String(raw.title ?? ''),
      lane,
      from: null,
      improvement: isImprovement(raw.title),
      createdAt: raw.created_at,
      url: raw.html_url,
      labels: labelNames(raw.labels),
    });
  }
  // R4: the timeline is read only for blocked issues.
  for (const i of issues) {
    if (i.lane === 'blocked') i.from = blockedFrom(await client.timeline(repo, i.n), prefix);
  }

  const queued = open.filter((raw) => issues.some((i) => i.n === raw.number && i.lane === 'release-queue'));
  const release = {
    project: project.id,
    ...releasePhase({
      queued,
      onTestEnv: issues.filter((i) => i.lane === 'on-test-env').length,
      batch: config.releaseBatch,
      prodRunning: prodRuns.some(releaseProdRun),
      // R57 (the E2E commit status) is not read by this snapshot yet, so no regression phase.
      e2e: null,
    }),
  };
  return { issues, release, sweeping: sweeps.length > 0 };
}

/**
 * The snapshot. `agentEnabled` is `vars.AGENT_ENABLED === 'true'` from the workflow (R10, R41); while
 * it is false nothing is read and the board is idle. Throws on any GitHub failure (E1).
 * @param {{ config: { projects: unknown[], roles: unknown, roster: unknown[], buildLimit: number, releaseBatch: number },
 *   client: { openIssues: Function, releasePulls: Function, runsInProgress: Function, timeline: Function, history?: Function },
 *   agentEnabled: boolean, agentAppLogin?: string, now?: () => Date, menu?: unknown,
 *   readFx?: () => Promise<{ rate: number, at: string, fact: string }>,
 *   readRequests?: (range: { since: string, until: string }) => Promise<Record<string, number>> }} input
 * `agentAppLogin` is `vars.AGENT_APP_SLUG` + `[bot]` (R59): without it the money block reads nothing
 * and its ledger fields are null (R40). `menu` is agent-office/supplies-menu.json (R61); `readFx` reads
 * open.er-api.com and `readRequests` Cloudflare analytics (R61, T37): a failure of either leaves its
 * figures null with the reason in `money.warnings`, never fails the snapshot.
 */
export async function buildSnapshot({ config, client, agentEnabled, agentAppLogin, now = () => new Date(), menu = null, readFx = null, readRequests = null, boards = {} }) {
  const readAt = now().toISOString();
  const warnings = [];
  let issues = [];
  const releases = [];
  let sweeping = false;

  if (agentEnabled === true) {
    for (const project of config.projects) {
      if (project.source.kind !== 'github-labels') continue;
      const r = await readProject(project, config, client, warnings);
      issues = issues.concat(r.issues);
      releases.push(r.release);
      sweeping = sweeping || r.sweeping;
    }
  } else {
    for (const project of config.projects) {
      if (project.source.kind !== 'github-labels') continue;
      releases.push({ project: project.id, ...releasePhase({ queued: [], onTestEnv: 0, batch: config.releaseBatch }) });
    }
  }

  // ols-real R13, R14, E4: a `mac-snapshot` project's cards come from the repository variable the Mac
  // sets (passed in as `boards`), validated as data; it is not tied to AGENT_ENABLED, which switches
  // the GitHub agent only.
  const sourced = new Set();
  for (const project of config.projects) {
    if (project.source.kind !== 'mac-snapshot') continue;
    const text = boards[project.source.variable];
    if (text === undefined || text === '') continue;
    const parsed = parseOlsBoard(text);
    if (!parsed) {
      warnings.push(`${project.name}: ${project.source.variable} did not validate, no ${project.name} cards`);
      continue;
    }
    sourced.add(project.id);
    issues = issues.concat(parsed.issues.map((i) => ({ ...i, project: project.id })));
  }

  const assigned = assignPeople({ roster: config.roster, roles: config.roles, projects: config.projects, issues, releases, sweeping });
  const board = assigned.issues.map(({ labels, ...rest }) => rest);
  return {
    v: 1,
    readAt,
    agentEnabled: agentEnabled === true,
    notice: idleNotice(agentEnabled === true),
    // R67: each project carries its config fields, so the page finds it by the name it shows (R30, R34).
    projects: projectCounts(config.projects, issues, sourced).map((p) => {
      const { name, tag, description, key } = config.projects.find((c) => c.id === p.id);
      return { ...p, name, tag, description, key, release: releases.find((r) => r.project === p.id) ?? null };
    }),
    issues: board,
    people: assigned.people,
    summary: summary(assigned.people),
    cap: capLine(issues, config.buildLimit),
    warnings,
    money: await readMoney({ config, client, agentEnabled: agentEnabled === true, agentAppLogin, now: now(), readAt, menu, readFx, readRequests }),
  };
}

/**
 * T36: the money block (R51 to R56, R61 to R64) from the T33 history of the board's GitHub project,
 * read through the client's `history(path)` GET. Nothing is read while the agent is off, without the
 * agent App login, or before `economyStart`; the block then carries null ledger fields (R40). The
 * block's own warnings stay in `money.warnings`, apart from the board's.
 */
async function readMoney({ config, client, agentEnabled, agentAppLogin, now, readAt, menu, readFx, readRequests }) {
  const project = config.projects.find((p) => p.source?.kind === 'github-labels');
  let history = null;
  let offReason = 'the agent is off, so GitHub history was not read (R10)';
  if (agentEnabled && !project) offReason = 'no github-labels project in the config';
  if (agentEnabled && project && isAppLogin(agentAppLogin) && bangkokDay(now.getTime()) >= config.economyStart) {
    const reader = createHistory({ get: (path) => client.history(path), repo: project.source.repo, economyStart: config.economyStart, now: () => now.getTime(), e2e: false });
    history = await reader.read();
  }
  let fx = null;
  let requests = null;
  let requestsWhy = 'no Cloudflare analytics reader';
  const extra = [];
  if (history) {
    if (readFx) {
      try { fx = await readFx(); } catch (e) { extra.push(`money: open.er-api.com was not read: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (readRequests) {
      try { requests = await readRequests({ since: history.since, until: now.toISOString() }); } catch (e) { requestsWhy = e instanceof Error ? e.message : String(e); }
    }
  }
  const { money, warnings } = buildMoney({ config, history, botLogin: agentAppLogin, now, readAt, offReason, fx, requests, requestsWhy, menu });
  return { ...money, warnings: [...extra, ...warnings] };
}

/** Builds, then writes, so a failed read leaves the last published file in place (E1). */
export async function snapshotToFile({ write, path = SNAPSHOT_PATH, ...input }) {
  const snapshot = await buildSnapshot(input);
  write(path, `${JSON.stringify(snapshot)}\n`);
  return snapshot;
}
