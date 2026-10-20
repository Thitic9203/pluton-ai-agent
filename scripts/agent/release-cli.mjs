/**
 * The I/O half of the path after merge (scripts/agent/release.mjs holds the rules). Run by
 * .github/workflows/agent-release.yml only, with the workflow token:
 *
 *   node scripts/agent/release-cli.mjs staged    RUN_ID, HEAD_SHA: label staged issues (after Deploy staging)
 *   node scripts/agent/release-cli.mjs comment   ISSUES, SMOKE_OUTCOME, HEAD_SHA: say what the smoke read
 *   node scripts/agent/release-cli.mjs count     AGENT_QA_LEAD: count release/next, tell the QA Lead at 10
 *   node scripts/agent/release-cli.mjs release   RELEASE_SHA, REGRESSION_URL, TRIGGERING_ACTOR, AGENT_QA_LEAD
 *
 * Every value reaches this file through env, never pasted into the run block.
 */
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BATCH_READY_LABEL,
  ON_TEST_ENV,
  QA_LEAD_NOTIFY_HOOK,
  RELEASE_BRANCH,
  batchDecision,
  deployStagingPassed,
  findDispatchedRun,
  qaLeadMessage,
  releaseInputProblem,
  roundIssues,
  stagedIssues,
  waitingIssues,
} from './release.mjs';

/** A small GitHub REST client with the PATCH the issue close needs. */
export function client({ token, repo, base = 'https://api.github.com', fetchImpl = fetch }) {
  const call = async (method, path, body) => {
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
  const all = async (path, key) => {
    const out = [];
    for (let url = path; url; ) {
      const { data, link } = await call('GET', url);
      out.push(...(key ? data[key] : data));
      url = /<([^>]+)>;\s*rel="next"/.exec(link ?? '')?.[1] ?? null;
    }
    return out;
  };
  return {
    get: async (p) => (await call('GET', p)).data,
    all,
    post: async (p, b) => (await call('POST', p, b)).data,
    patch: async (p, b) => (await call('PATCH', p, b)).data,
  };
}

/** git merge-base --is-ancestor, in the checkout the workflow made with the full history. */
export function gitIsAncestor(sha) {
  return (commit) => spawnSync('git', ['merge-base', '--is-ancestor', commit, sha], { stdio: 'ignore', maxBuffer: 1024 * 1024 }).status === 0;
}

const closedPulls = (gh, base) => gh.all(`/repos/{repo}/pulls?state=closed&base=${encodeURIComponent(base)}&per_page=100`);

async function issuesOf(gh, numbers) {
  const out = [];
  for (const n of numbers) out.push(await gh.get(`/repos/{repo}/issues/${n}`));
  return out;
}

function setOutputs(env, values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  for (const l of lines) console.log(l);
}

const labelled = (issue, name) => (issue.labels ?? []).some((l) => (typeof l === 'string' ? l : l?.name) === name);

/** After CI on main: when Deploy staging succeeded, label every staged open issue agent:on-test-env. */
export async function runStaged(env, { gh, isAncestor }) {
  const jobs = await gh.all(`/repos/{repo}/actions/runs/${Number(env.RUN_ID)}/jobs?per_page=100`, 'jobs');
  if (!deployStagingPassed(jobs)) {
    setOutputs(env, { staged: '' });
    console.log('Deploy staging did not succeed in this run; nothing is staged.');
    return [];
  }
  const pulls = [...(await closedPulls(gh, RELEASE_BRANCH)), ...(await closedPulls(gh, 'main'))];
  const numbers = stagedIssues({ pulls, isAncestor });
  const open = (await issuesOf(gh, numbers)).filter((i) => i.state === 'open' && !labelled(i, ON_TEST_ENV));
  for (const i of open) await gh.post(`/repos/{repo}/issues/${i.number}/labels`, { labels: [ON_TEST_ENV] });
  const staged = open.map((i) => i.number);
  setOutputs(env, { staged: staged.join(' ') });
  return staged;
}

/** One comment per staged issue with the smoke result on the deployed sha. */
export async function runComment(env, { gh }) {
  const numbers = (env.ISSUES ?? '').split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger);
  const body = `Deployed to staging at \`${env.HEAD_SHA}\`. scripts/staging-smoke.mjs: ${env.SMOKE_OUTCOME}. `
    + `This issue now waits for the QA round (${RELEASE_BRANCH}, agent-workflow-and-economy.md section 2b).`;
  for (const n of numbers) await gh.post(`/repos/{repo}/issues/${n}/comments`, { body });
  return numbers;
}

/** On a push to release/next: count the waiting issues; at 10 tell the QA Lead once. */
export async function runCount(env, { gh }) {
  const pulls = await closedPulls(gh, RELEASE_BRANCH);
  const candidates = [...new Set(pulls.map((p) => Number(/^agent\/issue-([1-9]\d*)$/.exec(p?.head?.ref ?? '')?.[1])).filter(Boolean))];
  const issues = await issuesOf(gh, candidates);
  const waiting = waitingIssues({ pulls, issues });
  const decision = batchDecision({ waiting, issues });
  let message = '';
  if (decision.notify) {
    message = qaLeadMessage({ waiting, qaLead: env.AGENT_QA_LEAD, repo: env.PRODUCT_REPO || env.GITHUB_REPOSITORY });
    for (const n of decision.toLabel) await gh.post(`/repos/{repo}/issues/${n}/labels`, { labels: [BATCH_READY_LABEL] });
    await gh.post(`/repos/{repo}/issues/${Math.max(...waiting)}/comments`, { body: message });
  }
  setOutputs(env, { waiting: waiting.length, waiting_issues: waiting.join(' '), batch_notify: decision.notify, [QA_LEAD_NOTIFY_HOOK]: message });
  return { waiting, ...decision, message };
}

/**
 * The QA Lead's release: check the request, dispatch deploy-production.yml with the sha, wait for that
 * run, and close the round's issues only when it succeeded.
 */
export async function runRelease(env, { gh, isAncestor, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = 30_000, maxPolls = 110 }) {
  const problem = releaseInputProblem({ sha: env.RELEASE_SHA, regressionUrl: env.REGRESSION_URL, actor: env.TRIGGERING_ACTOR, qaLead: env.AGENT_QA_LEAD });
  if (problem) throw new Error(problem);
  const since = new Date(now().getTime() - 5_000).toISOString();
  await gh.post('/repos/{repo}/actions/workflows/deploy-production.yml/dispatches', { ref: 'main', inputs: { sha: env.RELEASE_SHA } });
  let run = null;
  for (let i = 0; i < maxPolls; i += 1) {
    await sleep(pollMs);
    const runs = (await gh.get('/repos/{repo}/actions/workflows/deploy-production.yml/runs?event=workflow_dispatch&branch=main&per_page=20')).workflow_runs;
    const found = findDispatchedRun(runs, since);
    if (found.problem) throw new Error(found.problem);
    run = found.run;
    if (run?.status === 'completed') break;
  }
  if (!run) throw new Error('No production run dispatched by this release was found; no issue was closed');
  if (run.status !== 'completed') throw new Error('The production run did not finish in time; no issue was closed');
  if (run.conclusion !== 'success') throw new Error(`Deploy production ended ${run.conclusion} (${run.html_url}); no issue was closed`);
  const pulls = [...(await closedPulls(gh, RELEASE_BRANCH)), ...(await closedPulls(gh, 'main'))];
  const candidates = stagedIssues({ pulls, isAncestor });
  const issues = await issuesOf(gh, candidates);
  const round = roundIssues({ pulls, issues, isAncestor });
  const body = `Released to production at \`${env.RELEASE_SHA}\` by ${env.TRIGGERING_ACTOR} (QA Lead), run ${run.html_url}. `
    + `Regression on staging: ${env.REGRESSION_URL}`;
  for (const n of round) {
    await gh.post(`/repos/{repo}/issues/${n}/comments`, { body });
    await gh.patch(`/repos/{repo}/issues/${n}`, { state: 'closed', state_reason: 'completed' });
  }
  setOutputs(env, { closed: round.join(' '), production_run: run.html_url });
  return round;
}

export async function main(argv, env = process.env) {
  const gh = client({ token: env.GITHUB_TOKEN, repo: env.PRODUCT_REPO || env.GITHUB_REPOSITORY, base: env.GITHUB_API_URL || undefined });
  const command = argv[0];
  if (command === 'staged') return runStaged(env, { gh, isAncestor: gitIsAncestor(env.HEAD_SHA) });
  if (command === 'comment') return runComment(env, { gh });
  if (command === 'count') return runCount(env, { gh });
  if (command === 'release') return runRelease(env, { gh, isAncestor: gitIsAncestor(env.RELEASE_SHA) });
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
