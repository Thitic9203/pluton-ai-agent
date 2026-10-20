// T14: the per-environment wrangler.toml of the Agent Office Pages projects
// (docs/sdd/agent-office-live/spec.md R41, R48, R65).
// Run: TZ=UTC node --test scripts/lib/agent-office.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_OFFICE_ENVIRONMENTS, wranglerToml, versionText, envJson } from './agent-office.mjs';
import { JIRA_PROXY_ENVIRONMENTS } from './jira-proxy.mjs';

const vars = (text) => {
  const at = text.indexOf('[vars]');
  assert.notEqual(at, -1, 'a [vars] table');
  return Object.fromEntries(
    text
      .slice(at + '[vars]'.length)
      .split('\n')
      .filter((l) => /\S/.test(l) && !l.startsWith('#'))
      .map((l) => {
        const m = /^([A-Z_]+) = "([^"]*)"$/.exec(l);
        assert.ok(m, `not a plain string variable: ${l}`);
        return [m[1], m[2]];
      }),
  );
};

test('R48: staging names its own project, origin and Firebase project, and nothing of production', () => {
  const t = wranglerToml('staging');
  assert.match(t, /^name = "agent-office-staging"$/m);
  assert.deepEqual(vars(t), { APP_ORIGIN: 'https://agent-office-staging.pages.dev', FIREBASE_PROJECT_ID: 'taskfolio-staging' });
  assert.doesNotMatch(t, /prod/);
});

test('R48: production names its own project, origin and Firebase project, and nothing of staging', () => {
  const t = wranglerToml('prod');
  assert.match(t, /^name = "agent-office-prod"$/m);
  assert.deepEqual(vars(t), { APP_ORIGIN: 'https://agent-office-prod.pages.dev', FIREBASE_PROJECT_ID: 'taskfolio-prod' });
  assert.doesNotMatch(t, /staging/);
});

test('R48: the Firebase project of each environment is the one the Jira proxy already uses', () => {
  assert.equal(AGENT_OFFICE_ENVIRONMENTS.staging.firebaseProjectId, JIRA_PROXY_ENVIRONMENTS.staging.firebaseProjectId);
  assert.equal(AGENT_OFFICE_ENVIRONMENTS.prod.firebaseProjectId, JIRA_PROXY_ENVIRONMENTS.prod.firebaseProjectId);
});

test('R65: the page and the snapshot publish from public/, so the functions/ beside it is the one bundled', () => {
  for (const name of ['staging', 'prod']) assert.match(wranglerToml(name), /^pages_build_output_dir = "\.\/public"$/m);
});

test('R41: no line looks like a secret, and no secret name is written', () => {
  for (const name of ['staging', 'prod']) {
    for (const line of wranglerToml(name).split('\n')) {
      assert.doesNotMatch(line, /TOKEN|SECRET|PASSWORD|KEY|AUTH/i, line);
      assert.doesNotMatch(line, /gh[pousr]_|github_pat_|[A-Za-z0-9+/_-]{32,}/, line);
    }
  }
});

test('an unknown environment is refused', () => {
  assert.throws(() => wranglerToml('production'), /Unknown environment/);
  assert.throws(() => wranglerToml('__proto__'), /Unknown environment/);
});

test('R65: version.txt is exactly the full sha, so a refresh can read which commit an environment serves', () => {
  const sha = 'a'.repeat(40);
  assert.equal(versionText(sha), `${sha}\n`);
  for (const bad of ['', 'abc', 'A'.repeat(40), `${sha}\nx`]) assert.throws(() => versionText(bad), /not a full sha/);
});

// R48a: public/app/env.json, the Firebase web config the page reads, written per environment at publish.
const GOOD = {
  VITE_FIREBASE_API_KEY: 'AIzaSyTESTONLYxxxxxxxxxxxxxxxxxxxxxxxxx',
  VITE_FIREBASE_AUTH_DOMAIN: 'taskfolio-prod.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'taskfolio-prod',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
};

test('R48a: env.json carries the four Firebase web values of its environment', () => {
  const j = JSON.parse(envJson('prod', GOOD));
  assert.deepEqual(j, { firebase: { apiKey: GOOD.VITE_FIREBASE_API_KEY, authDomain: GOOD.VITE_FIREBASE_AUTH_DOMAIN, projectId: 'taskfolio-prod', appId: GOOD.VITE_FIREBASE_APP_ID } });
});

test('R48a: env.json refuses a missing value, a key that is not a web key, and another environment\'s project', () => {
  for (const k of Object.keys(GOOD)) assert.throws(() => envJson('prod', { ...GOOD, [k]: '' }), new RegExp(k));
  assert.throws(() => envJson('prod', { ...GOOD, VITE_FIREBASE_API_KEY: '-' }), /not a Firebase web API key/);
  assert.throws(() => envJson('staging', GOOD), /taskfolio-prod.*not.*taskfolio-staging/);
  assert.throws(() => envJson('dev', GOOD), /Unknown environment/);
});
