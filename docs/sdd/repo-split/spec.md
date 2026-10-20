# Spec: split the AI agent out of pluton-timesheet into pluton-ai-agent

Status: draft · Owner sources: owner chat, 20 Oct 2026, "แยกส่วน AI Agent ออกมาเป็นอีก repo ใหม่ 1 repo ชื่อว่า
pluton-ai-agent และเอาแพลน md ไฟล์ไปไว้ในนั้นแทน"; popups the same day: "ย้ายทั้งโค้ดและเอกสาร", "Private (แนะนำ)",
"Event relay (แนะนำ)". Source repository: `Thitic9203/pluton-timesheet` at `0706c9dfa` (origin/main when this spec was
written).

## Fact that shapes the design

A GitHub Actions workflow runs only on events of its own repository. The agent today is driven by events of
pluton-timesheet: `issues`, `issue_comment`, `pull_request_review`, `workflow_run` of `CI`, `status`, `push` of
`release/next` (`.github/workflows/agent.yml` and `agent-release.yml` `on:` blocks at `0706c9dfa`). So one small
workflow must stay in pluton-timesheet: the relay of R4.

## Rules

- **R1.** When the split is done, the agent's code must live only in `Thitic9203/pluton-ai-agent` (private): the
  workflows `agent.yml`, `agent-triage.yml`, `agent-sweep.yml`, `agent-release.yml`, `agent-main-audit.yml`,
  `deploy-agent-office.yml`; `scripts/agent/**`, `scripts/ols/**`, `agent-office/**`, `scripts/agent-office-*.mjs`,
  and their tests in `scripts/lib/agent-*.test.mjs` and `scripts/lib/agent-office*.mjs`. Source: owner 20 Oct 2026
  "ย้ายทั้งโค้ดและเอกสาร".
- **R2.** The agent's documents must move too: `docs/superpowers/plans/always-on-dev-agent.md`,
  `agent-workflow-and-economy.md`, `agent-test-matrix.md`; `docs/sdd/agent-office-*`, `agent-po-triage`, `ols-real`,
  `ols-retest-procedure`; `docs/wayfinder/agent-office`, `docs/wayfinder/multi-project-intake`. Each old path in
  pluton-timesheet must keep a one-line stub that links to the new location, so every existing link still resolves
  (`docs-check`: "Every relative link and anchor resolves"). Relative links inside moved files that point back into
  pluton-timesheet must become absolute GitHub URLs. Source: owner 20 Oct 2026 "เอาแพลน md ไฟล์ไปไว้ในนั้นแทน".
- **R3.** The import must be a flat copy whose commit names the source sha; pluton-timesheet history must not be
  rewritten. Source: CLAUDE.md hard constraint 5.
- **R4.** pluton-timesheet must keep one workflow, `agent-relay.yml`, that on the events listed above sends
  `repository_dispatch` to pluton-ai-agent with identifiers only (event name, issue or pull request number, sha,
  workflow run id; at most 10 top-level keys and under 64 KB, GitHub REST "Create a repository dispatch event"), and
  runs no agent logic. It must skip, at no runner cost, every event the agent ignores today (the job-level `if:` of
  `agent.yml`). Source: owner popup "Event relay (แนะนำ)".
- **R5.** When pluton-ai-agent receives a dispatch, it must re-read every state it acts on from the GitHub API of
  pluton-timesheet (labels, comments, approvals), never from the payload, so a forged or stale payload decides
  nothing. Source: Decision Q2 of the always-on plan (approvals read from history every time).
- **R6.** Every job of pluton-ai-agent that reads or writes pluton-timesheet must use a GitHub App token minted with
  `owner: Thitic9203` and `repositories: pluton-timesheet` (actions/create-github-app-token v3 README, "owner"), with
  the same per-job `permission-*` as today (Decision Q3). Code checkouts of the product use
  `repository: Thitic9203/pluton-timesheet`.
- **R7.** What stays in pluton-timesheet because it is product policy about agent pull requests: `ci.yml` routing of
  `agent/issue-` and bot pull requests to `ubuntu-latest` (R88), the `pr-budget.mjs` App exemption, the
  `release/next` branch, the `agent:*` and `size:*` labels, CLAUDE.md hard constraint 21, the issue templates, and
  `docs/agent-brief-*.md` (agents read them from the product checkout). Source: CLAUDE.md constraints 8, 12, 21.
- **R8.** Tests in pluton-timesheet that assert over the moved workflows (`workflow-security.test.mjs`,
  `playwright-browsers-path.test.mjs`, `test-reach.mjs`, `runner-power-wiring.test.mjs`, `e2e-status.mjs`) must
  change their expected values only as this spec says (the moved files are gone); their agent halves move with the
  workflows and run in pluton-ai-agent's CI. Source: CLAUDE.md constraint 12 (an existing test changes only when a
  confirmed spec changed its expected value).
- **R9.** pluton-ai-agent must have its own CI that runs the moved tests on `ubuntu-latest` on every push and pull
  request. Source: global rule 18.
- **R10.** The cutover must leave no gap and no double run of the daily jobs (owner, 20 Oct 2026: "Agent
  ทำเองอัตโนมัติทุกวัน"): the new repo keeps `AGENT_ENABLED`, `AGENT_TRIAGE_ENABLED`, `AGENT_SWEEP_ENABLED` unset
  until it is proven (a `workflow_dispatch` of triage and a `dry_run` sweep against pluton-timesheet, acting as
  `taskfolio-dev-agent[bot]`), then one pluton-timesheet round adds the relay and removes the moved workflows in the
  same push in which the new repo's variables are set.
- **R11.** Secrets cannot be copied by API, so the owner places them. The list of exact names and where each goes
  must be in `docs/sdd/repo-split/owner-setup.md`, not in chat. Variables are copied by the main thread. Source:
  global rule 23, CLAUDE.md hard constraint 2.
- **R12.** Unreviewed work must not land on pluton-ai-agent main: `feat/ols-retest-procedure-guards`
  (`f6fe0069e`, second review stopped before a verdict, one open question on `||` tables in Jira comment bodies)
  moves as a branch, and `scripts/ols` on main is imported from pluton-timesheet main. Source: CLAUDE.md constraint 12.
- **R13.** No new paid service: private-repo Actions minutes come from the account's existing free quota (Q6), and
  the Mac runner is not registered to the new repo without the owner's approval (global rules 3 and 23).

### Receiver wiring in pluton-ai-agent (T2 to T4; source: owner popup 20 Oct 2026 "Event relay (แนะนำ)", R2, R4 to R6, R9)

- **R14.** When a markdown file under `docs/**` of pluton-ai-agent links to a relative path that does not exist in
  pluton-ai-agent, the link must instead be the absolute URL
  `https://github.com/Thitic9203/pluton-timesheet/blob/main/<path>`; a link to a file present in pluton-ai-agent
  must stay relative. `scripts/lib/doc-links.test.mjs` must fail on any relative link (outside code spans and
  fences) that resolves to a missing file. Source: R2.
- **R15.** Each pluton-timesheet event the agent acts on must reach pluton-ai-agent as `repository_dispatch` of one
  type: `ts-issues` (was `issues`), `ts-issue-comment` (`issue_comment`), `ts-pr-review` (`pull_request_review`),
  `ts-ci-completed` (`workflow_run` of `CI` on an `agent/issue-` branch, for `agent.yml`), `ts-ci-main-completed`
  (`workflow_run` of `CI` of a push to `main`, for `agent-release.yml`; two types because a dispatch type cannot be
  filtered in `on:` and each old trigger had its own branch filter), `ts-status` (`status`), `ts-release-next`
  (`push` of `release/next`),
  `ts-main-push` (`push` of `main`, for `agent-main-audit.yml`), `ts-deploy-production` (`workflow_run` of `Deploy
  production`, for `deploy-agent-office.yml`). `client_payload` carries only these identifiers: `action` (the
  original event action), `number`, `label`, `comment_id`, `review_id`, `run_id`, `sha`, `context`, `before`,
  `after`. No workflow of pluton-ai-agent may trigger on `issues`, `issue_comment`, `pull_request_review`,
  `status`, or on `workflow_run` of a workflow that is not defined in pluton-ai-agent itself; `schedule` and
  `workflow_dispatch` stay. Source: R4.
- **R16.** When a dispatch arrives, `scripts/agent/relay-event.mjs` must rebuild the event the scripts judged
  before the split from the pluton-timesheet API, using the payload only for identifiers: the issue, comment,
  pull request, CI run, commit statuses and branches are read by number; the actor of a label change is read from
  the issue timeline, never the payload; a payload whose claim the API does not confirm (a label the issue does not
  carry, an issue that is not closed, a comment of another issue, a run that is not `CI` or not completed, a status
  context that is not on that sha, a main range not on main, a `ts-ci-main-completed` run not of a push to `main`)
  becomes an event the dispatcher ignores. A job that used a field of the event body (a sha, a branch, a run id,
  a label, a sender) takes it from the outputs of `cli.mjs event`, which prints the rebuilt event's fields. The job
  `if:` filters keep their logic on identifiers (`github.event.action`, `client_payload.action`,
  `client_payload.label`) only; every decision that read the body (comment text, sender, review state, labels
  of the issue) is re-judged by the scripts from the API. Source: R5, Decision Q2.
- **R17.** Every job that called the pluton-timesheet API with the workflow token (`github.token`) must use an
  App token minted with `owner: Thitic9203`, `repositories: pluton-timesheet` and the `permission-*` inputs equal
  to the job's former `permissions:` block (the workflow token reaches only its own repository). Every existing
  App token step keeps its `permission-*` inputs and gains `owner` and `repositories`. Source: R6, Decision Q3.
- **R18.** Every workflow must set `env: PRODUCT_REPO: Thitic9203/pluton-timesheet`; every `gh` or API call meant
  for the product must name `$PRODUCT_REPO`, and the scripts must read `PRODUCT_REPO` with `GITHUB_REPOSITORY` as
  the fallback. A link to a run of this repository (`run_id`) keeps `github.repository`. Source: R6.
- **R19.** A job that needs product files (the agent's working tree, the reviewer's branch, triage and sweep
  reading the repository, the release scripts' git ancestry, `scripts/staging-smoke.mjs`) must check out
  `repository: Thitic9203/pluton-timesheet` at the workspace root with the job's App token, and this repository's
  scripts at `path: .pluton-ai-agent`, listed in the product checkout's `.git/info/exclude` so the agent can never
  commit them. A job that needs only this repository's scripts checks out this repository as before. Source: R6.
- **R20.** pluton-ai-agent's `.github/workflows/ci.yml` must run on every `push` and `pull_request`, on
  `ubuntu-latest`, `actions/checkout` and `actions/setup-node` (node 22) at the exact pins the moved workflows
  use, then `npm test`, with `permissions: contents: read`. Source: R9.

## Open questions

1. `deploy-agent-office.yml` uses `vars.RUNNER` (the Mac). Can its jobs run on `ubuntu-latest`, or does the owner
   approve registering the Mac runner to pluton-ai-agent (global rule 23)? Its `runs-on` lines are kept as they are
   until this is decided. Linked: its jobs run `node scripts/runner-power.mjs` and its `paths:` filters name
   product files (`functions/_lib/verifiedRequest.ts`, `src/services/*.ts`); neither exists in pluton-ai-agent,
   so the same decision settles whether those steps and filters go or are fetched from the product.
2. pluton-timesheet main is red (CI run 39371091028, E2E, management role) and constraint 12 holds the cutover round
   until it is root caused. Owner of that investigation: not assigned.
3. R24 of ols-real refuses Jira comment bodies containing `||`; is there a confirmed rule that wants Jira tables?

## Done when

- R1, R2: the listed paths exist in pluton-ai-agent and are gone from pluton-timesheet except the R2 stubs; docs-check
  passes in pluton-timesheet.
- R3: the import commit message names `0706c9dfa`; `git log` of pluton-timesheet is unchanged before the removal commit.
- R4, R5, R6: a test in each repo asserts the relay's payload keys and the receiver's API re-read; one real event on
  pluton-timesheet produces one run in pluton-ai-agent.
- R7, R8: those paths and tests still exist and pass in pluton-timesheet CI.
- R9: pluton-ai-agent CI is green on main.
- R10: one triage run and one sweep dry run from pluton-ai-agent succeed before the flip; after the flip, no
  agent workflow runs in pluton-timesheet except the relay.
- R11: owner-setup.md lists every secret; `gh secret list` in pluton-ai-agent shows each name.
- R12: `feat/ols-retest-procedure-guards` exists in pluton-ai-agent and is not on its main.
- R13: no new paid service; no runner registered without approval.
- R14: `node --test scripts/lib/doc-links.test.mjs` passes; it failed on the tree before T2.
- R15, R17, R18, R19: `scripts/lib/repo-split-workflows.test.mjs` asserts the triggers, every token step's
  `owner` and `repositories`, every product checkout's `repository`, `PRODUCT_REPO` on every workflow, and no
  product `gh` call on `GITHUB_REPOSITORY`.
- R16: `scripts/lib/agent-relay-event.test.mjs` asserts each type rebuilds the old event from a fake API and
  each unconfirmed claim becomes ignored.
- R20: `ci.yml` exists with those pins; its first run is green on main (after Actions are enabled, R10).
