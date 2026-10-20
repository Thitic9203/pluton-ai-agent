// T28. Size. Spec: docs/sdd/agent-office-live/spec.md R32, R60.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sizeScore, sizeFromScore, parseSizeMarker, sizeAtGate1, sizeNote, cardSize, RISK_FLAGS } from './size.mjs';
import { CONFIG_URL, validateConfig } from './config.mjs';

const { sizing } = validateConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')));

test('R60: scores 6, 7, 15, 16, 30 and 31 give S, M, M, L, L and XL', () => {
  assert.deepEqual([6, 7, 15, 16, 30, 31].map((s) => sizeFromScore(s, sizing.thresholds)), ['S', 'M', 'M', 'L', 'L', 'XL']);
});

test('R60: score = rules + files + 5 per risk flag, from fixture plans', () => {
  const plans = [
    [{ rules: 4, files: 2, risk: [] }, 6, 'S'],
    [{ rules: 4, files: 3, risk: [] }, 7, 'M'],
    [{ rules: 6, files: 4, risk: ['ui'] }, 15, 'M'],
    [{ rules: 7, files: 4, risk: ['ui'] }, 16, 'L'],
    [{ rules: 10, files: 10, risk: ['ui', 'workflow'] }, 30, 'L'],
    [{ rules: 11, files: 10, risk: ['ui', 'workflow'] }, 31, 'XL'],
  ];
  for (const [plan, score, size] of plans) {
    assert.equal(sizeScore(plan, sizing.weights), score);
    assert.equal(sizeFromScore(sizeScore(plan, sizing.weights), sizing.thresholds), size);
  }
});

test('R60: a repeated or unknown risk flag counts once or not at all', () => {
  assert.equal(sizeScore({ rules: 1, files: 1, risk: ['ui', 'ui', 'nonsense'] }, sizing.weights), 7);
  assert.deepEqual(RISK_FLAGS, ['ui', 'rules', 'workflow', 'data']);
});

test('R60: the size marker is parsed; a bad one gives null', () => {
  const m = parseSizeMarker('<!-- agent-office:size {"v":1,"size":"M","rules":6,"files":4,"risk":["ui"],"score":15} -->\nrest');
  assert.deepEqual(m, { size: 'M', rules: 6, files: 4, risk: ['ui'], score: 15 });
  assert.equal(parseSizeMarker('<!-- agent-office:size {"size":"XXL","rules":1,"files":1,"risk":[]} -->'), null);
  assert.equal(parseSizeMarker('no marker'), null);
});

const ev = (event, name, at) => ({ event, label: { name }, created_at: `2026-10-16T${at}:00:00Z` });

test('R60: a label changed after Gate 1 keeps the Gate-1 size with one warning', () => {
  const tl = [ev('labeled', 'size:M', '01'), ev('unlabeled', 'size:M', '05'), ev('labeled', 'size:XL', '05')];
  const r = sizeAtGate1(tl, '2026-10-16T03:00:00Z');
  assert.equal(r.size, 'M');
  assert.equal(r.warnings.length, 1);
});

test('R60: a change before Gate 1 counts with no warning; no Gate 1 yet reads the current label', () => {
  const tl = [ev('labeled', 'size:S', '01'), ev('unlabeled', 'size:S', '02'), ev('labeled', 'size:L', '02')];
  assert.deepEqual(sizeAtGate1(tl, '2026-10-16T03:00:00Z'), { size: 'L', warnings: [] });
  assert.deepEqual(sizeAtGate1(tl, null), { size: 'L', warnings: [] });
  assert.deepEqual(sizeAtGate1([], '2026-10-16T03:00:00Z'), { size: null, warnings: [] });
});

test('R32 R60: the card note names both sources; an unlabelled issue shows ยังไม่ประเมินขนาด', () => {
  const note = sizeNote({ size: 'M', rules: 6, files: 4, risk: ['ui'], score: 15 });
  assert.equal(note, 'ขนาดแบบ T-shirt (relative estimation): spec 6 ข้อ · ไฟล์ 4 · ความเสี่ยง 1 · วิธี: Mountain Goat Software, Atlassian');
  assert.match(sizeNote(null), /Mountain Goat Software, Atlassian/);
  assert.equal(cardSize(null), 'ยังไม่ประเมินขนาด');
  assert.equal(cardSize('M'), 'M');
});
