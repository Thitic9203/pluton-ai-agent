/**
 * The after-the-fact audit of main for the always-on agent (docs/superpowers/plans/always-on-dev-agent.md,
 * Decisions Q3, R82): the App can write to main because the repository has no branch protection,
 * so every App commit on main must have arrived through a merged pull request. Commits whose
 * author GitHub could not link are listed as unknown for the owner, without blocking.
 *
 * Run with `node --test scripts/lib/agent-main-audit.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCommits } from '../agent/main-audit.mjs';

const APP = 'taskfolio-agent[bot]';
const bot = { login: APP, type: 'Bot' };
const human = { login: 'Thitic9203', type: 'User' };
const owner = human;
const commit = (sha, author, prs, committer = { login: 'web-flow' }) => ({ sha, author, committer, associatedPullRequests: prs });
const audit = (...commits) => auditCommits({ commits, appLogin: APP });

test('an App commit that came through a merged pull request is not flagged', () => {
  assert.deepEqual(audit(commit('s1', bot, [{ number: 9, merged: true, merged_by: owner }])), []);
});

test('an App commit straight to main is flagged as app', () => {
  const out = audit(commit('s2', bot, []));
  assert.equal(out.length, 1);
  assert.equal(out[0].sha, 's2');
  assert.equal(out[0].kind, 'app');
  assert.match(out[0].reason, /no pull request/);
});

test('an App commit with no associatedPullRequests field at all is flagged as app', () => {
  const out = audit({ sha: 's3', author: bot, committer: { login: APP } });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'app');
});

test('a human commit straight to main is not flagged', () => {
  assert.deepEqual(audit(commit('s4', human, [])), []);
});

test('known limit: author linked to the owner with web-flow as committer is neither app nor unknown', () => {
  assert.deepEqual(audit(commit('s4b', human, [], { login: 'web-flow' })), []);
});

test('an App commit tied to a pull request that was never merged is flagged as app', () => {
  const out = audit(commit('s5', bot, [{ number: 11, merged: false }]));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'app');
  assert.match(out[0].reason, /#11/);
  assert.match(out[0].reason, /not merged/);
});

test('only the offending commits of a mixed list are returned, in order', () => {
  const out = audit(
    commit('a', bot, [{ number: 1, merged: true, merged_by: owner }]),
    commit('b', bot, []),
    commit('c', human, []),
    commit('d', bot, [{ number: 2, merged: false }]),
  );
  assert.deepEqual(out.map((f) => f.sha), ['b', 'd']);
});

test('no linked author and a non-App committer is listed as unknown, not app', () => {
  const out = audit(commit('e', null, []));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'unknown');
  assert.match(out[0].reason, /unknown/i);
});

test('an unknown author that came through a merged pull request is not listed', () => {
  assert.deepEqual(audit(commit('e2', null, [{ number: 5, merged: true }])), []);
});

test('no linked author but the App as committer is flagged as app', () => {
  const out = audit(commit('f', null, [], { login: APP }));
  assert.equal(out.length, 1);
  assert.equal(out[0].sha, 'f');
  assert.equal(out[0].kind, 'app');
});

test('an author spoofed to the owner with the App as committer is flagged as app', () => {
  const out = audit(commit('g', human, [], { login: APP }));
  assert.equal(out.length, 1);
  assert.equal(out[0].sha, 'g');
  assert.equal(out[0].kind, 'app');
});

test('associatedPullRequests as a GraphQL connection is read through nodes', () => {
  const out = audit(
    commit('h', bot, { nodes: [{ number: 3, merged: true, mergedBy: owner }] }),
    commit('i', bot, { nodes: [{ number: 4, merged: false }] }),
  );
  assert.deepEqual(out.map((f) => f.sha), ['i']);
  assert.match(out[0].reason, /#4/);
});

test('an unreadable associatedPullRequests is a flagged reason, never a throw', () => {
  for (const bad of [{ nodes: 'x' }, 'x', 5, { edges: [] }, [5], { nodes: ['x'] }]) {
    const out = audit(commit('j', bot, bad));
    assert.equal(out.length, 1, JSON.stringify(bad));
    assert.equal(out[0].kind, 'app');
    assert.match(out[0].reason, /could not be read/);
  }
});

test('null entries in commits and in associatedPullRequests are skipped safely', () => {
  assert.deepEqual(audit(null, commit('k', bot, [null, { number: 6, merged: true, merged_by: owner }]), undefined), []);
  assert.deepEqual(audit(commit('l', bot, { nodes: [null, { number: 7, merged: true, mergedBy: owner }] })), []);
  const out = audit(commit('m', bot, [null]));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /no pull request/);
});

test('an App pull request merged by the App itself is flagged as app (Decision Q3: only the owner merges)', () => {
  for (const pr of [{ number: 20, merged: true, mergedBy: bot }, { number: 20, merged: true, merged_by: bot }]) {
    const out = audit(commit('n', bot, [pr]));
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'app');
    assert.match(out[0].reason, /#20/);
    assert.match(out[0].reason, new RegExp(APP.replace(/[[\]]/g, '\\$&')));
  }
});

test('an App pull request merged by the owner is clean, REST or GraphQL', () => {
  assert.deepEqual(audit(
    commit('o', bot, [{ number: 21, merged: true, merged_by: owner }]),
    commit('o2', bot, { nodes: [{ number: 22, merged: true, mergedBy: owner }] }),
  ), []);
});

test('an App pull request merged by another User is flagged as app', () => {
  const out = audit(commit('p', bot, [{ number: 23, merged: true, merged_by: { login: 'someone', type: 'User' } }]));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'app');
  assert.match(out[0].reason, /someone/);
});

test('a look-alike merger does not count: wrong case, or a Bot named Thitic9203', () => {
  for (const by of [{ login: 'thitic9203', type: 'User' }, { login: 'Thitic9203', type: 'Bot' }]) {
    const out = audit(commit('q', bot, [{ number: 24, merged: true, mergedBy: by }]));
    assert.equal(out.length, 1, JSON.stringify(by));
    assert.equal(out[0].kind, 'app');
  }
});

test('an App pull request merged with the merger missing is flagged as app, merger unknown', () => {
  for (const pr of [{ number: 25, merged: true }, { number: 25, merged: true, mergedBy: null }, { number: 25, merged: true, merged_by: {} }]) {
    const out = audit(commit('r', bot, [pr]));
    assert.equal(out.length, 1, JSON.stringify(pr));
    assert.equal(out[0].kind, 'app');
    assert.match(out[0].reason, /merger unknown/);
  }
});

test('one owner-merged pull request clears an App commit that also has an App-merged one', () => {
  assert.deepEqual(audit(commit('s', bot, [
    { number: 26, merged: true, mergedBy: bot },
    { number: 27, merged: true, mergedBy: owner },
  ])), []);
});

test('unknown-author commits keep the merged rule, whoever merged', () => {
  assert.deepEqual(audit(commit('t', null, [{ number: 28, merged: true, mergedBy: bot }])), []);
});
