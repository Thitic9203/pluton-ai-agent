// T3. Spec: docs/sdd/ols-real/spec.md R10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newestRunDir, failedCases } from './e2e.mjs';

test('R10: the newest dev run is the latest folder name, other folders ignored', () => {
  assert.equal(newestRunDir(['dev-smoke-2026-10-16-1156', 'dev-smoke-2026-10-16-1336', 'dev-smoke-2026-10-09-2359', 'preprod-x', 'dev-smoke-bad']), 'dev-smoke-2026-10-16-1336');
  assert.equal(newestRunDir([]), null);
});

const run = {
  stats: { unexpected: 2 },
  suites: [
    {
      title: 'media.spec.ts',
      file: 'tests/media.spec.ts',
      specs: [
        { title: 'MLV-008 media list shows pending', file: 'tests/media.spec.ts', tests: [{ status: 'unexpected', results: [{ error: { message: 'first error' } }, { error: { message: 'last error' } }] }] },
        { title: 'MLV-009 passes', file: 'tests/media.spec.ts', tests: [{ status: 'expected', results: [{}] }] },
        { title: 'MLV-010 flaky one', file: 'tests/media.spec.ts', tests: [{ status: 'flaky', results: [{ error: { message: 'x' } }, {}] }] },
      ],
      suites: [{ title: 'nested', specs: [{ title: 'no id here', file: 'tests/feed.spec.ts', tests: [{ status: 'unexpected', results: [{ errors: [{ message: 'from errors[]' }] }] }] }] }],
    },
  ],
};

test('R10: every unexpected case, with its first error, nested suites included', () => {
  assert.deepEqual(failedCases(run), [
    { id: 'MLV-008', title: 'MLV-008 media list shows pending', file: 'tests/media.spec.ts', error: 'first error' },
    { id: 'no id here', title: 'no id here', file: 'tests/feed.spec.ts', error: 'from errors[]' },
  ]);
  assert.deepEqual(failedCases({}), []);
});
