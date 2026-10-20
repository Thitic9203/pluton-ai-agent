/**
 * The owner's gates for the always-on dev agent (docs/superpowers/plans/always-on-dev-agent.md,
 * "Gates" and Decisions Q2, Q4). Pure: an issue's comment history in, the approved gates out.
 *
 * The verdict is read from the whole history every time, never from the event that triggered the
 * run (Decision Q2), so an approval is not lost when GitHub cancels a waiting run. A command counts
 * only when the owner's own User account wrote it and it was never edited (updated_at differs
 * from created_at, or an edit field such as last_edited_at is set). The history is walked
 * in time order through the gates plan, tests, result; Gate 3 is a pull request review and is
 * judged elsewhere. A mock gate for UI issues (Decision Q4) stood between plan and tests until the
 * owner removed it on 17 Oct 2026 (docs/sdd/remove-mock-first R10).
 *
 * Only the agent's own plan comment anchors the gates: written by `botLogin` as a Bot, carrying
 * the marker `<!-- agent-plan sha256:<hex> -->` whose hash equals planHashOf(body). A marker from
 * any other author is not a plan and is ignored entirely. A plan comment from the agent, new or
 * edited, voids every approval before it ("ถ้าแก้ plan หลังอนุมัติ การอนุมัตินั้นเป็นโมฆะ"); one
 * whose body does not match its marker anchors nothing, so it voids and approves nothing (fails
 * closed). An approval in the same second as the latest plan comment does not count.
 *
 * /revise rejects the gate that is waiting, as the plan's "ถ้าไม่ผ่าน" column says, and never voids
 * an earlier approval; it is returned in `revisions` for the workflow to act on.
 */

import { createHash } from 'node:crypto';

export const OWNER = 'Thitic9203';

const PLAN_MARKER = /<!--\s*agent-plan\s+sha256:([0-9a-f]{64})\s*-->/i;
const BARE = new Set(['/approve-plan', '/approve-tests', '/approve-result']);
const GATE_OF = { '/approve-plan': 'plan', '/approve-tests': 'tests', '/approve-result': 'result' };
const ORDER = ['plan', 'tests', 'result'];

/** True only for the owner's own User account, matched exactly. */
export function isOwnerAct(sender) {
  return Boolean(sender) && sender.login === OWNER && sender.type === 'User';
}

/**
 * Who may apply agent:ready (docs/sdd/agent-po-triage R1, E1; owner, 17 Oct 2026): the owner, or
 * the agent's own App as a Bot when `appLogin` (`<slug>[bot]`) is known. Fails closed without it.
 */
export function isReadyLabeler(sender, appLogin) {
  if (isOwnerAct(sender)) return true;
  const app = typeof appLogin === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\[bot\]$/.test(appLogin) ? appLogin : null;
  return Boolean(app && sender && sender.login === app && sender.type === 'Bot');
}

/**
 * The command on the first non-empty line, as {command, arg}, or null when there is none.
 * `/approve-mock <url>` is still read, so Agent Office can read old comments
 * (agent-office/lib/economy.mjs), but no gate counts it since 17 Oct 2026 (docs/sdd/remove-mock-first R10).
 */
export function parseCommand(body) {
  const line = String(body ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '');
  if (!line) return null;
  if (BARE.has(line)) return { command: line, arg: '' };
  const m = /^(\/approve-mock|\/revise)\s+(.+)$/.exec(line);
  if (!m) return null;
  const arg = m[2].trim();
  if (m[1] === '/approve-mock' && !/^https:\/\/\S+$/.test(arg)) return null;
  return { command: m[1], arg };
}

/**
 * The sha256 (hex) of a plan comment's body as the agent wrote it: line endings made LF, every
 * line that carries the plan marker removed, then leading and trailing whitespace trimmed, hashed
 * as UTF-8. The agent computes its marker the same way before posting.
 */
export function planHashOf(body) {
  const text = String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !PLAN_MARKER.test(line))
    .join('\n')
    .trim();
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const time = (iso) => Date.parse(iso);

const SIZE_MARKER = /<!--\s*agent-office:size\s+(\{[^\n]*?\})\s*-->/g;
const SIZES = new Set(['S', 'M', 'L', 'XL']);
/**
 * The four risk flags of R60, one each: the UI or the mock, security rules (firestore.rules),
 * workflows or secrets, stored data (schema or migration).
 */
export const SIZE_RISKS = ['ui', 'rules', 'workflows', 'data'];
const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

/**
 * The PO's size marker in a comment body (docs/sdd/agent-office-live/spec.md R60), as
 * {v, size, rules, files, risk, score}, or null when there is none, more than one, or it is not
 * well formed. Whether the size matches its score is size.mjs's judgement, not the gate's.
 */
export function parseSizeMarker(body) {
  const found = [...String(body ?? '').matchAll(SIZE_MARKER)];
  if (found.length !== 1) return null;
  let m;
  try {
    m = JSON.parse(found[0][1]);
  } catch {
    return null;
  }
  if (!m || m.v !== 1 || !SIZES.has(m.size) || !isCount(m.rules) || !isCount(m.files)) return null;
  if (!Array.isArray(m.risk) || new Set(m.risk).size !== m.risk.length || !m.risk.every((r) => SIZE_RISKS.includes(r))) return null;
  if ('score' in m && !isCount(m.score)) return null;
  return { v: 1, size: m.size, rules: m.rules, files: m.files, risk: [...m.risk], ...('score' in m ? { score: m.score } : {}) };
}

/**
 * True when a comment was edited: its updated_at differs from its created_at, or it carries a
 * non-null `last_edited_at` or `lastEditedAt` (accepted when the caller supplies one; which field
 * GitHub actually exposes is for the caller to confirm). Either sign alone is enough.
 */
export const isEdited = (c) =>
  c.updated_at !== c.created_at ||
  (c.last_edited_at !== undefined && c.last_edited_at !== null) ||
  (c.lastEditedAt !== undefined && c.lastEditedAt !== null);

/**
 * When a comment last took its current text: the latest of created_at, updated_at and any
 * non-null last_edited_at or lastEditedAt, so the same edit signal that disqualifies an approval
 * also moves a plan comment past the approvals given before the edit.
 */
const lastWritten = (c) =>
  Math.max(
    ...[c.created_at, c.updated_at, c.last_edited_at, c.lastEditedAt]
      .filter((v) => v !== undefined && v !== null)
      .map(time),
  );

/**
 * Which gates the history approves. `planHash` is the sha256 of the plan the agent is working to,
 * `botLogin` the agent's App login (`<app>[bot]`). Returns {plan, tests, result, next, revisions}:
 * `next` names the gate waiting for the owner, or null when every gate is approved, and
 * `revisions` lists each /revise since the latest plan comment as {gate, reason, id}.
 *
 * With `requireSize` (docs/sdd/agent-office-live/spec.md R60, tasks.md T29), /approve-plan counts
 * only after the App posted a size marker for the current plan (in the plan comment or a later App
 * comment, unedited, in an earlier second than the approval), and the result gains `size`: the
 * marker that counted for Gate 1, else the latest one for the current plan, else null.
 */
export function gateState(comments, { planHash, botLogin, requireSize = false } = {}) {
  const order = ORDER;
  const want = String(planHash ?? '').toLowerCase();
  const events = [];
  for (const c of comments ?? []) {
    const marker = PLAN_MARKER.exec(String(c.body ?? ''));
    if (!marker) {
      events.push({ c, plan: null, at: time(c.created_at) });
      continue;
    }
    // A marker from anyone but the agent is not a plan, and not a command either.
    if (!botLogin || c.user?.login !== botLogin || c.user?.type !== 'Bot') continue;
    const hash = marker[1].toLowerCase();
    events.push({ c, plan: hash === planHashOf(c.body) ? hash : 'invalid', at: lastWritten(c) });
  }
  // Same second: the plan first, so an approval tied with it is judged against it and fails.
  events.sort((a, b) => a.at - b.at || (a.plan ? 0 : 1) - (b.plan ? 0 : 1) || a.c.id - b.c.id);

  let currentPlan = null;
  let planAt = -Infinity;
  const approved = [];
  let revisions = [];
  const isApp = (u) => Boolean(botLogin) && u?.login === botLogin && u?.type === 'Bot';
  let planSize = null;
  let planSizeAt = Infinity;
  let gate1Size = null;
  for (const { c, plan, at } of events) {
    if (plan !== null) {
      currentPlan = plan;
      planAt = at;
      approved.length = 0;
      revisions = [];
      planSize = parseSizeMarker(c.body);
      planSizeAt = planSize ? at : Infinity;
      gate1Size = null;
      continue;
    }
    if (isApp(c.user)) {
      const s = isEdited(c) ? null : parseSizeMarker(c.body);
      if (s && at >= planAt) { planSize = s; planSizeAt = at; }
      continue;
    }
    if (!isOwnerAct(c.user) || isEdited(c)) continue;
    const cmd = parseCommand(c.body);
    if (!cmd) continue;
    const waiting = order[approved.length];
    if (cmd.command === '/revise') {
      if (waiting) revisions.push({ gate: waiting, reason: cmd.arg, id: c.id });
      continue;
    }
    if (currentPlan !== want || !(at > planAt)) continue;
    if (GATE_OF[cmd.command] !== waiting) continue;
    if (waiting === 'plan' && requireSize) {
      if (!(planSize && planSizeAt < at)) continue;
      gate1Size = planSize;
    }
    approved.push(waiting);
  }

  const has = (g) => approved.includes(g);
  return {
    plan: has('plan'),
    tests: has('tests'),
    result: has('result'),
    next: order[approved.length] ?? null,
    revisions,
    ...(requireSize ? { size: gate1Size ?? planSize } : {}),
  };
}
