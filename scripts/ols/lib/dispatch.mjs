// The OLS job state machine and cap. Spec: docs/sdd/ols-real/spec.md R6, R8, E2, E3. Pure.
//
// Phases: queued -> running -> (review, test and e2e only) -> ready -> draft-sent -> approved -> applied.
// A reply other than `passed` sends a draft-sent (or failed) job to rework; rework runs like queued.

/** R6: OLS has its own cap of 3 (P6). */
export const CAP = 3;

const IN_FLIGHT = new Set(['running', 'review', 'ready', 'draft-sent', 'approved', 'rework']);
const RUNNING = new Set(['running', 'review']);

const job = (o, now) => ({ phase: 'queued', thread: null, draftTs: null, feedback: null, applied: [], error: null, createdAt: now, updatedAt: now, ...o });

/** Jobs for this tick from the intake tickets and the failing e2e cases. */
export function reconcile({ jobs, tickets, failing, now }) {
  const byId = new Map((jobs ?? []).map((j) => [j.id, j]));
  const next = [];
  for (const t of tickets ?? []) {
    if (!t.duty) continue;
    const id = `${t.key}:${t.duty}`;
    // E3: a ticket that left the intake, or changed duty, loses its old job (it is simply not carried).
    next.push(byId.get(id) ?? job({ id, kind: 'ticket', key: t.key, n: t.n, duty: t.duty, createdAt: t.created ?? now }, now));
  }
  const failingIds = new Set((failing ?? []).map((c) => c.id));
  for (const j of jobs ?? []) {
    // an e2e job in flight stays until it is applied or fails, even if the next run passes
    if (j.kind === 'e2e' && (failingIds.has(j.key) || IN_FLIGHT.has(j.phase))) next.push(j);
  }
  for (const c of failing ?? []) {
    const id = `e2e:${c.id}`;
    if (!next.some((j) => j.id === id)) next.push(job({ id, kind: 'e2e', key: c.id, duty: 'e2e-fix', case: c }, now));
  }
  return next;
}

/** R6: the jobs to start now, oldest first, within the cap; a job waiting for the owner holds no slot. */
export function pick(jobs, cap = CAP) {
  const running = (jobs ?? []).filter((j) => RUNNING.has(j.phase)).length;
  const free = Math.max(0, cap - running);
  return (jobs ?? [])
    .filter((j) => j.phase === 'queued' || j.phase === 'rework')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, free);
}

const TWO_STAGE = new Set(['test', 'e2e-fix']);

/** After a headless run. E2: no output fails, and a failed job is not picked again. */
export function afterRun(j, result, stage, now) {
  if (!result.ok) return Object.assign(j, { phase: 'failed', error: result.error, updatedAt: now });
  const phase = stage === 'work' && TWO_STAGE.has(j.duty) ? 'review' : 'ready';
  return Object.assign(j, { phase, error: null, updatedAt: now });
}

/** After reading the draft thread (R8). A reply on a failed job's thread also reworks it. */
export function afterVerdict(j, v, now) {
  // ols-retest-procedure R7: the lines after `passed` travel with the approval into the apply
  if (v.kind === 'passed' && j.phase === 'draft-sent') return Object.assign(j, { phase: 'approved', instructions: [...(v.instructions ?? [])], updatedAt: now });
  if (v.kind === 'feedback' && (j.phase === 'draft-sent' || j.phase === 'failed')) return Object.assign(j, { phase: 'rework', feedback: v.text, instructions: [], error: null, updatedAt: now });
  return j;
}

/**
 * ols-retest-procedure R7, R8: what an approved job applies: the worker's actions, then one
 * `owner.instruction` per line the owner wrote after `passed`. A new array; `actions` is not changed.
 */
export function applyActions(j, actions) {
  return [...(actions ?? []), ...(j?.instructions ?? []).map((text) => ({ type: 'owner.instruction', text }))];
}

const MAY_ORDER = new Set(['queued', 'rework', 'draft-sent', 'failed']);

/**
 * R17, E1: the ticket jobs whose context is read right after the intake search, before any reply is
 * read, any write applied or any message posted: every job pick() can return this tick, including a
 * sent draft or a failure that a reply turns into rework.
 */
export function contextCandidates(jobs) {
  return (jobs ?? []).filter((j) => j.kind !== 'e2e' && MAY_ORDER.has(j.phase));
}

/** After applying approved writes (R9, R12): a failed e2e rerun goes back to triage with the reason. */
export function afterApply(j, result, now) {
  if (result.ok) return Object.assign(j, { phase: 'applied', updatedAt: now });
  if (j.kind === 'e2e') return Object.assign(j, { phase: 'rework', feedback: result.error, applied: [], updatedAt: now });
  return Object.assign(j, { phase: 'failed', error: result.error, updatedAt: now });
}
