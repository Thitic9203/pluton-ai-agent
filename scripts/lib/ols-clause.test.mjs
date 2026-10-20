// Layer 19. Spec: docs/sdd/ols-retest-procedure/spec.md (layers 5, 6, 7, 19, 20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRIEF, PROMPT_FILES, clauseOf, olsClauseProblems } from './ols-clause.mjs';

const CLAUSE = 'OLS RETEST PROCEDURE (x). Binding, every time.\n\n1. Read the whole ticket.\n10. Audit your own result (catch-ai) before reporting to the owner.';
const brief = `# Agent brief\n\n## The clause\n\n\`\`\`text\n${CLAUSE}\n\`\`\`\n`;

test('the clause is the fenced text block under "The clause" in the brief', () => {
  assert.equal(clauseOf(brief), CLAUSE);
  assert.equal(clauseOf('# no clause here'), null);
});

test('layer 19: every prompt file must carry the clause word for word', () => {
  const ok = `intro\n\n\`\`\`text\n${CLAUSE}\n\`\`\`\n`;
  assert.deepEqual(olsClauseProblems({ brief, files: { 'a.md': ok, 'b.md': ok } }), []);
  assert.deepEqual(olsClauseProblems({ brief, files: { 'a.md': ok, 'b.md': 'no clause' } }), [
    'b.md: the OLS retest procedure clause of docs/agent-brief-ols.md is missing or not word for word (spec docs/sdd/ols-retest-procedure, layer 19)',
  ]);
  // one changed word is a miss
  assert.equal(olsClauseProblems({ brief, files: { 'a.md': ok.replace('whole', 'full') } }).length, 1);
  assert.deepEqual(olsClauseProblems({ brief, files: { 'a.md': null } }), ['a.md: missing (spec docs/sdd/ols-retest-procedure, layer 19)']);
});

test('layers 7, 20: the brief must hold the clause, and the clause the catch-ai audit step', () => {
  assert.deepEqual(olsClauseProblems({ brief: '# empty', files: {} }), [`${BRIEF}: the fenced clause under "The clause" is missing (layer 7)`]);
  assert.deepEqual(olsClauseProblems({ brief: brief.replace('(catch-ai)', ''), files: {} }), [`${BRIEF}: the clause no longer names the catch-ai audit before a report (layer 20)`]);
});

test('layer 19: docs-check reads the brief and every prompt file through olsClauseProblems', () => {
  const src = readFileSync(fileURLToPath(new URL('../docs-check.mjs', import.meta.url)), 'utf8');
  assert.match(src, /import \{ olsClauseProblems, BRIEF as OLS_BRIEF, PROMPT_FILES as OLS_PROMPTS \} from '\.\/lib\/ols-clause\.mjs';/);
  assert.match(src, /problems\.push\(\.\.\.olsClauseProblems\(/);
});

test('the prompt files are the worker agent and the scheduled task, and both carry the clause today', () => {
  assert.deepEqual(PROMPT_FILES, ['.claude/agents/ols-qa-worker.md', 'scripts/ols/scheduled-task/ols-agent/SKILL.md']);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const read = (p) => readFileSync(root + p, 'utf8');
  assert.deepEqual(olsClauseProblems({ brief: read(BRIEF), files: Object.fromEntries(PROMPT_FILES.map((p) => [p, read(p)])) }), []);
});
