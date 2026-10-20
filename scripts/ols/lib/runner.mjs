// Headless runs of the ols-qa skills. Spec: docs/sdd/ols-real/spec.md R4, R5, R11, E2.
// Builds the `claude -p` call (the agent-dm-worker pattern) and reads its two output files.
import { join } from 'node:path';

/** R4, R5, R11: the skill per duty and stage (P2, P3, P6, P8). */
export const SKILLS = {
  'write-tc': { work: ['tc-fe-prep-workflow', 'tc-api-prep-workflow'] },
  'review-tc': { work: ['tc-review-workflow'] },
  test: { work: ['testing-ticket-workflow'], review: ['review-result-workflow'] },
  retest: { work: ['retest-bug-workflow'] },
  'e2e-fix': { work: ['playwright-best-practices', 'flaky-test-doctor'], review: ['code-review'] },
};

/** Only these reach the run's environment: no Jira, Slack, GitHub or test credential (R4). */
const KEEP_ENV = ['HOME', 'PATH', 'NODE_EXTRA_CA_CERTS', 'LANG', 'TZ'];

const OUTPUT = (dir) =>
  `เขียนผลลัพธ์สองไฟล์ในโฟลเดอร์ ${dir}:\n` +
  `- draft.md: ร่างภาษาไทยที่เจ้าของจะอ่านใน Slack (สรุปผล หลักฐาน และข้อความที่จะโพสต์)\n` +
  `- actions.json: JSON array ของสิ่งที่เสนอให้เขียนหลังเจ้าของตอบ passed เท่านั้น ` +
  `ชนิดที่ใช้ได้: {"type":"jira.comment","body"}, {"type":"jira.transition","to"}, {"type":"jira.tcStatus","value"}, ` +
  `{"type":"jira.assign","accountId"}, {"type":"sheet.createTab","rows":[...16 คอลัมน์แบบ OLS-44]}, {"type":"e2e.merge","pr"}\n`;

const RULES =
  'กฎ: ห้ามเขียน Jira ห้ามเขียน Google Sheet ห้ามส่ง Slack หรือ Discord เอง ทุกจุดที่สกิลบอกว่า "with approval" ' +
  'หรือรออนุมัติ ให้หยุดที่ร่าง แล้วใส่สิ่งที่จะเขียนใน actions.json แทน ห้ามแต่งผลที่ไม่ได้ทำจริง ' +
  'ห้ามพิมพ์รหัสผ่านหรือ token ลงไฟล์ใดๆ ถ้าทำไม่ได้ (เช่น VPN ไม่ต่อ) ให้เขียนเหตุผลจริงใน draft.md และ actions.json เป็น []\n';

function ticketPrompt(job, stage, paths) {
  const skills = SKILLS[job.duty][stage].map((s) => `${paths.olsQaDir}/skills/${s}/SKILL.md`).join(' หรือ ');
  const who = stage === 'review' ? 'คุณคือ QA Lead agent ของทีม' : 'คุณคือ QA agent ของทีม';
  const pick = job.duty === 'write-tc' ? 'เลือก tc-fe-prep สำหรับงานหน้าจอ หรือ tc-api-prep สำหรับงาน API ตามที่สกิลกำหนด ' : '';
  const review = stage === 'review' ? `อ่าน draft.md และหลักฐานของรอบทดสอบใน ${paths.jobDir} แล้วรีวิวผลตามสกิล แก้ draft.md และ actions.json ให้ถูกต้อง ` : '';
  const fb = job.feedback ? `เจ้าของตอบร่างก่อนหน้าว่า: "${job.feedback}" แก้ตามนี้\n` : '';
  return `${who} ทำงาน ${job.duty} ของ ticket ${job.key} ในโปรเจกต์ OLS\n` +
    `อ่านและทำตามสกิล ${skills} ${pick}${review}\n` +
    `ข้อมูล ticket (อ่านอย่างเดียว) อยู่ที่ ${paths.jobDir}/ticket.json\n${fb}${RULES}${OUTPUT(paths.jobDir)}`;
}

function e2ePrompt(job, stage, paths) {
  const branch = `agent/e2e-${job.key}`;
  const wt = `${paths.jobDir}/wt`;
  const fb = job.feedback ? `ผลรอบก่อนหรือคำตอบเจ้าของ: "${job.feedback}"\n` : '';
  if (stage === 'rerun') {
    // R12: after the owner's passed and the merge
    return `คุณคือ QA Lead agent PR ของเคส e2e ${job.key} merge แล้ว สร้าง git worktree ใหม่ที่ ${paths.jobDir}/wt-merged จาก origin/main ล่าสุดของ ${paths.e2eDir} ` +
      `(fetch ก่อน) แล้วรันเคส ${job.key} ซ้ำบน dev และรันชุดเต็ม (full suite) บน dev เทียบ baseline ก่อนแก้ รันบน dev เท่านั้น ` +
      `เขียนผลลง ${paths.jobDir}/rerun.json เป็น {"ok": true|false, "summary": "<เคสผ่านกี่รอบ ชุดเต็มผ่าน/ไม่ผ่านกี่เคส เคสใหม่ที่พัง>"} ` +
      `ok เป็น true เฉพาะเมื่อเคสผ่านและไม่มีเคสใหม่ที่พัง แล้วลบ worktree ที่สร้าง\n${RULES}`;
  }
  if (stage === 'review') {
    return `คุณคือ QA Lead agent (คนละตัวกับคนแก้) รีวิว diff ของ branch ${branch} ใน worktree ${wt} ด้วยสกิล code-review ทุกบรรทัด ` +
      `เทียบกับ requirement ของเคส ${job.key} และหลักฐานใน ${paths.jobDir} ถ้าไม่ผ่าน เขียนเหตุผลใน draft.md และ actions.json เป็น [] ` +
      `ถ้าผ่าน push branch แล้วเปิด PR ด้วย gh pr create ใน Thitic9203/ols-qa-e2e แนบหลักฐาน แล้วใส่ {"type":"e2e.merge","pr":<เลข PR>} ใน actions.json ` +
      `ห้าม merge เอง\n${RULES}${OUTPUT(paths.jobDir)}`;
  }
  return `คุณคือ QA agent ซ่อมเคส e2e ${job.key} ที่ไม่ผ่านบน dev (ข้อมูลเคสและ error แรกอยู่ที่ ${paths.jobDir}/case.json)\n${fb}` +
    `1. สร้าง git worktree ใหม่ที่ ${wt} จาก origin/main ของ ${paths.e2eDir} บน branch ${branch} ห้ามใช้ checkout ของ smoke-watch\n` +
    `2. reproduce ก่อนเสมอ แล้วคัดแยก: test bug (selector, timing, ข้อมูลทดสอบ), app bug (แอปผิดจากสเปก: ห้ามแก้เทสต์ให้ผ่าน เขียนเหตุผลใน draft.md และ actions.json เป็น []), หรือ flaky (หาเหตุจริง)\n` +
    `3. แก้เฉพาะ test bug และ flaky ด้วยสกิล playwright-best-practices และ flaky-test-doctor ห้าม test.skip ห้าม test.fixme ห้ามเพิ่ม retries ห้ามเพิ่ม timeout ลอยๆ ห้ามลดเกณฑ์\n` +
    `4. ยืนยัน: รันเคสที่แก้ซ้ำหลายรอบบน dev ต้องผ่านทุกรอบ รันทุกเคสที่ใช้ helper fixture หรือ page object ที่แก้ แล้วรันชุดเต็ม (full suite) บน dev เทียบ baseline ก่อนแก้ ` +
    `ถ้ามีเคสใหม่ที่ไม่ผ่านแม้เคสเดียว ห้ามไปต่อ รันบน dev เท่านั้น ห้าม pre-prod หรือ prod\n` +
    `5. commit ใน worktree แต่ยังไม่ push ไม่เปิด PR (QA Lead ทำขั้นถัดไป) เขียนสรุปและหลักฐานใน draft.md\n${RULES}${OUTPUT(paths.jobDir)}`;
}

/** R4: the call. `stage` is 'work' or 'review' (R5). */
/**
 * Review B1, B2 (17 Oct 2026): what a run may never touch. Only tick.mjs's apply step holds the Jira
 * credential and runs sheet_write.py or `gh pr merge`. A Bash deny list is not a sandbox (a run could
 * still compose a path); the sandbox HOME and the empty env are the first layer, this list the second.
 */
export function denyList(realHome) {
  const bot = `${realHome}/ols-qa-testing-bot`;
  const sec = `${realHome}/.ols-qa-secrets`;
  return [
    `Read(/${bot}/**)`, `Read(/${sec}/**)`, `Edit(/${bot}/**)`, `Edit(/${sec}/**)`,
    'Bash(*ols-qa-testing-bot*)', 'Bash(*.ols-qa-secrets*)', 'Bash(*jira_token*)',
    'Bash(python3 *sheet_write*)', 'Bash(*sheet_write*)', 'Bash(cat *jira*)',
    'Bash(gh pr merge*)', 'Bash(git push*main*)',
    'Bash(curl *)', 'Bash(curl:*)', 'Bash(wget *)', 'Bash(wget:*)', 'WebFetch',
    'mcp__*',
  ];
}

/** Review B3: a run is spawned detached, so its pid is a process group; stop the whole group. */
export function stopRun(pid, kill = process.kill.bind(process)) {
  try { kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
}

export function buildRun({ job, stage, env, jobDir, olsQaDir, e2eDir, claude, sandboxHome }) {
  if (stage === 'rerun' && job.kind !== 'e2e') throw new Error('rerun is e2e only');
  if (!sandboxHome) throw new Error('buildRun needs a sandboxHome');
  const realHome = String(env?.HOME ?? '');
  const paths = { jobDir, olsQaDir, e2eDir };
  const prompt = job.kind === 'e2e' ? e2ePrompt(job, stage, paths) : ticketPrompt(job, stage, paths);
  const cleanEnv = Object.fromEntries(Object.entries(env ?? {}).filter(([k]) => KEEP_ENV.includes(k)));
  // claude keeps its login in its config dir (and the macOS keychain), so only that is pointed back
  cleanEnv.HOME = sandboxHome;
  cleanEnv.CLAUDE_CONFIG_DIR = `${realHome}/.claude`;
  const args = [
    '-p', prompt,
    '--strict-mcp-config',
    '--no-session-persistence',
    '--setting-sources', '', // ols-qa's project settings allow Bash(cat *), Bash(python3 *): not loaded
    '--settings', JSON.stringify({ permissions: { deny: denyList(realHome) } }),
    '--permission-mode', 'acceptEdits',
    '--add-dir', jobDir,
  ];
  return { cmd: claude, args, cwd: job.kind === 'e2e' ? e2eDir : olsQaDir, env: cleanEnv };
}

/** E2: a run counts only when it left draft.md and an actions.json array. */
export function readOutput(dir, fs) {
  let draft;
  let actions;
  try {
    draft = String(fs.readFileSync(join(dir, 'draft.md'), 'utf8'));
    actions = JSON.parse(String(fs.readFileSync(join(dir, 'actions.json'), 'utf8')));
  } catch (e) {
    return { ok: false, error: `no draft.md or actions.json (${e instanceof Error ? e.message.split('\n')[0] : 'read error'})` };
  }
  if (!Array.isArray(actions)) return { ok: false, error: 'actions.json is not an array' };
  return { ok: true, draft, actions };
}
