// History reads for Agent Office money, progress and size: the GitHub facts R50 to R63 compute from.
// Spec: docs/sdd/agent-office-live/spec.md R50 to R63, R43 (GET only), R47 (free quota); plan.md
// "Polling and the free quotas"; tasks.md T33.
//
// Kept out of lib/github.mjs (lane L2) on purpose: this module takes L2's client as one function,
// `get(path)`, which issues a GET of `path` against api.github.com and resolves to the parsed JSON,
// every page of a list endpoint merged (an array, or for wrapped lists such as `workflow_runs`,
// `jobs` and `check_runs` either the merged array or the object holding it). It never sends a
// method, a header or a body, so it cannot write (R43).
//
// Caching: the whole read is kept 10 minutes; within that a read makes no call. Past it, an issue
// that is closed and whose close day has ended in Asia/Bangkok (its bill day is cut, R63) is final:
// its facts are kept by number and close time and never read again. A completed workflow run's jobs
// and a completed release run's commit statuses are kept by id and sha the same way. A failed read
// is not kept, so the next read tries again.

export const HISTORY_TTL_MS = 10 * 60 * 1000;

/** The agent workflows whose job minutes are electricity (R61). */
export const AGENT_WORKFLOWS = ['agent.yml', 'agent-release.yml', 'agent-sweep.yml', 'agent-main-audit.yml'];

/** The commit status context of R57. */
export const E2E_CONTEXT = 'agent-office/e2e';

/** The `name:` of agent.yml's `usage` job, whose success in a run attempt vouches for its markers (R59). */
export const USAGE_JOB_NAME = 'Agent usage';

const USAGE_PREFIX = '<!-- agent-office:usage ';

/**
 * The usage markers that count (spec R59): on the first line of a comment by the agent App
 * (`botLogin`, type Bot), for the issue it is on, naming an agent.yml run read in `agentRuns` whose
 * job "Agent usage" concluded success in the marker's attempt; one per run, attempt and step, the
 * earliest comment counting. Returns {markers, warnings}: each marker with `commentId` and
 * `commentAt`, and one warning per marker left out, naming the issue, the comment and the reason.
 */
export function acceptedUsageMarkers(history, { botLogin }) {
  const runs = new Map((history?.agentRuns ?? []).filter((r) => r.workflow === 'agent.yml').map((r) => [r.id, r]));
  const markers = [];
  const warnings = [];
  const seen = new Set();
  for (const issue of history?.issues ?? []) {
    const comments = [...(issue.comments ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
    for (const c of comments) {
      const first = String(c.body ?? '').split('\n')[0].trim();
      if (!first.startsWith(USAGE_PREFIX)) continue;
      const warn = (why) => warnings.push(`usage marker in comment ${c.id} on #${issue.number} ignored: ${why}`);
      if (!botLogin || c.user?.login !== botLogin || c.user?.type !== 'Bot') { warn('not by the agent App'); continue; }
      let m;
      try {
        if (!first.endsWith(' -->')) throw new Error('no end');
        m = JSON.parse(first.slice(USAGE_PREFIX.length, -4));
      } catch {
        warn('not JSON');
        continue;
      }
      if (m?.issue !== issue.number) { warn('it names another issue'); continue; }
      const run = runs.get(m.run_id);
      if (!run) { warn(`run ${m.run_id} is not an agent.yml run read since economyStart`); continue; }
      const vouched = (run.jobs ?? []).some((j) => j.name === USAGE_JOB_NAME && j.run_attempt === m.run_attempt && j.conclusion === 'success');
      if (!vouched) { warn(`the usage job of run ${m.run_id} attempt ${m.run_attempt} did not succeed`); continue; }
      const key = `${m.run_id}:${m.run_attempt}:${m.step}`;
      if (seen.has(key)) { warn(`duplicate of run ${m.run_id} attempt ${m.run_attempt} step ${m.step}`); continue; }
      seen.add(key);
      markers.push({ ...m, commentId: c.id, commentAt: c.created_at });
    }
  }
  return { markers, warnings };
}

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Asia/Bangkok calendar day of an instant, as YYYY-MM-DD. */
export function bangkokDay(ms) {
  return DAY.format(new Date(ms));
}

/** Closed, and the Bangkok day it closed on has ended by `nowMs`. */
export function isFinalIssue(issue, nowMs) {
  if (issue?.state !== 'closed' || !issue.closed_at) return false;
  return bangkokDay(Date.parse(issue.closed_at)) < bangkokDay(nowMs);
}

const list = (body, key) => (Array.isArray(body) ? body : Array.isArray(body?.[key]) ? body[key] : []);
const who = (u) => (u ? { login: u.login, type: u.type } : null);
const labelNames = (labels) => (labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
const isAgentIssue = (i) => !i.pull_request && labelNames(i.labels).some((n) => n.startsWith('agent:') || n.startsWith('size:'));

const slimComment = (c) => ({ id: c.id, user: who(c.user), body: c.body, created_at: c.created_at, updated_at: c.updated_at });
const slimEvent = (e) => ({
  event: e.event, created_at: e.created_at, actor: who(e.actor),
  ...(e.label?.name ? { label: e.label.name } : {}), ...(e.commit_id ? { commit_id: e.commit_id } : {}),
});
const slimReview = (r) => ({ id: r.id, user: who(r.user), state: r.state, commit_id: r.commit_id, submitted_at: r.submitted_at });
const slimRun = (r) => ({
  id: r.id, name: r.name, path: r.path, head_sha: r.head_sha, run_attempt: r.run_attempt,
  status: r.status, conclusion: r.conclusion, event: r.event, created_at: r.created_at, updated_at: r.updated_at,
});
const slimCheck = (c) => ({ id: c.id, name: c.name, head_sha: c.head_sha, status: c.status, conclusion: c.conclusion, started_at: c.started_at, completed_at: c.completed_at });
const slimJob = (j) => ({ id: j.id, name: j.name, run_attempt: j.run_attempt, status: j.status, conclusion: j.conclusion, started_at: j.started_at, completed_at: j.completed_at });
const slimStatus = (s) => ({ context: s.context, state: s.state, description: s.description, target_url: s.target_url, created_at: s.created_at, creator: who(s.creator) });

/**
 * A history reader for one repository. `get` is L2's GET client (see the header), `economyStart` the
 * config's YYYY-MM-DD (Bangkok midnight of that day is where history starts), `now` the clock.
 * With `e2e: false` the commit statuses of R57 are not read and `e2e` is empty.
 * `read()` resolves to {readAt, since, issues, agentRuns, e2e, calls}: `calls` is the number of GET
 * calls that read made, the figure T33 records in plan.md.
 */
export function createHistory({ get, repo, economyStart, now = Date.now, ttlMs = HISTORY_TTL_MS, e2e: readE2e = true } = {}) {
  if (typeof get !== 'function') throw new Error('createHistory needs get(path), the GitHub GET client');
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo ?? ''))) throw new Error(`createHistory needs repo as owner/name, got ${JSON.stringify(repo)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(economyStart ?? ''))) throw new Error(`createHistory needs economyStart as YYYY-MM-DD, got ${JSON.stringify(economyStart)}`);
  const since = new Date(`${economyStart}T00:00:00+07:00`).toISOString();
  const owner = repo.split('/')[0];
  const base = `/repos/${repo}`;
  const finalIssues = new Map(); // `${number}@${closed_at}` -> facts
  const finalJobs = new Map(); // `${run id}@${run_attempt}` -> jobs
  const finalStatuses = new Map(); // sha -> statuses
  let cached = null; // {at, value}
  let inflight = null;

  /** Every attempt's jobs of one run, kept once the run completed. */
  async function jobsOf(r, counted) {
    const key = `${r.id}@${r.run_attempt}`;
    let jobs = finalJobs.get(key);
    if (!jobs) {
      jobs = list(await counted(`${base}/actions/runs/${r.id}/jobs?filter=all&per_page=100`), 'jobs').map(slimJob);
      if (r.status === 'completed') finalJobs.set(key, jobs);
    }
    return jobs;
  }

  async function readIssue(i, counted) {
    const n = i.number;
    const [comments, timeline, pulls, runs] = await Promise.all([
      counted(`${base}/issues/${n}/comments?per_page=100`),
      counted(`${base}/issues/${n}/timeline?per_page=100`),
      counted(`${base}/pulls?state=all&head=${encodeURIComponent(`${owner}:agent/issue-${n}`)}&per_page=100`),
      counted(`${base}/actions/runs?branch=${encodeURIComponent(`agent/issue-${n}`)}&per_page=100`),
    ]);
    const prs = list(pulls, 'pulls');
    const reviews = await Promise.all(prs.map((p) => counted(`${base}/pulls/${p.number}/reviews?per_page=100`)));
    const wfRuns = list(runs, 'workflow_runs').map(slimRun);
    // R61 water (T37): the jobs of each run on the branch, for the rework minutes; a completed run's
    // jobs are kept by id and attempt like the agent workflows' jobs.
    await Promise.all(wfRuns.map(async (r) => { r.jobs = await jobsOf(r, counted); }));
    const shas = [...new Set(wfRuns.map((r) => r.head_sha).filter(Boolean))];
    const checks = await Promise.all(shas.map((s) => counted(`${base}/commits/${s}/check-runs?per_page=100`)));
    return {
      comments: list(comments).map(slimComment),
      timeline: list(timeline).map(slimEvent),
      pulls: prs.map((p, k) => ({
        number: p.number, state: p.state, head_sha: p.head?.sha, merged_at: p.merged_at ?? null,
        reviews: list(reviews[k]).map(slimReview),
      })),
      runs: wfRuns,
      checkRuns: Object.fromEntries(shas.map((s, k) => [s, list(checks[k], 'check_runs').map(slimCheck)])),
    };
  }

  async function readAll() {
    let calls = 0;
    const counted = (path) => { calls += 1; return get(path); };
    const nowMs = now();
    const created = encodeURIComponent(`>=${since}`);

    const issues = list(await counted(`${base}/issues?state=all&since=${encodeURIComponent(since)}&per_page=100`)).filter(isAgentIssue);
    const issueFacts = await Promise.all(issues.map(async (i) => {
      const key = `${i.number}@${i.closed_at}`;
      const final = isFinalIssue(i, nowMs);
      let facts = final ? finalIssues.get(key) : undefined;
      if (!facts) {
        facts = await readIssue(i, counted);
        if (final) finalIssues.set(key, facts);
      }
      return { number: i.number, title: String(i.title ?? ''), state: i.state, created_at: i.created_at, closed_at: i.closed_at ?? null, labels: labelNames(i.labels), final, ...facts };
    }));

    const perWorkflow = await Promise.all(AGENT_WORKFLOWS.map((w) => counted(`${base}/actions/workflows/${w}/runs?created=${created}&per_page=100`)));
    const agentRuns = await Promise.all(AGENT_WORKFLOWS.flatMap((w, k) => list(perWorkflow[k], 'workflow_runs').map(async (r) => {
      // Every attempt's jobs (R59 reads the usage job per attempt); kept per run and attempt, so a
      // re-run, which raises run_attempt, is read again.
      const jobs = await jobsOf(r, counted);
      return { workflow: w, ...slimRun(r), jobs };
    })));

    // The money block reads no E2E status (R57 is the release card's), so it passes e2e: false and
    // saves one call per ci.yml run on main.
    const ciRuns = !readE2e ? [] : list(await counted(`${base}/actions/workflows/ci.yml/runs?branch=main&event=push&created=${created}&per_page=100`), 'workflow_runs');
    const e2e = await Promise.all(ciRuns.map(async (r) => {
      let statuses = finalStatuses.get(r.head_sha);
      if (!statuses) {
        statuses = list(await counted(`${base}/commits/${r.head_sha}/statuses?per_page=100`)).filter((s) => s.context === E2E_CONTEXT).map(slimStatus);
        if (r.status === 'completed') finalStatuses.set(r.head_sha, statuses);
      }
      return { sha: r.head_sha, run_id: r.id, run_status: r.status, statuses };
    }));

    return { readAt: new Date(nowMs).toISOString(), since, issues: issueFacts, agentRuns, e2e, calls };
  }

  return {
    async read() {
      if (cached && now() - cached.at < ttlMs) return cached.value;
      if (!inflight) {
        const at = now();
        inflight = readAll().then(
          (value) => { cached = { at, value }; inflight = null; return value; },
          (e) => { inflight = null; throw e; },
        );
      }
      return inflight;
    },
  };
}
