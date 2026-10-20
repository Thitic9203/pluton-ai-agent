# Agent Office live page: tasks

Spec: `spec.md` · Plan: `plan.md`. One task, one commit. Every commit names its rules
(`Spec: docs/sdd/agent-office-live/spec.md R<n>`). A task whose rule waits on an open question
builds the no-source behaviour (R40) and nothing more.

## Owner actions (done by the owner, never by an agent)

- **T1 (owner). Read-only GitHub token.** Dropped by the main thread design change of 16 Oct 2026:
  the snapshot reads GitHub with the workflow's own `GITHUB_TOKEN` (R41). Nothing to create.
- **T2 (owner). Cloudflare Pages projects and deploy tokens.** Create `agent-office-staging` and
  `agent-office-prod` on the free plan with production branch `main`, in the account the existing
  `CLOUDFLARE_API_TOKEN_STAGING` and `CLOUDFLARE_API_TOKEN_PROD` tokens reach; those environment
  secrets are reused, no new secret (owner, 16 Oct 2026, popup "ใช้ token เดิม"). The repository
  variable `CLOUDFLARE_ACCOUNT_ID` already exists. Rules: R46, R47, R48. Done when: `wrangler pages project
  list` shows both, the plan is Free, and the two secret names show in each environment.
- **T3 (owner). Firebase domains.** Add `agent-office-staging.pages.dev` to the staging Firebase
  project's authorized domains and `agent-office-prod.pages.dev` to production's. No Pages secret
  (R41). Rules: R45, R48. Done when: the Firebase console lists each domain.
- **T4 (owner). Answer the open questions** Q7, Q18, Q19 and Q20 of `spec.md`. Every answer edits
  `spec.md` first (hard constraint 22). Done when: each question carries the owner's answer with its
  date, or stays open with the behaviour its rule states meanwhile.

## Mock first

- **T5. Mock changes on the Agent Office artifact.** Read artifact `Wp7pFHwNt9jDjkPZPctVjG`, then
  make the R44 changes on it: the idle line (R10), the freshness line (R11), the caption (R22), the
  read-only roster with no edit controls (R28), no simulation switch (R29), the size with its
  "how sized" note (R32, R60), the money and office blocks with their computed fields, the office
  caption naming the R61 inputs and no drinks, snacks or stock lines (R17, R36), the R58 source line
  on every number, the regression phase without a percentage while running (R8), the no-source text
  only where an open question waits (R40), and the sign-in screen (R45); republish over the same
  artifact. Rules: R44 and those listed. Test that fails first: the
  parity check of T15 run against v61 reports each of these as a difference. Done when: the
  republished version shows every change at 3 widths × 2 themes and the owner has seen the link.

- **T5a. Mock: the "ที่มาของค่าใช้จ่าย" panel.** On the same artifact, before any `src` task, add the
  R64 panel to the money section: one entry per cost line (AI cost, cache saving, electricity, water,
  internet, supplies, daily bill and office owed, fund income by size, bonuses, missions and streak,
  AI cost owed and Head's payments), each with its input, where it is read from, formula and rates
  with their origin, plus the R62 line. Rules: R44, R64. Failing first: the T15 parity check reports
  the panel id missing on v61. Done when: the republished mock shows it at 3 widths × 2 themes, and
  the owner has the link to show the team.

## Logic, test first

- **T6. Config and its validator.** `agent-office/projects.config.json` and `lib/config.mjs`. Rules:
  R1, R14. Failing first: `config.test.mjs` with a config missing a role, with an unknown
  `source.kind`, and with a roster role not in `roles`, each expected to throw. Done when: the three
  cases throw, the real config passes, and `buildLimit` 3 and `releaseBatch` 10 match their sources.
- **T7. Label to lane.** `lib/derive.mjs` `laneOf`. Rules: R2, Q1. Failing first: one case per label
  of the R2 table, and an issue with `agent:building` and `agent:in-review` expected in `in-review`
  with one warning. Done when: all cases pass.
- **T8. Release queue and phases.** `releaseQueue`, `releasePhase`. Rules: R3, R8, R34, Q5. Failing
  first: a merged `agent/issue-7` PR into `release/next` with no `on-test-env` counted once; a
  `release:batch-ready` set giving "approve"; an in-progress production run giving "prod"; no field
  named like a percentage in the output. Done when: all cases pass.
- **T9. Blocked step.** `blockedFrom(timeline)`. Rules: R4. Failing first: a timeline with
  `agent:building` removed then `agent:blocked` added gives `building`; a timeline with only
  `agent:blocked` gives `null`. Done when: both pass.
- **T10. People.** `assignPeople(roster, issues)`. Rules: R5, R6, R7, R10, Q6, E3. Failing first:
  two Dev and three building issues give the oldest two to Dev - A and Dev - B and the third
  "รอ Dev รับงาน"; one Gate 1 issue gives Head "waiting" with n 1; no issues give every person
  `idle`. Done when: all pass.
- **T11. Summary, cap, tags, project counts.** Rules: R9, R16, R30, R33, E4. Failing first: counts
  from a fixture; an `[Improvement]` title tagged and a plain title not; a `source.kind: none`
  project giving `count: null`. Done when: all pass.

## Function

- **T12. GitHub client, GET only.** `lib/github.mjs`. Rules: R2 to R4, R7, R8, R43, E1, E5. Failing
  first: a fake `fetch` that records methods and fails the test on anything but GET; a 150-issue
  fixture split over two pages read in full; a 403 rate-limit answer surfacing as a typed error; the
  token absent from every error message; a `Link` to another host refused. Done when: all pass and
  no write endpoint string exists in the module.
- **T13. The snapshot guard and the snapshot.** `functions/data/_middleware.ts` (caller check only,
  main thread design change 16 Oct 2026) and `scripts/lib/agent-office-snapshot.mjs` with
  `scripts/agent-office-snapshot.mjs`. Rules: R2 to R10, R42, R43, R65, Q13, E1. Failing first: 401
  without a token and with a bad one; 403 for a pending, a deactivated and an unknown account; 200
  and the file for an active account; 405 for POST, PUT, PATCH, DELETE; no CORS grant for another
  origin; 500 without `APP_ORIGIN`; `Cache-Control: no-store` on the file; the snapshot from a fake
  GitHub giving lanes, release card, people and `readAt`, and a GitHub failure writing no file.
  Done when: all pass.
- **T14. Environment config.** `scripts/agent-office-config.mjs` and `scripts/lib/agent-office.mjs`.
  Rules: R41, R48, R65. Failing first: staging and prod outputs each naming their own origin and
  Firebase project and not the other's, `[vars]` holding only `APP_ORIGIN` and `FIREBASE_PROJECT_ID`,
  and a check that no line looks like a secret. Done when: all pass.

## Page

- **T15. Parity check.** `tests/agent-office/parity.spec.ts`. Rules: R15 to R39. Failing first: run
  against an empty `public/index.html`, every listed mock id is missing. Done when: against the
  mock of T5 and the live page with the fixture state, it reports no missing id at 3 widths × 2
  themes. Runs in CI only (memory "No tests beside CI").
- **T16. Split the assets.** `scripts/agent-office-split-assets.mjs`. Rules: R19, R37. Failing first:
  its test expects the manifest to list every blob with a size and the rebuilt HTML to contain no
  base64 run of 400 characters or more. Done when: the test passes and the total of `public/` stays
  within the owner's ~15 MB budget, printed by the script.
- **T17. Page from mock, simulation removed.** `public/index.html`, `public/app/live.js`. Rules: R0,
  R10 to R13, R15 to R40, R45, R49. Failing first: the R0 test (no seed table names in the bundle, no
  number node without a source in the fixture render), the R10 idle-text test and the R49 grep for
  simulation names. Done when: all three pass and T15 passes. The money, office and size panels are
  wired to T28 to T34 in the same task once those exist; the deploy tasks T20 to T22 wait for them.
- **T18. Real-change bubbles and toasts.** Rules: R21, R24, Q7. Failing first: two identical states
  in a row produce no work bubble or toast; an issue entering `building` produces one "หยิบ" bubble.
  Done when: both pass.
- **T19. Conformance.** Rules: R18, R39, E6. Failing first: the axe, contrast, tap-target and
  horizontal-scroll checks on the T17 page. Done when: all pass at 3 widths × 2 themes, both themes
  applied before first paint.

## Deploy

- **T20. Workflow.** `.github/workflows/deploy-agent-office.yml`. Rules: R41, R46, R47, R48, R65.
  Failing first: `scripts/lib/agent-office-workflow.test.mjs` (the pattern of
  `scripts/lib/workflow-security.test.mjs`) that expects the production job to refuse a sha with no
  successful staging run, the staging job to need every test job, no step to echo a secret, each job
  to read only its own environment's Cloudflare secret and no other secret, read-only GitHub
  permissions, the snapshot built before every publish, and the refresh jobs deploying the sha read
  from each environment's `version.txt`. Done when: the test passes and every existing test that
  scans all workflows still passes.
- **T20a. Refresh hardening.** `.github/workflows/deploy-agent-office.yml`. Rules: R65, R46. Failing
  first, in `scripts/lib/agent-office-workflow.test.mjs`: (a) each refresh job runs a compare-on-main
  check of the served sha (`compare/$SHA...main`, `ahead` or `identical`, `::error` on failure, the
  sha through `env`, no secret in that step) in a step before any checkout of that sha; (b) the
  `issues` trigger lists `opened` and each refresh job's condition accepts it. Done when: both tests
  fail on the workflow before the change and pass after, with `workflow-security.test.mjs` and
  `workflow-silent-pass.test.mjs` still passing.
- **T21. Staging.** Through the round rules of hard constraint 19, deploy to `agent-office-staging`;
  run `tests/agent-office/staging.spec.ts`. Rules: R10, R45, R46. Done when: an unsigned visit shows
  the sign-in screen and makes no state request; a signed-in allowed account sees the idle state of
  R10 while `AGENT_ENABLED` is unset; console clean; evidence recorded with the run id.
- **T22. Production.** After the owner walks staging, start the workflow by hand with the staging
  sha. Rules: R46. Done when: the production URL serves the same sha and the T21 checks pass there.
## Recorded facts for money, progress and size (owner correction, 16 Oct 2026)

- **T24. Read one real execution file.** On the first agent run (the agent is inert until the owner
  sets `AGENT_ENABLED`), keep the execution file inside the runner, extract only the last `result`
  message's keys and numbers with a one-off step that prints no text fields, and save that shape as
  the fixture `scripts/agent/fixtures/result-message.json`. Rules: R50, R51. Failing first: T25's
  test loaded with the fixture fails while the key names in `usage-marker.mjs` are the guessed ones.
  Done when: the fixture holds the real key names and `total_cost_usd` is known to be filled or empty
  on the OAuth token (if empty, `spec.md` R51 changes first).
- **T25. Usage marker parser.** `scripts/agent/usage-marker.mjs`, `cli.mjs usage-marker`. Rules: R50,
  R59. Failing first: the T24 fixture gives the marker with every field; an array with no `result`
  message gives `"missing": ["result"]` and no numbers; a missing FX rate gives `"missing": ["fx"]`;
  the output never contains a field of type text from the input other than `model`. Done when: all
  pass.
- **T26. Usage step in `agent.yml`.** Both `claude-code-action` steps get an `id`; after each, an
  `if: always()` step with no token reads the marker into a job output, and the `usage` job
  re-checks each line with `main`'s `usage-check` and posts it with an issues-only App token (spec
  R50 as revised 16 Oct 2026). Rules: R50, R59. Failing first: `scripts/lib/agent-usage-workflow.test.mjs`
  expecting the step after each action, `if: always()`, the `execution_file` output passed as an
  argument, no token in that step, the review job running `main`'s parser, the `usage` job's shape,
  no job needing it, no `continue-on-error`, and no `upload-artifact`, `cat`, `echo` or summary write
  of that path. Security review of ca701944d (B1, N1 to N3, N5): the copy of `main`'s parser is made
  before the work step and the reviewer; the step's own shell, run with a broken copy, writes the
  `missing: ["parser"]` fallback and exits 0; `usage-check` sets `sha` from the run and enforces the
  ceilings; `acceptedUsageMarkers` in `history.mjs`. Done when: that test and
  `scripts/lib/workflow-silent-pass.test.mjs` pass.
- **T27. E2E status in `ci.yml`.** `scripts/lib/e2e-status.mjs` and one step in the job that sends
  the E2E report, with `statuses: write` on that job only. Rules: R57. Failing first: a `stats`
  fixture gives the description JSON ≤140 characters and the state; a missing report gives `error`
  with no counts; a workflow-security test expects `statuses: write` on that job and on no other.
  Done when: all pass.
- **T28. Size.** `agent-office/lib/size.mjs`. Rules: R32, R60. Failing first: fixture plans scoring 6,
  7, 15, 16, 30 and 31 give S, M, M, L, L and XL; a timeline with the label changed after Gate 1 gives
  the Gate-1 size and one warning. Done when: all pass.
- **T29. PO sizes at the plan step.** The `plan` prompt in `agent.yml` and Plan A "Gates" ask the PO
  to post the size marker and set one `size:*` label before Gate 1. The four labels `size:S` to
  `size:XL` are shown to the owner as a draft first, since creating labels is a change others see
  (global CLAUDE.md rule 23). Rules: R60. Failing first: `scripts/agent/gates.mjs` gains a check that
  refuses to count `/approve-plan` while the issue has no size marker, tested before and after.
  Done when: the test passes and the owner has approved the labels.
- **T30. AI cost, saving, income and bonuses.** `agent-office/lib/economy.mjs`. Rules: R51 to R54.
  Failing first: the fixtures of the spec's Done-when lines for R51 to R54 (including ฿2,000 × 1.60
  = ฿3,200). Done when: all pass.
- **T31. Missions, streak and ledger.** Rules: R55, R56. Failing first: missions across a Bangkok
  midnight; a streak reaching 3 and 7 and resetting; a ledger paying AI cost before office. Done
  when: all pass, with the daily rewards by difficulty, the hourly live rotation and the Monday weeks
  of the owner answers to Q18 to Q20 (16 Oct 2026) paying into the ledger.
- **T32. Office costs.** `agent-office/lib/office.mjs`. Rules: R61 to R63. Failing first: one fixture
  per line; the disjoint-inputs check; a bill larger than the fund leaving office cost owed. Done
  when: all pass, with every constant read from the config.
- **T33. History reads and their cost.** `agent-office/lib/history.mjs`, a module apart from L2's
  `lib/github.mjs` that takes its `get(path)` (main thread, 16 Oct 2026), with the reads of plan.md
  "Polling and the free quotas" (closed issues since `economyStart`, comments, reviews, check runs,
  workflow jobs, commit statuses) and the 10-minute cache with final-issue caching. Rules: R50 to R63,
  R43, R47. Failing first: a fake GitHub that counts calls shows a second read inside 10 minutes
  making 0 calls and a closed final issue never re-read. Done when: both pass, and the calls per read
  measured on staging are written into plan.md.
- **T34. Source lines.** `agent-office/lib/sources.mjs` and the page's tooltip and tap line. Rules:
  R0, R58. Failing first: the R0 test reports every number node without a source line. Done when:
  none is reported at 3 widths × 2 themes, and the tap line works at ≤1024 px.
- **T35. The panel from the config.** `agent-office/lib/cost-method.mjs` and its render in the money
  section. Rules: R62, R64. Failing first: the R64 test (every numeric config rate present in the
  panel; a changed test config changes panel and calculator together; no rate literal in the page
  source). Done when: it passes and T15 finds the panel at 3 widths × 2 themes.
- **T36. Money in the snapshot.** `agent-office/lib/money.mjs` (pure: the T33 history, the config and
  the agent App login → the `money` block in the shape `public/app/live.js` `viewOf` and `moneyRows`
  read), wired into `scripts/lib/agent-office-snapshot.mjs` through T33's `createHistory` over a
  paged `history(path)` GET of `lib/github.mjs`; the snapshot step gets `AGENT_APP_LOGIN` and the
  jobs `checks: read`. Owner, 16 Oct 2026: production shows real money, not "ยังไม่มีแหล่งข้อมูล".
  Rules: R40, R43, R47, R51 to R56, R58, R59, R61 to R64. Failing first: a history fixture gives the
  AI cost, cache saving, income with its bonuses, the ledger (AI cost paid before office), the four
  office lines and a source entry for every number; no agent App login or a day before
  `economyStart` gives `null` for the ledger fields, never 0; the R62 inputs stay disjoint; the
  snapshot test with a fake `history` GET carries that block. Done when: all pass and
  `node scripts/config-gate.mjs` exits 0.
- **T37. Office lines on real resources.** `agent-office/lib/office.mjs`, `config.mjs`,
  `cost-method.mjs`, `money.mjs`, new `cloudflare.mjs` and `fx.mjs`, `history.mjs` (jobs of the
  `agent/issue-N` runs), the snapshot CLI and the snapshot steps of `deploy-agent-office.yml`
  (`CLOUDFLARE_ANALYTICS_TOKEN_STAGING` or `_PROD` per environment, allow-listed in
  `scripts/lib/workflow-security.test.mjs`). Owner popups, 16 Oct 2026 about 00:15. Rules: R40, R61,
  R62, R64. Failing first: jobs rounded up per minute at USD 0.006 and the day's rate; rework minutes
  in water and out of electricity; request counts × USD 0.30 per million; the menu file's items
  chosen by the fixed rotation (breakfast before 11:00, a drink per run, a snack or dessert per
  review, a dessert per close) and charged at their category price, the same on every read; no
  secret giving null; the validator refusing a price without url or fetched, a mock origin, and a
  null price without `pending: true`; the panel rows in R64 order with the free quota, today's
  items, the menu credit and the Numbeo link. The menu file `agent-office/supplies-menu.json` is
  added in the same task (owner, 17 Oct 2026). Done when: all pass and `node scripts/config-gate.mjs`
  exits 0.

- **T36. Ambient life.** `agent-office/public/app/ambient.js` (pure step, break and chatter choice) wired
  into `app/office.js` with the mock's 4 s step, its break and its 5.5 s chatter. Rules: R49a, R21, R49.
  Failing first: `agent-office/ambient.test.mjs` (module missing). Done when: it passes, the existing
  agent-office suites stay green, and a local fixture render shows people walking with a bubble.

## Production fixes (owner, 17 Oct 2026)

- **T38. Real `economyStart`.** `agent-office/projects.config.json` `economyStart` `2026-10-16` with
  its source; `agent-office/lib/config.test.mjs`. Rules: R66. Failing first: a test asserting
  `economyStart` ≤ the recorded enable day `2026-10-16` fails on `2026-10-20`. Done when: it passes
  and the snapshot builder no longer reports "money without a ledger".
- **T39. Project fields in the snapshot.** `scripts/lib/agent-office-snapshot.mjs` adds `name`, `tag`,
  `description`, `key` per project. Rules: R67. Failing first: a test running the builder's project
  output through `projectsOf` and `releaseText` gets the no-source text for Taskfolio. Done when: it
  gets "Taskfolio" and its batch.
- **T40. Release holder phase.** `agent-office/public/app/office.js` reads `p.release.phase`, phase
  keys match `derive.mjs`. Rules: R68. Failing first: a page test with a holder in `on-test-env`
  finds the no-source text. Done when: every phase shows its text.

- **T23. Documents.** DECISION_LOG entries for every choice in `plan.md`, RISK_REGISTER R84 and R85
  revisited for a hosted page, MAP "Decisions so far" updated. Rules: hard constraint 9. Done when:
  the entries are on `main`.
