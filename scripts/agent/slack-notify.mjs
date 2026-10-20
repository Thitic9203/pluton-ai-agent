/**
 * Slack notices of the always-on agent (plan row 14 of docs/superpowers/plans/always-on-dev-agent.md;
 * the moments, mentions and wording rules are section 8 of
 * docs/superpowers/plans/agent-workflow-and-economy.md). One thread per issue in channel
 * C0C8TSRK1PE: the first moment posted for an issue opens the thread, and every later moment
 * replies in it.
 *
 *   node scripts/agent/cli.mjs slack-notify --issue=N --event=<name> [--pr=P] [--detail=<one line>]
 *
 * Events: started, gate1, gate2, merged (needs --pr), release, blocked (needs --detail), done. The
 * mock notice left on 17 Oct 2026 (docs/sdd/remove-mock-first R10).
 * --event=auto, run after the agent step, reads the moment from the issue (eventFromIssue): the
 * agent:* label says which gate waits; for agent:blocked the agent's latest comment holds the real
 * error. No waiting gate posts nothing.
 * --label=<agent:name> (with auto, from an issues labeled event) uses only the label just added.
 *
 * Where the thread lives between workflow runs. Each run is a fresh runner with no state, so the
 * thread ts is written back to GitHub, on the issue itself, as a hidden marker in a comment the App
 * posts once, when it opens the thread:
 *
 *   <!-- agent-slack-thread channel=C0C8TSRK1PE ts=1760000000.000100 -->
 *
 * Why a comment of its own rather than a field inside an existing marker (the feedback loop keeps
 * one loop-state comment it edits in place): the agent's other markers belong to other modules
 * (the plan marker of gates.mjs is hashed, so it cannot carry a field), and editing a comment needs
 * PATCH, which the cli's api() does not have; a comment posted once and never edited needs no new
 * GitHub call and cannot be lost by a half-finished edit. Only a comment by the App (login
 * AGENT_APP_LOGIN, type Bot) counts, so nobody else can point the notices at another thread. If two
 * runs ever raced and both opened a thread, the earliest marker wins, so every later notice still
 * converges on one thread.
 *
 * Token: SLACK_BOT_TOKEN (an Actions secret the owner adds; never committed). It goes only in the
 * authorization header of the Slack call (scripts/lib/slack.mjs) and is never logged: errors carry
 * the Slack method and its error code only. Without the token the command posts nothing and writes a
 * ::warning:: line, so a missing secret shows on the run instead of failing the agent's work; Slack
 * is a delivery channel, never the source of truth (the gates live in the issue's comments). A Slack
 * error with the token present is a real failure and exits 1.
 *
 * The bot sends only (no channels:history), so a gate message names the GitHub command to type;
 * the gates count only the owner's own GitHub comments (Decision Q1, economy plan section 8a (ก)).
 * Mentions: SLACK_OWNER_ID at gate1, gate2 and blocked; SLACK_QA_LEAD_ID at release. An id
 * that is not a Slack user id is left out rather than posted.
 */

import { replyInThread, slackEscape, startThread } from '../lib/slack.mjs';

export const CHANNEL = 'C0C8TSRK1PE';

export const EVENTS = Object.freeze(['started', 'gate1', 'gate2', 'merged', 'release', 'blocked', 'done']);

const MARKER = /<!-- agent-slack-thread channel=(C[A-Z0-9]+) ts=(\d+\.\d+) -->/;
const SLACK_USER_ID = /^[UW][A-Z0-9]{2,}$/;
const MAX_LINE = 200;

/** The hidden marker the App leaves on the issue when it opens the thread. */
export function threadMarker(channel, ts) {
  if (!/^C[A-Z0-9]+$/.test(String(channel)) || !/^\d+\.\d+$/.test(String(ts))) throw new Error('threadMarker: bad channel or ts');
  return `<!-- agent-slack-thread channel=${channel} ts=${ts} -->`;
}

/** The thread ts of the earliest App marker for `channel`, or null when there is none. */
export function findThread(comments, botLogin, channel = CHANNEL) {
  if (!botLogin) return null;
  const marked = (comments ?? [])
    .filter((c) => c?.user?.login === botLogin && c?.user?.type === 'Bot')
    .map((c) => ({ at: String(c.created_at ?? ''), m: MARKER.exec(String(c.body ?? '')) }))
    .filter(({ m }) => m && m[1] === channel)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return marked.length ? marked[0].m[2] : null;
}

/**
 * The moment an issue is at after the agent step, or null when it waits on no gate:
 * agent:planning is gate1, agent:test-planning gate2, agent:blocked blocked with the first line of the
 * agent's latest comment.
 */
export function eventFromIssue({ issue, comments, botLogin, label }) {
  // From an issues labeled event, only the label just added counts, not what else the issue carries.
  const labels = label
    ? new Set([label])
    : new Set((issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)));
  if (labels.has('agent:blocked')) {
    const own = (comments ?? [])
      .filter((c) => botLogin && c?.user?.login === botLogin && c?.user?.type === 'Bot')
      .sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1));
    const last = own.length ? String(own[own.length - 1].body ?? '') : '';
    const first = last.split('\n').map((l) => l.trim()).find(Boolean);
    return { event: 'blocked', detail: first ?? 'agent:blocked, no comment from the agent yet' };
  }
  if (labels.has('agent:planning')) return { event: 'gate1', detail: '' };
  if (labels.has('agent:test-planning')) return { event: 'gate2', detail: '' };
  return null;
}

/** Escaped, one line, at most MAX_LINE characters. */
function oneLine(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return slackEscape(flat.length > MAX_LINE ? `${flat.slice(0, MAX_LINE - 1)}…` : flat);
}

const mention = (id) => (SLACK_USER_ID.test(String(id ?? '')) ? `<@${id}> ` : '');

/** The text of one moment. Throws on an unknown event or a moment missing what it must name. */
export function messageFor({ event, issue, ownerId, qaLeadId, detail, pr }) {
  const ref = `<${issue.html_url}|#${issue.number}>`;
  const owner = mention(ownerId);
  switch (event) {
    case 'started':
      return `▶️ เริ่มงาน ${ref} ${oneLine(issue.title)} แล้วครับ`;
    case 'gate1':
      return `${owner}🟣 Gate 1 · plan ของ ${ref} พร้อมแล้วครับ · รบกวนตอบใน GitHub: /approve-plan หรือ /revise <เหตุผล> ครับ`;
    case 'gate2':
      return `${owner}🟣 Gate 2 · test plan ของ ${ref} พร้อมแล้วครับ · รบกวนตอบใน GitHub: /approve-tests หรือ /revise <เหตุผล> ครับ`;
    case 'merged':
      if (!Number.isInteger(pr) || pr <= 0) throw new Error('merged needs --pr=<pull request number>');
      return `🔀 PR #${pr} ของ ${ref} merge แล้วครับ (Gate 3 แจ้งให้ทราบ) · รอขึ้น staging ครับ`;
    case 'release':
      return `${mention(qaLeadId)}📦 ${ref} อยู่ในรอบ release ที่ส่งถึง QA Lead แล้วครับ · รบกวนตรวจและอนุมัติ deploy staging ครับ`;
    case 'blocked':
      if (!String(detail ?? '').trim()) throw new Error('blocked needs --detail=<the real error, one line>');
      return `${owner}🔴 ${ref} ติดปัญหาครับ: ${oneLine(detail)}`;
    case 'done':
      return `✅ ปิด ${ref} เรียบร้อยแล้วครับ`;
    default:
      throw new Error(`unknown event: ${event} (one of ${EVENTS.join(', ')})`);
  }
}

/**
 * Posts one moment for issue `issueNumber`: replies in its stored thread, or opens the thread and
 * leaves the marker on the issue. Returns { threadTs, ts, opened }, or null when event is 'auto'
 * and the issue waits on no gate.
 */
export async function notify({ event, issueNumber, gh, token, botLogin, ownerId, qaLeadId, detail, pr, label, fetchImpl, log = console.log }) {
  const [issue, comments] = await Promise.all([
    gh.get(`/repos/{repo}/issues/${issueNumber}`),
    gh.all(`/repos/{repo}/issues/${issueNumber}/comments?per_page=100`),
  ]);
  if (event === 'auto') {
    const found = eventFromIssue({ issue, comments, botLogin, label });
    if (!found) {
      log(`slack-notify: #${issueNumber} waits on no gate, nothing posted`);
      return null;
    }
    ({ event, detail } = found);
  }
  const text = messageFor({ event, issue, ownerId, qaLeadId, detail, pr });
  const stored = findThread(comments, botLogin);
  if (stored) {
    const ts = await replyInThread({ token, channel: CHANNEL, threadTs: stored, text, fetchImpl });
    log(`slack-notify: #${issueNumber} ${event} replied in thread ${stored}`);
    return { threadTs: stored, ts, opened: false };
  }
  const ts = await startThread({ token, channel: CHANNEL, text, fetchImpl });
  await gh.post(`/repos/{repo}/issues/${issueNumber}/comments`, {
    body: `Slack thread of this issue in ${CHANNEL}, read back by scripts/agent/slack-notify.mjs.\n\n${threadMarker(CHANNEL, ts)}`,
  });
  log(`slack-notify: #${issueNumber} ${event} opened thread ${ts}`);
  return { threadTs: ts, ts, opened: true };
}

/** --issue=N --event=<name> [--pr=P] [--detail=<text>]; throws on anything else. */
export function parseArgs(argv) {
  const args = {};
  for (const a of argv ?? []) {
    const m = /^--(issue|event|pr|detail|label)=(.*)$/s.exec(a);
    if (!m) throw new Error(`unknown argument: ${a}`);
    args[m[1]] = m[2];
  }
  if (!/^[1-9]\d*$/.test(args.issue ?? '')) throw new Error('--issue=<positive issue number> is required');
  if (!EVENTS.includes(args.event) && args.event !== 'auto') throw new Error(`--event must be auto or one of ${EVENTS.join(', ')}`);
  if (args.pr !== undefined && !/^[1-9]\d*$/.test(args.pr)) throw new Error('--pr must be a positive pull request number');
  if (args.label !== undefined && (args.event !== 'auto' || !/^agent:[a-z-]+$/.test(args.label))) {
    throw new Error('--label=agent:<name> goes only with --event=auto');
  }
  return {
    issue: Number(args.issue), event: args.event, pr: args.pr === undefined ? null : Number(args.pr), detail: args.detail ?? '',
    ...(args.label !== undefined ? { label: args.label } : {}),
  };
}

/** The cli command. Arguments are checked before the token, so a bad call fails even unconfigured. */
export async function runSlackNotify(env, gh, _event, argv, { fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const { issue, event, pr, detail, label } = parseArgs(argv);
  if (!env.SLACK_BOT_TOKEN) {
    log(`::warning::SLACK_BOT_TOKEN is not set, so the ${event} notice of #${issue} was not posted to Slack`);
    return { exit: 0, outputs: { slack_posted: 'false' } };
  }
  const posted = await notify({
    event, issueNumber: issue, gh, token: env.SLACK_BOT_TOKEN, botLogin: env.AGENT_APP_LOGIN,
    ownerId: env.SLACK_OWNER_ID, qaLeadId: env.SLACK_QA_LEAD_ID, detail, pr, label, fetchImpl, log,
  });
  if (!posted) return { exit: 0, outputs: { slack_posted: 'false' } };
  return { exit: 0, outputs: { slack_posted: 'true', slack_thread_ts: posted.threadTs } };
}
