# Tasks: ols-retest-procedure

- T1 (layers 1-4, 7). Spec, plan, tasks, brief, ols-real R20, memory. Done when on main and in memory.
- T2 (layer 8, R7). Test first: `verdict()` returns `passed` with `instructions` for "passed\n…". Then gate.mjs; amend ols-real R8.
- T3 (layer 9, R7 R8). Test first: an approved job with instructions puts them into its apply actions. Then dispatch.mjs.
- T4 (layers 10-12, R5 R6). Test first: post text with `||`/`\\` throws; a ticket post without thread_ts throws once a thread exists; `update()` calls chat.update. Then slack.mjs.
- T5 (layer 13, R1 R3). Test first: ticket context carries description history. Then jira.mjs/classify.mjs.
- T6 (layer 14, R2 R3). Test first: a FAILED case without a source and a BLOCKED case without a refusal are refused. New draft-check.mjs.
- T7 (layers 15-17, R8 R9). Test first: apply runs status → comment → sheet → transition → mention; any "po-question" forces BLOCKED and a PO mention; each step records a read-back. Then apply.mjs.
- T8 (layers 5, 6, 20). The clause word for word in the worker prompt and the scheduled task prompt.
- T9 (layer 19). Test first: docs-check fails when the clause is missing from a prompt file. Then docs-check.
- T10. Independent review, then the next round carries the branch.
