#!/usr/bin/env node
/**
 * The one entry point the agent workflows run (docs/superpowers/plans/always-on-dev-agent.md,
 * step 8). It reads the event GitHub hands the job, fetches what the pure modules need, calls
 * them by name and writes the answer to $GITHUB_OUTPUT. The modules decide; this file only fetches
 * and reports.
 *
 *   node scripts/agent/cli.mjs dispatch     .github/workflows/agent.yml, job dispatch (Q1, Q2)
 *   node scripts/agent/cli.mjs context      .github/workflows/agent.yml, job agent: what it may read
 *   node scripts/agent/cli.mjs pull-request .github/workflows/agent.yml, job agent: .github/ check, then the PR
 *   node scripts/agent/cli.mjs plan-marker <file>  the agent's own call: the marker for a plan comment
 *   node scripts/agent/cli.mjs usage-marker <execution_file>  agent.yml, after each claude-code-action
 *                                            step: the usage marker line of R50 (no token, exits 0)
 *   node scripts/agent/cli.mjs usage-check <work|review> <line> <head sha or ''>  agent.yml, job usage:
 *                                            re-checks a line with main's code, sets its sha, before it is posted (R50, R59)
 *   node scripts/agent/cli.mjs merge-check  .github/workflows/agent.yml, job merge-check (Q3, Q5)
 *   node scripts/agent/cli.mjs release-merge .github/workflows/agent.yml, job merge-check: the Tech
 *                                            Lead merges a passing pull request into release/next (row 15)
 *   node scripts/agent/cli.mjs main-audit   .github/workflows/agent-main-audit.yml (Q3, R82)
 *   node scripts/agent/cli.mjs sweep        .github/workflows/agent-sweep.yml (economy plan section 2c)
 *   node scripts/agent/cli.mjs slack-notify --issue=N --event=<name>  Slack thread per issue (plan row 14)
 *
 * The modules belong to other lanes (A: gates.mjs, dispatch.mjs; B: merge-check.mjs,
 * main-audit.mjs), so they are imported when a command runs, not at load: the tests of this file
 * run in the script suite, which has no install step and imports node:* only.
 *
 * Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, PRODUCT_REPO (the product, spec repo-split R18), GITHUB_EVENT_NAME, GITHUB_EVENT_PATH,
 * GITHUB_OUTPUT, GITHUB_API_URL (all set by Actions), and for main-audit AGENT_APP_LOGIN.
 * sweep is a dry run unless AGENT_SWEEP_FILE is '1', and stops when AGENT_AI_COST_UNPAID is
 * 'true'; it reads the repository from the working directory, so it runs from the root.
 * slack-notify reads SLACK_BOT_TOKEN, SLACK_OWNER_ID and SLACK_QA_LEAD_ID, and AGENT_APP_LOGIN.
 * release-merge also needs AGENT_MERGE_TOKEN (the App token that merges) and AGENT_MERGE_SHA.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { spawnChecked } from '../lib/run-command.mjs';

/** The `name:` of the merge-check job in agent.yml, which is also its check run's name. */
export const MERGE_JOB_NAME = 'Agent merge check';

/** The commit status the review job sets on the pull request head (Decision Q5). */
export const REVIEW_STATUS_CONTEXT = 'agent/review';

/** The branch prefix every agent pull request uses (plan, "Cleanup strategy"). */
export const AGENT_BRANCH_PREFIX = 'agent/issue-';

/**
 * The batch branch every agent pull request goes into (plan row 15; agent-workflow-and-economy.md
 * sections 2a and 2b, owner 14 Oct 2026). The Tech Lead step merges a passing pull request here;
 * release/next reaches main only in the QA Lead release round, never through this file.
 */
export const RELEASE_BRANCH = 'release/next';

/**
 * The pull request open-pr asks for: from agent/issue-N into release/next, never the default
 * branch. Without release/next there is nothing to open into, and falling back to main would skip
 * the release round, so it refuses with a problem instead.
 * @returns {{ request: {title: string, head: string, base: string, body: string} } | { problem: string }}
 */
export function pullRequestRequest({ issue, releaseExists }) {
  if (!releaseExists) return { problem: `${RELEASE_BRANCH} does not exist, so the pull request has no branch to go into (plan row 12 creates it)` };
  return { request: { title: `Agent: issue #${issue}`, head: `${AGENT_BRANCH_PREFIX}${issue}`, base: RELEASE_BRANCH, body: `Closes #${issue}` } };
}

/**
 * Why the Tech Lead step must not merge this pull request, or null when it may (Gate 3, plan
 * row 15). It merges only an open, non-draft pull request from agent/issue-N of this repository
 * into release/next, and only at the head sha the merge check judged, which GitHub enforces again
 * through the `sha` of the merge request.
 */
export function releaseMergeProblem({ pr, repo, sha }) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ''))) return 'the sha the merge check judged is not 40 lowercase hex characters';
  if (pr?.state !== 'open') return `the pull request is not open (${pr?.state})`;
  if (pr.draft === true) return 'the pull request is a draft';
  if (pr.base?.ref !== RELEASE_BRANCH) return `its base is ${pr.base?.ref}, not ${RELEASE_BRANCH}`;
  if (!new RegExp(`^${AGENT_BRANCH_PREFIX}[1-9][0-9]*$`).test(String(pr.head?.ref ?? ''))) return `its head ${pr.head?.ref} is not an agent branch`;
  if (pr.head?.repo?.full_name !== repo) return 'its head is a fork or another repository';
  if (pr.head?.sha !== sha) return `the head moved since the merge check (${String(pr.head?.sha).slice(0, 7)}, checked ${sha.slice(0, 7)})`;
  return null;
}

/** Labels of an issue the agent is working on, so main-audit knows which issues to stop. */
export const IN_FLIGHT = Object.freeze([
  'agent:planning',
  'agent:test-planning',
  'agent:building',
  'agent:in-review',
  'agent:merging',
  'agent:on-test-env',
]);

const labelNames = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));

/**
 * What the dispatch job does with one event. Pure: the modules are passed in.
 * @param {{ eventName: string, event: Record<string, unknown>,
 *   building: Array<{ number: number, labels?: Array<string | { name?: string }> }>, repo: string,
 *   mods: { decide: Function, isOwnerAct: Function, parseCommand: Function } }} input
 * `drain` means: ask nextFromQueue for the next queued issue (security review of 09dde08f0, item 1).
 * A merge-check found by sha (workflow_run, status; item 3) carries `sha` and no issue yet; the
 * caller resolves the pull request.
 * @returns {{ action: 'start' | 'queue' | 'continue' | 'drain' | 'merge-check' | 'ignore', issue: number | null, sha: string | null, reason: string }}
 */
export function dispatchDecision({ eventName, event, building, repo, mods }) {
  const out = (action, issue, reason, sha = null) => ({ action, issue: issue ?? null, sha, reason });
  const agentBranch = (ref) => String(ref ?? '').startsWith(AGENT_BRANCH_PREFIX);
  if (eventName === 'issues') {
    const issue = event?.issue;
    if (event?.action === 'unlabeled' && event?.label?.name === 'agent:building') return out('drain', issue?.number, 'agent:building removed');
    if (event?.action === 'closed') {
      return labelNames(issue).some((l) => typeof l === 'string' && l.startsWith('agent:'))
        ? out('drain', issue?.number, 'an agent issue closed')
        : out('ignore', issue?.number, 'a closed issue the agent never held');
    }
    if (event?.action !== 'labeled' || event?.label?.name !== 'agent:ready') return out('ignore', issue?.number, 'not the agent:ready label');
    const { action } = mods.decide({ issue, openIssues: building, readyLabeledBy: event.sender, appLogin: mods.appLogin, appEvidence: mods.appEvidence });
    return out(action, issue.number, `dispatcher said ${action}`);
  }
  if (eventName === 'issue_comment') {
    const issue = event?.issue;
    if (event?.action !== 'created') return out('ignore', issue?.number, 'not a new comment');
    if (!labelNames(issue).some((l) => typeof l === 'string' && l.startsWith('agent:'))) {
      return out('ignore', issue?.number, 'the issue has no agent label');
    }
    const cmd = mods.isOwnerAct(event.sender) ? mods.parseCommand(event.comment?.body) : null;
    if (!cmd) return out('ignore', issue.number, 'not a command from the owner');
    // A command that moves the issue into building counts against the limit like a new start
    // (second security review of 50690f8fa, item 4); this issue itself is not counted.
    if (entersBuilding(cmd.command, labelNames(issue))) {
      const busy = (building ?? []).filter((i) => i.number !== issue.number && labelNames(i).includes('agent:building')).length;
      if (busy >= mods.LIMIT) return out('queue', issue.number, `owner command ${cmd.command}, but ${busy} issues are building`);
    }
    return out('continue', issue.number, 'owner command');
  }
  if (eventName === 'pull_request_review') {
    const pr = event?.pull_request;
    const ours = pr?.head?.repo?.full_name === repo && agentBranch(pr?.head?.ref);
    if (event?.action !== 'submitted' || !ours) return out('ignore', pr?.number, 'not a review of an agent pull request');
    return out('merge-check', pr.number, 'review submitted');
  }
  if (eventName === 'workflow_run') {
    const wr = event?.workflow_run;
    const ours = wr?.head_repository?.full_name === repo && agentBranch(wr?.head_branch);
    if (event?.action !== 'completed' || !ours) return out('ignore', null, 'not a finished CI run of an agent branch');
    return out('merge-check', null, 'CI finished on an agent branch', wr.head_sha);
  }
  if (eventName === 'status') {
    const ours = event?.context === REVIEW_STATUS_CONTEXT && event?.state !== 'pending'
      && (event?.branches ?? []).some((b) => agentBranch(b?.name));
    if (!ours) return out('ignore', null, 'not a final agent/review status on an agent branch');
    return out('merge-check', null, 'the review status landed', event.sha);
  }
  return out('ignore', null, `event ${eventName} is not handled`);
}

/**
 * Whether an owner command moves an issue into agent:building (plan "Gates"): the test plan
 * approved, or a revise sent back from review or from staging. An issue already building is not
 * entering it. An approved mock did too until 17 Oct 2026 (docs/sdd/remove-mock-first R10).
 */
export function entersBuilding(command, labels) {
  if (labels.includes('agent:building')) return false;
  if (command === '/approve-tests') return true;
  return command === '/revise' && (labels.includes('agent:in-review') || labels.includes('agent:on-test-env'));
}

/**
 * Who applied agent:ready, for nextFromQueue's readyLabeledByOf: the actor of the latest
 * `labeled` event for that label in the issue timeline, as {login, type}; null when none.
 */
export function readyLabeledByFromTimeline(timeline) {
  const hits = (timeline ?? [])
    .map((e, i) => ({ e, i, t: Date.parse(e?.created_at ?? '') }))
    .filter(({ e }) => e?.event === 'labeled' && e?.label?.name === 'agent:ready' && e?.actor);
  hits.sort((a, b) => (a.t || 0) - (b.t || 0) || a.i - b.i);
  const last = hits.at(-1)?.e.actor;
  return last ? { login: last.login, type: last.type } : null;
}

/** The open agent pull request of this repository among a commit's pull requests, or null. */
export function prForSha(pulls, repo) {
  const pr = (pulls ?? []).find((p) => p?.state === 'open' && p?.head?.repo?.full_name === repo
    && String(p?.head?.ref ?? '').startsWith(AGENT_BRANCH_PREFIX));
  return pr ? pr.number : null;
}

/**
 * What the agent may read of an issue (security review of 09dde08f0, item 4): the title and body
 * the owner made ready, and the comments of the owner and of the agent's own App. Everything else
 * is counted but not shown, so text from other accounts never reaches the agent.
 */
export function agentContext({ issue, comments, botLogin, isOwnerAct, gates }) {
  const shown = (comments ?? []).filter((c) => isOwnerAct(c?.user) || (c?.user?.login === botLogin && c?.user?.type === 'Bot'));
  const hidden = (comments ?? []).length - shown.length;
  const gateLines = gates
    ? ['', '## Gate state', '', 'From gateState of scripts/agent/gates.mjs.', '',
      '```json', JSON.stringify(gates, null, 2), '```']
    : [];
  // Q1 decides who labels, not who wrote the issue: text from another author never reaches the
  // agent (second security review of 50690f8fa, item 3).
  const own = isOwnerAct(issue?.user);
  return [
    own ? `# Issue #${issue.number}: ${issue.title ?? ''}` : `# Issue #${issue.number}`,
    '',
    own ? String(issue.body ?? '') : 'issue body omitted: author is not the owner',
    '',
    `## Comments from the owner and the agent (${shown.length})`,
    ...shown.map((c) => `\n### ${c.user.login} at ${c.created_at}\n\n${c.body ?? ''}`),
    '',
    `${hidden} comment(s) from other accounts are not shown.`,
    ...gateLines,
    '',
  ].join('\n');
}

/**
 * The gates as lane A judges them, for the plan in the App's latest plan comment (by created_at),
 * hashed with lane A's planHashOf, never another way. One state for every issue: the UI case
 * differed only by the mock gate, removed 17 Oct 2026 (docs/sdd/remove-mock-first R10).
 */
export function gateSummary({ comments, botLogin, planHashOf, gateState }) {
  const plans = (comments ?? [])
    .filter((c) => c?.user?.login === botLogin && c?.user?.type === 'Bot' && /<!--\s*agent-plan\b/i.test(String(c?.body ?? '')))
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
  const latest = plans.at(-1);
  if (!latest) return { planHash: null, gates: null };
  const planHash = planHashOf(latest.body);
  return {
    planHash,
    // Gate 1 waits for the PO's size marker (docs/sdd/agent-office-live/spec.md R60).
    gates: gateState(comments, { planHash, botLogin, requireSize: true }),
  };
}

/** The paths under .github/ a diff touches, a rename's old path included. */
export function githubPathsTouched(files) {
  return (files ?? [])
    .flatMap((f) => [f?.filename, f?.previous_filename])
    .filter((p) => typeof p === 'string' && p.startsWith('.github/'));
}

/**
 * The pull request step after the agent's work (second security review of 50690f8fa, item 2).
 * A branch that touches .github/, or whose diff could not be read whole, is blocked and never gets
 * a pull request; otherwise one opens only when the agent moved the issue to agent:in-review and
 * none is open yet. The App also lacks the Workflows permission, so a push under .github/workflows
 * is refused by GitHub before this runs.
 * @returns {{ action: 'block' | 'open' | 'none', reason?: string }}
 */
export function prStep({ labels, files, filesComplete, openPr, branchExists }) {
  if (!branchExists) return { action: 'none' };
  if (!filesComplete) return { action: 'block', reason: 'agent changed too many files to check for .github/ (the compare lists 300 at most)' };
  const touched = githubPathsTouched(files);
  if (touched.length) return { action: 'block', reason: `agent changed .github/: ${touched.join(', ')}` };
  if (openPr || !(labels ?? []).includes('agent:in-review')) return { action: 'none' };
  return { action: 'open' };
}

/**
 * `git diff --name-status -z` output as file records. -z keeps every path exactly as stored, so a
 * name with a tab, a newline or a quote cannot hide from the .github/ check. A rename or a copy
 * carries two paths, the old one first.
 */
export function parseNameStatus(text) {
  const parts = String(text ?? '').split('\0');
  const files = [];
  for (let i = 0; i < parts.length && parts[i] !== ''; ) {
    const status = parts[i];
    if (/^[RC]/.test(status)) {
      files.push({ filename: parts[i + 2], previous_filename: parts[i + 1] });
      i += 3;
    } else {
      files.push({ filename: parts[i + 1], previous_filename: undefined });
      i += 2;
    }
  }
  return files;
}

/**
 * Git credentials as environment variables (GIT_CONFIG_COUNT, the form actions/checkout's header
 * takes), so the token is never a command argument other processes could read.
 */
export function gitAuthEnv(token) {
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

/**
 * The files the pushed branch changes against the base, read from the git object store of the
 * trusted checkout in `dir` (third security review of 403c577a0, item 1): both refs are fetched
 * from origin, and the diff is of those fetched commits, never of any working tree.
 * @returns {{ exists: boolean, files: { filename: string, previous_filename?: string }[] }}
 */
export function branchFiles({ dir, branch, base, env }) {
  // spawnChecked sets an explicit maxBuffer and throws on ENOBUFS, so a long diff can never come
  // back cut off and read as a short file list (scripts/lib/run-command.mjs, PITFALLS 6.68).
  const git = (args) => {
    const r = spawnChecked('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    if (r.error) throw r.error;
    return r;
  };
  const listed = git(['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]);
  if (listed.status === 2) return { exists: false, files: [] };
  if (listed.status !== 0) throw new Error(`git ls-remote origin ${branch} exited ${listed.status}: ${listed.stderr.trim()}`);
  const fetched = git(['fetch', '--no-tags', '--quiet', 'origin',
    `+refs/heads/${base}:refs/remotes/origin/${base}`, `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  if (fetched.status !== 0) throw new Error(`git fetch exited ${fetched.status}: ${fetched.stderr.trim()}`);
  const head = git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`]);
  if (head.status !== 0) throw new Error(`git rev-parse exited ${head.status}: ${head.stderr.trim()}`);
  const diff = git(['diff', '--name-status', '-z', '-M', `refs/remotes/origin/${base}...refs/remotes/origin/${branch}`]);
  if (diff.status !== 0) throw new Error(`git diff exited ${diff.status}: ${diff.stderr.trim()}`);
  return { exists: true, head: head.stdout.trim(), files: parseNameStatus(diff.stdout) };
}

/**
 * Why the hand-off from the agent job cannot be trusted, or null (fourth security review of
 * d191242d6). The agent job may be tampered with, so its one output, the head sha, must be 40
 * lowercase hex and equal the head open-pr fetched itself; the issue comes from dispatch.
 */
export function handoffProblem({ issue, sha, head }) {
  if (!/^[1-9][0-9]*$/.test(String(issue ?? ''))) return `the issue ${JSON.stringify(issue)} is not a positive whole number`;
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ''))) return 'the head sha from the agent job is not 40 lowercase hex characters';
  if (head !== sha) return `the fetched head ${head ?? '(none)'} is not the sha the agent job handed on (${sha})`;
  return null;
}

/** The plan comment marker, its hash from lane A's planHashOf and nothing else. */
export function planMarker(body, planHashOf) {
  return `<!-- agent-plan sha256:${planHashOf(body)} -->`;
}

/** A merged-or-not record of one pull request for main-audit, its merger read from the pull itself. */
export function withMerger(pull, full) {
  const merged = pull?.merged_at != null;
  const by = merged ? full?.merged_by : null;
  return { number: pull?.number, merged, merged_by: by ? { login: by.login, type: by.type } : null };
}

/**
 * Item 7: a compare that returned fewer commits than its total leaves some unaudited, so the range
 * comes back as one unknown entry and the run fails closed. Null when nothing is missing.
 */
export function rangeShortfall({ before, after, received, total }) {
  if (Number.isInteger(total) && received >= total) return null;
  return {
    sha: `${before}...${after}`,
    kind: 'unknown',
    reason: `The compare of ${before}...${after} returned ${received} of ${total ?? 'an unknown number of'} commits, so the rest could not be audited.`,
  };
}

/**
 * The merge job's own check run is still running while it judges, so it is left out by name;
 * otherwise mergeVerdict would always see one pending run (lane B, 14 Oct 2026).
 */
export function withoutOwnCheckRun(checkRuns, name = MERGE_JOB_NAME) {
  return (checkRuns ?? []).filter((c) => c?.name !== name);
}

/**
 * The review job's results on `sha`, one per commit status it set, each with the time it was set.
 * Only a status the App itself set counts, so a status written by any other token cannot pass the
 * gate. Which one is latest is mergeVerdict's call, by `completed_at` (lane B, 1772ccd8b); the
 * order the API lists them in is never relied on.
 * @returns {{ sha: string, result: string, completed_at: string | undefined }[]}
 */
export function reviewResultsFromStatuses(statuses, sha, appLogin) {
  return (statuses ?? [])
    .filter((x) => x?.context === REVIEW_STATUS_CONTEXT && x?.creator?.login === appLogin)
    .map((s) => ({
      sha,
      result: s.state === 'success' ? 'APPROVE' : s.state === 'pending' ? 'PENDING' : 'REQUEST_CHANGES',
      completed_at: s.updated_at ?? s.created_at,
    }));
}

/**
 * A commit as main-audit reads it: author null when GitHub linked no account (lane B, 1772ccd8b),
 * and each pull request as withMerger made it, merger included (lane B, ecb6a95cc).
 */
export function auditShape(sha, commit, pullRecords) {
  return {
    sha,
    author: commit?.author ? { login: commit.author.login } : null,
    committer: commit?.committer ? { login: commit.committer.login } : null,
    associatedPullRequests: pullRecords ?? [],
  };
}

/** `key=value` lines for $GITHUB_OUTPUT. A value with a newline is refused, never folded. */
export function outputLines(values) {
  return Object.entries(values)
    .map(([k, v]) => {
      const text = v === null || v === undefined ? '' : String(v);
      if (/[\r\n]/.test(text)) throw new Error(`output ${k} holds a newline`);
      return `${k}=${text}\n`;
    })
    .join('');
}

/** The rel="next" URL of a GitHub Link header, or null on the last page. */
export function nextPage(link) {
  const m = /<([^>]+)>;\s*rel="next"/.exec(link ?? '');
  return m ? m[1] : null;
}

/**
 * Every item of a listing, across all pages. `key` names the array inside an object response
 * (check runs come as {check_runs: [...]}); a plain array response needs none.
 */
export async function collectPages(first, getPage, key) {
  const items = [];
  for (let url = first; url; ) {
    const { data, link } = await getPage(url);
    items.push(...(key ? data[key] : data));
    url = nextPage(link);
  }
  return items;
}

export function api({ token, repo, base = 'https://api.github.com', fetchImpl = fetch }) {
  const raw = async (method, path, body) => {
    const url = path.startsWith('http') ? path : `${base}${path.replace('{repo}', repo)}`;
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${url} returned ${res.status}`);
    return { data: res.status === 204 ? null : await res.json(), link: res.headers.get('link') };
  };
  return {
    get: async (p) => (await raw('GET', p)).data,
    /** Every page of a listing; GitHub cuts each at per_page, so one page is never the whole. */
    all: (p, key) => collectPages(p, (u) => raw('GET', u), key),
    /** Every page's body as it came, for a listing whose body also carries a count (compare). */
    pages: async (p) => {
      const out = [];
      for (let url = p; url; ) {
        const { data, link } = await raw('GET', url);
        out.push(data);
        url = nextPage(link);
      }
      return out;
    },
    post: async (p, b) => (await raw('POST', p, b)).data,
    put: async (p, b) => (await raw('PUT', p, b)).data,
    del: async (p) => (await raw('DELETE', p)).data,
  };
}

/**
 * Stops an agent issue: the reason as a comment first, then agent:blocked (reviewer follow-up 5 on
 * 7cf23270f). The labeled event starts slack-label of agent.yml, whose notice reads the App's latest
 * comment for the reason, so the comment must already be there. Every agent:blocked the cli sets
 * goes through here.
 */
export async function stopIssue(gh, number, body) {
  await gh.post(`/repos/{repo}/issues/${number}/comments`, { body });
  await gh.post(`/repos/{repo}/issues/${number}/labels`, { labels: ['agent:blocked'] });
}

/**
 * The api main-audit stops issues with (reviewer follow-up 6): AGENT_STOP_TOKEN, an App token with
 * issues: write only, so the label is the App's and slack-label posts it. A label set with the
 * workflow token starts no workflow, so without the token the stop still happens, with a warning
 * that Slack hears nothing.
 */
export function stopApi(env, gh, makeApi = api, log = console.log) {
  if (env.AGENT_STOP_TOKEN) return makeApi({ token: env.AGENT_STOP_TOKEN, repo: productRepo(env), base: env.GITHUB_API_URL || undefined });
  log('::warning::AGENT_STOP_TOKEN is not set, so agent:blocked is set with the workflow token and no Slack notice follows');
  return gh;
}

/** The label the dispatcher sets for its own decision, inside the one repo-wide dispatch group. */
export const LABEL_FOR = Object.freeze({ start: 'agent:building', queue: 'agent:queued' });

/**
 * The labels to move when an issue is queued (main thread decision after the second security
 * review): every agent:* state but agent:ready comes off and agent:queued goes on, because lane A's
 * nextFromQueue picks only an issue with agent:queued, the owner's agent:ready and no other state.
 * The gates live in the comment history (Decision Q2), so a removed state label loses nothing.
 */
export function queueLabelChanges(labels) {
  const remove = (labels ?? []).filter((l) => typeof l === 'string' && l.startsWith('agent:') && l !== 'agent:ready' && l !== 'agent:queued');
  return { remove, add: (labels ?? []).includes('agent:queued') ? [] : ['agent:queued'] };
}

const lanes = new URL('./', import.meta.url);
const load = (file) => import(new URL(file, lanes).href);

/** The issue nextFromQueue picks, with the timeline of every queued issue read in full first. */
async function drain(gh, nextFromQueue, appLogin) {
  const [building, queued] = await Promise.all([
    gh.all('/repos/{repo}/issues?state=open&labels=agent:building&per_page=100'),
    gh.all('/repos/{repo}/issues?state=open&labels=agent:queued&per_page=100'),
  ]);
  const timelines = new Map(await Promise.all(queued.map(async (i) =>
    [i.number, await gh.all(`/repos/{repo}/issues/${i.number}/timeline?per_page=100`)])));
  const readyBy = new Map([...timelines].map(([n, tl]) => [n, readyLabeledByFromTimeline(tl)]));
  // docs/sdd/agent-po-triage R12: an App label needs the triage marker, so read those issues' comments.
  const evidence = new Map(await Promise.all([...readyBy].filter(([, by]) => by?.type === 'Bot').map(async ([n]) =>
    [n, { timeline: timelines.get(n), comments: await gh.all(`/repos/{repo}/issues/${n}/comments?per_page=100`) }])));
  return nextFromQueue([...building, ...queued], { readyLabeledByOf: (n) => readyBy.get(n) ?? null, appLogin, appEvidenceOf: (n) => evidence.get(n) });
}

async function runDispatch(env, gh, event) {
  const [{ decide, nextFromQueue, LIMIT }, { isOwnerAct, parseCommand }] = await Promise.all([load('dispatch.mjs'), load('gates.mjs')]);
  const building = env.GITHUB_EVENT_NAME === 'issues' || env.GITHUB_EVENT_NAME === 'issue_comment'
    ? await gh.all('/repos/{repo}/issues?state=open&labels=agent:building&per_page=100')
    : [];
  // docs/sdd/agent-po-triage R12: an App-applied agent:ready is judged on the issue's history.
  const n = event?.issue?.number;
  const appEvidence = env.GITHUB_EVENT_NAME === 'issues' && event?.label?.name === 'agent:ready' && event?.sender?.type === 'Bot' && Number.isInteger(n)
    ? { timeline: await gh.all(`/repos/{repo}/issues/${n}/timeline?per_page=100`), comments: await gh.all(`/repos/{repo}/issues/${n}/comments?per_page=100`) }
    : undefined;
  let d = dispatchDecision({
    eventName: env.GITHUB_EVENT_NAME,
    event,
    building,
    repo: productRepo(env),
    mods: { decide, isOwnerAct, parseCommand, LIMIT, appLogin: env.AGENT_APP_LOGIN, appEvidence },
  });
  if (d.action === 'drain') {
    const next = await drain(gh, nextFromQueue, env.AGENT_APP_LOGIN);
    if (next) await gh.del(`/repos/{repo}/issues/${next.number}/labels/${encodeURIComponent('agent:queued')}`);
    d = next
      ? { action: 'start', issue: next.number, sha: null, reason: `${d.reason}; next from the queue` }
      : { ...d, action: 'ignore', reason: `${d.reason}; nothing queued may start` };
  }
  if (d.action === 'merge-check' && d.issue === null) {
    const pr = prForSha(await gh.all(`/repos/{repo}/commits/${d.sha}/pulls?per_page=100`), productRepo(env));
    d = pr ? { ...d, issue: pr } : { ...d, action: 'ignore', reason: `${d.reason}; no open agent pull request has ${d.sha}` };
  }
  // The label goes on here, while this job still holds the repo-wide agent-dispatch group, so the
  // next dispatch counts this issue as building (Decision Q2). Set later by the agent job, two
  // agent:ready events could both read two building issues and both start.
  if (d.action === 'queue') {
    // Read the labels as they are now, not from the event, so a label set since then is not missed.
    const { remove, add } = queueLabelChanges(labelNames(await gh.get(`/repos/{repo}/issues/${d.issue}`)));
    for (const l of remove) await gh.del(`/repos/{repo}/issues/${d.issue}/labels/${encodeURIComponent(l)}`);
    if (add.length) await gh.post(`/repos/{repo}/issues/${d.issue}/labels`, { labels: add });
  } else if (LABEL_FOR[d.action]) {
    await gh.post(`/repos/{repo}/issues/${d.issue}/labels`, { labels: [LABEL_FOR[d.action]] });
  }
  console.log(`dispatch: ${d.action} (issue ${d.issue ?? 'none'}): ${d.reason}`);
  return { exit: 0, outputs: { action: d.action, issue: d.issue } };
}

/** Writes the agent's view of the issue (item 4) to AGENT_CONTEXT_FILE. */
async function runContext(env, gh) {
  const { isOwnerAct, planHashOf, gateState } = await load('gates.mjs');
  const n = Number(env.ISSUE);
  if (!Number.isInteger(n) || n <= 0 || !env.AGENT_CONTEXT_FILE) throw new Error('ISSUE and AGENT_CONTEXT_FILE must be set');
  const [issue, comments] = await Promise.all([
    gh.get(`/repos/{repo}/issues/${n}`),
    gh.all(`/repos/{repo}/issues/${n}/comments?per_page=100`),
  ]);
  mkdirSync(dirname(env.AGENT_CONTEXT_FILE), { recursive: true });
  const botLogin = env.AGENT_APP_LOGIN;
  const gates = gateSummary({ comments, botLogin, planHashOf, gateState });
  writeFileSync(env.AGENT_CONTEXT_FILE, agentContext({ issue, comments, botLogin, isOwnerAct, gates }));
  console.log(`context: issue #${n}, ${comments.length} comment(s) read`);
  return { exit: 0, outputs: {} };
}

/**
 * After the agent's work: block a branch that touches .github/, or open its pull request when the
 * agent asked for review (item 2). Runs with the App token, so the pull request starts CI.
 */
async function runPullRequest(env, gh) {
  const early = handoffProblem({ issue: env.ISSUE, sha: env.AGENT_EXPECTED_SHA, head: env.AGENT_EXPECTED_SHA });
  if (early) throw new Error(`open-pr refused: ${early}`);
  const n = Number(env.ISSUE);
  const branch = `${AGENT_BRANCH_PREFIX}${n}`;
  const [repoInfo, issue] = await Promise.all([gh.get('/repos/{repo}'), gh.get(`/repos/{repo}/issues/${n}`)]);
  // The pushed branch as git stores it, fetched into this job's own clean checkout of the default
  // branch: nothing the agent job left on disk is read (fourth security review of d191242d6).
  const { exists: branchExists, head, files } = branchFiles({
    dir: process.cwd(), branch, base: repoInfo.default_branch, env: gitAuthEnv(env.GITHUB_TOKEN),
  });
  const moved = branchExists ? handoffProblem({ issue: env.ISSUE, sha: env.AGENT_EXPECTED_SHA, head }) : null;
  if (moved) throw new Error(`open-pr refused: ${moved}`);
  const owner = productRepo(env).split('/')[0];
  const open = branchExists ? await gh.all(`/repos/{repo}/pulls?state=open&head=${owner}:${branch}&per_page=100`) : [];
  let s = prStep({ labels: labelNames(issue), files, filesComplete: true, openPr: open[0]?.number ?? null, branchExists });
  // Plan row 15: the pull request goes into release/next, never the default branch. The .github/
  // check above still diffs against the default branch, the base the agent job cut its branch
  // from, so it judges the agent's own commits and not what main gained after release/next forked.
  let ask = null;
  if (s.action === 'open') {
    const refs = await gh.all(`/repos/{repo}/git/matching-refs/heads/${RELEASE_BRANCH}`);
    ask = pullRequestRequest({ issue: n, releaseExists: refs.some((r) => r?.ref === `refs/heads/${RELEASE_BRANCH}`) });
    if (ask.problem) s = { action: 'block', reason: ask.problem };
  }
  if (s.action === 'block') {
    await stopIssue(gh, n, `**Agent stopped:** ${s.reason}. No pull request was opened; the owner decides.`);
    console.log(`::error::${s.reason}`);
    return { exit: 1, outputs: { pr: '' } };
  }
  if (s.action === 'open') {
    const pr = await gh.post('/repos/{repo}/pulls', ask.request);
    console.log(`pull-request: opened #${pr.number} for ${branch} into ${RELEASE_BRANCH}`);
    return { exit: 0, outputs: { pr: pr.number } };
  }
  console.log(`pull-request: nothing to do for ${branch}`);
  return { exit: 0, outputs: { pr: open[0]?.number ?? '' } };
}

/** Prints the plan marker for a plan file, from lane A's planHashOf (no network). */
async function printPlanMarker(file) {
  const { planHashOf } = await load('gates.mjs');
  console.log(planMarker(readFileSync(file, 'utf8'), planHashOf));
  return 0;
}

/**
 * The merge check's verdict on pull request `n` at its current head, read with `gh`: the owner's
 * approval, the reviewer job and CI (merge-check.mjs), plus the release/next rules of
 * releaseMergeProblem, so a pull request the Tech Lead step may not merge is never reported ready.
 */
async function judgePullRequest(env, gh, n) {
  const { mergeVerdict } = await load('merge-check.mjs');
  const pr = await gh.get(`/repos/{repo}/pulls/${n}`);
  const sha = pr.head.sha;
  const [reviews, runs, statuses] = await Promise.all([
    gh.all(`/repos/{repo}/pulls/${n}/reviews?per_page=100`),
    gh.all(`/repos/{repo}/commits/${sha}/check-runs?per_page=100`, 'check_runs'),
    gh.all(`/repos/{repo}/commits/${sha}/statuses?per_page=100`),
  ]);
  const verdict = mergeVerdict({
    pr,
    reviews,
    reviewJob: reviewResultsFromStatuses(statuses, sha, env.AGENT_APP_LOGIN),
    checkRuns: withoutOwnCheckRun(runs),
  });
  const release = releaseMergeProblem({ pr, repo: productRepo(env), sha });
  if (release) verdict.reasons.push(`The Tech Lead step cannot merge it: ${release}.`);
  return { pr, sha, verdict: { ok: verdict.reasons.length === 0, reasons: verdict.reasons } };
}

/** The pull request the dispatcher resolved, also for a CI run or a status found by sha (item 3). */
function prNumber(env, event) {
  const n = Number(env.AGENT_PR || event.pull_request?.number);
  if (!Number.isInteger(n) || n <= 0) throw new Error('no pull request to check: AGENT_PR is not set');
  return n;
}

async function runMergeCheck(env, gh, event) {
  const { formatReport } = await load('merge-check.mjs');
  const n = prNumber(env, event);
  const { sha, verdict } = await judgePullRequest(env, gh, n);
  await gh.post(`/repos/{repo}/issues/${n}/comments`, { body: `<!-- agent-merge-check ${sha} -->\n${formatReport(verdict)}` });
  for (const r of verdict.reasons) console.log(`::error::${r}`);
  return { exit: verdict.ok ? 0 : 1, outputs: { ok: verdict.ok, sha: verdict.ok ? sha : '' } };
}

/**
 * Gate 3, the Tech Lead step (plan row 15): merges a pull request the merge check passed into
 * release/next. It judges the pull request again with the workflow token, since time passed since
 * the check, and merges with the App token in AGENT_MERGE_TOKEN only at the sha the check judged
 * (AGENT_MERGE_SHA), which GitHub refuses with 409 if the head moved. A merge commit, so each issue
 * stays one commit on release/next for the release queue to count.
 */
async function runReleaseMerge(env, gh, event) {
  if (!env.AGENT_MERGE_TOKEN) throw new Error('AGENT_MERGE_TOKEN is not set, so nothing can merge');
  const n = prNumber(env, event);
  const { pr, verdict } = await judgePullRequest(env, gh, n);
  const moved = releaseMergeProblem({ pr, repo: productRepo(env), sha: env.AGENT_MERGE_SHA });
  if (moved) verdict.reasons.push(`The Tech Lead step cannot merge it: ${moved}.`);
  if (verdict.reasons.length) {
    for (const r of verdict.reasons) console.log(`::error::${r}`);
    return { exit: 1, outputs: { merged: false } };
  }
  const merger = api({ token: env.AGENT_MERGE_TOKEN, repo: productRepo(env), base: env.GITHUB_API_URL || undefined });
  const out = await merger.put(`/repos/{repo}/pulls/${n}/merge`, { sha: env.AGENT_MERGE_SHA, merge_method: 'merge' });
  if (out?.merged !== true) throw new Error(`the merge of #${n} into ${RELEASE_BRANCH} did not report merged: ${out?.message ?? 'no message'}`);
  await gh.post(`/repos/{repo}/issues/${n}/comments`, {
    body: `**Merged into ${RELEASE_BRANCH}** by the Tech Lead step at ${env.AGENT_MERGE_SHA.slice(0, 7)}. It reaches main in the QA Lead release round.`,
  });
  console.log(`release-merge: merged #${n} into ${RELEASE_BRANCH} as ${out.sha}`);
  return { exit: 0, outputs: { merged: true } };
}

/** The pushed commits, every page, and an unknown entry for the range when the compare fell short. */
async function pushedCommits(gh, event) {
  if (/^0+$/.test(event.before ?? '')) return { shas: [event.after], shortfall: null };
  const pages = await gh.pages(`/repos/{repo}/compare/${event.before}...${event.after}?per_page=100`);
  const shas = pages.flatMap((p) => (p?.commits ?? []).map((c) => c.sha));
  return { shas, shortfall: rangeShortfall({ before: event.before, after: event.after, received: shas.length, total: pages[0]?.total_commits }) };
}

async function runMainAudit(env, gh, event) {
  const { auditCommits } = await load('main-audit.mjs');
  const { shas, shortfall } = await pushedCommits(gh, event);
  const commits = await Promise.all(shas.map(async (sha) => {
    const [c, prs] = await Promise.all([gh.get(`/repos/{repo}/commits/${sha}`), gh.all(`/repos/{repo}/commits/${sha}/pulls?per_page=100`)]);
    // The list of a commit's pulls may lack merged_by, so each merged one is read on its own.
    const records = await Promise.all(prs.map(async (p) => withMerger(p, p.merged_at != null ? await gh.get(`/repos/{repo}/pulls/${p.number}`) : null)));
    return auditShape(sha, c, records);
  }));
  const flagged = [...auditCommits({ commits, appLogin: env.AGENT_APP_LOGIN }), ...(shortfall ? [shortfall] : [])];
  const { app, unknown } = splitFindings(flagged);
  // An unknown author can be a person committing from an unlinked email, so it is listed for the
  // owner and never blocks (lane B, 1772ccd8b).
  for (const f of unknown) console.log(`::warning::${f.sha} ${f.reason}`);
  if (env.GITHUB_STEP_SUMMARY && flagged.length) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${flagged.map((f) => `- ${f.kind} \`${f.sha}\`: ${f.reason}`).join('\n')}\n`);
  }
  if (app.length === 0) {
    console.log(`main-audit: ${commits.length} commit(s), none written by ${env.AGENT_APP_LOGIN} outside an owner merge; ${unknown.length} unknown listed`);
    // A range the compare could not list in full was not audited: the run fails closed, without
    // blocking the agent, since nothing is known against it (security review item 7).
    if (shortfall) console.log(`::error::${shortfall.reason}`);
    return { exit: shortfall ? 1 : 0, outputs: { blocked: 0, unknown: unknown.length } };
  }
  const body = ['**Agent stopped: the App wrote to main outside a pull request the owner merged** (Decisions Q3, R82)', '',
    ...app.map((f) => `- \`${f.sha.slice(0, 7)}\`: ${f.reason}`)].join('\n');
  const open = await gh.all('/repos/{repo}/issues?state=open&per_page=100');
  const writer = stopApi(env, gh);
  for (const issue of open.filter((i) => labelNames(i).some((l) => IN_FLIGHT.includes(l)))) {
    await stopIssue(writer, issue.number, body);
  }
  for (const f of app) console.log(`::error::${f.sha} ${f.reason}`);
  return { exit: 1, outputs: { blocked: app.length, unknown: unknown.length } };
}

/**
 * The blind-spot sweep (scripts/agent/sweep.mjs). The finders read the checkout this runs in; the
 * coverage reader is imported only here, after the cost check, since it reads the whole e2e tree.
 */
/** The open issues and the comments of each, for the triage (docs/sdd/agent-po-triage R3). */
async function triageInput(gh, appLogin) {
  const { triageCandidates } = await load('triage.mjs');
  const issues = await gh.all('/repos/{repo}/issues?state=open&per_page=100');
  const pre = triageCandidates(issues, { commentsOf: () => [], appLogin });
  const comments = new Map(await Promise.all(pre.map(async (i) =>
    [i.number, await gh.all(`/repos/{repo}/issues/${i.number}/comments?per_page=100`)])));
  return triageCandidates(issues.filter((i) => comments.has(i.number)), { commentsOf: (n) => comments.get(n) ?? [], appLogin });
}

/** Writes the candidates for the read-only judge to TRIAGE_FILE (R3, R4). */
async function runTriageCandidates(env, gh) {
  if (!env.TRIAGE_FILE) throw new Error('TRIAGE_FILE is not set');
  const candidates = await triageInput(gh, env.AGENT_APP_LOGIN);
  writeFileSync(env.TRIAGE_FILE, JSON.stringify(candidates, null, 2));
  console.log(`triage: ${candidates.length} candidate(s) written`);
  return { exit: 0, outputs: { count: String(candidates.length) } };
}

/**
 * Applies the judge's verdicts (TRIAGE_VERDICTS, JSON {verdicts: [...]}) to candidates it recomputes
 * itself (R6 to R10). A DM with no Slack token is skipped and its marker comment with it (E3).
 */
export async function runTriageApply(env, gh, _event, _args, { fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const { applyPlan } = await load('triage.mjs');
  let verdicts = [];
  try { verdicts = JSON.parse(env.TRIAGE_VERDICTS || '{}').verdicts ?? []; } catch { verdicts = []; }
  const acts = applyPlan({ candidates: await triageInput(gh, env.AGENT_APP_LOGIN), verdicts });
  if (acts.some((a) => a.type === 'add-label' && a.label === 'agent:needs-info')) {
    try { await gh.get('/repos/{repo}/labels/agent:needs-info'); } catch {
      await gh.post('/repos/{repo}/labels', { name: 'agent:needs-info', color: 'fbca04', description: 'PO triage: something is missing before the agent can start' });
    }
  }
  let skipMarker = false;
  for (const a of acts) {
    if (a.type === 'dm') {
      skipMarker = !env.SLACK_BOT_TOKEN || !env.SLACK_OWNER_ID;
      if (skipMarker) { log(`::warning::Slack is not configured, so the DM for #${a.number} was not sent`); continue; }
      const { slackCall } = await import(new URL('../lib/slack.mjs', import.meta.url).href);
      await slackCall(env.SLACK_BOT_TOKEN, 'chat.postMessage', { channel: env.SLACK_OWNER_ID, text: a.text }, fetchImpl);
      continue;
    }
    if (a.type === 'comment' && skipMarker) { skipMarker = false; continue; }
    if (a.type === 'comment') await gh.post(`/repos/{repo}/issues/${a.number}/comments`, { body: a.body });
    if (a.type === 'add-label') await gh.post(`/repos/{repo}/issues/${a.number}/labels`, { labels: [a.label] });
    if (a.type === 'remove-label') await gh.del(`/repos/{repo}/issues/${a.number}/labels/${encodeURIComponent(a.label)}`);
  }
  const readied = acts.filter((a) => a.type === 'add-label' && a.label === 'agent:ready').map((a) => `#${a.number}`);
  log(`triage: ${acts.length} action(s); agent:ready on ${readied.join(', ') || 'none'}`);
  return { exit: 0, outputs: {} };
}

async function runSweepCommand(env, gh) {
  const { collectFindings, readSourceFiles, runSweep } = await load('sweep.mjs');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  return runSweep({
    gh, env, now: Date.now(),
    findings: async ({ openIssues }) => {
      const { coverage } = await import(new URL('../lib/e2e-coverage.mjs', import.meta.url).href);
      return collectFindings({ openIssues, files: readSourceFiles(root), coverage: coverage() });
    },
  });
}

/** Findings that block (kind app) apart from findings only listed (kind unknown, or any other). */
export function splitFindings(flagged) {
  const app = (flagged ?? []).filter((f) => f?.kind === 'app');
  return { app, unknown: (flagged ?? []).filter((f) => f && f.kind !== 'app') };
}

const COMMANDS = {
  dispatch: runDispatch,
  context: runContext,
  'pull-request': runPullRequest,
  'merge-check': runMergeCheck,
  'release-merge': runReleaseMerge,
  'main-audit': runMainAudit,
  sweep: runSweepCommand,
  'triage-candidates': runTriageCandidates,
  'triage-apply': runTriageApply,
  'slack-notify': async (env, gh, event, args) => (await load('slack-notify.mjs')).runSlackNotify(env, gh, event, args),
  event: async (env, gh, event) => ({ exit: 0, outputs: eventOutputs(env.GITHUB_EVENT_NAME, event) }),
};

/**
 * The product repository the agent works on (docs/sdd/repo-split/spec.md R18): PRODUCT_REPO, set by
 * every workflow of pluton-ai-agent, with GITHUB_REPOSITORY as the fallback from before the split.
 */
export function productRepo(env) {
  return env.PRODUCT_REPO || env.GITHUB_REPOSITORY;
}

/**
 * The step outputs of `cli.mjs event` (spec R16): what a job `if:` may test after the event was
 * rebuilt from the API, so no job reads a sender or a label from the relay's payload.
 */
export function eventOutputs(eventName, event) {
  return {
    name: eventName,
    action: String(event?.action ?? ''),
    number: event?.issue?.number ?? event?.pull_request?.number ?? '',
    label: event?.label?.name ?? '',
    sender: event?.sender?.login ?? '',
  };
}

/** The commands that recognise the App by its login. */
const NEED_APP_LOGIN = new Set(['context', 'merge-check', 'release-merge', 'main-audit', 'slack-notify', 'triage-candidates', 'triage-apply']);

/**
 * Prints the usage marker of one agent run (docs/sdd/agent-office-live/spec.md R50) and returns 0
 * whatever happens, so a gap never turns the agent run red: the gap is named in `missing`. Needs
 * no token. It prints the marker line and nothing else, never the execution file or an error that
 * could quote it. Env: ISSUE, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_JOB, USAGE_STEP, USAGE_SHA.
 */
async function printUsageMarker(file, env, deps) {
  const { usageMarkerMain } = await load('usage-marker.mjs');
  return usageMarkerMain(file, env, deps);
}

/**
 * The usage job's check (spec R50, R59): prints the line re-serialised by checkMarkerLine, from a
 * clean checkout of main, or exits 1 naming the reason and never the line. Needs no token.
 * Env: ISSUE, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT.
 */
async function printCheckedUsage(step, line, sha, env) {
  const { checkMarkerLine } = await load('usage-marker.mjs');
  const num = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : null);
  const r = checkMarkerLine(line, { issue: num(env.ISSUE), run_id: num(env.GITHUB_RUN_ID), run_attempt: num(env.GITHUB_RUN_ATTEMPT), step, sha: sha ?? '' });
  if (!r.ok) {
    console.error(`usage-check: the ${String(step).replace(/[^a-z]/g, '')} line was refused: ${r.reason}`);
    return 1;
  }
  console.log(r.line);
  return 0;
}

/** Runs one command; returns the exit code. `deps` lets a test hand usage-marker its fetch and clock. */
export async function main(argv, env = process.env, deps = {}) {
  if (argv[0] === 'usage-marker') return printUsageMarker(argv[1], env, deps);
  if (argv[0] === 'usage-check') return printCheckedUsage(argv[1], argv[2], argv[3], env);
  if (argv[0] === 'plan-marker') {
    if (!argv[1]) throw new Error('usage: node scripts/agent/cli.mjs plan-marker <plan file>');
    return printPlanMarker(argv[1]);
  }
  const run = COMMANDS[argv[0]];
  if (!run) {
    console.error(`usage: node scripts/agent/cli.mjs plan-marker <file> | ${Object.keys(COMMANDS).join(' | ')}`);
    return 2;
  }
  for (const k of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH']) {
    if (!env[k]) throw new Error(`${k} is not set`);
  }
  if (NEED_APP_LOGIN.has(argv[0]) && !env.AGENT_APP_LOGIN) throw new Error('AGENT_APP_LOGIN is not set, so no App commit or review could be recognised');
  const raw = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const gh = api({ token: env.GITHUB_TOKEN, repo: productRepo(env), base: env.GITHUB_API_URL || undefined });
  // docs/sdd/repo-split/spec.md R16: a relayed event is rebuilt from pluton-timesheet's API, and every
  // command then sees the event name and body it judged before the split.
  let event = raw;
  if (env.GITHUB_EVENT_NAME === 'repository_dispatch') {
    const { rehydrate, UNCONFIRMED } = await load('relay-event.mjs');
    const r = await rehydrate({ type: raw?.action, payload: raw?.client_payload }, gh);
    env = { ...env, GITHUB_EVENT_NAME: r.eventName };
    event = r.event;
    if (event.action === UNCONFIRMED) {
      console.log(`relay: ${raw?.action} not confirmed by the API (${event.reason}); nothing is judged from it`);
      if (argv[0] !== 'dispatch' && argv[0] !== 'event') return 0;
    }
  }
  const { exit, outputs } = await run(env, gh, event, argv.slice(1));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, outputLines(outputs));
  return exit;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
