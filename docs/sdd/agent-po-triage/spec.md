# Agent PO/BA triage: spec

Status: draft · Owner sources: owner, 17 Oct 2026, "ให้ agent PO หรือ BA ไปทำหน้าที่ รีวิวงานและติดลาเบลและเริ่มทำตามกระบวนการได้เลย";
the needs-info loop (needs-info, then BA/TL/QA enrich from repo sources, re-triage, ready; the owner is asked by Slack DM only
when no repo source answers; after three sweeps the gap is sent to the owner by DM), relayed by the main thread on 17 Oct 2026
under the owner's order to finish without asking.

Amends Decision Q1 of [always-on-dev-agent](../../superpowers/plans/always-on-dev-agent.md): until now only the owner could
start work by labelling `agent:ready`.

## Rules
- **R1.** When an `issues` event labels `agent:ready`, the dispatcher must count it only when the sender is the owner's User
  account `Thitic9203` or the agent's own App (`<AGENT_APP_SLUG>[bot]`, type Bot). Source: owner 17 Oct 2026 (above); Q1.
- **R2.** When the App applied `agent:ready`, the dispatcher must not start the issue unless its author is a collaborator
  (`author_association` OWNER, MEMBER or COLLABORATOR). Source: main thread brief 17 Oct 2026 ("never labels issues opened
  by non-collaborators").
- **R3.** When the triage workflow runs (daily schedule, `issues: opened`, or by hand), it must list as candidates only open
  issues (not pull requests) written by a collaborator, without the `self-filed` label, and carrying no `agent:*` label
  other than `agent:needs-info`. Source: brief 17 Oct 2026; sweep issues are never `agent:ready` (agent-sweep.yml header).
- **R4.** The judging step must run with read-only repository and issue access and no write tool; it returns one verdict per
  candidate (`ready` or `needs-info`, a reason, the enrichment it found with its repo source, and an owner question only
  when no repo source answers). Source: brief 17 Oct 2026 (read-only judge, no-AI apply).
- **R5.** A verdict is `ready` only when the issue is a confirmed bug (BUG_WORKFLOW: expected side quoted from a source) or
  an `[Improvement]` the owner opened or approved, its acceptance is clear, it is in scope of this repository, and it does
  not need money, a security change or production-only work. Source: brief 17 Oct 2026; docs/BUG_WORKFLOW.md; CLAUDE.md
  hard constraints 1 and 13.
- **R6.** The apply step must label at most three issues `agent:ready` per run, comment the triage reason on each before
  labelling, and remove `agent:needs-info` from it. Source: brief 17 Oct 2026 (cap 3, audit comment).
- **R7.** For a `needs-info` verdict, the apply step must comment what is missing and the enrichment found (BA, Tech Lead
  and QA roles reading repo sources), with a sweep marker, and label `agent:needs-info`, creating that label if it is absent.
  Source: owner loop 17 Oct 2026.
- **R8.** When a `needs-info` verdict carries an owner question (no repo source), the apply step must send it to the owner
  by Slack DM once per issue and ask for the answer as an issue comment. Source: owner loop 17 Oct 2026.
- **R9.** When an issue reaches its third `needs-info` sweep, the apply step must DM the owner the remaining gap once and
  stop re-triaging it until the owner comments. Source: owner loop 17 Oct 2026.
- **R10.** The apply step must ignore a verdict for any number that is not a candidate of the same run. Source: R3, R4
  (the model's output is data).
- **R12.** When the App applied `agent:ready`, the dispatcher must count it only when the App's own comment carrying
  `<!-- agent-triage ready -->` was posted at most 10 minutes before that label event and not after it, and never when the
  issue's timeline shows any agent state past triage (`agent:building`, `agent:blocked`, or any other but ready, queued
  and needs-info). Source: main thread review of the triage change, 17 Oct 2026 (the agent job holds an App token too).
- **R11.** Gate 1 (owner approves the plan) and Gate 3 (owner merges) must stay unchanged. Source: brief 17 Oct 2026.
- **R13.** When the judging step fails, the judge job must keep a redacted digest of the step's execution file
  (`steps.judge.outputs.execution_file`) as an artifact kept 3 days, and print the digest's `result` entry to the log.
  The digest keeps only the `system`/`init` message (model, `apiKeySource`, version, tool names, MCP server names and
  status), the `result` message (subtype, `is_error`, the `result` text and `errors`, cut to 2,000 characters, duration,
  turns, cost, usage) and the text blocks of assistant messages (cut to 2,000 characters); it must never keep a user
  message, a tool input or a tool result, so the candidates file the model read is not copied out. The kept assistant
  text is the model's own words and may quote or paraphrase issue text; its readers are the readers of this private
  repository, the same people who can read the issues themselves.
  `show_full_output` must stay off. Both steps run only when the job is already red, so a refused upload (the account
  wide artifact quota) never decides the verdict. Source: run 39012662586 (17 Oct 2026: the CLI ended in 1,980 ms with
  `is_error: true`, `total_cost_usd: 0`, `modelUsage: {}`, and the action's "--json-schema was provided but Claude did not
  return structured_output" hid the real error); the handoff of 17 Oct 2026, item 3, in
  [always-on-dev-agent](../../superpowers/plans/always-on-dev-agent.md); PITFALLS 6.182 and 6.184 (an upload in a job
  runs only when that job is already red); the action's own warning on `show_full_output` (`action.yml` at
  `1d6de8cb`: "may contain secrets").
- **R14.** When the apply job runs, it must run in the GitHub environment `staging`, so `secrets.SLACK_BOT_TOKEN`
  resolves and the DMs of R8 and R9 are sent. The token is a secret of the environments `staging` and `production`
  only, never of the repository (docs/WIF_SETUP.md:87), and a job without `environment:` reads it as empty. The apply
  job runs no model and only `main`'s own `scripts/agent/cli.mjs`, so it may hold the environment secret on the same
  terms as the Slack notice jobs of `agent.yml` (`agent.yml:611-621`, `environment: staging`). The judge job must still
  not name the token (R4). Source: owner 19 Oct 2026 goal (the agent works end to end today, the triage DM included);
  run 39107576556 (the apply job's DM was skipped with "Slack is not configured").
- **R15.** When the judge failed and the digest's `result` entry has `is_error: true`, the digest step must print one
  `::error::` workflow command carrying that entry's `result` text (or its `errors` when `result` is empty), on a single
  line with `%`, CR and LF escaped as `%25`, `%0D` and `%0A`, before it prints the `result` entry. An entry with
  `is_error` false or absent prints no `::error::` line. Source: owner 19 Oct 2026 goal; run 39107576556 (the log's only
  error annotation was the action's "--json-schema was provided but Claude did not return structured_output"; the real
  line, `"result":"Failed to authenticate. API Error: 401 OAuth access token is invalid."` with `"is_error":true`, sat
  unannotated in the digest step's output).

## Edge cases
- **E1.** When `AGENT_APP_LOGIN` is empty, no Bot sender counts (fails closed). Source: R1.
- **E2.** When a verdict is malformed or missing, the issue is left untouched this run. Source: R10.
- **E3.** When `SLACK_BOT_TOKEN` or `SLACK_OWNER_ID` is absent, the DM is skipped with a warning and no DM marker is
  written, so the next run tries again. Source: slack-notify behaviour (scripts/agent/slack-notify.mjs). Since R14
  this is the fallback for a missing environment secret or variable, not the normal path.
- **E4.** When the judging step left no execution file (it failed before the CLI ran, or `List the candidates` failed so
  it never ran), no digest is written and nothing is uploaded. Source: R13; the action sets `execution_file` on failure
  only when the file exists (`base-action/src/execution-file.ts:34` at `1d6de8cb`).

## Done when
- [ ] R1, R2, E1: `scripts/lib/agent-dispatch.test.mjs` and `agent-gates.test.mjs` pass for owner, App bot, impostors.
- [ ] R3, R6 to R10: `scripts/lib/agent-triage.test.mjs` passes.
- [ ] R4, R11: `scripts/lib/agent-workflow.test.mjs` asserts agent-triage.yml judge permissions read-only and no write tool.
- [ ] `node scripts/config-gate.mjs` passes.
- [ ] R13, E4: `scripts/lib/agent-workflow.test.mjs` asserts the two failure steps (their `if:`, the pinned upload,
  `retention-days: 3`, no `show_full_output: true`) and runs the digest filter on a fixture: an API error survives, a
  tool result, a tool input and a user prompt do not.
- [ ] R14: `scripts/lib/agent-workflow.test.mjs` "every job that reads secrets.SLACK_BOT_TOKEN runs in the environment
  staging" passes for every agent workflow, and the apply test asserts `environment: staging`.
- [ ] R15: `scripts/lib/agent-workflow.test.mjs` "the digest step annotates an is_error result as ::error:: (R15)" runs
  the `JUDGE_ERROR_LINE` filter on a digest: a multi-line 401 result gives one escaped `::error::` line, and
  `is_error: false` gives no output.

## Open questions
- The owner's answer is read from the owner's issue comments; reading DM replies is not built. Owner to confirm.
- How a sweep counter resets after the owner answers: built as "the owner's comment newer than the last gap DM re-opens
  triage with the count kept". Owner to confirm.
