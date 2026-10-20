// OLS Jira client. Spec: docs/sdd/ols-real/spec.md R1 (search, GET only), R9 (writes, only from apply).
// The credential is read the way ~/ols-qa-testing-bot/sync_qa_owner.py reads it (OLS_JIRA_CREDS, else
// its .jira_token file, "email:api-token" for Basic auth). It never appears in an error or a log line.
import { join } from 'node:path';

export const JIRA_BASE = 'https://skilllane.atlassian.net';
/** R17: the largest Jira response read (5 MB). */
const MAX_BODY = 5 * 1024 * 1024;

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
    const where = path.split('?')[0];
    if (!res.ok) throw Object.assign(new Error(`Jira ${res.status} on ${where}`), { status: res.status });
    if (res.status === 204) return {};
    // R17: no response over 5 MB is read, by its declared length or by what arrived
    const declared = Number(res.headers?.get?.('content-length') ?? 0);
    if (declared > MAX_BODY) throw new Error(`Jira response over 5 MB on ${where}`);
    const text = await res.text();
    if (text.length > MAX_BODY) throw new Error(`Jira response over 5 MB on ${where}`);
    return text ? JSON.parse(text) : {};
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
    /**
     * R17: one issue with every field but comments, and their names (to find the criteria fields), GET
     * only. ols-retest-procedure R1: with its changelog, so the description's history is read too.
     */
    issue: (key) => call(`/rest/api/3/issue/${encodeURIComponent(key)}?${new URLSearchParams({ fields: '*all,-comment', expand: 'names,changelog' })}`),
    /** R17: the newest 50 comments, newest first, with the total, GET only. */
    async comments(key) {
      const d = await call(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?${new URLSearchParams({ orderBy: '-created', maxResults: '50' })}`);
      return { comments: d.comments ?? [], total: d.total ?? (d.comments ?? []).length };
    },
    comment: (key, text) => call(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, 'POST', { body: adf(text) }),
    /** ols-retest-procedure R8: a comment that opens with an @mention of the PO. */
    mention(key, accountId, text) {
      const doc = adf(text);
      doc.content[0].content = [{ type: 'mention', attrs: { id: accountId } }, { type: 'text', text: ` ${doc.content[0].content[0]?.text ?? ''}` }];
      return call(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, 'POST', { body: doc });
    },
    /** ols-retest-procedure R8, R9: the ticket as it is now: status, QA Owner, TC Status and assignee, GET only. */
    async state(key) {
      const d = await call(`/rest/api/3/issue/${encodeURIComponent(key)}?${new URLSearchParams({ fields: 'status,assignee,customfield_12120,customfield_12128' })}`);
      const f = d.fields ?? {};
      return {
        status: String(f.status?.name ?? ''),
        qaOwner: String(f.customfield_12120?.displayName ?? ''),
        tcStatus: String(f.customfield_12128?.value ?? ''),
        assignee: String(f.assignee?.accountId ?? ''),
      };
    },
    /** ols-retest-procedure R9: one comment read back by id; null when Jira has no such comment. */
    async readComment(key, id) {
      try {
        return await call(`/rest/api/3/issue/${encodeURIComponent(key)}/comment/${encodeURIComponent(id)}`);
      } catch (e) {
        if (e?.status === 404) return null;
        throw e;
      }
    },
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
