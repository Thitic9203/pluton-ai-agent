// T20: the probe that judges a fresh Agent Office deployment once it serves the sha it published
// (docs/sdd/agent-office-live/spec.md R42, R43, R46, R65).
// Run: TZ=UTC node --test scripts/lib/agent-office-smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoke } from './agent-office-smoke.mjs';

const SHA = 'b'.repeat(40);
const URL0 = 'https://abc123.agent-office-staging.pages.dev';

/** A fake deployment: `ready` after `after` version reads; `wrong` overrides one probe's status. */
function site({ after = 0, wrong = {}, fnLate = 0, flaps = [], env = { firebase: { apiKey: `AIza${"x".repeat(35)}`, projectId: "taskfolio-staging" } } } = {}) {
  let versionReads = 0;
  let dataReads = 0;
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const origin = new Headers(init.headers).get('Origin');
    calls.push(`${method} ${u.pathname}${origin ? ` ${origin}` : ''}`);
    if (u.pathname === '/version.txt') {
      versionReads++;
      return new Response(versionReads > after ? `${SHA}\n` : `${'a'.repeat(40)}\n`, { status: 200 });
    }
    const key = `${method} ${u.pathname}${origin ? ' origin' : ''}`;
    if (wrong[key]) return new Response('', { status: wrong[key] });
    if (u.pathname === '/data/state.json') {
      dataReads++;
      if (dataReads <= fnLate) return new Response('', { status: 404 });
      if (flaps.includes(dataReads)) return new Response('', { status: 404 });
      if (origin) return new Response('', { status: 403 });
      return new Response('', { status: method === 'GET' ? 401 : 405 });
    }
    if (u.pathname === '/app/env.json' && env) return new Response(JSON.stringify(env), { status: 200 });
    return new Response('<html>', { status: 200 });
  };
  return { fetch, calls };
}

test('a deployment that serves its sha and refuses what it must passes', async () => {
  const s = site({ after: 2 });
  const lines = await smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {}, attempts: 5 });
  assert.ok(lines.some((l) => /serves b{40}/.test(l)));
  assert.deepEqual(s.calls.filter((c) => !c.includes('version')), ['GET /data/state.json', 'GET /data/state.json', 'GET /data/state.json', 'GET /', 'GET /data/state.json', 'POST /data/state.json', 'GET /data/state.json https://evil.example', 'GET /app/env.json']);
});

test('a deployment that never serves its sha fails without judging anything else', async () => {
  const s = site({ after: 99 });
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {}, attempts: 3 }), /did not serve b{40}/);
  assert.ok(s.calls.every((c) => c.includes('version')));
});

test('R42: a snapshot served without a token fails', async () => {
  const s = site({ wrong: { 'GET /data/state.json': 200 } });
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {} }), /without a token answered 200, want 401/);
});

test('R43: a POST that is not refused, and a foreign origin that is not refused, fail', async () => {
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: site({ wrong: { 'POST /data/state.json': 200 } }).fetch, sleep: async () => {} }), /POST .* answered 200, want 405/);
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: site({ wrong: { 'GET /data/state.json origin': 401 } }).fetch, sleep: async () => {} }), /another origin answered 401, want 403/);
});

test('a URL that is not one pages.dev deployment of these projects is refused before any request', async () => {
  const s = site();
  await assert.rejects(smoke({ url: 'https://evil.example', sha: SHA, fetch: s.fetch, sleep: async () => {} }), /not an Agent Office deployment/);
  assert.deepEqual(s.calls, []);
});

test('the Functions bundle can go live after the static files: 404 on the snapshot is waited out, then judged once (run 38891019005)', async () => {
  const s = site({ fnLate: 2 });
  const lines = await smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {}, attempts: 5 });
  assert.ok(lines.some((l) => /answers from its middleware/.test(l)));
});

test('a deployment whose middleware never answers fails after the bound, with no probe judged', async () => {
  const s = site({ fnLate: 99 });
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {}, attempts: 3 }), /did not answer from its middleware 3 times in a row at \/data\/state\.json within 3 reads/);
  assert.equal(s.calls.filter((c) => c === 'GET /').length, 0);
});

test('a deployment that answers, then 404s, then answers is waited out until three answers in a row (run 38896358612)', async () => {
  const s = site({ flaps: [2] });
  const lines = await smoke({ url: URL0, sha: SHA, fetch: s.fetch, sleep: async () => {}, attempts: 8 });
  assert.ok(lines.some((l) => /answers from its middleware/.test(l)));
  assert.ok(s.calls.filter((c) => c === 'GET /data/state.json').length >= 5);
});

test('R48a: a deployment without its env.json (the page fallback answers instead) fails, so sign in is never left disabled', async () => {
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: site({ env: null }).fetch, sleep: async () => {} }), /app\/env\.json/);
});

test('R48a: an env.json of another environment\'s project fails', async () => {
  const env = { firebase: { apiKey: `AIza${'x'.repeat(35)}`, projectId: 'taskfolio-prod' } };
  await assert.rejects(smoke({ url: URL0, sha: SHA, fetch: site({ env }).fetch, sleep: async () => {} }), /taskfolio-prod/);
});
