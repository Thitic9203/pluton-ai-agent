/**
 * The PO/BA triage of the always-on dev agent (docs/sdd/agent-po-triage/spec.md; owner, 17 Oct
 * 2026: "ให้ agent PO หรือ BA ไปทำหน้าที่ รีวิวงานและติดลาเบลและเริ่มทำตามกระบวนการได้เลย").
 *
 * Pure: issues and their comments in, candidates or a list of actions out. The model only judges
 * (agent-triage.yml job `judge`, read-only); the apply job recomputes the candidates itself and
 * acts only on a well-formed verdict for one of them (R10), at most CAP ready labels per run (R6).
 * Gate 1 (the owner approves the plan) and Gate 3 (the owner merges) are untouched (R11).
 */

export const CAP = 3;
export const JUDGE_LIMIT = 10;
export const MARK = Object.freeze({
  ready: '<!-- agent-triage ready -->',
  needsInfo: '<!-- agent-triage needs-info -->',
  questionDm: '<!-- agent-triage question-dm -->',
  gapDm: '<!-- agent-triage gap-dm -->',
});
const GAP_AFTER = 3;
const TEXT_CAP = 3000;
const COLLABORATOR = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const OWNER = 'Thitic9203';

const labelsOf = (issue) => (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name));
const isApp = (c, appLogin) => Boolean(appLogin) && c?.user?.login === appLogin && c?.user?.type === 'Bot';
const isOwner = (c) => c?.user?.login === OWNER && c?.user?.type === 'User';
const t = (x) => Date.parse(x ?? '') || 0;
const cut = (s) => {
  const v = String(s ?? '').trim();
  return v.length > TEXT_CAP ? `${v.slice(0, TEXT_CAP)}\n\n(cut at ${TEXT_CAP} characters)` : v;
};

/**
 * R3, R9: open collaborator issues, not pull requests, not self-filed, with no agent:* label but
 * agent:needs-info; an issue whose gap was DMed waits until the owner comments after it. Oldest
 * first, at most JUDGE_LIMIT. Each carries its sweep count and DM state, read from App comments.
 */
export function triageCandidates(issues, { commentsOf, appLogin }) {
  const out = [];
  for (const issue of issues ?? []) {
    if (!issue || issue.pull_request || !COLLABORATOR.has(issue.author_association)) continue;
    const labels = labelsOf(issue);
    if (labels.includes('self-filed')) continue;
    if (labels.some((l) => typeof l === 'string' && l.startsWith('agent:') && l !== 'agent:needs-info')) continue;
    const comments = (typeof commentsOf === 'function' ? commentsOf(issue.number) : []) ?? [];
    const app = comments.filter((c) => isApp(c, appLogin));
    const marked = (m) => app.filter((c) => String(c.body ?? '').includes(m));
    const gap = marked(MARK.gapDm).at(-1);
    if (gap && !comments.some((c) => isOwner(c) && t(c.created_at) > t(gap.created_at))) continue;
    out.push({
      number: issue.number,
      title: issue.title ?? '',
      body: issue.body ?? '',
      created_at: issue.created_at,
      labels,
      ownerComments: comments.filter(isOwner).map((c) => c.body ?? ''),
      sweeps: marked(MARK.needsInfo).length,
      questionDmSent: marked(MARK.questionDm).length > 0,
      gapDmSent: Boolean(gap),
    });
  }
  out.sort((a, b) => t(a.created_at) - t(b.created_at) || a.number - b.number);
  return out.slice(0, JUDGE_LIMIT);
}

const wellFormed = (v) => v && Number.isInteger(v.number) && (v.verdict === 'ready' || v.verdict === 'needs-info');

/**
 * R6 to R10: the actions for the verdicts, in order. Each is {type: 'comment', number, body},
 * {type: 'add-label' | 'remove-label', number, label} or {type: 'dm', number, text}.
 */
export function applyPlan({ candidates, verdicts }) {
  const byNumber = new Map((candidates ?? []).map((c) => [c.number, c]));
  const seen = new Set();
  const acts = [];
  let ready = 0;
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    if (!wellFormed(v) || seen.has(v.number) || !byNumber.has(v.number)) continue;
    seen.add(v.number);
    const c = byNumber.get(v.number);
    const n = v.number;
    if (v.verdict === 'ready') {
      if (ready >= CAP) continue;
      ready += 1;
      acts.push({ type: 'comment', number: n, body: `${MARK.ready}\n**PO triage: ready.** ${cut(v.reason)}\n\n${cut(v.enrichment)}\n\nGate 1 still waits for the owner's \`/approve-plan\`.` });
      if (c.labels.includes('agent:needs-info')) acts.push({ type: 'remove-label', number: n, label: 'agent:needs-info' });
      acts.push({ type: 'add-label', number: n, label: 'agent:ready' });
      continue;
    }
    const sweep = c.sweeps + 1;
    acts.push({ type: 'comment', number: n, body: `${MARK.needsInfo}\n**PO triage: needs info (sweep ${sweep}).** ${cut(v.reason)}\n\n**Found in the repository (BA, Tech Lead, QA):**\n${cut(v.enrichment)}` });
    if (!c.labels.includes('agent:needs-info')) acts.push({ type: 'add-label', number: n, label: 'agent:needs-info' });
    const q = String(v.ownerQuestion ?? '').trim();
    if (q && !c.questionDmSent) {
      acts.push({ type: 'dm', number: n, text: `Issue #${n} (${c.title}) needs your answer, which no repository source gives:\n${cut(q)}\nPlease reply as a comment on the issue.` });
      acts.push({ type: 'comment', number: n, body: `${MARK.questionDm}\nThe question above was sent to the owner by Slack DM.` });
    }
    if (sweep >= GAP_AFTER && !c.gapDmSent) {
      acts.push({ type: 'dm', number: n, text: `Issue #${n} (${c.title}) is still not ready after ${sweep} triage sweeps. Gap: ${cut(v.reason)}\nPlease reply as a comment on the issue.` });
      acts.push({ type: 'comment', number: n, body: `${MARK.gapDm}\nThe gap was sent to the owner by Slack DM; triage waits for the owner's comment.` });
    }
  }
  return acts;
}
