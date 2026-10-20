// AI Agent Bot DM client. Spec: docs/sdd/ols-real/spec.md R7; docs/sdd/ols-retest-procedure/spec.md R5,
// R6, R9 (layers 10 to 12, 17). Token from ~/.ols-qa-secrets/slack.env (SLACK_BOT_TOKEN, P4), read by
// name only and never logged.
import { join } from 'node:path';
import { CHANNEL } from './gate.mjs';

export function loadSlackToken({ home = process.env.HOME ?? '', readFile }) {
  for (const line of String(readFile(join(home, '.ols-qa-secrets', 'slack.env'), 'utf8')).split('\n')) {
    const m = /^\s*SLACK_BOT_TOKEN\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('SLACK_BOT_TOKEN missing from ~/.ols-qa-secrets/slack.env');
}

/**
 * ols-retest-procedure R5 (layer 10): Jira wiki markup that Slack shows raw. The reasons name the
 * markup in words, so a failure notice quoting one passes this guard itself.
 */
const MARKUP = [
  [/\|\|/, 'a double-pipe table row'],
  [/\\\\/, 'a double-backslash line break'],
  [/![^\s!]+!/, 'an image embed between exclamation marks'],
];

/** R5: null when the text carries no Jira wiki markup, else the reason. */
export function markupProblem(text) {
  for (const [re, what] of MARKUP) if (re.test(String(text ?? ''))) return `Jira wiki markup in a Slack message (${what}); use short Thai lines or a Block Kit table`;
  return null;
}

/**
 * ols-real R21: free text from a worker, Jira or the sheet (an error, an apply line) with a space put
 * inside each Jira markup token, so a notice quoting it passes the guard. Never used on a draft.
 */
export function plain(text) {
  let s = String(text ?? '');
  for (let i = 0; i < 20 && markupProblem(s); i += 1) {
    s = s.replace(/\|\|/g, '| |').replace(/\\\\/g, '\\ \\').replace(/!(?=[^\s!]+!)/g, '! ');
  }
  return s;
}

/** Slack escapes &, < and > in what it stores (api.slack.com "Formatting text"). */
const unescape = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function createSlack({ token, fetch, channel = CHANNEL }) {
  async function call(method, params, post) {
    const url = `https://slack.com/api/${method}` + (post ? '' : `?${new URLSearchParams(params)}`);
    const res = await fetch(url, {
      method: post ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(post ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
      body: post ? JSON.stringify(params) : undefined,
    });
    const d = await res.json();
    if (!d.ok) throw new Error(`Slack ${d.error ?? res.status} on ${method}`);
    return d;
  }
  const guard = (text) => {
    const bad = markupProblem(text);
    if (bad) throw new Error(bad);
  };
  async function replies(threadTs) {
    const d = await call('conversations.replies', { channel, ts: threadTs, limit: '200' }, false);
    return (d.messages ?? []).map((m) => ({ user: m.user, text: m.text ?? '', ts: m.ts }));
  }
  return {
    /**
     * Posts into the DM, in `threadTs` when given; returns the message ts. R6 (layer 11): with
     * `{ key, threads }`, a ticket that already has a thread takes posts only in that thread, and the
     * first post of a ticket records its thread in `threads`.
     */
    async post(text, threadTs, { key, threads } = {}) {
      guard(text);
      const known = key && threads ? threads[key] : undefined;
      if (known && threadTs !== known) throw new Error(`Slack: ${key} already has thread ${known}; every later message is a reply in it (ols-retest-procedure R6)`);
      const d = await call('chat.postMessage', { channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }, true);
      if (key && threads && !known) threads[key] = threadTs ?? d.ts;
      return d.ts;
    },
    /** R6 (layer 12): reformatting edits the sent message, never posts a new one. */
    async update(ts, text) {
      guard(text);
      const d = await call('chat.update', { channel, ts, text }, true);
      return d.ts;
    },
    replies,
    /** R9 (layer 17): the message `ts` in `threadTs` reads back as `text`. */
    async readBack(threadTs, ts, text) {
      const m = (await replies(threadTs)).find((x) => x.ts === ts);
      if (m && unescape(m.text) === String(text)) return { ok: true, ts };
      return { ok: false, ts, error: `message ${ts} in thread ${threadTs} does not read back as sent` };
    },
  };
}
