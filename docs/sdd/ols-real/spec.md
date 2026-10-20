# OLS for real: spec

Status: draft (R4 to R6, E2 respecified and R17 to R19 added 19 Oct 2026: the duty runs under the host login) · Owner sources: 17 Oct 2026 "ไปดูให้ละเอียดใน mock แท็ป project บอกไว้หมดแล้วว่า agent
ทำงานไรบ้าง" and popup "สร้าง snapshot บน Mac แล้วส่งขึ้น"; the closed tickets P1 to P10 of
[multi-project-intake](../../wayfinder/multi-project-intake/MAP.md) (14 to 15 Oct 2026).

## Scope: what the mock's Projects tab says the agents do for OLS

Mock: https://claude.ai/artifact/Wp7pFHwNt9jDjkPZPctVjG (read 17 Oct 2026, version 1792144139-7205,
line numbers of that saved HTML).

| # | Duty in the mock | Mock line | Role (mock line) | Skill (source) |
|---|---|---|---|---|
| M1 | Tickets where Thitichaya is QA Owner, chip "งาน QA" | 422, 423 | QA Lead and QA (632) | intake rule P1, P3 |
| M2 | เขียนเทสเคส (write test cases) | 423, 633 | QA | `tc-fe-prep-workflow` or `tc-api-prep-workflow` (P2, P6, P10) |
| M3 | รีวิวเทสเคส (review test cases) | 423, 634 | QA Lead | `tc-review-workflow` (P3) |
| M4 | ทดสอบ (test the ticket), then review the result | 423, 634 | QA, then QA Lead | `testing-ticket-workflow`, `review-result-workflow` (P2, P6; MAP owner order "รีวิวผลการเทส") |
| M5 | รีเทสบัค (retest a bug) | 423, 633 | QA | `retest-bug-workflow` (P3, MAP Notes) |
| M6 | Automate testing in `ols-qa-e2e`, chip "Automate testing": find cases not passed on dev, fix, review, open a PR | 422, 423 | QA fixes, QA Lead reviews and merges | `playwright-best-practices`, `flaky-test-doctor`, `code-review` (P8) |
| M7 | Every OLS card carries the `OLS` chip and the key `OLS-<n>` | 71, 672, 7153 | | P5 |
| M8 | OLS cards sit in the QA column, lane `test-planning` | 633, 7115 | | mock |
| M9 | The Projects card counts "งานบนบอร์ดตอนนี้ N ใบ" for OLS | 424, 7175 | | mock |
| M10 | OLS earns into the same team fund | money section | | P6 |

## Rules

### Intake

- **R1.** Every 30 minutes in working hours, the intake must read OLS tickets with the JQL
  `project = OLS AND cf[12120] = currentUser() AND statusCategory != Done`, read only, with the Jira
  credential that already lives on this Mac. Source: P1 (`customfield_12120`, READY TO TEST is in the
  To Do category), P3 ("QA Owner อย่างเดียว"), P4 (Desktop scheduled task, "ทุก 30 นาที ช่วงเวลาทำงาน").
- **R2.** The intake must give each ticket at most one duty, by these rules only. "Has test cases"
  means TC Status (`customfield_12128`) is `DONE` or `QA REVIEWED`. "In test" means status
  `READY TO TEST` or `TESTING`. Source: MAP Notes (owner, 14 Oct 2026), P3.
  - Story, no test cases: `write-tc` (M2), whatever its status.
  - Story, TC Status `DONE`: `review-tc` (M3).
  - Story in test, TC Status `QA REVIEWED`: `test` (M4).
  - Bug or Task in test: `retest` (M5).
  - Anything else (Subtask, a Story with reviewed cases not yet in test, a Bug or Task not yet in
    test): no duty; the ticket waits and is still shown on the board.
- **R3.** A Story in test with no test cases must flow `write-tc`, then `review-tc`, then `test`, one
  duty per tick, because each approved write moves its TC Status. Source: MAP Notes ("เขียนเทสเคส ...
  แล้วเริ่มเทสด้วยสกิล testing-ticket").

### Work

- **R4.** (Respecified 19 Oct 2026.) When a duty starts, the tick must not spawn any `claude`
  process. It must write a work order for the job (`order.json` in the job folder: the job id, the
  stage, the working folder `~/GitHub/ols-qa` or `~/GitHub/ols-qa-e2e`, and the prompt naming the
  ols-qa skill), mark the job running, and list the order on its last output line. The Desktop
  scheduled task's own session then runs each listed order with one `Agent` call of the agent type
  `ols-qa-worker`, under the host's login; the worker reads the ticket JSON the intake saved, does the
  work in draft mode, and writes `draft.md` (the text for the owner) and `actions.json` (the writes it
  proposes) into the job folder. The `ols-qa-worker` definition lists its tools, and that list must
  hold no MCP tool and no `WebFetch`. Neither the session nor the worker may read the Jira
  credential, the Slack token or a Sheets token; only `tick.mjs` reads them. When the
  `ols-qa-worker` type is not available in the session, the session must not fall back to another
  agent type or do the duty itself: it records the order as not run, and the job fails (E2).
  Source: P2 (skills), P6 ("สกิลในเรโป ols-qa เสมอ"), MAP Notes ("ร่างก่อน เจ้าของ อนุมัติ"); owner
  goal 19 Oct 2026, the OLS agent works end to end; main thread finding 19 Oct 2026: a headless
  `claude -p` on this Mac prints "Not logged in · Please run /login" with a clean environment and
  "Your organization has disabled Claude subscription access for Claude Code" with the host's, so
  every duty ended `failed`; global rule 3 (an Anthropic API key costs money and is not approved).
- **R5.** For `test`, a second run with `review-result-workflow` (the QA Lead) must review
  the first run's result before the draft goes to the owner; for `write-tc` the QA Lead's
  `review-tc` is the next duty (R3). The second run is a second order, run by a separate
  `ols-qa-worker` call, never by the worker that did the work. (Review of 19 Oct 2026.) Before the
  review order is written, the work stage's `draft.md` and `actions.json` must be kept as
  `work-draft.md` and `work-actions.json`, which the review reads, and the review must write its own
  `draft.md` and `actions.json`; every order must first remove the files it is to write, so a worker
  that writes nothing can never pass with an earlier stage's output (E2). Source: P3 ("QA Lead agent
  ... แล้วส่ง DM ให้เรา passed"), M4; review of `8d7cee05b` (19 Oct 2026).
- **R6.** No more than 3 OLS jobs may be running (an order out and not yet collected) at once; a job
  waiting for the owner's answer does not hold a slot. Tickets past the cap wait, oldest first.
  Source: P6 ("แยกต่อโปรเจกต์", Taskfolio 3 and OLS 3); the Taskfolio dispatcher counts only work in
  progress (Plan A Decisions Q2, `scripts/agent/dispatch.mjs`).
- **R17.** (Added 19 Oct 2026.) When the tick writes a ticket job's `ticket.json`, it must carry,
  beside the intake fields, the ticket's description, every field whose Jira name contains
  "acceptance criteria" or "edge case" (found through the issue's `names`, never a guessed field
  id), and its comments (author, created, text), each turned from Jira's document format into plain
  text, read with GET only by the tick that holds the credential. Each text is cut at 20,000
  characters; the comments are the newest 50, read from the comment endpoint ordered newest first
  (`/rest/api/3/issue/{key}/comment?orderBy=-created&maxResults=50`, never the issue's own comment
  field, which may hold one page from the oldest), written oldest first, with a note when its
  `total` is larger; the whole `ticket.json` stays under 200,000 characters by dropping the oldest
  comments first, and no Jira response over 5 MB is read. Every note says what was cut. The
  context of every job that could be ordered in the tick (queued, rework, draft sent or failed) is
  read right after the intake search, before any reply is read, any write applied or any message
  posted; when that read fails, the tick changes nothing (E1). Source: review of `8d7cee05b`
  (19 Oct 2026) for the order, the comment endpoint and the size caps; main thread finding 19 Oct 2026: `ticket.json`
  held only key, summary, type, status, TC Status and created (`classify.mjs:5`, `tick.mjs:168`)
  while the run may not reach Jira (`runner.mjs:76-81`), so no skill could read the acceptance
  criteria; tc-fe-prep-workflow builds its cases from the story's AC and EC.
- **R18.** (Added 19 Oct 2026.) One scheduled run must: run `node scripts/ols/tick.mjs --live`; run
  every order it lists (at most 3 `ols-qa-worker` calls at once, R6); after each worker returns,
  write the stage's done file (`<stage>.done.json`: `{ ok, error? }`) in that job folder; then run
  the tick again, and repeat while the tick lists orders, at most 4 ticks in one run. The tick
  collects a job only from its done file. The session must not post to Jira, Slack or a sheet
  itself, by MCP or otherwise. Source: R4; R7 (the tick is the only writer); spec open question 3
  (a `passed` waits for the next tick).
- **R19.** (Added 19 Oct 2026.) The e2e rerun of R12 must also be an order: after the merge is
  recorded, the apply step writes a `rerun` order for that pull request and leaves the job approved;
  the worker writes `rerun-<pr>.json`, and the next tick reads it and finishes the apply. The merge
  is never repeated. Source: R4, R9, R12.

### The owner's gate

- **R7.** Every write to Jira (comment, transition, field), to the QA sheet (`sheet_write.py
  --create-tab`) and every e2e merge must first go to the owner's Slack DM as a draft, through the AI
  Agent Bot (channel `D0ASX9ML4G6`), and must be applied only after the owner (`U06QB9UVAG4`) replies
  `passed` in that draft's thread. Source: MAP Notes (owner, 14 Oct 2026: "ส่งมาใน DM Slack เรา",
  "ถ้าเรา reply ว่า passed ก็ค่อยไปจัดการต่อได้"), P4 (bot, channel, scopes).
- **R8.** `passed` counts only when it is the whole reply after trimming and lower-casing (a trailing
  `.` or `!` allowed), it is written by the owner, and it is later than the draft. Any other owner
  reply in the thread returns the job to rework: the next run carries that reply as feedback, and the
  new draft goes to the same thread. Source: P4 ("เราจะตอบอะไรที่ไม่ใช่คำที่กำหนด คุณต้องโต้ตอบให้
  ถูกต้องด้วย"); the agent-dm-worker keeps answering the conversation within 30 seconds (unchanged).
- **R9.** An approved job's writes must be applied once each, in order, recording each applied
  action before the next, so a crash never posts twice; the result goes to the same thread. A sheet
  tab is written with `--dry-run` first and then for real. Source: P10 (step 6.5, `--dry-run` first);
  hard constraint 6 (fix causes, no repeats).

### e2e fix loop

- **R10.** Each tick must read the newest dev run (`~/ols-qa-testing-bot/out/dev-smoke-*/run.json`,
  newest by folder name) and make one job per case whose result is `unexpected`, using its first
  error. Source: P7.
- **R11.** An e2e job must triage first (test bug, app bug, flaky); fix only a test bug or a flaky
  cause, in a separate worktree of `ols-qa-e2e` on `origin/main`, on branch `agent/e2e-<case>`; prove
  it with repeated runs of the case and a full dev suite compared with the run before the fix; get a
  separate QA Lead review (`code-review`); then open the PR and send the DM draft. An app bug is not
  fixed: its draft says so and proposes nothing. Never `test.skip`, `test.fixme`, added retries or a
  raised timeout. Source: P7, P8, MAP Notes (owner, 14 Oct 2026); ols-qa-e2e rules.
- **R12.** After `passed` on an e2e draft, the QA Lead must merge the PR, rerun the case and the full
  dev suite from merged `main` in a fresh worktree, and post the result in the same thread; a failure
  returns the job to triage. Source: P8 ("passed แล้ว QA Lead merge และรันซ้ำบน dev").

### The board

- **R13.** After each tick, the Mac must build the OLS part of the board (key, summary, duty, phase)
  and, only when it differs from the last one sent, store it in the repository variable `OLS_BOARD`
  and start `deploy-agent-office.yml` with `target=refresh`. The Jira credential never leaves the
  Mac. Source: owner popup 17 Oct 2026 "สร้าง snapshot บน Mac แล้วส่งขึ้น"; Q21 (deployment count on
  the free plan) for "only when it differs".
- **R14.** Every OLS card must use the key `OLS-<n>`, the `OLS` project, the lane `test-planning`
  (or `blocked` from `test-planning` when its job failed), and a title of the duty in Thai followed
  by the ticket summary (at most 80 characters), as the mock's cards do. Source: M7, M8 (mock lines
  633 to 634, 672, 7115).
- **R15.** OLS earnings go into the one team fund and the one account (no OLS ledger). Source: P6.
  The earning rule for an OLS ticket is not yet specified (open question 2).
- **R16.** The tests in `scripts/ols/lib/` that "Done when" names as evidence must run in main CI (a
  step of the `config` job registered in `scripts/lib/test-reach.mjs`), and every direct
  `child_process` call in `scripts/ols/` sets `maxBuffer` (`scripts/lib/run-command.test.mjs`).
  Source: main CI run 38948608840 (17 Oct 2026), `not ok` "every test file of this repository is
  reached by a CI runner" and "every direct child_process call in scripts/ sets maxBuffer";
  CLAUDE.md hard constraint 12. Done when: both tests pass and the config job runs the 45 OLS tests (52 since 19 Oct 2026, `8d7cee05b`).
- **R20.** Every duty must follow the OLS retest procedure in
  [docs/sdd/ols-retest-procedure](../ols-retest-procedure/spec.md) and carry the clause in
  `docs/agent-brief-ols.md` word for word. Source: owner 20 Oct 2026, "ให้ Agent จดจำสเตปการทำงานนี้ไว้",
  "รอบหน้าตรวจและทำแบบนี้เช่นกัน", "เสมอ". Done when: the worker prompt and the scheduled task prompt
  carry the clause and `docs-check` asserts it.

## Edge cases

- **E1.** When Jira or Slack fails, the tick must change no job and send nothing, log the failure
  without any secret, and exit non-zero. Source: global rule 7; agent-office-live E1 (same shape).
- **E2.** When a worker's done file says it failed or was not run, when it wrote no `draft.md` and
  `actions.json`, or when an order has no done file 2 hours after it was written, the job must
  become `failed` (shown as blocked on the board) with that reason; it is not retried until the
  owner replies in a thread or the ticket changes. A rerun order with no `rerun-<pr>.json` after 2
  hours fails the apply the same way, and so does, at once, a rerun whose done file says it failed,
  or says ok while `rerun-<pr>.json` is missing. Source: global rule 21 (no blind retry); R4, R18,
  R19; review of `8d7cee05b` (19 Oct 2026).
- **E3.** When a ticket leaves the intake (Done, or the owner is no longer QA Owner), its job must
  stop being dispatched and drop off the board; a draft already sent is not applied. Source: R1.
- **E4.** When `OLS_BOARD` is missing or does not validate, the snapshot must carry no OLS cards and
  the OLS count must show the no-source text, never 0. Source: agent-office-live R0, E4.
- **E5.** When `actions.json` proposes a write the duty does not allow (allow-list per duty in
  plan.md), the job must fail and nothing is applied. Source: R7; global rule 23.

## Done when

- [ ] R1: `classify.test.mjs` and `jira.test.mjs` show the JQL sent and only GET requests in intake.
- [ ] R2, R3: `classify.test.mjs` covers each row of R2, the waiting cases and the R3 chain.
- [ ] R4, R5: `runner.test.mjs` shows the order: the agent type `ols-qa-worker`, cwd ols-qa (ols-qa-e2e for e2e), the skill per duty and stage, no credential path in the prompt, and that no `claude` command is built; `worker-agent.test.mjs` shows `.claude/agents/ols-qa-worker.md` lists its tools with no `mcp__` tool and no `WebFetch`.
- [ ] R17: `classify.test.mjs` turns an issue with description, an "Acceptance Criteria" field found by `names`, and a newest-first comment page into plain text with the caps and the 200,000-character total; `clients.test.mjs` shows the issue and comment reads are GETs (`expand=names`; `orderBy=-created&maxResults=50`) and a response over 5 MB is refused; `dispatch.test.mjs` `contextCandidates` names every job that could be ordered in the tick.
- [ ] R5, E2: `runner.test.mjs` `stageFiles` keeps the work output as `work-*` and removes every file the order writes; the review prompt reads `work-draft.md`.
- [ ] R18: the scheduled task prompt (`scripts/ols/scheduled-task/ols-agent/SKILL.md`) names the loop, the done file, the 4-tick limit, the `ols-qa-worker` type and the no-fallback rule; `runner.test.mjs` shows `readDone` and `collect` mark a job failed on a missing, failed or stale done file.
- [ ] R19: `apply.test.mjs` shows an e2e apply merges once, returns pending with a rerun order, and finishes from `rerun-<pr>.json` without merging again.
- [ ] R6: `dispatch.test.mjs` starts at most 3 running jobs, oldest first, and ignores waiting jobs in the count.
- [ ] R7, R8: `gate.test.mjs` accepts `passed`, `Passed.`, and refuses `passed?`, `not passed`, a bot reply and an older reply; feedback returns the job to rework.
- [ ] R9: `apply.test.mjs` applies each action once across a simulated crash and runs the sheet dry run first.
- [ ] R10: `e2e.test.mjs` reads the newest run and lists the unexpected cases with their first error.
- [ ] R11, R12: `runner.test.mjs` shows the e2e prompt forbids skip/fixme/retries and names the branch; `apply.test.mjs` merges then reruns.
- [ ] R13: `publish.test.mjs` sets the variable and starts the refresh only when the board changed.
- [ ] R14, E4: `agent-office-snapshot.test.mjs` places valid OLS cards in `test-planning` and drops an invalid `OLS_BOARD`.
- [ ] E1, E2, E3, E5: covered in `dispatch.test.mjs` and `apply.test.mjs`.

## Open questions (for the owner; not guessed)

1. "ช่วงเวลาทำงาน" (P4) has no hours. The task definition uses Monday to Friday 09:00 to 18:00
   Asia/Bangkok until the owner says otherwise.
2. How much an OLS ticket earns for the fund (P6 says it earns; no size rule exists for Jira).
3. A `passed` is applied at the next tick (up to 30 minutes later). Faster application needs a
   second, shorter schedule.
4. The board shows every OLS card in `test-planning` as the mock does, so the page shows the QA
   Lead waiting on each. Showing QA versus QA Lead and running versus waiting needs a mock change
   first (hard constraint 7).
5. An app bug found by the e2e loop: whether the agent should also draft a Jira bug (`create-bug`).
6. (19 Oct 2026.) The `ols-qa-worker` type lives in this repository's `.claude/agents/`, so the
   scheduled task must open in `/Users/thitichaya/GitHub/pluton-timesheet`. Whether a Desktop
   scheduled task session loads project agent types, and has the `Agent` tool, is not yet proven
   on a real run; R4 fails closed when it does not.
7. (19 Oct 2026.) The worker keeps Bash, which the duties need (Playwright, the sheet draft), so
   "may not read the Jira credential" is held by the prompt and the tool list, not by a sandbox;
   the old `claude -p` runner's sandbox HOME and Bash deny list have no equivalent for an `Agent`
   call. RISK_REGISTER R107. The worker's tool list also leaves out the Figma MCP that
   testing-ticket, retest-bug, tc-fe-prep and tc-review name; a duty that needs the design writes
   that in its draft (as the old runner had to, with `mcp__*` denied).
8. (19 Oct 2026, review of `8d7cee05b`, left out of that round.) Whether to add permission-layer
   denies for the worker's Bash (token paths, `curl`, sheet writes, `gh pr merge`), for example in a
   settings file the scheduled session loads, to narrow R107.
9. (19 Oct 2026, second review of `5db18feb7`; reviews stop at two passes, CLAUDE.md constraint 23.)
   R17's 5 MB cap is checked on `content-length` and after `res.text()`, so a body without that
   header is read in full and `text.length` counts UTF-16 units, not bytes
   (`scripts/ols/lib/jira.mjs:42-43`). A streamed byte counter would make it a true read cap.
10. (Same review.) The E1 prefetch uses `Promise.all`, so one ticket whose GET keeps failing stops
   every tick before any owner approval is applied (`scripts/ols/tick.mjs:126`). E1 as written asks
   for this; whether one bad ticket should hold the others is the owner's call.
11. (Same review, pre-existing.) A ticket job that goes to rework keeps its `applied` ids, so a
   revised action at the same index is skipped on the next `passed` (`scripts/ols/lib/dispatch.mjs:58`,
   `:77`); e2e jobs already reset it at `:76`.
