// Spec docs/sdd/agent-office-live/spec.md R49a (ambient life as in the mock), R21, R49.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AMBIENT, ambientStep, pickSpeaker, safeLine } from './public/app/ambient.js';
import { isFlavourSafe } from './public/app/live.js';

const ROSTER = ['head', 'po', 'ba', 'dev', 'dev', 'dev', 'qa', 'tl', 'tl', 'qal'];
const team = states => ROSTER.map((role, i) => ({ id: i + 1, role, state: states[i] || 'idle', idleSpot: i % 3, issue: null }));
// a seeded random, so a run never depends on the clock
const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
// a least-used picker over a fixed prop list, standing in for office.js pickUse (which needs the 3D scene)
function picker(props) {
  const usage = new Map(props.map(x => [x, 0]));
  return {
    usage,
    pick: (p, _kitchenFirst, people, now) => {
      const busy = new Set(people.filter(q => q !== p && q.act && q.act.until > now).map(q => q.act.ix));
      const free = props.filter(x => !busy.has(x)); if (!free.length) return null;
      const least = Math.min(...free.map(x => usage.get(x))), ix = free.find(x => usage.get(x) === least);
      usage.set(ix, least + 1); return { ix, a: 0 };
    }
  };
}

test('R49a: the mock timings are kept (4 s step, 0.3 idle move, 5.5 s chatter)', () => {
  assert.equal(AMBIENT.stepMs, 4000); assert.equal(AMBIENT.idleMove, .3); assert.equal(AMBIENT.chatMs, 5500);
});

test('R49a: with every person idle, every non-Head person walks or takes a break within a few steps, and the Head never takes one', () => {
  const people = team([]), pk = picker(['a', 'b', 'c']), rand = seeded(), moved = new Set(); let now = 0;
  for (let s = 0; s < 30; s++) { now += AMBIENT.stepMs; ambientStep(people, { now, rand, pickUse: pk.pick, actMs: 45000 }).forEach(e => moved.add(e.p.id)); }
  people.filter(p => p.role !== 'head').forEach(p => assert.ok(moved.has(p.id), `${p.role}#${p.id} never moved`));
  assert.ok(!people.find(p => p.role === 'head').act, 'the Head takes no break (mock breakActivity)');
});

test('R49a, R49: ambient life changes no state and sends nobody who works, waits or is blocked on a break', () => {
  const states = ['waiting', 'working', 'blocked', 'working', 'idle', 'idle', 'working', 'waiting', 'idle', 'blocked'];
  const people = team(states), pk = picker(['a', 'b', 'c', 'd']), rand = seeded(3); let now = 0;
  for (let s = 0; s < 50; s++) {
    now += AMBIENT.stepMs;
    ambientStep(people, { now, rand, pickUse: pk.pick, actMs: 45000 }).forEach(e => assert.equal(e.p.state, 'idle', `event for a ${e.p.state} person`));
  }
  people.forEach((p, i) => assert.equal(p.state, states[i]));
  people.filter(p => p.state !== 'idle').forEach(p => { assert.equal(p.act, undefined); assert.equal(p.idleSpot, (p.id - 1) % 3); });
});

test('R49a: every prop of the list gets a turn within K steps', () => {
  const props = Array.from({ length: 40 }, (_, i) => 'prop' + i), people = team([]), pk = picker(props), rand = seeded(11);
  const idle = people.filter(p => p.role !== 'head').length, K = Math.ceil(props.length * 4 / idle) + 10;
  let now = 0, steps = 0;
  while (steps < K && [...pk.usage.values()].some(n => n === 0)) { steps++; now += AMBIENT.stepMs * 12; ambientStep(people, { now, rand, pickUse: pk.pick, actMs: 45000 }); }
  const unused = props.filter(x => !pk.usage.get(x));
  assert.deepEqual(unused, [], `unused after ${steps} of ${K} steps`);
});

test('R49a: a person on a break or dragging a seat is left alone until it ends', () => {
  const people = team([]), pk = picker(['a']), rand = () => 0;
  people[1].act = { k: 'ix', ix: 'x', a: 0, until: 10000 }; people[2].drag = {};
  const ev = ambientStep(people, { now: 5000, rand, pickUse: pk.pick, actMs: 45000 });
  assert.ok(!ev.some(e => e.p === people[1] || e.p === people[2]));
  assert.equal(people[1].act.ix, 'x');
});

test('R49a, R21: chatter picks a speaker and shows only a flavour-safe line', () => {
  const people = team([]);
  assert.equal(pickSpeaker([], Math.random), null);
  assert.ok(people.includes(pickSpeaker(people, seeded())));
  const lines = ['หยิบ #501 เองเลย', 'deploy staging แล้ว', 'อากาศดีจัง'];
  let k = 0; const line = safeLine(() => lines[k++], 5);
  assert.equal(line, 'อากาศดีจัง'); assert.ok(isFlavourSafe(line));
  assert.equal(safeLine(() => 'merge PR #3 แล้ว', 4), null, 'no safe line: nothing is said');
});

test('R49a: office.js wires the step, the break and the chatter, and keeps no R49 name', () => {
  const src = readFileSync(new URL('./public/app/office.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/ambient\.js'/);
  assert.match(src, /ambientStep\(people,/);
  assert.match(src, /AMBIENT\.stepMs/); assert.match(src, /AMBIENT\.chatMs/);
  assert.match(src, /safeLine\(/);
  for (const name of ['simulate', 'sweepTick', 'releaseStep', 'accrue', 'headPays', 'checkMissions', 'payout']) assert.ok(!src.includes(name), name);
});
