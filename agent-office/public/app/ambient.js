// Ambient life of the mock's people (spec docs/sdd/agent-office-live/spec.md R49a, R21, R49). Pure: no DOM, no clock,
// no random of its own, so agent-office/ambient.test.mjs drives it. It moves people and starts breaks; it never
// touches a person's state, issue, release or any money figure, which stay the snapshot's (R0, R5 to R8).
import { isFlavourSafe } from './live.js';

// The mock's own timings: its step loop ran every 4 s and moved an idle person's spot with chance 0.3; someone spoke
// every 5.5 s; a break lasted ACT_MS (office.js) and went to the kitchen 6 times in 10 (pickUse's kitchenFirst).
export const AMBIENT = Object.freeze({ stepMs: 4000, idleMove: .3, breakChance: .5, kitchenFirst: .6, chatMs: 5500 });

const free = (p, now) => !p.drag && !(p.act && p.act.until > now);

/**
 * One ambient step. Each free idle person other than the Head either takes a break at the object `pickUse` returns
 * (the least-used one of the whole map, so every object gets its turn) or, as in the mock, changes idle spot with
 * chance 0.3. Returns the events: { p, kind: 'break', pick } or { p, kind: 'move' }.
 */
export function ambientStep(people, { now, rand, pickUse, actMs }) {
  const out = [];
  people.forEach(p => {
    if (p.state !== 'idle' || !free(p, now)) return;
    if (p.role !== 'head' && rand() < AMBIENT.breakChance) {
      const pick = pickUse(p, rand() < AMBIENT.kitchenFirst, people, now);
      if (pick) { p.act = { k: 'ix', ix: pick.ix, a: pick.a, until: now + actMs }; out[out.length] = { p, kind: 'break', pick }; return; }
    }
    if (rand() < AMBIENT.idleMove) {
      const spot = Math.floor(rand() * 3);
      if (spot !== p.idleSpot) { p.idleSpot = spot; out[out.length] = { p, kind: 'move' }; }
    }
  });
  return out;
}

/** The mock's chatter: one person at random, or null with nobody on the map. */
export const pickSpeaker = (people, rand) => people.length ? people[Math.floor(rand() * people.length)] : null;

/** R21: draw up to `tries` lines and keep the first that states no work fact; null means nothing is said. */
export function safeLine(draw, tries = 4) {
  for (let k = 0; k < tries; k++) { const t = draw(); if (isFlavourSafe(t)) return t; }
  return null;
}
