// T13: the middleware in front of the Agent Office snapshot (/data/*), spec R42 and R43.
// It loads the real _middleware.ts, the real verifiedRequest.ts, jiraAuth.ts, accountStatus.ts and
// jiraCors.ts (node strips their types), with a token signed by a key made here and a stubbed
// fetch for Google's key set and the Firestore users/{uid} read.
// Run: TZ=UTC node --test agent-office/functions/data/_middleware.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// verifiedRequest.ts imports its siblings without an extension, as the bundler allows; node needs
// one, so a relative specifier with no extension resolves to the .ts file beside it.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, n) {
      if ((s.startsWith('./') || s.startsWith('../')) && !/\\.[a-z]+$/.test(s)) return n(s + '.ts', c);
      return n(s, c);
    }`),
);

const { onRequest } = await import('./_middleware.ts');

const PROJECT = 'taskfolio-staging';
const APP = 'https://agent-office-staging.pages.dev';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SNAPSHOT = '{"readAt":"2026-10-16T09:00:00.000Z"}';

let keys;
let jwk;
const users = new Map();
const realFetch = globalThis.fetch;
let firestoreStatus = null;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function sign(claims, { kid = 'k1', privateKey = keys.privateKey } = {}) {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

function claims(uid, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, iat: now - 10, auth_time: now - 10, exp: now + 3600, email: `${uid}@x.test`, email_verified: true, ...extra };
}

before(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    const m = /\/projects\/([^/]+)\/databases\/\(default\)\/documents\/users\/([^/?]+)$/.exec(u);
    if (m) {
      assert.equal(m[1], PROJECT, 'the account read goes to the environment\'s own Firebase project');
      if (firestoreStatus) return new Response('{}', { status: firestoreStatus });
      const doc = users.get(m[2]);
      if (!doc) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ fields: { status: { stringValue: doc.status }, systemRole: { stringValue: doc.role } } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  users.set('staff1', { status: 'active', role: 'staff' });
  users.set('lead1', { status: 'active', role: 'team_lead' });
  users.set('mgmt1', { status: 'active', role: 'management' });
  users.set('admin1', { status: 'active', role: 'admin' });
  users.set('pending1', { status: 'pending', role: 'staff' });
  users.set('gone1', { status: 'deactivated', role: 'staff' });
});

after(() => {
  globalThis.fetch = realFetch;
});

/** Calls the middleware the way Pages does; `next` stands for the static snapshot file. */
async function call({ method = 'GET', token, origin, env = { APP_ORIGIN: APP, FIREBASE_PROJECT_ID: PROJECT }, headers = {} } = {}) {
  const h = new Headers(headers);
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (origin) h.set('Origin', origin);
  let served = 0;
  const request = new Request(`${APP}/data/state.json`, { method, headers: h });
  const response = await onRequest({
    request,
    env,
    next: async () => {
      served++;
      return new Response(SNAPSHOT, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=14400' } });
    },
  });
  return { response, served, text: await response.text() };
}

test('R42: no token gets 401 and the file is not served', async () => {
  const r = await call();
  assert.equal(r.response.status, 401);
  assert.equal(r.served, 0);
  assert.ok(!r.text.includes('readAt'));
});

test('R42: a malformed token, a token signed by another key and a token for another project get 401', async () => {
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  for (const token of ['not-a-jwt', await sign(claims('staff1'), { privateKey: other.privateKey }), await sign(claims('staff1', { aud: 'taskfolio-prod', iss: 'https://securetoken.google.com/taskfolio-prod' }))]) {
    const r = await call({ token });
    assert.equal(r.response.status, 401, token.slice(0, 20));
    assert.equal(r.served, 0);
  }
});

test('R42: an expired token and an unverified email get 401', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const c of [claims('staff1', { exp: now - 1 }), claims('staff1', { email_verified: false })]) {
    const r = await call({ token: await sign(c) });
    assert.equal(r.response.status, 401);
    assert.equal(r.served, 0);
  }
});

test('R42: a pending, a deactivated and an unknown account get 403', async () => {
  for (const uid of ['pending1', 'gone1', 'nobody']) {
    const r = await call({ token: await sign(claims(uid)) });
    assert.equal(r.response.status, 403, uid);
    assert.equal(r.served, 0, uid);
  }
});

test('R42: an active account of every role gets 200 and the snapshot, never cached by the browser', async () => {
  for (const uid of ['staff1', 'lead1', 'mgmt1', 'admin1']) {
    const r = await call({ token: await sign(claims(uid)) });
    assert.equal(r.response.status, 200, uid);
    assert.equal(r.served, 1, uid);
    assert.equal(r.text, SNAPSHOT);
    assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
  }
});

test('R42: when Firestore cannot answer, the caller gets 502, not the file', async () => {
  firestoreStatus = 500;
  try {
    const r = await call({ token: await sign(claims('staff1')) });
    assert.equal(r.response.status, 502);
    assert.equal(r.served, 0);
  } finally {
    firestoreStatus = null;
  }
});

test('R43: POST, PUT, PATCH, DELETE and HEAD get 405, even with a good token', async () => {
  const token = await sign(claims('staff1'));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const r = await call({ method, token });
    assert.equal(r.response.status, 405, method);
    assert.equal(r.served, 0, method);
  }
});

test('R43: the app origin gets its grant; another origin gets 403 and no grant', async () => {
  const token = await sign(claims('staff1'));
  const ok = await call({ token, origin: APP });
  assert.equal(ok.response.status, 200);
  assert.equal(ok.response.headers.get('Access-Control-Allow-Origin'), APP);
  const bad = await call({ token, origin: 'https://evil.example' });
  assert.equal(bad.response.status, 403);
  assert.equal(bad.response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(bad.served, 0);
});

test('R43: a preflight from the app origin is granted GET with Authorization only', async () => {
  const r = await call({ method: 'OPTIONS', origin: APP, headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  assert.equal(r.response.status, 204);
  assert.equal(r.response.headers.get('Access-Control-Allow-Methods'), 'GET');
  assert.equal(r.served, 0);
});

test('R43: a missing or malformed APP_ORIGIN, or a missing FIREBASE_PROJECT_ID, answers 500 with no grant', async () => {
  const token = await sign(claims('staff1'));
  for (const env of [{ FIREBASE_PROJECT_ID: PROJECT }, { APP_ORIGIN: `${APP}/`, FIREBASE_PROJECT_ID: PROJECT }, { APP_ORIGIN: 'http://agent-office-staging.pages.dev', FIREBASE_PROJECT_ID: PROJECT }, { APP_ORIGIN: APP }]) {
    const r = await call({ token, origin: APP, env });
    assert.equal(r.response.status, 500, JSON.stringify(env));
    assert.equal(r.response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(r.served, 0);
  }
});
