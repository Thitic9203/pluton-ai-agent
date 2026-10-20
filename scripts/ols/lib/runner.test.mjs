// T4. Spec: docs/sdd/ols-real/spec.md R4, R5, R11, E2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, buildRun, readOutput, stopRun } from './runner.mjs';

const paths = { jobDir: '/tmp/jobs/OLS-12-retest', olsQaDir: '/Users/x/GitHub/ols-qa', e2eDir: '/Users/x/GitHub/ols-qa-e2e', claude: '/Users/x/.local/bin/claude' };
const env = { HOME: '/Users/x', PATH: '/usr/bin', OLS_JIRA_CREDS: 'a:b', SLACK_BOT_TOKEN: 'x', GITHUB_TOKEN: 'g', SOME_PASSWORD: 'p', NODE_EXTRA_CA_CERTS: '/c.pem' };

test('R4, R5: each duty and stage runs its ols-qa skill', () => {
  assert.deepEqual(SKILLS, {
    'write-tc': { work: ['tc-fe-prep-workflow', 'tc-api-prep-workflow'] },
    'review-tc': { work: ['tc-review-workflow'] },
    test: { work: ['testing-ticket-workflow'], review: ['review-result-workflow'] },
    retest: { work: ['retest-bug-workflow'] },
    'e2e-fix': { work: ['playwright-best-practices', 'flaky-test-doctor'], review: ['code-review'] },
  });
});

test('R4: claude -p from ols-qa, no MCP, no credential in env, curl and wget denied, draft files named', () => {
  const r = buildRun({ job: { id: 'OLS-12:retest', key: 'OLS-12', duty: 'retest', kind: 'ticket' }, stage: 'work', env, ...paths, sandboxHome: '/tmp/sb' });
  assert.equal(r.cmd, paths.claude);
  assert.equal(r.cwd, paths.olsQaDir);
  assert.equal(r.args[0], '-p');
  for (const a of ['--strict-mcp-config', '--no-session-persistence']) assert.ok(r.args.includes(a), a);
  assert.ok(r.args.join(' ').includes('Bash(curl:*)'));
  assert.ok(r.args.join(' ').includes('Bash(wget:*)'));
  assert.deepEqual(Object.keys(r.env).sort(), ['CLAUDE_CONFIG_DIR', 'HOME', 'NODE_EXTRA_CA_CERTS', 'PATH']);
  const prompt = r.args[1];
  assert.match(prompt, /skills\/retest-bug-workflow\/SKILL\.md/);
  assert.match(prompt, /ticket\.json/);
  assert.match(prompt, /draft\.md/);
  assert.match(prompt, /actions\.json/);
  assert.match(prompt, /ห้ามเขียน Jira/);
});

test('R8: feedback from the owner is carried into the rework prompt', () => {
  const r = buildRun({ job: { id: 'OLS-12:retest', key: 'OLS-12', duty: 'retest', kind: 'ticket', feedback: 'ขอหลักฐานจอ 375 เพิ่ม' }, stage: 'work', env, ...paths, sandboxHome: '/tmp/sb' });
  assert.match(r.args[1], /ขอหลักฐานจอ 375 เพิ่ม/);
});

test('R5: the test review stage runs review-result as QA Lead on the first stage output', () => {
  const r = buildRun({ job: { id: 'OLS-12:test', key: 'OLS-12', duty: 'test', kind: 'ticket' }, stage: 'review', env, ...paths, sandboxHome: '/tmp/sb' });
  assert.match(r.args[1], /review-result-workflow/);
  assert.match(r.args[1], /QA Lead/);
});

test('R11: the e2e prompt triages first, forbids skip, fixme, retries and timeouts, names the branch and the worktree', () => {
  const r = buildRun({ job: { id: 'e2e:MLV-008', key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e' }, stage: 'work', env, ...paths, sandboxHome: '/tmp/sb' });
  assert.equal(r.cwd, paths.e2eDir);
  const p = r.args[1];
  for (const s of ['agent/e2e-MLV-008', 'git worktree', 'origin/main', 'test.skip', 'test.fixme', 'retries', 'timeout', 'app bug', 'flaky', 'full', 'baseline']) assert.ok(p.includes(s), s);
  const rv = buildRun({ job: { id: 'e2e:MLV-008', key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e' }, stage: 'review', env, ...paths, sandboxHome: '/tmp/sb' });
  assert.match(rv.args[1], /code-review/);
  assert.match(rv.args[1], /gh pr create/);
});

test('R12: the rerun stage runs the case and the full dev suite from merged main in a fresh worktree and writes rerun.json', () => {
  const r = buildRun({ job: { id: 'e2e:MLV-008', key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e' }, stage: 'rerun', env, ...paths, sandboxHome: '/tmp/sb' });
  for (const s of ['origin/main', 'git worktree', 'MLV-008', 'full', 'dev', 'rerun.json']) assert.ok(r.args[1].includes(s), s);
  assert.throws(() => buildRun({ job: { id: 'OLS-1:retest', key: 'OLS-1', duty: 'retest', kind: 'ticket' }, stage: 'rerun', env, ...paths }), /rerun is e2e only/);
});

test('review B1, B2: a run gets a sandbox HOME, no project settings, and a deny list for token paths, sheet writes, merge and push to main', () => {
  const r = buildRun({ job: { id: 'e2e:MLV-008', key: 'MLV-008', duty: 'e2e-fix', kind: 'e2e' }, stage: 'review', env, ...paths, sandboxHome: '/tmp/ols-home-1' });
  assert.equal(r.env.HOME, '/tmp/ols-home-1');
  assert.equal(r.env.CLAUDE_CONFIG_DIR, '/Users/x/.claude');
  assert.ok(!JSON.stringify(r.env).includes('ols-qa-testing-bot') && !JSON.stringify(r.env).includes('.ols-qa-secrets'));
  const i = r.args.indexOf('--setting-sources');
  assert.equal(r.args[i + 1], '');
  const deny = JSON.parse(r.args[r.args.indexOf('--settings') + 1]).permissions.deny;
  for (const d of ['Read(//Users/x/ols-qa-testing-bot/**)', 'Read(//Users/x/.ols-qa-secrets/**)', 'Bash(python3 *sheet_write*)', 'Bash(*ols-qa-testing-bot*)', 'Bash(*.ols-qa-secrets*)', 'Bash(cat *jira*)', 'Bash(gh pr merge*)', 'Bash(git push*main*)', 'Bash(curl *)', 'mcp__*']) assert.ok(deny.includes(d), d);
  assert.throws(() => buildRun({ job: { id: 'x', key: 'OLS-1', duty: 'retest', kind: 'ticket' }, stage: 'work', env, ...paths }), /sandboxHome/);
});

test('review B3: stopRun kills the whole process group of a detached run', async () => {
  const { spawn } = await import('node:child_process');
  const p = spawn('sh', ['-c', 'sleep 30 & echo $!; wait'], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const childPid = Number(await new Promise((res) => p.stdout.once('data', (d) => res(String(d).trim()))));
  stopRun(p.pid);
  await new Promise((r) => setTimeout(r, 300));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  assert.equal(alive(p.pid), false);
  assert.equal(alive(childPid), false);
});

test('E2: readOutput needs draft.md and an actions.json array', () => {
  const files = { '/j/draft.md': 'ร่าง', '/j/actions.json': '[{"type":"jira.comment","body":"x"}]' };
  const fs = { readFileSync: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; } };
  assert.deepEqual(readOutput('/j', fs), { ok: true, draft: 'ร่าง', actions: [{ type: 'jira.comment', body: 'x' }] });
  assert.equal(readOutput('/k', fs).ok, false);
  const bad = { readFileSync: (p) => (p.endsWith('draft.md') ? 'x' : '{"not":"array"}') };
  assert.deepEqual(readOutput('/j', bad), { ok: false, error: 'actions.json is not an array' });
});
