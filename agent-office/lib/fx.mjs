// The USD→THB rate the snapshot reads once, for a day with no usage marker rate (R61). Same source as
// R13 and R50: open.er-api.com, free and keyless. Spec: docs/sdd/agent-office-live/spec.md R13, R50, R61.

export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

/**
 * @param {{ fetch?: typeof fetch }} [options]
 * @returns {Promise<{ rate: number, at: string, fact: string }>} throws when the rate cannot be read
 */
export async function readUsdThb({ fetch: fetchFn = globalThis.fetch } = {}) {
  const res = await fetchFn(FX_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`open.er-api.com answered ${res.status}`);
  const body = await res.json();
  const rate = body?.rates?.THB;
  const at = Date.parse(String(body?.time_last_update_utc ?? ''));
  if (body?.result !== 'success' || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(at)) {
    throw new Error('open.er-api.com answered without a THB rate and its time');
  }
  return { rate, at: new Date(at).toISOString(), fact: 'open.er-api.com' };
}
