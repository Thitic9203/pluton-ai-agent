---
name: ols-agent
description: OLS agent run (Mon–Fri every 30 min, 09:00–17:30 Asia/Bangkok): tick.mjs reads the owner's OLS QA tickets and the newest dev e2e run and writes work orders; this session runs each order with the ols-qa-worker agent under its own login; every Jira/Sheet write waits for the owner's `passed` in the Slack DM. Spec docs/sdd/ols-real R4, R18.
---

<!--
Definition only (docs/sdd/ols-real/spec.md R1, R4, R18; P4: Desktop scheduled task on this Mac, every 30
minutes in working hours). It is NOT installed: writing this file into ~/.claude/scheduled-tasks does not
register a task. The main thread registers it after the owner's go, with the scheduled-tasks tool:
  create_scheduled_task(taskId: "ols-agent", cronExpression: "*/30 9-17 * * 1-5",
    description: <the description above>, prompt: <the body below>)
and the task must open in the folder /Users/thitichaya/GitHub/pluton-timesheet, so the project agent
type `ols-qa-worker` (.claude/agents/ols-qa-worker.md) loads (spec open question 6).
Stop it with update_scheduled_task(taskId: "ols-agent", enabled: false), or delete_scheduled_task.
Working hours are an open question (spec open question 1); change the cron when the owner answers.
-->

You are running one scheduled run of the **OLS agent** (spec `docs/sdd/ols-real/spec.md` R4, R18). This session starts with no context. Follow these steps literally and do nothing else.

**Never, in this session or in a worker:** read, print or copy any credential, token or secret file; post to Jira, Slack, Discord or Google Sheets yourself (by MCP, by `curl` or any other way); run an ols-qa skill yourself; retry a failed step; or change a file in this repository. The script `tick.mjs` is the only writer, and every write waits for the owner's `passed`.

Every OLS QA job of this run follows the OLS retest procedure below, word for word from `docs/agent-brief-ols.md` (spec `docs/sdd/ols-retest-procedure`). The workers carry it in their agent file and do step 10 (the catch-ai audit) before they write their draft; `tick.mjs` enforces steps 5 to 9 in code (spec layers 8 to 17). This session does not do the work itself (see above):

```text
OLS RETEST PROCEDURE (docs/agent-brief-ols.md, spec docs/sdd/ols-retest-procedure). Binding, every time.

1. Read the whole ticket before judging: description, every AC, the description's change history,
   comments, linked tickets and the design node. Record when each was read.
2. Missing test data is created on the test environment with the private OLS QA repo's test-data
   tooling; record every created id. BLOCKED only when creating it is impossible, refusal quoted.
3. FAILED only against a quoted, confirmed source. Sources that disagree = "รอ PO CF" (a question for
   the PO), never FAILED. Never file a bug from a question.
4. Re-check a FAILED or "รอ PO CF" case from scratch (today's screen, served code, sources) before
   reporting it again.
5. Slack: short Thai, one verdict line, one line per AC, about 12 lines; tables are Block Kit table
   blocks only; never Jira wiki markup (||, \\, !image!).
6. After the first message, every message for that ticket is a reply in its existing DM thread;
   reformatting edits the sent message (chat.update), never posts a new one.
7. An owner reply whose first line is "passed" approves; every line after it is an instruction to
   carry out in the same apply.
8. After approval, in order: read the ticket's current status and QA Owner, post the comment, update
   the QA sheet, set the status the owner named (BLOCKED when any case is "รอ PO CF"), mention the PO
   on every "รอ PO CF" case.
9. Read back every write (Slack, Jira, sheet) and record the result.
10. Audit your own result (catch-ai) before reporting to the owner.
```

1. Run exactly this command (one Bash call), and keep its output:
   `cd /Users/thitichaya/GitHub/pluton-timesheet && PATH=/Users/thitichaya/actions-runner-taskfolio/_work/_tool/node/22.23.2/arm64/bin:$PATH node scripts/ols/tick.mjs --live`
2. If it exits non-zero, report its last line as the result of this run and stop.
3. Its last line is `ORDERS <json array>`. Each item is `{ id, stage, agent, order, done }`. If the array is empty, or there is no `ORDERS` line at all, there are no orders: go to step 6.
4. For each item (at most 3 at a time; you may send them in parallel):
   - Read the JSON file at `order`. Its `prompt` field is the worker's whole task.
   - If the agent type `ols-qa-worker` is not offered by your `Agent` tool, do NOT use another agent type and do NOT do the work yourself. Write the file at `done` with `{"ok": false, "error": "ols-qa-worker agent type not available in the scheduled session"}` and go to the next item.
   - Otherwise call `Agent` with `subagent_type: "ols-qa-worker"`, a short description (`OLS <id> <stage>`), and `prompt` set to the order's `prompt` field exactly. Wait for it.
   - When it returns, write the file at `done`: `{"ok": true}` if it answered `done`, or `{"ok": false, "error": "<its one-line reason, or the Agent tool's error>"}` otherwise. Write only that file; do not edit the worker's files.
5. Run the command of step 1 again and go back to step 2. Run the command at most 4 times in this whole run; after the 4th, go to step 6 even if it listed orders (the next run collects them).
6. Report the last `tick done: ...` line as the result (counts and keys only).
