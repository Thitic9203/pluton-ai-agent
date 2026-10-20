/**
 * The receiving half of the event relay (docs/sdd/repo-split/spec.md R15, R16; owner popup 20 Oct 2026
 * "Event relay (แนะนำ)"). pluton-timesheet's agent-relay.yml sends a repository_dispatch carrying only
 * identifiers; this module reads every object those identifiers name from the pluton-timesheet API and
 * rebuilds the event the agent's scripts judged before the split, so dispatchDecision, main-audit and the
 * Slack label notice keep their logic unchanged (Decision Q2: state is read from history every time).
 *
 * The payload decides nothing but which object to read. A claim the API does not confirm (a label the
 * issue does not carry, an issue that is not closed, a comment of another issue, a run that is not CI or
 * not completed, a status context not on that sha, a range not on its branch, an object that is not
 * there) becomes an event whose action is UNCONFIRMED, which every consumer ignores.
 *
 * node:* only, like cli.mjs, so the script suite needs no install.
 */

/** repository_dispatch type -> the GitHub event name the scripts judged before the split (R15). */
export const TYPES = Object.freeze({
  'ts-issues': 'issues',
  'ts-issue-comment': 'issue_comment',
  'ts-pr-review': 'pull_request_review',
  'ts-ci-completed': 'workflow_run',
  'ts-ci-main-completed': 'workflow_run',
  'ts-status': 'status',
  'ts-release-next': 'push',
  'ts-main-push': 'push',
  'ts-deploy-production': 'workflow_run',
});

/** The only client_payload keys the relay may send: identifiers, never a body, a sender or a state (R4, R15). */
export const PAYLOAD_KEYS = Object.freeze(['action', 'number', 'label', 'comment_id', 'review_id', 'run_id', 'sha', 'context', 'before', 'after']);

export const UNCONFIRMED = 'relay-unconfirmed';

const SHA_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[A-Za-z0-9_.:/ -]{1,100}$/;
const INT_KEYS = new Set(['number', 'comment_id', 'review_id', 'run_id']);
const SHA_KEYS = new Set(['sha', 'before', 'after']);
const RUN_NAME = Object.freeze({ 'ts-ci-completed': 'CI', 'ts-ci-main-completed': 'CI', 'ts-deploy-production': 'Deploy production' });
const PUSH_REF = Object.freeze({ 'ts-main-push': 'main', 'ts-release-next': 'release/next' });

/** Why a payload is refused before any read, or null. */
export function payloadProblem(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'the payload is not an object';
  const keys = Object.keys(payload);
  if (keys.length > 10) return `the payload has ${keys.length} keys, at most 10`;
  for (const k of keys) {
    const v = payload[k];
    if (!PAYLOAD_KEYS.includes(k)) return `the payload key ${k} is not an identifier the relay may send`;
    if (INT_KEYS.has(k) && !(Number.isInteger(Number(v)) && Number(v) > 0)) return `${k} is not a positive integer`;
    if (SHA_KEYS.has(k) && !SHA_RE.test(String(v))) return `${k} is not a 40 character sha`;
    if ((k === 'action' || k === 'label' || k === 'context') && !(typeof v === 'string' && NAME_RE.test(v))) return `${k} is not a short name`;
  }
  return null;
}

const notFound = (err) => /returned 404$/.test(String(err?.message ?? ''));
/** The object at a path, or null when GitHub answers 404 (an identifier that names nothing). */
async function read(gh, path) {
  try {
    return await gh.get(path);
  } catch (err) {
    if (notFound(err)) return null;
    throw err;
  }
}

const labelNames = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));

/** The actor of the newest timeline entry of this kind for this label, as { login, type }, or null. */
export function labelActor(timeline, kind, label) {
  const hits = (timeline ?? [])
    .map((e, i) => ({ e, i, t: Date.parse(e?.created_at ?? '') }))
    .filter(({ e }) => e?.event === kind && e?.label?.name === label && e?.actor);
  hits.sort((a, b) => (a.t || 0) - (b.t || 0) || a.i - b.i);
  const a = hits.at(-1)?.e.actor;
  return a ? { login: a.login, type: a.type } : null;
}

const actorOf = (u) => (u ? { login: u.login, type: u.type } : null);

async function issuesEvent(gh, p) {
  const issue = await read(gh, `/repos/{repo}/issues/${p.number}`);
  if (!issue || issue.pull_request) return { why: `issue ${p.number} is not an issue` };
  const has = labelNames(issue).includes(p.label);
  if (p.action === 'labeled' || p.action === 'unlabeled') {
    if (!p.label) return { why: `${p.action} names no label` };
    if (p.action === 'labeled' ? !has : has) return { why: `issue ${p.number} ${has ? 'still carries' : 'does not carry'} ${p.label}` };
    const sender = labelActor(await gh.all(`/repos/{repo}/issues/${p.number}/timeline?per_page=100`), p.action, p.label);
    if (!sender) return { why: `the timeline of issue ${p.number} has no ${p.action} ${p.label}` };
    return { event: { action: p.action, issue, label: { name: p.label }, sender } };
  }
  if (p.action === 'closed') {
    if (issue.state !== 'closed') return { why: `issue ${p.number} is not closed` };
    return { event: { action: 'closed', issue, sender: actorOf(issue.closed_by) } };
  }
  if (p.action === 'opened' || p.action === 'reopened') {
    if (issue.state !== 'open') return { why: `issue ${p.number} is not open` };
    return { event: { action: p.action, issue, sender: actorOf(p.action === 'opened' ? issue.user : null) } };
  }
  return { why: `issues action ${p.action} is not relayed` };
}

async function commentEvent(gh, p) {
  const comment = await read(gh, `/repos/{repo}/issues/comments/${p.comment_id}`);
  if (!comment) return { why: `comment ${p.comment_id} does not exist` };
  if (!String(comment.issue_url ?? '').endsWith(`/issues/${p.number}`)) return { why: `comment ${p.comment_id} is not on issue ${p.number}` };
  const issue = await read(gh, `/repos/{repo}/issues/${p.number}`);
  if (!issue) return { why: `issue ${p.number} does not exist` };
  return { event: { action: 'created', issue, comment, sender: actorOf(comment.user) } };
}

async function reviewEvent(gh, p) {
  const pull = await read(gh, `/repos/{repo}/pulls/${p.number}`);
  if (!pull) return { why: `pull request ${p.number} does not exist` };
  const review = p.review_id ? await read(gh, `/repos/{repo}/pulls/${p.number}/reviews/${p.review_id}`) : null;
  if (p.review_id && (!review || review.state === 'PENDING')) return { why: `review ${p.review_id} is not a submitted review of ${p.number}` };
  return { event: { action: 'submitted', pull_request: pull, review, sender: actorOf(review?.user) } };
}

async function runEvent(gh, p, type) {
  const run = await read(gh, `/repos/{repo}/actions/runs/${p.run_id}`);
  if (!run) return { why: `run ${p.run_id} does not exist` };
  if (run.name !== RUN_NAME[type]) return { why: `run ${p.run_id} is ${run.name}, not ${RUN_NAME[type]}` };
  if (run.status !== 'completed') return { why: `run ${p.run_id} is ${run.status}, not completed` };
  if (type === 'ts-ci-main-completed' && !(run.event === 'push' && run.head_branch === 'main')) {
    return { why: `run ${p.run_id} is not CI of a push to main` };
  }
  return { event: { action: 'completed', workflow_run: run } };
}

async function statusEvent(gh, p) {
  if (!p.sha || !p.context) return { why: 'a status needs sha and context' };
  // The list is newest first (GitHub REST "List commit statuses for a reference").
  const status = (await gh.all(`/repos/{repo}/commits/${p.sha}/statuses?per_page=100`)).find((s) => s?.context === p.context);
  if (!status) return { why: `no ${p.context} status on ${p.sha}` };
  const branches = (await read(gh, `/repos/{repo}/commits/${p.sha}/branches-where-head`)) ?? [];
  return { event: { sha: p.sha, context: p.context, state: status.state, branches: branches.map((b) => ({ name: b?.name })) } };
}

async function pushEvent(gh, p, type) {
  const ref = PUSH_REF[type];
  if (!p.after) return { why: 'a push needs after' };
  const onRef = await read(gh, `/repos/{repo}/compare/${p.after}...${ref}`);
  if (!onRef || !['identical', 'ahead'].includes(onRef.status)) return { why: `${p.after} is not on ${ref}` };
  if (p.before && !/^0+$/.test(p.before)) {
    const range = await read(gh, `/repos/{repo}/compare/${p.before}...${p.after}`);
    if (!range || range.status !== 'ahead') return { why: `${p.before}...${p.after} is not a forward range` };
  }
  return { event: { ref: `refs/heads/${ref}`, before: p.before, after: p.after } };
}

/**
 * The event of one dispatch, read from the API. `gh` is cli.mjs api() bound to pluton-timesheet.
 * @returns {Promise<{ eventName: string, event: Record<string, unknown> }>}
 */
export async function rehydrate({ type, payload }, gh) {
  const eventName = TYPES[type];
  if (!eventName) throw new Error(`repository_dispatch type ${type} is not one the relay sends (spec R15)`);
  const unconfirmed = (why) => ({ eventName, event: { action: UNCONFIRMED, reason: why } });
  const problem = payloadProblem(payload);
  if (problem) return unconfirmed(problem);
  const p = { ...payload };
  const built = type === 'ts-issues' ? await issuesEvent(gh, p)
    : type === 'ts-issue-comment' ? await commentEvent(gh, p)
      : type === 'ts-pr-review' ? await reviewEvent(gh, p)
        : type === 'ts-status' ? await statusEvent(gh, p)
          : RUN_NAME[type] ? await runEvent(gh, p, type)
            : await pushEvent(gh, p, type);
  return built.event ? { eventName, event: built.event } : unconfirmed(built.why);
}
