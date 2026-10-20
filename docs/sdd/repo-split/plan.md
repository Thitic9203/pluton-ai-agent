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

### Phase A detail for T2 to T4 (R14 to R20)

| File | Change | Rules |
| :--- | :--- | :--- |
| `scripts/lib/doc-links.test.mjs` (new) | walks `docs/**/*.md`, strips fences and code spans, resolves every `](rel)` link against the file; fails on a missing target | R14 |
| `docs/**/*.md` | rewrite each broken relative link to `https://github.com/Thitic9203/pluton-timesheet/blob/main/<path resolved as in pluton-timesheet>` (the file's old location is its new location, the copy was flat) | R14 |
| `scripts/agent/relay-event.mjs` (new) | `TYPES` map dispatch type to old event name; `rehydrate({ type, payload }, gh)` returns `{ eventName, event }` read from the API | R16 |
| `scripts/agent/cli.mjs` | `main()` rehydrates when `GITHUB_EVENT_NAME` is `repository_dispatch`; repo = `PRODUCT_REPO \|\| GITHUB_REPOSITORY`; new command `event` writes `name`, `action`, `number`, `label`, `sender` outputs (for `slack-label`) | R16, R18 |
| `scripts/agent/release-cli.mjs` | repo = `PRODUCT_REPO \|\| GITHUB_REPOSITORY` | R18 |
| six workflows | triggers (R15), `PRODUCT_REPO` env, App tokens for former workflow-token calls (R17), checkouts (R19), `if:` on identifiers (R16) | R15 to R19 |
| `scripts/lib/repo-split-workflows.test.mjs` (new) | the T3 shape assertions | R15, R17 to R19 |
| layout of a product job | this repo checked out, `scripts/` copied to `$RUNNER_TEMP/pluton-ai-agent`, then the product checked out at the root (it replaces the workspace); the scripts run from the copy | R19 |
| `scripts/lib/agent-relay-event.test.mjs` (new) | rehydrate per type and per refusal | R16 |
| existing workflow tests | expected values change only where R15 to R19 change them | R8 style |
| `.github/workflows/ci.yml` (new) | `npm test` | R20 |

Data shape, `client_payload`: `{ action?, number?, label?, comment_id?, review_id?, run_id?, sha?, context?, before?,
after? }`, strings or integers, at most 10 keys (R4).

Alternatives weighed: (a) put the event body in the payload and keep the scripts unchanged: rejected, R5 forbids
trusting it. (b) rehydrate inside each command: rejected, one place in `main()` covers every command. (c) check
out this repo at the root and the product at `path: product`: rejected, claude-code-action and the release
scripts work in the workspace root, so the product stays there. (d) this repo at `path: .pluton-ai-agent` beside the
product: rejected, that folder sits inside the product tree (the agent could commit it, and the reviewer's checkout is
the agent's branch, which could carry its own `.pluton-ai-agent/`), so the scripts are copied to `$RUNNER_TEMP`.

What could break: the App installation must include pluton-timesheet (it does today) for every token; a
product-side tool reaching `$RUNNER_TEMP` (none known; checked when T7 runs); the relay of
T8 must send exactly the keys above. A label the dispatcher sets is now set with the App token (the
workflow token of pluton-ai-agent cannot write pluton-timesheet), and an App label starts workflows where a
workflow-token label did not: `agent:building` and `agent:queued` now reach the relay, wake `dispatch` (which
ignores them, as `dispatchDecision` ignores every label but `agent:ready`) and refresh the Agent Office board. The
relay of T8 may drop those two labels to save the minute; the behaviour is the same either way.

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
