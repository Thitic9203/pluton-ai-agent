---
ticket: P7
label: wayfinder:research
date: 2026-10-14
source: เรโป ols-qa-e2e (remote Thitic9203/ols-qa-e2e) อ่านอย่างเดียว ไม่แก้ไฟล์ ไม่รัน git write
---

# P7 findings: ols-qa-e2e รันบน dev อย่างไร รายงานเคสไม่ผ่านที่ไหน และรับการแก้แบบไหน

ทุกการอ้างไฟล์ของเรโปอื่นเขียนเป็น "ไฟล์ X บรรทัด N ของเรโป ols-qa-e2e" และอ่านจาก origin/main ที่ 73e438b (Merge pull request #39, 14 Oct 2026 23:04 +0700) ด้วย git show ไม่ใช่จาก working tree · ไม่ได้คัดลอกค่า secret, token, channel id หรือ host ใดๆ มีแต่ชื่อ · คำพูดที่ยกมาแทนขีดยาวในต้นฉบับด้วย " · " ตามกฎ no-dashes ของเรโปนี้

## สรุปสั้น

1. **workflow smoke-dev.yml บน GitHub ไม่เคยรันเลย** (total_count 0) · รอบ dev จริงรันจาก launchd job ชื่อ com.thitichaya.ols-smoke-watch ทุก 120 วินาที ซึ่งเรียก smoke_watch.py ในโฟลเดอร์นอกเรโป ~/ols-qa-testing-bot แล้วรัน npx playwright test ใน checkout ~/GitHub/ols-qa-e2e ผลเก็บที่ ~/ols-qa-testing-bot/out/dev-smoke-YYYY-MM-DD-HHMM/run.json · ทั้งเรโปมี run บน GitHub แค่ 1 ครั้ง (e2e-preprod, 10 Aug 2026)
2. **e2e-preprod.yml ยิง preprod ไม่ใช่ dev** (TARGET_ENV: preprod) และเป็น workflow_dispatch อย่างเดียว · สำหรับงานซ่อม e2e ที่เจ้าของสั่งว่า "ใน dev env" แหล่งเคสไม่ผ่านจึงเป็นไฟล์ run.json ของ smoke-watch ไม่ใช่ GitHub artifact
3. **checkout ที่ smoke-watch ใช้รันล้าหลังและสกปรก**: local HEAD 98649534 (23 Sep) ตามหลัง origin/main 68 commit และมีไฟล์แก้ค้าง 3 ไฟล์ · smoke_watch.py รองรับ SMOKE_E2E_DIR เพื่อรันจาก worktree สะอาด แต่ plist ไม่ได้ตั้งค่านี้ · ข้อ 4 และ 7 ของ MAP ("รันซ้ำบน dev จาก main ที่ merge แล้ว") จึงต้องรันจาก worktree ของ origin/main เอง ไม่ใช่พึ่ง smoke-watch
4. **กติกาเรโปห้ามปิดเทสแดงด้วย test.skip, test.fixme หรือเพิ่ม retry** และ config ตั้ง failOnFlakyTests: true (flaky = fail) · ไม่มี branch protection (repo private บน plan ฟรี ได้ HTTP 403) และไม่มี workflow ที่รันบน pull_request · PR 15 ใบล่าสุด merge โดยเจ้าของคนเดียว reviewDecision ว่าง
5. **token บนเครื่องนี้เปิดและ merge PR ได้**: บัญชี Thitic9203, scope repo และ workflow, สิทธิ์ admin บนเรโป · การแจ้งผลเดิมของเรโปไปทาง Discord (smoke) และ Slack ช่อง QA (e2e-preprod บน main) ไม่มี Slack DM

## 1. workflow สองตัว

### smoke-dev.yml

| หัวข้อ | สิ่งที่พบ | หลักฐาน |
|---|---|---|
| trigger | workflow_dispatch (input tag_url, post) และ repository_dispatch type dev-deploy · ไม่มี cron | ไฟล์ .github/workflows/smoke-dev.yml บรรทัด 28 ถึง 41 ของเรโป ols-qa-e2e |
| concurrency | group smoke-dev, cancel-in-progress false | บรรทัด 44 ถึง 46 |
| runner | runs-on [self-hosted, macOS, ols-e2e], timeout 60 นาที | บรรทัด 55 ถึง 56 |
| VPN | dev เข้าได้ทาง VPN บน QA Mac เท่านั้น · step "VPN gate" เช็ค scutil --nc list ถ้าไม่ Connected exit 3 | บรรทัด 6 ถึง 10 และ 89 ถึง 97 |
| secrets | ไม่มีใน GitHub: "SECRETS: none are stored in GitHub" token Discord และ channel id อยู่ใน store นอกเรโปบน Mac | บรรทัด 24 ถึง 25 |
| ขั้นตอน | lock เครื่อง (ใช้ร่วมกับ pre-prod) · npm ci · typecheck · lint · gate:smoketmpl · scope-lock ก่อนรอบ · auth preflight (scripts/ci-preflight.sh รัน --grep "@smoke") · smoke round · scope-lock หลังรอบ · verdict gate · PDF · notify evidence gate · post · read-back | บรรทัด 100 ถึง 169 |
| สิ่งที่รัน | scripts/ci-smoke-round.sh: npx playwright test --grep "@safe" --grep-invert (จาก smoke-scope.mjs) กับ project guest, learner, creator, admin-content, admin-user และ --reporter=list,html,json | ไฟล์ scripts/ci-smoke-round.sh บรรทัด 16 ถึง 24 |
| verdict | อ่าน stats ของ report.json ผ่านเมื่อ unexpected 0, flaky 0, skipped 0 และ expected มากกว่า 0 เท่านั้น ไม่เช่นนั้นไม่โพสต์ | ไฟล์ scripts/ci-smoke-verdict.sh บรรทัด 15 ถึง 40 |
| เผยแพร่ผล | โพสต์ Discord ช่อง release (scripts/smoke-post.mjs เรียก discord.com/api/v10, อ่าน token จากไฟล์ใน ~/ols-qa-testing-bot และ QA_RELEASE_CHANNEL_ID จาก ~/.ols-qa-secrets) · artifact ชื่อ smoke-dev-RUN_NUMBER เก็บ RUNNER_TEMP/smoke/ 14 วัน · ล้มเมื่อไหร่ notify_fail ส่ง DM ผ่าน fail_notify.py (Discord) | smoke-dev.yml บรรทัด 159 ถึง 188 · scripts/smoke-post.mjs บรรทัด 35, 45, 72 · scripts/ci-lib.sh บรรทัด 21, 39 ถึง 47 |

ไฟล์ในโฟลเดอร์ artifact ตาม scripts/ci-smoke-lib.sh บรรทัด 7 ถึง 15: report.json, pw-report/, smoke-summary.html, YYYYMMDD-Smoke-Test-Summary.pdf, YYYYMMDD-Playwright-Test-Report.html

### e2e-preprod.yml (origin/main มากกว่า local 28 บรรทัด)

| หัวข้อ | สิ่งที่พบ | หลักฐาน |
|---|---|---|
| trigger | workflow_dispatch อย่างเดียว (input lot, tags, lanes) · หัวไฟล์เขียนว่า "Cadence = ON-DEMAND ONLY" ไม่มี cron | ไฟล์ .github/workflows/e2e-preprod.yml บรรทัด 7 ถึง 8 และ 20 ถึง 35 ของเรโป ols-qa-e2e (บรรทัดฝั่ง local) |
| env | TARGET_ENV: preprod · runner ตัวเดียวกัน [self-hosted, macOS, ols-e2e] timeout 150 นาที · permissions contents: write | บรรทัด 44, 50 ถึง 55 |
| secrets | ไม่มีในไฟล์ ค่าจริงอยู่ที่ ~/.ols-qa-secrets และ ~/ols-qa-testing-bot บน Mac · บน main เพิ่ม step Slack ที่อ่าน token และช่องจาก ~/.ols-qa-secrets/slack.env (ชื่อตัวแปร SLACK_BOT_TOKEN, SLACK_CHANNEL ใน scripts/slack-e2e-report.ts บรรทัด 19) | บรรทัด 16 ถึง 17 · git diff HEAD origin/main |
| สิ่งที่รัน | gate offline ราว 20 ตัว (typecheck, lint, format:check, gate:caseid, gate:eritems, gate:standards ฯลฯ) · auth preflight · npx playwright test พร้อม --project และ --grep จาก input · retry ไม่ถูก override ใน workflow | บรรทัด 91 ถึง 299 |
| เผยแพร่ผล | commit HTML report กลับเข้าเรโป (report/preprod) · MP4 ขึ้น Drive "Automation Run" · artifact playwright-report-N, test-results-N, e2e-mp4-N เก็บ 14 วัน · DM แจ้ง fail ผ่าน fail_notify.py · บน main เพิ่ม "Slack round report" (npm run -s report:slack -- --send) ไปช่อง QA แนบ index.html · ห้ามเขียน Google Sheets (hard gate) | บรรทัด 301 ถึง 352 · CLAUDE.md บรรทัด 378 ถึง 385 (origin/main) |

runner ที่ลงทะเบียน (gh api repos/Thitic9203/ols-qa-e2e/actions/runners): ols-e2e-qamac online labels self-hosted,macOS,ARM64,ols-e2e · secrets ระดับเรโป 0 ตัว, variables 0 ตัว

## 2. รอบ dev ล่าสุดและวิธีอ่านเคสไม่ผ่าน

### บน GitHub ไม่มีข้อมูล

```
gh api repos/Thitic9203/ols-qa-e2e/actions/workflows/smoke-dev.yml/runs --jq .total_count
0
gh api "repos/Thitic9203/ols-qa-e2e/actions/runs?per_page=10" --jq '.total_count'
1
```

run เดียวของเรโปคือ 31434722160 (e2e-preprod, workflow_dispatch, success, 2026-08-10) · ไม่มีใครยิง repository_dispatch dev-deploy (git grep พบคำนี้ใน smoke-dev.yml บรรทัด 41 ที่เดียว)

### รอบ dev จริงอยู่ในเครื่อง

- launchd: ~/Library/LaunchAgents/com.thitichaya.ols-smoke-watch.plist · StartInterval 120 · ProgramArguments /bin/bash ~/ols-qa-testing-bot/run_smoke_watch.sh · launchctl print: runs = 54, last exit code = 0
- run_smoke_watch.sh ห่อด้วย sfd/run_workflow.sh (watchdog 2700 วินาที) แล้วรัน uv run python smoke/smoke_watch.py
- smoke_watch.py: เฝ้าประกาศ deploy dev ใน Discord · ENV = "dev" (บรรทัด 73) · E2E = SMOKE_E2E_DIR หรือ ~/GitHub/ols-qa-e2e (บรรทัด 67 ถึง 68) · run_suite รัน npx playwright test --grep @safe --grep-invert (จาก ~/ols-qa-testing-bot/smoke/excluded-cases.json) project guest, learner, creator, admin-content, admin-user บน 7 spec และตั้ง E2E_JSON_OUT ให้ json reporter (บรรทัด 306 ถึง 338) · workdir = ~/ols-qa-testing-bot/out/dev-smoke-YYYY-MM-DD-HHMM · หลังรอบส่ง DM เจ้าของทาง Discord พร้อมตัวเลขและ path ผล "not posted" (ฟังก์ชัน main เริ่มบรรทัด 382 ส่วน DM อยู่ช่วงบรรทัด 428 ถึง 482)
- log ช่วงหลังเป็น "[smoke-watch] no new dev deploy to act on" ทั้งหมด
- playwright.config.ts บรรทัด 33 (origin/main): json reporter เขียนที่ E2E_JSON_OUT ถ้าไม่ตั้งใช้ test-results/results.json

### 20 โฟลเดอร์ล่าสุดใน ~/ols-qa-testing-bot/out (มีทั้งหมด 42 โฟลเดอร์ dev-smoke)

นับด้วย node อ่าน stats ของ run.json แต่ละโฟลเดอร์ · clean 5 · not clean 11 · ไม่มี run.json 4 (รวมไฟล์ .md หนึ่งไฟล์ที่ชื่อขึ้นต้นเหมือนกัน) · โฟลเดอร์ที่ลงท้าย fixverify, passonly, rerun เป็นรอบที่รันมือ ไม่ใช่รอบ launchd

| โฟลเดอร์ | expected | unexpected | flaky | skipped |
|---|---|---|---|---|
| dev-smoke-2026-10-08-1552 | 92 | 4 | 0 | 5 |
| dev-smoke-2026-10-08-1203 | 6 | 1 | 0 | 95 |
| dev-smoke-2026-10-08 | 99 | 1 | 1 | 0 |
| dev-smoke-2026-10-07-1114 | 84 | 0 | 0 | 0 |
| dev-smoke-2026-10-07-1108 | 89 | 5 | 1 | 6 |
| dev-smoke-2026-10-06-1458 | 85 | 12 | 0 | 4 |
| dev-smoke-2026-10-06-1455 | 0 | 1 | 0 | 100 |

(แสดง 7 แถวล่าสุด · รอบที่ skipped ใกล้ 100 คือ setup ล้มแล้วเคสที่เหลือถูก skip ตาม dependency)

### คำสั่งที่ได้ case id กับ error ต่อเคส

ไฟล์ jq (เก็บที่ scratchpad ตอนวิจัย ไม่ได้ commit):

```
def walk_specs: (.specs[]?), (.suites[]? | walk_specs);
.suites[] | walk_specs as $s | $s.tests[]
| select(.status=="unexpected" or .status=="flaky")
| "\(.status)\t\(.projectName)\t\($s.file) line \($s.line)\t\($s.title)\t\(([.results[].error.message // empty][0] // "") | gsub("\u001b\\[[0-9;]*m";"") | split("\n")[0] | .[0:110])"
```

รัน: jq -r -f fails.jq ~/ols-qa-testing-bot/out/dev-smoke-2026-10-08-1552/run.json · ใช้ error แรกที่มี ไม่ใช่ attempt สุดท้าย เพราะเคส flaky attempt สุดท้ายผ่านและ error เป็น null (เจอจริงในรอบแรกที่ลอง)

ผลจริง รอบ dev-smoke-2026-10-08-1552:

| status | project | spec และบรรทัด | case | error บรรทัดแรก |
|---|---|---|---|---|
| unexpected | guest | specs/media-list-view.spec.ts บรรทัด 1046 | MLV-008 · empty search shows the not-found message | expect(locator).toBeVisible() failed |
| unexpected | learner | specs/media-list-view.spec.ts บรรทัด 1934 | MLV-030 · "ทบทวนอีกครั้ง" + all-complete when finished | expect(locator).toBeVisible() failed |
| unexpected | creator | specs/profile-page.spec.ts บรรทัด 2688 | CML-006 · manage-media returns only rows matching the typed keyword | no non-RGS media row was available to take a keyword from (list held 12 row(s)) · a fixture condition |
| unexpected | learner | specs/trending-feed.spec.ts บรรทัด 598 | FEED-124 · กดแสดงเพิ่มเติมบนหน้าเทรน... | each populated section starts collapsed at 6 |

ผลจริง รอบ dev-smoke-2026-10-07-1108: MLV-004 (TimeoutError locator.click 15000ms), MLV-008, MLV-009 flaky learner (expect(received).toBe(expected)), MLV-030, MLV-010 creator, FEED-124 · MLV-008, MLV-030, FEED-124 ไม่ผ่านซ้ำทั้งสองรอบ

หลักฐานต่อเคส (trace, screenshot, video) อยู่ในโฟลเดอร์ artifacts ของ workdir เดียวกัน เพราะ config ตั้ง trace retain-on-failure, screenshot only-on-failure, video retain-on-failure (playwright.config.ts บรรทัด 94 ถึง 96) · ไฟล์ในโฟลเดอร์ล่าสุด: artifacts, run.log, link.jsonl, run.json, 20261008-Playwright-Test-Report.html

ถ้าวันหน้า smoke-dev.yml ถูกใช้จริง: gh run download RUN_ID -R Thitic9203/ols-qa-e2e -n smoke-dev-RUN_NUMBER แล้วรัน jq เดียวกันกับ report.json ในนั้น

### round-json

round-json/results.PHASE.json เกิดจาก scripts/run-staged.sh (JSON_DIR="round-json" บรรทัด 51) ซึ่งเป็นรอบ pre-prod แบบแบ่ง phase ไม่ใช่ dev · ใน checkout มี 3 ไฟล์ เริ่ม 2026-09-12 (results.1-role.json, results.2-guest.json, results.3-responsive-tablet.json) · โครงเป็น Playwright JSON เหมือนกัน ใช้ jq ตัวเดียวกันได้ · ทั้ง round-json และ round-artifacts ถูก gitignore

## 3. กติกาของเรโปเรื่องการแก้เทส

จาก CLAUDE.md ของ origin/main (ภาษาไทยปนอังกฤษ ไม่มีกติกาตั้งชื่อ branch และไม่มีเรื่อง PR review):

- ต้องยืนยัน env กับ user ก่อนรันของจริงทุกครั้ง ห้ามเลือกเอง · dev และ pre-prod ต้อง VPN · คำสั่งที่ไม่แตะ env: typecheck, lint, format:check, PW_LIST_ONLY=1 npx playwright test --list, gate:* ยกเว้น gate:data และ gate:tickets (บรรทัด 84 ถึง 101) · กติกานี้ชนกับขั้น "รันซ้ำบน dev อัตโนมัติ" ของ MAP ต้องให้เจ้าของยืนยัน dev ไว้ล่วงหน้าเป็นลายลักษณ์อักษร
- เทสแดงห้ามปิดด้วย test.skip, test.fixme หรือ retry เพิ่ม · gate:standards ปฏิเสธ test.fixme (บรรทัด 304 ถึง 305)
- Suite standards: waitForTimeout ถูก lint แบน · selector อยู่ใน POM ที่เดียว POM ห้ามมี expect · ลำดับ locator getByRole, getByLabel, getByTestId, ข้อความไทย แล้วค่อย CSS · ทุกเคสมี safety tag หนึ่งตัวพอดี (@safe, @mutates, @destructive) · ห้าม expect(await locator.count()) · caseId frozen มาจาก catalog ห้ามตั้งเอง · networkidle เฉพาะ allow-list (บรรทัด 365 ถึง 376)
- Definition of done 7 ข้อ: typecheck, lint, gate ที่เกี่ยว (แก้ spec หรือ tag ต้อง gate:standards + gate:caseid + gate:eritems อย่างน้อย), --list ยืนยันว่าเคสอยู่ใน lane ที่ตั้งใจ, ถ้าแตะ runtime รัน lane นั้นบน env ที่ user ยืนยันแล้วแปะ output จริง, format:check, commit แบบ conventional พร้อม scope (บรรทัด 405 ถึง 415)
- ทำได้เลย: แก้ selector ที่พังให้กลับมาเขียว (root cause จริง ไม่ใช่ sleep), เพิ่ม helper หรือ fixture ใหม่ที่ไม่กระทบของเดิม · ต้องถามก่อน: ผ่อนหรือถอด gate, rename หรือลบ POM fixture spec ที่มีเคสอื่นใช้, แตะ lane retry worker ใน playwright.config.ts, เพิ่ม dependency (บรรทัด 417 ถึง 430)
- ภาษาในโค้ด comment commit doc: English (บรรทัด 434) · ห้ามเปิดบัคที่ไม่ใช่บัค verify สเปกก่อน (บรรทัด 142) · ห้าม --no-verify (บรรทัด 343)

Flaky:
- playwright.config.ts บรรทัด 21 ถึง 23: RETRY_READ = 2, RETRY_MUTATE = 0 (อ่าน retry ได้ เขียนห้าม) · บรรทัด 57: failOnFlakyTests: true · บรรทัด 54: forbidOnly: isCI
- PR #31 chore/fail-on-flaky-tests: "any run that contains a flaky case now exits non-zero" ตามคำตัดสินเจ้าของ 2026-10-14
- README.md บรรทัด 93: tag @quarantine "known-flaky, excluded from the gate" มีอยู่ในเรโปแล้ว · การใช้ต้องถือเป็นทางลัดที่เจ้าของตัดสินเอง ไม่ใช่ขั้นอัตโนมัติ (กฎข้อ 7 และ 25 ของเรา)

Test ID: caseId แบบ module prefix เช่น MLV-001 สร้างโดย npm run pull:catalog เป็น frozen (README.md บรรทัด 102 ถึง 104) · title ใน run.json ขึ้นต้นด้วย caseId ตามด้วย " · " ในต้นฉบับเป็นขีดยาว

Branch และ PR (จากของจริง ไม่ใช่กฎที่เขียน): gh pr list 15 ใบล่าสุด (#26 ถึง #40) ชื่อ branch แบบ feat/, fix/, chore/ ตามด้วย kebab case · MERGED ทั้งหมด reviewDecision ว่าง author Thitic9203 · ไม่มี .github/pull_request_template (ใน .github มีแค่ workflows) · repo settings: squash, merge, rebase เปิดทั้งหมด, delete_branch_on_merge false, allow_auto_merge false · branch protection และ rulesets ตอบ HTTP 403 "Upgrade to GitHub Pro or make this repository public" · ไม่มี workflow ที่ trigger บน pull_request ดังนั้น PR ไม่มี CI ตรวจ ผู้แก้ต้องรัน gate เอง

คำสั่งใน package.json (origin/main, Playwright 1.61.1):

| ต้องการ | คำสั่ง |
|---|---|
| ทั้งชุด | npm test (= playwright test) หรือแบบ pre-prod staged: npm run test:preprod:staged |
| ไฟล์เดียว | TARGET_ENV=dev npx playwright test tests/e2e/specs/media-list-view.spec.ts --project=guest |
| เคสเดียว | TARGET_ENV=dev npx playwright test --grep "MLV-008" --project=guest |
| ซ้ำหลายรอบ | เพิ่ม --repeat-each=N (ตัวเลือกมาตรฐานของ Playwright) |
| ดูว่าเคสไหนถูกเลือก ไม่แตะ env | PW_LIST_ONLY=1 npx playwright test --list |
| gate หลังแก้ spec | npm run typecheck · npm run lint · npm run format:check · npm run gate:standards · npm run gate:caseid · npm run gate:eritems |

ชุด smoke dev ที่เทียบได้กับรอบจริงต้องใช้ arg ชุดเดียวกับ smoke_watch.py (grep @safe, grep-invert จาก excluded-cases.json, 5 project, 7 spec) ไม่ใช่ npm test เฉยๆ

## 4. โค้ดที่ใช้ร่วมกันและวิธีหาเคสที่กระทบ

โครงจาก docs/ARCHITECTURE.md บรรทัด 5 ถึง 20: tests/e2e/fixtures (test.ts คือ base.extend authed page ต่อ role, learner-pool lease, CleanupRegistry · helpers.ts คือ pollUntil, assertHost, clearOverlays ฯลฯ) · tests/e2e/pages (POM 21 ไฟล์) · tests/e2e/data (catalog) · tests/e2e/specs (26 spec) · tests/e2e/config, setup, api

คำสั่งหาไฟล์ที่ import ตรง (import ใช้ path แบบ relative ลงท้าย .js):

```
git -C ~/GitHub/ols-qa-e2e grep -lE "from '[./]+(pages/)?MediaListPage(\.js)?'" origin/main -- tests/e2e
```

ได้ 8 spec: authentication, live-streaming, media-list-view-lot2, media-list-view, navigation, regression-pins, responsive-boundaries, trending-feed

ข้อจำกัดสำคัญ: import ตรงไม่พอ · fixtures/helpers ถูก import โดย fixtures/test.ts, POM 16 ไฟล์, setup/mint.ts และ spec 19 ไฟล์ · spec ทั้ง 26 ไฟล์ import fixtures/test ดังนั้นการแก้ helpers.ts หรือ fixtures/test.ts กระทบทุก spec และต้องรันชุดเต็ม · ทางที่คิดพึ่งพาได้กว่าคือ Playwright --only-changed=REF (มีใน 1.61.1, help บอก "Only run test files that have been changed between 'HEAD' and 'ref'") ซึ่งตามเอกสาร Playwright นับ test file ที่ import ไฟล์ที่เปลี่ยนด้วย · ใช้คู่กับ --list ก่อนเพื่อดูรายชื่อโดยไม่แตะ env

## 5. สกิลที่เข้ากับแต่ละขั้น

| ขั้นใน MAP | สกิล | input | output |
|---|---|---|---|
| คัดแยก | flaky-test-doctor (~/.claude/skills/flaky-test-doctor/SKILL.md) | Playwright JSON report, test-results (trace.zip, screenshot, video), ประวัติรันซ้ำของ commit เดียวกัน · "Never classify from a stack trace alone" | รายงานต่อเคส: classification (product, test, environment, data, unknown), determinism, หลักฐาน, fix ที่เสนอ · ไม่แก้โค้ดเองถ้าไม่อนุมัติ · ระบุว่า retry ไม่ใช่การแก้ |
| แก้ | playwright-best-practices (~/.claude/skills/playwright-best-practices/SKILL.md, currents.dev v1.2) | อาการหรือหัวข้อ (locator, waiting, POM, flaky, debugging) | แนวทางและ reference ต่อหัวข้อ เช่น --repeat-each=5 และ show-trace · ไม่ได้สร้าง diff เอง |
| กักเคส (เฉพาะเจ้าของสั่ง) | flaky-test-quarantine (~/.claude/skills/flaky-test-quarantine/SKILL.md) | รายชื่อเคส flaky และประวัติ retry | registry quarantine, tag, งาน CI แยก · ขัดกับกฎเรโปที่ห้ามกลบด้วย retry หรือ skip และกฎข้อ 7 ของเรา จึงไม่ใช่ขั้นอัตโนมัติ · เรโปมี @quarantine ของตัวเองอยู่แล้ว |
| รีวิว | code-review (built-in ของ Claude Code ไม่มีไฟล์ SKILL.md) | diff ปัจจุบัน, เลข PR, branch หรือ path พร้อมระดับ effort · --comment โพสต์ inline บน PR | findings ด้าน correctness · ทางเลือก engineering:code-review (ไฟล์ SKILL.md ใน plugin knowledge-work-plugins) รับ "PR URL, diff, or file path" ตรวจ security, performance, correctness |

## 6. token GitHub บนเครื่องนี้

```
gh auth status
  ✓ Logged in to github.com account Thitic9203 (keyring)
  - Token scopes: 'delete_repo', 'gist', 'read:org', 'repo', 'workflow'
gh api repos/Thitic9203/ols-qa-e2e --jq .permissions
  {"admin":true,"maintain":true,"pull":true,"push":true,"triage":true}
```

เปิด PR และ merge ได้ในทางเทคนิค ไม่มี protection มากั้น · ข้อควรระวัง: token เดียวกันมี delete_repo · ไม่ได้ทดลองสร้างอะไร

## ผลต่อ MAP งานที่สอง

- ขั้น 1 รับงาน: แหล่งคือ run.json ของ smoke-watch ใน ~/ols-qa-testing-bot/out ไม่ใช่ GitHub run · ถ้าต้องการให้เป็น GitHub run ต้องเปลี่ยนไปใช้ smoke-dev.yml ก่อน (เป็นงานแยก ต้องถามเจ้าของ)
- ขั้น 4 และ 7: ต้องรันจาก worktree ของ origin/main ไม่ใช่ checkout หลักที่ล้าหลัง 68 commit · ต้องมีคำยืนยัน env dev ตามกฎเรโป · runner เป็นเครื่องเดียวกับที่รัน CI ของ pluton-timesheet และ smoke มี single-flight lock ร่วมกับ pre-prod
- ขั้น 6: ช่องทางแจ้งในเรโปเดิมเป็น Discord DM และ Slack ช่อง QA · Slack DM ตามที่เจ้าของสั่งเป็นของใหม่
- ขั้นกักเคส: ไม่ควรอยู่ใน loop อัตโนมัติ

## Not verified

- ไม่ได้ยืนยันว่า Playwright --only-changed นับ dependency แบบ transitive ใน 1.61.1 ด้วยการรันจริง อ้างจาก help และเอกสาร Playwright เท่านั้น
- ไม่ได้รันเทสหรือ gate ใดในเรโป ols-qa-e2e และไม่ได้ทดลองคำสั่งรันเคสเดียวบน dev (ต้องยืนยัน env ก่อนตามกฎเรโป)
- ไม่ได้อ่าน smoke_watch.py ทุกบรรทัด อ่านเฉพาะช่วง 60 ถึง 76, 228 ถึง 240, 306 ถึง 491 · ไม่ได้อ่าน deploy_trigger.py
- ไม่ได้อ่าน docs/ci.md, POSTMORTEMS.md และ GATES.md ทั้งไฟล์
- ไม่ได้ยืนยันว่าแต่ละโฟลเดอร์ใน out มาจาก launchd หรือรันมือ ตัดสินจากชื่อโฟลเดอร์
- smoke-dev.yml มี 0 run ณ วันที่วิจัย ไม่ได้ตรวจว่าเคยถูกปิดหรือตั้งใจไม่ใช้
