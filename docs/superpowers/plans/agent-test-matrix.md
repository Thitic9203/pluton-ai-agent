# Agent test matrix

แผนข้อ 9 ของ [always-on-dev-agent.md](always-on-dev-agent.md): เทสต์ครบทุกชั้นสำหรับ workflow ใหม่ (กฎ global ข้อ 18)

## Scope

ตรวจทุกอย่างที่ PR ของ agent เพิ่ม บน branch `lane-e-17oct` (ฐาน PR #496 head `97cfa9c08`):

- `.github/workflows/agent.yml`, `agent-sweep.yml`, `agent-main-audit.yml`
- `scripts/agent/cli.mjs`, `dispatch.mjs`, `gates.mjs`, `merge-check.mjs`, `main-audit.mjs`, `sweep.mjs`

`agent-release.yml` และ `scripts/agent/slack-notify.mjs` ยังไม่มีบน branch นี้ และเป็นงานของ lane อื่น (แถว 6, 12, 14, 15) จึงไม่อยู่ในตารางนี้

## How to run

```
TZ=UTC node --test scripts/lib/agent-*.test.mjs
```

ไม่มี network ไม่มี browser: ทุกการเรียก GitHub API ใช้ fetch ปลอม เทสต์ชุดนี้อยู่ใน `npm run test:scripts` (glob `scripts/**/*.test.mjs`) จึงรันใน CI โดยไม่ต้องเพิ่ม config

## Test files

| File | Tests | Layer |
|---|---|---|
| `scripts/lib/agent-gates.test.mjs` | 32 | unit: gates.mjs |
| `scripts/lib/agent-dispatch.test.mjs` | 15 | unit: dispatch.mjs |
| `scripts/lib/agent-merge-check.test.mjs` | 28 | unit: merge-check.mjs |
| `scripts/lib/agent-main-audit.test.mjs` | 21 | unit: main-audit.mjs |
| `scripts/lib/agent-sweep.test.mjs` | 42 | unit + runSweep กับ API ปลอม |
| `scripts/lib/agent-cli.test.mjs` | 34 | unit: helper ของ cli.mjs |
| `scripts/lib/agent-workflow.test.mjs` | 36 | static: โครง YAML ของสาม workflow |
| `scripts/lib/agent-cli-commands.test.mjs` (ใหม่) | 25 | integration: ทุกคำสั่งของ cli ผ่าน `main()` กับ API ปลอม |
| **รวม** | **233** | |

## Matrix: exported functions

ช่อง Test คือไฟล์ที่เรียกชื่อนั้นตรงๆ (นับจาก grep ชื่อในไฟล์เทสต์) ช่อง Status: `covered` มีอยู่แล้ว, `added` เพิ่มในงานนี้

### gates.mjs

| Export | Test | Status |
|---|---|---|
| `OWNER` | agent-gates, agent-cli | covered |
| `isOwnerAct` | agent-gates, agent-cli | covered |
| `parseCommand` | agent-gates, agent-cli | covered |
| `planHashOf` | agent-gates, agent-cli | covered |
| `gateState` | agent-gates, agent-cli | covered |

### dispatch.mjs

| Export | Test | Status |
|---|---|---|
| `LIMIT` | agent-dispatch, agent-cli | covered |
| `decide` | agent-dispatch, agent-cli-commands (ผ่าน dispatch) | covered |
| `nextFromQueue` | agent-dispatch, agent-cli-commands (ผ่าน drain) | covered |

### merge-check.mjs

| Export | Test | Status |
|---|---|---|
| `OWNER_LOGIN` | agent-merge-check | covered |
| `mergeVerdict` | agent-merge-check, agent-cli-commands (ผ่าน merge-check) | covered |
| `formatReport` | agent-merge-check, agent-cli-commands | covered |

### main-audit.mjs

| Export | Test | Status |
|---|---|---|
| `auditCommits` | agent-main-audit, agent-cli-commands (ผ่าน main-audit) | covered |

### sweep.mjs

| Export | Test | Status |
|---|---|---|
| `SWEEP_LABEL`, `SWEEP_BOT_LOGIN`, `FILED_LABELS`, `CAPS`, `ROLES` | agent-sweep | covered |
| `todoFinding`, `issuesWithoutDoneFinding`, `coverageFinding` | agent-sweep | covered |
| `issueTitle`, `parseMarker`, `issueBody`, `duplicateComment`, `postedBy` | agent-sweep | covered |
| `evidenceIsNew`, `isRecent`, `planSweep`, `costStop` | agent-sweep | covered |
| `collectFindings`, `runSweep` | agent-sweep | covered |
| `readSourceFiles` | agent-cli-commands | **added** |

### cli.mjs: helpers

| Export | Test | Status |
|---|---|---|
| `MERGE_JOB_NAME` | agent-cli, agent-workflow, agent-cli-commands | covered |
| `REVIEW_STATUS_CONTEXT` | agent-cli | covered |
| `AGENT_BRANCH_PREFIX` | agent-cli-commands | **added** |
| `IN_FLIGHT` | agent-cli-commands | **added** |
| `entersBuilding` | agent-cli-commands | **added** (ก่อนหน้านี้ทดสอบผ่าน dispatchDecision เท่านั้น ไม่มีเคส "building อยู่แล้ว") |
| `dispatchDecision` | agent-cli | covered |
| `readyLabeledByFromTimeline`, `prForSha` | agent-cli | covered |
| `agentContext`, `gateSummary`, `githubPathsTouched`, `prStep` | agent-cli | covered |
| `parseNameStatus`, `gitAuthEnv`, `branchFiles`, `handoffProblem` | agent-cli | covered |
| `planMarker`, `withMerger`, `rangeShortfall`, `withoutOwnCheckRun` | agent-cli | covered |
| `reviewResultsFromStatuses`, `auditShape`, `outputLines` | agent-cli | covered |
| `nextPage`, `collectPages`, `api` | agent-cli | covered |
| `LABEL_FOR`, `queueLabelChanges`, `splitFindings` | agent-cli | covered |

### cli.mjs: commands (main)

ก่อนงานนี้ `main()` ถูกทดสอบแค่สามทาง: คำสั่งที่ไม่รู้จักออก 2, `sweep` หยุดที่ event file ที่ไม่มี, `merge-check` กับ `main-audit` ปฏิเสธเมื่อไม่มี `AGENT_APP_LOGIN` ตัวคำสั่งจริงไม่เคยถูกรันในเทสต์เลย งานนี้รันทุกคำสั่งผ่าน `main()` กับ fetch ปลอม แล้วตรวจทุก request ที่ส่งออก ค่าใน `GITHUB_OUTPUT` และ exit code

| Command | Case | Test | Status |
|---|---|---|---|
| `dispatch` | owner ติด agent:ready, ไม่มีงาน building: เริ่มงาน ติด agent:building | agent-cli-commands | **added** |
| `dispatch` | คนอื่นติด agent:ready: ignore ไม่แตะ label | agent-cli-commands | **added** |
| `dispatch` | ถึง LIMIT: queue, ถอด state เดิมที่อ่านจาก issue ปัจจุบัน, ติด agent:queued | agent-cli-commands | **added** |
| `dispatch` | ถอด agent:building: drain คิว เลือก issue ที่ owner ติด ready ข้ามอันที่คนอื่นติด | agent-cli-commands | **added** |
| `dispatch` | drain แต่คิวว่าง: ignore | agent-cli-commands | **added** |
| `dispatch` | CI ของ branch agent จบ: หา PR จาก sha แล้ว merge-check | agent-cli-commands | **added** |
| `dispatch` | sha ไม่มี PR ของ agent ที่เปิดอยู่: ignore | agent-cli-commands | **added** |
| `context` | เขียนไฟล์ context: เห็นของ owner กับ App, ซ่อนคนอื่น, มี gate state | agent-cli-commands | **added** |
| `context` | ไม่มี ISSUE หรือ AGENT_CONTEXT_FILE: ปฏิเสธ | agent-cli-commands | **added** |
| `merge-check` | ครบทุกอย่างบน head: comment พร้อม marker, exit 0, ตัด check ของตัวเองออก | agent-cli-commands | **added** |
| `merge-check` | review status ของ App เป็น failure แม้ token อื่นตั้ง success: exit 1 | agent-cli-commands | **added** |
| `merge-check` | ไม่มี approval ของ owner และ check แดง: ขึ้นทั้งสองข้อ | agent-cli-commands | **added** |
| `merge-check` | ไม่มีเลข PR: ปฏิเสธก่อนยิง request ใดๆ | agent-cli-commands | **added** |
| `main-audit` | commit ของคน: exit 0 ไม่ block | agent-cli-commands | **added** |
| `main-audit` | commit ของ App ที่ owner merge: exit 0 | agent-cli-commands | **added** |
| `main-audit` | commit ของ App ไม่มี PR: block เฉพาะ issue ที่อยู่ใน IN_FLIGHT | agent-cli-commands | **added** |
| `main-audit` | compare ได้ commit ไม่ครบ: exit 1 แบบ fail closed ไม่ block agent | agent-cli-commands | **added** |
| `pull-request` | hand-off ผิดรูป (issue หรือ sha): ปฏิเสธก่อน request และก่อน git | agent-cli-commands | **added** |
| `pull-request` | เปิด PR, block เมื่อแตะ `.github/` | ยังไม่มีระดับ main(); ตรรกะ `prStep` และ `branchFiles` ทดสอบใน agent-cli | gap (ดู Gaps) |
| `plan-marker` | พิมพ์ marker จากไฟล์ ไม่ใช้ network; ไม่มีไฟล์ปฏิเสธ | agent-cli-commands | **added** |
| `sweep` | ทั้งคำสั่ง | `runSweep` กับ API ปลอมใน agent-sweep; main() ใน agent-cli ถึงแค่ event file | covered (ระดับ runSweep) |
| ทุกคำสั่ง | ขาดตัวแปร GitHub ตัวใดตัวหนึ่งในสี่ตัว: ปฏิเสธ | agent-cli-commands | **added** |

## Matrix: workflow jobs

ไฟล์เทสต์: `scripts/lib/agent-workflow.test.mjs` (static, อ่าน YAML) ร่วมกับเทสต์ของคำสั่งที่ job นั้นรัน

| Workflow | Job | Runs | Static test | Command test |
|---|---|---|---|---|
| agent.yml | `dispatch` | `cli.mjs dispatch` | permission, AGENT_ENABLED, no expression in run, ubuntu-latest, concurrency หนึ่งงานทั้ง repo, ไม่จอง runner ให้ event ที่ไม่สน | agent-cli-commands (7 เคส) |
| agent.yml | `agent` | `cli.mjs context` แล้ว agent | กลุ่มเดียวกับ issue, รายการ tool, push เฉพาะ branch ตัวเอง, แก้ `.github/` ไม่ได้, ไม่มี wildcard | agent-cli-commands (context 2 เคส) |
| agent.yml | `open-pr` | `cli.mjs pull-request` | job แยกที่มี gate, checkout แล้วค่อยรัน, ubuntu-latest | agent-cli-commands (เฉพาะการปฏิเสธ) |
| agent.yml | `review` | reviewer | ubuntu-latest, summary ถูกจำกัดความยาว | ไม่มีสคริปต์ของเราในขั้นนี้ |
| agent.yml | `merge-check` | `cli.mjs merge-check` | ชื่อ job ตรงกับ `MERGE_JOB_NAME` | agent-cli-commands (4 เคส) |
| agent-sweep.yml | `sweep` | `cli.mjs sweep` | วันละครั้งกับรันมือ, AGENT_SWEEP_ENABLED, เขียน issue อย่างเดียว, dispatch เป็น dry run | agent-sweep (runSweep) |
| agent-main-audit.yml | `audit` | `cli.mjs main-audit` | ห้าข้อทั่วไปของทุกไฟล์ (permission, AGENT_ENABLED, no expression, ubuntu-latest, ไม่มี OIDC) | agent-cli-commands (4 เคส) |

## Proof the new tests can fail

แก้ `scripts/agent/cli.mjs` ชั่วคราวสองจุด (ให้ main-audit block ทุก issue ที่มี label `agent:*` แทน IN_FLIGHT และตัดเงื่อนไข "building อยู่แล้ว" ของ `entersBuilding`) แล้วรันไฟล์ใหม่: fail 2 จาก 25 ตรงสองเทสต์ที่คุมจุดนั้น จากนั้นคืนไฟล์ด้วย `git checkout` ไม่มีการแก้โค้ดจริงค้างอยู่

## Bugs found

ไม่พบบัคในโค้ดเดิม เทสต์ใหม่ทุกตัวผ่านกับโค้ดของ PR #496 head `97cfa9c08` โดยไม่ต้องแก้ `scripts/agent/*`

## Gaps

| Gap | Why left | Next |
|---|---|---|
| `pull-request` ทางเปิด PR และทาง block ระดับ `main()` | ต้องมี git repo กับ remote จริงเพราะ `branchFiles` รัน `git fetch` ใน cwd; ตรรกะตัดสินใจ (`prStep`, `branchFiles`, `handoffProblem`) ทดสอบแล้วใน agent-cli | เทสต์ที่สร้าง bare repo ใน temp dir เป็น origin แล้ว `chdir` เข้าไป |
| `sweep` ระดับ `main()` จนจบ | ต้องอ่าน `e2e-coverage.mjs` ของทั้ง repo; `runSweep` ทดสอบกับ API ปลอมแล้ว | ไม่จำเป็นถ้า runSweep ครบ |
| job `review` ของ agent.yml | ไม่มีสคริปต์ของเรา เป็น action ภายนอก | ทดลองจริงกับ issue ทดสอบตามแผนข้อ 10 |
| E2E ของทั้ง loop บน GitHub จริง | ต้องใช้ App และ repo จริง อยู่นอกขอบเขตเทสต์ที่ไม่ใช้ network | แผนข้อ 10 (ทดลองจริงกับ issue ทดสอบ 1 ใบ) |
