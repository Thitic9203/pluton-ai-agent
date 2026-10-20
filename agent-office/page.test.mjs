// T17 (and the source lines of T34) on the built page, node only, no browser.
// Spec: docs/sdd/agent-office-live/spec.md R0, R8, R10, R11, R13, R15 to R40, R45, R49, R58.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewOf, moneyRows, boardLines, issuesOf, releaseText, workEvents, freshText, isIdle, isFlavourSafe, readState, NO_SOURCE, NO_FX, NO_SIZE, AGENT_OFF } from './public/app/live.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, 'public');
const page = readFileSync(join(pub, 'index.html'), 'utf8');
const office = readFileSync(join(pub, 'app', 'office.js'), 'utf8');
const shipped = [page, ...readdirSync(join(pub, 'app')).map(f => readFileSync(join(pub, 'app', f), 'utf8'))].join('\n');

test('R49: no simulation name survives anywhere in the shipped page', () => {
  for (const name of ['simulate', 'simBtn', 'sweepTick', 'releaseStep', 'accrue', 'headPays', 'checkMissions', 'payout', 'ตัวเลขจำลอง', 'การจำลองงาน']) {
    assert.equal(shipped.includes(name), false, `found "${name}"`);
  }
  // review N9: a query switch is caught in any spelling: "?fast", "&demo", or a /[?&]fast/ test in code
  const SWITCH = [/[?&](?:fast|demo)\b/, /\[\?&\]\s*(?:fast|demo)\b/];
  for (const re of SWITCH) assert.equal(re.test(shipped), false, `matched ${re}`);
  // the checks catch both spellings the mock used: the URL and the regex test in code
  assert.equal(SWITCH[0].test('index.html?fast'), true);
  assert.equal(SWITCH[1].test("}, /[?&]fast/.test(location.search) ? 250 : 4000);"), true);
});

test('R0: none of the mock\'s seed tables or seeded values is in the bundle', () => {
  for (const name of ['CONFIG.issues', 'SEED_SIZE', 'seedPaid', 'seedIssues', 'seedPeople', 'BURN', 'FX_SNAPSHOT', '33.576409', '฿33.58', "'สรุปชั่วโมงรายเดือนนับวันหยุดผิด'", 'Math.random() < .75']) {
    assert.equal(shipped.includes(name), false, `found "${name}"`);
  }
  assert.equal(/<(span|b|i|dd) id="[A-Za-z]+">฿0</.test(page), false, 'a placeholder ฿0 reads as a real zero (R40)');
});

// Every element id the spec names for R15 to R40 (mock v62), except the ones the spec removes.
const IDS = ['summary', 'summaryText', 'fund', 'fundVal', 'debtPill', 'debtChip', 'debtHead', 'officePill', 'officeChip', 'officeHead', 'clock', 'themeBtn',
  'stage', 'scene3d', 'tags', 'bubbles', 'toast', 'pie', 'fallback', 'soundBtn', 'zoomIn', 'zoomOut', 'resetView', 'fullBtn', 'hud', 'hudFund', 'hudDebt', 'hudClock', 'hudTeam',
  'tab-now', 'teamList', 'tab-team', 'peopleList', 'teamCount', 'tab-scene', 'timeGrid', 'weatherGrid', 'nowText', 'tab-projects', 'pane-now', 'pane-team', 'pane-scene', 'pane-projects',
  'flowTitle', 'flow', 'cap', 'moneyTitle', 'kFund', 'missions', 'paid', 'tiers', 'kDebtBox', 'debtVal', 'paidOff', 'saved', 'expUtil', 'expElec', 'expWater', 'expNet', 'expSup', 'expFood', 'expOwe',
  'costSources', 'costTotal', 'tokIn', 'tokCache', 'tokOut', 'rateModel', 'rateCard', 'fxVal', 'fxWhen'];
test('R15 to R40: every mock element id is in the page', () => {
  for (const id of IDS) assert.ok(page.includes(`id="${id}"`), `missing #${id}`);
  assert.ok(page.includes('<h1>AI Agent Home Office</h1>'));
  assert.ok(page.includes('ทีม AI agent รับงานจากหลายโปรเจกต์'));
  assert.ok(page.includes('ป้าย Gate คืองานที่รอเจ้าของอนุมัติ')); // R35
  assert.ok(page.includes('Motion: Tencent HY-Motion 1.0')); // R37
  assert.ok(page.includes('ข้อมูลจริงจาก GitHub · แตะที่คนเพื่อดูงาน') && !page.includes('ข้อมูลตัวอย่าง · แตะที่คนเพื่อสั่ง')); // R22
});

test('R28, R29, R36: the removed controls are not rendered', () => {
  for (const id of ['addBtn', 'simBtn', 'payDebt', 'expDrink', 'expSnack', 'stockLine']) assert.equal(page.includes(`id="${id}"`), false, `#${id} is still there`);
  assert.ok(page.includes('แก้ทีมผ่าน pull request'));
});

test('R10, R11, R13, R45: the idle line, the freshness line, the no-rate text and the sign-in screen exist', () => {
  assert.ok(page.includes(`id="agentOff" hidden>${AGENT_OFF}<`));
  assert.ok(page.includes('id="fresh"'));
  assert.ok(page.includes(`<b id="fxVal">${NO_FX}</b>`));
  assert.ok(page.includes('id="signin"') && page.includes('เข้าสู่ระบบด้วย Google'));
});

test('R48b: the sign-in screen shows from the first paint until sign-in succeeds, with no page scrollbar behind it', () => {
  assert.ok(page.includes('<div class="signin" id="signin"><div class="box">'), 'the sign-in screen is not hidden in the markup');
  assert.ok(page.includes('<p>ใช้สำหรับทีม Pluton เท่านั้น เพื่อดูงานของ AI Agent</p>'));
  assert.ok(page.includes('html:has(.signin:not([hidden])){overflow:hidden}'), 'the page does not scroll while the sign-in screen shows');
});

test('R18: the saved theme is applied before first paint, ahead of the stylesheet', () => {
  assert.ok(page.indexOf("localStorage.getItem('ao3.theme')") < page.indexOf('<style>'));
});

test('R19, R37: no asset is embedded; every asset path the page names is in the manifest', () => {
  assert.equal(/[A-Za-z0-9+/=]{400,}/.test(shipped), false);
  const { files } = JSON.parse(readFileSync(join(pub, 'assets', 'manifest.json'), 'utf8'));
  const have = new Set(files.map(f => f.path));
  for (const m of shipped.matchAll(/'(assets\/(?:models|chars|hdr)\/[A-Za-z0-9_.-]+)'/g)) assert.ok(have.has(m[1]), m[1]);
  assert.ok(have.has('assets/motion/hymotion-clips.js'));
});

// ---------- the adapter on fixtures ----------
const T = '2026-10-16T11:45:00Z';
const src = fact => ({ fact, ids: ['run 1'], time: T });
const FULL = {
  readAt: T, agentEnabled: true,
  projects: [{ id: 'taskfolio', name: 'Taskfolio', key: '#{n}', count: 2, source: 'github-labels', release: { phase: 'collect', queued: 1, batch: 10 } }, { id: 'ols', name: 'OLS', key: 'OLS-{n}', count: null, source: 'none' }],
  issues: [
    { project: 'taskfolio', n: 501, title: 'a', lane: 'building', from: null, improvement: false, size: { size: 'M', rules: 6, files: 4, risk: ['ui'] }, url: 'https://github.com/x/y/issues/501' },
    { project: 'taskfolio', n: 507, title: '[Improvement] b', lane: 'blocked', from: null, improvement: true, size: null, url: 'https://github.com/x/y/issues/507' }
  ],
  people: [{ slot: 0, role: 'head', state: 'idle', issue: null, release: null }, { slot: 3, role: 'dev', state: 'working', issue: 501, release: null }],
  summary: { working: 1, waiting: 0, blocked: 0, idle: 1 }, cap: { building: 1, limit: 3, queued: 0, total: 2 }, warnings: [],
  money: {
    fund: 3200, aiOwed: 0, aiPaid: 812.5, officeOwed: 140, saved: 55.2, costThb: 812.5, tokens: { input: 2100000, cacheRead: 14600000, cacheWrite: 0, output: 1700000 },
    office: { today: {
      elec: { minutes: 41, usd: 0.246, thb: 8.118 }, water: { minutes: 18, usd: 0.108, thb: 3.564 }, net: { requests: 250000, usd: 0.075, thb: 2.475 },
      sup: { thb: 228.92, items: [{ name: 'Veggie Burger', thb: 100, pending: false }, { name: 'Lemonade', thb: 21.92, pending: false }, { name: 'Liquorice Gelato', thb: 160, pending: false }].slice(0, 2).concat([{ name: 'Pineapple', thb: 7.06, pending: false }, { name: 'Kava', thb: 100, pending: false }]) },
      utilities: 14.157,
    } },
    priceLink: { text: 'ราคาอ้างอิงบางรายการจาก Numbeo', url: 'https://www.numbeo.com/cost-of-living/in/Bangkok?displayCurrency=THB' },
    paid: [{ key: '#488', title: 'c', amount: 3200, note: 'โบนัส +60%', source: src('issue ปิดโดย agent-release.yml') }],
    missions: [{ th: 'ปิด 2 issue วันนี้', value: 1, goal: 2, reward: null, done: false, source: src('issue ที่ปิดวันนี้') }],
    tiers: { S: { th: 'แก้ข้อความหรือสี', thb: 300 }, M: { th: 'ฟีเจอร์เล็ก', thb: 800 } },
    prices: { model: 'Claude Opus 5.5', input: 4, cacheRead: 0.2, output: 20 },
    sources: Object.fromEntries(['fund', 'aiOwed', 'aiPaid', 'officeOwed', 'saved', 'costThb', 'tokens', 'elec', 'water', 'net', 'sup', 'tiers', 'prices'].map(k => [k, src(k + ' fact')]))
  }
};
const FX = { rate: 33.6, at: Date.parse(T) };

function cellsOf(state, fx) {
  const v = viewOf(state, fx), r = moneyRows(state, fx), cells = Object.entries(v).map(([id, c]) => [id, c]);
  r.missions.forEach((m, i) => { cells.push(['mission' + i + '.progress', m.progress]); cells.push(['mission' + i + '.reward', m.reward]); });
  r.paid.forEach((p, i) => cells.push(['paid' + i, p.amt]));
  r.tiers.forEach(t => cells.push(['tier' + t.k, t.thb]));
  r.rate.forEach(x => cells.push(['rate ' + x.k, x.text]));
  return cells;
}

test('R0, R58: in the fixture render every shown number carries its source line', () => {
  for (const [id, c] of cellsOf(FULL, FX)) {
    if (/\d/.test(c.text)) assert.ok(c.line && c.line.startsWith('ที่มา: '), `${id} shows "${c.text}" with no source`);
  }
  const lines = boardLines(FULL);
  for (const k of ['summaryText', 'cap', 'project:taskfolio', 'release:taskfolio', 'hudTeam']) assert.match(lines[k], /^ที่มา: .+ · Fri 16 Oct 2026 6\.45 PM$/, k);
});

test('R40: with no money facts every money element shows the no-source text, never ฿0', () => {
  const empty = { ...FULL, money: undefined };
  for (const [id, c] of cellsOf(empty, null)) {
    if (id === 'debtChip' || id === 'officeChip') { assert.equal(c.text, '', id); continue; }
    if (id === 'fxVal') { assert.equal(c.text, NO_FX); continue; }
    assert.equal(c.text, NO_SOURCE, id);
  }
  const zeroNoSource = { ...FULL, money: { fund: 0 } };
  assert.equal(viewOf(zeroNoSource, null).fundVal.text, NO_SOURCE);
});

test('R40, Q18: a mission reward without an amount shows the no-source text while its progress shows', () => {
  const m = moneyRows(FULL, FX).missions[0];
  assert.equal(m.reward.text, NO_SOURCE);
  assert.equal(m.progress.text, '1 / 2');
});

test('R17: the paid chip says "ชำระเรียบร้อยแล้ว" only at 0', () => {
  assert.equal(viewOf(FULL, FX).debtChip.text, 'ชำระเรียบร้อยแล้ว');
  assert.equal(viewOf(FULL, FX).officeChip.text, 'ค้างชำระ ฿140');
  // review B4: half a baht still owed is owed
  const half = { ...FULL, money: { ...FULL.money, aiOwed: 0.5, officeOwed: 0.5 } };
  assert.notEqual(viewOf(half, FX).debtChip.text, 'ชำระเรียบร้อยแล้ว');
  assert.notEqual(viewOf(half, FX).officeChip.text, 'ชำระเรียบร้อยแล้ว');
  assert.match(viewOf(half, FX).debtChip.text, /^ค้างชำระ /);
});

test('N10, R14: the model name starts as the no-source text, not a typed model', () => {
  assert.ok(page.includes(`<span id="rateModel">${NO_SOURCE}</span>`));
  assert.equal(page.includes('Claude Opus 5.5'), false);
});

test('N8: issue keys come from the state; the page holds no key rule of its own', () => {
  assert.equal(issuesOf({ projects: FULL.projects, issues: [{ ...FULL.issues[0], key: 'OLS-9' }] })[0].key, 'OLS-9');
  assert.equal(/replace\(\s*['"]\{n\}['"]/.test(shipped), false, 'a "{n}" key rule is in the page');
  assert.ok(office.includes('const issueKey = i => i.key || String(i.n);'));
});

// ---------- N6, N11: reads after a sign-out are dropped; a 403 is no permission ----------
const user = { getIdToken: async () => 'tok' };
const reply = (status, body = {}) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
test('N6: an answer that arrives after sign-out is ignored', async () => {
  let current = true, got = null;
  const slow = async () => { current = false; return { ok: true, status: 200, json: async () => FULL }; }; // signed out while in flight
  assert.equal(await readState(user, slow, () => current, s => { got = s; }, () => {}), 'stale');
  assert.equal(got, null);
  assert.equal(await readState(user, reply(200, FULL), () => true, s => { got = s; }, () => {}), 'state');
  assert.equal(got, FULL);
});
test('N11: 403 calls the no-permission handler and is not a failed read', async () => {
  let forbidden = 0;
  assert.equal(await readState(user, reply(403), () => true, () => assert.fail('no state on 403'), () => { forbidden++; }), 'forbidden');
  assert.equal(forbidden, 1);
  await assert.rejects(readState(user, reply(500), () => true, () => {}, () => {}), /state 500/);
  assert.ok(office.includes('onForbidden:') && office.includes('บัญชีนี้ไม่มีสิทธิ์ดูหน้านี้'));
});

// ---------- Q7 (owner, 16 Oct 2026): casual lines yes, never a work fact that is not real ----------
test('Q7: a casual line with a number or a work-state word is dropped; a plain casual line passes', () => {
  for (const ok of ['มัทฉะเข้มข้น ใจฟู', 'ลมบนสะพานเย็นสุด ๆ', 'ขอนั่งชาร์จแบตแป๊บ']) assert.equal(isFlavourSafe(ok), true, ok);
  for (const bad of ['งานใหญ่ #501 มาแล้ว ลุยกันเลย', 'test plan ส่งเข้า Gate 2 แล้ว', 'merge แล้ว รอ release', 'นวดสิบนาที ใช้ 10 นาที', 'ปิดงานได้ ภูมิใจมาก', 'รีวิว PR ผ่านแล้ว', 'เงินเข้าแล้ว', '{key} หลายจอเลย', 'CI แดงอีกแล้ว', '', undefined]) {
    assert.equal(isFlavourSafe(bad), false, String(bad));
  }
});
test('Q7: every speech path that is not a work event goes through the filter', () => {
  assert.match(office, /function say\(p, text, fact\) \{\n\s+if \(!three\.ok \|\| !p\) return;\n\s+const line = text \|\| lineFor\(p\);\n\s+if \(!fact && !isFlavourSafe\(line\)\) return;/);
  assert.match(office, /function sayObj\(obj, text\) \{\n\s+if \(!isFlavourSafe\(text\)/);
  assert.match(office, /const line = text \|\| thinkFor\(x\);\n\s+if \(!isFlavourSafe\(line\)/);
  assert.equal(/\bFLAVOUR\b/.test(office), false);
  // the only fact bubbles are the ones workEvents produced
  assert.deepEqual([...office.matchAll(/say\([^;]*?, true\)/g)].map(m => m[0]), ['say(p, b.text, true)']);
});
test('Q7: no line of the mock\'s speech pools that the filter lets through contains a number or a work word', () => {
  const pools = office.slice(office.indexOf('const DLG_SCREEN'), office.indexOf('// ---------- cooking, step by step'));
  const lines = [...pools.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map(m => m[1]).filter(s => /[\u0E00-\u0E7F]/.test(s));
  assert.ok(lines.length > 200, `read ${lines.length} lines`);
  const shown = lines.filter(isFlavourSafe);
  assert.ok(shown.length > 0);
  for (const l of shown) { assert.equal(/[0-9๐-๙#฿{]/.test(l), false, l); }
  assert.ok(lines.some(l => !isFlavourSafe(l)), 'the pools hold work lines, and the filter drops them');
});

// ---------- B3: no third-party script, a strict CSP, the vendored files intact ----------
const vend = JSON.parse(readFileSync(join(pub, 'vendor', 'manifest.json'), 'utf8')).files;
test('B3: the page loads three, GSAP and Firebase from vendor/, never from a CDN', () => {
  assert.equal(/<script[^>]+src="https?:/.test(page), false);
  assert.ok(page.includes('<script src="./vendor/gsap@3.12.5/gsap.min.js"></script>'));
  assert.ok(page.includes('"three": "./vendor/three@0.170.0/build/three.module.js", "three/addons/": "./vendor/three@0.170.0/examples/jsm/"'));
  assert.equal(/cdn\.jsdelivr|cdnjs|unpkg|gstatic\.com\/firebasejs/.test(shipped), false);
  const vendoredAuth = readFileSync(join(pub, 'vendor', 'firebase@12.19.0', 'firebase-auth.js'), 'utf8');
  assert.equal(vendoredAuth.includes('from"https://'), false, 'firebase-auth.js still imports from a URL');
  for (const m of office.matchAll(/import\('three\/addons\/([^']+)'\)/g)) assert.ok(existsSync(join(pub, 'vendor', 'three@0.170.0', 'examples', 'jsm', m[1])), m[1]);
  for (const f of vend) {
    const data = readFileSync(join(pub, f.path));
    assert.equal(data.length, f.bytes, f.path);
    assert.equal(createHash('sha256').update(data).digest('hex'), f.sha256, f.path);
  }
});
test('B3: _headers sets a CSP that allows each inline block by its hash and nothing unsafe', () => {
  const headers = readFileSync(join(pub, '_headers'), 'utf8');
  const csp = (headers.match(/Content-Security-Policy: (.+)/) || [])[1];
  assert.ok(csp, 'no CSP line');
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", 'cdn.jsdelivr', 'cdnjs', 'gstatic.com/firebasejs', '*']) assert.equal(csp.includes(bad), false, bad);
  const dir = name => (csp.split('; ').find(d => d.startsWith(name + ' ')) || '').split(' ');
  assert.deepEqual(dir('default-src'), ['default-src', "'self'"]);
  const h = s => "'sha256-" + createHash('sha256').update(s, 'utf8').digest('base64') + "'";
  const scripts = [...page.matchAll(/<script(?: type="importmap")?>([\s\S]*?)<\/script>/g)].map(m => h(m[1]));
  const styles = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => h(m[1]));
  assert.equal(scripts.length, 2, 'the theme script and the import map'); assert.equal(styles.length, 3, 'the mock\'s three style blocks');
  for (const x of scripts) assert.ok(dir('script-src').includes(x), 'script hash missing');
  for (const x of styles) assert.ok(dir('style-src').includes(x), 'style hash missing');
  assert.ok(dir('connect-src').includes('https://identitytoolkit.googleapis.com') && dir('connect-src').includes('https://securetoken.googleapis.com') && dir('connect-src').includes('https://open.er-api.com'));
  assert.equal(/ style="/.test(page), false, 'a style attribute would need unsafe-inline');
  /* GLTFLoader fetches the models' embedded textures from blob: URLs; staging 670cc9cdb refused them. */
  assert.ok(dir('connect-src').includes('blob:'), 'connect-src must allow blob: for the model textures');
});

test('size: public/ with vendor/ stays within ~15 MB', () => {
  const walk = d => readdirSync(d).reduce((s, f) => { const p = join(d, f); return s + (statSync(p).isDirectory() ? walk(p) : statSync(p).size); }, 0);
  const total = walk(pub);
  assert.ok(total <= 15 * 1024 * 1024, `public is ${total} bytes`);
});

test('R13: the rate card uses the live rate; without one it says so', () => {
  assert.equal(viewOf(FULL, FX).fxVal.text, '฿33.60');
  assert.equal(viewOf(FULL, null).fxVal.text, NO_FX);
  assert.equal(moneyRows(FULL, FX).rate[0].text.text, '$4.00 · ฿134');
});

test('R32, R4, R9: sizes from their marker, blocked without a step, the Improvement tag', () => {
  const [a, b] = issuesOf(FULL);
  assert.equal(a.size, 'M'); assert.match(a.sizeNote, /Mountain Goat Software, Atlassian$/);
  assert.equal(b.size, null); assert.equal(b.from, null); assert.equal(b.kind, 'improvement');
  assert.equal(NO_SIZE, 'ยังไม่ประเมินขนาด');
});

test('R8, R34, R57: release card texts per phase; no percentage while the run is in progress', () => {
  assert.deepEqual(releaseText({ phase: 'collect', queued: 0, batch: 10 }), { t: 'รอครบ 0/10', p: 'merge แล้ว รอรวมให้ครบ 10 ใบ', bar: 0, phase: 'collect' });
  assert.equal(releaseText({ phase: 'regression', queued: 0, batch: 10, inRound: 10, e2e: { state: 'running' } }).p.includes('%'), false);
  assert.match(releaseText({ phase: 'regression', queued: 0, batch: 10, inRound: 10, e2e: { state: 'done', pct: 97.7, passed: 125, executed: 128 } }).p, /97\.7% · ผ่าน 125 จาก 128/);
  assert.match(releaseText({ phase: 'regression', queued: 0, batch: 10, e2e: { state: 'none' } }).p, /ไม่มีรายงาน/);
  assert.equal(releaseText(null).t, NO_SOURCE);
});

test('R10: no labelled issue or the agent switched off is the idle state', () => {
  assert.equal(isIdle({ agentEnabled: false, issues: FULL.issues }), true);
  assert.equal(isIdle({ agentEnabled: true, issues: [] }), true);
  assert.equal(isIdle(FULL), false);
});

test('R11: the freshness line, and the failure line keeps the last good time', () => {
  assert.equal(freshText(T, false), 'อัปเดตล่าสุด Fri 16 Oct 2026 6.45 PM');
  assert.equal(freshText(T, true), 'ข้อมูลล่าสุดเมื่อ Fri 16 Oct 2026 6.45 PM · อ่านไม่สำเร็จ');
});

const label = (slot, role) => (role === 'dev' ? 'Dev - A' : role);
const key = i => '#' + i.n;
test('R21, R24: two identical reads make no bubble and no toast; the first read makes none either', () => {
  assert.deepEqual(workEvents(null, FULL, label, key), { bubbles: [], toasts: [] });
  assert.deepEqual(workEvents(FULL, structuredClone(FULL), label, key), { bubbles: [], toasts: [] });
});

test('R21: an issue entering building gives exactly one "หยิบ" bubble to its holder', () => {
  const before = structuredClone(FULL);
  before.issues[0].lane = 'queued'; before.people[1] = { slot: 3, role: 'dev', state: 'idle', issue: null, release: null };
  const ev = workEvents(before, FULL, label, key);
  assert.deepEqual(ev.bubbles, [{ slot: 3, text: 'หยิบ #501 เองเลย งานของ Dev - A' }]);
});

test('R24: a release reaching its batch makes one toast', () => {
  const after = structuredClone(FULL); after.projects[0].release = { phase: 'approve', queued: 10, batch: 10 };
  assert.equal(workEvents(FULL, after, label, key).toasts.length, 1);
});

test('the browser tab shows the Slack bot icon (owner, 16 Oct 2026)', () => {
  assert.ok(page.includes('<link rel="icon" type="image/png" href="./favicon.png?v=2">') && page.includes('<link rel="shortcut icon" href="./favicon.ico?v=2">'));
  assert.ok(existsSync(new URL('./public/favicon.png', import.meta.url)) && existsSync(new URL('./public/apple-touch-icon.png', import.meta.url)));
});

test('R42: the page reads the snapshot where it is published and guarded, /data/state.json', async () => {
  const { STATE_PATH } = await import('./public/app/live.js');
  assert.equal(STATE_PATH, '/data/state.json');
  assert.ok(existsSync(new URL('./functions/data/_middleware.ts', import.meta.url)), 'the guard serves /data/*');
});

test('the scene fits the window height on a wide screen (owner, 16 Oct 2026)', () => {
  assert.ok(page.includes('.main .stage { width: min(100%, calc((100dvh - 260px) * 2)); margin-inline: auto; }'));
});

// T37 (owner, 17 Oct 2026): the office lines on real resources, in the same mock nodes.
test('R61: the office nodes show minutes, requests and the menu items with their baht, each with its source', () => {
  const v = viewOf(FULL, FX);
  assert.equal(v.expElec.text, '41 นาที · ฿8');
  assert.equal(v.expWater.text, '18 นาที · ฿4');
  assert.equal(v.expNet.text, '250,000 request · ฿2');
  assert.equal(v.expUtil.text, '฿14 · ยังไม่ตัดรอบ');
  assert.equal(v.expSup.text, '4 รายการ · ฿229 · ยังไม่ตัดรอบ');
  assert.equal(v.expFood.text, 'Veggie Burger ฿100 · Lemonade ฿22 · Pineapple ฿7 · Kava ฿100');
  for (const id of ['expElec', 'expWater', 'expNet', 'expUtil', 'expSup', 'expFood']) assert.ok(v[id].line && v[id].line.startsWith('ที่มา: '), id);
  assert.deepEqual(moneyRows(FULL, FX).priceLink, { text: 'ราคาอ้างอิงบางรายการจาก Numbeo', url: 'https://www.numbeo.com/cost-of-living/in/Bangkok?displayCurrency=THB' });
});

test('R40: an internet line with no source, a pending item and a non-https link', () => {
  const st = structuredClone(FULL);
  st.money.office.today.net = { requests: null, usd: null, thb: null };
  delete st.money.sources.net;
  st.money.office.today.sup.items[1].pending = true;
  st.money.priceLink.url = 'javascript:alert(1)';
  const v = viewOf(st, FX);
  assert.equal(v.expNet.text, NO_SOURCE);
  assert.equal(v.expUtil.text, '฿14 · ยังไม่ตัดรอบ', 'the sum of the lines that have a source');
  assert.match(v.expFood.text, /Lemonade รอราคา/);
  assert.equal(moneyRows(st, FX).priceLink, null, 'only an https link is rendered');
});

test('R64: office.js renders the Numbeo link as a real anchor built with DOM APIs', () => {
  const src = readFileSync(new URL('./public/app/office.js', import.meta.url), 'utf8');
  const at = src.indexOf('rows.priceLink');
  assert.ok(at > 0, 'drawMoney reads rows.priceLink');
  const block = src.slice(at, src.indexOf('\n    }\n', at));
  assert.match(block, /createElement\('a'\)/);
  assert.match(block, /rel = 'noopener noreferrer'/);
  assert.match(block, /target = '_blank'/);
  assert.doesNotMatch(block, /innerHTML/);
});

test('R68: a release holder shows its phase text, and on-test-env is the on-test phase', async () => {
  const { holderText } = await import('./public/app/live.js');
  assert.equal(holderText({ project: 'taskfolio', phase: 'approve' }), 'QA Lead อนุมัติ deploy staging');
  assert.equal(holderText({ project: 'taskfolio', phase: 'on-test-env' }), 'อยู่ในรอบ release');
  assert.equal(holderText({ project: 'taskfolio', phase: 'regression' }), 'QA รัน regression');
  assert.equal(holderText({ project: 'taskfolio', phase: 'prod' }), 'deploy production รอบ release');
  assert.equal(holderText(null), null);
  const r = releaseText({ phase: 'on-test-env', queued: 0, batch: 10, inRound: 10 });
  assert.equal(r.phase, 'on-test');
  assert.match(r.p, /อยู่ในรอบ release · 10 ใบ/);
  const src = readFileSync(new URL('./public/app/office.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /RELTH\[p\.release\]|LINES\.release\[p\.release\]/, 'office.js keys a phase table by the release object');
});

test('R69: the drink cup undoes the wrist\'s measured world scale, never a guessed calib factor', () => {
  const src = readFileSync(new URL('./public/app/office.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /cup\.scale\.setScalar\(1 \/ \(D\.calib\.k/, 'the cup is scaled by 1/(k·sc) while the GLB armature carries ×100: a 10 m cup');
  assert.match(src, /R_Wrist\.getWorldScale\(V\(\)\)\.x/);
});

test('R68: the approve to on-test-env move raises the QA Lead toast', () => {
  const st = (phase) => ({ issues: [], people: [], projects: [{ id: 'taskfolio', name: 'Taskfolio', release: { phase, batch: 10, queued: 10 } }] });
  const ev = workEvents(st('approve'), st('on-test-env'), () => 'x', () => 'x');
  assert.equal(ev.toasts.length, 1);
  assert.match(ev.toasts[0].map(([t]) => t).join(''), /อนุมัติ deploy staging รอบ Taskfolio แล้ว/);
});

test('R70, R71, R72: the cost table wraps, an empty chip is hidden, the fridge offers no dead order', () => {
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('./public/app/office.js', import.meta.url), 'utf8');
  assert.match(html, /#costMethod td:last-child\s*\{[^}]*white-space:\s*normal/, 'R70: the cost-method column wraps');
  assert.match(html, /\.chip-st:empty\s*\{\s*display:\s*none/, 'R71: an empty chip is not drawn');
  assert.doesNotMatch(js, /เจ้าของสั่งเสบียงเอง/, 'R72: no fridge order that does nothing');
});
