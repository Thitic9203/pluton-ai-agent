/**
 * The path after merge (docs/superpowers/plans/always-on-dev-agent.md row 12; agent-workflow-and-economy.md
 * section 2b, owner 14 Oct 2026: a batch of 10, approved by the QA Lead, production "QA Lead กดเอง").
 *
 * 1. When `Deploy staging` of a main commit succeeds, every issue whose agent pull request (head
 *    `agent/issue-N`) was merged and is contained in that commit gets `agent:on-test-env`, and
 *    scripts/staging-smoke.mjs reads the site (stagedIssues, deployStagingPassed).
 * 2. Issues merged into `release/next` and not yet on staging are waiting; at 10 the QA Lead is told
 *    once (waitingIssues, batchDecision, qaLeadMessage). The Slack half belongs to lane D: the CLI writes
 *    the message to the step output `qa_lead_message` and sets `batch_notify=true`, so a Slack step can
 *    send it with `if: steps.count.outputs.batch_notify == 'true'` (the hook named QA_LEAD_NOTIFY_HOOK).
 * 3. The QA Lead, by hand, after regression passed on staging, asks for production with a sha and the
 *    Slack link of the regression result. Only that person's dispatch passes releaseInputProblem; the
 *    workflow then dispatches deploy-production.yml (whose own checks still hold) and, when that run
 *    succeeds, closes every issue of the round (roundIssues). Production is never started by an event.
 *
 * Pure functions only; imports nothing, because the script suite runs with no install step.
 */

export const RELEASE_BRANCH = 'release/next';
export const ON_TEST_ENV = 'agent:on-test-env';
export const BATCH_READY_LABEL = 'release:batch-ready';
export const BATCH_SIZE = 10;
/** The `name:` of the deploy-staging job in ci.yml. */
export const DEPLOY_STAGING_JOB = 'Deploy staging';
/** The step output lane D's Slack step reads (plan section 8). */
export const QA_LEAD_NOTIFY_HOOK = 'qa_lead_message';

const labelNames = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));

/** N of an exact `agent/issue-N` branch, else null. */
export function issueFromBranch(ref) {
  const m = typeof ref === 'string' ? ref.match(/^agent\/issue-([1-9]\d*)$/) : null;
  return m ? Number(m[1]) : null;
}

/** True only when the ci.yml job `Deploy staging` itself succeeded in this run. */
export function deployStagingPassed(jobs) {
  return (jobs ?? []).some((j) => j?.name === DEPLOY_STAGING_JOB && j?.conclusion === 'success');
}

const mergedAgentPulls = (pulls, bases) =>
  (pulls ?? []).filter((p) => p?.merged_at && bases.includes(p?.base?.ref) && issueFromBranch(p?.head?.ref) !== null);

const sortedUnique = (numbers) => [...new Set(numbers)].sort((a, b) => a - b);

/**
 * Issues staged by a deploy: merged agent pull requests into release/next or main whose merge commit
 * the deployed sha contains. `isAncestor(commit)` answers that (git merge-base --is-ancestor).
 */
export function stagedIssues({ pulls, isAncestor }) {
  return sortedUnique(
    mergedAgentPulls(pulls, [RELEASE_BRANCH, 'main'])
      .filter((p) => p.merge_commit_sha && isAncestor(p.merge_commit_sha))
      .map((p) => issueFromBranch(p.head.ref)),
  );
}

/** Open issues merged into release/next and not yet on the test environment. */
export function waitingIssues({ pulls, issues }) {
  const byNumber = new Map((issues ?? []).map((i) => [i.number, i]));
  return sortedUnique(
    mergedAgentPulls(pulls, [RELEASE_BRANCH])
      .map((p) => issueFromBranch(p.head.ref))
      .filter((n) => {
        const i = byNumber.get(n);
        return i && i.state === 'open' && !labelNames(i).includes(ON_TEST_ENV);
      }),
  );
}

/** At BATCH_SIZE waiting the QA Lead is told, once per issue not yet labelled batch-ready. */
export function batchDecision({ waiting, issues }) {
  const ready = (waiting ?? []).length >= BATCH_SIZE;
  if (!ready) return { ready: false, notify: false, toLabel: [] };
  const byNumber = new Map((issues ?? []).map((i) => [i.number, i]));
  const toLabel = waiting.filter((n) => !labelNames(byNumber.get(n)).includes(BATCH_READY_LABEL));
  return { ready: true, notify: toLabel.length > 0, toLabel };
}

/** The one notice to the QA Lead; the same text goes to the GitHub comment and to lane D's Slack hook. */
export function qaLeadMessage({ waiting, qaLead, repo }) {
  if (!qaLead) throw new Error('No QA Lead login: set the repository variable AGENT_QA_LEAD');
  const list = sortedUnique(waiting).map((n) => `#${n}`).join(', ');
  return `@${qaLead} ${waiting.length} issues wait on ${RELEASE_BRANCH} in ${repo}: ${list}. `
    + `Open the round to merge ${RELEASE_BRANCH} into main; after regression passes on staging, `
    + 'start agent-release.yml by hand with the sha and the Slack link of the result.';
}

const SLACK_LINK = /^https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+(?:\?\S*)?$/;

/** Why a production request is refused, or null. Only the QA Lead, a full sha, a Slack result link. */
export function releaseInputProblem({ sha, regressionUrl, actor, qaLead }) {
  if (!qaLead) return 'No QA Lead login: the repository variable AGENT_QA_LEAD is not set';
  if (actor !== qaLead) return `Only the QA Lead (${qaLead}) may start a release; ${actor} did`;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) return 'The sha must be the full 40 character lower case commit sha';
  if (!SLACK_LINK.test(regressionUrl ?? '')) return 'The regression result must be a Slack message link (https://<team>.slack.com/archives/...)';
  return null;
}

/** Issues the released sha closes: open, on the test environment, merge contained in that sha. */
export function roundIssues({ pulls, issues, isAncestor }) {
  const staged = new Set(stagedIssues({ pulls, isAncestor }));
  return sortedUnique(
    (issues ?? [])
      .filter((i) => i.state === 'open' && labelNames(i).includes(ON_TEST_ENV) && staged.has(i.number))
      .map((i) => i.number),
  );
}

/** The login GitHub records as triggering_actor for a dispatch made with the workflow token. */
export const WORKFLOW_TOKEN_LOGIN = 'github-actions[bot]';

/**
 * The deploy-production run this request started: a dispatch on main at or after `since` whose
 * triggering_actor is the workflow token, so a person's manual deploy in the same window is never taken
 * for it (review of e4f603f69, item 8). Exactly one may match: none yet is `{ run: null, problem: null }`
 * (keep waiting), two or more is a problem and nothing is closed.
 */
export function findDispatchedRun(runs, since) {
  const after = Date.parse(since);
  const hits = (runs ?? []).filter((r) => r.event === 'workflow_dispatch' && r.head_branch === 'main'
    && r.triggering_actor?.login === WORKFLOW_TOKEN_LOGIN && Date.parse(r.created_at) >= after);
  if (hits.length > 1) {
    return { run: null, problem: `${hits.length} production runs dispatched by ${WORKFLOW_TOKEN_LOGIN} since ${since}; cannot tell which is this release, so no issue was closed` };
  }
  return { run: hits[0] ?? null, problem: null };
}
