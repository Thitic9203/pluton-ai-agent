// Requests to the board's Pages Function per Asia/Bangkok day, for the internet line (R61). Read from
// Cloudflare's GraphQL Analytics API with a read-only token (Account Analytics: Read), the
// environment's CLOUDFLARE_ANALYTICS_TOKEN_STAGING or _PROD, which the owner creates. GraphQL takes a
// POST, but the query only reads analytics; the token is held in this closure, sent in the
// Authorization header only, and scrubbed from every error. Fail closed: any doubt throws, and the
// caller shows the line as having no source (R40).
// Spec: docs/sdd/agent-office-live/spec.md R40, R61.
//
// UNVERIFIED until the first read with the owner's token: the dataset name
// `pagesFunctionsInvocationsAdaptiveGroups` and that its `scriptName` dimension names the Pages
// project. A row set with no row naming the project throws rather than counting another project.

export const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const QUERY = `query AgentOfficeRequests($account: string!, $since: Time!, $until: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    pagesFunctionsInvocationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $since, datetime_lt: $until }) {
      sum { requests }
      dimensions { datetimeHour scriptName }
    }
  } }
}`;

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * @param {{ token: string, accountId: string, project: string, since: string, until: string, fetch?: typeof fetch }} input
 *   `since` and `until` are ISO instants; `project` is `agent-office-staging` or `agent-office-prod`.
 * @returns {Promise<Record<string, number>>} requests per Bangkok day
 */
export async function readFunctionRequests({ token, accountId, project, since, until, fetch: fetchFn = globalThis.fetch }) {
  if (typeof token !== 'string' || token === '') throw new Error('no CLOUDFLARE_ANALYTICS_TOKEN for this environment');
  if (!/^[0-9a-f]{32}$/.test(String(accountId))) throw new Error('no Cloudflare account id');
  if (!/^agent-office-(staging|prod)$/.test(String(project))) throw new Error(`not an Agent Office project: ${project}`);
  const scrub = (/** @type {unknown} */ t) => String(t).split(token).join('[token]');
  let res;
  try {
    res = await fetchFn(GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { account: accountId, since, until } }),
    });
  } catch (error) {
    throw new Error(`Cloudflare analytics could not be reached: ${scrub(error instanceof Error ? error.message : error)}`);
  }
  if (!res.ok) throw new Error(`Cloudflare analytics answered ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body?.errors) && body.errors.length) throw new Error(`Cloudflare analytics refused the query: ${scrub(body.errors.map((e) => e?.message).join('; '))}`);
  const rows = body?.data?.viewer?.accounts?.[0]?.pagesFunctionsInvocationsAdaptiveGroups;
  if (!Array.isArray(rows)) throw new Error('Cloudflare analytics answered with no rows');
  const mine = rows.filter((r) => String(r?.dimensions?.scriptName ?? '').includes(project));
  if (rows.length && !mine.length) throw new Error(`no analytics row names ${project}`);
  /** @type {Record<string, number>} */
  const byDay = {};
  for (const r of mine) {
    const n = r?.sum?.requests;
    const at = Date.parse(String(r?.dimensions?.datetimeHour ?? ''));
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(at)) throw new Error('an analytics row has no request count or hour');
    const day = DAY.format(new Date(at));
    byDay[day] = (byDay[day] ?? 0) + n;
  }
  return byDay;
}
