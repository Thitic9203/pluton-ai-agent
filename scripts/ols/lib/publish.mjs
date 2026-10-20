// The OLS part of the Agent Office board, sent from the Mac. Spec: docs/sdd/ols-real/spec.md R13, R14;
// agent-office-live R65. Only key numbers, summaries, duties and phases leave the Mac; never a credential.
import { createHash } from 'node:crypto';

export const REPO = 'Thitic9203/pluton-timesheet';
export const VARIABLE = 'OLS_BOARD';

const PHASE = { queued: 'queued', rework: 'queued', running: 'working', review: 'working', ready: 'working', approved: 'working', 'draft-sent': 'waiting', failed: 'failed', applied: 'done' };

/** R13: one item per intake ticket, in key order. */
export function boardPayload({ tickets, jobs, readAt }) {
  const byKey = new Map();
  for (const j of jobs ?? []) if (j.kind !== 'e2e') byKey.set(j.key, j);
  const items = [...(tickets ?? [])]
    .sort((a, b) => a.n - b.n)
    .map((t) => {
      const j = byKey.get(t.key);
      const phase = !t.duty ? 'idle' : j ? PHASE[j.phase] ?? 'queued' : 'queued';
      return { n: t.n, summary: String(t.summary ?? '').slice(0, 80), duty: t.duty ?? null, phase };
    });
  return { v: 1, readAt, items };
}

/** The hash ignores readAt, so a tick that changed nothing deploys nothing (Q21). */
const hashOf = (payload) => createHash('sha256').update(JSON.stringify(payload.items)).digest('hex');

/** R13: set the variable, then start one refresh, only when the items changed. */
export async function publishIfChanged({ payload, lastHash, run }) {
  const hash = hashOf(payload);
  if (hash === lastHash) return { changed: false, hash };
  await run('gh', ['variable', 'set', VARIABLE, '-R', REPO, '--body', JSON.stringify(payload)]);
  await run('gh', ['workflow', 'run', 'deploy-agent-office.yml', '-R', REPO, '--ref', 'main', '-f', 'target=refresh']);
  return { changed: true, hash };
}
