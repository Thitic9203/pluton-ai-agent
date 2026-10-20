# OLS for real: plan

Spec: `spec.md` in this folder

## Files

| File | Change | Rules |
|---|---|---|
| `scripts/ols/lib/classify.mjs` (+test) | new, pure: JQL, ticket fields, duty per ticket; 19 Oct 2026 `adfText` and `ticketContext` | R1, R2, R3, R17 |
| `scripts/ols/lib/gate.mjs` (+test) | new, pure: draft text, `passed` check, feedback | R7, R8 |
| `scripts/ols/lib/e2e.mjs` (+test) | new, pure: newest run folder, unexpected cases | R10 |
| `scripts/ols/lib/runner.mjs` (+test) | new: prompt per duty; since 19 Oct 2026 `buildOrder` (a work order for the `ols-qa-worker` agent) replaces the `claude -p` call, plus `readDone`/`collect` for the done file | R4, R5, R11, R18, E2 |
| `.claude/agents/ols-qa-worker.md` (+`scripts/ols/lib/worker-agent.test.mjs`) | new 19 Oct 2026: the worker agent type, a tool list with no MCP tool and no WebFetch | R4 |
| `.gitignore` | 19 Oct 2026: `.claude/*` is ignored; un-ignore `.claude/agents/ols-qa-worker.md` only | R4 |
| `scripts/ols/lib/dispatch.mjs` (+test) | new, pure: job state machine, cap 3 | R6, E1 to E3 |
| `scripts/ols/lib/apply.mjs` (+test) | new: allow-list, once-only writes, dry run first, e2e merge and rerun; 19 Oct 2026: the rerun may answer `pending` (R19) | R9, R12, R19, E5 |
| `scripts/ols/lib/jira.mjs`, `slack.mjs` (+tests) | new: clients with injected `fetch`; credential loaders; 19 Oct 2026 `issue(key)` GET with `expand=names` | R1, R7, R17 |
| `scripts/ols/lib/publish.mjs` (+test) | new: board hash, `gh variable set`, `gh workflow run` | R13 |
| `scripts/ols/tick.mjs` | new: wires the real clients; dry unless `--live`; 19 Oct 2026 writes orders instead of spawning, collects done files, prints `ORDERS <json>` last | all, R18 |
| `scripts/ols/scheduled-task/ols-agent/SKILL.md` | new: Desktop scheduled task definition (not installed); 19 Oct 2026 the R18 loop | R1, R18 |
| `agent-office/lib/ols-board.mjs` (+test) | new, pure: build and validate the OLS board JSON | R14, E4 |
| `agent-office/lib/config.mjs`, `projects.config.json` | add source kind `mac-snapshot` for OLS | R13, E4 |
| `agent-office/lib/derive.mjs` | `projectCounts`: a `mac-snapshot` project counts when data arrived | M9, E4 |
| `scripts/lib/agent-office-snapshot.mjs` (+test) | merge validated `OLS_BOARD` cards | R14, E4 |
| `.github/workflows/deploy-agent-office.yml` | pass `vars.OLS_BOARD` as env to the four snapshot steps | R13 |
| `docs/sdd/agent-office-live/spec.md` | R65 and E4 name the Mac snapshot | R13 |

## Data shapes

Job (state file `~/.claude/projects/-Users-thitichaya-GitHub-pluton-timesheet/ols-agent/state.json`):
`{ id, kind: 'ticket'|'e2e', key, duty, phase: 'queued'|'running'|'review'|'draft-sent'|'rework'|'approved'|'applied'|'failed', thread, draftTs, feedback, applied: string[], createdAt, updatedAt, error, stage, startedAt, rerun?: { pr, orderedAt } }`.
Since 19 Oct 2026 a job carries no `pid`; `startedAt` is when its order was written.

Order (`<jobDir>/order.json`, R4) and the tick's last line `ORDERS <json array of these>`:
`{ id, stage: 'work'|'review'|'rerun', agent: 'ols-qa-worker', cwd, jobDir, prompt, writes: string[] }`.
Done file (`<jobDir>/<stage>.done.json`, written by the session, R18): `{ ok: boolean, error?: string }`.
`ticket.json` (R17): the intake fields plus `{ description, criteria: [{ name, text }], comments: [{ author, created, text }], cut: string[] }`.

`actions.json`, allow-list per duty (E5):

| Duty | Allowed action types |
|---|---|
| `write-tc` | `sheet.createTab {rows}`, `jira.comment {body}`, `jira.tcStatus {value: 'DONE'}` |
| `review-tc` | `jira.comment`, `jira.tcStatus {value: 'QA REVIEWED'}` |
| `test` | `jira.comment`, `jira.transition {to}` |
| `retest` | `jira.comment`, `jira.transition {to}`, `jira.assign {accountId}` |
| `e2e-fix` | `e2e.merge {pr}` (then the rerun of R12) |

`OLS_BOARD` (repository variable, ≤ 48 KB): `{ v: 1, readAt, items: [{ n, summary, duty, phase }] }`.
`ols-board.mjs` turns each item into a board issue `{ project: 'ols', n, title, lane, from, createdAt, labels: [] }`.

## Libraries and cost (free tier only)

Node 22 built-ins only (`fetch`, `node:test`, `child_process`); no new dependency. `claude -p` runs on
the owner's Max plan (RISK_REGISTER R80, accepted 15 Oct 2026). Slack, Jira and GitHub API calls are
free. A refresh deploys to Cloudflare Pages free plan; it runs only when the board changed (Q21).
New cost: none. Other repositories touched: none (ols-qa and ols-qa-e2e are only read and run;
e2e PRs are the loop's output in ols-qa-e2e, per P8).

## Alternatives weighed, and the choice

- **How OLS data reaches `state.json`:**
  1. A repository variable `OLS_BOARD` set by the Mac with the owner's `gh`, read by every snapshot
     build. Chosen: persists across every refresh trigger (issue events, agent runs) so OLS cards
     never vanish; it is data, not code, so R46 holds; the Jira token stays on the Mac.
  2. A `workflow_dispatch` input: lost on the next refresh from any other trigger. Rejected.
  3. A data branch or a gist: a git push or a gist token from the Mac, more moving parts. Rejected.
- **Runner (respecified 19 Oct 2026, R4, R18):** `claude -p` fails on this Mac under every
  environment tried (main thread, 19 Oct 2026: "Not logged in" clean, "organization has disabled
  Claude subscription access" with the host env), so the duty moves inside the scheduled session.
  1. **`claude -p` with an Anthropic API key.** Works headless and keeps the sandbox HOME and Bash
     deny list. Rejected: a metered API costs money, global rule 3 and hard constraint 1; no approval.
  2. **`claude -p` with the session's own environment kept.** Rejected: the main thread ran it and
     got the organization refusal; the Desktop session's auth is refreshed by the host
     (`CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH`), which a separate process does not get.
  3. **The scheduled session does the duty itself, in its own context.** Works with the host login.
     Rejected: the session holds every MCP server (Atlassian with write tools, Slack), so "no MCP"
     would be a prompt rule only, and one long context mixes up to three tickets and the QA Lead
     review with the work it reviews (R5).
  4. **Chosen: the tick writes orders; the session runs each with an `Agent` call of the project
     agent type `ols-qa-worker`.** Host login, no paid service; the agent definition's `tools:` list
     leaves out every MCP tool and `WebFetch` (an allow-list, as plugin agents such as
     `caveman:cavecrew-builder` use: `tools: [Read, Edit, Write, Grep, Glob]`); each order is its own
     context, so the QA Lead review is a separate worker (R5); the tick stays the only writer.
     Cost: the old sandbox HOME, `--setting-sources ''` and the Bash deny list have no equivalent for
     an `Agent` call (spec open question 7, RISK_REGISTER R107), and the task must open in this
     repository so the agent type loads (open question 6; fails closed).
- **Board lane:** `test-planning` for every OLS card, exactly as the mock (M8). A finer lane needs a
  mock change first (spec open question 4).

## What could break (hard constraint 5)

- `deploy-agent-office.yml`: four steps gain one env line; `workflow-security.test.mjs` and
  `agent-office-workflow.test.mjs` must stay green.
- `config.mjs` accepts one more source kind; Taskfolio's `github-labels` path is untouched.
- `derive.mjs` `projectCounts`: `none` still gives null; only `mac-snapshot` is new.
- Risk: a worker has Bash and could reach Jira with a credential file on disk. Mitigation (19 Oct
  2026): no MCP tool and no `WebFetch` in its tool list, the prompt forbids the token files, and the
  apply step is the only writer. Weaker than the old `claude -p` sandbox (no deny list, no sandbox
  HOME); not a hard guarantee; RISK_REGISTER R107.
- Removed 19 Oct 2026: `buildRun`, `denyList`, `stopRun` and `KEEP_ENV` of `runner.mjs`, used only by
  `tick.mjs` and `runner.test.mjs` (`grep -rn` over the repository); their tests change with R4.
- Review of `8d7cee05b` (19 Oct 2026): contexts are read before any reply, apply or post (E1); the review stage reads `work-draft.md`/`work-actions.json` and every order removes the files it writes (R5, E2); comments come from the comment endpoint newest first with `total`; a 5 MB response cap and a 200,000-character `ticket.json` cap (R17).
- A scheduled run that dies between a tick and its done files leaves orders out; the next tick fails
  them after 2 hours (E2) and the owner can reply in the thread to rework.
- Risk: two ticks at once. Mitigation: a lock file; a second tick exits.

## Review of `8ee83c0b3` (20 Oct 2026: R21 to R24)

Files:

| File | Change | Rules |
|---|---|---|
| `scripts/ols/lib/slack.mjs` | new export `plain(text)`: puts a space inside each Jira markup token (double pipe, double backslash, `!x!`) until `markupProblem` is null; `guard()` unchanged | R21 |
| `scripts/ols/lib/tick-steps.mjs` (+`tick-steps.test.mjs`) | new: the live tick's Slack and collect steps moved out of `tick.mjs` so they can be tested with a fake `fetch` and a fake fs: `failureNotice`, `applyNotice`, `makeSay`, `collectStep` | R21 to R24 |
| `scripts/ols/tick.mjs` | calls `tick-steps.mjs` instead of its own `say`, collect loop and notice text; no other change | R21 to R23 |
| `scripts/ols/lib/gate.mjs` (+test) | `describe` prints the comment and mention body verbatim in a code fence, and the mention's account | R24 |

Data shapes: `j.readBacks` entries keep `{ step: 'slack.post', ts, ok, error? }`; a read-back that throws
becomes `{ ok: false, error: <message> }`. `makeSay` takes `mark(ts)`, called after the post and
before the read-back, followed by `record()`.

Alternatives weighed:

- R21: strip the markup in `guard()` for every post. Rejected: a draft with markup must still be
  refused (ols-retest-procedure R5), and the review asked to keep the guard as it is. Chosen:
  neutralise only the free text of notices and apply results.
- R24: refuse a job whose `a.body` is not inside `draft.md`. Rejected: a worker would have to copy
  every body into the draft, and a loose containment check passes a body that differs slightly.
  Chosen: print the body itself, so what the owner reads is what is posted; the markup check at
  collect runs on the whole draft text, so a body with markup fails the job at collect (with a
  reason that names the markup in words) rather than throwing at post time.
- R22, R23: keep the logic in `tick.mjs` and test by running the script. Rejected: it needs the real
  HOME, Jira and Slack. Chosen: inject the clients and fs into small step functions.

Libraries: none new (Node built-ins only), free.

What could break (hard constraint 5):

- `draftText` output changes for `jira.comment` and `jira.mentionPo`; the existing `gate.test.mjs`
  assertions (`คอมเมนต์ใน Jira`, `เมนชั่น PO ในเคสที่รอ PO CF: AC2, AC4`) still match.
- A comment body longer than Slack's message limit (about 40,000 characters) now makes the draft
  longer; not handled here (spec open question 12).
- `tick.mjs` behaviour is otherwise the same; `node --check` shows it still loads.
