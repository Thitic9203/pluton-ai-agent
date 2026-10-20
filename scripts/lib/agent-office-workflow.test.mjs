// T20: .github/workflows/deploy-agent-office.yml (docs/sdd/agent-office-live/spec.md R41, R46, R47,
// R48, R65), in the pattern of scripts/lib/workflow-security.test.mjs.
// Run: TZ=UTC node --test scripts/lib/agent-office-workflow.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { GUARDED_RUNS_ON } from './guarded-runs-on.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FILE = '.github/workflows/deploy-agent-office.yml';
const yaml = readFileSync(join(ROOT, FILE), 'utf8');

/** Lines that are not comments. */
const code = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

function jobs() {
  const body = yaml.slice(yaml.search(/^jobs:\s*$/m));
  const heads = [...body.matchAll(/^  ([a-z][a-z0-9_-]*)\s*:\s*$/gm)];
  return new Map(heads.map((m, i) => [m[1], code(body.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : body.length))]));
}
const J = jobs();
const job = (id) => {
  assert.ok(J.has(id), `${FILE} has no job ${id}`);
  return J.get(id);
};
const steps = (body) => body.split(/\n      - /).slice(1);
const needs = (body) => {
  const inline = /^    needs:\s*\[([^\]]*)\]/m.exec(body);
  if (inline) return inline[1].split(',').map((s) => s.trim()).filter(Boolean);
  const one = /^    needs:\s*([a-z][\w-]*)\s*$/m.exec(body);
  return one ? [one[1]] : [];
};
const ifOf = (body) => (/^    if:\s*>-?\s*\n((?:      .*\n?)+)/m.exec(body)?.[1] ?? /^    if:\s*(.+)$/m.exec(body)?.[1] ?? '').replace(/\s+/g, ' ');
const secretsOf = (body) => [...new Set([...body.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();

const PUBLISHERS = new Map([
  ['staging', { env: 'staging', project: 'agent-office-staging', other: 'agent-office-prod', secret: 'CLOUDFLARE_API_TOKEN_STAGING' }],
  ['production', { env: 'production', project: 'agent-office-prod', other: 'agent-office-staging', secret: 'CLOUDFLARE_API_TOKEN_PROD' }],
  ['refresh-staging', { env: 'staging', project: 'agent-office-staging', other: 'agent-office-prod', secret: 'CLOUDFLARE_API_TOKEN_STAGING' }],
  ['refresh-production', { env: 'production', project: 'agent-office-prod', other: 'agent-office-staging', secret: 'CLOUDFLARE_API_TOKEN_PROD' }],
]);

test('the jobs are verify, tests, staging, production and one refresh per environment', () => {
  assert.deepEqual([...J.keys()].sort(), ['production', 'refresh-production', 'refresh-staging', 'staging', 'tests', 'verify']);
});

test('R46: production runs only by hand from main, after verify and tests passed', () => {
  const c = ifOf(job('production'));
  assert.match(c, /github\.event_name == 'workflow_dispatch'/);
  assert.match(c, /github\.ref == 'refs\/heads\/main'/);
  assert.match(c, /inputs\.target == 'production'/);
  assert.match(c, /needs\.verify\.result == 'success'/);
  assert.match(c, /needs\.tests\.result == 'success'/);
  assert.deepEqual(needs(job('production')).sort(), ['tests', 'verify']);
  assert.match(job('production'), /ref: \$\{\{ needs\.verify\.outputs\.sha \}\}/, 'production publishes the sha verify approved');
});

test('R46: verify refuses a sha with no successful push run of this workflow that published it to staging', () => {
  const v = job('verify');
  assert.match(v, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/, 'a full sha only');
  assert.match(v, /compare\/\$SHA\.\.\.main/, 'the sha is on main');
  assert.match(v, /actions\/workflows\/deploy-agent-office\.yml\/runs\?head_sha=\$SHA&branch=main&event=push&status=success/);
  assert.match(v, /select\(\.name == "Deploy Agent Office to staging"\)/);
  assert.match(v, /\.name == "Publish agent-office to agent-office-staging" and \.conclusion == "success"/);
  assert.match(job('staging'), /name: Deploy Agent Office to staging/);
  assert.match(job('staging'), /- name: Publish agent-office to agent-office-staging/);
  assert.match(v, /SHA: \$\{\{ inputs\.sha \}\}/, 'the typed sha reaches the script through env');
  assert.doesNotMatch(v.split('\n').filter((l) => /^\s+(run:|[^:]*\$\(|.*gh api)/.test(l)).join('\n'), /\$\{\{ inputs\.sha \}\}/, 'never interpolated into run');
});

test('R46: staging runs on a push of main only, and needs every test job', () => {
  const s = job('staging');
  const c = ifOf(s);
  assert.match(c, /github\.event_name == 'push'/);
  assert.match(c, /github\.ref == 'refs\/heads\/main'/);
  const testJobs = [...J.keys()].filter((id) => !PUBLISHERS.has(id) && id !== 'verify');
  assert.ok(testJobs.length > 0);
  for (const id of testJobs) {
    assert.ok(needs(s).includes(id), `staging needs ${id}`);
    assert.match(c, new RegExp(`needs\\.${id}\\.result == 'success'`));
  }
});

test('R65: each refresh runs only on an issue event, an agent workflow ending, or by hand with target refresh', () => {
  const on = /^on:\s*\n((?:(?:[ \t].*)?\n)*)/m.exec(yaml)[1];
  assert.match(on, /^  issues:\s*\n    types: \[opened, labeled, unlabeled, closed, reopened\]/m);
  assert.match(on, /^  workflow_run:\s*\n    workflows: \[Agent, Agent release, Agent sweep, Deploy production\]\s*\n    types: \[completed\]/m);
  assert.doesNotMatch(on, /^  schedule:/m, 'Q21: no schedule until the Pages deployment count is known');
  assert.doesNotMatch(on, /pull_request_target/);
  for (const id of ['refresh-staging', 'refresh-production']) {
    const c = ifOf(job(id));
    assert.doesNotMatch(c, /'push'/, `${id} never runs on a push`);
    assert.match(c, /github\.event_name == 'issues'/);
    assert.match(c, /github\.event_name == 'workflow_run'/);
    assert.match(c, /inputs\.target == 'refresh'/);
    assert.match(c, /github\.ref == 'refs\/heads\/main'/);
  }
});

test('R46, R65: a refresh publishes the sha its environment already serves, read from its version.txt', () => {
  for (const [id, { project }] of [...PUBLISHERS].filter(([id]) => id.startsWith('refresh-'))) {
    const body = job(id);
    assert.match(body, new RegExp(`https://${project}\\.pages\\.dev/version\\.txt`), `${id} reads its own version.txt`);
    assert.match(body, /ref: \$\{\{ steps\.serving\.outputs\.sha \}\}/, `${id} checks out the served sha`);
    assert.match(body, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/, `${id} refuses anything but a full sha`);
  }
});

test('R65, N2: an opened issue is in the trigger and each refresh job accepts it', () => {
  const on = /^on:\s*\n((?:(?:[ \t].*)?\n)*)/m.exec(yaml)[1];
  const types = /^  issues:\s*\n    types: \[([^\]]*)\]/m.exec(on)?.[1].split(',').map((s) => s.trim()) ?? [];
  assert.ok(types.includes('opened'), `issues.types lists opened: [${types.join(', ')}]`);
  for (const id of ['refresh-staging', 'refresh-production']) {
    assert.match(ifOf(job(id)), /github\.event\.action == 'opened'/, `${id} accepts an opened issue`);
  }
});

test('R46, R65, N1: each refresh checks the served sha is on main before any checkout of it', () => {
  for (const id of ['refresh-staging', 'refresh-production']) {
    const s = steps(job(id));
    const serving = s.findIndex((x) => /^\s*id: serving\s*$/m.test(x));
    const checkout = s.findIndex((x) => /actions\/checkout@/.test(x) && /ref: \$\{\{ steps\.serving\.outputs\.sha \}\}/.test(x));
    const check = s.findIndex((x) => /compare\/\$SHA\.\.\.main/.test(x));
    assert.ok(serving !== -1 && checkout !== -1, `${id}: reads the served sha and checks it out`);
    assert.ok(check !== -1, `${id}: runs a compare-on-main check of the served sha`);
    assert.ok(serving < check && check < checkout, `${id}: the check comes after the read and before the checkout`);
    const c = s[check];
    assert.match(c, /SHA: \$\{\{ steps\.serving\.outputs\.sha \}\}/, `${id}: the sha reaches the check through env`);
    assert.match(c, /GH_TOKEN: \$\{\{ github\.token \}\}/, `${id}: the check uses the job's read-only token`);
    assert.doesNotMatch(c.slice(c.search(/^\s*run: \|/m)), /\$\{\{/, `${id}: no expression interpolated into run`);
    assert.match(c, /grep -Eq '\^\[0-9a-f\]\{40\}\$'/, `${id}: a full sha only`);
    assert.match(c, /"\$status" != "ahead" \] && \[ "\$status" != "identical"/, `${id}: ahead or identical only`);
    assert.match(c, /::error::/, `${id}: fails loudly`);
    assert.match(c, /exit 1/, `${id}: fails the job`);
    assert.deepEqual(secretsOf(c), [], `${id}: the check holds no secret`);
    assert.doesNotMatch(c, /continue-on-error/, `${id}: a failed check is never ignored`);
  }
});

test('R65: every publish builds the snapshot first, with the job token and the AGENT_ENABLED variable', () => {
  for (const [id] of PUBLISHERS) {
    const s = steps(job(id));
    const snap = s.findIndex((x) => /node scripts\/agent-office-snapshot\.mjs/.test(x));
    const pub = s.findIndex((x) => /wrangler" pages deploy/.test(x));
    assert.notEqual(snap, -1, `${id} builds the snapshot`);
    assert.notEqual(pub, -1, `${id} publishes`);
    assert.ok(snap < pub, `${id}: snapshot before publish`);
    assert.match(s[snap], /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(s[snap], /AGENT_ENABLED: \$\{\{ vars\.AGENT_ENABLED \}\}/);
    assert.match(s[snap], /AGENT_APP_LOGIN: \$\{\{ vars\.AGENT_APP_SLUG \}\}\[bot\]/, `${id}: the money block vouches markers by the agent App login (R59, T36)`);
    assert.doesNotMatch(s[snap], /CLOUDFLARE_API_TOKEN/, `${id}: the snapshot step holds no Cloudflare deploy token`);
    // T37, R61: the internet line reads this environment's analytics token (read only), never the other's.
    const { project } = PUBLISHERS.get(id);
    const suffix = project === 'agent-office-prod' ? 'PROD' : 'STAGING';
    const otherSuffix = suffix === 'PROD' ? 'STAGING' : 'PROD';
    assert.match(s[snap], new RegExp(`CLOUDFLARE_ANALYTICS_TOKEN: \\$\\{\\{ secrets\\.CLOUDFLARE_ANALYTICS_TOKEN_${suffix} \\}\\}`), `${id}: its own analytics token`);
    assert.doesNotMatch(job(id), new RegExp(`CLOUDFLARE_ANALYTICS_TOKEN_${otherSuffix}`), `${id}: never the other environment's analytics token`);
    assert.match(s[snap], new RegExp(`AGENT_OFFICE_PROJECT: ${project}\\n`), `${id}: counts its own project`);
    assert.doesNotMatch(s[pub], /CLOUDFLARE_ANALYTICS_TOKEN/, `${id}: the publish step holds no analytics token`);
    assert.doesNotMatch(s[pub], /GITHUB_TOKEN/, `${id}: the publish step holds no GitHub token`);
  }
});

test('R41: GitHub is read with read scopes only, and the workflow writes nothing to GitHub', () => {
  assert.match(yaml, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(code(yaml), /:\s*write\b/, 'no write permission anywhere');
  for (const [id] of PUBLISHERS) {
    const p = /^    permissions:\s*\n((?:      .*\n)+)/m.exec(job(id))?.[1] ?? '';
    const scopes = p.trim().split('\n').map((l) => l.trim()).sort();
    // T36: `checks: read` for the check runs of agent/issue-N heads (R61 water, R54 CI first green).
    assert.deepEqual(scopes, ['actions: read', 'checks: read', 'contents: read', 'issues: read', 'pull-requests: read'], `${id} permissions`);
  }
});

test('R41, R48: each job reads only its own environment\'s Cloudflare token, and no other secret exists here', () => {
  for (const [id, { env, project, other, secret }] of PUBLISHERS) {
    const body = job(id);
    assert.match(body, new RegExp(`^    environment: ${env}$`, 'm'), `${id} environment`);
    // T37, R61: plus the environment's read-only analytics token for the internet line.
    assert.deepEqual(secretsOf(body), [`CLOUDFLARE_ANALYTICS_TOKEN_${secret.endsWith('_PROD') ? 'PROD' : 'STAGING'}`, secret].sort(), `${id} secrets`);
    assert.match(body, new RegExp(`--project-name ${project}\\b`));
    assert.doesNotMatch(body, new RegExp(other), `${id} names the other project`);
  }
  for (const id of ['verify', 'tests']) assert.deepEqual(secretsOf(job(id)), [], `${id} reads no secret`);
  assert.doesNotMatch(yaml, /GITHUB_TOKEN_RO/, 'no read-only personal token any more (R41)');
});

test('R41: no secret is echoed, printed or put on a command line', () => {
  for (const line of code(yaml).split('\n')) {
    if (/secrets\./.test(line)) assert.match(line, /^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z0-9_]+ \}\}\s*$/, `a secret outside an env mapping: ${line.trim()}`);
    if (/\b(echo|printf)\b/.test(line)) assert.doesNotMatch(line, /\$\{?(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ANALYTICS_TOKEN|GITHUB_TOKEN|GH_TOKEN)\b/, `prints a credential: ${line.trim()}`);
    assert.doesNotMatch(line, /--token|--api-token/, `a credential on a command line: ${line.trim()}`);
  }
});

test('finding 7: every job runs on the guarded runner form', () => {
  for (const [id, body] of J) assert.equal(/^    runs-on:\s*(.+?)\s*$/m.exec(body)?.[1], GUARDED_RUNS_ON, id);
});

test('finding 7 and 8: each publisher installs from its own cache and runs the installed wrangler only', () => {
  for (const [id] of PUBLISHERS) {
    const s = steps(job(id));
    const isolate = s.findIndex((x) => /npm_config_cache=\$RUNNER_TEMP\/npm-cache" >> "\$GITHUB_ENV"/.test(x));
    const install = s.findIndex((x) => /^run: npm ci --ignore-scripts\b/.test(x));
    assert.ok(isolate !== -1 && install !== -1 && isolate < install, `${id}: per-job npm cache before npm ci`);
  }
  assert.doesNotMatch(code(yaml), /\bnpx\b[^\n]*wrangler|wrangler@\d/);
});

test('the publish runs in agent-office/, so its functions/ is the one bundled and the Jira proxy is not', () => {
  for (const [id] of PUBLISHERS) {
    const pub = steps(job(id)).find((x) => /wrangler" pages deploy/.test(x));
    assert.match(pub, id.startsWith('refresh-') ? /working-directory: site\/agent-office\n/ : /working-directory: agent-office\n/, id);
    assert.match(pub, /pages deploy --project-name agent-office-(staging|prod) --branch main --commit-hash/, id);
  }
});

test('a job that checks out an older commit runs every ops guard from main\'s copy', () => {
  for (const id of ['production', 'refresh-staging', 'refresh-production']) {
    const body = job(id);
    const s = steps(body);
    const target = s.findIndex((x) => /actions\/checkout@/.test(x) && /^\s+ref:/m.test(x));
    const ops = s.findIndex((x) => /actions\/checkout@/.test(x) && /^\s+path: ops\s*$/m.test(x));
    assert.ok(target !== -1 && ops !== -1, `${id}: a target checkout and main's copy at ops`);
    // A target checked out at the workspace root cleans it, so it must come before ops; one at its
    // own path (site) leaves ops alone.
    if (!/^\s+path: site\s*$/m.test(s[target])) assert.ok(target < ops, `${id}: target checkout, then main's copy at ops`);
    assert.match(body, /^\s+run: node ops\/scripts\/runner-power\.mjs\s*$/m, `${id}: the power check is main's copy`);
  }
});

test('R46: a refresh publishes nothing while a code deploy of this workflow is queued or running, or once version.txt moved', () => {
  for (const [id, { project }] of [...PUBLISHERS].filter(([id]) => id.startsWith('refresh-'))) {
    const s = steps(job(id));
    const guard = s.findIndex((x) => /name: Nothing newer is deploying/.test(x));
    const pub = s.findIndex((x) => /wrangler" pages deploy/.test(x));
    assert.ok(guard !== -1 && guard + 1 === pub, `${id}: the guard is the step right before the publish`);
    assert.match(s[guard], /actions\/workflows\/deploy-agent-office\.yml\/runs\?status=\$st/);
    assert.match(s[guard], new RegExp(`https://${project}\\.pages\\.dev/version\\.txt`));
  }
});
