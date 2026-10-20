/*
 * The probe deploy-agent-office.yml runs after each publish (docs/sdd/agent-office-live/spec.md
 * R42, R43, R46, R65). It first waits until the deployment serves the sha it published (a fresh
 * deployment can answer before its files are everywhere: docs/PITFALLS.md 6.130 for the Jira proxy),
 * then judges each probe once, never retrying a judgement: the page answers 200, the snapshot
 * without a token 401, a POST 405, another origin 403. It sends no token and reads no data.
 * The command line wrapper is scripts/agent-office-smoke.mjs.
 */
const DEPLOYMENT = /^https:\/\/(?:[a-z0-9-]+\.)?agent-office-(?:staging|prod)\.pages\.dev$/;

/**
 * @param {{ url: string, sha: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, attempts?: number, waitMs?: number }} input
 * @returns {Promise<string[]>} the lines to print
 */
export async function smoke({ url, sha, fetch: fetchFn = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 36, waitMs = 5000 }) {
  if (!DEPLOYMENT.test(String(url))) throw new Error(`${url} is not an Agent Office deployment URL`);
  if (!/^[0-9a-f]{40}$/.test(String(sha))) throw new Error(`"${sha}" is not a full sha`);
  const lines = [];

  let served = '';
  for (let i = 0; i < attempts; i++) {
    const r = await fetchFn(`${url}/version.txt`, { cache: 'no-store' });
    served = r.ok ? (await r.text()).trim() : `HTTP ${r.status}`;
    if (served === sha) break;
    if (i + 1 < attempts) await sleep(waitMs);
  }
  if (served !== sha) throw new Error(`${url} did not serve ${sha} after ${attempts} reads of version.txt (last: ${served})`);
  lines.push(`${url} serves ${sha}.`);

  /* The static files can be live before the Functions bundle is: run 38891019005 read version.txt at
     the right sha and then got 404 for /data/state.json one second later, while the same URL answered
     401 ("Missing bearer token") minutes after. So wait, with the same bound, until the middleware
     answers at all (anything but 404); then each probe below is judged once. */
  /* One answer is not enough: run 38896358612 got a non-404 here and then 404 on the next request a
     second later, as the deployment reached Cloudflare's edges one by one. Wait for `steady`
     answers in a row, `waitMs` apart, each not 404. */
  const steady = 3;
  let inRow = 0;
  for (let i = 0; i < attempts && inRow < steady; i++) {
    const status = (await fetchFn(`${url}/data/state.json`, { cache: 'no-store' })).status;
    inRow = status === 404 ? 0 : inRow + 1;
    if (inRow < steady && i + 1 < attempts) await sleep(waitMs);
  }
  if (inRow < steady) throw new Error(`${url} did not answer from its middleware ${steady} times in a row at /data/state.json within ${attempts} reads`);
  lines.push(`${url} answers from its middleware.`);

  const probes = [
    { what: 'the page', path: '/', init: {}, want: 200 },
    { what: 'the snapshot without a token', path: '/data/state.json', init: {}, want: 401 },
    { what: 'POST to the snapshot', path: '/data/state.json', init: { method: 'POST' }, want: 405 },
    { what: 'the snapshot from another origin', path: '/data/state.json', init: { headers: { Origin: 'https://evil.example' } }, want: 403 },
  ];
  for (const p of probes) {
    const r = await fetchFn(`${url}${p.path}`, p.init);
    if (r.status !== p.want) throw new Error(`${p.what} answered ${r.status}, want ${p.want}`);
    lines.push(`${p.what}: ${r.status}, as it must.`);
  }

  /* R48a: the page signs in with ./app/env.json. Production on 16 Oct 2026 served none (the page fallback
     answered with HTML), so the sign-in button stayed disabled. It must be JSON naming this environment's
     Firebase project. */
  const project = /agent-office-prod\.pages\.dev$/.test(String(url)) ? 'taskfolio-prod' : 'taskfolio-staging';
  const er = await fetchFn(`${url}/app/env.json`, { cache: 'no-store' });
  /** @type {{ firebase?: { apiKey?: unknown, projectId?: unknown } } | null} */
  let envBody = null;
  try { envBody = er.ok ? JSON.parse(await er.text()) : null; } catch { envBody = null; }
  const fb = envBody?.firebase;
  if (!fb || typeof fb.apiKey !== 'string' || !fb.apiKey.startsWith('AIza')) throw new Error(`${url}/app/env.json is not the Firebase web config (HTTP ${er.status}); sign in would stay disabled`);
  if (fb.projectId !== project) throw new Error(`${url}/app/env.json names ${String(fb.projectId)}, not ${project}`);
  lines.push(`app/env.json names ${project}, as it must.`);
  return lines;
}
