# Agent brief: the OLS retest procedure

Owner, 19-20 Oct 2026: "ให้ Agent จดจำสเตปการทำงานนี้ไว้", "รอบหน้าตรวจและทำแบบนี้เช่นกัน", "เสมอ".
Spec: [docs/sdd/ols-retest-procedure](sdd/ols-retest-procedure/spec.md). Every prompt for an agent that
does OLS QA work carries the clause below word for word.

## The clause

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
