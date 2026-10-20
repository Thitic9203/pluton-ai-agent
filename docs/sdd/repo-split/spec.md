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

## Open questions

1. `deploy-agent-office.yml` uses `vars.RUNNER` (the Mac). Can its jobs run on `ubuntu-latest`, or does the owner
   approve registering the Mac runner to pluton-ai-agent (global rule 23)?
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
