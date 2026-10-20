// docs/sdd/repo-split/spec.md R15, R17, R18, R19, R20: the workflows of pluton-ai-agent act on
// pluton-timesheet with App tokens bound to it, check it out by name, take its events only as relayed
// repository_dispatch, and this repository has its own CI. Text checks, like the other workflow tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPES } from '../agent/relay-event.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIR = join(ROOT, '.github/workflows');
const AGENT_FILES = ['agent.yml', 'agent-main-audit.yml', 'agent-sweep.yml', 'agent-release.yml', 'agent-triage.yml', 'deploy-agent-office.yml'];
const read = (file) => readFileSync(join(DIR, file), 'utf8');
const PRODUCT = 'Thitic9203/pluton-timesheet';
const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7';
const SETUP_NODE = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7';
const COPY = '$RUNNER_TEMP/pluton-ai-agent/scripts';

const onBlock = (yaml) => /^on:\s*\n((?:(?:[ \t].*)?\n)*)/m.exec(yaml)[1];
function jobsOf(yaml) {
  const body = yaml.slice(yaml.search(/^jobs:\s*$/m));
  const jobs = new Map();
  const heads = [...body.matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)];
  heads.forEach((m, i) => jobs.set(m[1], body.slice(m.index, heads[i + 1]?.index ?? body.length)));
  return jobs;
}
const stepsOf = (job) => job.split(/^ {6}- /m).slice(1);
const tokenSteps = (job) => stepsOf(job).filter((s) => s.includes('actions/create-github-app-token@'));
const checkoutSteps = (job) => stepsOf(job).filter((s) => s.includes('actions/checkout@'));
const idOf = (step) => /^\s+id: ([\w-]+)$/m.exec(step)?.[1];
const permsOf = (step) => [...step.matchAll(/^\s+(permission-[a-z-]+): (read|write)(?:\s+#.*)?$/gm)].map((m) => `${m[1]}: ${m[2]}`).sort();

/** The jobs that need product files, and the token id their product checkout uses (R19). */
const PRODUCT_JOBS = {
  'agent.yml': ['agent', 'open-pr', 'review'],
  'agent-triage.yml': ['judge'],
  'agent-sweep.yml': ['sweep'],
  'agent-release.yml': ['staged', 'release'],
};

/** Former workflow-token calls on the product, now App tokens with the job's former permissions (R17). */
const REPLACED = {
  'agent.yml': {
    dispatch: ['permission-contents: read', 'permission-issues: write', 'permission-pull-requests: read'],
    review: ['permission-contents: read', 'permission-issues: read', 'permission-pull-requests: read'],
    'merge-check': ['permission-checks: read', 'permission-contents: read', 'permission-pull-requests: write', 'permission-statuses: read'],
    'slack-merged': ['permission-contents: read', 'permission-pull-requests: read'],
  },
  'agent-main-audit.yml': { audit: ['permission-contents: read', 'permission-issues: write', 'permission-pull-requests: read'] },
  'agent-sweep.yml': { sweep: ['permission-contents: read', 'permission-issues: write'] },
  'agent-triage.yml': { judge: ['permission-contents: read', 'permission-issues: read'] },
  'agent-release.yml': {
    staged: ['permission-actions: read', 'permission-contents: read', 'permission-issues: write', 'permission-pull-requests: read'],
    count: ['permission-contents: read', 'permission-issues: write', 'permission-pull-requests: read'],
    release: ['permission-actions: write', 'permission-contents: read', 'permission-issues: write', 'permission-pull-requests: read'],
  },
};

const DISPATCH_TYPES = {
  'agent.yml': ['ts-issues', 'ts-issue-comment', 'ts-pr-review', 'ts-ci-completed', 'ts-status'],
  'agent-release.yml': ['ts-ci-main-completed', 'ts-release-next'],
  'agent-triage.yml': ['ts-issues'],
  'agent-main-audit.yml': ['ts-main-push'],
  'agent-sweep.yml': [],
  'deploy-agent-office.yml': ['ts-issues', 'ts-deploy-production'],
};

test('R18: every workflow sets PRODUCT_REPO to pluton-timesheet', () => {
  for (const f of AGENT_FILES) assert.match(read(f), /^env:\n {2}PRODUCT_REPO: Thitic9203\/pluton-timesheet$/m, f);
});

test('R15: no workflow triggers on a pluton-timesheet event; relayed events arrive as their repository_dispatch types', () => {
  const ownNames = readdirSync(DIR).filter((f) => f.endsWith('.yml')).map((f) => /^name: (.+)$/m.exec(read(f))?.[1]);
  for (const f of AGENT_FILES) {
    const on = onBlock(read(f));
    for (const ev of ['issues', 'issue_comment', 'pull_request_review', 'status']) {
      assert.doesNotMatch(on, new RegExp(`^ {2}${ev}:`, 'm'), `${f} still triggers on ${ev}`);
    }
    const wr = /^ {2}workflow_run:\s*\n {4}workflows: \[([^\]]*)\]/m.exec(on);
    for (const name of wr ? wr[1].split(',').map((s) => s.trim()) : []) {
      assert.ok(ownNames.includes(name), `${f}: workflow_run of ${name}, which is not a workflow of this repository`);
    }
    const rd = /^ {2}repository_dispatch:\s*\n {4}types: \[([^\]]*)\]/m.exec(on);
    const types = rd ? rd[1].split(',').map((s) => s.trim()) : [];
    assert.deepEqual(types, DISPATCH_TYPES[f], f);
    for (const t of types) assert.ok(t in TYPES, `${f}: ${t} is not a type relay-event.mjs rebuilds`);
  }
});

test('R17: every App token step names owner Thitic9203, repositories pluton-timesheet, and at least one permission', () => {
  for (const f of AGENT_FILES) {
    for (const [id, job] of jobsOf(read(f))) {
      for (const step of tokenSteps(job)) {
        assert.match(step, /^\s+owner: Thitic9203$/m, `${f} ${id} ${idOf(step)}`);
        assert.match(step, /^\s+repositories: pluton-timesheet$/m, `${f} ${id} ${idOf(step)}`);
        assert.ok(permsOf(step).length > 0, `${f} ${id} ${idOf(step)} asks for no permission`);
      }
    }
  }
});

test('R17: the product calls that used the workflow token use an App token with the job\'s former permissions', () => {
  for (const [f, jobs] of Object.entries(REPLACED)) {
    const all = jobsOf(read(f));
    for (const [id, perms] of Object.entries(jobs)) {
      const found = tokenSteps(all.get(id)).map(permsOf);
      assert.ok(found.some((p) => JSON.stringify(p) === JSON.stringify(perms)), `${f} ${id}: no token with ${perms.join(', ')} (found ${JSON.stringify(found)})`);
    }
  }
  for (const f of AGENT_FILES.filter((x) => x !== 'deploy-agent-office.yml')) {
    assert.doesNotMatch(read(f), /github\.token/, `${f} still calls with the workflow token, which cannot reach pluton-timesheet`);
  }
});

test('R17: the Agent Office snapshot reads pluton-timesheet with an App token', () => {
  const jobs = jobsOf(read('deploy-agent-office.yml'));
  for (const [id, job] of jobs) {
    const snap = stepsOf(job).find((s) => s.includes('node scripts/agent-office-snapshot.mjs'));
    if (!snap) continue;
    const m = /GITHUB_TOKEN: \$\{\{ steps\.([\w-]+)\.outputs\.token \}\}/.exec(snap);
    assert.ok(m, `${id}: the snapshot step holds no App token`);
    assert.ok(tokenSteps(job).some((s) => idOf(s) === m[1]), `${id}: ${m[1]} is not a token step of this job`);
  }
});

test('R19: every checkout that names a repository names pluton-timesheet, with an App token and no persisted credential', () => {
  for (const f of AGENT_FILES) {
    for (const [id, job] of jobsOf(read(f))) {
      for (const step of checkoutSteps(job)) {
        const repo = /^\s+repository: (.+)$/m.exec(step)?.[1];
        if (!repo) continue;
        assert.equal(repo, PRODUCT, `${f} ${id}`);
        const tok = /^\s+token: \$\{\{ steps\.([\w-]+)\.outputs\.token \}\}$/m.exec(step)?.[1];
        assert.ok(tok && tokenSteps(job).some((s) => idOf(s) === tok), `${f} ${id}: the product checkout uses no App token of the job`);
        assert.match(step, /^\s+persist-credentials: false$/m, `${f} ${id}`);
        assert.doesNotMatch(step, /^\s+path:/m, `${f} ${id}: the product sits at the workspace root`);
      }
    }
  }
});

test('R19: a product job copies this repository\'s scripts out of the tree first, and runs them only from the copy', () => {
  for (const [f, ids] of Object.entries(PRODUCT_JOBS)) {
    const jobs = jobsOf(read(f));
    for (const id of ids) {
      const steps = stepsOf(jobs.get(id));
      const product = steps.findIndex((s) => s.includes(`repository: ${PRODUCT}`));
      assert.ok(product >= 0, `${f} ${id} has no product checkout`);
      const own = steps.findIndex((s) => s.includes('actions/checkout@') && !s.includes('repository:'));
      const copy = steps.findIndex((s) => s.includes(`cp -R scripts "${COPY.replace('/scripts', '')}/"`));
      assert.ok(own >= 0 && own < copy && copy < product, `${f} ${id}: own checkout, then the copy, then the product checkout`);
      for (const s of steps.slice(product)) {
        for (const m of s.matchAll(/node "?([^\s"]+\.mjs)/g)) {
          const ok = m[1].startsWith(COPY) || m[1] === 'scripts/staging-smoke.mjs' || m[1].startsWith('$RUNNER_TEMP/agent-office-usage/');
          assert.ok(ok, `${f} ${id}: ${m[1]} runs from the product tree`);
        }
      }
    }
  }
});

test('R18: no gh or API call names GITHUB_REPOSITORY or this event\'s repository for the product', () => {
  for (const f of AGENT_FILES) {
    const y = read(f);
    assert.doesNotMatch(y, /--repo "\$GITHUB_REPOSITORY"/, f);
    assert.doesNotMatch(y, /repos\/\$\{GITHUB_REPOSITORY\}/, f);
    assert.doesNotMatch(y, /github\.event\.repository\.default_branch/, f);
  }
});

test('R16: agent workflows read no decision from the event body; job filters use the relay identifiers only', () => {
  for (const f of AGENT_FILES.filter((x) => x !== 'deploy-agent-office.yml')) {
    assert.doesNotMatch(read(f), /github\.event\.(issue|comment|label|sender|workflow_run|pull_request|context)\b/, f);
  }
  const doa = read('deploy-agent-office.yml');
  assert.doesNotMatch(doa, /github\.event\.(issue|comment|label|sender|workflow_run)\b/, 'deploy-agent-office.yml');
  for (const m of read('agent.yml').matchAll(/github\.event\.client_payload\.([a-z_]+)/g)) {
    assert.ok(['action', 'number', 'label', 'context'].includes(m[1]), `agent.yml reads client_payload.${m[1]}`);
  }
});

test('R16: the Slack label notice posts only when the API says the App set the label', () => {
  const job = jobsOf(read('agent.yml')).get('slack-label');
  const steps = stepsOf(job);
  const ev = steps.findIndex((s) => /cli\.mjs"? event$/m.test(s));
  assert.ok(ev >= 0, 'slack-label rebuilds the event first');
  const post = steps.findIndex((s) => s.includes('slack-notify'));
  assert.ok(post > ev);
  assert.match(steps[post], /if: steps\.event\.outputs\.sender == format\('\{0\}\[bot\]', vars\.AGENT_APP_SLUG\)/);
  assert.match(steps[post], /LABEL: \$\{\{ steps\.event\.outputs\.label \}\}/);
});

test('R20: this repository has its own CI: push and pull_request, ubuntu-latest, the same pins, npm test', () => {
  const ci = read('ci.yml');
  assert.deepEqual([...onBlock(ci).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ['push', 'pull_request']);
  assert.match(ci, /^permissions:\n {2}contents: read$/m);
  assert.match(ci, /^ {4}runs-on: ubuntu-latest$/m);
  assert.ok(ci.includes(`uses: ${CHECKOUT}`));
  assert.ok(ci.includes(`uses: ${SETUP_NODE}`));
  assert.match(ci, /node-version: 22\.23\.2/);
  assert.match(ci, /^ {8}run: npm test$/m);
  for (const f of AGENT_FILES) {
    for (const m of read(f).matchAll(/uses: (actions\/(?:checkout|setup-node)@[0-9a-f]{40} # v\d+)/g)) {
      assert.ok([CHECKOUT, SETUP_NODE].includes(m[1]), `${f} pins ${m[1]}, not the pin ci.yml uses`);
    }
  }
});
