// T7. Spec: docs/sdd/ols-real/spec.md R1, R7, R9, E1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJiraCreds, createJira } from './jira.mjs';
import { loadSlackToken, createSlack, markupProblem } from './slack.mjs';

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

test('ols-retest-procedure R8, R9: state reads status, QA Owner, TC Status and assignee; readComment and mention', async () => {
  const fetch = fakeFetch([
    { status: 200, json: { fields: { status: { name: 'Testing' }, customfield_12120: { displayName: 'QA A', accountId: 'qa-1' }, customfield_12128: { value: 'QA REVIEWED' }, assignee: { accountId: 'dev-1' } } } },
    { status: 200, json: { id: '77' } },
    { status: 404, json: {} },
    { status: 201, json: { id: '78' } },
  ]);
  const jira = createJira({ creds: SECRET, fetch });
  assert.deepEqual(await jira.state('OLS-1'), { status: 'Testing', qaOwner: 'QA A', tcStatus: 'QA REVIEWED', assignee: 'dev-1' });
  const u = new URL(fetch.seen[0].url);
  assert.deepEqual([fetch.seen[0].method, u.pathname, u.searchParams.get('fields')], ['GET', '/rest/api/3/issue/OLS-1', 'status,assignee,customfield_12120,customfield_12128']);
  assert.deepEqual(await jira.readComment('OLS-1', '77'), { id: '77' });
  assert.equal(new URL(fetch.seen[1].url).pathname, '/rest/api/3/issue/OLS-1/comment/77');
  assert.equal(await jira.readComment('OLS-1', '99'), null, 'a missing comment reads as null');
  assert.deepEqual(await jira.mention('OLS-1', 'po-1', 'รอ PO CF: AC2'), { id: '78' });
  const body = JSON.parse(fetch.seen[3].body).body;
  assert.equal(fetch.seen[3].method, 'POST');
  assert.deepEqual(body.content[0].content.slice(0, 2), [{ type: 'mention', attrs: { id: 'po-1' } }, { type: 'text', text: ' รอ PO CF: AC2' }]);
});

test('R17: the issue read for ticket.json is one GET with every field and the field names', async () => {
  const fetch = fakeFetch([{ status: 200, json: { key: 'OLS-910', names: {}, fields: {} } }]);
  const jira = createJira({ creds: SECRET, fetch });
  const issue = await jira.issue('OLS-910');
  assert.equal(issue.key, 'OLS-910');
  assert.equal(fetch.seen.length, 1);
  assert.equal(fetch.seen[0].method, 'GET');
  const u = new URL(fetch.seen[0].url);
  assert.equal(u.pathname, '/rest/api/3/issue/OLS-910');
  // ols-retest-procedure R1: the description's change history comes with the issue
  assert.equal(u.searchParams.get('expand'), 'names,changelog');
  assert.equal(u.searchParams.get('fields'), '*all,-comment');
});

test('R17: comments come from the comment endpoint, newest first, 50 at most, GET only', async () => {
  const fetch = fakeFetch([{ status: 200, json: { comments: [{ id: '9' }], total: 120 } }]);
  const jira = createJira({ creds: SECRET, fetch });
  assert.deepEqual(await jira.comments('OLS-910'), { comments: [{ id: '9' }], total: 120 });
  const u = new URL(fetch.seen[0].url);
  assert.equal(fetch.seen[0].method, 'GET');
  assert.equal(u.pathname, '/rest/api/3/issue/OLS-910/comment');
  assert.equal(u.searchParams.get('orderBy'), '-created');
  assert.equal(u.searchParams.get('maxResults'), '50');
});

test('R17: a Jira response over 5 MB is refused without parsing it, by header or by size', async () => {
  const big = 'x'.repeat(5 * 1024 * 1024 + 1);
  const bodyFetch = async () => ({ ok: true, status: 200, headers: new Map(), text: async () => big, json: async () => { throw new Error('json() must not be used'); } });
  await assert.rejects(createJira({ creds: SECRET, fetch: bodyFetch }).issue('OLS-1'), /Jira response over 5 MB on \/rest\/api\/3\/issue\/OLS-1/);
  let read = false;
  const headFetch = async () => ({ ok: true, status: 200, headers: new Map([['content-length', String(big.length)]]), text: async () => ((read = true), '{}') });
  await assert.rejects(createJira({ creds: SECRET, fetch: headFetch }).comments('OLS-1'), /over 5 MB/);
  assert.equal(read, false);
});

test('R7: slack posts into the DM channel thread and reads replies; an API error throws', async () => {
  const fetch = fakeFetch([{ status: 200, json: { ok: true, ts: '1.2' } }, { status: 200, json: { ok: true, messages: [{ user: 'U1', text: 'a', ts: '1.3' }] } }, { status: 200, json: { ok: false, error: 'not_authed' } }]);
  const slack = createSlack({ token: 'xoxb-1', fetch });
  assert.equal(await slack.post('hi', '1.0'), '1.2');
  assert.deepEqual(JSON.parse(fetch.seen[0].body), { channel: 'D0ASX9ML4G6', text: 'hi', thread_ts: '1.0' });
  assert.deepEqual(await slack.replies('1.0'), [{ user: 'U1', text: 'a', ts: '1.3' }]);
  await assert.rejects(slack.replies('1.0'), /Slack not_authed/);
});

test('ols-retest-procedure R5: Jira wiki markup never reaches Slack, by post or by update', async () => {
  for (const t of ['|| AC || ผล ||', 'บรรทัด 1\\\\บรรทัด 2', 'ดูรูป !shot.png|thumbnail!', '!capture!']) {
    assert.ok(markupProblem(t), t);
    assert.equal(markupProblem(markupProblem(t)), null, 'the reason itself may be posted in a failure notice');
    const fetch = fakeFetch([]);
    const slack = createSlack({ token: 'xoxb-1', fetch });
    await assert.rejects(slack.post(t), /Jira wiki markup/);
    await assert.rejects(slack.update('1.2', t), /Jira wiki markup/);
    assert.equal(fetch.seen.length, 0, 'nothing is sent');
  }
  for (const t of ['ผ่าน 5/5 ครับ!', 'AC1 ✅ ผ่าน | AC2 ❌', 'path a\\b', 'passed! ok!']) assert.equal(markupProblem(t), null, t);
});

test('ols-retest-procedure R6: once a ticket has a thread, a post outside it is refused', async () => {
  const threads = { 'OLS-5': '1.0' };
  const fetch = fakeFetch([{ status: 200, json: { ok: true, ts: '1.5' } }, { status: 200, json: { ok: true, ts: '2.0' } }]);
  const slack = createSlack({ token: 'xoxb-1', fetch });
  await assert.rejects(slack.post('ผล', undefined, { key: 'OLS-5', threads }), /OLS-5 already has thread 1\.0/);
  await assert.rejects(slack.post('ผล', '9.9', { key: 'OLS-5', threads }), /OLS-5 already has thread 1\.0/);
  assert.equal(fetch.seen.length, 0);
  assert.equal(await slack.post('ผล', '1.0', { key: 'OLS-5', threads }), '1.5');
  // the first message of a ticket opens its thread
  assert.equal(await slack.post('ร่างแรก', undefined, { key: 'OLS-6', threads }), '2.0');
  assert.equal(threads['OLS-6'], '2.0');
});

test('ols-retest-procedure R6, R9: update edits the sent message with chat.update; readBack finds it in the thread', async () => {
  const fetch = fakeFetch([
    { status: 200, json: { ok: true, ts: '1.2' } },
    { status: 200, json: { ok: true, messages: [{ user: 'B', text: 'หัว', ts: '1.0' }, { user: 'B', text: 'ผ่าน &amp; ไม่ผ่าน &lt;1&gt;', ts: '1.2' }] } },
    { status: 200, json: { ok: true, messages: [{ user: 'B', text: 'อื่น', ts: '1.2' }] } },
  ]);
  const slack = createSlack({ token: 'xoxb-1', fetch });
  assert.equal(await slack.update('1.2', 'ผ่าน & ไม่ผ่าน <1>'), '1.2');
  assert.equal(new URL(fetch.seen[0].url).pathname, '/api/chat.update');
  assert.deepEqual([fetch.seen[0].method, JSON.parse(fetch.seen[0].body)], ['POST', { channel: 'D0ASX9ML4G6', ts: '1.2', text: 'ผ่าน & ไม่ผ่าน <1>' }]);
  assert.deepEqual(await slack.readBack('1.0', '1.2', 'ผ่าน & ไม่ผ่าน <1>'), { ok: true, ts: '1.2' });
  assert.deepEqual(await slack.readBack('1.0', '1.2', 'ผ่าน & ไม่ผ่าน <1>'), { ok: false, ts: '1.2', error: 'message 1.2 in thread 1.0 does not read back as sent' });
});
