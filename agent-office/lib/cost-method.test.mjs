// T35. The "ที่มาของค่าใช้จ่าย" panel from the config. Spec: docs/sdd/agent-office-live/spec.md R62, R64.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { costMethod, panelText, fmtRate, PANEL_TITLE } from './cost-method.mjs';
import { electricity } from './office.mjs';
import { incomeFor } from './economy.mjs';
import { CONFIG_URL, MENU_URL, validateConfig, loadMenu } from './config.mjs';

const cfg = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));

/** Every numeric leaf under the blocks R64 names, as [path, value]. */
function leaves(obj, path, out = []) {
  if (typeof obj === 'number') out.push([path, obj]);
  else if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj)) leaves(v, `${path}.${k}`, out);
  return out;
}
const BLOCKS = ['tiers', 'bonusCapPct', 'bonuses', 'sizing', 'missions', 'office', 'prices'];
const allLeaves = (c) => BLOCKS.flatMap((b) => leaves(c[b], b));

test('R64: one entry per cost line, each with input, where read, formula and rates', () => {
  const p = costMethod(cfg);
  assert.equal(p.title, PANEL_TITLE);
  assert.equal(PANEL_TITLE, 'ที่มาของค่าใช้จ่าย');
  // R64 order (owner popups, 16 Oct 2026 about 00:15): income, AI, electricity, water, internet, supplies, rules.
  assert.deepEqual(p.entries.map((e) => e.id), ['income', 'bonuses', 'ai', 'cache', 'electricity', 'water', 'internet', 'supplies', 'dailyBill', 'aiOwed', 'missions']);
  assert.deepEqual([...new Set(p.entries.map((e) => e.group))], ['income', 'cost', 'rules']);
  assert.match(p.entries.find((e) => e.id === 'ai').title, /มูลค่าเทียบราคา API · จ่ายจริงเป็นค่าสมาชิก/);
  for (const e of p.entries) for (const k of ['title', 'input', 'readFrom', 'formula']) assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${e.id}.${k}`);
});

test('R64: every numeric config rate is in the panel, beside its origin', () => {
  const p = costMethod(cfg);
  const rates = p.entries.flatMap((e) => e.rates.map((r) => ({ ...r, entry: e.id })));
  const text = panelText(p);
  const found = allLeaves(cfg);
  assert.ok(found.length >= 30, `walked ${found.length} leaves`);
  for (const [path, value] of found) {
    const r = rates.find((x) => x.path === path);
    assert.ok(r, `no panel rate for ${path}`);
    assert.equal(r.value, value, path);
    assert.ok(r.origin.length > 0, `${path} has no origin`);
    assert.ok(text.includes(`${r.name} ${fmtRate(value)}`), `${path} not rendered`);
  }
});

test('R64 Q18 Q19 Q20: mission rewards show with the owner origin, the live order and Monday weeks', () => {
  const text = panelText(costMethod(cfg));
  assert.ok(!text.includes('ยังไม่มีแหล่งข้อมูล'));
  assert.match(text, /ภารกิจรายวัน ระดับยาก 500 บาท \(ที่มา: owner popup 16 Oct 2026\)/);
  assert.match(text, /ภารกิจสด หมุนทุกชั่วโมงตามลำดับคงที่: ciFirst → reviewFirst → close1 → lean/);
  assert.match(text, /สัปดาห์เริ่มวันจันทร์/);
});

test('R64: changing one config value changes the panel and the calculator together', () => {
  const c2 = structuredClone(cfg);
  c2.office.prices.actionsMinute.value = 9.75;
  c2.tiers.L = 2500;
  const before = panelText(costMethod(cfg));
  const after = panelText(costMethod(c2));
  assert.ok(!before.includes('9.75') && after.includes('9.75'));
  assert.ok(after.includes('2,500'));
  const jobs = [{ id: 1, workflow: 'agent.yml', started_at: '2026-10-21T02:00:00Z', completed_at: '2026-10-21T02:15:00Z' }];
  assert.equal(electricity({ day: '2026-10-21', jobs, cfg: c2, fx: { rate: 1, at: null, fact: 'test' } }).thb, 15 * 9.75);
  assert.equal(incomeFor({ size: 'L', pct: 0 }, c2).amount, 2500);
});

test('R62: the panel states that one input never feeds two cost lines, listing each input', () => {
  const p = costMethod(cfg);
  assert.match(p.r62, /ไม่ถูกนับซ้ำ/);
  for (const e of ['token', 'นาทีของ job ของ agent', 'นาทีของงานแก้ซ้ำ', 'request ของ Pages Function', 'run ที่เริ่ม']) assert.ok(p.r62.includes(e), e);
});

test('R64: the formatter writes two decimals for a fraction, as 4.20 in mock v61, and groups thousands', () => {
  assert.equal(fmtRate(0.2), '0.20');
  assert.equal(fmtRate(4.2), '4.20');
  assert.equal(fmtRate(1590), '1,590');
  assert.equal(fmtRate(29100000), '29,100,000');
});

test('R61, R64: each provider price shows with its page and the day it was read, and the free quota', () => {
  const text = panelText(costMethod(cfg));
  for (const p of Object.values(cfg.office.prices)) assert.ok(text.includes(`${p.url} · อ่านเมื่อ ${p.fetched}`), p.url);
  assert.match(text, /โควตาฟรี 2,000 นาทีต่อเดือน ภายในโควตาจ่ายจริง ฿0/);
  assert.doesNotMatch(text, /mock v61\)/);
});

test('R61, R64: the supplies row lists every menu price with its source, credits the menu and links back to Numbeo', () => {
  const menu = loadMenu(readFileSync(MENU_URL, 'utf8'));
  const p = costMethod(cfg, menu);
  const sup = p.entries.find((e) => e.id === 'supplies');
  assert.deepEqual(sup.rates.map((r) => r.path).sort(), ['office.supplies.breakfastBeforeHour', ...Object.keys(menu.prices).map((k) => `menu.prices.${k}.value`)].sort());
  for (const r of sup.rates.filter((x) => x.path.startsWith('menu.'))) assert.equal(r.value, menu.prices[r.path.split('.')[2]].value);
  const text = panelText(p);
  assert.ok(text.includes('เมนูจาก The Sims 4 (Sims Wiki, CC BY-SA)'));
  assert.ok(text.includes(menu.priceLink.url), 'the link back to Numbeo is shown');
  assert.ok(text.includes('cocktail (Mojito / Margarita) 390'));
});
