// One-off: mock v62 (split by scripts/agent-office-split-assets.mjs) -> agent-office/public/index.html.
// Every edit must match exactly the expected number of times, or the build stops.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
let headersText = '';
const [src, out] = process.argv.slice(2);
let h = readFileSync(src, 'utf8');
const count = (s) => h.split(s).length - 1;
function rep(find, to, n = 1) {
  const c = count(find);
  if (c !== n) throw new Error(`expected ${n} of: ${find.slice(0, 90)} · found ${c}`);
  h = h.split(find).join(to);
}
function cut(start, end, to) {
  const a = h.indexOf(start), b = h.indexOf(end, a + 1);
  if (a < 0 || b < 0 || count(start) !== 1 || h.indexOf(end) !== b) throw new Error(`range not unique: ${start.slice(0, 60)} .. ${end.slice(0, 60)}`);
  h = h.slice(0, a) + to + h.slice(b);
}

// ---------- head: theme before first paint (R18), styles for the live-only lines (R10, R11, R40, R45, R58) ----------
function first(find, to) { const i = h.indexOf(find); if (i < 0) throw new Error('missing ' + find); h = h.slice(0, i) + to + h.slice(i + find.length); }
first('<style>', `<script>try{var t=JSON.parse(localStorage.getItem('ao3.theme'));if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}</script>
<style>`);
first('</style>', `.live-line{font-size:13px;color:var(--muted);flex-basis:100%;text-align:right;margin:0}
.nosrc{color:var(--muted);font-weight:500}
[data-src]{cursor:help}
.src-tip{position:fixed;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:60;padding:10px 14px;border-radius:12px;background:var(--surface);color:var(--ink);border:1px solid var(--line);font-size:14px;line-height:1.5}
.pm-ro{margin:4px 0;min-height:44px;display:flex;align-items:center}
.signin{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:var(--bg)}
.signin .box{max-width:420px;width:100%;text-align:center;display:grid;gap:12px}
.signin button{min-height:44px;padding:0 20px;border-radius:999px;border:1px solid var(--line);background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer}
.signin button[disabled]{opacity:.5;cursor:not-allowed}
.signin .msg{color:var(--muted);min-height:1.5em}
html:has(.signin:not([hidden])){overflow:hidden}
</style>`);

// ---------- markup ----------
rep('<div class="wrap">', `<div class="signin" id="signin"><div class="box"><h1>AI Agent Home Office</h1><p>ใช้สำหรับทีม Pluton เท่านั้น เพื่อดูงานของ AI Agent</p><button type="button" id="signinBtn">เข้าสู่ระบบด้วย Google</button><p class="msg" id="signinMsg" role="status"></p></div></div>
<div class="src-tip" id="srcTip" role="status" hidden></div>
<div class="wrap">`);
rep('<span id="summaryText">ทำงาน 0</span>', '<span id="summaryText"></span>');
rep('<span id="fundVal">฿0</span>', '<span id="fundVal"></span>');
rep('<i class="chip-st" id="debtChip">ชำระเรียบร้อยแล้ว</i></b><span id="debtHead">฿0</span>', '<i class="chip-st" id="debtChip"></i></b><span id="debtHead"></span>');
rep('<i class="chip-st" id="officeChip">ชำระเรียบร้อยแล้ว</i></b><span id="officeHead">฿0</span>', '<i class="chip-st" id="officeChip"></i></b><span id="officeHead"></span>');
rep('      </div>\n      <span class="pill clock" id="clock">--:--</span>', `      </div>
      <p class="live-line" id="agentOff" hidden>agent ยังไม่เปิดใช้งาน</p>
      <p class="live-line" id="fresh" role="status"></p>
      <span class="pill clock" id="clock">--:--</span>`);
rep('<span class="demo-note">ข้อมูลตัวอย่าง · แตะที่คนเพื่อสั่ง</span>', '<span class="demo-note">ข้อมูลจริงจาก GitHub · แตะที่คนเพื่อดูงาน</span>'); // R22
rep('<i id="hudFund">฿0</i>', '<i id="hudFund"></i>');
rep('<i id="hudDebt">฿0</i>', '<i id="hudDebt"></i>');
rep('<button type="button" class="add" id="addBtn">+ เพิ่ม Dev</button>', '<a class="add" id="rosterPr" href="https://github.com/Thitic9203/pluton-timesheet/blob/main/agent-office/projects.config.json" target="_blank" rel="noopener">แก้ทีมผ่าน pull request</a>'); // R28
cut('        <section class="scard"><h3>การจำลองงาน</h3>', '      </div>\n\n      <div id="pane-projects"', ''); // R29, R49
cut('<div class="proj-grid">', '      </div>\n    </aside>', '<div class="proj-grid" id="projGrid"></div>\n'); // R30: cards from the config via the state
rep('<p class="mnote">ได้เมื่อ issue ผ่าน Gate 4 · ตัวเลขจำลอง</p>', '<p class="mnote">ได้เมื่อ issue ปิดในรอบ release หลัง deploy production · เรทจากไฟล์ตั้งค่า</p>'); // R53
rep('<div class="kpi"><span>กองเงินสนับสนุนทีม</span><b id="kFund">฿0</b></div>', '<div class="kpi"><span>กองเงินสนับสนุนทีม</span><b id="kFund"></b></div>');
rep('<b id="debtVal">฿0</b>', '<b id="debtVal"></b>');
rep('<b id="paidOff">฿0</b>', '<b id="paidOff"></b>');
rep('<b id="saved" class="good">฿0</b>', '<b id="saved" class="good"></b>');
rep('<dt>อาหาร</dt><dd id="expFood"></dd><dt>เครื่องดื่ม</dt><dd id="expDrink"></dd><dt>ขนมและไอศกรีม</dt><dd id="expSnack"></dd>', '<dt>อาหาร</dt><dd id="expFood"></dd>'); // R36
rep('        <p class="stock"><b>เสบียงคงเหลือ</b> <span id="stockLine"></span></p>\n', ''); // R36
cut('<p class="mnote">ค่าเสบียงเกิดเมื่อกดตู้เย็น', '</article>\n      <article class="mcard" id="costSources"', '<p class="mnote">ไฟฟ้าคิดจากนาทีที่ job ของ agent รันจริง · น้ำจากรอบแก้ CI แดง · เน็ตจากวันตามปฏิทิน · เสบียงจากวันทำงานจริงต่อคน · ตัดบิลเที่ยงคืนเวลาไทย Head หักจากกองเงินสนับสนุนทีมอัตโนมัติ · เรทอยู่ในไฟล์ตั้งค่า ดูที่ "ที่มาของค่าใช้จ่าย"</p>\n      '); // R36, R61
rep(' · บนหน้านี้ (ต้นแบบ) ตัวเลขยังจำลอง</p>', '</p>');
cut('<table class="rt"><tbody>\n          <tr><th scope="row">ค่าใช้จ่ายด้าน AI</th>', '      </article>\n        <article class="mcard">\n        <h3>ค่าใช้จ่ายด้าน AI</h3>', '<table class="rt"><tbody id="costMethod"></tbody></table>\n'); // R64: rows from the config through the state
rep('        <button type="button" class="pay" id="payDebt">ชำระค่าใช้จ่ายด้าน AI ด้วยเงินสนับสนุนทีม</button>\n', ''); // R36
rep('<b id="fxVal">฿33.58</b>', '<b id="fxVal">ยังอ่านอัตราไม่ได้</b>'); // R13

// ---------- module: imports ----------
rep('<script type="module">\n', `<script type="module">
// Live data only (spec docs/sdd/agent-office-live/spec.md R0, R49): the board reads GET /data/state.json through app/live.js.
import { start as startLive, viewOf, moneyRows, issuesOf, projectsOf, releaseText, workEvents, freshText, boardLines, fmtBangkok, baht, isFlavourSafe, NO_SOURCE, NO_SIZE } from './live.js';
// R49a: the mock's ambient life (walking, breaks at every object in turn, chatter); work facts stay the snapshot's.
import { AMBIENT, ambientStep, pickSpeaker, safeLine } from './ambient.js';
`);

// ---------- config and state: no seeded issues, people or projects ----------
rep("  const SWEEP = { steps: 3, perRole: 1, total: 5, breakEvery: 3, breakSteps: 11 }; // a break lasts about one activity (45 s at 4 s a step)\n", '');
cut('  const SWEEPS = {', '  const store = {', `  // Projects, their key formats and the roster come from the config through the state endpoint (R1, R30); none is typed here.
  let PROJECTS_LIVE = [];
  const CONFIG = { project: 'Taskfolio' };
  const relBatch = pj => { const p = PROJECTS_LIVE.find(x => x.name === pj); return p && p.release ? p.release.batch : 0; };
  const live = { state: null, failed: false, forbidden: false };

`);
rep('  let people = [], issues = [], nextNum = CONFIG.next, uid = 1, hoverPid = null;', '  let people = [], issues = [], uid = 1, hoverPid = null;');
rep('  let simulate = true;\n', '');
cut('  function seedPeople() {', '  // Called by role;', `  // The roster of the config, in its order (R1, R20); a person keeps its id between reads so its figure stays put.
  function applyPeople(list) {
    const same = people.length === list.length && list.every((x, i) => people[i].role === x.role && people[i].slot === x.slot);
    if (!same) people = list.map((x, i) => ({ id: i + 1, slot: x.slot, look: i, role: x.role, duty: x.duty || ROLES[x.role].duty, state: 'idle', idleSpot: i % 3, gates: [] }));
    return !same;
  }

`);
rep("  const PROJECT_KEY = { Taskfolio: n => '#' + n, OLS: n => 'OLS-' + n };", '  let PROJECT_KEY = {}; // project name -> true, for the projects of the state');
// N8: the key is the function's, computed by agent-office/lib/derive.mjs issueKey; the page has no key rule of its own
rep('  const issueKey = i => (PROJECT_KEY[projectOf(i)] || CONFIG.key)(i.n);', '  const issueKey = i => i.key || String(i.n);');
rep("  const roleOf = i => i.lane === 'blocked' ? LANE[i.from].role : laneOf(i).role;", "  const roleOf = i => i.lane === 'blocked' ? (i.from && LANE[i.from] ? LANE[i.from].role : null) : laneOf(i) ? laneOf(i).role : null; // R4");
rep("  const building = () => issues.filter(i => i.lane === 'building').length;\n", '');
cut('  function assign() {', '  // =====================================================================================\n  // 3D office', `  // Who holds what is the function's derivation (R5 to R8); the page only places it.
  function applyLive() {
    people.forEach(p => { p.state = 'idle'; p.issue = null; p.release = null; p.gates = []; p.ownDuty = false; });
    issues.forEach(i => { i.holder = null; });
    const s = live.state; if (!s) return;
    const byKey = new Map(issues.map(i => [i.projectId + ':' + i.n, i]));
    (s.people || []).forEach(x => {
      const p = people.find(q => q.slot === x.slot); if (!p) return;
      p.state = STATES[x.state] ? x.state : 'idle';
      const ref = x.issue === null || x.issue === undefined ? null : typeof x.issue === 'object' ? x.issue.project + ':' + x.issue.n : (x.project || 'taskfolio') + ':' + x.issue;
      p.issue = ref ? byKey.get(ref) || null : null; if (p.issue) p.issue.holder = p;
      p.release = x.release || null;
    });
    const gates = issues.filter(i => laneOf(i) && laneOf(i).kind === 'wait');
    people.filter(p => p.role === 'head').forEach(p => { p.gates = p.state === 'waiting' ? gates : []; });
  }

`);
rep("  const BUILD_LIMIT = 3; // Decisions Q2\n", '');

// meeting-room slide: the batch size from the state
rep("Object.keys(PROJECT_KEY).reduce((a, p) => qOf(p) > qOf(a) ? p : a), nQ = qOf(relPj);", "Object.keys(PROJECT_KEY).reduce((a, p) => qOf(p) > qOf(a) ? p : a, CONFIG.project), nQ = qOf(relPj);");
rep("x.fillText(`รอบ release ${relPj} ${nQ}/${RELEASE_BATCH} ใบ` + (waiting ? ` · รอเจ้าของ ${waiting} คน` : ''), 28, 88);", "x.fillText(`รอบ release ${relPj} ` + (relBatch(relPj) ? `${nQ}/${relBatch(relPj)} ใบ` : NO_SOURCE) + (waiting ? ` · รอเจ้าของ ${waiting} คน` : ''), 28, 88);");
rep("(w - 56) * Math.min(1, nQ / RELEASE_BATCH), 8);", "(w - 56) * Math.min(1, relBatch(relPj) ? nQ / relBatch(relPj) : 0), 8);");

// ---------- team list (R16, R27) ----------
rep("      const RELTH = { approve: 'อนุมัติ deploy staging รอบ release', regression: `รัน regression ${rel.pct}%`, prod: 'deploy production รอบ release' };\n      li.querySelector('.doing').textContent = p.release ? RELTH[p.release] : p.issue ? `${issueKey(p.issue)} · ${laneOf(p.issue).th}` : p.role === 'head' && p.gates.length ? `ส่งเรื่องให้เจ้าของ ${p.gates.length} ใบ` : p.state === 'sweeping' ? SWEEPS[p.role].area : p.state === 'idle' && p.role !== 'head' ? 'พักเบรกสั้น ๆ' : ROLES[p.role].own;",
  "      const RELTH = { approve: 'QA Lead อนุมัติ deploy staging', 'on-test': 'อยู่ในรอบ release', regression: 'QA รัน regression', prod: 'deploy production รอบ release' }; // R8\n      li.querySelector('.doing').textContent = p.release ? (RELTH[p.release] || NO_SOURCE) : p.issue ? `${issueKey(p.issue)} · ${laneOf(p.issue).th}` : p.role === 'head' && p.gates.length ? `ส่งเรื่องให้เจ้าของ ${p.gates.length} ใบ` : p.state === 'sweeping' ? 'sweep ประจำวัน (agent-sweep.yml)' : 'พักเบรก'; // R7: never a standing duty as current work\n      if (p.role === 'head' && p.gates.length) putSrc(li.querySelector('.doing'), boardLines(live.state).summaryText);");
rep("{ working: 'ทำงาน', waiting: 'รอเจ้าของ', blocked: 'ติดปัญหา', sweeping: 'ทำงาน', idle: 'พักเบรก' }[p.state];", "{ working: 'ทำงาน', waiting: 'รอเจ้าของ', blocked: 'ติดปัญหา', sweeping: 'ทำงาน · sweep', idle: 'พักเบรก' }[p.state];");
rep("    const c = { working: 0, waiting: 0, blocked: 0, idle: 0 }; people.forEach(p => c[p.state]++);\n    document.getElementById('summaryText').textContent = `ทำงาน ${c.working + (c.sweeping || 0)} · รอเจ้าของ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}`;",
  "    const c = { working: 0, sweeping: 0, waiting: 0, blocked: 0, idle: 0 }; people.forEach(p => c[p.state]++);\n    const st = document.getElementById('summaryText');\n    st.textContent = live.state ? `ทำงาน ${c.working + c.sweeping} · รอเจ้าของ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}` : ''; // R16\n    putSrc(st, live.state ? boardLines(live.state).summaryText : null);");

// ---------- flow board (R31 to R34) ----------
rep("    const flow = document.getElementById('flow'); flow.innerHTML = '';", "    const flow = document.getElementById('flow'); flow.innerHTML = '';\n    const lines = live.state ? boardLines(live.state) : {};");
rep("const b = document.createElement('b'); b.textContent = `${t.th} · ${here.length} ใบ`;", "const b = document.createElement('b'); b.textContent = live.state ? `${t.th} · ${here.length} ใบ` : t.th; putSrc(b, lines.summaryText);");
cut("      if (t.release) Object.keys(PROJECT_KEY).forEach(pj => {", "      const shown = here.length > fit", `      if (t.release) PROJECTS_LIVE.forEach(pr => {
        // one release card per project (owner, 14 Oct 2026); its numbers are the function's (R3, R8, R34)
        const pj = pr.name, rt = releaseText(pr.release);
        const rc = document.createElement('div'); rc.className = 'chip rel'; rc.dataset.project = pj;
        rc.innerHTML = '<span class="num"></span><span class="pchip"></span><span class="t"></span><span class="p"></span><span class="bar"><i></i></span>';
        const holder = rt.phase && rt.phase !== 'collect' && people.find(x => x.release);
        rc.querySelector('.num').textContent = 'รอบ release';
        const pc = rc.querySelector('.pchip'); pc.textContent = pj; pc.dataset.p = pj;
        const tt = rc.querySelector('.t'); tt.textContent = holder ? labelOf(holder) : rt.t; tt.classList.toggle('nosrc', rt.t === NO_SOURCE && !holder);
        const pp = rc.querySelector('.p'); pp.textContent = rt.p; pp.classList.toggle('nosrc', rt.p === NO_SOURCE);
        putSrc(rc, lines['release:' + pr.id] || null);
        rc.querySelector('.bar i').style.width = rt.bar + '%';
        body.appendChild(rc);
      });
`);
rep("        const who = !role ? 'รอคิว' : i.holder", "        const who = !role ? (i.lane === 'blocked' ? 'ติดปัญหา' : 'รอคิว') : i.holder");
rep("        const step = i.lane === 'blocked' ? 'ติดที่ ' + LANE[i.from].th : lane.th;\n        chip.querySelector('.p').textContent = `${i.size} · ${step}`;",
  "        const step = i.lane === 'blocked' ? (i.from && LANE[i.from] ? 'ติดที่ ' + LANE[i.from].th : 'ติดปัญหา') : lane.th; // R4\n        chip.querySelector('.p').textContent = `${i.size || NO_SIZE} · ${step}`; // R32\n        putSrc(chip, i.sizeNote);");
rep("    const n = building(), q = issues.filter(i => i.lane === 'queued').length;\n    const cap = document.getElementById('cap');\n    cap.dataset.full = String(n >= BUILD_LIMIT);\n    cap.innerHTML = 'เขียนโค้ดพร้อมกัน <b></b> · รอคิว <b></b> · ทั้งหมด <b></b> ใบ';\n    const bs = cap.querySelectorAll('b'); bs[0].textContent = `${n}/${BUILD_LIMIT}`; bs[1].textContent = q; bs[2].textContent = issues.length;",
  "    const cap = document.getElementById('cap'), cp = live.state && live.state.cap;\n    if (cp) { // R33: the counts and the limit are the function's\n      cap.dataset.full = String(cp.building >= cp.limit);\n      cap.innerHTML = 'เขียนโค้ดพร้อมกัน <b></b> · รอคิว <b></b> · ทั้งหมด <b></b> ใบ';\n      const bs = cap.querySelectorAll('b'); bs[0].textContent = `${cp.building}/${cp.limit}`; bs[1].textContent = cp.queued; bs[2].textContent = cp.total;\n      putSrc(cap, lines.cap);\n    } else { cap.textContent = ''; cap.dataset.full = 'false'; putSrc(cap, null); }");
cut('  function drawProjects() {', '  function drawEditor() {', `  function drawProjects() {
    const grid = document.getElementById('projGrid'); if (!grid) return; grid.innerHTML = '';
    const lines = live.state ? boardLines(live.state) : {};
    PROJECTS_LIVE.forEach(pr => {
      const sec = document.createElement('section'); sec.className = 'scard';
      sec.innerHTML = '<div class="proj-head"><h3></h3><span class="pchip"></span><span class="scope"></span></div><p class="proj-line"></p><p class="now"></p>';
      sec.querySelector('h3').textContent = pr.name;
      const pc = sec.querySelector('.pchip'); pc.textContent = pr.name; pc.dataset.p = pr.name;
      sec.querySelector('.scope').textContent = pr.tag || '';
      sec.querySelector('.proj-line').textContent = pr.description || '';
      const now = sec.querySelector('.now'), has = pr.source !== 'none' && typeof pr.count === 'number'; // E4
      now.textContent = has ? \`งานบนบอร์ดตอนนี้ \${pr.count} ใบ\` : NO_SOURCE; now.classList.toggle('nosrc', !has);
      putSrc(now, has ? lines['project:' + pr.id] : null);
      grid.appendChild(sec);
    });
  }

`);
cut('  function drawEditor() {', '  function render(rebuildDesk) {', `  // R28: the roster of the config, read only; it changes by pull request to agent-office/projects.config.json.
  function drawEditor() {
    const list = document.getElementById('peopleList'); list.innerHTML = '';
    const tc = document.getElementById('teamCount'); tc.textContent = people.length ? \`· \${people.length} คน\` : '';
    const line = live.state ? fmtBangkok(live.state.readAt) && 'ที่มา: roster ในไฟล์ตั้งค่า agent-office/projects.config.json · ' + fmtBangkok(live.state.readAt) : null;
    putSrc(tc, people.length ? line : null);
    ['head', 'po', 'ba', 'tl', 'dev', 'qal', 'qa'].forEach(rk => {
      const members = people.filter(p => p.role === rk); if (!members.length) return;
      const sec = document.createElement('section'); sec.className = 'tgroup';
      sec.innerHTML = '<header><i></i><b></b><span></span></header><p></p>';
      sec.querySelector('i').style.background = ROLES[rk].color; sec.querySelector('b').textContent = ROLES[rk].label;
      const n = sec.querySelector('header span'); n.textContent = members.length + ' คน'; putSrc(n, line);
      sec.querySelector('p').textContent = ROLES[rk].duty;
      members.forEach(p => { const d = document.createElement('p'); d.className = 'pm-ro'; d.textContent = labelOf(p) + (p.duty !== ROLES[rk].duty ? ' · ' + p.duty : ''); sec.appendChild(d); });
      list.appendChild(sec);
    });
  }

`);
rep('    assign();\n    if (rebuildDesk && three.ok) buildDesk();', '    applyLive();\n    if (rebuildDesk && three.ok) buildDesk();');
cut("  document.getElementById('addBtn').addEventListener('click', () => {", "  // ---------- team fund (owner, 14 Oct 2026)", '');

// ---------- money: rendered from state.money only (R17, R36, R40, R58, R64) ----------
cut('  // ---------- team fund (owner, 14 Oct 2026)', '  // ---------- sound (owner, 14 Oct 2026', `  // ---------- money (owner correction, 16 Oct 2026): every figure is the function's, computed from recorded facts,
  // shown with its source line (R58); a figure without a source shows "ยังไม่มีแหล่งข้อมูล" (R40). Nothing is computed here.
  const toastEl = document.getElementById('toast'); let toastT = 0;
  function toast(parts) {
    toastEl.innerHTML = '';
    parts.forEach(([text, strong]) => { const s = document.createElement(strong ? 'b' : 'span'); s.textContent = text; toastEl.appendChild(s); });
    toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 3800);
    if (hasGsap) gsap.from(toastEl, { y: -8, opacity: 0, duration: .3, clearProps: 'opacity,transform' });
  }
  // Scene objects stay usable but cost nothing: water is CI fix rounds and supplies are working days (R36, R61, R62).
  const PACKS = [];
  function useWater() {}
  function useStock() { return true; }
  function orderSupply() {}
  let fx = null; // R13: the rate card's rate, null until open.er-api.com answers
  function putSrc(el, line) { if (!el) return; if (line) { el.dataset.src = line; el.title = line; } else { delete el.dataset.src; el.removeAttribute('title'); } }
  function putCell(id, c) {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = c.text; el.classList.toggle('nosrc', c.text === NO_SOURCE); putSrc(el, c.line);
  }
  function fillRow(tr, cells) { cells.forEach(c => { const td = document.createElement('td'); if (typeof c === 'string') td.textContent = c; else { td.textContent = c.text; td.classList.toggle('nosrc', c.text === NO_SOURCE); putSrc(td, c.line); } tr.appendChild(td); }); }
  let shownFund = null;
  function drawMoney() {
    if (!live.state) return;
    const v = viewOf(live.state, fx);
    Object.entries(v).forEach(([id, c]) => putCell(id, c));
    const m = live.state.money || {};
    if (hasGsap && typeof m.fund === 'number' && typeof shownFund === 'number' && shownFund !== m.fund && v.fundVal.line) {
      const el = document.getElementById('fundVal'), obj = { v: m.fund };
      gsap.from(obj, { v: shownFund, duration: 1.4, ease: 'power2.out', onUpdate: () => { el.textContent = '฿' + Math.round(obj.v).toLocaleString('en-US'); }, onComplete: () => { el.textContent = v.fundVal.text; } });
    }
    shownFund = typeof m.fund === 'number' ? m.fund : null;
    const owing = (id, c) => { const e = document.getElementById(id); if (e) e.dataset.owing = String(!!c.text && c.text !== 'ชำระเรียบร้อยแล้ว'); };
    owing('debtPill', v.debtChip); owing('officePill', v.officeChip); owing('kDebtBox', v.debtChip);
    const rows = moneyRows(live.state, fx);
    const mu = document.getElementById('missions'); mu.innerHTML = '';
    if (!rows.missions.length) { const li = document.createElement('li'); li.className = 'mission nosrc'; li.textContent = NO_SOURCE; mu.appendChild(li); }
    rows.missions.forEach(x => {
      const li = document.createElement('li'); li.className = 'mission' + (x.done ? ' done' : '');
      li.innerHTML = '<span class="m-t"></span><span class="m-r"></span><span class="m-bar"><i></i></span><span class="m-p"></span>';
      li.querySelector('.m-t').textContent = (x.done ? '✓ ' : '') + x.th;
      const r = li.querySelector('.m-r'); r.textContent = x.reward.text; r.classList.toggle('nosrc', x.reward.text === NO_SOURCE); putSrc(r, x.reward.line);
      li.querySelector('.m-bar i').style.width = (x.goal ? Math.min(100, x.value / x.goal * 100) : 0) + '%';
      const pg = li.querySelector('.m-p'); pg.textContent = x.progress.text; pg.classList.toggle('nosrc', x.progress.text === NO_SOURCE); putSrc(pg, x.progress.line);
      mu.appendChild(li);
    });
    const pu = document.getElementById('paid'); pu.innerHTML = '';
    if (!rows.paid.length) { const li = document.createElement('li'); li.className = 'nosrc'; li.textContent = NO_SOURCE; pu.appendChild(li); }
    rows.paid.forEach(x => {
      const li = document.createElement('li'); li.innerHTML = '<span class="t"></span><span class="amt"></span><span class="note"></span>';
      li.querySelector('.t').textContent = x.t; const a = li.querySelector('.amt'); a.textContent = x.amt.text; putSrc(a, x.amt.line); li.querySelector('.note').textContent = x.note;
      pu.appendChild(li);
    });
    const tb = document.getElementById('tiers'); tb.innerHTML = '';
    if (!rows.tiers.length) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); tb.appendChild(tr); }
    rows.tiers.forEach(t => { const tr = document.createElement('tr'); tr.innerHTML = '<td><span class="size"></span> <span class="muted"></span></td>'; tr.querySelector('.size').textContent = t.k; tr.querySelector('.muted').textContent = t.th || ''; fillRow(tr, [t.thb]); tb.appendChild(tr); });
    const rc = document.getElementById('rateCard'); rc.innerHTML = '';
    if (!rows.rate.length) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); rc.appendChild(tr); }
    rows.rate.forEach(r => { const tr = document.createElement('tr'); fillRow(tr, [r.k, r.text]); rc.appendChild(tr); });
    const rm = document.getElementById('rateModel'); if (rm) rm.textContent = rows.model || NO_SOURCE;
    const cm = document.getElementById('costMethod'); cm.innerHTML = '';
    if (!rows.costMethod) { const tr = document.createElement('tr'); fillRow(tr, [{ text: NO_SOURCE, line: null }]); cm.appendChild(tr); }
    else rows.costMethod.forEach(e => { const tr = document.createElement('tr'); const th = document.createElement('th'); th.scope = 'row'; th.textContent = e.line; tr.appendChild(th); fillRow(tr, [[e.input, e.where, e.formula, (e.rates || []).map(r => r.text + ' (' + r.origin + ')').join(' · ')].filter(Boolean).join(' · ')]); cm.appendChild(tr); });
  }

`);

// ---------- missions and quality bonuses: the function's (R54, R55); the page draws them in drawMoney ----------
cut('  // ---------- quality bonuses and missions (owner, 14 Oct 2026;', '  // ---------- speech bubbles (owner, 14 Oct 2026', '');

// ---------- bubbles (R21; owner answer Q7, 16 Oct 2026): casual lines are allowed, but a line that is not a real work
// event must never state a work fact. A work bubble passes `fact` (from workEvents); every other line goes through
// isFlavourSafe, which drops any line with a number, an issue key or a work-state word. ----------
rep('  function say(p, text) {\n    if (!three.ok || !p) return;', '  function say(p, text, fact) {\n    if (!three.ok || !p) return;\n    const line = text || lineFor(p);\n    if (!fact && !isFlavourSafe(line)) return;');
rep('b.dataset.pid = p.id; b.textContent = text || lineFor(p);', 'b.dataset.pid = p.id; b.textContent = line;');
rep('  function sayObj(obj, text) {\n    if (!bubbleRoom(1)) return;', '  function sayObj(obj, text) {\n    if (!isFlavourSafe(text) || !bubbleRoom(1)) return;');
rep('    if (!three.ok || !x || !bubbleRoom(0)) return;', '    if (!three.ok || !x) return;\n    const line = text || thinkFor(x);\n    if (!isFlavourSafe(line) || !bubbleRoom(0)) return;');
rep('    b.textContent = text || thinkFor(x); box.appendChild(b);', '    b.textContent = line; box.appendChild(b);');
rep('    if (!three.ok || !simulate || document.hidden) return;', '    if (!three.ok || document.hidden) return;', 2);

// ---------- person menu (R23): "ดูงาน" opens the issue on GitHub ----------
rep("    if (p.issue) opts.push(['ดูงาน ' + issueKey(p.issue), () => { closeMenu(); toast([[issueKey(p.issue) + ' ', true], [p.issue.title + ' · ' + laneOf(p.issue).th + ' · ' + p.issue.size + ' ' + baht(TIERS[p.issue.size].thb), false]]); }]);",
  "    if (p.issue) opts.push(['ดูงาน ' + issueKey(p.issue), () => { closeMenu(); if (p.issue && p.issue.url) window.open(p.issue.url, '_blank', 'noopener'); }]);");
rep(", orderSupply: k => orderSupply(PACKS[k], null), get exp() { return exp; }, get fund() { return fund.total; }", '');
rep("    set('hudFund', baht(fund.total)); set('hudDebt', baht(tok.debt)); set('hudClock',", "    set('hudClock',");
rep("set('hudTeam', `ทำงาน ${c.working + c.sweeping} · รอ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}`);", "set('hudTeam', live.state ? `ทำงาน ${c.working + c.sweeping} · รอ ${c.waiting} · ติด ${c.blocked} · พัก ${c.idle}` : ''); putSrc(document.getElementById('hudTeam'), live.state ? boardLines(live.state).hudTeam : null);");

// ---------- the board's former clock-driven issue movement: deleted (R49) ----------
cut('  // One issue moves one step per tick, in label order.', '  // ---------- boot ----------', '');

// ---------- boot ----------
rep('  people = seedPeople();\n  issues = seedIssues();\n', '');
rep('  drawTiers(); drawFund(); drawCost(); drawMissions();\n', '');
rep('  setInterval(() => { if (!document.hidden) drawMissions(); }, 1000);\n', '');
cut('  // someone says something every few seconds', '  setInterval(tick, 30000);', `  function drawFx() {
    putCell('fxVal', viewOf(live.state, fx).fxVal);
    const w = document.getElementById('fxWhen'); if (w) w.textContent = fx ? 'ณ ' + fmtBangkok(fx.at).replace(/^[A-Za-z]+ /, '') : '';
  }
  async function refreshFx() {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD'); if (!r.ok) return;
      const j = await r.json(), rate = j && j.rates && Number(j.rates.THB);
      if (!(rate > 0)) return;
      fx = { rate, at: (j.time_last_update_unix || Date.now() / 1000) * 1000 }; drawFx(); drawMoney();
    } catch { /* offline or blocked: the rate card keeps "ยังอ่านอัตราไม่ได้" or the last rate with its own time */ }
  }
  drawFx(); refreshFx(); setInterval(refreshFx, 3600000);

  // ---------- live state (R10, R11, R21, R24, R45) ----------
  const tip = document.getElementById('srcTip'); let tipT = 0;
  document.addEventListener('click', e => { // R58: tap shows the source line at 1024 px and below
    const el = e.target && e.target.closest ? e.target.closest('[data-src]') : null;
    if (!el || !matchMedia('(max-width: 1024px)').matches) { if (!el) tip.hidden = true; return; }
    tip.textContent = el.dataset.src; tip.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 6000);
  });
  function drawLiveLines() {
    const off = document.getElementById('agentOff'); off.hidden = !live.state || live.state.agentEnabled === true;
    document.getElementById('fresh').textContent = live.state ? freshText(live.state.readAt, live.failed) : '';
  }
  const keyOfState = i => i.key || String(i.n);
  function onState(state) {
    const prev = live.state; live.state = state; live.failed = false;
    PROJECTS_LIVE = projectsOf(state);
    PROJECT_KEY = Object.fromEntries(PROJECTS_LIVE.map(p => [p.name, true]));
    issues = issuesOf(state);
    const rebuilt = applyPeople((state.people || []).filter(x => ROLES[x.role]));
    render(rebuilt); drawMoney(); drawFx(); drawLiveLines(); drawHud();
    const ev = workEvents(prev, state, slot => { const p = people.find(x => x.slot === slot); return p ? labelOf(p) : ''; }, keyOfState);
    ev.bubbles.forEach(b => { const p = people.find(x => x.slot === b.slot); if (p) setTimeout(() => say(p, b.text, true), 700); });
    ev.toasts.forEach((t, k) => setTimeout(() => toast(t), k * 4000));
  }
  function clearLive() { shownFund = null; live.state = null; live.failed = false; PROJECTS_LIVE = []; PROJECT_KEY = {}; issues = []; applyPeople([]); render(true); drawLiveLines(); }
  const signin = document.getElementById('signin'), signinBtn = document.getElementById('signinBtn'), signinMsg = document.getElementById('signinMsg');
  const ctl = startLive({
    onState,
    onFail: () => { live.failed = true; drawLiveLines(); },
    // R42: a pending, deactivated or unknown account gets 403; that is no permission, not a failed read
    onForbidden: () => { clearLive(); live.forbidden = true; signin.hidden = false; signinBtn.disabled = false; signinBtn.textContent = 'เข้าสู่ระบบด้วยบัญชีอื่น'; signinMsg.textContent = 'บัญชีนี้ไม่มีสิทธิ์ดูหน้านี้ ต้องเป็นบัญชีที่ใช้งานอยู่ (active) ใน Taskfolio'; },
    onSignedOut: () => { clearLive(); signin.hidden = false; signinBtn.disabled = false; signinBtn.textContent = 'เข้าสู่ระบบด้วย Google'; if (!live.forbidden) signinMsg.textContent = ''; },
    onSignedIn: () => { signin.hidden = true; },
    onConfigMissing: () => { signin.hidden = false; signinBtn.disabled = true; signinMsg.textContent = 'environment นี้ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ'; }
  });
  signinBtn.addEventListener('click', async () => {
    const other = live.forbidden; live.forbidden = false; signinMsg.textContent = '';
    try { if (other) await ctl.signOut(); await ctl.signIn(); } catch { signinMsg.textContent = 'เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง'; }
  });
  signin.hidden = false;

  // ---------- ambient life (R49a): the mock's 4 s step loop without its work, its breaks and its chatter ----------
  // An idle person changes idle spot and walks there, or takes a break at the least-used object of the map (pickUse,
  // as the mock's breakActivity), so every object gets its turn. Nobody's state, issue or money changes here (R49).
  setInterval(() => {
    if (!three.ok || document.hidden || !people.length) return;
    ambientStep(people, { now: Date.now(), rand: Math.random, pickUse, actMs: ACT_MS }).forEach(e => {
      if (e.kind !== 'break') return;
      const ix = IX[e.pick.ix], a = ix && ix.acts[e.pick.a]; if (!a) return;
      breakUse[ix.name] = (breakUse[ix.name] || 0) + 1;
      setTimeout(() => say(e.p, \`ขอไป\${a.th}ก่อนนะ\`), 400); // as the mock's breakActivity, without its work reason
    });
    render(false);
  }, AMBIENT.stepMs);
  // someone says something every few seconds (mock); a line that would state a work fact is redrawn or dropped (R21)
  setInterval(() => {
    if (!three.ok || document.hidden) return;
    const p = pickSpeaker(people, Math.random); if (!p) return;
    const line = safeLine(() => lineFor(p)); if (line && bubbleRoom(0)) say(p, line); // the room the mock's say(p) had
  }, AMBIENT.chatMs);
`);

rep('criteria and recent payouts */', 'criteria and recent income */');
rep("if (k === 'area') return SWEEPS[p.role] ? SWEEPS[p.role].area : 'ไล่หาจุดบอด';", "if (k === 'area') return 'ไล่หาจุดบอด';");
rep('<span id="rateModel">Claude Opus 5.5</span>', '<span id="rateModel">ยังไม่มีแหล่งข้อมูล</span>'); // N10, R14: the model name comes from the config

// ---------- B3: no third-party script at run time; plan.md "Carrying the 3D page over" ----------
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>', '<script src="./vendor/gsap@3.12.5/gsap.min.js"></script>');
rep('<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>',
  '<script type="importmap">{ "imports": { "three": "./vendor/three@0.170.0/build/three.module.js", "three/addons/": "./vendor/three@0.170.0/examples/jsm/" } }</script>');
// the module leaves the page for app/office.js, so script-src needs no hash for 800 KB of inline code
let office;
{
  const open = '<script type="module">\n', a = h.indexOf(open), b = h.indexOf('</script>', a);
  if (a < 0 || h.indexOf(open, a + 1) >= 0) throw new Error('module script not found exactly once');
  office = h.slice(a + open.length, b);
  h = h.slice(0, a) + '<script type="module" src="./app/office.js"></script>' + h.slice(b + '</script>'.length);
}
// CSP for Cloudflare Pages (_headers). Inline blocks that stay are allowed by their sha256 only.
const hash = s => "'sha256-" + createHash('sha256').update(s, 'utf8').digest('base64') + "'";
const inline = (tag) => [...h.matchAll(new RegExp(`<${tag}(?: type="importmap")?>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1]);
const scriptHashes = inline('script').map(hash), styleHashes = inline('style').map(hash);
const csp = [
  "default-src 'self'",
  // wasm-unsafe-eval: the meshopt decoder of three's GLTFLoader compiles WebAssembly; apis.google.com: Firebase Auth's popup helper (as the Taskfolio app's CSP in firebase.json)
  `script-src 'self' ${scriptHashes.join(' ')} 'wasm-unsafe-eval' https://apis.google.com`,
  `style-src 'self' ${styleHashes.join(' ')} https://fonts.googleapis.com`,
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://open.er-api.com",
  'frame-src https://taskfolio-staging.firebaseapp.com https://taskfolio-prod.firebaseapp.com',
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ');
headersText = `# Generated with index.html (review B3). Every inline block of index.html is listed by its sha256; a change to one
# changes its hash, and agent-office/page.test.mjs fails until this file is rebuilt.
/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`;
writeFileSync(out, h);
writeFileSync(join(dirname(out), 'app', 'office.js'), `// Agent Office live page: the mock v62 module, its simulation removed (spec docs/sdd/agent-office-live/spec.md R0, R49).
// Built from the mock with the page; edit the mock first (R44).
${office}`);
writeFileSync(join(dirname(out), '_headers'), headersText);
console.log('index.html bytes', Buffer.byteLength(h), '· app/office.js bytes', Buffer.byteLength(office));
