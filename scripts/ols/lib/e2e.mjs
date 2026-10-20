// The e2e fix loop's intake: failed cases of the newest dev run. Spec: docs/sdd/ols-real/spec.md R10. Pure.

const RUN_DIR = /^dev-smoke-\d{4}-\d{2}-\d{2}-\d{4}$/;

/** R10: newest by folder name (the name carries the Bangkok time; mtime can lie after a copy). */
export function newestRunDir(names) {
  const runs = (names ?? []).filter((n) => RUN_DIR.test(n)).sort();
  return runs.length ? runs[runs.length - 1] : null;
}

const firstError = (results) => {
  const r = (results ?? [])[0] ?? {};
  const msg = r.error?.message ?? r.errors?.[0]?.message ?? '';
  return String(msg).trim().slice(0, 500);
};

/** R10: every `unexpected` case of a Playwright JSON report, with its first error (P7: "ใช้ error แรก"). */
export function failedCases(run) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const failed = (spec.tests ?? []).find((t) => t.status === 'unexpected');
      if (!failed) continue;
      const id = /\b[A-Z]+-\d+\b/.exec(spec.title)?.[0] ?? spec.title;
      out.push({ id, title: spec.title, file: spec.file ?? suite.file ?? '', error: firstError(failed.results) });
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of run?.suites ?? []) walk(s);
  return out;
}
