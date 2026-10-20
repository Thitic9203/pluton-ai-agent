// AI Agent Bot DM client. Spec: docs/sdd/ols-real/spec.md R7. Token from ~/.ols-qa-secrets/slack.env
// (SLACK_BOT_TOKEN, P4), read by name only and never logged.
import { join } from 'node:path';
import { CHANNEL } from './gate.mjs';

export function loadSlackToken({ home = process.env.HOME ?? '', readFile }) {
  for (const line of String(readFile(join(home, '.ols-qa-secrets', 'slack.env'), 'utf8')).split('\n')) {
    const m = /^\s*SLACK_BOT_TOKEN\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('SLACK_BOT_TOKEN missing from ~/.ols-qa-secrets/slack.env');
}

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
  return {
    /** Posts into the DM, in `threadTs` when given; returns the message ts. */
    async post(text, threadTs) {
      const d = await call('chat.postMessage', { channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) }, true);
      return d.ts;
    },
    async replies(threadTs) {
      const d = await call('conversations.replies', { channel, ts: threadTs, limit: '200' }, false);
      return (d.messages ?? []).map((m) => ({ user: m.user, text: m.text ?? '', ts: m.ts }));
    },
  };
}
