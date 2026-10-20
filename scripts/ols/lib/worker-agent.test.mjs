// T13. Spec: docs/sdd/ols-real/spec.md R4: the worker agent type lists its tools, with no MCP tool and no WebFetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGENT } from './runner.mjs';

const file = fileURLToPath(new URL(`../../../.claude/agents/${AGENT}.md`, import.meta.url));

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'the agent file starts with a frontmatter block');
  return Object.fromEntries(m[1].split('\n').filter((l) => /^[a-z]+:/.test(l)).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
}

test('R4: ols-qa-worker names itself and lists only its own tools: no MCP tool, no WebFetch, no Agent', () => {
  const fm = frontmatter(readFileSync(file, 'utf8'));
  assert.equal(fm.name, AGENT);
  assert.ok(fm.tools, 'a tools list exists (no list would grant every tool, MCP included)');
  // review of 8d7cee05b: the comma form, as 238 of 316 plugin agent files on this Mac write it
  assert.match(fm.tools, /^[A-Za-z]+(, [A-Za-z]+)*$/);
  const tools = fm.tools.split(',').map((t) => t.trim()).filter(Boolean);
  assert.deepEqual([...tools].sort(), ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write']);
  for (const t of tools) assert.ok(!/^mcp__|WebFetch|WebSearch|Agent/.test(t), t);
});

test('R4: the worker body forbids writing to Jira, Slack and sheets and reading credentials', () => {
  const body = readFileSync(file, 'utf8');
  for (const s of ['draft.md', 'actions.json', 'Jira', 'Slack', 'Google Sheet', 'token']) assert.ok(body.includes(s), s);
});
