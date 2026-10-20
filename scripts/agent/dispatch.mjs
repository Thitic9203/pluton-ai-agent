/**
 * The dispatcher of the always-on dev agent (docs/superpowers/plans/always-on-dev-agent.md,
 * Decisions Q1 and Q2). Pure: plain issue data in, one decision out.
 *
 * Only an issue the owner labelled agent:ready starts (Q1), so an issue the feedback loop opened
 * waits for the owner, and an issue already in any agent:* state is never started twice. A
 * concurrency group cannot cap the whole repository at three, so the dispatcher counts the issues
 * labelled agent:building itself and queues the rest (Q2); when one finishes, the oldest
 * agent:queued issue the owner made ready goes next.
 *
 * These functions judge one snapshot and cannot serialise two decisions: two runs reading the same
 * snapshot would both start. The workflow must run the dispatch job in one repository-wide
 * concurrency group (wired by the workflow, not here) so decisions happen one at a time.
 *
 * Open question for the owner: the plan does not say how an issue leaves agent:blocked. Nothing
 * here restarts one; such an issue is ignored by decide() and skipped by nextFromQueue().
 */

import { isOwnerAct, isReadyLabeler } from './gates.mjs';

export const LIMIT = 3;

/** Label names, whether GitHub gave them as strings or as {name} objects. */
const labelsOf = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));
const has = (issue, label) => labelsOf(issue).includes(label);
/** True when the issue carries an agent:* label other than those in `allowed`. */
const inAgentState = (issue, allowed = ['agent:ready']) =>
  labelsOf(issue).some((l) => typeof l === 'string' && l.startsWith('agent:') && !allowed.includes(l));

/**
 * Each issue once, by number. Copies that disagree have their labels merged, so a label any copy
 * carries counts; the other fields come from the first copy.
 */
function unique(openIssues) {
  const seen = new Map();
  for (const i of openIssues ?? []) {
    const prev = seen.get(i.number);
    const labels = prev ? [...new Set([...labelsOf(prev), ...labelsOf(i)])] : labelsOf(i);
    seen.set(i.number, { ...(prev ?? i), labels });
  }
  return [...seen.values()];
}

const COLLABORATOR = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * True when `sender` may have made `issue` ready: the owner on any issue, or the agent's App
 * (docs/sdd/agent-po-triage R1, R2) only on an issue a collaborator wrote.
 */
const readyBy = (issue, sender, appLogin, evidence) =>
  isOwnerAct(sender)
  || (isReadyLabeler(sender, appLogin) && COLLABORATOR.has(issue?.author_association) && appReadyProven({ ...evidence, appLogin }));

export const TRIAGE_READY_MARKER = '<!-- agent-triage ready -->';
/** States the triage never precedes: once seen, an App agent:ready on that issue never counts. */
const PAST_TRIAGE = new Set(['agent:ready', 'agent:queued', 'agent:needs-info']);
/** The triage comments first, then labels, in one apply step; the marker must be this close before. */
export const MARKER_WINDOW_MS = 10 * 60 * 1000;

/**
 * True only when the App's latest agent:ready in `timeline` follows the triage job's own marker
 * comment (`<!-- agent-triage ready -->`, by the App as a Bot) by no more than MARKER_WINDOW_MS and
 * not before it, and the timeline shows no agent state past triage (agent:building, agent:blocked,
 * ...) at any time (docs/sdd/agent-po-triage R12; review of the triage change: the agent job also
 * holds an App token and a text deny rule is not a boundary).
 */
export function appReadyProven({ timeline, comments, appLogin } = {}) {
  const isApp = (u) => Boolean(appLogin) && u?.login === appLogin && u?.type === 'Bot';
  const t = (x) => Date.parse(x ?? '');
  const events = Array.isArray(timeline) ? timeline : [];
  if (events.some((e) => e?.event === 'labeled' && String(e?.label?.name ?? '').startsWith('agent:') && !PAST_TRIAGE.has(e.label.name))) return false;
  const label = events.filter((e) => e?.event === 'labeled' && e?.label?.name === 'agent:ready' && isApp(e?.actor))
    .map((e) => t(e.created_at)).filter(Number.isFinite).sort((a, b) => a - b).at(-1);
  if (label === undefined) return false;
  return (Array.isArray(comments) ? comments : []).some((c) => {
    const at = t(c?.created_at);
    return isApp(c?.user) && String(c?.body ?? '').includes(TRIAGE_READY_MARKER)
      && Number.isFinite(at) && at <= label && label - at <= MARKER_WINDOW_MS;
  });
}

const buildingCount = (issues) => issues.filter((i) => has(i, 'agent:building')).length;

/**
 * What to do with `issue`: {action: 'ignore'} unless it carries agent:ready applied by the owner, or by the App
 * on a collaborator's issue (`appLogin`; docs/sdd/agent-po-triage) (`readyLabeledBy` is the sender of that labeled event) and no other agent:* label, then
 * {action: 'queue'} when LIMIT issues are already building, else {action: 'start'}.
 */
export function decide({ issue, openIssues, readyLabeledBy, appLogin, appEvidence }) {
  if (!has(issue, 'agent:ready') || !readyBy(issue, readyLabeledBy, appLogin, appEvidence) || inAgentState(issue)) return { action: 'ignore' };
  return buildingCount(unique(openIssues)) >= LIMIT ? { action: 'queue' } : { action: 'start' };
}

/**
 * The oldest open issue labelled agent:queued that also carries agent:ready applied by the owner
 * (`readyLabeledByOf(number)` returns the sender of that label), by created_at then number. Null
 * when none qualifies or while LIMIT issues are building. A queued issue that does not qualify,
 * including one that also carries any other agent:* state, is skipped rather than holding the
 * queue.
 */
export function nextFromQueue(openIssues, { readyLabeledByOf, appLogin, appEvidenceOf } = {}) {
  const issues = unique(openIssues);
  if (buildingCount(issues) >= LIMIT || typeof readyLabeledByOf !== 'function') return null;
  const queued = issues.filter(
    (i) =>
      has(i, 'agent:queued') &&
      has(i, 'agent:ready') &&
      !inAgentState(i, ['agent:ready', 'agent:queued']) &&
      readyBy(i, readyLabeledByOf(i.number), appLogin, typeof appEvidenceOf === 'function' ? appEvidenceOf(i.number) : undefined),
  );
  queued.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number);
  return queued[0] ?? null;
}
