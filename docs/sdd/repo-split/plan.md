# Plan: repo split (spec R1 to R13)

## Phase A, pluton-ai-agent only (no pluton-timesheet round)

1. Flat copy from pluton-timesheet `0706c9dfa` (R1, R2, R3): the paths of R1 and R2, plus the shared helpers the
   moved code imports (found by following `import` lines from the moved files; any helper also used by
   pluton-timesheet is copied, not moved). `package.json` with only the dependencies the moved code needs (free, R13).
2. Rewrite links inside moved docs that point into pluton-timesheet to
   `https://github.com/Thitic9203/pluton-timesheet/blob/main/<path>` (R2).
3. Workflows (R5, R6): every `actions/checkout` of product code gains `repository: Thitic9203/pluton-timesheet` and the
   App token; every `create-github-app-token` step gains `owner: Thitic9203` and `repositories: pluton-timesheet`
   (plus `pluton-ai-agent` where the job writes here). Event triggers become `repository_dispatch` types mirroring
   today's events plus the existing `schedule` and `workflow_dispatch`. Each job re-reads state by number from the
   API (R5).
4. `ci.yml` of the new repo runs `node --test` over the moved tests on `ubuntu-latest` (R9).
5. Branch `feat/ols-retest-procedure-guards` brought over as a branch (R12).
6. `docs/sdd/repo-split/owner-setup.md` (R11): App installation on pluton-ai-agent; secrets
   `AGENT_APP_PRIVATE_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` (repository); `SLACK_BOT_TOKEN` (environment `staging`);
   `CLOUDFLARE_API_TOKEN_STAGING`, `CLOUDFLARE_ANALYTICS_TOKEN_STAGING` (environment `staging`),
   `CLOUDFLARE_API_TOKEN_PROD`, `CLOUDFLARE_ANALYTICS_TOKEN_PROD` (environment `production`). Variables copied by the
   main thread with `gh variable set`, except the three enable flags (R10).
7. Prove (R10): `workflow_dispatch` triage and `dry_run` sweep in pluton-ai-agent against pluton-timesheet.

## Phase B, one pluton-timesheet round (R4, R7, R8, R10)

1. Add `.github/workflows/agent-relay.yml` with the event filter of today's `agent.yml` job `if:`; sends
   `repository_dispatch` with an App token (`repositories: pluton-ai-agent`).
2. Remove the R1 workflows and code; leave R2 stubs; adjust the R8 tests' expected values; keep R7.
3. Same step: set the three flags in pluton-ai-agent, unset them in pluton-timesheet.

## Alternatives weighed

- Reusable workflows called from pluton-timesheet: every agent change bumps a pin there, one round each
  (constraints 19, 25). Rejected by the owner popup.
- Polling on a schedule from pluton-ai-agent: latency and Actions minutes on every tick. Rejected.

## What could break

- Every agent workflow stops between Phase B's push and the first relayed event if the App is not installed on
  pluton-ai-agent: Phase B waits for owner-setup.md to be done.
- Daily triage twice on one day if the flags overlap: R10 flips both sides in one step.
- docs-check in pluton-timesheet if a stub is missing: stubs written in the same commit as the removal.
- `deploy-agent-office.yml` on the Mac runner: open question 1 decides before its move.
