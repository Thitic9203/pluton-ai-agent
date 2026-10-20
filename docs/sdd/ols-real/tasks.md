# OLS for real: tasks

Plan: `plan.md` in this folder

- [ ] **T1.** `classify.mjs`. Rules: R1, R2, R3. Test first: `classify.test.mjs`, one case per R2 row, the waiting cases, the R3 chain and the JQL text. Done when: green.
- [ ] **T2.** `gate.mjs`. Rules: R7, R8. Test first: `gate.test.mjs` (accepted and refused replies, feedback text). Done when: green.
- [ ] **T3.** `e2e.mjs`. Rules: R10. Test first: `e2e.test.mjs` on a fixture shaped like the dev `run.json`. Done when: green.
- [ ] **T4.** `runner.mjs`. Rules: R4, R5, R11, E2. Test first: `runner.test.mjs` (arguments, env without credentials, skill per duty, e2e prompt rules, missing output = failed). Done when: green.
- [ ] **T5.** `dispatch.mjs`. Rules: R6, E1 to E3. Test first: `dispatch.test.mjs` (cap 3, waiting not counted, oldest first, ticket gone, rework on feedback). Done when: green.
- [ ] **T6.** `apply.mjs`. Rules: R9, R12, E5. Test first: `apply.test.mjs` with fake Jira, sheet and gh (allow-list, once only across a crash, dry run first, merge then rerun). Done when: green.
- [ ] **T7.** `jira.mjs`, `slack.mjs`. Rules: R1, R7, R9. Test first: fake `fetch` asserts URLs, methods and that no secret reaches a log line. Done when: green.
- [ ] **T8.** `ols-board.mjs`, snapshot, config, derive. Rules: R13, R14, E4. Test first: `ols-board.test.mjs`, `agent-office-snapshot.test.mjs`, `config.test.mjs`. Done when: green with the existing agent-office tests.
- [ ] **T9.** `publish.mjs`, workflow env, R65/E4 text. Rules: R13. Test first: `publish.test.mjs` (changed only). Done when: green, workflow tests green.
- [ ] **T10.** `tick.mjs` and the scheduled task definition. Rules: all. Test: `node scripts/ols/tick.mjs` without `--live` prints a plan and sends nothing. Done when: the report carries the install command for the main thread.

## Host login runner (19 Oct 2026: R4, R5, R6, R17, R18, R19, E2 respecified)

- [x] **T11.** (`8d7cee05b`, `node --test scripts/ols/lib/*.test.mjs` 52 pass 0 fail; red first on `4bc5872d0`: 5 fail) `classify.mjs` `adfText` and `ticketContext`; `jira.mjs` `issue(key)`. Rules: R17. Test first: `classify.test.mjs` (description, a field named "Acceptance Criteria" found by `names`, comments newest 50, 20,000-character cut with a note) and `clients.test.mjs` (the issue read is GET with `expand=names`). Done when: green.
- [x] **T12.** (`8d7cee05b`, `node --test scripts/ols/lib/*.test.mjs` 52 pass 0 fail; red first on `4bc5872d0`: 5 fail) `runner.mjs` `buildOrder`, `readDone`, `collect`; remove `buildRun`, `denyList`, `stopRun`, `KEEP_ENV`. Rules: R4, R5, R6, R18, E2. Test first: `runner.test.mjs` (order shape, agent type, cwd, skill per stage, no `claude` command and no credential path in the prompt; done file ok, failed, missing within and past 2 hours). Done when: green.
- [x] **T13.** (`8d7cee05b`, `node --test scripts/ols/lib/*.test.mjs` 52 pass 0 fail; red first on `4bc5872d0`: 5 fail) `.claude/agents/ols-qa-worker.md`. Rules: R4. Test first: `worker-agent.test.mjs` (a `tools:` list exists, holds no `mcp__` and no `WebFetch`, and holds Bash, Read, Write, Edit, Glob, Grep). Done when: green and registered in the CI glob of `scripts/lib/test-reach.mjs` (already `scripts/ols/lib/*.test.mjs`).
- [x] **T14.** (`8d7cee05b`, `node --test scripts/ols/lib/*.test.mjs` 52 pass 0 fail; red first on `4bc5872d0`: 5 fail) `apply.mjs` pending rerun. Rules: R19, R12, R9. Test first: `apply.test.mjs` (merge once, pending with the PR, a second apply finishes from the rerun answer without a second merge). Done when: green.
- [x] **T15.** (`8d7cee05b`, `node --test scripts/ols/lib/*.test.mjs` 52 pass 0 fail; red first on `4bc5872d0`: 5 fail) `tick.mjs` orders, done files, context fetch before any order, `ORDERS` last line; scheduled task prompt; stray `</content>` lines gone. Rules: R4, R17, R18, R19, E1, E2. Test: `node scripts/ols/tick.mjs` (dry) prints its plan and sends nothing; `node --check scripts/ols/tick.mjs`. Done when: both run clean and the report carries the prompt for the main thread to register.
- [x] **T16.** (`4bc5872d0`) Docs: `docs/ACTION_ITEMS.md` State 17 Oct and plan row 19 say the task is not registered (evidence: `list_scheduled_tasks` 19 Oct 2026 "No scheduled tasks found"); DECISION_LOG entry; RISK_REGISTER R107. Rules: none (hard constraint 9, Evidence). Done when: committed.

## Review of `8d7cee05b` (19 Oct 2026: R5, R17, E1, E2 tightened)

- [ ] **T17.** `dispatch.mjs` `contextCandidates`; `tick.mjs` reads every candidate's context right after the search, before replies, applies and posts. Rules: R17, E1. Test first: `dispatch.test.mjs` (queued, rework, draft-sent and failed ticket jobs are candidates; running, approved, applied and e2e jobs are not). Done when: green.
- [ ] **T18.** `runner.mjs` `stageFiles`; the review prompt reads `work-draft.md` and `work-actions.json`; `tick.mjs` moves and removes per `stageFiles`. Rules: R5, E2. Test first: `runner.test.mjs`. Done when: green.
- [ ] **T19.** `jira.mjs` `comments(key)` (newest first, 50) and a 5 MB response cap; `ticketContext(issue, page)` with `total` and the 200,000-character `ticket.json` cap. Rules: R17. Test first: `clients.test.mjs`, `classify.test.mjs`. Done when: green.
- [ ] **T20.** Rerun done ok without `rerun-<pr>.json` fails at once (`runner.mjs` `rerunResult`); SKILL.md step 3 says a missing `ORDERS` line means no orders; `ols-qa-worker.md` `tools:` in the comma form (238 of 316 plugin agent files use it; both forms load). Rules: R4, R18, E2. Test first: `runner.test.mjs`, `worker-agent.test.mjs`. Done when: green.
