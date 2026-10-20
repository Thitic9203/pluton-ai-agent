# Agent Office live page: plan

Spec: `spec.md` in this folder. Rules are cited as R<n>, open questions as Q<n>.

## Shape in one paragraph

A static page (the v61 mock, its simulation removed and a live adapter added), a JSON snapshot of
the board, and one Pages Function middleware, deployed together from a new folder `agent-office/` to
two Cloudflare Pages projects, `agent-office-staging` and `agent-office-prod`, by a new workflow
modelled on `deploy-jira-proxy.yml`. The workflow reads GitHub with its own `GITHUB_TOKEN` (read
scopes only), derives the board in Node with the pure libraries, and writes
`public/data/state.json` with `readAt` before it publishes (R65). The middleware in front of
`/data/*` verifies the caller's Firebase ID token and active account and then serves the file; it
holds no credential and imports none of the snapshot libraries (main thread design change, 16 Oct
2026: no GitHub token and no Pages secret). The page polls the file and renders exactly what it
says. Nothing in the existing Taskfolio app, its Jira proxy or its Pages projects changes.

## Files

| File | Change | Rules |
| :--- | :--- | :--- |
| `agent-office/projects.config.json` | new: projects, roster, role catalogue, token prices with sources | R1, R14 |
| `agent-office/lib/config.mjs` + `.test.mjs` | new: validate the config; fail the build on any error | R1 |
| `agent-office/lib/derive.mjs` + `.test.mjs` | new, pure: labels → lanes, release queue, blocked step, holder assignment, Head, idle, release phase, Improvement tag, summary counts, cap line | R2 to R10, R16, R33, R34 |
| `agent-office/lib/github.mjs` + `.test.mjs` | new: GET-only GitHub client used by the snapshot step in Node (open issues, timeline of blocked issues, closed PRs into `release/next`, in-progress Actions runs), pagination through `Link`, rate limit as a typed error; the token never in an error | R2 to R4, R7, R8, R43, E1, E5 |
| `agent-office/functions/data/_middleware.ts` | new: in front of `/data/*`: CORS from `APP_ORIGIN` and the GET guard (`handleCors`, `misconfigured`, `validateAppOrigin` from `src/services/jiraCors.ts`), then `requireVerifiedCaller` from `functions/_lib/verifiedRequest.ts` (Firebase ID token and active `users/{uid}`), then the static file with `Cache-Control: no-store` | R42, R43 |
| `agent-office/functions/data/_middleware.test.mjs` | new: node test of the real middleware with a signed fixture token and a stubbed `fetch` for the key set and Firestore | R42, R43 |
| `agent-office/functions/tsconfig.json` | new: Workers types for the middleware | R43 |
| `scripts/lib/agent-office-snapshot.mjs` + `.test.mjs`, `scripts/agent-office-snapshot.mjs` | new: read GitHub with the client, derive with `agent-office/lib/derive.mjs`, write `state.json`; Node only, never bundled into the Function | R2 to R10, R16, R30, R33, R65 |
| `agent-office/public/index.html` | new: v61 markup and styles; simulation code removed; live adapter wired in; mock-first changes of R44 | R15 to R40 |
| `agent-office/public/app/live.js` | new: sign-in, poll every 60 s while visible, render from the JSON, real-change-only bubbles and toasts | R10, R11, R21, R24, R45 |
| `agent-office/public/assets/**` | new: the models, textures and clips v61 embeds as base64, split into files | R19, R37 |
| `agent-office/public/vendor/three@0.170.0/**` | new: the three.js files v61 imports from jsDelivr, copied at the same version | R19 |
| `agent-office/public/vendor/gsap@3.12.5/gsap.min.js`, `vendor/firebase@12.19.0/firebase-{app,auth}.js`, `vendor/manifest.json` | new: GSAP and the Firebase Auth ES modules (the npm package's builds, the app's pinned version), with sizes, sha256 and every edit listed; no third-party script runs (review B3, 16 Oct 2026) | R19, R45 |
| `agent-office/public/app/office.js`, `agent-office/public/app/sources.js` | new: the mock's module moved out of the page so the CSP needs no hash for it; the R58 formatter shared with `lib/sources.mjs` | R0, R58 |
| `agent-office/public/_headers` | new: a strict CSP (`default-src 'self'`, inline blocks by sha256, no `unsafe-inline` or `unsafe-eval`; `wasm-unsafe-eval` for three's meshopt decoder; the Firebase Auth hosts of the app's own CSP in `firebase.json`; `open.er-api.com`) | R41, R43, R45 |
| `scripts/agent-office-config.mjs` + `scripts/lib/agent-office.mjs` + `.test.mjs` | new: write `agent-office/wrangler.toml` per environment (project, `APP_ORIGIN`, `FIREBASE_PROJECT_ID`) with plain variables only, and `public/version.txt` with the sha | R41, R48, R65 |
| `scripts/agent-office-split-assets.mjs` + `.test.mjs` | new: one-off extractor from the mock file to `public/assets/` with a manifest and sizes | R19 |
| `.github/workflows/deploy-agent-office.yml` | new: tests, then staging on push of `main` touching `agent-office/**`; production by `workflow_dispatch` with a sha already on staging; snapshot refresh on issue events and agent workflow completions, redeploying each environment's own sha | R41, R46, R47, R65 |
| `scripts/lib/agent-office-workflow.test.mjs` | new: the workflow-security test of T20 | R41, R46, R65 |
| `tests/agent-office/parity.spec.ts` | new: compares the listed mock ids between mock and live page, 3 widths × 2 themes | R15 to R39 |
| `tests/agent-office/staging.spec.ts` | new: idle-state and sign-in checks on the staging URL | R10, R45 |
| `scripts/agent/usage-marker.mjs` + `scripts/lib/agent-usage-marker.test.mjs` (tests live in `scripts/lib/`, the one folder CI's script runner reads, `scripts/lib/test-reach.mjs`) | new, pure: execution file JSON → usage marker JSON (last `result` message; token counts; `costUsd`; `missing` list); never returns transcript text | R50, R59 |
| `scripts/agent/cli.mjs` | add commands `usage-marker <execution_file>` (reads the file, fetches the FX rate, prints the marker line only, exits 0) and `usage-check <work\|review> <line>` (re-checks a line with `checkMarkerLine`, prints it re-serialised or exits 1 naming only the reason) | R50, R59 |
| `.github/workflows/agent.yml` | give both `claude-code-action` steps an `id` (`work`, `review`); right after each job's first checkout (`main`) and before the work step or the reviewer, a step copies `scripts/agent/usage-marker.mjs` to `$RUNNER_TEMP/agent-office-usage/`; after each action, a step with `if: always() && steps.<id>.outcome != 'skipped'` and no token runs that copy on the `execution_file` output, falls back by an explicit `if` branch to the `missing: ["parser"]` marker and exits 0, and writes the line to a job output (`usage_work`, `usage_review`); the review job also outputs `head_sha`; a new `usage` job (needs dispatch, agent, review; `permissions: {}`; ubuntu-latest) checks out `main`, mints an issues-only App token, and posts each line `usage-check` prints with the run's own head sha; no upload, no `cat` of the file, no `continue-on-error` | R50, R59 |
| `scripts/agent/usage-limits.json` | new: the R59 ceilings (tokens and USD per step) with their source | R59 |
| agent prompt in `agent.yml` and Plan A "Gates" text | the `plan` step's prompt asks the PO to compute the R60 facts, set one `size:*` label and post the size marker before Gate 1 | R60 |
| `scripts/lib/e2e-status.mjs` + `.test.mjs` | new, pure: `summarize()` result → status description JSON (≤140 characters), state, and the one POST request | R57 |
| `scripts/e2e-status.mjs` | new: reads `e2e-report/index.html` as `e2e-slack-report.mjs send` does and POSTs the status with the job's `github.token` | R57 |
| `agent-office/lib/history.mjs` + `scripts/lib/agent-office-history.test.mjs` (kept in `scripts/lib/`, read by the config job's `node --test scripts/lib/*.test.mjs`, `scripts/lib/test-reach.mjs`) | new (main thread, 16 Oct 2026: kept apart from L2's `github.mjs`): the history reads of "Polling and the free quotas" through L2's `get(path)`, the 10-minute cache, final issues, completed runs' jobs and finished release shas' statuses kept and never re-read; `acceptedUsageMarkers` counts a marker only when its run's "Agent usage" job succeeded in that attempt, de-duplicated by run, attempt and step | R50 to R63, R43, R47, R59 |
| `scripts/agent/gates.mjs` | `parseSizeMarker`, and `gateState(..., { requireSize })` that holds `/approve-plan` until the App's size marker precedes it and returns the size that counted; `cli.mjs gateSummary` passes `requireSize: true` | R60 |
| `.github/workflows/ci.yml` | the "Post the result and the report to Slack" job also sets commit status `agent-office/e2e` on the sha (needs `statuses: write` on that job only) | R57 |
| `agent-office/lib/size.mjs` + `.test.mjs` | new, pure: plan facts → score → size; Gate-1-time label from the timeline | R32, R60 |
| `agent-office/lib/economy.mjs` + `.test.mjs` | new, pure: AI cost, cache saving, income, bonuses, missions, streak, ledger with Head's payments | R51 to R56 |
| `agent-office/lib/office.mjs` + `.test.mjs` | new, pure: the four daily lines, the daily bill, the disjoint-inputs check | R61 to R63 |
| `agent-office/lib/sources.mjs` + `.test.mjs` | new, pure: the R58 source line of every number (fact name, ids, time) | R0, R58 |
| `agent-office/lib/cost-method.mjs` + `.test.mjs` | new, pure: config → the entries of the "ที่มาของค่าใช้จ่าย" panel (input, where read, formula, each rate with its origin); the page renders only this output | R62, R64 |
| `docs/DECISION_LOG.md`, `docs/RISK_REGISTER.md`, `docs/wayfinder/agent-office/MAP.md` | update: decisions of this plan; R84/R85 note that the page leaves the prototype; MAP decisions | hard constraint 9 |

Nothing under `src/`, `functions/` (the Jira proxy), `mockup/` or `firestore.rules` changes. Two
existing workflows change, each by one added step: `agent.yml` (usage capture, R50) and `ci.yml`
(E2E status, R57); both are covered by `scripts/lib/workflow-security.test.mjs`. The new function
imports two existing modules read only; if either one's export shape changes later, the
agent-office tests fail first.

## Data shapes

`agent-office/projects.config.json`:

```json
{
  "version": 1,
  "projects": [
    {
      "id": "taskfolio",
      "name": "Taskfolio",
      "tag": "ครบวงจร",
      "description": "ดูแลครบวงจร ตั้งแต่รับ feedback ...",
      "key": "#{n}",
      "source": { "kind": "github-labels", "repo": "Thitic9203/pluton-timesheet", "labelPrefix": "agent:", "releaseBranch": "release/next" }
    },
    {
      "id": "ols",
      "name": "OLS",
      "tag": "งาน QA Automate testing",
      "description": "ดูแลงาน QA ของ ticket ...",
      "key": "OLS-{n}",
      "source": { "kind": "none" }
    }
  ],
  "roster": [
    { "role": "head" }, { "role": "po" }, { "role": "ba" }, { "role": "dev" }, { "role": "dev" },
    { "role": "dev" }, { "role": "qa" }, { "role": "tl" }, { "role": "tl" }, { "role": "qal" }
  ],
  "roles": {
    "head": { "label": "Head", "color": "#2f4858", "duty": "...", "own": "...", "rank": 1 }
  },
  "prices": { "model": "Claude Opus 5.5", "input": 4, "cacheRead": 0.2, "output": 20, "unit": "USD per 1M tokens", "source": "claude-api skill, 6 Oct 2026" },
  "buildLimit": 3,
  "releaseBatch": 10,
  "economyStart": "2026-10-20",
  "tiers": { "S": 300, "M": 800, "L": 2000, "XL": 5000, "source": "Plan B §7.2" },
  "bonusCapPct": 60,
  "sizing": {
    "weights": { "rule": 1, "file": 1, "riskFlag": 5 },
    "thresholds": { "S": 6, "M": 15, "L": 30 },
    "budgetTokens": { "S": 1920000, "M": 5240000, "L": 11750000, "XL": 29100000 },
    "source": "R60; Plan B §2 budget_tokens; decided by the main thread 16 Oct 2026, owner may overrule"
  },
  "missions": {
    "streak": { "3": 300, "7": 1000 }, "weeklyXl": 1000, "weeklyNoOvernightDebt": 1000,
    "daily": { "easy": 200, "medium": 350, "hard": 500 },
    "dailyDifficulty": { "close2": "hard", "noBlocked": "medium", "cache70": "medium", "payoff": "easy" },
    "thresholds": { "closesPerDay": 2, "cacheReadPct": 70, "leanTokensPerHour": 300000 },
    "live": { "order": ["ciFirst", "reviewFirst", "close1", "lean"], "rewards": { "ciFirst": 250, "reviewFirst": 150, "close1": 300, "lean": 200 } },
    "weekStart": "monday",
    "origin": { "...": "one origin per constant" }
  },
  "office": {
    "workflows": ["agent.yml", "agent-release.yml", "agent-sweep.yml", "agent-main-audit.yml"],
    "prices": {
      "actionsMinute": { "value": 0.006, "unit": "USD per minute", "label": "Linux 2-core x64 (GitHub-hosted)", "url": "https://docs.github.com/en/billing/reference/actions-runner-pricing", "fetched": "2026-10-16" },
      "freeMinutesPerMonth": { "value": 2000, "unit": "minutes per month", "label": "GitHub Free", "url": "https://docs.github.com/en/billing/concepts/product-billing/github-actions", "fetched": "2026-10-16" },
      "workersRequestsPerMillion": { "value": 0.3, "unit": "USD per million requests", "label": "Workers paid, additional requests", "url": "https://developers.cloudflare.com/workers/platform/pricing/", "fetched": "2026-10-16" }
    },
    "supplies": { "menuFile": "supplies-menu.json", "breakfastBeforeHour": 11, "triggers": { "activeAgentDays": ["breakfast", "lunch/dinner"], "runsStarted": ["drink"], "reviewRuns": ["snack", "dessert"], "issuesClosed": ["dessert"] } }
  }
}
```

`office` (R61, owner popups 16 Oct 2026 about 00:15): every price is `{value, unit, url, fetched}`
and the validator refuses one without `url` (https) and `fetched` (YYYY-MM-DD), or naming the mock.
The menu is `agent-office/supplies-menu.json` (owner, 17 Oct 2026): `credit` (Sims Wiki URLs,
CC BY-SA 3.0), `priceLink` (Numbeo, linked back as its terms require), `mapping` (how bar drinks map
to beer, wine, mocktail, spirits or cocktail), `prices` (each `{value, unit, item, url, fetched}`,
`value` null only with `pending: true`) and `items` (`{name, group, category, price}`, 549 rows). The
item of a count is `items_of_group[(dayNumber × 97 + (slot + 1) × 13 + counter) mod size]`, so a
day always gives the same items and every item comes round.

`economyStart` is a placeholder in this example: the real date is written by the pull request that
turns the agent on. The mission constants follow the owner answers to Q18 to Q20 (16 Oct 2026);
the validator accepts `null` nowhere.

Usage marker (R50), one comment per agent run, posted by the agent App:

```
<!-- agent-office:usage {"v":1,"issue":501,"run_id":0,"run_attempt":1,"job":"agent","step":"work","sha":"…","at":"…","model":"…","input":0,"cacheRead":0,"cacheWrite":0,"output":0,"costUsd":0,"fxRate":0,"fxAt":"…"} -->
```

Size marker (R60), posted by the PO step with the label:

```
<!-- agent-office:size {"v":1,"size":"M","rules":6,"files":4,"risk":["ui"],"score":15} -->
```

E2E status (R57): context `agent-office/e2e`, state `success` or `failure` (or `error` with no
report), description `{"p":120,"f":3,"k":2,"s":5,"t":130}` (passed, failed, flaky, skipped, total);
with no report the description is `{"missing":"report"}`. `failure` when `f` > 0, else `success`.

The roster and roles are copied from v61 `CONFIG.team` and `ROLES` (one team, Plan B §2a). `buildLimit`
and `releaseBatch` carry their sources in the config test (Plan A Q2; release.mjs `BATCH_SIZE`).

`GET /api/office/state` response. Each issue's `key` is `issueKey(projects, project, n)` of `lib/derive.mjs`, so
the page holds no key rule of its own (review N8, 16 Oct 2026):

```json
{
  "readAt": "2026-10-16T11:45:00Z",
  "agentEnabled": false,
  "projects": [{ "id": "taskfolio", "count": 0, "source": "github-labels", "release": { "phase": "collect", "queued": 0, "batch": 10 } },
               { "id": "ols", "count": null, "source": "none" }],
  "issues": [{ "project": "taskfolio", "n": 501, "key": "#501", "title": "...", "lane": "building", "from": null, "improvement": false, "createdAt": "...", "url": "https://github.com/..." }],
  "people": [{ "slot": 0, "role": "dev", "state": "working", "issue": 501, "release": null }],
  "summary": { "working": 0, "waiting": 0, "blocked": 0, "idle": 10 },
  "cap": { "building": 0, "limit": 3, "queued": 0, "total": 0 },
  "warnings": []
}
```

The response also carries a `money` block: `fund`, `aiOwed`, `aiPaid`, `officeOwed`, `saved`,
`tokens` (input, cacheRead, cacheWrite, output), `costThb`, `office` (today's running lines and the
last cut bill), `paid` (latest income entries with their bonuses), `missions` (with progress), and a
`sources` map giving every number its R58 line (fact, ids, time). `null` means "no source" and
renders as R40's text, never as 0.
T37 re-prices the office lines (R61): `office.today` holds `elec {minutes, usd, thb}`, `water
{minutes, usd, thb}`, `net {requests, usd, thb}`, `sup {items, thb}`, each `thb` null without a
rate or a source, and `quota {month, minutes, free}`. The panel rows (`costMethod`) fill the page's
four slots in R64's column order: `input` = what it counts, `where` = formula, `formula` = price
with source and date, `rates` = one entry for today's figure. The Pages Function request counts come
from Cloudflare's GraphQL Analytics API (one POST per snapshot, `agent-office/lib/cloudflare.mjs`,
fail closed to null), and the snapshot reads open.er-api.com once for days with no marker rate.
T36 builds it in `agent-office/lib/money.mjs` from the T33 history (read with `e2e: false`) and adds
`prices`, `tiers`, `costMethod` (the panel rows), `reads` (history GETs of that snapshot) and its
own `warnings`. While the agent is off, without `AGENT_APP_LOGIN`, or before `economyStart`,
nothing is read and the ledger fields are `null`; the config facts keep their source.

## Hosting layout

- `agent-office/` is its own Pages project root: `wrangler pages deploy public` run with the working
  directory `agent-office/`, so its `functions/` folder is the one bundled. The Jira proxy's
  root-level `functions/` is untouched and never deployed to these projects.
- Each project deploys to its `main` branch (its production environment), since
  `wrangler pages secret put` has no `--env`; this is the reason recorded in
  `deploy-jira-proxy.yml` lines 12 to 16, reused.
- No secret on either Pages project. Plain variables, written by
  `scripts/agent-office-config.mjs`: `APP_ORIGIN` (`https://agent-office-staging.pages.dev` or
  `https://agent-office-prod.pages.dev`) and `FIREBASE_PROJECT_ID` (`taskfolio-staging` or
  `taskfolio-prod`, the same ids as `scripts/lib/jira-proxy.mjs`).
- Deploy credentials: the Jira proxy's existing GitHub environment secrets, reused (owner, 16 Oct
  2026, popup: "ใช้ token เดิม ขยายเทสต์ให้ job นี้อ่านได้"; DECISION_LOG "Agent Office deploy reuses
  the Cloudflare Pages tokens"): `CLOUDFLARE_API_TOKEN_STAGING` (environment `staging`), read only
  by the `staging` and `refresh-staging` jobs, and `CLOUDFLARE_API_TOKEN_PROD` (environment
  `production`), read only by the `production` and `refresh-production` jobs.
  `scripts/lib/workflow-security.test.mjs` names exactly those readers beside the proxy's jobs, and
  refuses any other. Each token now reaches two projects, so a leak reaches both: RISK_REGISTER R97.
- GitHub reads: the workflow's own `GITHUB_TOKEN`, read scopes only (R41). Nothing for the owner
  to create.
- Firebase Auth: both `pages.dev` hostnames are added to the authorized domains of their Firebase
  project (owner action, free, task T3).
- The workflow runs its jobs on the runner rule `deploy-jira-proxy.yml` uses, and starts only on
  `agent-office/**` and its own scripts, so a docs push starts nothing.

## Carrying the 3D page over

- v61 is one HTML file of 9,593,640 bytes, of which the markup and code are about 768 KB once the
  base64 blobs are removed (measured in this session with a script that replaced every run of 400 or
  more base64 characters). The owner's page budget is about 15 MB (Plan B §9a, popup 14 Oct 2026).
- **Chosen: split the blobs into files** under `public/assets/` with a manifest. Pages serves static
  assets free and unlimited (V1 S11); the browser caches them; the HTML stays small enough to diff
  and review; a single model can be replaced (R84, R85) without touching the page.
- **three.js r170 (`three@0.170.0`)** stays at the mock's version. Chosen: copy the exact files the
  import map uses into `public/vendor/three@0.170.0/` so the page has no third-party script at run
  time and a tight CSP; GSAP 3.12.5 likewise. Alternative kept open: the mock's jsDelivr and cdnjs
  URLs, which need no copy but put two CDNs in the CSP.
- The simulation is removed in code, not hidden: `step`, `sweepTick`, `releaseStep`, `accrue`,
  `accrueUtil`, `headPays`, `headPaysExp`, `checkMissions`, `payout`, the seed tables and the
  `simulate` flag go; `assign` is replaced by `derive.mjs`; render functions stay and read the JSON.

## Polling and the free quotas

- Page: one request per 60 s per visible tab (R11), a static file behind the middleware. GitHub is
  read only when the workflow runs (R65): on a deploy, an issue event or an agent workflow
  completion, never per page view.
- One GitHub read is about: 1 list of open issues (paged per 100), 1 timeline per blocked issue,
  1 list of closed PRs into `release/next` since the last production run, 1 list of in-progress runs
  of `deploy-production.yml` and `agent-sweep.yml`, 1 read of the `AGENT_ENABLED` variable. At 10
  blocked issues that is about 15 calls per snapshot. `GITHUB_TOKEN` allows 1,000 requests an hour
  per repository (GitHub docs, "Rate limits for the REST API", not re-read in this session:
  UNVERIFIED), so about 60 snapshots an hour; the refresh's concurrency group keeps only the latest
  event, so bursts of label changes collapse. If the 403 or 429 rate-limit answer appears, E1 holds.
- Actions minutes: every job runs on the guarded runner form, so on the Mac (`vars.RUNNER`), with no
  hosted minutes. Pages deployments: two per refresh (Q21).
- Function requests: 10 viewers × 60 per hour × 24 = 14,400 a day, inside the 100,000 a day of the
  Workers free quota (V1 S11). Static assets are free (V1 S11).
- Exchange rate: one fetch an hour from the browser, as the mock already does (Plan B §6), and one
  fetch per agent run in the usage step (R50).
- Money and office (R50 to R63) need history, not only open issues: closed agent issues since
  `economyStart`, their comments (markers, gate commands), reviews and check runs of their pull
  requests, jobs of the agent workflows, and commit statuses of release shas. This part is computed
  separately and cached 10 minutes, and each issue that is closed and whose bill days are cut is
  final, so its derived figures are cached by issue number and never re-read. A week of 20 issues
  is about 20 × 4 reads once, then only the open ones.
- Rate limit evidence for the size of this: none yet; T33 measures calls per read on staging and the
  number goes into this plan.

## Libraries and cost (free tier only)

- three.js 0.170.0 (MIT), GSAP 3.12.5 (free licence), both already in the mock.
- Firebase Auth web SDK for sign-in: already a dependency of the app; the same version is copied.
- wrangler: the version `package.json` already pins.
- Cloudflare Pages and Functions free plan; GitHub API with the owner's token; open.er-api.com
  free with no key. No new paid service (hard constraint 1).

## Alternatives weighed, and the choice

| Concern | Options | Chosen and why |
| :--- | :--- | :--- |
| Where it lives | Claude artifact; GitHub Pages; Firebase Hosting; Cloudflare Pages + Function | Cloudflare Pages + Function: V1's recommendation and the owner's approval of 16 Oct 2026; the artifact cannot be fed by Actions (V1), GitHub Pages is public (V1 S2, S3) |
| How state arrives | Browser calls GitHub with a token; a workflow writes a JSON snapshot to the site; a Function reads GitHub on request | Workflow snapshot (main thread design change, 16 Oct 2026): no GitHub credential outside Actions at all (R41), the Function stays a pure caller check, and the derive libraries (which import `scripts/agent/*.mjs` and `node:crypto`) run in Node, not in the Worker. Cost: freshness is per event, not per minute; runs on the Mac, so no hosted minutes |
| Where the roster lives | Firestore with rules; the artifact `db`; the config file | Config file: the owner's decision of 16 Oct 2026 |
| Assets | Keep one 9.6 MB file; split into files | Split, see above |
| Freshness | Webhook push; polling | Polling 60 s: no new endpoint that GitHub writes to, so the function stays GET-only (R43) |
| Code sharing with the Jira proxy | Copy the verifier; import it | Import: one verifier, one set of tests (memory "No logic conflict") |
| Where usage is stored | upload the execution file as an artifact; a data file committed by the workflow; one marker comment on the issue | Marker comment: the function already reads issue comments, it needs no `contents: write`, the transcript never leaves the runner, and only numbers are published |
| Which cost figure | tokens × the config prices; the action's `total_cost_usd` | `total_cost_usd`: the run's own computation, which covers cache writes and any second model; tokens are still shown, and the rate card is a reference (R14). Whether the field is filled when the action runs on `CLAUDE_CODE_OAUTH_TOKEN` is UNVERIFIED until T24 reads a real run; if it is empty, a spec change picks tokens × prices |
| Where E2E counts are stored | a comment on every issue of the round; an artifact the function unzips; a commit status | Commit status: one per round sha, readable with one GET, no unzip library in the Worker |
| Size | a person sizes by feel; sized from measured plan facts | Measured facts with published method (R60): reproducible, so it can be checked |
| Supplies input | tokens (as the mock's burn did); working days | Working days: the owner ruled tokens out to avoid charging twice (R62) |

## What could break (hard constraint 5)

- **The Jira proxy.** It shares no project, secret or deploy job; the new function only imports
  `src/services/jiraAuth.ts` and `src/services/jiraCors.ts`. A change to those modules' exports would
  break both; their existing tests plus the new ones catch it.
- **CI rounds and budget.** Code that reaches `main` is a round under hard constraint 19 and needs
  `round.mjs --open`; the new workflow's path filter keeps it off unrelated pushes. The spec folder
  itself is docs only.
- **The Mac runner.** The new workflow follows the same runner rule as the proxy, so it competes for
  the Mac; it runs only on `agent-office/**` changes.
- **The mock artifact.** R44 edits the mock before code; a republish over the wrong artifact would
  lose v61. The edit goes over `Wp7pFHwNt9jDjkPZPctVjG` only, with a `read` before it.
- **Licences.** Moving the page from a private artifact to a hosted page widens who can see the
  models; R84 (HY-Motion, territory clause) and R85 (CC-BY attribution) are reviewed before
  production, and the credits stay (R37).
- **Firebase.** Adding authorized domains is the only change to the Firebase projects; no rules or
  data change. Q13 decides whether the function reads `users/{uid}` (as `verifiedRequest.ts` does).
- **Token scope.** The snapshot job's `GITHUB_TOKEN` carries read scopes only (`permissions:` on the
  job, asserted by the T20 test), and R43's test asserts the client only issues GET.
- **A refresh deploying code.** A refresh deploys the sha each environment already serves, read from
  its `version.txt`; if that file is missing (the first deploy has not happened) the refresh for that
  environment stops without publishing, so a refresh never puts untested code on production. A
  served sha is public content, so before the checkout each refresh job runs the `verify` job's
  compare-on-main check on it (40 hex, then `gh api repos/$REPO/compare/$SHA...main` answering
  `ahead` or `identical`), in its own step holding only `GH_TOKEN` (the job's read-only token) and
  the sha through `env`, never the Cloudflare token; a sha not on `main` fails the job before
  anything is checked out or published (R65, review finding N1, 16 Oct 2026). Alternative weighed:
  also requiring a successful staging publish of that sha, as `verify` does; not taken, since the
  sha staging serves may come from a run still finishing, and the sha production serves already
  passed `verify` when it was published. The compare needs no new permission (`contents: read`).
- **`agent.yml` and `ci.yml`.** The usage step runs with `if: always()`, so a failure there must not
  turn a green agent run red: it reports its own failure in the marker's `missing` list and exits 0.
  It must never print the execution file, which holds the transcript and possibly secrets read by
  the agent; the workflow-security test asserts it. The `ci.yml` change adds `statuses: write` to one
  job; nothing else in that job changes. Both changes are rounds under hard constraint 19, and the
  agent workflow is inert until `AGENT_ENABLED` is set, so the usage step first runs on the first
  real agent issue.
- **Size labels.** New labels `size:S` to `size:XL` are created in the repository (T29 lists them for
  the owner, since creating labels is a change others see, global CLAUDE.md rule 23).
- **Economy history.** A bug in a pure formula changes past figures on the next read; every formula
  has fixture tests, and a change to one is a spec change first.
