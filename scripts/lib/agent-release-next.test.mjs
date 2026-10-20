// Plan row 15 of docs/superpowers/plans/always-on-dev-agent.md (owner, 14 Oct 2026; details in
// agent-workflow-and-economy.md sections 2a and 2b): the agent's pull request goes into
// release/next, never main, and the Tech Lead step merges one that passed the merge check into
// release/next itself. Merging release/next into main stays with the QA Lead release round.
//
// Run: TZ=UTC node --test scripts/lib/agent-release-next.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_BRANCH_PREFIX,
  RELEASE_BRANCH,
  api,
  pullRequestRequest,
  releaseMergeProblem,
} from '../agent/cli.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const agentYml = readFileSync(join(ROOT, '.github/workflows/agent.yml'), 'utf8');

/** Job id to its body, by two-space ids under `jobs:` (as agent-workflow.test.mjs reads them). */
function jobsOf(yaml) {
  const body = yaml.slice(yaml.search(/^jobs:\s*$/m));
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):\s*$/gm)];
  return new Map(heads.map((m, i) => [m[1], body.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : body.length)]));
}
const stepsOf = (job) => job.split(/\n {6}- /);

const REPO = 'Thitic9203/pluton-timesheet';
const HEAD = 'c'.repeat(40);
const goodPr = () => ({
  number: 42,
  state: 'open',
  draft: false,
  base: { ref: 'release/next', repo: { full_name: REPO } },
  head: { ref: 'agent/issue-7', sha: HEAD, repo: { full_name: REPO } },
});

test('the release branch is release/next', () => {
  assert.equal(RELEASE_BRANCH, 'release/next');
  assert.equal(AGENT_BRANCH_PREFIX, 'agent/issue-');
});

test('open-pr asks for a pull request into release/next, never the default branch', () => {
  const r = pullRequestRequest({ issue: 7, releaseExists: true });
  assert.deepEqual(r, { request: { title: 'Agent: issue #7', head: 'agent/issue-7', base: 'release/next', body: 'Closes #7' } });
});

test('open-pr refuses when release/next does not exist, rather than opening into main', () => {
  const r = pullRequestRequest({ issue: 7, releaseExists: false });
  assert.equal(r.request, undefined);
  assert.match(r.problem, /release\/next does not exist/);
});

test('the Tech Lead merges a pull request that is open, into release/next, from agent/issue-N of this repository, at the checked sha', () => {
  assert.equal(releaseMergeProblem({ pr: goodPr(), repo: REPO, sha: HEAD }), null);
});

test('the Tech Lead never merges into main or any branch other than release/next', () => {
  for (const ref of ['main', 'release/next2', 'Release/next', '']) {
    const pr = goodPr();
    pr.base.ref = ref;
    assert.match(releaseMergeProblem({ pr, repo: REPO, sha: HEAD }), /not release\/next/, ref);
  }
});

test('the Tech Lead merges only an agent branch of this repository, never a fork', () => {
  const fork = goodPr();
  fork.head.repo.full_name = 'someone/pluton-timesheet';
  assert.match(releaseMergeProblem({ pr: fork, repo: REPO, sha: HEAD }), /fork|another repository/);
  const gone = goodPr();
  gone.head.repo = null;
  assert.match(releaseMergeProblem({ pr: gone, repo: REPO, sha: HEAD }), /fork|another repository/);
  for (const ref of ['feature/x', 'agent/issue-', 'agent/issue-7x', 'agent/issue-7/extra']) {
    const pr = goodPr();
    pr.head.ref = ref;
    assert.match(releaseMergeProblem({ pr, repo: REPO, sha: HEAD }), /not an agent branch/, ref);
  }
});

test('the Tech Lead never merges a closed, merged or draft pull request', () => {
  const closed = { ...goodPr(), state: 'closed' };
  assert.match(releaseMergeProblem({ pr: closed, repo: REPO, sha: HEAD }), /not open/);
  const draft = { ...goodPr(), draft: true };
  assert.match(releaseMergeProblem({ pr: draft, repo: REPO, sha: HEAD }), /draft/);
});

test('the Tech Lead merges only the head the merge check judged', () => {
  assert.match(releaseMergeProblem({ pr: goodPr(), repo: REPO, sha: 'd'.repeat(40) }), /head moved/);
  for (const sha of ['', undefined, 'C'.repeat(40), 'c'.repeat(39)]) {
    assert.match(releaseMergeProblem({ pr: goodPr(), repo: REPO, sha }), /40 lowercase hex/, String(sha));
  }
  const noHead = goodPr();
  noHead.head.sha = undefined;
  assert.match(releaseMergeProblem({ pr: noHead, repo: REPO, sha: HEAD }), /head moved/);
});

test('api.put sends the merge request body as JSON with the token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ merged: true }), headers: { get: () => null } };
  };
  const gh = api({ token: 't0k', repo: REPO, fetchImpl });
  const out = await gh.put('/repos/{repo}/pulls/42/merge', { sha: HEAD, merge_method: 'merge' });
  assert.deepEqual(out, { merged: true });
  assert.equal(calls[0].url, `https://api.github.com/repos/${REPO}/pulls/42/merge`);
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.authorization, 'Bearer t0k');
  assert.deepEqual(JSON.parse(calls[0].init.body), { sha: HEAD, merge_method: 'merge' });
});

test('agent.yml: the merge step runs only after the merge check said ok, with its own App token', () => {
  const job = jobsOf(agentYml).get('merge-check');
  const steps = stepsOf(job);
  const check = steps.findIndex((s) => /^\s*run: node scripts\/agent\/cli\.mjs merge-check$/m.test(s));
  const mint = steps.findIndex((s) => /uses: actions\/create-github-app-token@/.test(s) && /^\s*id: app-token$/m.test(s));
  const merge = steps.findIndex((s) => /^\s*run: node scripts\/agent\/cli\.mjs release-merge$/m.test(s));
  assert.ok(check > 0 && mint > check && merge > mint, 'check, then mint, then merge');
  // docs/sdd/repo-split/spec.md R17: the check reads and reports with an App token holding the
  // workflow token's former permissions on pluton-timesheet, which cannot merge.
  const checkToken = steps.findIndex((s) => /^\s*id: check-token$/m.test(s));
  assert.ok(checkToken >= 0 && checkToken < check, 'the check token is minted before the check');
  assert.doesNotMatch(steps[checkToken], /permission-contents: write/);
  assert.match(steps[check], /^\s+GITHUB_TOKEN: \$\{\{ steps\.check-token\.outputs\.token \}\}$/m);
  assert.match(steps[check], /^\s*id: check$/m);
  for (const i of [mint, merge]) assert.match(steps[i], /^\s*if: steps\.check\.outputs\.ok == 'true'$/m);
  assert.match(steps[mint], /^\s+permission-contents: write$/m);
  assert.match(steps[mint], /^\s+permission-pull-requests: write$/m);
  assert.doesNotMatch(steps[mint], /permission-(issues|checks|statuses|workflows|administration)/);
  assert.match(steps[merge], /^\s+AGENT_MERGE_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}$/m);
  assert.match(steps[merge], /^\s+AGENT_MERGE_SHA: \$\{\{ steps\.check\.outputs\.sha \}\}$/m);
  assert.match(steps[merge], /^\s+GITHUB_TOKEN: \$\{\{ steps\.check-token\.outputs\.token \}\}$/m);
  // The workflow token of the job still cannot merge: the merge needs the App token.
  assert.match(job, /^ {6}contents: read$/m);
  assert.doesNotMatch(job, /^ {6}contents: write$/m);
});

test('agent.yml: only the merge-check job merges, and never with gh pr merge', () => {
  const jobs = jobsOf(agentYml);
  for (const [id, body] of jobs) {
    if (id !== 'merge-check') assert.doesNotMatch(body, /cli\.mjs release-merge/, id);
  }
  assert.doesNotMatch(agentYml, /^\s*(?:run: )?.*\bgh pr merge\b(?!:)/m);
  assert.match(jobs.get('agent'), /Bash\(gh pr merge:\*\)/, 'the agent itself is still denied gh pr merge');
});

test('agent.yml: the header names release/next and keeps the merge of main with the QA Lead round', () => {
  assert.match(agentYml, /^# .*release\/next/m);
  assert.match(agentYml, /^# .*QA Lead/m);
  assert.doesNotMatch(agentYml, /the owner presses Merge/);
});
