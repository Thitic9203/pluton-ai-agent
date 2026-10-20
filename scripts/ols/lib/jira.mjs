// OLS Jira client. Spec: docs/sdd/ols-real/spec.md R1 (search, GET only), R9 (writes, only from apply).
// The credential is read the way ~/ols-qa-testing-bot/sync_qa_owner.py reads it (OLS_JIRA_CREDS, else
// its .jira_token file, "email:api-token" for Basic auth). It never appears in an error or a log line.
import { join } from 'node:path';

export const JIRA_BASE = 'https://skilllane.atlassian.net';

export function loadJiraCreds({ env = process.env, home = process.env.HOME ?? '', readFile }) {
  const fromEnv = String(env.OLS_JIRA_CREDS ?? '').trim();
  if (fromEnv) return fromEnv;
  try {
    const v = String(readFile(join(home, 'ols-qa-testing-bot', '.jira_token'), 'utf8')).trim();
    if (v) return v;
  } catch {
    /* falls through to the error below, which names no value */
  }
  throw new Error('no Jira credential: set OLS_JIRA_CREDS or ~/ols-qa-testing-bot/.jira_token');
}

const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: String(text).split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })).map((p) => (p.content.length ? p : { type: 'paragraph', content: [{ type: 'text', text: ' ' }] })),
});

export function createJira({ creds, fetch, base = JIRA_BASE }) {
  const auth = 'Basic ' + Buffer.from(creds).toString('base64');
  async function call(path, method = 'GET', body) {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Jira ${res.status} on ${path.split('?')[0]}`);
    return res.status === 204 ? {} : res.json();
  }
  return {
    /** R1: every page of a JQL search, GET only. */
    async search(jql, fields) {
      const out = [];
      let token = null;
      for (let page = 0; page < 50; page++) {
        const q = new URLSearchParams({ jql, fields: fields.join(','), maxResults: '100' });
        if (token) q.set('nextPageToken', token);
        const d = await call(`/rest/api/3/search/jql?${q}`);
        out.push(...(d.issues ?? []));
        if (d.isLast || !d.nextPageToken) break;
        token = d.nextPageToken;
      }
      return out;
    },
    comment: (key, text) => call(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, 'POST', { body: adf(text) }),
    async transition(key, to) {
      const d = await call(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
      const want = String(to).trim().toLowerCase();
      const t = (d.transitions ?? []).find((x) => String(x.to?.name ?? '').toLowerCase() === want || String(x.name ?? '').toLowerCase() === want);
      if (!t) throw new Error(`no transition to "${to}" on ${key}`);
      return call(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, 'POST', { transition: { id: t.id } });
    },
    tcStatus: (key, value) => call(`/rest/api/3/issue/${encodeURIComponent(key)}`, 'PUT', { fields: { customfield_12128: { value } } }),
    assign: (key, accountId) => call(`/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, 'PUT', { accountId }),
  };
}
