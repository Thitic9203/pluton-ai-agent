// The live tick's Slack and collect steps, with the clients and fs injected so they can be tested.
// Spec: docs/sdd/ols-real/spec.md R5, R7, R9, R18, E1, E2, R21 to R24; docs/sdd/ols-retest-procedure/spec.md
// R5, R6, R9.
import { collect, readOutput } from './runner.mjs';
import { afterRun } from './dispatch.mjs';
import { checkActions } from './apply.mjs';
import { markupProblem, plain } from './slack.mjs';
import { draftText } from './gate.mjs';

/** E2, R21: the notice of a failed job; its error is free text, so its markup is neutralised. */
export const failureNotice = (j) => `[${j.key}] งานหยุดครับ: ${plain(j.error)}\nตอบในเธรดนี้เพื่อให้ลองใหม่พร้อมคำแนะนำได้ครับ`;

/** R9, R21: the result of an apply, said in the job's thread; its error and lines are free text. */
export const applyNotice = (r) =>
  r.ok
    ? `ทำตามที่อนุมัติแล้วครับ\n${plain(r.lines.join('\n'))}`
    : `ทำตามที่อนุมัติไม่ครบครับ: ${plain(r.error)}${r.lines?.length ? `\nทำแล้ว: ${plain(r.lines.join(', '))}` : ''}`;

/**
 * ols-retest-procedure R6, R9: post in the ticket's thread, then read the message back and keep the
 * result on the job. R22: `await mark(ts)` records and saves the post before the read-back, and a
 * read-back that throws is kept as a failed read-back, never thrown, so nothing is posted twice.
 */
export function makeSay({ slack, threads, log = () => {} }) {
  return async function say(j, text, mark) {
    const threadTs = threads[j.key];
    const ts = await slack.post(text, threadTs, { key: j.key, threads });
    if (mark) await mark(ts);
    let back;
    try {
      back = await slack.readBack(threads[j.key], ts, text);
    } catch (e) {
      back = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    j.readBacks = [...(j.readBacks ?? []), { step: 'slack.post', ts, ok: back.ok, ...(back.error ? { error: back.error } : {}) }].slice(-20);
    if (!back.ok) log(`read-back failed for ${j.id}: ${back.error}`);
    return ts;
  };
}

/** R18, E2: finished orders, from the session's done files; R5: a separate worker reviews. */
export async function collectStep({ jobs, jobDir, fs, now, writeOrder, record }) {
  for (const j of jobs.filter((x) => x.phase === 'running' || x.phase === 'review')) {
    const stage = j.stage ?? 'work';
    // ols-retest-procedure R2, R3: the duty decides whether cases.json is required and checked
    const out = collect({ job: { stage, startedAt: j.startedAt ?? j.updatedAt, duty: j.duty }, dir: jobDir(j), fs, now: now() });
    if (!out) continue;
    // E5; ols-retest-procedure R5: a draft carrying Jira wiki markup never reaches Slack
    // R24: the whole text the owner reads (the draft and every proposed write) is checked, so an
    // action body with markup fails here with a reason, not at the post
    const bad = out.ok ? checkActions(j.duty, out.actions, out.cases) ?? markupProblem(draftText(j, out.draft, out.actions)) : null;
    afterRun(j, bad ? { ok: false, error: bad } : out, stage, now());
    if (j.phase === 'review' && stage === 'work') writeOrder(j, 'review');
    await record(); // R23: saved before the next job, so moved work files and the saved stage agree
  }
}

/** R7, E2: ready drafts, then failure notices, each in the ticket's thread. */
export async function sendStep({ jobs, jobDir, fs, say, threads, record, now, log = () => {} }) {
  for (const j of jobs.filter((x) => x.phase === 'ready')) {
    const out = readOutput(jobDir(j), fs, j.duty);
    // R22: recorded as sent before the read-back; a crash after a post must never send it again
    await say(j, draftText(j, out.draft, out.actions), async (ts) => {
      Object.assign(j, { thread: threads[j.key], draftTs: ts, phase: 'draft-sent', feedback: null, updatedAt: now() });
      await record();
    });
    await record(); // the read-back result
    log(`draft sent for ${j.id}`);
  }
  for (const j of jobs.filter((x) => x.phase === 'failed' && !x.noticed)) {
    await say(j, failureNotice(j), async (ts) => {
      Object.assign(j, { thread: threads[j.key], draftTs: ts, noticed: true });
      await record();
    });
    await record(); // the read-back result
  }
}
