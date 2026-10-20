// T12: the GET-only GitHub client the snapshot step uses (spec R2 to R4, R7, R8, R43, E1, E5).
// Run: TZ=UTC node --test agent-office/lib/github.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGitHubClient, GitHubError, GitHubRateLimitError } from './github.mjs';

const TOKEN = 'ghs_fixtureTokenValue1234567890';
const API = 'https://api.github.com';

/** A fake fetch that records every call and fails the test on anything but GET. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ url: String(url), method, headers: init.headers ?? {} });
    assert.equal(method, 'GET', `the client sent ${method} ${url}`);
    assert.equal(init.body, undefined, 'a GET carries no body');
    const route = routes(String(url));
    if (!route) throw new Error(`no route for ${url}`);
    const { status = 200, body = [], headers = {} } = route;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  return { fn, calls };
}

const issue = (n, extra = {}) => ({ number: n, title: `t${n}`, state: 'open', labels: [{ name: 'agent:ready' }], created_at: '2026-10-16T00:00:00Z', ...extra });

test('R43: every request is a GET with the token in Authorization, never in the URL', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [issue(1)] }));
  const gh = createGitHubClient({ token: TOKEN, fetch: fn });
  await gh.openIssues('Thitic9203/pluton-timesheet');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!calls[0].url.includes(TOKEN));
  assert.ok(calls[0].url.startsWith(`${API}/repos/Thitic9203/pluton-timesheet/issues?`));
  assert.match(calls[0].url, /state=open/);
  assert.match(calls[0].url, /per_page=100/);
});

test('E5: 150 open issues over two pages are read in full, and pull requests are left out', async () => {
  const all = Array.from({ length: 150 }, (_, i) => issue(i + 1));
  const page2 = `${API}/repositories/1/issues?state=open&per_page=100&page=2`;
  const { fn, calls } = fakeFetch((url) =>
    url === page2
      ? { body: [...all.slice(100), { number: 999, pull_request: { url: 'x' }, labels: [] }] }
      : { body: all.slice(0, 100), headers: { link: `<${page2}>; rel="next", <${page2}>; rel="last"` } },
  );
  const got = await createGitHubClient({ token: TOKEN, fetch: fn }).openIssues('Thitic9203/pluton-timesheet');
  assert.equal(calls.length, 2);
  assert.equal(got.length, 150);
  assert.deepEqual(got.map((i) => i.number), all.map((i) => i.number));
});

test('E5: a Link to another host is refused, so the token never leaves api.github.com', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [issue(1)], headers: { link: '<https://evil.example/next>; rel="next"' } }));
  await assert.rejects(createGitHubClient({ token: TOKEN, fetch: fn }).openIssues('a/b'), GitHubError);
  assert.equal(calls.length, 1);
});

test('E1: 403 with no remaining quota is a typed rate-limit error with the reset time', async () => {
  const { fn } = fakeFetch(() => ({ status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792000000' } }));
  const err = await createGitHubClient({ token: TOKEN, fetch: fn }).openIssues('a/b').catch((e) => e);
  assert.ok(err instanceof GitHubRateLimitError, String(err));
  assert.equal(err.status, 403);
  assert.equal(err.resetAt, new Date(1792000000 * 1000).toISOString());
});

test('E1: 429 is a rate-limit error too; another 403 is a plain GitHubError', async () => {
  const r429 = await createGitHubClient({ token: TOKEN, fetch: fakeFetch(() => ({ status: 429, body: {} })).fn }).openIssues('a/b').catch((e) => e);
  assert.ok(r429 instanceof GitHubRateLimitError);
  const r403 = await createGitHubClient({ token: TOKEN, fetch: fakeFetch(() => ({ status: 403, body: { message: 'Resource not accessible' }, headers: { 'x-ratelimit-remaining': '900' } })).fn })
    .openIssues('a/b')
    .catch((e) => e);
  assert.ok(r403 instanceof GitHubError);
  assert.ok(!(r403 instanceof GitHubRateLimitError));
});

test('R41: the token appears in no error message, even when GitHub echoes it back', async () => {
  const { fn } = fakeFetch(() => ({ status: 500, body: { message: `bad ${TOKEN}` } }));
  const err = await createGitHubClient({ token: TOKEN, fetch: fn }).openIssues('a/b').catch((e) => e);
  assert.ok(err instanceof GitHubError);
  assert.ok(!String(err.message).includes(TOKEN));
  assert.ok(!JSON.stringify(err).includes(TOKEN));
  assert.ok(!String(err.stack).includes(TOKEN));
});

test('R4: the timeline of one issue is read with its own path, paged', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [{ event: 'labeled', label: { name: 'agent:blocked' }, created_at: '2026-10-16T01:00:00Z' }] }));
  const got = await createGitHubClient({ token: TOKEN, fetch: fn }).timeline('a/b', 7);
  assert.equal(got.length, 1);
  assert.ok(calls[0].url.startsWith(`${API}/repos/a/b/issues/7/timeline?`));
});

test('R3: closed pull requests into the release branch, the branch name encoded', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [{ number: 9, merged_at: '2026-10-16T00:00:00Z', head: { ref: 'agent/issue-7' }, base: { ref: 'release/next' } }] }));
  const got = await createGitHubClient({ token: TOKEN, fetch: fn }).releasePulls('a/b', 'release/next');
  assert.equal(got.length, 1);
  assert.match(calls[0].url, /\/repos\/a\/b\/pulls\?state=closed&base=release%2Fnext&per_page=100/);
});

test('R7, R8: in-progress runs of one workflow come out of the workflow_runs envelope, paged', async () => {
  const page2 = `${API}/repos/a/b/actions/workflows/agent-sweep.yml/runs?status=in_progress&per_page=100&page=2`;
  const { fn, calls } = fakeFetch((url) =>
    url === page2
      ? { body: { total_count: 2, workflow_runs: [{ id: 2 }] } }
      : { body: { total_count: 2, workflow_runs: [{ id: 1 }] }, headers: { link: `<${page2}>; rel="next"` } },
  );
  const got = await createGitHubClient({ token: TOKEN, fetch: fn }).runsInProgress('a/b', 'agent-sweep.yml');
  assert.deepEqual(got.map((r) => r.id), [1, 2]);
  assert.equal(calls.length, 2);
});

test('R43: a repository or workflow name outside the expected shape is refused before any call', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [] }));
  const gh = createGitHubClient({ token: TOKEN, fetch: fn });
  await assert.rejects(gh.openIssues('a/b/../../user'), GitHubError);
  await assert.rejects(gh.runsInProgress('a/b', '../x'), GitHubError);
  await assert.rejects(gh.timeline('a/b', 'x'), GitHubError);
  assert.equal(calls.length, 0);
});

test('R43: the module names no write method and no write endpoint', () => {
  const src = readFileSync(new URL('./github.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(src, /method\s*:/);
  assert.doesNotMatch(src, /\/(merge|comments|labels|dispatches|reviews|git\/refs)\b/);
});

test('a client with no token refuses to start', () => {
  assert.throws(() => createGitHubClient({ token: '', fetch: async () => new Response('[]') }), GitHubError);
});

test('T36, R43, E5: history(path) is one GET of a repository path, every page merged, envelopes kept', async () => {
  const R = `${API}/repos/a/b/actions/runs/1/jobs?filter=all&per_page=100`;
  const { fn, calls } = fakeFetch((url) => {
    if (url === R) return { body: { total_count: 2, jobs: [{ id: 1 }] }, headers: { link: `<${R}&page=2>; rel="next"` } };
    if (url === `${R}&page=2`) return { body: { total_count: 2, jobs: [{ id: 2 }] } };
    if (url.startsWith(`${API}/repos/a/b/issues/3/comments`)) return url.includes('page=2') ? { body: [{ id: 6 }] } : { body: [{ id: 5 }], headers: { link: `<${API}/repos/a/b/issues/3/comments?per_page=100&page=2>; rel="next"` } };
    return null;
  });
  const gh = createGitHubClient({ token: TOKEN, fetch: fn });
  assert.deepEqual(await gh.history('/repos/a/b/actions/runs/1/jobs?filter=all&per_page=100'), { total_count: 2, jobs: [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(await gh.history('/repos/a/b/issues/3/comments?per_page=100'), [{ id: 5 }, { id: 6 }]);
  assert.ok(calls.every((c) => c.method === 'GET'));
  assert.equal(calls.length, 4);
});

test('T36, R43: history(path) refuses a path outside /repos/owner/name before any request', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: [] }));
  const gh = createGitHubClient({ token: TOKEN, fetch: fn });
  for (const p of ['/user', 'https://evil.example/repos/a/b/issues', '/repos/a/b/../../user', '/repos/a/b/issues?x=<y>', '/repos/a']) {
    await assert.rejects(gh.history(p), GitHubError, p);
  }
  assert.equal(calls.length, 0);
});

test('R73: the client keeps at most 6 requests in flight and still answers every one', async () => {
  let now = 0, peak = 0;
  const fetchFn = async () => {
    now++; peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
    return new Response(JSON.stringify({ jobs: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createGitHubClient({ token: TOKEN, fetch: fetchFn });
  const out = await Promise.all(Array.from({ length: 40 }, (_, i) => client.history(`/repos/Thitic9203/pluton-timesheet/actions/runs/${i}/jobs`)));
  assert.equal(out.length, 40);
  assert.ok(peak <= 6, `peak ${peak} requests in flight`);
  assert.ok(peak > 1, 'reads still overlap');
});

test('R73: under the limit, a two-page read still returns every page in order', async () => {
  let now = 0, peak = 0;
  const fetchFn = async (url) => {
    now++; peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 3));
    now--;
    const u = new URL(String(url)), page = u.searchParams.get('page');
    const headers = { 'content-type': 'application/json' };
    if (!page) headers.link = `<${u.origin}${u.pathname}?page=2>; rel="next"`;
    return new Response(JSON.stringify({ jobs: [page ? 'b' : 'a'] }), { status: 200, headers });
  };
  const client = createGitHubClient({ token: TOKEN, fetch: fetchFn });
  const out = await Promise.all(Array.from({ length: 12 }, (_, i) => client.history(`/repos/Thitic9203/pluton-timesheet/actions/runs/${i}/jobs`)));
  for (const r of out) assert.deepEqual(r.jobs, ['a', 'b']);
  assert.ok(peak <= 6, `peak ${peak}`);
});

test('R73: a failed connection names its inner cause, never the token', async () => {
  const fetchFn = async () => { throw new TypeError('fetch failed', { cause: new Error(`read ECONNRESET ${TOKEN}`) }); };
  const client = createGitHubClient({ token: TOKEN, fetch: fetchFn });
  await assert.rejects(client.history('/repos/Thitic9203/pluton-timesheet/actions/runs/1/jobs'), (e) => {
    assert.match(e.message, /fetch failed: read ECONNRESET/);
    assert.doesNotMatch(e.message, new RegExp(TOKEN));
    return true;
  });
});
