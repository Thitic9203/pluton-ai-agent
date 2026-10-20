// T6. Config and its validator. Spec: docs/sdd/agent-office-live/spec.md R1, R14.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig, loadConfig, CONFIG_URL, MENU_URL, loadMenu, validateMenu } from './config.mjs';
import { LIMIT } from '../../scripts/agent/dispatch.mjs';
import { BATCH_SIZE } from '../../scripts/agent/release.mjs';

const real = () => JSON.parse(readFileSync(CONFIG_URL, 'utf8'));

test('R1: the real config passes validation', () => {
  assert.doesNotThrow(() => validateConfig(real()));
  assert.equal(loadConfig(readFileSync(CONFIG_URL, 'utf8')).version, 1);
});

test('ols-real R13: OLS reads the mac-snapshot source from a named repository variable', () => {
  const ols = real().projects.find((p) => p.id === 'ols');
  assert.deepEqual(ols.source, { kind: 'mac-snapshot', variable: 'OLS_BOARD' });
  const c = real();
  c.projects[1].source = { kind: 'mac-snapshot', variable: 'ols board' };
  assert.throws(() => validateConfig(c), /source\.variable/);
});

test('R1: a config missing a role of the catalogue throws', () => {
  const c = real();
  delete c.roles.qal;
  assert.throws(() => validateConfig(c), /roles\.qal/);
});

test('R1: an unknown source.kind throws', () => {
  const c = real();
  c.projects[0].source.kind = 'jira-magic';
  assert.throws(() => validateConfig(c), /source\.kind/);
});

test('R1: a roster role not in roles throws', () => {
  const c = real();
  c.roster.push({ role: 'designer' });
  assert.throws(() => validateConfig(c), /roster\[\d+\]\.role/);
});

test('R1 R55: null is accepted nowhere, and the mission constants need an origin (owner answers Q18 to Q20)', () => {
  const c = real();
  c.office.prices.actionsMinute.value = null;
  assert.throws(() => validateConfig(c), /office\.prices\.actionsMinute\.value/);
  const d = real();
  d.missions.daily = null;
  assert.throws(() => validateConfig(d), /missions\.daily/);
  const e = real();
  delete e.missions.origin.live;
  assert.throws(() => validateConfig(e), /missions\.origin\.live/);
  const f = real();
  f.missions.dailyDifficulty.close2 = 'extreme';
  assert.throws(() => validateConfig(f), /missions\.dailyDifficulty\.close2/);
  const g = real();
  g.missions.live.order = [...g.missions.live.order, 'random'];
  assert.throws(() => validateConfig(g), /missions\.live/);
  const h = real();
  h.missions.weekStart = 'sunday';
  assert.throws(() => validateConfig(h), /missions\.weekStart/);
});

test('R66: economyStart is on or before the day AGENT_ENABLED was set, with that source', () => {
  // gh variable list: AGENT_ENABLED true 2026-10-16T16:50:30Z, 16 Oct 2026 23:50 Asia/Bangkok.
  const c = real();
  assert.ok(c.economyStart <= '2026-10-16', `economyStart ${c.economyStart} is after the enable day 2026-10-16`);
  assert.doesNotMatch(c.economyStartSource, /placeholder/);
});

test('R1: a bad economyStart throws', () => {
  const c = real();
  c.economyStart = '20 Oct 2026';
  assert.throws(() => validateConfig(c), /economyStart/);
});

test('R14: token prices come from the config with their source and date', () => {
  const { prices } = real();
  assert.equal(prices.input, 4);
  assert.equal(prices.cacheRead, 0.2);
  assert.equal(prices.output, 20);
  assert.match(prices.source, /6 Oct 2026/);
  const c = real();
  delete c.prices.source;
  assert.throws(() => validateConfig(c), /prices\.source/);
});

test('buildLimit and releaseBatch match their sources (dispatch.mjs LIMIT, release.mjs BATCH_SIZE)', () => {
  const c = real();
  assert.equal(c.buildLimit, LIMIT);
  assert.equal(c.buildLimit, 3);
  assert.equal(c.releaseBatch, BATCH_SIZE);
  assert.equal(c.releaseBatch, 10);
});

// T37, R61: every office price is a provider's, with the page it was read from and the day.

test('R61: the office holds provider prices only, no mock constant left', () => {
  const o = real().office;
  assert.deepEqual(Object.keys(o).sort(), ['prices', 'supplies', 'workflows']);
  assert.equal(o.prices.actionsMinute.value, 0.006);
  assert.equal(o.prices.workersRequestsPerMillion.value, 0.3);
  assert.equal(o.prices.freeMinutesPerMonth.value, 2000);
  for (const p of Object.values(o.prices)) {
    assert.match(p.url, /^https:\/\//);
    assert.equal(p.fetched, '2026-10-16');
  }
  assert.doesNotMatch(JSON.stringify(o), /mock|minutesPerRound|thbPerUnit|litresPerFixRound|thbPerM3|thbPerMonth|thbPerMealSet/i);
});

test('R61: a price without url or fetched, or naming the mock, is refused', () => {
  const a = real();
  delete a.office.prices.actionsMinute.url;
  assert.throws(() => validateConfig(a), /office\.prices\.actionsMinute\.url/);
  const b = real();
  delete b.office.prices.workersRequestsPerMillion.fetched;
  assert.throws(() => validateConfig(b), /office\.prices\.workersRequestsPerMillion\.fetched/);
  const c = real();
  c.office.prices.actionsMinute.label = 'from mock v61';
  assert.throws(() => validateConfig(c), /never the mock/);
});

const menuText = () => JSON.parse(readFileSync(MENU_URL, 'utf8'));

test('R61: the supplies menu file passes: 549 Sims 4 items, credited, every price sourced, Numbeo linked back', () => {
  const m = loadMenu(readFileSync(MENU_URL, 'utf8'));
  assert.equal(m.items.length, 549);
  assert.match(m.credit.text, /เมนูจาก The Sims 4 \(Sims Wiki, CC BY-SA\)/);
  assert.equal(m.credit.licence, 'CC BY-SA 3.0');
  assert.match(m.priceLink.url, /^https:\/\/www\.numbeo\.com\/cost-of-living\/in\/Bangkok/);
  assert.deepEqual(Object.entries(m.prices).filter(([, p]) => p.value === null).map(([k]) => k), [], 'no price is pending now');
  assert.equal(m.prices.water.value, 11.73);
  assert.equal(m.prices.snack.value, 135);
  assert.equal(m.prices.fruit.value, 7.06);
  assert.equal(m.prices.cocktail.value, 390);
  assert.equal(m.prices.spirits.value, 280);
});

test('R61: a menu price without url or fetched, a null price without pending, or a mock origin is refused', () => {
  const a = menuText();
  delete a.prices.meal.url;
  assert.throws(() => validateMenu(a), /menu\.prices\.meal\.url/);
  const b = menuText();
  delete b.prices.coffee.fetched;
  assert.throws(() => validateMenu(b), /menu\.prices\.coffee\.fetched/);
  const c = menuText();
  c.prices.tea.value = null;
  assert.throws(() => validateMenu(c), /menu\.prices\.tea\.value: null only with pending: true/);
  c.prices.tea.pending = true;
  assert.doesNotThrow(() => validateMenu(c), 'a pending price is allowed');
  const d = menuText();
  d.prices.beer.source = 'mock v61';
  assert.throws(() => validateMenu(d), /never the mock/);
  const e = menuText();
  e.items[0].price = 'caviar';
  assert.throws(() => validateMenu(e), /menu\.items\.0\.price/);
  const f = menuText();
  f.priceLink.url = 'https://example.com';
  assert.throws(() => validateMenu(f), /link back to Numbeo/);
});

test('R62: the supplies triggers are exactly the four allowed counts', () => {
  for (const extra of ['fixRounds', 'jobHours', 'agentJobMinutes', 'tokens']) {
    const c = real();
    c.office.supplies.triggers[extra] = ['drink'];
    assert.throws(() => validateConfig(c), /office\.supplies\.triggers: must name exactly/, extra);
  }
  const g = real();
  g.office.supplies.triggers.runsStarted = ['champagne'];
  assert.throws(() => validateConfig(g), /office\.supplies\.triggers\.runsStarted/);
});
