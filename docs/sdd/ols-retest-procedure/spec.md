# Spec: the OLS retest procedure, and twenty layers that keep it

Status: confirmed by the owner's words below; every OLS QA job (lane, scheduled agent or main session) follows it.

Sources (owner, Slack DM thread `1792402913.821689` and chat, 19-20 Oct 2026):
- S1 "ไม่มีข้อมูลก็ไปเอาข้อมูลจาก private repo สร้างมา"
- S2 "ตรวจสอบโดยละเอียด อ่านทิคเกตให้ละเอียด ไม่ด่วนสรุปว่า blocked failed"
- S3 "ส่วนการสรุปผลในข้อความ Slack จัดฟอแมตมาให้อ่านง่ายด้วย ตอนนี้ยาวมาก ปวดตา"
- S4 "ตารางอ่านไม่รู้เรื่อง ทำมาดีดี", "Slack ก็ทำตารางได้ จัดการมา"
- S5 "แก้ข้อความเดิมได้เลยไม่ต้องส่งใหม่"
- S6 "ผิดนะ ส่งในเธรดเดิมไม่ใช่ส่งข้อความใหม่"
- S7 "passed … ตรวจสอบว่าทิคเกตอยู่สถานะไรในตอนนี้ แล้วอัปเดตผลการทดสอบในชีท qa มาให้เรียบร้อย ส่วนสถานะทิคเกต ไป blocked และเมนชั่น pakamon PO ในส่วนของเคสที่ รอ PO CF"
- S8 "ตรวจสอบเคสที่ไม่ผ่านมาอีกทีโดยละเอียด แล้วส่งโนติมาใหม่ ใน Slack"
- S9 "จบงานนี้ได้ และให้ Agent จดจำสเตปการทำงานนี้ไว้", "รอบหน้าตรวจและทำแบบนี้เช่นกัน", "เสมอ", "สร้างแนวป้องกัน 20 ชั้นไม่ให้พลาด"
- Global rule 10: a defect needs a confirmed expected side; unclear spec = question, never a bug.

Scope: every retest, test, review-tc and e2e duty of the OLS agent and of any session that does OLS QA work.
Out of scope: Taskfolio work.

## Rules

- **R1.** Before judging any case, the job must read the ticket in full: description, every AC, the
  description's change history (changelog), comments, linked tickets and the design node it names.
  Source S2. Done when: the job record lists each of these with the time it was read.
- **R2.** When test data a case needs does not exist, the job must create it on the test environment
  with the private OLS QA repo's test-data tooling, record every created id, and run the case. A case
  is BLOCKED only when creating the data is impossible, with the exact refusal quoted. Source S1.
  Done when: no BLOCKED row lacks a quoted refusal, and every created id is in `created.json`.
- **R3.** A case is FAILED only when the actual differs from an expected that is quoted from a confirmed
  source. When sources disagree (ticket now, ticket history, design, code), the case is a question for
  the PO ("รอ PO CF"), never FAILED. Source S2, global rule 10. Done when: every FAILED row quotes its
  source and no FAILED row has a conflicting source in the record.
- **R4.** A FAILED or "รอ PO CF" case must be re-checked from scratch before it is reported again:
  today's screen, the code the environment serves and the sources. Source S8.
  Done when: the record of a re-check has a same-day capture.
- **R5.** The Slack summary must be short Thai: one verdict line, then one line per AC, at most about
  12 lines; any table must be a Slack Block Kit table block, never Jira wiki markup (`||`, `\\`,
  `!image!`). Source S3, S4. Done when: a read-back of the thread finds no `||` or `\\`.
- **R6.** Every message about a ticket after the first must be a reply in that ticket's existing DM
  thread; reformatting a message already sent edits it (`chat.update`), never posts a new one.
  Source S5, S6. Done when: every message of the job except the first has the thread's `thread_ts`.
- **R7.** An owner reply whose first line is `passed` approves the draft, and the lines after it are
  instructions that must be carried out in the same apply. Source S7. Done when: an approval with
  instructions yields an apply whose actions include each instruction.
- **R8.** After approval the job must, in order: read the ticket's current status and QA Owner, post
  the comment, update the QA sheet results, set the status the owner named (BLOCKED when any case is
  "รอ PO CF"), and mention the PO on every "รอ PO CF" case. Source S7. Done when: the apply log shows
  the five steps in that order.
- **R9.** After every write (Slack, Jira, sheet) the job must read it back and record the result.
  Source S5, S6, global rule 17. Done when: each write has a read-back line.
- **R10.** Before reporting to the owner, the job must audit its own result (catch-ai). Source S9,
  global rule 17. Done when: the record has the audit's verdict.

## The twenty layers (Source S9: "สร้างแนวป้องกัน 20 ชั้นไม่ให้พลาด")

| # | Layer | Where | Rules |
|---|---|---|---|
| 1 | This spec | `docs/sdd/ols-retest-procedure/spec.md` | all |
| 2 | Pointer from the OLS agent spec | `docs/sdd/ols-real/spec.md` R20 | all |
| 3 | Project memory | `memory/ols-retest-procedure.md` | all |
| 4 | Memory index line | `memory/MEMORY.md` | all |
| 5 | Procedure clause, word for word, in the worker agent | `.claude/agents/ols-qa-worker.md` | all |
| 6 | Same clause in the scheduled task prompt | `scripts/ols/scheduled-task/ols-agent/SKILL.md` | all |
| 7 | Clause file every OLS prompt carries | `docs/agent-brief-ols.md` | all |
| 8 | `gate.mjs` approves `passed` + instructions | `scripts/ols/lib/gate.mjs` + test | R7 |
| 9 | Instructions forwarded into the apply | `scripts/ols/lib/dispatch.mjs` + test | R7, R8 |
| 10 | Slack text guard refuses `||`, `\\`, `!x!` | `scripts/ols/lib/slack.mjs` + test | R5 |
| 11 | Slack thread guard: a ticket post without `thread_ts` refused once a thread exists | `scripts/ols/lib/slack.mjs` + test | R6 |
| 12 | Edit-not-repost helper (`update`) | `scripts/ols/lib/slack.mjs` + test | R6 |
| 13 | Ticket context carries the changelog | `scripts/ols/lib/classify.mjs`, `jira.mjs` + test | R1, R3 |
| 14 | Draft check: FAILED needs a quoted source, BLOCKED needs a quoted refusal | `scripts/ols/lib/draft-check.mjs` + test | R2, R3 |
| 15 | Apply order check (status → comment → sheet → transition → mention) | `scripts/ols/lib/apply.mjs` + test | R8 |
| 16 | "รอ PO CF" forces BLOCKED and a PO mention in the actions | `scripts/ols/lib/apply.mjs` + test | R8 |
| 17 | Read-back after every write recorded in the job | `scripts/ols/lib/apply.mjs`, `slack.mjs` + test | R9 |
| 18 | The board shows owner instructions after `passed` | board generator (`gen.mjs`) | R7 |
| 19 | `docs-check` asserts the clause stays in layers 5, 6 and 7 | `scripts/docs-check.mjs` + test | all |
| 20 | catch-ai audit step before any report | clause (layer 7) and the worker prompt | R10 |

## Done when

- Layers 1 to 4, 7 and 18 are on main or in memory with this spec.
- Layers 5, 6 and 8 to 17, 19 and 20 are implemented test first on a branch, reviewed by an agent that
  did not write them, and carried by the next round to main.

## Open questions

- Q1. The OLS QA skills live in the private repo `ols-qa`; whether to mirror the clause into its
  retest skill too (another repository) is the owner's call.
