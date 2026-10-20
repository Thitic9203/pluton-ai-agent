# Tasks: repo split

| # | Task | Rules | Failing-first test | Done when |
| :---: | :--- | :--- | :--- | :--- |
| T1 | Flat copy of R1 and R2 paths and their imported helpers | R1, R2, R3 | `node --test` in the new repo fails on a missing import before helpers are copied | all moved tests pass in the new repo; commit names `0706c9dfa` |
| T2 | Rewrite back-links in moved docs to absolute URLs | R2 | a link check over moved docs fails on a relative link into pluton-timesheet | no relative link points outside the new repo |
| T3 | Workflows read and write pluton-timesheet with an App token and `repository_dispatch` triggers | R5, R6 | a workflow test asserts every product checkout names `repository: Thitic9203/pluton-timesheet` and every token step names `owner` and `repositories` | test passes |
| T4 | New repo CI | R9 | n/a (first CI run) | CI green on main |
| T5 | OLS branch moved as a branch | R12 | n/a | branch exists, not on main |
| T6 | owner-setup.md and variable copy | R11, R10 | n/a | file lists every secret; variables except the flags set |
| T7 | Prove triage and sweep dry run from the new repo | R10 | n/a | both runs success as `taskfolio-dev-agent[bot]` |
| T8 | pluton-timesheet: relay, removal, stubs, R8 test values, flag flip (one round) | R4, R7, R8, R10 | a relay test asserts payload keys ≤ 10 and only identifiers | round CI green; no agent workflow left in pluton-timesheet but the relay |
