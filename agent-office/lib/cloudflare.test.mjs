// T37: the internet line's request counts (spec R40, R61) and the snapshot's rate read (R61, R13).
// Run: TZ=UTC node --test agent-office/lib/cloudflare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFunctionRequests, GRAPHQL_URL } from './cloudflare.mjs';
import { readUsdThb, FX_URL } from './fx.mjs';

const TOKEN = 'cf_fixture_token_value_123';
const ACCOUNT = 'a'.repeat(32);
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const rows = (list) => ({ data: { viewer: { accounts: [{ pagesFunctionsInvocationsAdaptiveGroups: list }] } } });
const row = (hour, requests, scriptName = 'pages-agent-office-staging') => ({ sum: { requests }, dimensions: { datetimeHour: hour, scriptName } });
const input = (fetch) => ({ token: TOKEN, accountId: ACCOUNT, project: 'agent-office-staging', since: '2026-10-19T17:00:00Z', until: '2026-10-21T17:00:00Z', fetch });

test('R61: requests of the project are summed per Bangkok day; the token is only in the header', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return ok(rows([row('2026-10-20T16:00:00Z', 100), row('2026-10-20T17:00:00Z', 40), row('2026-10-21T02:00:00Z', 2), row('2026-10-21T02:00:00Z', 999, 'pages-agent-office-prod')]));
  };
  assert.deepEqual(await readFunctionRequests(input(fetch)), { '2026-10-20': 100, '2026-10-21': 42 });
  assert.equal(seen[0].url, GRAPHQL_URL);
  assert.equal(seen[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(!seen[0].init.body.includes(TOKEN));
});

test('R40: no token, an error answer, GraphQL errors or rows naming no project all throw, so the line has no source', async () => {
  await assert.rejects(readFunctionRequests({ ...input(async () => ok(rows([]))), token: '' }), /no CLOUDFLARE_ANALYTICS_TOKEN/);
  await assert.rejects(readFunctionRequests(input(async () => new Response('x', { status: 403 }))), /403/);
  await assert.rejects(readFunctionRequests(input(async () => ok({ errors: [{ message: `bad ${TOKEN}` }] }))), (e) => /refused/.test(e.message) && !e.message.includes(TOKEN));
  await assert.rejects(readFunctionRequests(input(async () => ok(rows([row('2026-10-20T16:00:00Z', 5, 'taskfolio-api-staging')])))), /no analytics row names agent-office-staging/);
  await assert.rejects(readFunctionRequests({ ...input(async () => ok(rows([]))), project: 'taskfolio-api-prod' }), /not an Agent Office project/);
});

test('R61: the snapshot rate is open.er-api.com THB with its own time; a bad answer throws', async () => {
  const fx = await readUsdThb({ fetch: async (url) => { assert.equal(url, FX_URL); return ok({ result: 'success', time_last_update_utc: 'Fri, 16 Oct 2026 00:02:31 +0000', rates: { THB: 32.5 } }); } });
  assert.deepEqual(fx, { rate: 32.5, at: '2026-10-16T00:02:31.000Z', fact: 'open.er-api.com' });
  await assert.rejects(readUsdThb({ fetch: async () => ok({ result: 'error' }) }));
});
