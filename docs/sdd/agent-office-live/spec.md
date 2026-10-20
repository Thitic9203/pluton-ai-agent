# Agent Office live page: spec

Status: draft · Slug: `agent-office-live` · Written 16 Oct 2026

Owner sources (owner, 16 Oct 2026, popup):

- "เอาตาม mock เป๊ะ แต่เป็นงานของจริง", "ใช้งานได้จริง": the live page looks and behaves exactly like the
  mock artifact https://claude.ai/artifact/Wp7pFHwNt9jDjkPZPctVjG (version 61), but shows real agent
  work, not a simulation.
- Projects: "เหมือน mock เป๊ะ": the same project layout and switching the mock has.
- Roster: one team for every project; the roles are those of
  `docs/superpowers/plans/agent-workflow-and-economy.md` §2a.
- Config: a file in the repo, edited by pull request.
- Hosting: two free Cloudflare Pages projects, `agent-office-staging` and `agent-office-prod`, plus a
  read-only GitHub token the owner places himself. Spec first, then creation.

Owner answers to this spec's questions (owner, 16 Oct 2026, popup):

- Q13 who may open the page: "ทุกคนที่ active ใน Taskfolio" (R42).
- Q10 demo mode: "ตัดทิ้งทั้งหมด" (R29, R49).
- Q11 issue size: first "ไม่แสดงขนาด", then reversed the same day: "ไซส์งานก็ลองใช้หลักการมาตรฐานสากล
  จัดการมาได้เลย แต่ต้องมีบอกไว้" (R32, R60).
- Q4 office costs: first "เดี๋ยวบอก", then answered the same day: a game economy whose inputs are real
  agent activity and whose rates are game constants in the config, taken from mock v61; supplies
  counted by "วันทำงานจริงต่อคน", never by tokens, because tokens are already the AI cost
  ("ค่าเสบียงต้องเอามาจากอย่างอื่น … เหมือนคิดค่าใช้จ่ายเบิ้ล") (R61 to R63).
  Revised by the owner's popups of 16 Oct 2026 about 00:15: the four lines are priced on the real
  resources the agents use (GitHub-hosted job minutes, rework minutes, Pages Function requests), each
  at a provider's published price with its link and date, the list price shown with the free quota;
  ค่าเสบียง is real food and drink from a menu driven by real activity: The Sims 4 names priced from
  Numbeo, The Economist, Starbucks Thailand and hotel menus, alcohol included (owner, 17 Oct 2026) (R61, R64).
- Q7 casual speech: allowed, but a line must never state a work fact that is not real (R21).
- Q18 daily mission rewards: by difficulty, ฿200 / ฿350 / ฿500, config constants (R55).
- Q19 live missions: rotate hourly in a fixed order, deterministic from the Bangkok hour, never
  random (R55).
- Q20 weekly missions: the week starts on Monday, Asia/Bangkok (R55).

Owner correction (owner, 16 Oct 2026): "แต่มันต้องมีการคำนวณมีที่มาจริง", "ไม่ใช่ค่ามโน". The money and
progress figures of the mock (AI cost and tokens, team fund, bonuses, missions, regression
progress) must be real computed values with a recorded source. Showing "ยังไม่มีแหล่งข้อมูล" forever
is not acceptable, and neither is an invented value. This replaces the first draft's decisions on
Q2, Q3, Q5 and Q12: those figures are now computed by R50 to R58, and the data they need is captured
by new workflow steps (`tasks.md` T24 to T34).

Decided by the main thread 16 Oct 2026 on the source named in each rule; owner may overrule: Q1 (R2,
R31), Q6 (R7), Q8 (R23), Q9 (R28), Q14 (R44), Q15 (E4), Q16 (R29), and the parts of R36, R54 and
R60 marked "decided by the main thread".

Other sources cited below:

- **Mock v61**: `index.html` of the artifact above, read in this session from the local copy
  `scratchpad/hymotion/v61/index.html` (title "AI Agent Home Office"). Line numbers below are of
  that file with its embedded base64 blobs removed; they locate code, they are not a contract.
- **Plan A**: `docs/superpowers/plans/always-on-dev-agent.md` (label table, gates, `AGENT_ENABLED`).
- **Plan B**: `docs/superpowers/plans/agent-workflow-and-economy.md` (§2 stages, §2a roles, §2b
  release, §6 observability, §7 economy, §9 prototype).
- **V1**: `docs/wayfinder/agent-office/research/V1-hosting-and-live-data.md`.
- **MAP**: `docs/wayfinder/agent-office/MAP.md` ("Out of scope": the page is read only; approvals
  stay in GitHub).
- **release.mjs**: `scripts/agent/release.mjs` (`release/next`, `agent:on-test-env`,
  `release:batch-ready`, batch of 10).
- **CLAUDE.md**: "Jira access", hard constraints 1, 2, 3, 22; live-board rule "ส่วนที่ไม่มีแหล่งคำนวณ
  ห้ามขึ้นเป็นตัวเลข" (global CLAUDE.md rule 20).
- **RISK_REGISTER** R84 (HY-Motion clips, SMPL-H licence) and R85 (CC-BY car models, attribution).

## The one law of this page

- **R0.** When the page shows any number, count, percentage, amount, status or name of work, the
  system must have computed it from a real source named in this spec (GitHub labels, issue and pull
  request events, the `release/next` branch, Actions runs, the config file, the clock, or the
  exchange-rate API), and must not show any hard-coded, seeded, random or simulated value as if it
  were real. Every computed number carries its source and the time of its data (R58). Where a mock
  element has no real source yet, the element keeps its place and its look but shows the no-source
  text of R40 instead of a value; that is allowed only while an open question of this spec names the
  missing input, never as a standing state. Source: owner, 16 Oct 2026, popup ("เป็นงานของจริง");
  owner correction 16 Oct 2026 ("ต้องมีการคำนวณมีที่มาจริง", "ไม่ใช่ค่ามโน"); global CLAUDE.md rule 20
  "ส่วนที่ไม่มีแหล่งคำนวณห้ามขึ้นเป็นตัวเลข".

## Rules: data the page reads

- **R1. Config file.** When the page or its function starts, the system must read
  `agent-office/projects.config.json` (shape in `plan.md`) for: the projects (id, display name,
  short description, card key format, source kind and repo, label prefix), the one roster (a list of
  role keys with an optional duty text per person), and the role catalogue (label, colour, duty,
  standing duty) of §2a. A config that fails validation must stop the build, never fall back to
  defaults. Edits go through a pull request only. Source: owner, 16 Oct 2026, popup (config file by
  PR; one team for every project; §2a roles); V1 "Recommendation" (`projects.config.json`).
- **R2. Open issues by label.** When the function is asked for state, it must read every open issue
  of each `github-labels` project that carries a label starting with the project's prefix (`agent:`),
  and map it to a lane by this table, and by nothing else. Source: Plan A "Tag / Filter convention";
  mock v61 `LANES` (line 576).

  | Label (Plan A) | Lane in the mock | Role holding it | Kind |
  | :--- | :--- | :--- | :--- |
  | `agent:ready` | `ready` "PO จัดลำดับ ตั้งขอบเขต + AC" | PO | work |
  | `agent:planning` | `planning` "plan รอเจ้าของ", Gate 1 | BA | wait |
  | `agent:test-planning` | `test-planning` "test plan รอเจ้าของ", Gate 2 | QA Lead | wait |
  | `agent:queued` | `queued` "รอคิว" | none | idle |
  | `agent:building` | `building` "เขียนโค้ด + รีวิวแยก" | Dev | work |
  | `agent:in-review` | `in-review` "Tech Lead รีวิว PR" | Tech Lead | work |
  | `agent:merging` | `merging` "ผ่าน แล้ว merge เอง" | Tech Lead | work |
  | merged into `release/next`, not yet on staging (R3) | `release-queue` "รอรวมรอบ release" | none | idle |
  | `agent:on-test-env` | `on-test-env` "อยู่ในรอบ release" | QA Lead and QA | work |
  | `agent:blocked` | `blocked` "ติดปัญหา" | the role of the step it left (R4) | block |

  An issue carrying two state labels at once must be shown in the lane latest in this table's order
  and logged as a data warning in the response; it must not be counted twice. The mock's BA
  `analysis` lane ("BA วิเคราะห์ requirement เขียน plan") has no label, so the live board must not
  show it; BA holds `agent:planning` only, until the agent posts a label or marker for that step.
  This is Q1, decided by the main thread 16 Oct 2026 on Plan A label table (no such label) and R0;
  owner may overrule.
- **R3. Release queue.** When an issue's agent pull request (head `agent/issue-N`) is merged into
  `release/next` and the issue does not carry `agent:on-test-env`, the system must place it in the
  `release-queue` lane, counted per project. The release card's "รอครบ n/10" uses that count and
  the batch size 10. Source: release.mjs lines 5 to 11 and `BATCH_SIZE = 10` (line 23); Plan B §2b.
- **R4. Blocked issues.** When an issue carries `agent:blocked`, the system must show the step it
  was blocked at ("ติดที่ <lane>") from the issue's label history (the most recent state label
  removed before `agent:blocked` was added, read from the issue's timeline events). If the timeline
  has no earlier state label, it must show "ติดปัญหา" without a step and assign no role. Source:
  mock v61 `roleOf` and chip text (lines 662, 7160); GitHub issue timeline (labeled and unlabeled
  events).
- **R5. Who holds an issue.** When issues are assigned to figures, the system must give each issue
  to a person of its role in roster order, oldest issue (lowest `created_at`) first, one issue per
  person; an issue with no free person of its role shows "รอ <role> รับงาน" on its card. The
  assignment is a depiction of the pull rule, not a claim about which agent run did the work.
  Source: Plan B §2a "กติกาการหยิบงาน (pull): ... หยิบใบที่เก่าสุดในกล่องของตัวเอง"; mock v61 `assign`
  (line 665).
- **R6. Head.** When at least one issue is in a `wait` lane (Gate 1 or Gate 2), the Head figure must
  be in state "รอเจ้าของในห้องประชุม" and its card must say "ส่งเรื่องให้เจ้าของ n ใบ" with n counted
  from those issues; otherwise Head is idle. Source: Plan B §2a (Head: "ทุก gate ที่รอเจ้าของ"); mock
  v61 `assign` (line 665), `drawTeamList` (line 7089).
- **R7. People without an issue.** When a person holds no issue and is not in a release phase, the
  system must show them as "พักเบรก" (state `idle`) in the rest rooms, except while a run of
  `agent-sweep.yml` is in progress, when they show "ทำงาน · sweep" (state `sweeping`). It must not
  show "ทำงาน" or a standing duty as current work at any other time. Source: mock v61 `STATES.idle`
  "พักเบรก" (line 571); R0. The sweep part is Q6, decided by the main thread 16 Oct 2026 on Plan A
  row 16 (the sweep is the daily `agent-sweep.yml` workflow) and R0; owner may overrule.
- **R8. Release phases.** When `release:batch-ready` is on the queued issues of a project, its
  release card must show phase "QA Lead อนุมัติ deploy staging" and the QA Lead figure that phase;
  when issues carry `agent:on-test-env`, the phase is "อยู่ในรอบ release" held by QA Lead and QA;
  when a `deploy-production.yml` run started by the release workflow is in progress, the phase is
  "deploy production รอบ release". While the round's staging E2E run is in progress the phase reads
  "QA รัน regression" with no percentage; once it has finished, "QA รัน regression n%" shows the pass
  rate of R57. Source: release.mjs lines 6 to 16 and 22; Plan B §2b; mock v61 `releaseStep` (line
  8708); owner correction 16 Oct 2026.
- **R9. Improvement cards.** When an issue's title starts with `[Improvement]`, its card must carry
  the "Improvement" tag. Issues are never created by the page. Source: mock v61 chip code (line
  7145); global CLAUDE.md rule 24 (`[Improvement]` prefix).
- **R10. Agent disabled or idle.** When the repository variable `AGENT_ENABLED` is not `true`, or
  no open issue carries an `agent:` label, the page must show a true idle state: every figure
  "พักเบรก" in the rest rooms, every column "ไม่มีงาน" (Blocker: "ไม่มีงานที่ติดปัญหา"), the cap line
  "เขียนโค้ดพร้อมกัน 0/3 · รอคิว 0 · ทั้งหมด 0 ใบ", every release card "รอครบ 0/10", and, only when
  `AGENT_ENABLED` is not `true`, one line under the summary "agent ยังไม่เปิดใช้งาน". It must not run
  any simulation to fill the screen. Source: Plan A (every agent job carries
  `if: vars.AGENT_ENABLED == 'true'`, `agent.yml:5`); mock v61 empty texts (line 7116); R0.
- **R11. Freshness.** When state is shown, the page must show the time it was read ("อัปเดตล่าสุด
  <time>" in the Bangkok format of the clock) and re-read it at most every 60 seconds while the tab
  is visible, never while hidden. When a read fails, the page must keep the last good state, mark it
  "ข้อมูลล่าสุดเมื่อ <time> · อ่านไม่สำเร็จ" and must not invent a newer one. Source: V1 (live with no
  session running); global CLAUDE.md rule 20 (refresh, never publish a broken build); judgment on
  the 60 seconds, bounded by the rate limit in `plan.md`. The time shown is the snapshot's `readAt`
  (R65), the moment the workflow read GitHub, never the moment the page fetched the file.
- **R12. Clock.** The clock must show the Bangkok time as the mock does
  ("Fri 16 Oct 2026 6.45 PM"), refreshed every 30 seconds. Source: mock v61 `tick` (line 7229);
  CLAUDE.md Conventions (Asia/Bangkok).
- **R13. Exchange rate.** When the rate card is shown, the USD to THB rate must come from
  `https://open.er-api.com/v6/latest/USD`, refreshed hourly, with the time the API reports; when no
  fetch has succeeded the rate must show "ยังอ่านอัตราไม่ได้" rather than the mock's fallback 33.58.
  This live rate is for the rate card only; every cost already incurred uses the rate recorded with
  its run (R50, R51), so a new rate never revalues old cost. Source: Plan B §6 ("ค่าใช้จ่ายแต่ละช่วง
  คิดด้วยอัตรา ณ เวลานั้น ไม่ตีราคา ... เก่าใหม่"); mock v61 `refreshFx` (line 8807) and `FX_SNAPSHOT`
  (line 7306); R0.
- **R14. Token prices.** The rate card's prices per million tokens (input 4, cache read 0.20,
  output 20 USD, Claude Opus 5.5) must come from the config file, each with its source and date.
  Source: Plan B §6 ("claude-api skill, cached 6 Oct 2026"); mock v61 `RATE` (line 7303).

## Rules: what the page shows (every mock element)

Each rule names the mock element by its id in v61 and what feeds it live.

- **R15. Header.** `h1` "AI Agent Home Office" and the subtitle "ทีม AI agent รับงานจากหลายโปรเจกต์ ..."
  must render as in the mock, static text. Source: mock v61 markup.
- **R16. Summary** (`#summary`, `#summaryText`). "ทำงาน a · รอเจ้าของ b · ติด c · พัก d" with a, b, c,
  d counted from the people's states of R5 to R8 and R10. Source: mock v61 `drawTeamList` (line 7095).
- **R17. Money pills** (`#fund`, `#debtPill`, `#officePill`, and the HUD's `#hudFund`, `#hudDebt`).
  `#fund` and `#hudFund` show the fund balance of R56; `#debtPill`, `#debtChip`, `#debtHead` and
  `#hudDebt` show the AI cost owed of R56, with the chip "ชำระเรียบร้อยแล้ว" only when it is 0. Each
  carries its R58 source line. `#officePill`, `#officeChip`, `#officeHead` show the office cost owed
  of R63, with "ชำระเรียบร้อยแล้ว" only when it is 0. Source: owner correction and owner answer on
  office costs, 16 Oct 2026; Plan B §6, §7; mock v61 markup.
- **R18. Theme** (`#themeBtn`). Light and dark, the saved choice wins over the system, applied before
  first paint, `aria-pressed` on the toggle, every colour from a token. Source: mock v61 `setTheme`
  (line 7240); global CLAUDE.md rule 16.2.
- **R19. 3D stage** (`#stage`, `#scene3d`). The office, grounds, vehicles, weather and day/night
  scene of v61 must render unchanged; the figures are the roster of R1, each in the room its state
  puts it in (work lanes at the work zone, wait lanes in the meeting room, blocked at the desk with a
  warning tag, idle in the rest rooms), as the mock places them. Source: owner, 16 Oct 2026, popup
  ("ตาม mock เป๊ะ"); MAP "Destination"; V3 draft mapping table.
- **R20. Name tags** (`#tags`). One per person, "Role" or "Role - A/B" when a role has more than
  one person. Source: mock v61 `labelOf` (line 652); owner, 14 Oct 2026 (memory "Agent Office roles").
- **R21. Speech bubbles** (`#bubbles`). A bubble that states a fact about work (for example "หยิบ
  #501 เองเลย") must only appear when that fact happened in real state between two reads (an issue
  entering the person's lane). Flavour lines (small talk, time of day, weather) are rendered as in
  the mock, but a flavour line must never state a work fact (an issue, a count, a deploy, a result)
  that is not true in the current state. Source: mock v61 `say` and `assign` (lines 665, 8550); R0;
  owner, 16 Oct 2026, popup (Q7: casual speech allowed, never a work fact that is not real).
- **R22. Caption under the stage.** The mock's "ข้อมูลตัวอย่าง · แตะที่คนเพื่อสั่ง" must change to a
  caption that does not claim sample data or commands: "ข้อมูลจริงจาก GitHub · แตะที่คนเพื่อดูงาน".
  This is a mock change (R44). Source: R0; MAP "Out of scope" (no commands from this page).
- **R23. Person menu** (`#pie`). Tapping a person must open the mock's wheel. "ดูงาน <key>" must open
  the issue on GitHub in a new tab. The movement options of the mock (`ACTS`: เครื่องดื่ม, นวด,
  บีนแบ็ก, สะพาน, ท่าเรือ, ห้องประชุม, ชวนคุย, ทักคนเดินผ่าน) stay as in the mock; they move the
  figure on this screen only and change no data. The wheel must never change a label, comment or
  any GitHub state. Source: mock v61 `ACTS` comment (line 3970: "These move the figure in this page
  only"); MAP "Out of scope". Keeping them is Q8, decided by the main thread 16 Oct 2026 on mock v61
  line 3970; owner may overrule.
- **R24. Toast** (`#toast`). A toast that reports work (release ready, deploy done) appears only on
  a real state change between two reads. Source: mock v61 `releaseStep` toasts; R0.
- **R25. Stage tools.** `#soundBtn`, `#zoomIn`, `#zoomOut`, `#resetView`, `#fullBtn`, keyboard and
  drag controls, and the full-screen HUD (`#hud`, `#hudClock`, `#hudTeam`) behave as in the mock;
  `#hudTeam` uses the counts of R16. Source: mock v61 (lines 8530 to 8545).
- **R26. 2D fallback** (`#fallback`). When WebGL or three.js fails, the mock's fallback text shows
  and every panel below still works with live data. Source: mock v61 boot (line 8793).
- **R27. Tab "ทีมและงาน"** (`#tab-now`, `#teamList`). One card per person, sorted head, po, ba, tl,
  dev, qal, qa: swatch, name tag, status chip, "doing" line (`<key> · <lane>` or release phase or
  "ส่งเรื่องให้เจ้าของ n ใบ" or "พักเบรก"), duty from config, room. Source: mock v61 `drawTeamList`.
- **R28. Tab "จัดทีม"** (`#tab-team`, `#peopleList`, `#addBtn`). Shows the roster of the config
  grouped by role with member counts and duties, read only, with a link "แก้ทีมผ่าน pull request"
  to the config file on GitHub. The "+ เพิ่ม Dev" button (`#addBtn`), the role switch and the duty
  edit fields of the mock must not be rendered. Source: owner, 16 Oct 2026, popup (config file by
  PR, one team); MAP "Out of scope" (read only). Removing the controls is Q9, decided by the main
  thread 16 Oct 2026 on that popup; owner may overrule.
- **R29. Tab "ฉาก"** (`#tab-scene`). The time grid (ตามเวลาจริง, เช้า, บ่าย, เย็น, กลางคืน) and the
  weather grid (ฟ้าใส, ฝนตก, หิมะตก, ใบไม้ร่วง) work as in the mock and are per-viewer choices kept in
  local storage; "ตามเวลาจริง" follows the Bangkok hour. The weather stays a viewer's choice, not
  real weather (Q16, decided by the main thread 16 Oct 2026 on mock v61 `WEATHER`, line 724; owner
  may overrule). The "การจำลองงาน" switch (`#simBtn`) and its caption must not exist on any
  environment, staging included (R49). Source: mock v61 `applyScene`, `realSlot` (lines 7212, 7211);
  owner, 16 Oct 2026, popup (Q10 "ตัดทิ้งทั้งหมด"); R0, R10.
- **R30. Tab "โปรเจกต์"** (`#tab-projects`). One card per config project with its name, tag line and
  description from config, and "งานบนบอร์ดตอนนี้ n ใบ" counted from live issues of that project.
  Source: mock v61 `drawProjects` (line 7161); owner, 16 Oct 2026, popup ("เหมือน mock เป๊ะ").
- **R31. Flow board** (`#flowTitle`, `#flow`). Four columns as the mock: "PO · BA" (ready,
  planning; no analysis lane, R2), "Dev" (queued, building, in-review, merging), "QA" (test-planning,
  plus one release card per project), "Blocker" (blocked), each headed "<name> · n ใบ". A card shows
  the key (`#N` for Taskfolio, the project's key format otherwise), the project chip at the top
  right, the size of R32, the step, the "Gate 1"/"Gate 2" tag for wait lanes and the Improvement tag
  of R9.
  At most 7, 4 or 3 cards per column at ≥1025, 561 to 1024 and ≤560 px, then "+n ใบ". Source: mock
  v61 `TEAMS`, `drawFlow` (lines 7099 to 7160); owner, 14 Oct 2026 (project chip on every card).
- **R32. Size on a card.** A card shows the issue's size from its `size:S`, `size:M`, `size:L` or
  `size:XL` label (R60) as the mock does ("M · <step>"), and the size carries the "how sized" note of
  R60 as its R58 source line. An issue with no size label shows "ยังไม่ประเมินขนาด" in place of the
  size. The mock's seeded sizes (`SEED_SIZE`, line 648) are not used. Source: owner, 16 Oct 2026
  ("ไซส์งาน ... ต้องมีบอกไว้"); mock v61 chip text (line 7105 onward).
- **R33. Cap line** (`#cap`). "เขียนโค้ดพร้อมกัน n/3 · รอคิว q · ทั้งหมด t ใบ" with n the count of
  `agent:building`, q of `agent:queued`, t of all cards shown, and 3 the dispatcher limit; full style
  when n ≥ 3. Source: Plan A Decisions Q2 (limit 3); mock v61 (line 7155).
- **R34. Release cards.** One per project in the QA column: "รอบ release", project chip, holder or
  "รอครบ n/10", phase text and bar per R3 and R8; the bar is n/10 while collecting and full in the
  other phases. Source: mock v61 `drawFlow` release block; release.mjs.
- **R35. Flow caption.** The mock's caption under the board ("ป้าย Gate คืองานที่รอเจ้าของอนุมัติ ...")
  stays, static text. Source: mock v61 markup.
- **R36. Money section** (`#moneyTitle` and everything under it: `#kFund`, `#missions`, `#paid`,
  `#tiers`, `#debtVal`, `#paidOff`, `#saved`, `#expUtil`, `#expElec`, `#expWater`, `#expNet`,
  `#expSup`, `#expFood`, `#expDrink`, `#expSnack`, `#expOwe`, `#stockLine`, `#costTotal`, `#tokIn`,
  `#tokCache`, `#tokOut`, `#payDebt`). Keeps its layout. Income side: `#kFund` the fund balance
  (R56), `#missions` today's and this week's missions with their real progress (R55), `#paid` the
  latest income entries, each "issue · amount · bonuses" (R53, R54), `#tiers` the base amount table
  of R53. Expense side: `#debtVal` AI cost owed, `#paidOff` AI cost paid, `#saved` saved by cache
  (R52, R56), `#costTotal`, `#tokIn`, `#tokCache`, `#tokOut` the AI cost and token totals (R51).
  `#payDebt` is not rendered: payment is automatic (R56) and the page is read only (MAP "Out of
  scope"). Office block: `#expElec` electricity, `#expWater` water, `#expNet` internet (R61),
  `#expUtil` their sum, `#expSup` and `#expFood` supplies (R61; the menu's total, so `#expFood`
  equals `#expSup`), `#expOwe` the office cost owed (R63). `#expDrink`, `#expSnack` and `#stockLine`
  are not rendered: supplies are the menu of R61, not fridge orders, and no real input
  splits drinks or snacks or keeps a stock; the menu of R61 prices each item on its own trigger
  (owner popups, 16 Oct 2026 about 00:15). The mock's caption under the block changes to name
  the R61 inputs and the config constants (a mock change, R44). The rate card (`#rateModel`, `#rateCard`, `#fxVal`, `#fxWhen`) follows R13 and R14. Every number
  carries its R58 source line. Source: owner correction 16 Oct 2026; Plan B §6, §7.2 to §7.4b.
- **R37. Model credits.** The credits block of the mock, including the HY-Motion line, must stay
  visible on every environment, complete for every model on the page. Source: RISK_REGISTER R85
  (CC-BY attribution) and R84.
- **R38. Purpose caption.** Every chart, table and board keeps the mock's caption. Source: memory
  "Purpose caption every chart table" (owner); mock v61.
- **R39. Widths and themes.** The page must match the mock at ≥1280, 768 to 1024 and ≤430 px in
  both themes, with no horizontal scroll, tap targets ≥44 px, and text that wraps instead of
  overflowing. Source: global CLAUDE.md rules 16.3 and 19; memory "No h-scrollbar".
- **R40. No-source text.** Where a value has no source, the element shows "ยังไม่มีแหล่งข้อมูล" in
  the muted style, never "฿0", "0" or a dash that reads as zero. Source: R0; global CLAUDE.md rule 20.

## Rules: security and hosting

- **R41. Credential.** No GitHub token exists outside GitHub Actions: no Pages secret, no
  owner-made personal token. GitHub is read only by the snapshot step of R65, with the job's own
  `GITHUB_TOKEN` whose permissions are `contents: read`, `issues: read`, `pull-requests: read` and
  `actions: read` and nothing else; `AGENT_ENABLED` reaches the step as `vars.AGENT_ENABLED`, not by
  an API read. The token must never reach the snapshot file, the browser bundle, a response body, a
  log line or the repository. `wrangler.toml` holds plain variables only. Source: main thread design
  change, 16 Oct 2026 ("no GitHub token and no Pages secret; a snapshot workflow with GITHUB_TOKEN"),
  replacing the owner-placed read-only token of the first draft; CLAUDE.md hard constraint 2.
- **R42. Caller check.** Every request for the snapshot (`/data/*`) must carry a Firebase ID token that passes
  signature, issuer, audience, expiry and `email_verified` checks for the environment's Firebase
  project, using the same verifier as the Jira proxy (`verifyFirebaseIdToken` in
  `src/services/jiraAuth.ts`, called from `functions/_lib/verifiedRequest.ts`). Access is open to
  every account whose Taskfolio `users/{uid}` status is `active`, whatever its role, through
  `requireVerifiedCaller` (`functions/_lib/verifiedRequest.ts:75`), not the admin-only variants. A
  missing or bad token gets 401; a pending, deactivated or unknown account gets 403. Every allowed
  account sees the same read-only page. Source: owner, 16 Oct 2026, popup (Q13 "ทุกคนที่ active ใน
  Taskfolio"); V1 "Recommendation"; CLAUDE.md "Jira access".
- **R43. Read only, one origin.** The function is one middleware in front of `/data/*` that only
  checks the caller (R42) and then serves the static snapshot; it reads nothing else and holds no
  credential. It must answer `GET` (and the CORS `OPTIONS` preflight)
  only, 405 for every other method; the snapshot step must never call a GitHub write endpoint
  (its client issues GET only); the middleware must grant CORS
  only to the one origin of its own environment from the plain variable `APP_ORIGIN`, answering 500
  when that variable is missing or not one https origin, as `functions/api/jira/_middleware.ts` does.
  Source: CLAUDE.md "Jira access"; `functions/api/jira/_middleware.ts` lines 17 to 21.
- **R44. Mock first.** Every change of look or behaviour against v61 (R10 idle line, R11 freshness
  line, R22 caption, R28 read-only roster without its edit controls, R29 no simulation switch, R32
  size from its label with the R60 note, R36 office block without drinks, snacks and stock and with
  its new caption, R58 source lines, the R64 panel, R40 no-source text, the sign-in screen of R45) must be made in the mock and republished over the same artifact
  `Wp7pFHwNt9jDjkPZPctVjG` first, then the live page follows. Source: owner, 16 Oct 2026, popup
  ("ตาม mock เป๊ะ"); CLAUDE.md hard constraint 7 (the same rule, applied here to the Agent Office
  mock). That artifact is the Agent Office mock of record: Q14, decided by the main thread 16 Oct
  2026 on the owner's popup "ตาม mock เป๊ะ"; owner may overrule.
- **R45. Sign-in.** When no signed-in user is present, the page must show a sign-in screen (Google
  sign-in through Firebase Auth of the environment's Firebase project) and no live data. Source:
  R42; V1 (shell public, data only after the token check). The screen is not in v61: R44 applies.
- **R46. Staging first.** Every change deploys to `agent-office-staging` first and is verified
  there; production gets the same commit only by a manual run with a sha already on staging.
  Source: CLAUDE.md hard constraint 3; global CLAUDE.md rule 2; `deploy-jira-proxy.yml` pattern.
- **R47. Free tier only.** Hosting, function calls, GitHub API reads and the exchange-rate API must
  stay within their free quotas; anything that would cost money stops and goes to the owner with a
  figure. Source: CLAUDE.md hard constraint 1; owner, 16 Oct 2026, popup (free projects approved).
- **R48. Environments do not mix.** Staging reads the staging Firebase project and production the
  production one; each Pages project holds its own token secret and its own `APP_ORIGIN`. Source:
  global CLAUDE.md rule 1.
  - **R48a.** When any job of `deploy-agent-office.yml` publishes, it must first write
    `agent-office/public/app/env.json` with that environment's Firebase web config (`apiKey`,
    `authDomain`, `projectId`, `appId`) from the environment's `VITE_FIREBASE_*` variables, and must
    refuse to publish when one is missing, the key is not a Firebase web key, or `projectId` is not
    that environment's project. Source: `agent-office/public/app/live.js:189` reads `./app/env.json`
    "written per environment at deploy (R48)"; production on 16 Oct 2026 served no env.json, so
    sign in was disabled ("environment นี้ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ", owner screenshot).
    Done when: a unit test refuses each bad input and every publishing job runs the writer.
  - **R48b.** The sign-in screen text reads "ใช้สำหรับทีม Pluton เท่านั้น เพื่อดูงานของ AI Agent".
    Source: owner, 16 Oct 2026 about 22:10. Done when: page.test asserts the line.
- **R49. No simulation anywhere.** No environment, URL parameter, flag or build of this page may run
  the mock's simulation or a demo mode: the simulation code path (`simulate`, `step`, `sweepTick`,
  `releaseStep`, `accrue`, `accrueUtil`, `headPays`, `headPaysExp`, `checkMissions`, `payout`, the
  seed tables and `?fast`) is deleted, not hidden. Source: owner, 16 Oct 2026, popup (Q10
  "ตัดทิ้งทั้งหมด"); R0.
  - **R49a. Ambient life, as in the mock.** The live page must keep every ambient behaviour of the
    mock's people, through the mock's own code paths, while every work fact stays the snapshot's:
    (1) the roster is the mock's (`head, po, ba, dev×3, qa, tl×2, qal`, same order, so the same
    figures and desk places of `placeAll`); (2) every 4 s each idle person changes idle spot with
    chance 0.3 and walks there (mock `setInterval` step loop, `idleSpot`); (3) a free idle person
    other than the Head takes a break at the least-used object of the whole map through `pickUse`
    and `breakActivity` (mock break), so every object is used in turn; (4) every 5.5 s one person
    says a line from `lineFor` (mock chatter), and only a line that passes `isFlavourSafe` (R21) is
    shown. The page must not change a person's `state`, issue, release or any money figure for
    ambient life, must not start a break for a working, waiting or blocked person, and must not run
    any code path R49 deletes. Source: owner, 17 Oct 2026 ("agent prod ต้องเหมือนใน mock มาเลยนะ
    ตำแหน่ง หน้าที่ จำนวน และต้องเดิน พูดแล้วมีกล่องคำขึ้นมาเหมือนใน mock เลย และไปใช้สิ่งของใน map ให้ครบ");
    memory "use every object"; R21, R49. Done when: `agent-office/ambient.test.mjs` shows, for a
    snapshot of N people, moves and breaks only for idle non-Head people, no state changed, every
    prop of a list used within K = ceil(4 × props ÷ idle people) + 10 steps, and no unsafe line
    chosen; and office.js wires the three timers.

## Rules: money and progress, computed from recorded facts

Every rule here computes from GitHub facts the function can read. Where §7 of Plan B leaves a
constant undecided, only that constant is an owner question; the computation exists and every other
part of it renders. Source for the whole section: owner correction 16 Oct 2026 ("ต้องมีการคำนวณ
มีที่มาจริง", "ไม่ใช่ค่ามโน"); Plan B §6 and §7.

- **R50. Usage is recorded for every agent run.** When a `claude-code-action` step of `agent.yml`
  ends ("Work the issue" and the separate review step), whatever its result, the next step must read
  the file named by the action's `execution_file` output, with no token in its environment, take its
  last message whose `type` is `result`, and hand the marker line on as a job output; the `usage`
  job of the same run, on a fresh runner and a clean checkout of `main`, must re-check the line with
  `main`'s code (one line, only the known keys with well-formed values, the ceilings of R59, and this
  run's `issue`, `run_id`, `run_attempt`, `step` and job, else refuse and fail that job), set its
  `sha`, and post on the issue the line that check prints, as one comment by the agent App whose
  first line is `<!-- agent-office:usage {json} -->`.
  - **The parser is `main`'s, copied before any agent or reviewer runs.** In both jobs, right after
    the job's first checkout (the default branch) and before "Work the issue" or the reviewer runs,
    a step copies `scripts/agent/usage-marker.mjs` to `$RUNNER_TEMP/agent-office-usage/`; the usage
    step runs that copy, never a file of the workspace the agent edited or of the agent's branch.
  - **A defined failure path.** When the copy exits non-zero, prints nothing, prints more than one
    line or prints a line without the marker's shape, the step writes, with the shell alone, the
    fallback marker `{"v":1,"issue":…,"run_id":…,"run_attempt":…,"job":…,"step":…,"missing":["parser"]}`
    and exits 0. It never turns the job red and never skips a later step ("Record the pushed head",
    the review's report steps), and it lets no red step pass: an explicit `if … then … else` branch,
    no `continue-on-error`, no `|| true` (`scripts/lib/workflow-silent-pass.test.mjs`). Only the
    `usage` job can go red over usage, when it refuses a line or a post fails.
  - **`sha`** is the head of `agent/issue-N` as the run read it from GitHub ("Record the pushed head"
    in the agent job, "Find the head of the agent branch" in the review job), handed to the `usage`
    job as a job output and written into the marker by `usage-check`, overriding anything the line
    held. When the run found no branch, `sha` is absent and named in `missing`.

  (Main thread, 16 Oct 2026, on the repository's silent-pass guard, the review job's rule that no
  agent-written code runs where a write token is minted, and the security review of ca701944d, B1,
  N2, N3.) The JSON holds: `v` 1, `issue`, `run_id`, `run_attempt`,
  `job`, `step` (`work` or `review`), `sha`, `at` (ISO time the run ended), `model`, the token counts
  `input`, `cacheRead`, `cacheWrite`, `output`, `costUsd` (the result message's `total_cost_usd`),
  and `fxRate` with `fxAt`, read from `https://open.er-api.com/v6/latest/USD` at that moment. When the
  file, the result message or the rate is missing, the marker says so (`"missing": [...]`) and holds
  no invented number. The step must never upload, print or attach the execution file, which holds
  the whole transcript. Source: the action at the commit `agent.yml` pins
  (`1d6de8cb0c237e7c15e9e1bdf973826ebae490cc`, v1.0.248): `action.yml` output `execution_file`
  "Path to the Claude Code execution output file"; `base-action/src/execution-file.ts` writes
  `JSON.stringify(messages)` to `claude-execution-output.json`; `base-action/src/run-claude-sdk.ts`
  line 191 pushes every SDK message and line 149 reads `total_cost_usd` from the result message. The
  token key names inside the result message are UNVERIFIED until T24 reads a real execution file.
- **R51. AI cost.** For each run, cost in USD is the marker's `costUsd`, and cost in THB is `costUsd ×
  fxRate` of the same marker. Totals are sums over runs: `#costTotal` the THB total, `#tokIn`,
  `#tokCache`, `#tokOut` the token totals (cache write is added to input in `#tokIn`, as the rate
  card has no separate line for it, and the caption says so). Per issue, the sum of its runs. A run
  whose marker lacks `costUsd` or `fxRate` counts its tokens but no cost, and the total's source
  line says how many runs lack a cost. Only markers written by the agent App count: a marker in a
  comment by any other author is ignored. Source: Plan B §6 (each period at the rate of its own
  time); mock v61 `accrue`, `drawCost` (line 7317); R50.
- **R52. Saved by cache.** `#saved` = Σ over runs of `cacheRead × (price.input − price.cacheRead) /
  1,000,000 × fxRate` with the prices of R14 and the run's own rate. Source: mock v61 `savedTHB`
  (line 7314); Plan B §6 prices.
- **R53. Income per issue.** When an issue is closed by the release workflow after the production
  deploy of its round succeeded (release.mjs `roundIssues`, the issue's close event by the agent
  App), it earns `base × (1 + min(60, Σ bonus %) / 100)` at its close time. `base` is the §7.2
  amount by the size label of R60 (S ฿300, M ฿800, L ฿2,000, XL ฿5,000), held in the config as
  `tiers`. An issue closed with no size label earns nothing until it is labelled, and the ledger's
  source line names it. `#tiers` shows the same table with its source. Source: Plan B §7.2 and §7.3
  (cap +60%); release.mjs lines 12 to 16.
- **R54. Bonuses.** Each bonus of §7.3 is decided from one GitHub fact:

  | Bonus (§7.3) | % | Fact the function reads |
  | :--- | :---: | :--- |
  | Plan รอบเดียว | +10 | Gate 1 approved (`/approve-plan` by `Thitic9203`, type User, unedited) with no `/revise` from that account before it, read from the issue comments with the logic of `scripts/agent/gates.mjs` |
  | Test plan รอบเดียว | +10 | the same for Gate 2 (`/approve-tests`) |
  | CI เขียวรอบแรก | +15 | the first `ci.yml` run of the agent pull request's first head sha has `run_attempt` 1 and conclusion `success` (§7.5 names `attempt` and `head_sha`) |
  | รีวิวผ่านรอบเดียว | +10 | the first review on the pull request by the agent App's review job is `APPROVED` |
  | ประหยัด token | +15 | the issue's token total (R51) ≤ the token budget of its size (R60) |
  | ไม่ติดขัด | +5 | the issue never carried `agent:blocked`, not counting a blocked period that ended with `/approve-mock` (a wait for the owner's mock, not a code problem): decided by the main thread 16 Oct 2026 on §7.3 "ที่เกิดจากโค้ด" and Plan A Decisions Q4; owner may overrule |
  | ชำระครบ | +5 | the AI cost owed of R56 is 0 at the issue's close time |

  Source: Plan B §7.3; Plan A "Gates".
- **R55. Missions and streaks.** Missions are computed from the same facts, in Asia/Bangkok days:
  daily "ปิด 2 issue วันนี้" (count of R53 closes that day ≥ 2), "ทั้งวันไม่มีงานติด blocked" (no
  `agent:blocked` labelled event that day), "cache read ≥ 70% ของ input" (Σ cacheRead ≥ 0.7 × Σ
  input of that day's runs), "ชำระค่าใช้จ่ายด้าน AI หมดก่อนเที่ยงคืน" (owed is 0 at 23:59:59); weekly
  "ไม่มีค่าใช้จ่ายด้าน AI ค้างชำระข้ามคืนทั้งสัปดาห์" (owed 0 at the end of every day of the week);
  streak "ชำระครบ" +1 for each day ending with owed 0, reset to 0 by a day ending with owed > 0, paying
  ฿300 at 3 days and ฿1,000 at 7. Each mission shows its real progress (for example "1/2") whatever
  its reward. A mission's reward is paid into the fund at the moment the fact completes it: "ปิด 2
  issue" at the second close of the day, "ปิดงาน XL" at the first XL close of the week, a live
  mission at its fact inside its hour (the lean mission at the hour's end), and the missions judged
  over a whole day or week at that day's or week's end. The mission thresholds (2 closes, 70%) are
  config constants with their origin.
  - **Daily rewards (Q18, answered).** By difficulty: easy ฿200, medium ฿350, hard ฿500, config
    constants of origin "owner popup 16 Oct 2026". Which mission is which difficulty follows mock
    v61's reward order for the same missions (`DAILY`: close2 ฿500 highest, payoff ฿200 lowest,
    cache70 ฿300 between): close2 hard, noBlocked and cache70 medium, payoff easy; held in the config
    (`missions.dailyDifficulty`), decided by the agent-office lane 16 Oct 2026 on that source; owner
    may overrule.
  - **Live missions (Q19, answered).** One live mission per Bangkok clock hour, in the fixed order of
    mock v61 `LIVE` (ciFirst, reviewFirst, close1, lean), chosen by `bangkokHourIndex mod 4`, never at
    random. Each is done by a fact inside its hour: ciFirst, an agent pull request's first `ci.yml` run
    of its first head sha (the R54 fact) succeeding; reviewFirst, the agent App's first review of a
    pull request being `APPROVED`; close1, an R53 close; lean, at least one run ended in the hour and
    the tokens of the hour's runs (all four counts) totalling no more than the config limit (300k, mock
    v61). Rewards are mock v61's (฿250, ฿150, ฿300, ฿200), inside the §7.4 range ฿150 to ฿300.
  - **Week start (Q20, answered).** Weekly missions use Monday-start weeks in Asia/Bangkok.
  Source: Plan B §7.4 and "Streak ชำระครบ"; owner, 16 Oct 2026, popup (Q18, Q19, Q20).
- **R56. The fund ledger.** The function orders every money event by time from `economyStart` in the
  config (the date the owner turned the agent on, set by the pull request that does it): income
  (R53), mission and streak rewards (R55), AI cost of each run (R51), the daily office bill (R63).
  After each event, Head pays: first the AI cost owed, then the office cost owed, each
  `pay = min(fund, owed)` while the fund is above 0. `#kFund` and `#fund` are the fund balance,
  `#debtVal` and `#debtPill` the AI cost owed, `#paidOff` the AI cost paid. An event whose amount
  waits on a question is left out of the ledger, and the ledger's source line names how many are
  left out and why. Source: Plan B §7.4 "Head ชำระค่าใช้จ่ายด้าน AI ทันทีเสมอ" and §7.4b (Head pays
  automatically); mock v61 `headPays` (line 7382), and the order `headPays(); headPaysExp();` of its
  tick (AI cost first, then office).
- **R57. Regression progress.** When the staging E2E run of a release round ends, the job that
  posts the report (`ci.yml` "Post the result and the report to Slack", `node
  scripts/e2e-slack-report.mjs send`) must also set one commit status on that sha, context
  `agent-office/e2e`, whose description is compact JSON of the counts `summarize()` already reads
  from the Playwright report's `stats` (`scripts/lib/e2e-slack-report.mjs` lines 138 to 157:
  `passed` = `expected`, `failed` = `unexpected`, `flaky`, `skipped`, `total`), and whose target is
  the run. The page's regression % is the pass rate the Slack message already prints: `passed /
  (total − skipped) × 100`, rounded to one decimal (`scripts/lib/e2e-slack-report.mjs` lines 191 to
  192), with "passed of executed" beside it. A run with no report, or one that cannot be read, sets
  the status `error` with no counts (description `{"missing":"report"}`) and the page shows
  "ไม่มีรายงาน". The step runs whatever the Slack post's result, on that job only, which is not in
  `deploy-staging`'s needs. Source: owner correction 16 Oct 2026 (computed from the real
  E2E report counts); Plan B §2b step 4.
- **R58. Source line on every number.** Every computed number on the page must carry, as a tooltip
  on pointer devices and as a tap-to-show line on touch (≤1024 px), "ที่มา: <source> · <time>", where
  the source names the fact (for example "label agent:building บน GitHub", "usage marker ของ 12 run",
  "commit status agent-office/e2e ของ <sha7>", "open.er-api.com") and the time is the data's own time
  in the clock's Bangkok format. A number without it fails the R0 test. Source: owner correction
  16 Oct 2026 ("มีที่มาจริง"); coordinator brief of the same correction (hover or caption naming
  source and timestamp).
- **R59. Recorded facts are tamper-resistant.** The function must count a usage marker only from a
  comment by the agent App, a gate command only from `Thitic9203` with type User and an unedited
  comment (as `gates.mjs` does), and an E2E status only with context `agent-office/e2e` from the CI
  workflow's token; anything else is ignored and listed in `warnings`. Source: Plan A "Gates"
  (approval counts only from `sender.login == "Thitic9203"` and `type == User`); R0.
  - **A usage marker counts only when its run vouches for it.** Besides being by the agent App, a
    marker counts only when its `issue` is the issue it is on, and its `run_id` and `run_attempt` name
    an `agent.yml` run whose job "Agent usage" (the `usage` job) concluded `success` in that attempt;
    markers are de-duplicated by `run_id`, `run_attempt` and `step`, the earliest comment counting.
    Every other marker is ignored and listed in `warnings` with its reason
    (`agent-office/lib/history.mjs` `acceptedUsageMarkers`). This matters because the agent's own
    tools can post a comment as the App (`gh issue comment`), so authorship alone does not prove a
    marker came from the usage job (RISK_REGISTER R98).
  - **Plausibility ceilings.** `usage-check` refuses a line whose `costUsd` or whose token total
    (`input + cacheRead + cacheWrite + output`) is above the ceiling of
    `scripts/agent/usage-limits.json`: 29,100,000 tokens, the largest whole-issue budget of R60 (XL,
    Plan B §2), since one step above a whole XL issue's budget is not plausible; and USD 582, those
    tokens priced at the highest per-token price of the config's rate card (output, USD 20 per 1M,
    plan.md config `prices`). A refused line turns the `usage` job red, where it is seen. Decided by
    lane L4 on 16 Oct 2026 from those sources (security review of ca701944d, N1); owner may
    overrule, and the values live in the file so a change is a pull request.

## Rules: work size

- **R60. Size by relative T-shirt estimation, with its method shown.** At the `plan` step, the PO
  agent must size each issue and record it before Gate 1, as one `size:S`, `size:M`, `size:L` or
  `size:XL` label plus one comment line `<!-- agent-office:size {"size":"M","rules":n,"files":m,
  "risk":[...]} -->` holding the facts it sized from. The method is relative estimation with T-shirt
  sizes, each size given an underlying number, as published guidance advises:
  - Mountain Goat Software (Mike Cohn), "Estimating with Tee Shirt Sizes", last updated 24 Apr 2018,
    https://www.mountaingoatsoftware.com/blog/estimating-with-tee-shirt-sizes, read 16 Oct 2026:
    T-shirt sizes are "an OK approach to getting started with relative estimating", and a team
    should "put some underlying numbers on them (e.g., Medium=5)".
  - Atlassian, "Story points and estimation" (Dan Radigan),
    https://www.atlassian.com/agile/project-management/estimation, read 16 Oct 2026: "Story points
    consider complexity, risk, and the amount of work".

  The three dimensions are measured from the issue's plan, so the size is reproducible: complexity
  `rules` = the number of numbered rules in its spec; amount of work `files` = the number of files in
  its plan's file table; risk = one flag each for touching the UI or the mock (`ui`), security rules
  (`firestore.rules`, `rules`), workflows or secrets (`workflows`), and stored data (schema or
  migration, `data`). `/approve-plan` does not count until the App's size marker for the current
  plan, unedited, precedes it (`gateState` with `requireSize`, which the agent's context uses).
  Score =
  `rules + files + 5 × risk flags`; S ≤ 6, M 7 to 15, L 16 to 30, XL above 30. The underlying
  numbers (Cohn) are the token budgets of Plan B §2 summed over an issue's steps (plan, test plan at
  30% of plan, build, review at 15% of build, Gate 3 at 15% of build, Gate 4 at 10% of build):
  S 1.92M, M 5.24M, L 11.75M, XL 29.1M tokens, which R54's token bonus uses, and the §7.2 base
  amounts of R53. The size counts as it stood when Gate 1 was approved; a later change of the label
  is ignored and listed in `warnings`. The page shows the size with the note "ขนาดแบบ T-shirt
  (relative estimation): spec n ข้อ · ไฟล์ m · ความเสี่ยง k · วิธี: Mountain Goat Software, Atlassian".
  Source: owner, 16 Oct 2026 ("ไซส์งานก็ลองใช้หลักการมาตรฐานสากล จัดการมาได้เลย แต่ต้องมีบอกไว้");
  the two published sources above; Plan B §2 `budget_tokens (judgment)` and §2a (PO owns scope and
  priority). The score weights and thresholds are decided by the main thread 16 Oct 2026 on those
  sources; owner may overrule, and they live in the config so a change is a pull request.

## Rules: office costs, priced on the real resources the agents use

Inputs are real agent activity read from GitHub and Cloudflare; each price is a provider's published
price held in the config's `office` block as `{value, unit, url, fetched}`, edited by pull request.
No rate comes from the mock any more. Source for the section: owner popups of 16 Oct 2026 about 00:15
("re-model the four office-cost lines on the real resources the agents use in production", "show the
list price and the quota", ค่าเสบียง as real food and drink with a varied menu driven by real
activity); the older answer on office costs of 16 Oct 2026 for the daily bill (R63).

- **R61. The four lines, per Asia/Bangkok day.** Every price is the config's `office.prices` entry
  named below, with its `url` and `fetched` date; the validator refuses a price without them and any
  price or menu text naming the mock as its origin. A USD amount turns into THB at the rate recorded
  the way R51 records it: the `fxRate` of the latest vouched usage marker (R59) at or before the end
  of that day, else the snapshot's own read of open.er-api.com, each with its date. With no rate the
  THB figure is null (R40) and the USD figure and minutes still show.

  | Line | Real input | Price (config `office.prices`) |
  | :--- | :--- | :--- |
  | ไฟฟ้า `#expElec` | minutes of every job of the agent workflows (`office.workflows`: `agent.yml`, `agent-release.yml`, `agent-sweep.yml`, `agent-main-audit.yml`) that completed that day, `completed_at − started_at` from the Actions API, each job rounded up to a whole minute as GitHub bills; minus the jobs counted for water | `actionsMinute`: USD 0.006 per minute, Linux 2-core x64 GitHub-hosted runner (https://docs.github.com/en/billing/reference/actions-runner-pricing, fetched 16 Oct 2026) |
  | น้ำประปา `#expWater` | rework minutes: the minutes, rounded up per job, of the jobs of every run on an `agent/issue-N` branch whose run started after a check run concluded `failure` on an earlier head sha of that branch; counted on the day the job completed; never in electricity | `actionsMinute` as above |
  | อินเทอร์เน็ต `#expNet` | requests to the board's Pages Function that day, from Cloudflare's GraphQL Analytics API (Pages Functions invocations of the project `agent-office-<env>`), read with the environment's secret `CLOUDFLARE_ANALYTICS_TOKEN_STAGING` or `_PROD` (Account Analytics: Read, created by the owner) | `workersRequestsPerMillion`: USD 0.30 per million requests (https://developers.cloudflare.com/workers/platform/pricing/ "+$0.30 per additional million", last updated 2 Oct 2026, fetched 16 Oct 2026) |
  | ค่าเสบียง `#expSup` | food and drink from `agent-office/supplies-menu.json` (549 The Sims 4 food and drink names, Sims Wiki, CC BY-SA 3.0), each served by one real count of that day: `activeAgentDays` (each roster person with work that day, from each role's distinct issues with a run or an `agent:*` label change, capped at that role's people) gets 1 meal, from the breakfast group when that person's first work of the day started before 11:00 Bangkok, else from lunch/dinner; `runsStarted` (agent workflow runs created that day) 1 drink; `reviewRuns` (the agent App's pull request reviews that day) 1 snack or dessert; `issuesClosed` (R53 closes that day) 1 dessert. The item is a fixed rotation through its group keyed by the day, the roster slot and a counter (no randomness, so a reload shows the same, and every item comes round) | each item's price category in the menu file's `prices`, `{value, unit, item, url, fetched}`: Numbeo Bangkok (last update 15 Oct 2026) for meal 100, bread 50.36, coffee 92.69, milk 63.73, soft drink 21.92, drinking water 0.33 L 11.73, beer 0.5 L 90, wine bottle 500; The Economist Big Mac index (Thailand 135, 1 Jul 2026) for snack; Starbucks Thailand's official menu for bakery and dessert 85, ice cream 160, tea 150, juice 100, mocktail 170; fruit 7.06 per serving (Numbeo bananas 59.82 per kg × 0.118 kg, USDA FoodData Central FDC 173944); cocktail 390 (Anantara Siam Bangkok Manohra menu, 8 Mar 2024) and spirits 280 (Centara Grand drink list, 24 Jun 2020), both before VAT and service. Every item is charged, alcohol included (owner, 17 Oct 2026: "คิดเงินมาให้หมด มีเครื่องดื่มแอลด้วย"). A price may be `null` only with `pending: true`; the bill then lists the item as "รอราคา" and charges 0 |

  When the analytics secret is absent or its read fails, the internet line is null with
  "ยังไม่มีแหล่งข้อมูล" (R40), and the snapshot names the reason in `money.warnings`. Without the menu
  file, the supplies line is null the same way. The panel credits the menu ("เมนูจาก The Sims 4
  (Sims Wiki, CC BY-SA)") and shows a visible link back to Numbeo, which its terms of use require
  (owner accepted the terms risk, 17 Oct 2026). `#expUtil` is electricity + water + internet, of the lines that have
  a source. The electricity and water source lines, and the panel, also state the free quota:
  "ใช้ไป X/2,000 นาทีเดือนนี้ · จ่ายจริง ฿0 ภายในโควตาฟรี", where X is the agent workflows' minutes of
  that Bangkok month (rounded up per job) and 2,000 the config's `freeMinutesPerMonth` (GitHub Free
  plan, https://docs.github.com/en/billing/concepts/product-billing/github-actions, fetched 16 Oct
  2026); above the quota it says by how many minutes. Every figure's R58 line lists the job ids,
  issues or days it counted. Source: owner popups, 16 Oct 2026 about 00:15, line by line.
- **R62. No input is charged twice.** Each real input feeds exactly one cost line: tokens feed only
  the AI cost (R51); agent job minutes only electricity; rework job minutes only water (and are taken
  out of electricity); Pages Function requests only internet; the menu's triggers (`activeAgentDays`,
  `runsStarted`, `reviewRuns`, `issuesClosed`) only supplies. Fix rounds and job minutes are not menu
  triggers. A test asserts that the inputs of the five lines are disjoint and that a menu with a
  forbidden trigger is refused. Source: owner, 16 Oct 2026 ("ค่าเสบียงต้องเอามาจากอย่างอื่น …
  เหมือนคิดค่าใช้จ่ายเบิ้ล"); owner popups of 16 Oct 2026 about 00:15.
- **R63. The daily bill.** At 00:00 Asia/Bangkok the day's four lines are summed into one bill and
  entered in the ledger of R56 at that time. It is paid from the fund after the AI cost owed; what the
  fund cannot cover becomes office cost owed (`#expOwe`, `#officePill`), paid automatically once the
  fund grows. The current day shows its running total, marked "ยังไม่ตัดรอบ", outside the ledger.
  Source: owner answer on office costs, 16 Oct 2026 (daily bill at midnight, paid from the real fund,
  shortfall becomes debt); Plan B §7.4b ("Head หักค่าใช้จ่ายทั้งหมด ... อัตโนมัติ ไม่ปล่อยค้าง").
- **R65. Snapshot.** When `.github/workflows/deploy-agent-office.yml` deploys an environment, it
  must first build `public/data/state.json` from GitHub (R2 to R4, R7, R8, R10) with the client of
  R43, stamp it with `readAt`, and publish it together with the page in the same deployment. It must
  also refresh the snapshot without changing code: on an issue event (`opened`, `closed`,
  `reopened`, `labeled`, `unlabeled`), on the completion of an agent workflow (`agent.yml`,
  `agent-release.yml`, `agent-sweep.yml`, `deploy-production.yml`), and by hand. A refresh deploys,
  to each environment, the exact sha that environment already serves (read from its public
  `version.txt`), so no code reaches production that did not pass staging first (R46); only the
  snapshot changes. Before a refresh checks out the sha it read, it must confirm that sha is a full
  40 character commit on `main` (the compare of that sha with `main` answers `ahead` or `identical`,
  the check the production `verify` job runs); when it is not, the refresh must publish nothing and
  fail with an error naming the sha, since a `version.txt` is public content and must never choose
  the code that runs beside the Cloudflare token. Every issue action listed above, `opened`
  included, must be both in the trigger and accepted by each refresh job's condition. A refresh
  while another is running replaces it (the latest event wins). The snapshot is built in Node inside
  the workflow; the Pages Function imports none of the snapshot libraries. Source: main thread
  design change, 16 Oct 2026; R46; review findings N1 and N2 on the workflow, 16 Oct 2026.
  The OLS part of the snapshot is not read from GitHub: the Mac builds it with its local Jira
  credential and stores it in the repository variable `OLS_BOARD`, then starts a refresh
  (`target=refresh`) only when it changed; every build of the snapshot (deploy or refresh) reads
  that variable as data, validates it and adds its cards. No Jira credential reaches GitHub, and no
  code is carried by the variable, so R46 holds. Source: owner popup 17 Oct 2026 "สร้าง snapshot บน
  Mac แล้วส่งขึ้น"; [ols-real](../ols-real/spec.md) R13, R14.
- **R64. Panel "ที่มาของค่าใช้จ่าย".** The money section must carry a visible panel (not a tooltip),
  titled "ที่มาของค่าใช้จ่าย", that explains how the agents count money, in this order: income (fund by
  size, R53, Plan B §7.2; bonuses, R54, §7.3, cap +60%), the AI cost (R51, labelled "มูลค่าเทียบราคา
  API · จ่ายจริงเป็นค่าสมาชิก", owner's choice of the API-equivalent value, with the cache saving of
  R52), electricity, water, internet, supplies expanded into today's items (name | what it counts | price with its source | baht), with the menu credit and the link back to Numbeo (R61), then the
  rules (the daily bill and office cost owed of R63, missions and streak of R55, the AI cost owed and
  Head's payments of R56, and the R62 statement that one input never feeds two cost lines). Every row
  reads: name | what it counts | formula | price with its source and date | today's figure. The
  electricity and water rows state the free quota of R61. The panel is rendered from the same config
  object the calculator reads, so its prices and the maths cannot drift; no rate is typed into the
  page text. The mock's panel markup is kept; only its text and values change. It is in the mock
  first (R44), at 3 widths × 2 themes. Source: owner, 16 Oct 2026 ("ที่มาของค่าใช้จ่าย บอกไว้ในบอร์ดด้วยนะ
  เราจะได้แจ้งทีมได้ว่า Agent คิดยังไง"); owner popups of 16 Oct 2026 about 00:15 (order and columns).

### Production fixes (owner, 17 Oct 2026)

Owner, 17 Oct 2026 about 08:00: "Agent ใน prod ต้องใช้ได้จริง และรูปลักษณ์เหมือนใน mock ไง ต่างแค่ข้อมูลและ
กฏแนวคิดค่าใช้จ่าย ... แก้แล้วขึ้น prod ด่วน". Production `2ae23d4a7` showed "ยังไม่มีแหล่งข้อมูล" in every
money tile and on the release slide.

- **R66. `economyStart` is the day the agent was turned on.** When `vars.AGENT_ENABLED` is `true`,
  `economyStart` in `agent-office/projects.config.json` must be a day on or before the day it was set,
  never a placeholder in the future, so the ledger of R56 is read. The agent was turned on by setting
  the variable directly (`gh variable list`: `AGENT_ENABLED true 2026-10-16T16:50:30Z`, 16 Oct 2026
  23:50 Asia/Bangkok), not by the pull request plan.md expected, so the date is `2026-10-16` and its
  source names that reading. Source: R56 ("the date the owner turned the agent on"); R0 (no-source
  text only while an open question names the missing input, never as a standing state).
  Done when: a config test fails while `economyStart` is later than the recorded enable day, and the
  snapshot built from `main` reports a ledger instead of "money without a ledger".
- **R67. The snapshot carries each project's config fields.** Every project in `state.projects` must
  carry `name`, `tag`, `description` and `key` from the config beside its id, so the page finds the
  project by the name it shows (the release slide's batch, R34) and the project card shows its name,
  tag line and description (R30). Source: R30; R34.
  Done when: a test feeds the real output of the snapshot builder (not a hand-written fixture) to
  `projectsOf` and the release text, and gets "Taskfolio" with its batch, not the no-source text.
- **R68. A release holder's line is its phase.** A person holding a release round shows the text of
  that round's phase; the page reads the phase from the holder's `release.phase`, and its phase keys
  are the phases the function writes (`on-test-env` included). Source: R8; R34.
  Done when: a test renders a state with a release holder in each phase and finds the phase text,
  never the no-source text.
- **R69. Held props keep their real size.** A prop attached to a bone of a rigged figure (the drink
  cup on the right wrist) must undo that bone's measured world scale, so it renders at its modelled
  size (cup 0.1 m), never the guessed `1/(calib.k × scale)`, which ignores the ×100 the Quaternius
  armature carries and drew a 10 m cup over the scene on production (17 Oct 2026, run of the
  investigation: `cupWorldScale 100`, `cupHeightM 10`). Source: owner, 17 Oct 2026 ("ขาวๆ ใหญ่ๆ
  นั่นอะไรอะ แก้มาด่วน"); the mock's figures hold a cup-sized cup.
  Done when: a static test refuses the guessed factor, and a browser probe of the page with rigged
  people measures every cup between 0.05 and 0.2 m.
- **R70. The cost-method table wraps inside its card.** The last column of `#costMethod` wraps its
  text (left aligned, body font) instead of `nowrap`, so the table fits its card at every width.
  Production measured the table at 40,222 px in a 586 px card (audit of 17 Oct 2026). Source: R39
  (text wraps, never overflows); global CLAUDE.md rule 16 ("popover ห้ามล้น viewport", no horizontal
  scroll). Done when: a static test finds the wrap rule and no `nowrap` on that column.
- **R71. An empty status chip is not drawn.** `.chip-st` with no text is hidden, so the AI and
  office cost headings never show an 18 × 2 px accent bar that reads as a zero. Source: R40.
  Done when: a static test finds `.chip-st:empty{display:none}`.
- **R73. The snapshot reads GitHub a few requests at a time.** The GitHub client keeps at most 6
  requests in flight, whatever its callers ask in parallel, and a failed connection names its inner
  cause. With `economyStart` on 16 Oct the history reads fan out over every agent run since then;
  run 38991365127 failed twice on production with "fetch failed" for a jobs path while the API
  answered the same paths one at a time. Source: E1 (a read error fails the snapshot, so reads must
  not fail on their own burst); GitHub REST best practices, avoid concurrent requests (judgment
  for the number 6). Done when: a test with a counting fake fetch never sees more than 6 at once
  and still reads every page, and the error of a rejected fetch carries its cause.
- **R72. No control that does nothing.** The fridge menu offers no "เจ้าของสั่งเสบียงเอง": supplies
  are priced from working days (R61, R62), never ordered at the fridge, and the live page is read
  only (R36). Source: R36; R61; R62. Done when: a static test finds no such option in `office.js`.

## Edge cases

- **E1.** When GitHub answers 403 or 429 for rate limit, or any other error, while the snapshot is
  read, the snapshot step must fail and publish nothing, so the site keeps serving the last snapshot
  with its `readAt`, and the page applies R11. A rate-limit answer surfaces as a typed error naming
  the reset time. Source: R11; main thread design change 16 Oct 2026 (snapshot).
- **E2.** When an issue moves lanes between two reads, its figure walks to the new room; when it
  closes, it leaves the board. Source: mock v61 movement on lane change.
- **E3.** When the roster has fewer people of a role than issues in that role's lanes, extra issues
  show "รอ <role> รับงาน" (R5). When it has none of a role, every issue of that role shows it.
  Source: mock v61 chip text (line 7139).
- **E4.** When a project's source is `none`, or is `mac-snapshot` (OLS) and `OLS_BOARD` is missing
  or does not validate, its project card and chip render, and its board count shows the no-source
  text, never 0. Source: R0; Q15, decided by the main thread 16 Oct 2026; the OLS source amended by
  [ols-real](../ols-real/spec.md) E4 on the owner's popup of 17 Oct 2026.
- **E5.** When more than 100 labelled issues are open, the function must page through all of them.
  Source: GitHub REST pagination (`per_page` max 100).
- **E6.** When `prefers-reduced-motion` is set or GSAP fails to load, motion is a no-op and data
  still renders. Source: global CLAUDE.md rule 16.1.

## Done when

- [ ] R0: a test renders the page from an empty state and from a fixture state and finds no number
  node whose value is not traced to a fixture field, the clock or the FX fixture; a grep of the
  shipped bundle finds none of the mock's seed tables (`CONFIG.issues`, `SEED_SIZE`, `seedPaid`,
  `BURN`, `FX_SNAPSHOT` values).
- [ ] R1: a bad config (missing role, unknown source kind) fails the config test and the build.
- [ ] R2: a unit test maps each label of the table to its lane, and a two-label issue to the later
  lane with one warning; no input yields an `analysis` lane.
- [ ] R3: a unit test with a merged `agent/issue-N` PR into `release/next` and no `on-test-env`
  yields the release-queue lane and the right per-project count.
- [ ] R4: a unit test reads a timeline fixture and returns the step before `agent:blocked`, and
  returns no step for a timeline with none.
- [ ] R5: a unit test assigns oldest first per role, one per person, and leaves the extra issue
  "รอ ... รับงาน".
- [ ] R6: a unit test gives Head "waiting" with n equal to the wait-lane count, idle at 0.
- [ ] R7: a unit test shows every person with no issue as `idle`, and as `sweeping` only when the
  fixture has an in-progress `agent-sweep.yml` run.
- [ ] R8: a unit test maps `release:batch-ready`, `agent:on-test-env` and an in-progress production
  run to the phase texts; an in-progress E2E run shows no percentage and a finished one shows R57's.
- [ ] R9: a unit test tags `[Improvement]` titles only.
- [ ] R10: with `AGENT_ENABLED` unset and no labelled issue, the staging page shows the exact idle
  texts of R10 (Playwright on staging, 3 widths × 2 themes).
- [ ] R11: a test with a failing fetch keeps the last state and shows the failure line; a hidden tab
  makes no request (request count over 3 minutes hidden is 0).
- [ ] R12, R13, R14: unit tests format the clock in Bangkok time, show "ยังอ่านอัตราไม่ได้" with no
  FX fetch, and read prices from config.
- [ ] R15 to R38: the parity check of `plan.md` compares each listed mock id between the mock and
  the live page at 3 widths × 2 themes and reports no missing element.
- [ ] R39: axe, contrast, tap target and horizontal-scroll checks pass at 3 widths × 2 themes.
- [ ] R40: every element whose input waits on an open question shows "ยังไม่มีแหล่งข้อมูล" in the
  fixture render, and no other element does (Q7, Q18 to Q20 are answered, so mission rewards and
  flavour lines render).
- [ ] R28: the fixture render has no `#addBtn`, role switch or duty input.
- [ ] R32: a card of a `size:M` fixture issue shows "M" with the R60 note as its source line; an
  unlabelled issue shows "ยังไม่ประเมินขนาด"; no value of `SEED_SIZE` appears in the bundle.
- [ ] R41: the workflow test finds no `secrets.` read other than the Cloudflare deploy token of its
  own environment, and the snapshot job's permissions are exactly the four read scopes; a client test
  asserts the token appears in no error message; `wrangler.toml` holds no secret.
- [ ] R42: the function returns 401 with no token, 401 with a bad token, 403 for a pending and for a
  deactivated account, and 200 for an active account of each role (staff, team_lead, management,
  admin) (unit tests with a signed fixture).
- [ ] R43: POST, PUT, PATCH and DELETE get 405; a request from another origin gets no CORS grant; a
  missing `APP_ORIGIN` gets 500; a test asserts the GitHub client only issues GET.
- [ ] R65: the workflow test finds the snapshot built before every publish, the refresh jobs checking
  out the sha read from each environment's `version.txt` only after a compare-on-main check of it,
  and the issue (`opened` included) and workflow_run triggers.
- [ ] R44: each listed change is on the republished mock artifact before the matching code commit.
- [ ] R45: an unsigned visit shows the sign-in screen and makes no state request.
- [ ] R46: the production workflow refuses a sha that has no successful staging deploy.
- [ ] R47: the polling budget in `plan.md` stays under the documented quotas with the numbers shown.
- [ ] R48: `wrangler.toml` of each environment names its own Firebase project and origin.
- [ ] R49: a grep of the built page and function finds none of `simulate`, `simBtn`, `sweepTick`,
  `releaseStep`, `accrue`, `headPays`, `checkMissions`, `payout`, `?demo` or `?fast`, on the staging
  and the production build alike.
- [ ] R50: a test feeds `usage-marker.mjs` a real execution file captured by T24 and gets the marker
  JSON with every field; a file with no result message gives `"missing": ["result"]` and no numbers;
  a workflow-security test asserts no step uploads, prints or attaches the execution file.
- [ ] R51: fixture markers of 3 runs at different `fxRate` give `#costTotal` = Σ costUsd × own rate;
  a marker in a comment by another author is ignored and warned.
- [ ] R52: the cache saving of a fixture matches the formula to the satang.
- [ ] R53: a fixture issue of `size:L` closed by the release workflow with bonuses +10, +15, +10, +15,
  +10, +5 (65%) earns ฿2,000 × 1.60 = ฿3,200; an unlabelled one earns nothing and is listed.
- [ ] R54: one unit test per bonus row, each with a fixture that passes and one that fails it,
  including a blocked period ended by `/approve-mock` that keeps "ไม่ติดขัด".
- [ ] R55: unit tests for each mission and the streak across a Bangkok midnight; daily rewards by
  difficulty from the config enter the ledger; the live mission of a given Bangkok hour is the same
  on every run and follows the fixed order; weekly missions use Monday weeks and pay into the ledger.
- [ ] R56: a ledger fixture of income, rewards, AI cost and an office bill gives the fund, the AI cost
  owed, the paid total and the office owed, with AI cost paid before office.
- [ ] R57: a test of the CI step writes the status description from a `stats` fixture; the page's
  pass rate equals `message()`'s rate for the same counts; a run with no report gives "ไม่มีรายงาน".
- [ ] R58: the R0 test fails for any number node without a source line; at ≤1024 px a tap shows it.
- [ ] R59: markers, commands and statuses from the wrong author or context are ignored and warned;
  a marker whose run's "Agent usage" job did not succeed in that attempt, or a second marker of the
  same run, attempt and step, is ignored and warned; `usage-check` refuses a line over either ceiling.
- [ ] R50 (failure path): a test runs the usage step's own shell with a broken parser copy and gets
  the `missing: ["parser"]` fallback line and exit 0; a test asserts the copy step precedes the work
  step and the reviewer, and that the usage step names no workspace file.
- [ ] R60: unit tests score fixture plans into each of S, M, L and XL at the thresholds' edges; a
  label changed after Gate 1 is ignored and warned; the card note names both sources.
- [ ] R61: one unit test per line with fixture jobs (rounded up per minute), rework runs after a
  failed check, Function request counts and the menu file, priced from `office.prices` and the menu's `prices` at
  the day's recorded rate; the same day gives the same items on every read; no analytics secret gives
  null, never ฿0; the validator refuses a price without `url` and `fetched`, one naming the mock, and
  a `null` price without `pending: true`.
- [ ] R62: a test asserts the five lines' input sets are disjoint, that tokens reach only R51, that
  rework minutes are not in electricity, and that a menu trigger of minutes or fix rounds is refused.
- [ ] R63: a fixture day whose bill exceeds the fund leaves the rest as office cost owed, paid on the
  next income; the current day shows "ยังไม่ตัดรอบ" and is not in the ledger.
- [ ] R64: the panel's rows come in the R64 order with the five columns; a test walks every numeric
  leaf of the config's `tiers`, `bonusCapPct`, `sizing`, `missions`, `office` and `prices` and finds
  each value in the rendered panel; changing one value in
  a test config changes the panel text and the calculator's result together; the page source holds no
  rate literal outside the config.

## Open questions (for the owner)

None open. Every question of the earlier drafts is answered by the owner or decided by the main
thread; see "Owner sources" at the top and the rules it points to. The last four, answered by the
owner on 16 Oct 2026 (popup):

- **Q7. Flavour speech and passer-by lines.** Answered: allowed, but a line must never state a work
  fact that is not real (R21).
- **Q18. Daily mission rewards.** Answered: by difficulty, ฿200 / ฿350 / ฿500, config constants (R55).
- **Q19. Live missions.** Answered: rotate hourly in a fixed order, deterministic from the Bangkok
  hour, never random (R55).
- **Q20. Week start for weekly missions.** Answered: Monday, Asia/Bangkok (R55).
- **Q21. Pages deployment count on the free plan.** Every snapshot refresh (R65) is one Cloudflare
  Pages deployment per environment. Cloudflare's free plan limits builds per month; whether a direct
  upload by `wrangler pages deploy` counts against that limit is not read from a Cloudflare source in
  this session (UNVERIFIED). Until it is, the refresh runs only on the events of R65 (no schedule),
  with the latest event replacing a running one, and the owner reads the account's usage page after
  the first week. If a limit applies and would be passed, the refresh stops and goes to the owner
  (R47); it never moves to a paid plan.

- **Q-R73 (17 Oct 2026, review of 2fb200493).** The GitHub client has no per-request timeout, so a
  hung socket would hold one of the 6 slots until the job limit. No source sets a timeout value; until
  one is decided, a hang ends at the workflow job timeout and publishes nothing (E1).
