// Work orders for the ols-qa skills. Spec: docs/sdd/ols-real/spec.md R4, R5, R11, R12, R18, R19, E2.
// Since 19 Oct 2026 (R4) the tick spawns no `claude`: it writes an order, the Desktop scheduled session
// runs it with one Agent call of the type below (under the host login), writes `<stage>.done.json`,
// and the next tick collects the job from that file.
import { join } from 'node:path';
import { JUDGING, draftProblems } from './draft-check.mjs';

/** R4: the agent type the session must use (`.claude/agents/ols-qa-worker.md`); no fallback. */
export const AGENT = 'ols-qa-worker';

/** E2: an order with no done file this long after it was written has failed. */
export const RUN_LIMIT_MS = 2 * 60 * 60 * 1000;

/** R4, R5, R11: the skill per duty and stage (P2, P3, P6, P8). */
export const SKILLS = {
  'write-tc': { work: ['tc-fe-prep-workflow', 'tc-api-prep-workflow'] },
  'review-tc': { work: ['tc-review-workflow'] },
  test: { work: ['testing-ticket-workflow'], review: ['review-result-workflow'] },
  retest: { work: ['retest-bug-workflow'] },
  'e2e-fix': { work: ['playwright-best-practices', 'flaky-test-doctor'], review: ['code-review'] },
};

const OUTPUT = (dir) =>
  `เขียนผลลัพธ์สองไฟล์ในโฟลเดอร์ ${dir}:\n` +
  `- draft.md: ร่างภาษาไทยที่เจ้าของจะอ่านใน Slack (สรุปผล หลักฐาน และข้อความที่จะโพสต์)\n` +
  `- actions.json: JSON array ของสิ่งที่เสนอให้เขียนหลังเจ้าของตอบ passed เท่านั้น ` +
  `ชนิดที่ใช้ได้: {"type":"jira.comment","body"}, {"type":"jira.transition","to"}, {"type":"jira.tcStatus","value"}, ` +
  `{"type":"jira.assign","accountId"}, {"type":"sheet.createTab","rows":[...16 คอลัมน์แบบ OLS-44]}, {"type":"e2e.merge","pr"}, ` +
  `{"type":"sheet.results","sheet","tab","gid","rows":[{"row","tc","status","actual"}]} (แบบ sheet_write.py), ` +
  `{"type":"jira.mentionPo","accountId","cases":["AC..."],"body"}\n` +
  `ลำดับของงานทดสอบและรีเทส: jira.comment แล้ว sheet.results แล้ว jira.transition แล้ว jira.mentionPo ` +
  `ถ้ามีเคส po-question ต้อง jira.transition เป็น BLOCKED และ jira.mentionPo ที่ระบุทุกเคสนั้น\n`;

/** ols-retest-procedure R2, R3 (layer 14): the third file of a duty that judges cases. */
const CASES = (dir) =>
  `- cases.json: JSON array หนึ่งรายการต่อเคส {"ac","status","source","conflict","refusal"} ` +
  `status เป็น passed, failed, blocked หรือ po-question เท่านั้น: failed ต้องมี source ที่ยกข้อความจากแหล่งที่ยืนยันแล้ว ` +
  `ถ้าแหล่งขัดกัน (ticket ตอนนี้ ประวัติ ticket ดีไซน์ โค้ด) ให้เป็น po-question ไม่ใช่ failed, ` +
  `blocked ต้องมี refusal ที่ยกข้อความ error จริงตอนสร้างข้อมูลทดสอบไม่ได้ ไม่มีไฟล์นี้หรือผิดกฎ งานนี้ล้มเหลว (${dir}/cases.json)\n`;

const RULES =
  'กฎ: ห้ามเขียน Jira ห้ามเขียน Google Sheet ห้ามส่ง Slack หรือ Discord เอง ห้ามใช้ MCP ทุกตัว ทุกจุดที่สกิลบอกว่า "with approval" ' +
  'หรือรออนุมัติ ให้หยุดที่ร่าง แล้วใส่สิ่งที่จะเขียนใน actions.json แทน ห้ามแต่งผลที่ไม่ได้ทำจริง ' +
  'ห้ามอ่าน คัดลอก หรือพิมพ์ไฟล์ token, secret หรือ credential ใดๆ ในเครื่อง ห้ามพิมพ์รหัสผ่านหรือ token ลงไฟล์ใดๆ ' +
  'ถ้าทำไม่ได้ (เช่น VPN ไม่ต่อ หรือต้องดู Figma ซึ่งไม่มีให้) ให้เขียนเหตุผลจริงใน draft.md และ actions.json เป็น []\n';

const WHERE = (cwd) => `ทำงานในโฟลเดอร์ ${cwd} ใช้ path เต็มทุกครั้ง (cwd ของคุณอาจไม่ใช่โฟลเดอร์นี้)\n`;

function ticketPrompt(job, stage, paths) {
  const skills = SKILLS[job.duty][stage].map((s) => `${paths.olsQaDir}/skills/${s}/SKILL.md`).join(' หรือ ');
  const who = stage === 'review' ? 'คุณคือ QA Lead agent ของทีม (คนละตัวกับ QA ที่ทำงานรอบแรก)' : 'คุณคือ QA agent ของทีม';
  const pick = job.duty === 'write-tc' ? 'เลือก tc-fe-prep สำหรับงานหน้าจอ หรือ tc-api-prep สำหรับงาน API ตามที่สกิลกำหนด ' : '';
  const judging = JUDGING.has(job.duty);
  const review = stage === 'review'
    ? `อ่านผลรอบแรกที่ ${paths.jobDir}/work-draft.md และ ${paths.jobDir}/work-actions.json${judging ? ` และ ${paths.jobDir}/work-cases.json` : ''} พร้อมหลักฐานของรอบทดสอบใน ${paths.jobDir} แล้วรีวิวผลตามสกิล ` +
      'เขียน draft.md และ actions.json ของรอบรีวิวขึ้นใหม่เอง (ไฟล์เดิมถูกลบแล้ว ถ้าไม่เขียน งานนี้ล้มเหลว) '
    : '';
  const fb = job.feedback ? `เจ้าของตอบร่างก่อนหน้าว่า: "${job.feedback}" แก้ตามนี้\n` : '';
  return `${who} ทำงาน ${job.duty} ของ ticket ${job.key} ในโปรเจกต์ OLS\n${WHERE(paths.olsQaDir)}` +
    `อ่านและทำตามสกิล ${skills} ${pick}${review}\n` +
    `ข้อมูล ticket (อ่านอย่างเดียว) อยู่ที่ ${paths.jobDir}/ticket.json: ฟิลด์ description, criteria (acceptance criteria และ edge case ตามชื่อฟิลด์ใน Jira), ` +
    `history (ประวัติการแก้ description และ criteria เก่าไปใหม่: ผู้แก้ เวลา ฟิลด์ ค่าเดิม ค่าใหม่), ` +
    `comments (ผู้เขียน เวลา ข้อความ) และ cut (ส่วนที่ถูกตัด) ใช้แทนการเปิด Jira\n${fb}${RULES}${OUTPUT(paths.jobDir)}${judging ? CASES(paths.jobDir) : ''}`;
}

function e2ePrompt(job, stage, paths, pr) {
  const branch = `agent/e2e-${job.key}`;
  const wt = `${paths.jobDir}/wt`;
  const fb = job.feedback ? `ผลรอบก่อนหรือคำตอบเจ้าของ: "${job.feedback}"\n` : '';
  if (stage === 'rerun') {
    // R12, R19: after the owner's passed and the merge
    return `คุณคือ QA Lead agent PR #${pr} ของเคส e2e ${job.key} merge แล้ว สร้าง git worktree ใหม่ที่ ${paths.jobDir}/wt-merged-${pr} จาก origin/main ล่าสุดของ ${paths.e2eDir} ` +
      `(fetch ก่อน) แล้วรันเคส ${job.key} ซ้ำบน dev และรันชุดเต็ม (full suite) บน dev เทียบ baseline ก่อนแก้ รันบน dev เท่านั้น ` +
      `เขียนผลลง ${paths.jobDir}/rerun-${pr}.json เป็น {"ok": true|false, "summary": "<เคสผ่านกี่รอบ ชุดเต็มผ่าน/ไม่ผ่านกี่เคส เคสใหม่ที่พัง>"} ` +
      `ok เป็น true เฉพาะเมื่อเคสผ่านและไม่มีเคสใหม่ที่พัง แล้วลบ worktree ที่สร้าง\n${WHERE(paths.e2eDir)}${RULES}`;
  }
  if (stage === 'review') {
    return `คุณคือ QA Lead agent (คนละตัวกับคนแก้) รีวิว diff ของ branch ${branch} ใน worktree ${wt} ด้วยสกิล code-review ทุกบรรทัด ` +
      `เทียบกับ requirement ของเคส ${job.key} และหลักฐานใน ${paths.jobDir} ถ้าไม่ผ่าน เขียนเหตุผลใน draft.md และ actions.json เป็น [] ` +
      `ถ้าผ่าน push branch แล้วเปิด PR ด้วย gh pr create ใน Thitic9203/ols-qa-e2e แนบหลักฐาน แล้วใส่ {"type":"e2e.merge","pr":<เลข PR>} ใน actions.json ` +
      `ห้าม merge เอง\n${WHERE(paths.e2eDir)}${RULES}${OUTPUT(paths.jobDir)}`;
  }
  return `คุณคือ QA agent ซ่อมเคส e2e ${job.key} ที่ไม่ผ่านบน dev (ข้อมูลเคสและ error แรกอยู่ที่ ${paths.jobDir}/case.json)\n${WHERE(paths.e2eDir)}${fb}` +
    `1. สร้าง git worktree ใหม่ที่ ${wt} จาก origin/main ของ ${paths.e2eDir} บน branch ${branch} ห้ามใช้ checkout ของ smoke-watch\n` +
    `2. reproduce ก่อนเสมอ แล้วคัดแยก: test bug (selector, timing, ข้อมูลทดสอบ), app bug (แอปผิดจากสเปก: ห้ามแก้เทสต์ให้ผ่าน เขียนเหตุผลใน draft.md และ actions.json เป็น []), หรือ flaky (หาเหตุจริง)\n` +
    `3. แก้เฉพาะ test bug และ flaky ด้วยสกิล playwright-best-practices และ flaky-test-doctor ห้าม test.skip ห้าม test.fixme ห้ามเพิ่ม retries ห้ามเพิ่ม timeout ลอยๆ ห้ามลดเกณฑ์\n` +
    `4. ยืนยัน: รันเคสที่แก้ซ้ำหลายรอบบน dev ต้องผ่านทุกรอบ รันทุกเคสที่ใช้ helper fixture หรือ page object ที่แก้ แล้วรันชุดเต็ม (full suite) บน dev เทียบ baseline ก่อนแก้ ` +
    `ถ้ามีเคสใหม่ที่ไม่ผ่านแม้เคสเดียว ห้ามไปต่อ รันบน dev เท่านั้น ห้าม pre-prod หรือ prod\n` +
    `5. commit ใน worktree แต่ยังไม่ push ไม่เปิด PR (QA Lead ทำขั้นถัดไป) เขียนสรุปและหลักฐานใน draft.md\n${RULES}${OUTPUT(paths.jobDir)}`;
}

/** R4, R5, R19: the order for one stage ('work', 'review', or 'rerun' with its pull request). */
export function buildOrder({ job, stage, jobDir, olsQaDir, e2eDir, pr }) {
  if (stage === 'rerun' && job.kind !== 'e2e') throw new Error('rerun is e2e only');
  if (stage === 'rerun' && !Number.isInteger(pr)) throw new Error('rerun needs a pull request');
  const paths = { jobDir, olsQaDir, e2eDir };
  const prompt = job.kind === 'e2e' ? e2ePrompt(job, stage, paths, pr) : ticketPrompt(job, stage, paths);
  return {
    id: job.id,
    stage,
    agent: AGENT,
    cwd: job.kind === 'e2e' ? e2eDir : olsQaDir,
    jobDir,
    prompt,
    writes: stage === 'rerun' ? [`rerun-${pr}.json`] : ['draft.md', 'actions.json', ...(JUDGING.has(job.duty) ? ['cases.json'] : [])],
  };
}

/**
 * R5, E2: what the tick does in the job folder before an order goes out: keep the work output for the
 * review (`move`, in order), then remove every file the order is to write and its done file, so a
 * worker that writes nothing can never pass with an earlier stage's output.
 */
export function stageFiles(stage, pr) {
  if (stage === 'rerun') return { move: [], remove: [`rerun-${pr}.json`, 'rerun.done.json'] };
  if (stage === 'review') return { move: [['draft.md', 'work-draft.md'], ['actions.json', 'work-actions.json'], ['cases.json', 'work-cases.json']], remove: ['draft.md', 'actions.json', 'cases.json', 'review.done.json'] };
  return { move: [], remove: ['draft.md', 'actions.json', 'cases.json', 'work-draft.md', 'work-actions.json', 'work-cases.json', 'work.done.json', 'review.done.json'] };
}

/** R19, E2: the rerun's answer: its file, still pending, or a failure (stale, failed, or ok with no file). */
export function rerunResult({ dir, pr, fs, orderedAt, now }) {
  const name = `rerun-${pr}.json`;
  let text = null;
  try {
    text = String(fs.readFileSync(join(dir, name), 'utf8'));
  } catch {
    /* not written yet */
  }
  if (text !== null) {
    try {
      const out = JSON.parse(text);
      return { ok: out?.ok === true, summary: String(out?.summary ?? '') };
    } catch {
      return { ok: false, summary: `${name} is not valid JSON` };
    }
  }
  const d = readDone(dir, 'rerun', fs, { startedAt: orderedAt, now });
  if (d.state === 'done') return { ok: false, summary: d.ok ? `rerun.done.json says ok but ${name} is missing` : d.error ?? 'worker reported a failure' };
  if (d.state === 'stale') return { ok: false, summary: `no ${name} 2 hours after the order` };
  return { pending: true };
}

/**
 * E2: a run counts only when it left draft.md and an actions.json array. ols-retest-procedure R2, R3
 * (layer 14): a duty that judges cases also needs a cases.json that passes draftProblems.
 */
export function readOutput(dir, fs, duty) {
  let draft;
  let actions;
  try {
    draft = String(fs.readFileSync(join(dir, 'draft.md'), 'utf8'));
    actions = JSON.parse(String(fs.readFileSync(join(dir, 'actions.json'), 'utf8')));
  } catch (e) {
    return { ok: false, error: `no draft.md or actions.json (${e instanceof Error ? e.message.split('\n')[0] : 'read error'})` };
  }
  if (!Array.isArray(actions)) return { ok: false, error: 'actions.json is not an array' };
  if (!JUDGING.has(duty)) return { ok: true, draft, actions };
  let text;
  try {
    text = String(fs.readFileSync(join(dir, 'cases.json'), 'utf8'));
  } catch {
    return { ok: false, error: `no cases.json (R2, R3: a ${duty} lists every case it judged)` };
  }
  let cases;
  try {
    cases = JSON.parse(text);
  } catch {
    return { ok: false, error: 'cases.json is not valid JSON' };
  }
  const bad = draftProblems(cases);
  if (bad.length) return { ok: false, error: bad[0].startsWith('cases.json') ? bad[0] : `cases.json: ${bad.join('; ')}` };
  return { ok: true, draft, actions, cases };
}

/** R18, E2: the session's done file for a stage: done (ok or not), still waiting, or stale past the limit. */
export function readDone(dir, stage, fs, { startedAt, now, limitMs = RUN_LIMIT_MS }) {
  const name = `${stage}.done.json`;
  let text;
  try {
    text = String(fs.readFileSync(join(dir, name), 'utf8'));
  } catch {
    const age = Date.parse(now) - Date.parse(startedAt ?? now);
    return age > limitMs ? { state: 'stale' } : { state: 'waiting' };
  }
  try {
    const d = JSON.parse(text);
    return { state: 'done', ok: d?.ok === true, error: d?.ok === true ? null : String(d?.error ?? '') || null };
  } catch {
    return { state: 'done', ok: false, error: `${name} is not valid JSON` };
  }
}

/** R18, E2: null while the order is out; otherwise the result afterRun takes. */
export function collect({ job, dir, fs, now }) {
  const d = readDone(dir, job.stage, fs, { startedAt: job.startedAt, now });
  if (d.state === 'waiting') return null;
  if (d.state === 'stale') return { ok: false, error: `no ${job.stage}.done.json 2 hours after the order` };
  if (!d.ok) return { ok: false, error: d.error ?? 'worker reported a failure' };
  return readOutput(dir, fs, job.duty);
}
