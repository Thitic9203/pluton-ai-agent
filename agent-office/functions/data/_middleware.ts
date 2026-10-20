/**
 * Runs before every request under `/data/` on the Agent Office Pages projects, where the board
 * snapshot `state.json` is published (docs/sdd/agent-office-live/spec.md R42, R43, R65). It is the
 * only Function of these projects, and it only checks the caller: it holds no credential and reads
 * nothing but Google's signing keys and the caller's own `users/{uid}` record (main thread design
 * change, 16 Oct 2026: no GitHub token and no Pages secret).
 *
 * The order: `APP_ORIGIN` and `FIREBASE_PROJECT_ID` must be set (500 otherwise, never a wider
 * fallback); CORS and the GET guard of the Jira proxy (`handleCors`, one origin, 405 for any other
 * method); then `requireVerifiedCaller`, the Jira proxy's own check (401 for a missing or bad token,
 * 403 for an account that is not active, whatever its role, 502 when the status cannot be read);
 * only then the static file, marked `no-store` so no browser or shared cache keeps a copy.
 *
 * It imports none of the snapshot libraries (agent-office/lib), which run in Node in the workflow.
 */

import { handleCors, misconfigured, validateAppOrigin } from '../../../src/services/jiraCors';
import { requireVerifiedCaller } from '../../../functions/_lib/verifiedRequest';

interface Env {
  APP_ORIGIN?: string;
  FIREBASE_PROJECT_ID?: string;
}

const FIREBASE_PROJECT = /^[a-z0-9-]{4,40}$/;

export const onRequest: PagesFunction<Env> = async (context) => {
  const appOrigin = validateAppOrigin(context.env.APP_ORIGIN);
  if (appOrigin === null) {
    return misconfigured('Agent Office misconfigured: APP_ORIGIN is not one https origin');
  }
  const projectId = context.env.FIREBASE_PROJECT_ID ?? '';
  if (!FIREBASE_PROJECT.test(projectId)) {
    return misconfigured('Agent Office misconfigured: FIREBASE_PROJECT_ID is not set');
  }
  return handleCors(context.request, appOrigin, async () => {
    const caller = await requireVerifiedCaller(context.request, projectId);
    if (caller instanceof Response) return caller;
    const file = await context.next();
    const response = new Response(file.body, file);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  });
};
