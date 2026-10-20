// The runner's time zone, checked before the end to end suite starts (docs/e2e/E2E_MASTER_PLAN.md,
// B1, "Role fixtures and seeding").
//
// The six Chromium projects set no `timezoneId`, so the browser takes the runner's zone, and every
// week, month end and holiday a spec reads depends on it. SPEC section 4.9 fixes the product's zone
// at Asia/Bangkok. Rather than trust that the runner is set that way, e2e/support/global-setup.ts
// asks, and a runner in any other zone stops the run with this message before a test starts.

export const BANGKOK = 'Asia/Bangkok';

/** Null when `zone` is Asia/Bangkok, otherwise the sentence that stops the run. */
export function timezoneProblem(zone) {
  if (zone === BANGKOK) return null;
  const seen = typeof zone === 'string' && zone !== '' ? zone : 'an unreadable zone';
  return `This runner is in ${seen}, and the end to end suite needs ${BANGKOK} (SPEC section 4.9): ` +
    `the six Chromium projects take the runner's zone. Run with TZ=${BANGKOK}.`;
}

/**
 * Whether the runner's zone reaches the browser in this run. With `E2E_GROUP` unset the six
 * Chromium projects take it, so it must be Asia/Bangkok. With a device group set, every project is a
 * profile of scripts/lib/e2e-browsers.mjs `PROFILES`, each fixing `timezoneId: 'Asia/Bangkok'`, so
 * the run starts in any zone; that is how B5 shows the same result on a runner in another zone
 * (docs/e2e/E2E_MASTER_PLAN.md, B5 DoD).
 */
export function runnerZoneMatters(env) {
  return String(env.E2E_GROUP ?? '').trim() === '';
}
