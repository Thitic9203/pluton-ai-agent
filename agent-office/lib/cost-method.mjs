// The "ที่มาของค่าใช้จ่าย" panel, built from the same config object the calculators read, so the
// rates shown and the maths cannot drift. No rate is written in this file.
// Spec: docs/sdd/agent-office-live/spec.md R62, R64 (and the lines it explains: R51 to R56, R61, R63).

import { SUPPLY_TRIGGERS } from './config.mjs';

export const PANEL_TITLE = 'ที่มาของค่าใช้จ่าย';

/** What each menu trigger counts, in the panel's words (R61). */
export const SUPPLY_TRIGGER_TH = {
  activeAgentDays: 'คนในทีมที่ทำงานจริงวันนั้น: 1 มื้อต่อคน (เริ่มงานก่อน 11:00 เป็นมื้อเช้า)',
  runsStarted: 'run ของ workflow ของ agent ที่เริ่มวันนั้น: 1 เครื่องดื่มต่อ run',
  reviewRuns: 'รีวิว pull request ของ agent App วันนั้น: 1 ของว่างหรือของหวานต่อรีวิว',
  issuesClosed: 'issue ที่ release workflow ปิดวันนั้น: 1 ของหวานฉลองต่อใบ',
};
const SUPPLY_TRIGGER_TH_LIST = SUPPLY_TRIGGERS.map((t) => SUPPLY_TRIGGER_TH[t]).join(' · ');

/**
 * @typedef {import('./config.mjs').OfficeConfig} OfficeConfig
 * @typedef {{ path: string, name: string, value: number, unit: string, origin: string }} Rate
 * @typedef {{ id: string, group: 'income'|'cost'|'rules', title: string, input: string, readFrom: string, formula: string, rates: Rate[], notes: string[] }} Entry
 */

/** A rate as the panel writes it: thousands grouped, two decimals for a fraction (mock v61 "4.20"). @param {number} n */
export function fmtRate(n) {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/**
 * The panel's entries in R64's order (income, costs with each menu item as a sub-row, rules), plus
 * the R62 statement.
 * @param {OfficeConfig} cfg
 * @param {any} [menu] the supplies menu file (R61), whose prices the supplies row lists
 * @returns {{ title: string, entries: Entry[], r62: string }}
 */
export function costMethod(cfg, menu = null) {
  /** @param {string} path */
  const get = (path) => path.split('.').reduce((/** @type {unknown} */ o, k) => (o && typeof o === 'object' ? /** @type {Record<string, unknown>} */ (o)[k] : undefined), cfg);
  /** @param {string} path @param {string} name @param {string} unit @param {string} origin @returns {Rate} */
  const rate = (path, name, unit, origin) => ({ path, name, value: Number(get(path)), unit, origin });
  const p = cfg.prices;
  const o = cfg.office;
  const priceOrigin = p.source;
  const priceRates = [
    rate('prices.input', `ราคา input (${p.model})`, p.unit, priceOrigin),
    rate('prices.cacheRead', `ราคา cache read (${p.model})`, p.unit, priceOrigin),
    rate('prices.output', `ราคา output (${p.model})`, p.unit, priceOrigin),
  ];
  const sizes = /** @type {const} */ (['S', 'M', 'L', 'XL']);
  const bonusNames = /** @type {const} */ ([
    ['planOnce', 'Plan รอบเดียว'], ['testsOnce', 'Test plan รอบเดียว'], ['ciFirstGreen', 'CI เขียวรอบแรก'],
    ['reviewOnce', 'รีวิวผ่านรอบเดียว'], ['tokenLean', 'ประหยัด token'], ['noBlock', 'ไม่ติดขัด'], ['paidUp', 'ชำระครบ'],
  ]);
  const bonusSource = String(cfg.bonuses.source);
  const mo = cfg.missions.origin;
  const DIFF_TH = /** @type {const} */ ([['easy', 'ง่าย'], ['medium', 'กลาง'], ['hard', 'ยาก']]);

  const pr = o.prices;
  /** A provider price as a panel rate: its value, unit and where it was read, with the day. @param {string} key @param {string} name */
  const provider = (key, name) => rate(`office.prices.${key}.value`, `${name} (${pr[key].label ?? key})`, pr[key].unit, `${pr[key].url} · อ่านเมื่อ ${pr[key].fetched}`);
  const minute = provider('actionsMinute', 'ราคานาทีของ GitHub Actions');
  const quota = provider('freeMinutesPerMonth', 'โควตาฟรี');
  const quotaNote = `แสดงราคาตามรายการ (list price) · โควตาฟรี ${fmtRate(pr.freeMinutesPerMonth.value)} นาทีต่อเดือน ภายในโควตาจ่ายจริง ฿0`;
  const fx = 'อัตรา USD→THB ที่บันทึกแบบเดียวกับค่า AI: fxRate ของ usage marker ล่าสุดภายในวันนั้น ถ้าไม่มีใช้ค่าที่ snapshot อ่านจาก open.er-api.com พร้อมวันที่';
  const menuPrices = menu?.prices ? Object.entries(menu.prices) : [];

  /** @type {Entry[]} */
  const entries = [
    {
      id: 'income', group: 'income', title: 'เงินสนับสนุนทีมตามขนาดงาน',
      input: 'issue ที่ release workflow ปิดหลัง deploy production สำเร็จ และ label size:* ณ ตอน Gate 1',
      readFrom: 'timeline ของ issue (closed โดย agent App) และ size marker ของ PO',
      formula: 'ฐานตามขนาด × (1 + min(เพดาน, ผลรวมโบนัส %) ÷ 100); ไม่มี label ขนาดไม่ได้เงิน; ขนาด = กฎใน spec × น้ำหนัก + ไฟล์ × น้ำหนัก + ความเสี่ยง × น้ำหนัก เทียบเกณฑ์',
      rates: [
        ...sizes.map((s) => rate(`tiers.${s}`, `ฐานขนาด ${s}`, 'บาท', String(cfg.tiers.source))),
        rate('sizing.weights.rule', 'น้ำหนักต่อกฎ', 'คะแนน', cfg.sizing.source),
        rate('sizing.weights.file', 'น้ำหนักต่อไฟล์', 'คะแนน', cfg.sizing.source),
        rate('sizing.weights.riskFlag', 'น้ำหนักต่อความเสี่ยง', 'คะแนน', cfg.sizing.source),
        rate('sizing.thresholds.S', 'S ไม่เกิน', 'คะแนน', cfg.sizing.source),
        rate('sizing.thresholds.M', 'M ไม่เกิน', 'คะแนน', cfg.sizing.source),
        rate('sizing.thresholds.L', 'L ไม่เกิน', 'คะแนน', cfg.sizing.source),
        ...sizes.map((s) => rate(`sizing.budgetTokens.${s}`, `งบ token ขนาด ${s}`, 'token', cfg.sizing.source)),
      ],
      notes: ['วิธีประเมินขนาด: Mountain Goat Software, Atlassian'],
    },
    {
      id: 'bonuses', group: 'income', title: 'โบนัส',
      input: 'ข้อเท็จจริงบน GitHub ต่อ issue: คำสั่ง gate ของเจ้าของ, run แรกของ ci.yml, รีวิวแรกของ agent, token รวม, label agent:blocked, ยอดค้างชำระตอนปิด',
      readFrom: 'comment, workflow run, review และ timeline ของ issue และ pull request',
      formula: 'รวม % ของโบนัสที่ได้ ไม่เกินเพดาน',
      rates: [...bonusNames.map(([k, th]) => rate(`bonuses.${k}`, th, '%', bonusSource)), rate('bonusCapPct', 'เพดานโบนัส', '%', cfg.bonusCapSource)],
      notes: [],
    },
    {
      id: 'ai', group: 'cost', title: 'ค่าใช้จ่ายด้าน AI (มูลค่าเทียบราคา API · จ่ายจริงเป็นค่าสมาชิก)',
      input: 'usage marker ของทุก run ของ agent (token และ total_cost_usd)',
      readFrom: 'comment ของ agent App บน issue (<!-- agent-office:usage -->)',
      formula: 'costUsd ของ run × อัตรา USD→THB ที่บันทึกพร้อม run นั้น (open.er-api.com ณ เวลาที่ run จบ) รวมทุก run; อัตราใหม่ไม่ตีราคาค่าใช้จ่ายเก่า',
      rates: priceRates,
      notes: ['เป็นมูลค่าเทียบราคา API ที่ตั้งไว้ ค่าใช้จ่ายจริงจ่ายเป็นค่าสมาชิก', 'cache write รวมอยู่ในช่อง input'],
    },
    {
      id: 'cache', group: 'cost', title: 'ประหยัดได้จาก cache',
      input: 'cacheRead ของแต่ละ run', readFrom: 'usage marker ของ run',
      formula: 'cacheRead × (ราคา input − ราคา cache read) ÷ 1,000,000 × อัตรา THB ของ run นั้น รวมทุก run',
      rates: [priceRates[0], priceRates[1]], notes: [],
    },
    {
      id: 'electricity', group: 'cost', title: 'ค่าไฟฟ้า',
      input: `นาทีของทุก job ใน workflow ของ agent (${o.workflows.join(', ')}) ที่จบในวันนั้น ปัดขึ้นเป็นนาทีเต็มต่อ job แบบที่ GitHub คิด ไม่รวม job ที่นับเป็นค่าน้ำ`,
      readFrom: 'GitHub Actions API: completed_at − started_at ของแต่ละ job ตามวันกรุงเทพฯ',
      formula: `นาที × ราคาต่อนาที (USD) × ${fx}`,
      rates: [minute, quota],
      notes: [quotaNote],
    },
    {
      id: 'water', group: 'cost', title: 'ค่าน้ำประปา',
      input: 'นาทีของงานแก้ซ้ำ: job ของ run บน branch agent/issue-N ที่เริ่มหลัง check run ล้มบน head sha ก่อนหน้าของ branch นั้น ปัดขึ้นเป็นนาทีเต็มต่อ job',
      readFrom: 'GitHub Actions API (run และ job ของ branch) และ check run ของแต่ละ head sha',
      formula: `นาที × ราคาต่อนาที (USD) × ${fx}; นาทีเหล่านี้ไม่อยู่ในค่าไฟ`,
      rates: [minute, quota],
      notes: [quotaNote],
    },
    {
      id: 'internet', group: 'cost', title: 'ค่าอินเทอร์เน็ต',
      input: 'จำนวน request ที่เข้า Pages Function ของบอร์ดในวันนั้น',
      readFrom: 'Cloudflare GraphQL Analytics API (Pages Functions ของโปรเจกต์ agent-office ของ environment นั้น) ด้วย token อ่านอย่างเดียว ไม่มี token หรืออ่านไม่ได้ = ไม่แสดงตัวเลข',
      formula: `request ÷ 1,000,000 × ราคาต่อล้าน request (USD) × ${fx}`,
      rates: [provider('workersRequestsPerMillion', 'ราคา request ของ Cloudflare Workers')],
      notes: [],
    },
    {
      id: 'supplies', group: 'cost', title: 'ค่าเสบียง (อาหารและเครื่องดื่ม)',
      input: `อาหารและเครื่องดื่มจากกิจกรรมจริงของวันนั้น: ${SUPPLY_TRIGGER_TH_LIST}`,
      readFrom: 'issue, run, review และ label บน GitHub; roster ในไฟล์ตั้งค่า; เมนูใน supplies-menu.json',
      formula: 'เลือกรายการจากเมนูตามลำดับหมุนเวียนคงที่ (วัน × ตำแหน่งในทีม × ลำดับ ไม่สุ่ม) แล้วคิดราคาตามหมวดของรายการ รวมทุกจาน; ราคาที่ยังรออยู่แสดง "รอราคา" และคิด ฿0',
      rates: [rate('office.supplies.breakfastBeforeHour', 'มื้อเช้าเมื่อเริ่มงานก่อน', 'นาฬิกา เวลากรุงเทพฯ', String(o.supplies.source)), ...menuPrices.map(([k, p]) => ({ path: `menu.prices.${k}.value`, name: `${k} (${p.item})`, value: Number(p.value), unit: p.unit, origin: `${p.source ?? p.url} · ${p.url} · อ่านเมื่อ ${p.fetched}` }))],
      notes: menu ? [menu.credit.text, `${menu.priceLink.text}: ${menu.priceLink.url}`] : ['ยังไม่ได้อ่านเมนู'],
    },
    {
      id: 'dailyBill', group: 'rules', title: 'บิลรายวันและค่าใช้จ่ายสำนักงานค้างชำระ',
      input: 'ค่าไฟ น้ำ เน็ต และเสบียงของวันที่จบแล้ว ที่มีแหล่งข้อมูล', readFrom: 'สี่บรรทัดข้างบน',
      formula: 'เวลา 00:00 กรุงเทพฯ รวมบรรทัดที่มีแหล่งข้อมูลเป็นบิลเดียวเข้าบัญชีกองเงิน จ่ายหลังค่าใช้จ่ายด้าน AI ส่วนที่กองเงินไม่พอเป็นค่าใช้จ่ายสำนักงานค้างชำระ วันนี้แสดงยอดสะสม "ยังไม่ตัดรอบ"',
      rates: [], notes: [],
    },
    {
      id: 'aiOwed', group: 'rules', title: 'ค่าใช้จ่ายด้าน AI ค้างชำระ และการชำระของ Head',
      input: 'รายการเงินทั้งหมดเรียงตามเวลา นับจาก economyStart', readFrom: 'รายการข้างบนทั้งหมด',
      formula: 'หลังทุกรายการ Head จ่ายอัตโนมัติ: ค่าใช้จ่ายด้าน AI ค้างชำระก่อน แล้วค่าใช้จ่ายสำนักงานค้างชำระ ครั้งละ min(กองเงิน, ยอดค้าง)',
      rates: [], notes: [],
    },
    {
      id: 'missions', group: 'rules', title: 'ภารกิจและ streak',
      input: 'issue ที่ปิด, label agent:blocked, cacheRead และ input ของ run, ยอดค้างชำระตอนสิ้นวัน ตามวันกรุงเทพฯ',
      readFrom: 'timeline, usage marker และบัญชีกองเงิน',
      formula: 'streak ชำระครบ +1 ทุกวันที่จบโดยไม่ค้างชำระ ค้างชำระรีเซ็ตเป็น 0 ได้รางวัลเมื่อถึงจำนวนวันที่กำหนด; ภารกิจแสดงความคืบหน้าจริงเสมอ และเข้ากองเงินเมื่อข้อเท็จจริงครบ',
      rates: [
        ...Object.keys(cfg.missions.streak).map((d) => rate(`missions.streak.${d}`, `streak ${d} วัน`, 'บาท', mo.streak)),
        ...DIFF_TH.map(([d, th]) => rate(`missions.daily.${d}`, `ภารกิจรายวัน ระดับ${th}`, 'บาท', mo.daily)),
        rate('missions.thresholds.closesPerDay', 'ภารกิจรายวัน จำนวน issue ที่ต้องปิด', 'ใบ', mo.thresholds),
        rate('missions.thresholds.cacheReadPct', 'ภารกิจรายวัน cache read ขั้นต่ำ', '% ของ input', mo.thresholds),
        rate('missions.weeklyXl', 'ภารกิจสัปดาห์ ปิดงาน XL', 'บาท', mo.weekly),
        rate('missions.weeklyNoOvernightDebt', 'ภารกิจสัปดาห์ ไม่ค้างชำระข้ามคืน', 'บาท', mo.weekly),
        ...cfg.missions.live.order.map((id) => rate(`missions.live.rewards.${id}`, `ภารกิจสด ${id}`, 'บาท', mo.live)),
        rate('missions.thresholds.leanTokensPerHour', 'ภารกิจสด lean token สูงสุดต่อชั่วโมง', 'token', mo.thresholds),
      ],
      notes: [
        `ระดับของภารกิจรายวัน: ${Object.entries(cfg.missions.dailyDifficulty).map(([id, d]) => `${id} ${d}`).join(', ')} (ที่มา: ${mo.dailyDifficulty})`,
        `ภารกิจสด หมุนทุกชั่วโมงตามลำดับคงที่: ${cfg.missions.live.order.join(' → ')} เลือกจากชั่วโมงตามเวลากรุงเทพฯ ไม่สุ่ม`,
        `สัปดาห์เริ่มวันจันทร์ ตามเวลากรุงเทพฯ (ที่มา: ${mo.weekStart})`,
      ],
    },
  ];

  const r62 = 'ข้อมูลจริงหนึ่งอย่างไม่ถูกนับซ้ำในสองบรรทัด: token → ค่าใช้จ่ายด้าน AI เท่านั้น · นาทีของ job ของ agent → ค่าไฟ · นาทีของงานแก้ซ้ำ → ค่าน้ำ (ไม่อยู่ในค่าไฟ) · request ของ Pages Function → ค่าเน็ต · คนที่ทำงาน, run ที่เริ่ม, review, issue ที่ปิด → ค่าเสบียง';
  return { title: PANEL_TITLE, entries, r62 };
}

/**
 * The panel as plain text lines, the one rendering the page uses for its rate lines.
 * @param {{ title: string, entries: Entry[], r62: string }} panel
 */
export function panelText(panel) {
  const lines = [panel.title];
  for (const e of panel.entries) {
    lines.push(e.title, `ข้อมูลที่นับ: ${e.input}`, `อ่านจาก: ${e.readFrom}`, `สูตร: ${e.formula}`);
    for (const r of e.rates) lines.push(`${r.name} ${fmtRate(r.value)} ${r.unit} (ที่มา: ${r.origin})`);
    lines.push(...e.notes);
  }
  lines.push(panel.r62);
  return lines.join('\n');
}
