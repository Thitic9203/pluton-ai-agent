# Plan: ols-retest-procedure

## Files

- Docs and memory (layers 1 to 4, 7): this folder, `docs/sdd/ols-real/spec.md` R20, `docs/agent-brief-ols.md`,
  project memory `ols-retest-procedure.md` and its MEMORY.md line. Documentation, straight to main.
- Prompts (layers 5, 6, 20): `.claude/agents/ols-qa-worker.md`, `scripts/ols/scheduled-task/ols-agent/SKILL.md`
  get the clause word for word.
- Code, test first (layers 8 to 17): `scripts/ols/lib/gate.mjs` (approval with instructions),
  `dispatch.mjs` (instructions into the apply), `slack.mjs` (markup guard, thread guard, `update`),
  `classify.mjs` and `jira.mjs` (changelog in the ticket context), new `draft-check.mjs` (FAILED needs a
  quoted source, BLOCKED a quoted refusal), `apply.mjs` (order, BLOCKED + PO mention on "รอ PO CF",
  read-back record). Tests beside each file in `scripts/ols/lib/`.
- Guard (layer 19): `scripts/docs-check.mjs` asserts the clause is present in the three prompt files.
- Board (layer 18): the session board generator already shows the owner's instructions after `passed`.

## Data shapes

- Verdict: `{ kind: 'passed', ts, instructions: string[] }` when line 1 is `passed`.
- Draft case: `{ ac, status: 'passed'|'failed'|'blocked'|'po-question', source?: string, refusal?: string }`.
- Apply record: ordered `[{ step, ok, readBack }]`.

## Alternatives weighed

- Keep the procedure only in memory: a scheduled run and a lane do not read memory, so it would not hold.
- Put it only in the ols-qa skill (other repository): open question Q1, the owner decides.

## What could break

- `gate.mjs` R8 of ols-real (exact `passed`) changes meaning: spec R7 here supersedes it; ols-real R8 is
  amended in the same commit as the code.
- Lanes B and C code is on branches; this work lands in the same next round (constraint 25).

Cost: none.
