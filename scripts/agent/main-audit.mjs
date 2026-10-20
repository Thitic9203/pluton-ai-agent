/**
 * The after-the-fact audit of main for the always-on agent (docs/superpowers/plans/always-on-dev-agent.md,
 * Decisions Q3, R82). The App's Contents: write covers main and the repository has no branch
 * protection, so nothing stops the App writing to main directly. This finds it afterwards: a
 * commit that did not arrive the way Q3 allows is returned as `{sha, kind, reason}` in one of two
 * kinds.
 *
 * - `app`: the author login or the committer login is the App. The author of a commit is free
 *   text the App can set to anyone, the owner included, so either side is enough. Such a commit
 *   is clean only when one of its pull requests was merged by the owner (`Thitic9203`, type
 *   `User`, read from GraphQL `mergedBy` or REST `merged_by`), since Q3 says only the owner
 *   merges; a merge by the App, by anyone else, or by a merger the data does not name is still
 *   this kind. Callers block on it (label `agent:blocked`, tell the owner).
 * - `unknown`: GitHub linked no account to the author (author null) and the committer is not the
 *   App. That can be a human committing from an unlinked email, so it never blocks; callers list
 *   it for the owner to look at, so it is not hidden either. Any merged pull request clears it,
 *   whoever merged, as for every commit a person makes.
 *
 * Known limit, to be measured on the real App in plan row 10: an author that GitHub links to the
 * owner (say, the App writing with the owner's email) with `web-flow` as committer is neither kind,
 * because it reads exactly like a commit the owner made in the web editor.
 *
 * `associatedPullRequests` may be a plain array (REST) or a GraphQL connection `{nodes: [...]}`.
 * Null entries in it, and null commits, are skipped. Any other shape is reported as unreadable,
 * never thrown, so one odd record cannot stop the audit of the rest.
 *
 * Callers must fetch every page of the commit list and of each commit's pull requests. Plain JSON
 * in, plain values out, no network.
 */

import { OWNER_LOGIN } from './merge-check.mjs';

/** The pull requests of a commit as an array, or null when the shape is not one we can read. */
function pullRequestsOf(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.nodes) ? value.nodes : null;
  if (!list) return null;
  const present = list.filter((p) => p !== null && p !== undefined);
  return present.every((p) => typeof p === 'object') ? present : null;
}

/** Who merged a pull request: GraphQL `mergedBy` or REST `merged_by`, or null. */
const mergerOf = (p) => p.mergedBy ?? p.merged_by ?? null;
const ownerMerged = (p) => p.merged === true && mergerOf(p)?.login === OWNER_LOGIN && mergerOf(p)?.type === 'User';

/**
 * Why the commit's pull requests do not clear it, or null when one does. With `needOwner`, a
 * pull request clears it only when the owner merged it; otherwise any merge is enough.
 */
function notCleared(c, needOwner) {
  const prs = pullRequestsOf(c.associatedPullRequests);
  if (!prs) return 'its associated pull requests could not be read';
  if (prs.some((p) => (needOwner ? ownerMerged(p) : p.merged === true))) return null;
  const merged = prs.filter((p) => p.merged === true);
  if (merged.length) {
    const by = merged.map((p) => `#${p.number} by ${mergerOf(p)?.login ?? 'merger unknown'}`).join(', ');
    return `its pull request was merged by someone other than ${OWNER_LOGIN} (${by})`;
  }
  return prs.length
    ? `it is tied only to pull request ${prs.map((p) => `#${p.number}`).join(', ')}, which was not merged`
    : 'it reached main with no pull request';
}

export function auditCommits({ commits, appLogin }) {
  const flagged = [];
  if (!appLogin) return flagged;
  for (const c of commits ?? []) {
    if (!c) continue;
    const isApp = c.author?.login === appLogin || c.committer?.login === appLogin;
    const isUnknown = !isApp && (c.author === null || c.author === undefined);
    if (!isApp && !isUnknown) continue;
    const why = notCleared(c, isApp);
    if (!why) continue;
    flagged.push(isApp
      ? { sha: c.sha, kind: 'app', reason: `App commit: ${why}.` }
      : { sha: c.sha, kind: 'unknown', reason: `Commit by an unknown author (no linked GitHub account): ${why}.` });
  }
  return flagged;
}
