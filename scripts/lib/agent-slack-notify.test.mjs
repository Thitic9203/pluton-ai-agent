// Tests of scripts/agent/slack-notify.mjs (plan row 14 of
// docs/superpowers/plans/always-on-dev-agent.md, economy plan section 8). Every Slack call goes to
// a fake fetch: no test reaches the network, and no message is ever really sent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANNEL,
  EVENTS,
  eventFromIssue,
  findThread,
  messageFor,
  notify,
  parseArgs,
  runSlackNotify,
  threadMarker,
} from '../agent/slack-notify.mjs';

const TOKEN = 'xoxb-test-token-never-logged';
const BOT = 'taskfolio-agent[bot]';
const ISSUE = { number: 42, title: 'Export <b>&</b> pager', html_url: 'https://github.com/o/r/issues/42' };
const OWNER = 'U0OWNER01';
const QA = 'U0QALEAD1';

const appComment = (body, at = '2026-10-15T01:00:00Z') => ({ body, created_at: at, user: { login: BOT, type: 'Bot' } });

/** A fake Slack: records every request and answers chat.postMessage with increasing ts values. */
function fakeSlack({ fail } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (fail) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: false, error: fail }) };
    n += 1;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, ts: `1760000000.00000${n}` }) };
  };
  return { calls, fetchImpl };
}

/** A fake GitHub api with the shape of api() in scripts/agent/cli.mjs. */
function fakeGh(comments = []) {
  const posted = [];
  return {
    posted,
    get: async (p) => {
      if (p === '/repos/{repo}/issues/42') return ISSUE;
      throw new Error(`unexpected GET ${p}`);
    },
    all: async (p) => {
      if (p.startsWith('/repos/{repo}/issues/42/comments')) return comments;
      throw new Error(`unexpected list ${p}`);
    },
    post: async (p, b) => {
      posted.push({ path: p, body: b });
      return { id: 1 };
    },
  };
}

test('the channel is the one the owner named, and every moment of row 14 is an event', () => {
  assert.equal(CHANNEL, 'C0C8TSRK1PE');
  /* The mock notice left on 17 Oct 2026 (docs/sdd/remove-mock-first R10). */
  assert.deepEqual([...EVENTS], ['started', 'gate1', 'gate2', 'merged', 'release', 'blocked', 'done']);
});

test('the thread marker round-trips, and only an App comment for this channel counts', () => {
  const marker = threadMarker(CHANNEL, '1760000000.000100');
  assert.equal(marker, '<!-- agent-slack-thread channel=C0C8TSRK1PE ts=1760000000.000100 -->');
  const comments = [
    { body: threadMarker(CHANNEL, '1111111111.000001'), created_at: '2026-10-15T00:00:00Z', user: { login: 'someone', type: 'User' } },
    { body: threadMarker(CHANNEL, '2222222222.000002'), created_at: '2026-10-15T00:00:01Z', user: { login: BOT, type: 'User' } },
    appComment(threadMarker('C0OTHER000', '3333333333.000003'), '2026-10-15T00:00:02Z'),
    appComment(`Slack thread\n\n${marker}`, '2026-10-15T00:00:04Z'),
    appComment(threadMarker(CHANNEL, '1760000099.000001'), '2026-10-15T00:00:09Z'),
  ];
  assert.equal(findThread(comments, BOT), '1760000000.000100');
  assert.equal(findThread([], BOT), null);
  assert.equal(findThread(comments, ''), null);
});

test('a malformed marker is not a thread', () => {
  assert.equal(findThread([appComment('<!-- agent-slack-thread channel=C0C8TSRK1PE ts=abc -->')], BOT), null);
});

test('every message is Thai, polite, and names the issue number with its link', () => {
  for (const event of EVENTS) {
    const text = messageFor({ event, issue: ISSUE, ownerId: OWNER, qaLeadId: QA, detail: 'npm ci exited 1', pr: 77 });
    assert.match(text, /<https:\/\/github\.com\/o\/r\/issues\/42\|#42>/, event);
    assert.match(text, /ครับ/, event);
  }
});

test('the owner is mentioned only at gate 1, gate 2 and blocked; the QA Lead only at release', () => {
  const mentions = Object.fromEntries(EVENTS.map((event) => {
    const text = messageFor({ event, issue: ISSUE, ownerId: OWNER, qaLeadId: QA, detail: 'x', pr: 77 });
    return [event, [text.includes(`<@${OWNER}>`), text.includes(`<@${QA}>`)]];
  }));
  assert.deepEqual(mentions, {
    started: [false, false],
    gate1: [true, false],
    gate2: [true, false],
    merged: [false, false],
    release: [false, true],
    blocked: [true, false],
    done: [false, false],
  });
});

test('a mention id that is not a Slack user id is left out, never posted as text', () => {
  const text = messageFor({ event: 'gate1', issue: ISSUE, ownerId: '<!channel>', qaLeadId: QA });
  assert.doesNotMatch(text, /<!channel>|<@/);
});

test('each gate message names the GitHub command the gate counts', () => {
  assert.match(messageFor({ event: 'gate1', issue: ISSUE }), /\/approve-plan/);
  assert.match(messageFor({ event: 'gate2', issue: ISSUE }), /\/approve-tests/);
  assert.throws(() => messageFor({ event: 'mock', issue: ISSUE }), 'no mock notice is sent any more');
});

test('the title and the detail are escaped and kept to one line', () => {
  const started = messageFor({ event: 'started', issue: ISSUE });
  assert.match(started, /Export &lt;b&gt;&amp;&lt;\/b&gt; pager/);
  const blocked = messageFor({ event: 'blocked', issue: ISSUE, detail: 'line one <!here>\nline two' });
  assert.match(blocked, /line one &lt;!here&gt; line two/);
  assert.doesNotMatch(blocked, /\n/);
});

test('merged names its pull request, and blocked refuses to post without the error line', () => {
  assert.match(messageFor({ event: 'merged', issue: ISSUE, pr: 77 }), /PR #77/);
  assert.throws(() => messageFor({ event: 'merged', issue: ISSUE }), /--pr/);
  assert.throws(() => messageFor({ event: 'blocked', issue: ISSUE }), /--detail/);
  assert.throws(() => messageFor({ event: 'nope', issue: ISSUE }), /unknown event/);
});

test('the first moment opens the thread in the channel and leaves the marker on the issue', async () => {
  const slack = fakeSlack();
  const gh = fakeGh([]);
  const logs = [];
  const out = await notify({ event: 'started', issueNumber: 42, gh, token: TOKEN, botLogin: BOT, fetchImpl: slack.fetchImpl, log: (l) => logs.push(l) });
  assert.equal(slack.calls.length, 1);
  assert.equal(slack.calls[0].url, 'https://slack.com/api/chat.postMessage');
  assert.equal(slack.calls[0].body.channel, CHANNEL);
  assert.equal('thread_ts' in slack.calls[0].body, false);
  assert.deepEqual(out, { threadTs: '1760000000.000001', ts: '1760000000.000001', opened: true });
  assert.equal(gh.posted.length, 1);
  assert.equal(gh.posted[0].path, '/repos/{repo}/issues/42/comments');
  assert.equal(findThread([appComment(gh.posted[0].body.body)], BOT), '1760000000.000001');
  assert.ok(logs.length > 0);
  for (const line of logs) assert.doesNotMatch(line, /xoxb/);
});

test('a later moment, in a later workflow run, replies in the stored thread and posts no marker', async () => {
  const slack = fakeSlack();
  const gh = fakeGh([appComment(threadMarker(CHANNEL, '1760000000.000001'))]);
  const out = await notify({ event: 'gate1', issueNumber: 42, gh, token: TOKEN, botLogin: BOT, ownerId: OWNER, fetchImpl: slack.fetchImpl, log: () => {} });
  assert.equal(slack.calls.length, 1);
  assert.equal(slack.calls[0].body.channel, CHANNEL);
  assert.equal(slack.calls[0].body.thread_ts, '1760000000.000001');
  assert.match(slack.calls[0].body.text, /Gate 1/);
  assert.equal(out.opened, false);
  assert.equal(out.threadTs, '1760000000.000001');
  assert.equal(gh.posted.length, 0);
});

test('the token travels only in the authorization header, never in a body or a log line', async () => {
  const slack = fakeSlack();
  const logs = [];
  await notify({ event: 'started', issueNumber: 42, gh: fakeGh([]), token: TOKEN, botLogin: BOT, fetchImpl: slack.fetchImpl, log: (l) => logs.push(l) });
  assert.equal(slack.calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  assert.doesNotMatch(slack.calls[0].init.body, /xoxb/);
  for (const line of logs) assert.doesNotMatch(line, /xoxb/);
});

test('a Slack refusal throws with the method and error code, never the token, and leaves no marker', async () => {
  const slack = fakeSlack({ fail: 'not_in_channel' });
  const gh = fakeGh([]);
  await assert.rejects(
    notify({ event: 'started', issueNumber: 42, gh, token: TOKEN, botLogin: BOT, fetchImpl: slack.fetchImpl, log: () => {} }),
    (err) => /chat\.postMessage: not_in_channel/.test(err.message) && !err.message.includes('xoxb'),
  );
  assert.equal(gh.posted.length, 0);
});

test('arguments: --issue is a positive integer and --event one of the moments', () => {
  assert.deepEqual(parseArgs(['--issue=42', '--event=merged', '--pr=77']), { issue: 42, event: 'merged', pr: 77, detail: '' });
  assert.deepEqual(parseArgs(['--issue=7', '--event=blocked', '--detail=a=b']), { issue: 7, event: 'blocked', pr: null, detail: 'a=b' });
  assert.throws(() => parseArgs(['--issue=0', '--event=started']), /--issue/);
  assert.throws(() => parseArgs(['--issue=4x', '--event=started']), /--issue/);
  assert.throws(() => parseArgs(['--issue=4', '--event=party']), /--event/);
  assert.throws(() => parseArgs(['--issue=4', '--event=merged', '--pr=x']), /--pr/);
});

test('without SLACK_BOT_TOKEN the command posts nothing and says so as a workflow warning', async () => {
  const slack = fakeSlack();
  const logs = [];
  const res = await runSlackNotify({ AGENT_APP_LOGIN: BOT }, fakeGh([]), {}, ['--issue=42', '--event=started'], { fetchImpl: slack.fetchImpl, log: (l) => logs.push(l) });
  assert.deepEqual(res, { exit: 0, outputs: { slack_posted: 'false' } });
  assert.equal(slack.calls.length, 0);
  assert.ok(logs.some((l) => l.startsWith('::warning::') && l.includes('SLACK_BOT_TOKEN')));
});

test('with the token the command posts and reports the thread as outputs', async () => {
  const slack = fakeSlack();
  const res = await runSlackNotify(
    { AGENT_APP_LOGIN: BOT, SLACK_BOT_TOKEN: TOKEN, SLACK_OWNER_ID: OWNER },
    fakeGh([appComment(threadMarker(CHANNEL, '1760000000.000009'))]),
    {},
    ['--issue=42', '--event=blocked', '--detail=npm ci exited 1'],
    { fetchImpl: slack.fetchImpl, log: () => {} },
  );
  assert.deepEqual(res, { exit: 0, outputs: { slack_posted: 'true', slack_thread_ts: '1760000000.000009' } });
  assert.match(slack.calls[0].body.text, new RegExp(`<@${OWNER}>`));
});

// After the agent step, the moment is read from the issue: the agent's agent:* label says which gate
// waits, and for agent:blocked its own latest comment holds the real error. A comment that says it
// waits for the mock publish was a mock notice until 17 Oct 2026 (docs/sdd/remove-mock-first R10); it is a plain block now.
test('auto: the label names the moment, and blocked carries the agent\'s latest comment as its one line', () => {
  const lab = (...names) => ({ labels: names.map((name) => ({ name })) });
  assert.deepEqual(eventFromIssue({ issue: lab('agent:planning'), comments: [], botLogin: BOT }), { event: 'gate1', detail: '' });
  assert.deepEqual(eventFromIssue({ issue: lab('agent:test-planning'), comments: [], botLogin: BOT }), { event: 'gate2', detail: '' });
  const comments = [
    appComment('older', '2026-10-15T01:00:00Z'),
    { body: 'from someone', created_at: '2026-10-15T03:00:00Z', user: { login: 'someone', type: 'User' } },
    appComment('npm ci exited 1: usage limit\nmore', '2026-10-15T02:00:00Z'),
  ];
  assert.deepEqual(eventFromIssue({ issue: lab('agent:blocked'), comments, botLogin: BOT }), { event: 'blocked', detail: 'npm ci exited 1: usage limit' });
  const mock = [appComment('Mock committed, waiting for the mock publish.')];
  assert.deepEqual(eventFromIssue({ issue: lab('agent:blocked'), comments: mock, botLogin: BOT }), { event: 'blocked', detail: 'Mock committed, waiting for the mock publish.' });
  assert.equal(eventFromIssue({ issue: lab('agent:blocked'), comments: [], botLogin: BOT }).detail, 'agent:blocked, no comment from the agent yet');
  assert.equal(eventFromIssue({ issue: lab('agent:building'), comments: [], botLogin: BOT }), null);
  assert.equal(eventFromIssue({ issue: lab('agent:in-review'), comments: [], botLogin: BOT }), null);
});

test('auto: a run whose issue waits on no gate posts nothing', async () => {
  const slack = fakeSlack();
  const gh = fakeGh([]);
  const out = await notify({ event: 'auto', issueNumber: 42, gh, token: TOKEN, botLogin: BOT, fetchImpl: slack.fetchImpl, log: () => {} });
  assert.equal(out, null);
  assert.equal(slack.calls.length, 0);
  assert.deepEqual(parseArgs(['--issue=42', '--event=auto']).event, 'auto');
});

// Reviewer finding on 29e5221f1: the gate notices are sent from the issues labeled event itself, so a
// crashed agent job or a label set by another job is still announced. The label just added names the
// moment; other agent:* labels the issue still carries do not.
test('auto with --label: only the label just added names the moment', async () => {
  const lab = (...names) => ({ labels: names.map((name) => ({ name })) });
  const both = lab('agent:blocked', 'agent:planning');
  assert.deepEqual(eventFromIssue({ issue: both, comments: [], botLogin: BOT, label: 'agent:planning' }), { event: 'gate1', detail: '' });
  assert.deepEqual(eventFromIssue({ issue: both, comments: [], botLogin: BOT, label: 'agent:test-planning' }), { event: 'gate2', detail: '' });
  const mock = [appComment('Mock committed, waiting for the mock publish.')];
  assert.deepEqual(eventFromIssue({ issue: both, comments: mock, botLogin: BOT, label: 'agent:blocked' }), { event: 'blocked', detail: 'Mock committed, waiting for the mock publish.' });
  assert.equal(eventFromIssue({ issue: both, comments: [], botLogin: BOT, label: 'agent:building' }), null);
  assert.deepEqual(parseArgs(['--issue=42', '--event=auto', '--label=agent:planning']).label, 'agent:planning');
  assert.throws(() => parseArgs(['--issue=42', '--event=gate1', '--label=agent:planning']), /--label/);
  assert.throws(() => parseArgs(['--issue=42', '--event=auto', '--label=ready']), /--label/);
  const slack = fakeSlack();
  const res = await runSlackNotify(
    { AGENT_APP_LOGIN: BOT, SLACK_BOT_TOKEN: TOKEN, SLACK_OWNER_ID: OWNER },
    fakeGh([appComment(threadMarker(CHANNEL, '1760000000.000009'))]),
    {},
    ['--issue=42', '--event=auto', '--label=agent:test-planning'],
    { fetchImpl: slack.fetchImpl, log: () => {} },
  );
  assert.equal(res.outputs.slack_posted, 'true');
  assert.match(slack.calls[0].body.text, /Gate 2/);
});
