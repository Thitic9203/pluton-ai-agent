// The environment scripts/e2e.mjs runs `firebase emulators:exec` and Playwright in.
//
// TZ is set here, the one place every end to end run passes through (npm run test:e2e locally, in
// heavy.mjs and in the ci.yml e2e job), so the runner's zone is never left to the machine or to the
// caller. With E2E_GROUP unset the six Chromium projects take the runner's zone and
// e2e/support/global-setup.ts refuses any zone but Asia/Bangkok (SPEC section 4.9,
// scripts/lib/e2e-timezone.mjs), so TZ is fixed at Asia/Bangkok: the scripts suite runs under
// TZ=UTC, and a shell or a runner in another zone must not turn every shard red. With a device
// group set every profile fixes its own `timezoneId`, and B5 proves the result is the same with the
// runner in another zone (docs/e2e/E2E_MASTER_PLAN.md, B5 DoD), so the caller's TZ is kept there.
import { BANGKOK, runnerZoneMatters } from './e2e-timezone.mjs';

/**
 * `base` plus the ports and project id this run drew, in Asia/Bangkok when the runner zone matters.
 * `browserFirestore`, when given, is the port the browser app is built against: the close proxy in
 * front of the emulator (lib/emulator-close-proxy.mjs, docs/PITFALLS.md 6.189). The Admin SDK in
 * e2e/support keeps FIRESTORE_EMULATOR_HOST, the emulator itself, which emulators:exec sets.
 * @param {Record<string, string | undefined>} base
 * @param {{ firestore: number, browserFirestore?: number, auth: number, app: number, project: string }} ports
 */
export function e2eEnv(base, { firestore, browserFirestore, auth, app, project }) {
  return {
    ...base,
    ...(runnerZoneMatters(base) ? { TZ: BANGKOK } : {}),
    VITE_FIRESTORE_EMULATOR_PORT: String(browserFirestore ?? firestore),
    VITE_AUTH_EMULATOR_PORT: String(auth),
    E2E_APP_PORT: String(app),
    E2E_PROJECT_ID: project,
  };
}
