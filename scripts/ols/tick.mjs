#!/usr/bin/env node
/*
 * One tick of the OLS agent (docs/sdd/ols-real/spec.md). Run by the Desktop scheduled task
 * `ols-agent` every 30 minutes in working hours (R1).
 *
 *   node scripts/ols/tick.mjs          dry: reads Jira and the newest dev run, prints the plan, sends nothing
 *   node scripts/ols/tick.mjs --live   the real tick: DM drafts, headless runs, approved writes, board publish
 *
 * Order of a live tick: read the intake and the failing e2e cases -> reconcile jobs -> read the owner's
 * replies on sent drafts -> apply approved writes -> collect finished runs -> send ready drafts and
 * failure notices -> start new runs within the cap -> save -> publish the board when it changed.
 * Prints counts and keys only; never a credential, a draft or a ticket summary.
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync, openSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { JQL, FIELDS, normalize, dutyOf } from './lib/classify.mjs';
import { verdict, draftText } from './lib/gate.mjs';
import { newestRunDir, failedCases } from './lib/e2e.mjs';
import { buildRun, readOutput, stopRun } from './lib/runner.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { reconcile, pick, afterRun, afterVerdict, afterApply } from './lib/dispatch.mjs';
import { applyJob, checkActions } from './lib/apply.mjs';
import { loadJiraCreds, createJira } from './lib/jira.mjs';
import { loadSlackToken, createSlack } from './lib/slack.mjs';
import { boardPayload, publishIfChanged } from './lib/publish.mjs';

const HOME = process.env.HOME ?? '';
const LIVE = process.argv.includes('--live');
const STATE_DIR = join(HOME, '.claude/projects/-Users-thitichaya-GitHub-pluton-timesheet/ols-agent');
const STATE = join(STATE_DIR, 'state.json');
const LOCK = join(STATE_DIR, 'tick.lock');
const JOBS = join(STATE_DIR, 'jobs');
const PATHS = {
  olsQaDir: join(HOME, 'GitHub/ols-qa'),
  e2eDir: join(HOME, 'GitHub/ols-qa-e2e'),
  claude: join(HOME, '.local/bin/claude'),
  runsDir: join(HOME, 'ols-qa-testing-bot/out'),
  sheetWrite: join(HOME, 'ols-qa-testing-bot/sheet_write.py'),
  caCerts: join(HOME, '.claude/projects/-Users-thitichaya-GitHub-pluton-timesheet/agent-dm-worker/ca-extra.pem'),
};
const RUN_LIMIT_MS = 2 * 60 * 60 * 1000;
const run = promisify(execFile);
const now = () => new Date().toISOString();
const log = (m) => console.log(`${now()} ${m}`);

function loadState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { jobs: [], boardHash: null }; }
}
function saveState(s) {
  writeFileSync(STATE + '.tmp', JSON.stringify(s, null, 2));
  renameSync(STATE + '.tmp', STATE);
}
const jobDir = (j) => join(JOBS, j.id.replace(/[^A-Za-z0-9_-]/g, '-'));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Starts a detached headless run; the next tick collects it (a run can outlast a tick). */
function startRun(j, stage) {
  const dir = jobDir(j);
  mkdirSync(dir, { recursive: true });
  for (const f of ['draft.md', 'actions.json']) if (stage === 'work') rmSync(join(dir, f), { force: true });
  const env = { ...process.env, NODE_EXTRA_CA_CERTS: PATHS.caCerts };
  const r = buildRun({ job: j, stage, env, jobDir: dir, ...PATHS, sandboxHome: mkdtempSync(join(tmpdir(), 'ols-run-')) });
  const out = openSync(join(dir, `${stage}.log`), 'a');
  const child = spawn(r.cmd, r.args, { cwd: r.cwd, env: r.env, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  Object.assign(j, { pid: child.pid, stage, startedAt: now(), phase: stage === 'review' ? 'review' : 'running', updatedAt: now() });
}

function realClients(jira) {
  return {
    jira,
    sheet: {
      async createTab(key, rows, { dryRun }) {
        const file = join(JOBS, `${key}-rows.json`);
        writeFileSync(file, JSON.stringify(rows));
        await run('python3', [PATHS.sheetWrite, '--create-tab', key, '--rows', file, ...(dryRun ? ['--dry-run'] : [])], { timeout: 300000, maxBuffer: 1 << 24 });
      },
    },
    gh: { merge: (pr) => run('gh', ['pr', 'merge', String(pr), '-R', 'Thitic9203/ols-qa-e2e', '--merge'], { timeout: 120000, maxBuffer: 1 << 24 }) },
    e2e: {
      async rerun(caseId) {
        const j = { id: `e2e:${caseId}`, key: caseId, duty: 'e2e-fix', kind: 'e2e' };
        const dir = jobDir(j);
        rmSync(join(dir, 'rerun.json'), { force: true });
        const r = buildRun({ job: j, stage: 'rerun', env: { ...process.env, NODE_EXTRA_CA_CERTS: PATHS.caCerts }, jobDir: dir, ...PATHS, sandboxHome: mkdtempSync(join(tmpdir(), 'ols-run-')) });
        await run(r.cmd, r.args, { cwd: r.cwd, env: r.env, timeout: RUN_LIMIT_MS, maxBuffer: 1 << 26 });
        const out = JSON.parse(readFileSync(join(dir, 'rerun.json'), 'utf8'));
        return { ok: out.ok === true, summary: String(out.summary ?? '') };
      },
    },
  };
}

async function main() {
  mkdirSync(JOBS, { recursive: true });
  try {
    mkdirSync(LOCK);
  } catch {
    if (Date.now() - statSync(LOCK).mtimeMs < RUN_LIMIT_MS) { log('another tick holds the lock; exiting'); return; }
    rmSync(LOCK, { recursive: true, force: true });
    mkdirSync(LOCK);
  }
  try {
    const state = loadState();
    const jira = createJira({ creds: loadJiraCreds({ readFile: readFileSync }), fetch });
    const tickets = (await jira.search(JQL, FIELDS)).map(normalize).filter(Boolean).map((t) => ({ ...t, duty: dutyOf(t) }));
    const runDir = existsSync(PATHS.runsDir) ? newestRunDir(readdirSync(PATHS.runsDir)) : null;
    const failing = runDir ? failedCases(JSON.parse(readFileSync(join(PATHS.runsDir, runDir, 'run.json'), 'utf8'))) : [];
    let jobs = reconcile({ jobs: state.jobs, tickets, failing, now: now() });
    const count = (p) => jobs.filter((j) => j.phase === p).length;
    log(`intake ${tickets.length} tickets (${tickets.filter((t) => t.duty).length} with a duty), dev run ${runDir ?? 'none'} with ${failing.length} failing cases, ${jobs.length} jobs`);

    if (!LIVE) {
      for (const j of pick(jobs)) log(`would start ${j.id}`);
      log(`dry run: queued ${count('queued')}, running ${count('running') + count('review')}, waiting for owner ${count('draft-sent')}; nothing sent`);
      return;
    }

    const slack = createSlack({ token: loadSlackToken({ readFile: readFileSync }), fetch });
    const record = async () => saveState({ ...state, jobs });

    // the owner's replies (R8)
    for (const j of jobs.filter((x) => (x.phase === 'draft-sent' || x.phase === 'failed') && x.thread)) {
      afterVerdict(j, verdict({ replies: await slack.replies(j.thread), draftTs: j.draftTs ?? j.thread }), now());
    }
    // approved writes (R9, R12)
    for (const j of jobs.filter((x) => x.phase === 'approved')) {
      const { actions } = readOutput(jobDir(j), { readFileSync });
      const r = await applyJob({ job: j, actions, clients: realClients(jira), record });
      afterApply(j, r, now());
      await record();
      await slack.post(r.ok ? `ทำตามที่อนุมัติแล้วครับ\n${r.lines.join('\n')}` : `ทำตามที่อนุมัติไม่ครบครับ: ${r.error}${r.lines?.length ? `\nทำแล้ว: ${r.lines.join(', ')}` : ''}`, j.thread);
      log(`applied ${j.id}: ${r.ok ? 'ok' : 'stopped'}`);
    }
    // finished runs (E2)
    for (const j of jobs.filter((x) => (x.phase === 'running' || x.phase === 'review') && x.pid)) {
      if (alive(j.pid)) {
        if (Date.now() - Date.parse(j.startedAt) > RUN_LIMIT_MS) { stopRun(j.pid); afterRun(j, { ok: false, error: 'run passed 2 hours and was stopped' }, j.stage, now()); }
        continue;
      }
      const out = readOutput(jobDir(j), { readFileSync });
      const bad = out.ok ? checkActions(j.duty, out.actions) : null;
      afterRun(j, bad ? { ok: false, error: bad } : out, j.stage, now());
      if (j.phase === 'review') startRun(j, 'review');
    }
    // drafts and failure notices (R7, E2)
    for (const j of jobs.filter((x) => x.phase === 'ready')) {
      const out = readOutput(jobDir(j), { readFileSync });
      const text = draftText(j, out.draft, out.actions);
      const ts = await slack.post(text, j.thread ?? undefined);
      Object.assign(j, { thread: j.thread ?? ts, draftTs: ts, phase: 'draft-sent', feedback: null, updatedAt: now() });
      await record(); // a crash after a post must never send it again
      log(`draft sent for ${j.id}`);
    }
    for (const j of jobs.filter((x) => x.phase === 'failed' && !x.noticed)) {
      const ts = await slack.post(`[${j.key}] งานหยุดครับ: ${j.error}\nตอบในเธรดนี้เพื่อให้ลองใหม่พร้อมคำแนะนำได้ครับ`, j.thread ?? undefined);
      Object.assign(j, { thread: j.thread ?? ts, draftTs: ts, noticed: true });
      await record();
    }
    // new runs within the cap (R6); a rework starts again from the work stage
    for (const j of pick(jobs)) {
      const dir = jobDir(j);
      mkdirSync(dir, { recursive: true });
      const t = tickets.find((x) => x.key === j.key);
      writeFileSync(join(dir, j.kind === 'e2e' ? 'case.json' : 'ticket.json'), JSON.stringify(j.kind === 'e2e' ? j.case ?? { id: j.key } : t ?? { key: j.key }, null, 2));
      j.noticed = false;
      startRun(j, 'work');
      log(`started ${j.id}`);
    }

    state.jobs = jobs;
    const pub = await publishIfChanged({ payload: boardPayload({ tickets, jobs, readAt: now() }), lastHash: state.boardHash ?? null, run: (c, a) => run(c, a, { timeout: 60000, maxBuffer: 1 << 24 }) });
    state.boardHash = pub.hash;
    saveState(state);
    log(`tick done: running ${count('running') + count('review')}, waiting for owner ${count('draft-sent')}, failed ${count('failed')}, board ${pub.changed ? 'published' : 'unchanged'}`);
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`${now()} tick failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
