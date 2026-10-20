/**
 * Gate 3 of the always-on agent: the verdict the merge job reports on a pull request
 * (docs/superpowers/plans/always-on-dev-agent.md, Decisions Q3). When it passes, the Tech Lead
 * step merges the pull request into release/next itself (plan row 15, owner 14 Oct 2026;
 * scripts/agent/cli.mjs release-merge); release/next reaches main only in the QA Lead release
 * round. Three things must hold on the head commit, and each one that does not adds one plain
 * reason:
 *
 * 1. The owner's latest decisive review on the head sha is APPROVED. Only the exact login
 *    `Thitic9203` with `type: User` counts, so a bot or a look-alike account cannot approve. A
 *    later CHANGES_REQUESTED or DISMISSED on the same sha wins; a COMMENTED review changes nothing,
 *    as on GitHub itself. A review of an older sha says nothing about the code now on the branch.
 * 2. The separate read-only reviewer (Decisions Q5) returned APPROVE for the head sha. It may be
 *    passed as one result or as an array of results; the latest by `completed_at` on the head sha
 *    counts, so a later REQUEST_CHANGES beats an earlier APPROVE.
 *
 * Order comes only from timestamps. A decisive owner review on the head sha with no readable
 * `submitted_at`, a reviewer result on it with no readable `completed_at`, or two of either at
 * the same instant, refuses with a reason rather than guessing from array position. Null entries
 * in any list are skipped.
 * 3. At least one check run names the head sha, none is still running, and every one ended
 *    `success` or `skipped`. A run that names no sha, or another sha, is not counted.
 *
 * Without a head sha nothing can be checked, so the verdict refuses at once rather than letting
 * an undefined sha match undefined fields.
 *
 * Callers must:
 * - fetch every page of the reviews and the check runs, since both endpoints are paginated and a
 *   missing page can hide a CHANGES_REQUESTED or a red check;
 * - remove the merge job's own check run by name before calling, or it is always still running.
 *
 * Plain JSON in, plain values out, no network: the workflow fetches, this decides.
 */

export const OWNER_LOGIN = 'Thitic9203';

const DECISIVE = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
const GREEN = new Set(['success', 'skipped']);

const short = (sha) => String(sha ?? '').slice(0, 7);

/**
 * The latest of `items` by the timestamp in `key`, as `{item}`, or `{problem}` when the order
 * cannot be known: an item with no readable timestamp, or two items sharing the latest instant.
 * Array position is never used, since the order an API returns is not a promise. `{item: null}`
 * when there are no items.
 */
function latestBy(items, key) {
  const stamped = items.map((x) => ({ x, t: Date.parse(x[key] ?? '') }));
  if (stamped.some((s) => Number.isNaN(s.t))) return { problem: `no readable ${key}` };
  stamped.sort((a, b) => a.t - b.t);
  const last = stamped[stamped.length - 1];
  if (stamped.length > 1 && stamped[stamped.length - 2].t === last.t) return { problem: `two results at the same time (${key})` };
  return { item: last ? last.x : null };
}

/** The owner's last decisive review of `sha`, or a problem when the order cannot be known. */
function ownerReviewOn(reviews, sha) {
  return latestBy((reviews ?? []).filter((r) => r?.user?.login === OWNER_LOGIN && r?.user?.type === 'User'
    && r.commit_id === sha && DECISIVE.has(r.state)), 'submitted_at');
}

/** The reviewer job's latest result on `sha`, from one result or an array of them. */
function reviewerResultOn(reviewJob, sha) {
  const all = Array.isArray(reviewJob) ? reviewJob : [reviewJob];
  return latestBy(all.filter((r) => r?.sha === sha), 'completed_at');
}

export function mergeVerdict({ pr, reviews, reviewJob, checkRuns }) {
  const sha = pr?.head?.sha;
  if (typeof sha !== 'string' || sha === '') {
    return { ok: false, reasons: ['The pull request has no head commit sha, so nothing can be checked.'] };
  }
  const reasons = [];

  const owner = ownerReviewOn(reviews, sha);
  if (owner.problem) reasons.push(`The order of reviews from ${OWNER_LOGIN} on ${short(sha)} cannot be known: ${owner.problem}.`);
  else if (!owner.item) reasons.push(`There is no approval from ${OWNER_LOGIN} on the head commit ${short(sha)}.`);
  else if (owner.item.state !== 'APPROVED') reasons.push(`The latest review from ${OWNER_LOGIN} on ${short(sha)} is ${owner.item.state}, not APPROVED.`);

  const reviewer = reviewerResultOn(reviewJob, sha);
  if (reviewer.problem) reasons.push(`The reviewer job results on ${short(sha)} cannot be ordered: ${reviewer.problem}.`);
  else if (!reviewer.item) reasons.push(`The reviewer job has no result for the head commit ${short(sha)}.`);
  else if (reviewer.item.result !== 'APPROVE') reasons.push(`The reviewer job returned ${reviewer.item.result} on ${short(sha)}, not APPROVE.`);

  const runs = (checkRuns ?? []).filter((c) => c?.head_sha === sha);
  const pending = runs.filter((c) => c.status !== 'completed' || c.conclusion == null);
  const red = runs.filter((c) => !pending.includes(c) && !GREEN.has(c.conclusion));
  if (runs.length === 0) reasons.push(`There are no check runs on the head commit ${short(sha)}.`);
  else if (pending.length) reasons.push(`Checks are still running: ${pending.map((c) => c.name).join(', ')}.`);
  else if (red.length) reasons.push(`Checks are not green: ${red.map((c) => `${c.name} (${c.conclusion})`).join(', ')}.`);

  return { ok: reasons.length === 0, reasons };
}

/** A short markdown comment for the pull request, readable on a phone. */
export function formatReport(verdict) {
  if (verdict.ok) return '**Ready to merge into release/next.** Owner approval, reviewer job and checks all pass on the head commit; the Tech Lead step merges it.';
  return ['**Not ready to merge.**', '', ...verdict.reasons.map((r) => `- ${r}`)].join('\n');
}
