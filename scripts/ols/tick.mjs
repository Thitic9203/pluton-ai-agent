#!/usr/bin/env node
/*
 * One tick of the OLS agent (docs/sdd/ols-real/spec.md). Run by the Desktop scheduled task
 * `ols-agent` every 30 minutes in working hours (R1), several times per run (R18).
 *
 *   node scripts/ols/tick.mjs          dry: reads Jira and the newest dev run, prints the plan, sends nothing
 *   node scripts/ols/tick.mjs --live   the real tick: DM drafts, work orders, approved writes, board publish
 *
 * Order of a live tick: read the intake and the failing e2e cases -> reconcile jobs -> read the owner's
 * replies on sent drafts -> apply approved writes -> collect finished orders (their done files) -> send
 * ready drafts and failure notices -> order new work within the cap -> save -> publish the board when it
 * changed. R4: no `claude` process is spawned; the scheduled session runs each order with the
 * `ols-qa-worker` agent and writes `<stage>.done.json`. The last line is `ORDERS <json array>`.
 * Prints counts and keys only; never a credential, a draft or a ticket summary.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { JQL, FIELDS, normalize, dutyOf, ticketContext } from './lib/classify.mjs';
import { verdict } from './lib/gate.mjs';
import { newestRunDir, failedCases } from './lib/e2e.mjs';
import { buildOrder, readOutput, stageFiles, rerunResult, RUN_LIMIT_MS } from './lib/runner.mjs';
import { reconcile, pick, afterVerdict, afterApply, contextCandidates, applyActions } from './lib/dispatch.mjs';
import { applyJob } from './lib/apply.mjs';
import { loadJiraCreds, createJira } from './lib/jira.mjs';
import { loadSlackToken, createSlack } from './lib/slack.mjs';
import { makeSay, applyNotice, collectStep, sendStep } from './lib/tick-steps.mjs';
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
  runsDir: join(HOME, 'ols-qa-testing-bot/out'),
  sheetWrite: join(HOME, 'ols-qa-testing-bot/sheet_write.py'),
};
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
/** R4, R18: the orders written in this tick, printed on the last line for the scheduled session. */
const orders = [];

/** R4: writes the job's work order; the session runs it and writes `<stage>.done.json` (R18). */
function writeOrder(j, stage, pr) {
  const dir = jobDir(j);
  mkdirSync(dir, { recursive: true });
  const o = buildOrder({ job: j, stage, jobDir: dir, olsQaDir: PATHS.olsQaDir, e2eDir: PATHS.e2eDir, pr });
  // R5, E2: keep the work output for the review, then remove every file this order writes
  const files = stageFiles(stage, pr);
  for (const [from, to] of files.move) if (existsSync(join(dir, from))) renameSync(join(dir, from), join(dir, to));
  for (const f of files.remove) rmSync(join(dir, f), { force: true });
  writeFileSync(join(dir, 'order.json'), JSON.stringify(o, null, 2));
  orders[orders.length] = { id: o.id, stage, agent: o.agent, order: join(dir, 'order.json'), done: join(dir, `${stage}.done.json`) };
  if (stage !== 'rerun') Object.assign(j, { pid: null, stage, startedAt: now(), phase: stage === 'review' ? 'review' : 'running', updatedAt: now() });
}

function realClients(jira, jobs) {
  return {
    jira,
    sheet: {
      async createTab(key, rows, { dryRun }) {
        const file = join(JOBS, `${key}-rows.json`);
        writeFileSync(file, JSON.stringify(rows));
        await run('python3', [PATHS.sheetWrite, '--create-tab', key, '--rows', file, ...(dryRun ? ['--dry-run'] : [])], { timeout: 300000, maxBuffer: 1 << 24 });
      },
      /**
       * ols-retest-procedure R8: the result mode of sheet_write.py (its L1 to L3 guard; exit 0 means
       * every row was written and read back clean, R9). A non-zero exit rejects, so the apply stops.
       */
      async results(a, { dryRun }) {
        const file = join(JOBS, `${a.tab}-results.json`);
        writeFileSync(file, JSON.stringify(a.rows));
        await run('python3', [PATHS.sheetWrite, '--sheet', a.sheet, '--tab', a.tab, '--gid', String(a.gid), '--rows', file, ...(dryRun ? ['--dry-run'] : [])], { timeout: 300000, maxBuffer: 1 << 24 });
      },
    },
    gh: { merge: (pr) => run('gh', ['pr', 'merge', String(pr), '-R', 'Thitic9203/ols-qa-e2e', '--merge'], { timeout: 120000, maxBuffer: 1 << 24 }) },
    e2e: {
      /** R19: the rerun is a worker order; pending until `rerun-<pr>.json` exists, failed past the limit (E2). */
      async rerun(caseId, pr) {
        const j = jobs.find((x) => x.id === `e2e:${caseId}`);
        if (!j) return { ok: false, summary: `no job e2e:${caseId}` };
        if (j.rerun?.pr === pr) return rerunResult({ dir: jobDir(j), pr, fs: { readFileSync }, orderedAt: j.rerun.orderedAt, now: now() });
        writeOrder(j, 'rerun', pr);
        j.rerun = { pr, orderedAt: now() };
        return { pending: true };
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
      for (const j of pick(jobs)) log(`would order ${j.id}`);
      log(`dry run: queued ${count('queued')}, running ${count('running') + count('review')}, waiting for owner ${count('draft-sent')}; nothing sent`);
      return;
    }

    // R17, E1: the context of every job that could be ordered this tick is read now, right after the
    // search and before any reply is read, any write applied or any message posted, so a failed GET
    // leaves the tick with nothing changed
    const contexts = new Map();
    for (const j of contextCandidates(jobs)) {
      const [issue, page] = await Promise.all([jira.issue(j.key), jira.comments(j.key)]);
      contexts.set(j.id, ticketContext(issue, page));
    }

    const slack = createSlack({ token: loadSlackToken({ readFile: readFileSync }), fetch });
    // ols-retest-procedure R6: one DM thread per ticket key, across its duties (write-tc, review-tc, test)
    const threads = (state.threads = state.threads ?? {});
    for (const j of jobs) if (j.thread && !threads[j.key]) threads[j.key] = j.thread;
    const record = async () => saveState({ ...state, jobs });
    // R6, R9, R22: post in the ticket's thread, then read it back (lib/tick-steps.mjs)
    const say = makeSay({ slack, threads, log });

    // the owner's replies (R8)
    for (const j of jobs.filter((x) => (x.phase === 'draft-sent' || x.phase === 'failed') && x.thread)) {
      afterVerdict(j, verdict({ replies: await slack.replies(j.thread), draftTs: j.draftTs ?? j.thread }), now());
    }
    // approved writes (R9, R12)
    for (const j of jobs.filter((x) => x.phase === 'approved')) {
      // ols-retest-procedure R2, R3, R8: a judging duty applies with the cases it judged
      const out = readOutput(jobDir(j), { readFileSync }, j.duty);
      // ols-retest-procedure R7: the owner's lines after `passed` are applied in the same round
      const r = out.ok
        ? await applyJob({ job: j, actions: applyActions(j, out.actions), cases: out.cases, clients: realClients(jira, jobs), record })
        : { ok: false, error: out.error, lines: [] };
      if (r.pending) { await record(); log(`applied ${j.id}: rerun pending`); continue; }
      afterApply(j, r, now());
      await record();
      await say(j, applyNotice(r));
      log(`applied ${j.id}: ${r.ok ? 'ok' : 'stopped'}`);
    }
    // finished orders, from the session's done files (R18, E2, R5, R23)
    await collectStep({ jobs, jobDir, fs: { readFileSync }, now, writeOrder, record });
    // drafts and failure notices (R7, E2, R21, R22)
    await sendStep({ jobs, jobDir, fs: { readFileSync }, say, threads, record, now, log });
    // new work within the cap (R6); a rework starts again from the work stage
    for (const j of pick(jobs)) {
      if (j.kind !== 'e2e' && !contexts.has(j.id)) { log(`no context read for ${j.id}; not ordered this tick`); continue; }
      const dir = jobDir(j);
      mkdirSync(dir, { recursive: true });
      const t = tickets.find((x) => x.key === j.key);
      writeFileSync(join(dir, j.kind === 'e2e' ? 'case.json' : 'ticket.json'), JSON.stringify(j.kind === 'e2e' ? j.case ?? { id: j.key } : { ...(t ?? { key: j.key }), ...contexts.get(j.id) }, null, 2));
      j.noticed = false;
      writeOrder(j, 'work');
      log(`ordered ${j.id}`);
    }

    state.jobs = jobs;
    const pub = await publishIfChanged({ payload: boardPayload({ tickets, jobs, readAt: now() }), lastHash: state.boardHash ?? null, run: (c, a) => run(c, a, { timeout: 60000, maxBuffer: 1 << 24 }) });
    state.boardHash = pub.hash;
    saveState(state);
    log(`tick done: running ${count('running') + count('review')}, waiting for owner ${count('draft-sent')}, failed ${count('failed')}, board ${pub.changed ? 'published' : 'unchanged'}, orders ${orders.length}`);
    console.log(`ORDERS ${JSON.stringify(orders)}`); // R18: the scheduled session reads this last line
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`${now()} tick failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
