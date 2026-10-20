// T7. Spec: docs/sdd/ols-real/spec.md R1, R7, R9, E1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJiraCreds, createJira } from './jira.mjs';
import { loadSlackToken, createSlack } from './slack.mjs';

const SECRET = 'me@x.com:tok-SECRET';

function fakeFetch(answers) {
  const seen = [];
  const f = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method ?? 'GET', body: init.body, auth: init.headers?.Authorization });
    const a = answers.shift() ?? { status: 200, json: {} };
    return { ok: a.status < 300, status: a.status, json: async () => a.json, text: async () => JSON.stringify(a.json) };
  };
  f.seen = seen;
  return f;
}

test('credentials come from OLS_JIRA_CREDS, else the bot token file; slack from slack.env', () => {
  assert.equal(loadJiraCreds({ env: { OLS_JIRA_CREDS: ' a:b ' }, readFile: () => { throw new Error('no'); } }), 'a:b');
  assert.equal(loadJiraCreds({ env: {}, home: '/h', readFile: (p) => (p === '/h/ols-qa-testing-bot/.jira_token' ? 'c:d\n' : '') }), 'c:d');
  assert.throws(() => loadJiraCreds({ env: {}, home: '/h', readFile: () => { throw new Error('ENOENT'); } }), /no Jira credential/);
  assert.equal(loadSlackToken({ home: '/h', readFile: () => '# x\nSLACK_BOT_TOKEN="xoxb-1"\n' }), 'xoxb-1');
});

test('R1: the intake search is GET only, pages through every result, sends Basic auth', async () => {
  const fetch = fakeFetch([
    { status: 200, json: { issues: [{ key: 'OLS-1' }], nextPageToken: 'p2' } },
    { status: 200, json: { issues: [{ key: 'OLS-2' }], isLast: true } },
  ]);
  const jira = createJira({ creds: SECRET, fetch });
  const out = await jira.search('project = OLS', ['summary']);
  assert.deepEqual(out.map((i) => i.key), ['OLS-1', 'OLS-2']);
  assert.ok(fetch.seen.every((s) => s.method === 'GET'));
  assert.match(fetch.seen[0].url, /^https:\/\/skilllane\.atlassian\.net\/rest\/api\/3\/search\/jql\?/);
  assert.match(fetch.seen[1].url, /nextPageToken=p2/);
  assert.equal(fetch.seen[0].auth, 'Basic ' + Buffer.from(SECRET).toString('base64'));
});

test('E1: a Jira error names status and path, never the credential', async () => {
  const jira = createJira({ creds: SECRET, fetch: fakeFetch([{ status: 401, json: { errorMessages: ['x'] } }]) });
  await assert.rejects(jira.search('q', []), (e) => /Jira 401/.test(e.message) && !e.message.includes('SECRET') && !e.message.includes(Buffer.from(SECRET).toString('base64')));
});

test('R9: comment is ADF, transition goes by target name, TC Status and assignee are field writes', async () => {
  const fetch = fakeFetch([
    { status: 201, json: {} },
    { status: 200, json: { transitions: [{ id: '11', name: 'Start', to: { name: 'TESTING' } }, { id: '31', name: 'Close', to: { name: 'Done' } }] } },
    { status: 204, json: {} },
    { status: 204, json: {} },
    { status: 204, json: {} },
  ]);
  const jira = createJira({ creds: SECRET, fetch });
  await jira.comment('OLS-1', 'line 1\nline 2');
  await jira.transition('OLS-1', 'done');
  await jira.tcStatus('OLS-1', 'QA REVIEWED');
  await jira.assign('OLS-1', 'acc-1');
  const [c, , t, f, a] = fetch.seen;
  assert.equal(c.method, 'POST');
  assert.deepEqual(JSON.parse(c.body).body.content.map((p) => p.content[0].text), ['line 1', 'line 2']);
  assert.deepEqual(JSON.parse(t.body), { transition: { id: '31' } });
  assert.deepEqual([f.method, JSON.parse(f.body)], ['PUT', { fields: { customfield_12128: { value: 'QA REVIEWED' } } }]);
  assert.deepEqual([a.method, a.url.endsWith('/issue/OLS-1/assignee'), JSON.parse(a.body)], ['PUT', true, { accountId: 'acc-1' }]);
  const none = createJira({ creds: SECRET, fetch: fakeFetch([{ status: 200, json: { transitions: [] } }]) });
  await assert.rejects(none.transition('OLS-1', 'Done'), /no transition to "Done"/);
});

test('R7: slack posts into the DM channel thread and reads replies; an API error throws', async () => {
  const fetch = fakeFetch([{ status: 200, json: { ok: true, ts: '1.2' } }, { status: 200, json: { ok: true, messages: [{ user: 'U1', text: 'a', ts: '1.3' }] } }, { status: 200, json: { ok: false, error: 'not_authed' } }]);
  const slack = createSlack({ token: 'xoxb-1', fetch });
  assert.equal(await slack.post('hi', '1.0'), '1.2');
  assert.deepEqual(JSON.parse(fetch.seen[0].body), { channel: 'D0ASX9ML4G6', text: 'hi', thread_ts: '1.0' });
  assert.deepEqual(await slack.replies('1.0'), [{ user: 'U1', text: 'a', ts: '1.3' }]);
  await assert.rejects(slack.replies('1.0'), /Slack not_authed/);
});
