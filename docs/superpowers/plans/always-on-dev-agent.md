# Always-on Dev Agent: Master Plan

> Owner: @Thitic9203 · Updated: 2026-10-20 · Scope: agent ที่ทำงานได้แม้ Mac ปิด รับ requirement จาก GitHub issue ใน repo นี้ → วางแผน → เขียนโค้ด → ทดสอบ → นำขึ้น staging (`taskfolio-staging`) · เจ้าของอนุมัติ 3 จุด (Gate 1, Gate 2 และ approve PR ของ Gate 3 ที่ merge check ตรวจ `scripts/agent/merge-check.mjs:78`) · gate mock ถอดออก 17 Oct 2026 (เจ้าของ "ต่อไปไม่สน mock เหมือนไม่เคยมีขั้นตอนนี่", docs/sdd/remove-mock-first R10; เดิม "3 จุด (Gate 1, mock, Gate 2)") · PO/BA triage (App) ติด `agent:ready` เองได้บน issue ที่ collaborator เปิด ตั้งแต่ 17 Oct 2026 (Decisions Q1, R103) · Gate 3 เป็นของ Tech Lead และรอบ release เป็นของ QA Lead (เดิม "เจ้าของอนุมัติ 4 จุด" เปลี่ยนตาม [agent-workflow-and-economy](agent-workflow-and-economy.md) ข้อ 2a, 2b) · production ยังเป็นมือคน (QA Lead สั่ง `deploy-production.yml`)
>
> **แผนคู่:** [agent-workflow-and-economy](agent-workflow-and-economy.md) เก็บบทบาท สกิล การจำ sweep รอบ release Slack และเศรษฐกิจของทีม · แผนนี้เป็นแผนหลักของตัว agent (สถาปัตยกรรม gate ความเสี่ยง และแถวงาน) · เรื่องที่อยู่ในแผนคู่ ส่วนนี้ลิงก์ไป ไม่คัดลอกซ้ำ

---

## Implementation Progress

| No. | Topic | Status | PR/Commit |
| :---: | :--- | :---: | :--- |
| 1 | วางแผนและตัดสินใจครบ 17 ข้อ (wayfinder map `always-on-dev-agent`) | ✅ | <a href="https://claude.ai/artifact/PtxqqUiv3HrLjJaadg7Ppq" target="_blank" rel="noopener noreferrer">Live board ↗</a> (2026-10-14) |
| 2 | พิสูจน์ว่า routine ใช้ GitHub App identity ไม่ได้ ด้วยการทดสอบจริง | ✅ | <a href="https://github.com/Thitic9203/agent-identity-test/pull/2" target="_blank" rel="noopener noreferrer">agent-identity-test #2 ↗</a> (2026-10-13) |
| 3 | เก็บแผนนี้ในเรโป และบันทึกลง DECISION_LOG กับ RISK_REGISTER (R80 ถึง R83) | ✅ | `3db9aaa9a` (2026-10-14) · log และ register R80 ถึง R83 `5206a7007` · ตัดสิน Q1 ถึง Q5 และ Q7 และ R81 retired `d34b74a27` |
| 4 | สร้าง GitHub App ตัวจริงของ agent ติดตั้งเฉพาะ repo นี้ ต้องได้รับอนุญาตจากเจ้าของก่อน (กฎ global ข้อ 23) | ✅ | App `taskfolio-dev-agent` สร้างโดยเจ้าของ ติดตั้งเฉพาะ repo นี้ (15 Oct 2026, DECISION_LOG "Always-on dev agent: owner accepts R80, R88 and R89 ...") |
| 5 | วางค่าที่ workflow อ่าน โดยเจ้าของเป็นคนวางเอง: secret `CLAUDE_CODE_OAUTH_TOKEN` และ `AGENT_APP_PRIVATE_KEY` · variable `AGENT_APP_CLIENT_ID` (client ID ของ App ตาม `actions/create-github-app-token` v3 ที่ให้ใช้ `client-id` แทน `app-id`) และ `AGENT_APP_SLUG` · `AGENT_ENABLED` ตั้งเป็นอย่างสุดท้ายหลังเงื่อนไขในสถานะสรุปครบ | ✅ | secret `AGENT_APP_PRIVATE_KEY` และ `CLAUDE_CODE_OAUTH_TOKEN` เจ้าของใส่เอง, variable `AGENT_APP_CLIENT_ID`, `AGENT_APP_SLUG`, `AGENT_QA_LEAD` ตั้งแล้ว (`gh secret list`, `gh variable list` 15 Oct 2026) · ~~`AGENT_ENABLED` ยังไม่ตั้ง (16 Oct 2026)~~ superseded: `AGENT_ENABLED=true` ตั้งเมื่อ 2026-10-16T16:50:30Z และ `AGENT_TRIAGE_ENABLED=true` (แถว 18) ตั้งเมื่อ 2026-10-16T18:36:29Z (`gh variable list` 17 Oct 2026) · อัปเดต 20 Oct 2026: `AGENT_TRIAGE_ENABLED` ถูกตั้งใหม่เมื่อ 2026-10-19T09:28:47Z ค่า `true` (`gh variable get` 20 Oct 2026) และ secret `CLAUDE_CODE_OAUTH_TOKEN` ถูกออกใหม่เมื่อ 2026-10-19T09:42:03Z (`gh secret list` ชื่อและเวลาอย่างเดียว) · `AGENT_SWEEP_ENABLED` ยังไม่ตั้ง ซึ่งเป็นของแถว 16 ไม่ใช่ของข้อนี้ · การรันจริงพิสูจน์ในข้อ 10 |
| 6 | ทุก workflow ที่ PR เริ่มได้ รัน PR ที่ branch ขึ้นต้นด้วย `agent/issue-` หรือที่ bot เปิด (`pull_request.user.type == 'Bot'`) บน GitHub-hosted (`ubuntu-latest`) เท่านั้น ห้ามถอยกลับไปใช้ Mac เพราะโค้ดของ agent ห้ามรันบน Mac (R88) · ถ้าโควตาหมด ไม่มีทางถอยกลับไป Mac และไม่มี job ติด label เพิ่ม เพราะ run ที่แดงหยุด Gate 3 อยู่แล้ว (PR แยก, กฎ global ข้อ 5) · แก้ 2026-10-14 จาก "ถ้าโควตาหมดให้กลับไปใช้ Mac" ตามรีวิวแผน R1 · แก้ 2026-10-16 ให้ตรงกับที่สร้างจริง (เจ้าของ 16 Oct 2026 popup "แก้ข้อความให้ตรงของจริง"): เดิมเขียน `agent/*` ทั้งหมดและ "ติด `agent:blocked`" แต่ตัดให้แคบลงตามรีวิวอิสระ เพื่อไม่ให้ branch เลนของเจ้าของ (`agent/row8-workflows`) ย้ายออกจาก Mac (DECISION_LOG "Always-on dev agent: rows 6, 9, 12, 13, 14 and 15 built in six lanes on PR #496") | ✅ | สร้างแล้วใน PR #496 (lane A `0dd8a0f68`, รีวิวอิสระแล้ว) · merge เข้า `main` แล้ว (`293c3b866`, 15 Oct 2026) · บน `main` ทุก job ของ `ci.yml` รัน PR จาก `agent/issue-` หรือ PR ที่ bot เปิดบน `ubuntu-latest` (`ci.yml:78`) ซึ่งแคบกว่า `agent/*` และไม่มี job ติด label เพราะ run ที่แดงหยุด Gate 3 อยู่แล้ว (ตาม DECISION_LOG entry ด้านหลัง) · DECISION_LOG "Always-on dev agent: rows 6, 9, 12, 13, 14 and 15 built in six lanes on PR #496" |
| 7 | เพิ่มข้อยกเว้นของ agent ใน CLAUDE.md ตามแบบกฎข้อ 20 (PR แยก) | ✅ | ร่าง hard constraint 21 ผ่านรีวิวอิสระที่ <a href="https://github.com/Thitic9203/pluton-timesheet/pull/494" target="_blank" rel="noopener noreferrer">PR #494 ↗</a> (2026-10-14) · ขึ้น `main` เป็น docs commit `aa0c349ef` (15 Oct 2026, วันนี้อยู่ที่ CLAUDE.md:252 หลังกฎ 7 เขียนใหม่ 17 Oct 2026) แล้วปิด PR #494 แบบไม่ merge (CLOSED 2026-10-15T10:05:32Z, คอมเมนต์ปิดใน PR) |
| 8 | workflow ของ agent: dispatcher และคิว (Q2), state labels, ตรวจ gate, merge job ที่ตรวจและรายงาน (Q3), job รีวิวแยก (Q5), workflow ตรวจ commit ของ App บน `main` (Q3) และ concurrency (PR แยก) | ✅ | สร้างบน `agent/lane-a-gates`, `agent/lane-b-merge`, `agent/lane-c-workflows` แล้วรวมเป็น head `agent/row8-workflows` ผ่านรีวิวอิสระ (เลน A 4 รอบ, B 4 รอบ, C 6 รอบด้านความปลอดภัย) ทุก job ปิดด้วย `vars.AGENT_ENABLED` · 235 เทสต์ผ่านในเครื่อง · CI run 38528055760 (sha `82d695cd1`): job "Security rules" แดง ส่วน job อื่นที่รันเขียว · PR นี้ไม่แก้ rules (14 ไฟล์อยู่ใต้ `scripts/`, `.github/`, `docs/`) และ job เดียวกันแดงบน `main` ตั้งแต่ run 38447942912 (`5e7cddec4`, 13 Oct) · สาเหตุ: ไม่มีเทสต์ตก (`not ok` = 0 ทั้งสอง run) ชุดเทสต์ rules รันเกิน 600s เพราะ Mac มี load สูงจากนอก CI · ตัวแก้คือ CI รอ Mac ต่ำกว่า 5 load ต่อ core ก่อนเริ่ม (DECISION_LOG "Round 42 load" 14 Oct) · อัปเดต 15 Oct: ตัวรอ load อยู่บน `main` แล้ว (`scripts/lib/ci-turn.mjs:252` "busy ceiling per core", commit `f522035d6`) แต่ PR นี้ยังไม่มี CI run ใหม่หลัง run 38528055760 (`gh run list --branch agent/row8-workflows`) และ check "Security rules" ของ PR ยังเป็น FAILURE · อัปเดต 15 Oct (ตรวจซ้ำ): CI รันใหม่แล้วที่ run 38649868102 (sha `d2927a186`, หลังรวม PR #499) "Security rules" ไม่แดงแล้ว แต่ job "Configuration, scripts and audits" แดงที่เทสต์ `not ok 3145 - every shipped workflow keeps each Playwright browser inside its own runner` (`scripts/lib/playwright-browsers-path.test.mjs:103`) ต้องแก้ใน PR ให้เขียว แล้วให้ Tech Lead หรือเจ้าของ merge ที่ <a href="https://github.com/Thitic9203/pluton-timesheet/pull/496" target="_blank" rel="noopener noreferrer">PR #496 ↗</a> (2026-10-14) · อัปเดต 16 Oct: PR #496 MERGED 2026-10-15T14:02:42Z (`293c3b866`) · บน `main` มี workflow 4 ตัว `agent.yml`, `agent-main-audit.yml`, `agent-release.yml`, `agent-sweep.yml` สถานะ active ทุก run เป็น skipped เพราะยังไม่ตั้ง `AGENT_ENABLED` (agent 20, main-audit 21, release 5, sweep 1 · `gh workflow list --all`, `gh run list --workflow <file> --limit 30` 16 Oct 2026) · อัปเดต 17 Oct (ข้อความ 16 Oct ด้านหน้า superseded หลังตั้ง `AGENT_ENABLED`): 30 run ล่าสุด `agent.yml` skipped 30 (job dispatch รับ `workflow_run` เฉพาะ branch `agent/issue-` ซึ่งยังไม่มี, `agent.yml:80` ถึง `:86`), `agent-main-audit.yml` success 11 skipped 19 (ล่าสุด 39025697085 success), `agent-release.yml` success 5 skipped 12 (ล่าสุด 39027733220: job แรก success อีก 2 job skipped), `agent-sweep.yml` skipped 2, `agent-triage.yml` (ตัวใหม่ แถว 18) failure 1 · `gh workflow list --all` มี workflow ของ agent 5 ตัว (เพิ่ม `agent-triage.yml`) และ `Deploy Agent Office` · อัปเดต 20 Oct 2026 (30 run ล่าสุดต่อ workflow): `agent.yml` success 6 skipped 24 (success ทั้ง 6 เป็น event `issues` 2026-10-19T09:43:58Z ถึง 09:44:04Z ตอน triage ติด `agent:needs-info` ไม่มี issue ที่เริ่มงาน), `agent-main-audit.yml` success 30, `agent-release.yml` success 12 skipped 12, `agent-sweep.yml` skipped 4, `agent-triage.yml` success 2 failure 4 skipped 1 (ดูแถว 18) |
| 9 | เทสต์ครบทุกชั้นสำหรับ workflow ใหม่ (กฎ global ข้อ 18) | ✅ | ตาราง coverage `docs/superpowers/plans/agent-test-matrix.md` และเทสต์คำสั่ง 25 ข้อใน PR #496 (lane E `05626b712`, รีวิวอิสระ APPROVE) · เทสต์ agent และ workflow 410 ข้อผ่านบน branch รวม · อยู่บน `main` แล้วผ่าน PR #496 (`293c3b866`, 15 Oct 2026) |
| 10 | ทดลองจริงกับ issue ทดสอบ 1 ใบ ให้เดินครบทุก gate (Gate 1, Gate 2, Gate 3; gate mock ถอดออก 17 Oct 2026) จนถึงรอบ release ตาม Success Criteria | ⬜ | ยังไม่มี · issue ที่ติด `agent:ready` 0 ใบ และ PR จาก `agent/issue-*` 0 ใบ (`gh issue list --label agent:ready --state all` คืน "No Issues", `gh pr list --state all --search head:agent/issue-` คืน "No Pull Requests" 17 Oct 2026) · `AGENT_ENABLED` ตั้งแล้ว (ข้อ 5) จึงเหลือแค่ issue แรกที่ได้ `agent:ready` จากเจ้าของหรือจาก PO/BA triage (แถว 18) · อัปเดต 20 Oct 2026: การทดลอง 19 Oct (DECISION_LOG "Always-on dev agent: the go-live trial of 19 Oct") เลือก #510 ให้เจ้าของติด `agent:ready` แต่ timeline ของ #510 ไม่มี event `labeled` เลย และ #510 ยัง OPEN ไม่มี label (`gh api .../issues/510/timeline` 20 Oct 2026) · ตัวแก้ของ #510 อยู่บน `main` แล้วที่ `7d78e3103` (16 Oct 2026, `git merge-base --is-ancestor`) · `agent:ready` ยัง 0 ใบ และ PR จาก `agent/issue-` ยัง 0 ใบ (20 Oct 2026) · `release/next` ถูกดันตาม main เมื่อ 19 Oct เป็น `1b55b00df` และวันนี้ตาม `main` ไม่ทัน 37 commit (`git rev-list --count origin/release/next..origin/main`) · แก้วันเดียวกัน: ดัน `release/next` ตาม main เป็น `07a38c05c` แล้ว (`git rev-parse origin/release/next` 20 Oct 2026) · การดันอัตโนมัติยังไม่มี (DECISION_LOG "Agents run every day on their own ...") |
| 11 | Agent Office: หน้าแสดงงานของ agent แบบโฮมออฟฟิศ isometric ย้ายไปใช้โปรเจกต์อื่นได้ (หัวข้อ "Agent Office (visualization)") | 🟡 | V1 และ V2 ปิดแล้ว, V3 และ V4 กำลังทำ, V5 ยัง `status: open` (ไฟล์ตั้งค่าใช้บน production แล้ว แต่ ticket ยังไม่ปิด) · map [agent-office](../../wayfinder/agent-office/MAP.md) (2026-10-14) · อัปเดต 17 Oct 2026 (ไม่ใช่ prototype อย่างเดียวแล้ว): production https://agent-office-prod.pages.dev ตอบ HTTP 200 และ `version.txt` = `449014e27` (17 Oct 2026) · สเปก [agent-office-live](../../sdd/agent-office-live/spec.md) ถึง R73 (R66 ถึง R73 แก้หลังขึ้น production) · หน้า sign-in ขึ้นก่อน และบัญชีเงินจริงเริ่มที่ `economyStart` 2026-10-16 (`agent-office/projects.config.json:59`, วันที่ตั้ง `AGENT_ENABLED` ตาม R66) · `deploy-agent-office.yml` 30 run ล่าสุด success 26 failure 4 · ยัง 🟡 เพราะ ticket V3, V4, V5 ใน map ยัง `status: open` และ map ยังไม่ปิด · อัปเดต 20 Oct 2026: production ตอบ HTTP 200 และ `version.txt` ยังเป็น `449014e27` · `deploy-agent-office.yml` 30 run ล่าสุด success 7 cancelled 22 failure 1 (ล่าสุด 39363132224 success, 39363097526 failure) · V3, V4, V5 ยัง `status: open` |
| 12 | ทางหลัง merge ถึงรอบ release: เมื่อ `deploy-staging` ของ commit ที่ merge จาก `agent/issue-N` เขียว ให้ติด `agent:on-test-env` รัน `scripts/staging-smoke.mjs` แล้วนับ issue บน `release/next` ครบ 10 แจ้ง QA Lead · QA รัน regression บน staging ส่งผลเข้า Slack · ผ่านครบ QA Lead deploy production แล้วปิดทุก issue ในรอบ (รีวิวแผน R2) · ของที่ต้องสร้าง (branch `release/next`, `agent.yml` เปิด PR เข้า branch นั้น, job นับคิว, สิทธิ์ QA Lead สั่ง `deploy-production.yml`) อยู่ใน [agent-workflow-and-economy](agent-workflow-and-economy.md) ข้อ 2b | ✅ | `agent-release.yml` ใน PR #496 (lane C `e4f603f69`) อยู่บน `main` แล้ว (`293c3b866`, 15 Oct 2026) ยังไม่เคยรันจริง ทุก run skipped (5 run, 16 Oct 2026) พิสูจน์ในข้อ 10 · อัปเดต 17 Oct 2026: หลังตั้ง `AGENT_ENABLED` มี run success 5 ครั้ง (ล่าสุด 39027733220 job "Label staged agent issues and read staging success" success, job นับคิวและ job release skipped) ยังไม่มี issue ของ agent ให้ติด label ทางหลัง merge จึงยังพิสูจน์ในข้อ 10 · อัปเดต 20 Oct 2026: 30 run ล่าสุด success 12 skipped 12 (ล่าสุด 39363091129 success) ยังไม่มี issue ของ agent · `release/next` สร้างแล้วจาก `aa0c349ef` (`git ls-remote --heads origin release/next` 16 Oct 2026) · DECISION_LOG "Always-on dev agent: rows 6, 9, 12, 13, 14 and 15 built in six lanes on PR #496" |
| 13 | `scripts/pr-budget.mjs` ไม่นับ PR ของ agent ในเพดาน 7 PR ตามข้อยกเว้นกฎข้อ 8 ของ constraint 21 (รีวิวแผน R3) | ✅ | ใน PR #496 (`97cfa9c08`, `f0e05e0a0`, `e7bb07947`, รีวิวอิสระ APPROVE) · นับเฉพาะ PR ของ App เอง · อยู่บน `main` แล้ว (`293c3b866`; `scripts/pr-budget.mjs:16`, `:64`) |
| 14 | แจ้ง Slack ทุกจังหวะ (เริ่มงาน, ขอตัดสินใจ Gate 1 และ Gate 2 (ประกาศ mock ถอดออก 17 Oct 2026), แจ้ง Gate 3 merge, รอบ release ถึง QA Lead, ติดปัญหา, จบงาน) 1 เธรดต่อ issue ใน `C0C8TSRK1PE` ตามรูปแบบแผน feedback loop (เจ้าของ 14 Oct 2026) · รายละเอียดใน [agent-workflow-and-economy](agent-workflow-and-economy.md) ข้อ 8 · คำถามหรือเรื่องที่ต้องให้เจ้าของอนุมัติ ส่งเข้า DM Slack ของเจ้าของแล้วรอคำตอบในเธรดก่อนทำต่อ (หัวข้อ "กฎการทำงานของทีม agent" ด้านล่าง) | ✅ | DM ใช้งานได้ (AI Agent Bot, ตอบใน 30 วินาที) · เธรดต่อ issue ใน `C0C8TSRK1PE` สร้างแล้วใน PR #496 (lane D `c8cc4fb81`, รีวิวอิสระ APPROVE) อยู่บน `main` แล้ว (`293c3b866`, `scripts/agent/slack-notify.mjs`) |
| 15 | แก้ branch protection และ `agent.yml` ให้ Tech Lead merge เข้า `release/next` (เจ้าของ 14 Oct 2026) · รายละเอียดใน [agent-workflow-and-economy](agent-workflow-and-economy.md) ข้อ 2a · คำถามค้าง: `main` ไม่มี branch protection (`gh api .../branches/main` คืน `"protected":false`) และ API ของ rulesets ตอบ 403 "Upgrade to GitHub Pro or make this repository public" (15 Oct) ตัดสินแล้ว 15 Oct 2026: branch protection คงเป็นแบบตรวจหลังเกิดเหตุ ไม่ใช้แพ็กเกจเสียเงิน (DECISION_LOG "Agent team: Slack DM approvals start as notify-only for GitHub gates, branch protection stays detect-only") · ส่วน `agent.yml` ให้ Tech Lead merge เข้า `release/next` ทำแล้วใน PR #496 | ✅ | PR ของ agent เข้า `release/next` และ Tech Lead step merge เอง ใน PR #496 (lane B `ab93b8394`) อยู่บน `main` แล้ว (`293c3b866`, `agent.yml` อ้าง `release/next` 12 บรรทัด) · branch protection คงแบบตรวจหลังเกิดเหตุ (ตัดสิน 15 Oct 2026) |
| 16 | sweep หาจุดบอด: `scripts/agent/sweep.mjs` (เทสต์ก่อน), คำสั่ง `sweep` ใน `cli.mjs`, workflow `agent-sweep.yml` รันวันละครั้งพร้อม `workflow_dispatch` ต่อจาก PR #496 ปิดด้วย `AGENT_SWEEP_ENABLED` · กติกาเปิดใบอยู่ในหัวข้อ "กฎการทำงานของทีม agent" | ✅ | PR #499 merge เข้า `agent/row8-workflows` แล้ว (14 Oct 2026 22:46 UTC) และ PR #496 merge เข้า `main` แล้ว (`293c3b866`) · `agent-sweep.yml:38` ปิดไว้จนตั้ง `AGENT_ENABLED` และ `AGENT_SWEEP_ENABLED` ซึ่งยังไม่มีทั้งคู่ ("was not found", `gh variable get` 16 Oct 2026) · อัปเดต 17 Oct 2026: `AGENT_ENABLED` ตั้งแล้ว (ข้อ 5) ส่วน `AGENT_SWEEP_ENABLED` ยังไม่มี (`gh variable get AGENT_SWEEP_ENABLED` คืน "variable AGENT_SWEEP_ENABLED was not found") run ตามตาราง 38865974390 และ 39011994607 จึง skipped · อัปเดต 20 Oct 2026: `AGENT_SWEEP_ENABLED` ยังไม่มี ("was not found") และ run ตามตาราง 4 ครั้งล่าสุด skipped ทั้งหมด (ล่าสุด 39218702841) · แก้วันเดียวกัน: ตั้ง `AGENT_SWEEP_ENABLED=true` แล้วตามคำสั่งเจ้าของ "Agent ทำเองอัตโนมัติทุกวัน ทุกครั้งไม่ต้องให้บอกนะ" (DECISION_LOG "Agents run every day on their own ..." 20 Oct 2026) และสั่ง dry run 39370124292 · เทสต์ 223 ข้อผ่าน (15 Oct) · [agent-workflow-and-economy](agent-workflow-and-economy.md) ข้อ 2c · ✅ หมายถึงสร้างเสร็จและอยู่บน `main` ตามขอบเขตของข้อนี้ ซึ่งระบุว่าปิดด้วย `AGENT_SWEEP_ENABLED` · การเปิดใช้นับรวมกับข้อ 10 และ `AGENT_ENABLED` (เจ้าของ 16 Oct 2026 popup "คง ✅ พร้อมหมายเหตุว่าปิดไว้") |
| 17 | รับงานจากหลายโปรเจกต์: OLS QA บน Jira และงานซ่อม e2e ใน `ols-qa-e2e` (ขอบเขตแถวนี้คือสเปก · ~~ยังไม่สร้างระบบ~~ superseded 17 Oct 2026: ตัวจริงอยู่แถว 19) | ✅ | สเปกครบ: แมพ [multi-project-intake](../../wayfinder/multi-project-intake/MAP.md) ปิดครบ P1 ถึง P10 (15 Oct 2026, `f7a946b85`) · ~~ระบบรับงานจริงยังไม่สร้าง~~ superseded 17 Oct 2026: สร้างแล้ว ดูแถว 19 · ✅ หมายถึงสเปกของแถวนี้ ตามแบบแถว 16 |
| 18 | PO/BA triage: App รีวิว issue ที่ collaborator เปิด แล้วติด `agent:ready` หรือ `agent:needs-info` เอง (สูงสุด 3 ใบต่อรอบ) เติมข้อมูลจากแหล่งในเรโป และ DM เจ้าของเฉพาะเรื่องที่ไม่มีแหล่ง (เจ้าของ 17 Oct 2026 "ให้ agent PO หรือ BA ไปทำหน้าที่ รีวิวงานและติดลาเบลและเริ่มทำตามกระบวนการได้เลย") | 🟡 | สเปก [agent-po-triage](../../sdd/agent-po-triage/spec.md) · `agent-triage.yml` (`3efd2618e`) รันวันละครั้ง (`agent-triage.yml:22`) ทุกครั้งที่เปิด issue ใหม่ (`:23` ถึง `:24`) และสั่งด้วยมือได้ (`:25`) ปิดด้วย `AGENT_ENABLED` และ `AGENT_TRIAGE_ENABLED` ซึ่งตั้งแล้วทั้งคู่ · DECISION_LOG "The PO/BA agent triages issues and applies agent:ready" (17 Oct 2026) · RISK_REGISTER R103 open · run แรก 39012662586 (17 Oct 2026) **failure** ที่ step "Judge each candidate": "--json-schema was provided but Claude did not return structured_output" ~~ยังไม่ได้หาสาเหตุ~~ แก้ 20 Oct 2026: สาเหตุจริงคือ "Failed to authenticate. API Error: 401 OAuth access token is invalid." ของ `CLAUDE_CODE_OAUTH_TOKEN` (run 39107576556, DECISION_LOG "The triage apply job runs in the staging environment, and a failed judge annotates its real error" 19 Oct 2026, spec R14, R15) · เจ้าของออก token ใหม่ 2026-10-19T09:42:03Z แล้ว run 39232074073 และ 39232940427 (19 Oct 2026, `workflow_dispatch`) success ทั้ง job judge และ job apply · ~~label `agent:needs-info` ยังไม่มี~~ แก้ 20 Oct 2026: label มีแล้ว App (`taskfolio-dev-agent[bot]`) ติดให้ 10 issue ที่เปิดอยู่ (#39, #41, #43, #46, #96, #97, #99, #100, #101, #105) เมื่อ 2026-10-19T09:44 และยังไม่มีใบที่ได้ `agent:ready` · ยัง 🟡 เพราะสเปกยัง Status: draft, R103 open และ triage ยังไม่เคยพาใบใดเข้าสู่ `agent:ready` |
| 19 | OLS agent ตัวจริง: รับงาน Jira ของ OLS, รัน ols-qa แบบ headless มีเพดาน, ร่างผลส่ง Slack DM ก่อนเขียนกลับ (แถว 17 เป็นสเปก) | 🟡 | สเปก [ols-real](../../sdd/ols-real/spec.md) (Status: draft) · `b6bd77c4e` "feat(ols): the OLS agent for real" และ `888d48a43` อยู่บน `main` (`git merge-base --is-ancestor` 17 Oct 2026) · ~~Desktop scheduled task `ols-agent` ติดตั้งแล้ว รันครั้งแรกวันจันทร์ (`docs/ACTION_ITEMS.md` State 17 Oct 2026 02:00)~~ แก้ 19 Oct 2026: ยังไม่ได้ลงทะเบียน (`list_scheduled_tasks` 19 Oct 2026 ตอบ "No scheduled tasks found" มีแค่ไฟล์ `~/.claude/scheduled-tasks/ols-agent/SKILL.md`) และ `claude -p` ของ runner ล็อกอินไม่ได้ทุกงานจึง `failed` · runner ใหม่รันใต้ล็อกอินของ session ที่ตั้งเวลา (ols-real R4, R17 ถึง R19) รอเจ้าของอนุมัติการลงทะเบียน · รันบน Mac ไม่ใช่ GitHub Actions · variable `OLS_BOARD` (การ์ด OLS ใน Agent Office, ols-real R13, E4) ยังไม่มีใน `gh variable list` 17 Oct 2026 · อัปเดต 20 Oct 2026: `list_scheduled_tasks` ยังตอบ "No scheduled tasks found" · branch `fix/ols-agent-host-login` (`5db18feb7`, ทาง `ols-qa-worker` ของ R4, R17 ถึง R19) ยังไม่อยู่บน `main` และ `.claude/agents/` ยังไม่มีบน `main` · สเปก [ols-retest-procedure](../../sdd/ols-retest-procedure/spec.md) และ ols-real R20 ขึ้น `main` แล้วที่ `0e36516bf` (20 Oct 2026) ส่วน branch `feat/ols-retest-procedure-guards` (`8ee83c0b3`) ยังไม่อยู่บน `main` · RISK_REGISTER R107 "open: awaiting the owner" · `OLS_BOARD` ยังไม่มี (`gh variable get` 20 Oct 2026) · เจ้าของสั่ง 20 Oct 2026 ให้ agent รันเองทุกวัน: ลงทะเบียน `ols-agent` หลัง branch ทั้งสองผ่านรีวิวอิสระและขึ้น `main` ในรอบ (DECISION_LOG "Agents run every day on their own ...") |

> **Status legend:** ✅ Done · 🟡 In progress · ⬜ To Do · ❌ Failed · 🚫 Blocked
>
> **Updated:** 20/10/2026 (Bangkok), ตรวจซ้ำ (CatchAI) กับ `main` ที่ `0c6e1feef` (`gh variable list`, `gh variable get`, `gh secret list` ชื่อและเวลาอย่างเดียว, `gh run list --workflow <file> --limit 30` ของ agent 5 ตัวและ `deploy-agent-office.yml`, `gh issue list --label agent:ready` และ `agent:needs-info`, `gh pr list --state all --search head:agent/issue-`, `gh api .../issues/510/timeline`, `git rev-list --count origin/release/next..origin/main`, `git merge-base --is-ancestor`, `list_scheduled_tasks`, `curl -k` ของ `version.txt`, DECISION_LOG entry ของ agent ทั้งสามของ 19 Oct, RISK_REGISTER R103, R107, R112, R113, wayfinder agent-office): แถว 18 หาสาเหตุแล้ว (401 OAuth) และ triage รันสำเร็จหลังออก token ใหม่ · แถว 10 ยัง ⬜ (#510 ไม่เคยได้ `agent:ready`) · แถว 19 ยังไม่ลงทะเบียน scheduled task · ตัวเลขสถานะสรุปไม่เปลี่ยน
>
> **Updated ก่อนหน้า (17 Oct):** 17/10/2026 (Bangkok), ตรวจซ้ำ (CatchAI) กับ `main` ที่ `449014e27` (`gh variable list`, `gh variable get AGENT_SWEEP_ENABLED`, `gh secret list` ชื่ออย่างเดียว, `gh workflow list --all`, `gh run list --workflow <file> --limit 30` ของ agent 5 ตัวและ `deploy-agent-office.yml`, `gh run view 39012662586`, `gh label list --search agent`, `gh issue list --label agent:ready --state all`, `gh pr list --state all --search head:agent/issue-`, `git merge-base --is-ancestor`, `curl -k` ของ `version.txt` บน agent-office-prod, RISK_REGISTER, DECISION_LOG, CLAUDE.md, `docs/sdd/remove-mock-first`, `docs/sdd/agent-po-triage`, `docs/sdd/ols-real`, `docs/sdd/agent-office-live`, map agent-office): ข้อ 5 เป็น ✅ (`AGENT_ENABLED`, `AGENT_TRIAGE_ENABLED` ตั้งแล้ว) · เพิ่มแถว 18 (PO/BA triage, run แรก failure) และแถว 19 (OLS agent ตัวจริง) · ข้อ 11 มี production แล้ว · ข้อ 17 ข้อความ "ยังไม่สร้างระบบ" superseded · gate mock ถอดออกตามเจ้าของ 17 Oct 2026 · R103 open
>
> **Updated ก่อนหน้า (16 Oct):** 16/10/2026 (Bangkok), ตรวจซ้ำ (CatchAI) กับ `main` ที่ `235dc262e` (`gh pr view 494 496 499`, `gh variable list`, `gh variable get`, `gh secret list` ชื่ออย่างเดียว, `gh workflow list --all`, `gh run list`, `gh label list --search agent`, `git ls-remote`, RISK_REGISTER, DECISION_LOG): PR #496 MERGED 2026-10-15T14:02:42Z (`293c3b866`) แถว 6, 8, 9, 12 ถึง 16 จึงเป็น ✅ · PR #494 CLOSED ไม่ merge ส่วน constraint 21 ขึ้น `main` ที่ `aa0c349ef` แถว 7 จึงเป็น ✅ · R80, R88, R89 "accepted (owner 15 Oct 2026)" และ Q6 ปิดด้วยคำยืนยันของเจ้าของ · บน `main` มี workflow `agent*.yml` 4 ตัว active ทุก run skipped, label `agent:*` 9 ตัวกับ `release:batch-ready`, secret 2 ตัวและ variable `AGENT_APP_CLIENT_ID`, `AGENT_APP_SLUG`, `AGENT_QA_LEAD` แล้ว · `AGENT_ENABLED` และ `AGENT_SWEEP_ENABLED` ยังไม่ตั้ง
>
> **Updated ก่อนหน้า:** 15/10/2026 (Bangkok) รอบสอง, ตรวจซ้ำ (CatchAI) กับ `main` ที่ `f7a946b85`, RISK_REGISTER, DECISION_LOG, แมพ multi-project-intake และ PR #494, #496, #499 (`gh pr view`, `gh run list`): เลขความเสี่ยงของ agent ชนกับแผน E2E อีกรอบ จึงเปลี่ยนเป็น R88 และ R89, แถว 8 ตัวที่แดงเปลี่ยนเป็นเทสต์ Playwright browsers path, แถว 14 ส่วน DM ใช้งานได้, แถว 15 ตัดสิน branch protection แล้ว, แถว 16 อยู่ใน #496, แถว 17 สเปกครบ · บน `main` ยังไม่มี workflow หรือ label `agent:*` จนกว่า PR #496 merge และไม่มี secret หรือ variable ของ agent จนกว่าจะทำข้อ 5

**สถานะสรุป (20 Oct 2026):** เสร็จ 15 จาก 19 ข้อ · กำลังทำ 3 ข้อ (11, 18, 19) · ยังไม่เริ่ม 1 ข้อ (10) · triage ทำงานแล้ว (run 39232940427 success, 10 ใบได้ `agent:needs-info`) แต่ยังไม่มีใบใดได้ `agent:ready` จึงยังไม่มี run ของ agent ที่ทำงานจริง · OLS agent ยังไม่ลงทะเบียน scheduled task

**สถานะสรุป ก่อนหน้า (17 Oct 2026, superseded):** เสร็จ 15 จาก 19 ข้อ · กำลังทำ 3 ข้อ (11, 18, 19) · ยังไม่เริ่ม 1 ข้อ (10) · agent เปิดแล้ว (`AGENT_ENABLED=true` 2026-10-16T16:50:30Z) แต่ยังไม่มี issue ที่ติด `agent:ready` จึงยังไม่มี run ของ agent ที่ทำงานจริง · triage run แรก (39012662586) failure ต้องหาสาเหตุก่อนนับแถว 18 เสร็จ

**สถานะสรุป ก่อนหน้า (16 Oct 2026, superseded):** เสร็จ 14 จาก 17 ข้อ · กำลังทำ 2 ข้อ (5, 11) · ยังไม่เริ่ม 1 ข้อ (10) · ข้อ 7 ขึ้น `main` ที่ `aa0c349ef` (PR #494 CLOSED ไม่ merge) และข้อ 6, 8, 9, 12 ถึง 16 ขึ้น `main` ผ่าน PR #496 (MERGED 2026-10-15T14:02:42Z, `293c3b866`) · เงื่อนไขก่อนเปิดใช้ agent ครบแล้ว: ข้อ 4, 6, 12, 13, 15 เสร็จ, Q6 และ R80, R88, R89 เจ้าของตัดสินแล้ว 15 Oct 2026 (DECISION_LOG "Always-on dev agent: owner accepts R80, R88 and R89, confirms Q6, allows the GitHub App") · ที่เหลือของข้อ 5 คือเจ้าของตั้ง `vars.AGENT_ENABLED` (ยังไม่มี 16 Oct 2026) แล้วทดลองข้อ 10 · ข้อ 4 และ 5 สร้างของในบัญชี GitHub และวาง secret ซึ่งเจ้าของต้องทำหรืออนุญาตเอง (กฎ global ข้อ 23)

---

## Goal / Objectives

- เมื่อเปิด GitHub issue ใหม่ใน repo นี้ agent จะทำงานจนผลไปอยู่บน staging ได้เอง โดยไม่ต้องเปิด Mac ไว้ ⬜
- เจ้าของอนุมัติ Gate 1, Gate 2 และ approve PR ของ Gate 3 จากมือถือได้ (gate mock ถอดออก 17 Oct 2026) · Tech Lead รีวิวและ merge เข้า `release/next` หลังเจ้าของ approve · release เป็นของ QA Lead ⬜
- ไม่มีค่าใช้จ่ายใหม่: ใช้บัญชี Max ที่มีอยู่ และใช้ GitHub Actions ภายในโควตาฟรี (กฎ global ข้อ 3) ⬜

> **ทำ:** pilot ของตัว agent ที่ repo `Thitic9203/pluton-timesheet` env `staging` · หน้า Agent Office (แถว 11) อ่านได้หลายโปรเจกต์ผ่านไฟล์ตั้งค่า · **ไม่ทำใน pilot:** agent deploy production เอง (QA Lead สั่งตามรอบ release), สร้างระบบรับงานจาก repo อื่นหรือจาก Jira · อัปเดต 14 Oct 2026: เจ้าของสั่ง "อยากให้ AI Agent นี้ รับงานจากหลาย project ได้ เช่น รับงานจาก OLS on Jira" ตอนนี้จึงทำเป็นสเปกในแถว 17 ก่อน (แมพ multi-project-intake, "ปลายทางเป็นสเปก ... ไม่สร้างหรือรันระบบในแมพนี้") · อัปเดต 17 Oct 2026: ข้อ "ไม่ทำใน pilot: สร้างระบบรับงานจาก Jira" superseded: OLS agent สร้างจริงแล้ว (แถว 19, `docs/sdd/ols-real`) รันบน Mac ผ่าน Desktop scheduled task `ols-agent` ไม่ได้รันผ่าน workflow ของ agent ใน GitHub Actions · ข้อ "agent deploy production เอง" ยังไม่ทำเหมือนเดิม

---

## Architecture & Tech Stack

- **Runtime**: GitHub Actions + `anthropics/claude-code-action` ใช้ OAuth token ของบัญชี Max (`claude setup-token`)
  - ไม่ใช้ Claude Code routine เพราะทดสอบจริงเมื่อ 2026-10-13 แล้วพบว่า proxy ของ routine เขียนคอมเมนต์และ PR ในนาม Thitic9203 (`User`, `performed_via_github_app=claude`) ไม่ว่าจะตั้ง `GH_TOKEN` เป็นอะไร
- **Environments**: `staging` = `taskfolio-staging` (https://taskfolio-staging.web.app) deploy ผ่าน job `deploy-staging` เดิม · production = manual dispatch ด้วย SHA เดิม
- **Auth / Access**:
  - agent ทำงานใน GitHub ในนาม GitHub App ของตัวเอง (`<app>[bot]`) ได้ token จาก `actions/create-github-app-token`
  - สิทธิ์ของ App: Contents, Issues, Pull requests และ Commit statuses ไม่มีสิทธิ์ admin และไม่มีสิทธิ์ Workflows (การแก้ `.github/workflows/` จะถูกปฏิเสธ) · แต่ละ job ขอเฉพาะที่ใช้ผ่าน `permission-*` (Q3): `agent` เขียน contents, issues, pull requests · `open-pr` อ่าน contents เขียน issues, pull requests · `review` อ่านอย่างเดียว · ตั้งผลรีวิวใช้ statuses กับ pull requests · การตรวจงบด้วย `budgetVerdict` ต้องเพิ่ม actions: read (ดู UNVERIFIED)
  - ข้อจำกัด: สิทธิ์ของ GitHub App กำหนดราย branch ไม่ได้ Contents: write จึงครอบทั้งเรโปรวมถึง `main` และเรโปนี้ไม่มี branch protection แปลว่า App เขียนเข้า `main` ตรงได้โดยไม่ผ่าน merge job (Q3, R82)
  - staging deploy ใช้ `FIREBASE_SERVICE_ACCOUNT_STAGING` (step "Publish the app to staging" ใน job `deploy-staging` ของ `ci.yml`) ไม่ผูกกับ Mac · job ของ `ci.yml` วันนี้เลือก runner จาก `vars.RUNNER` (Mac) ซึ่งข้อ 6 เปลี่ยนแล้วให้ CI ของ PR จาก `agent/issue-` หรือที่ bot เปิดรันบน GitHub-hosted เท่านั้น (R88, `ci.yml:78` บน `main` 16 Oct 2026) · WIF ใช้บน GitHub-hosted ได้ (run 35281541749 "Scheduled jobs" บน `ubuntu-latest`) แต่ run นี้ไม่ได้พิสูจน์การ publish ด้วย key secret (ดู UNVERIFIED)
- **Storage / State**: state เก็บใน label `agent:*` บน issue ส่วน plan เก็บในคอมเมนต์ของ bot (มี marker และ hash) ควบคู่กับไฟล์ `.agent/issue-N/plan.md` บน branch
- **Tag / Filter convention**:

  | Label | ความหมาย |
  | :--- | :--- |
  | `agent:ready` | เจ้าของ หรือ PO/BA triage (App) ติดเพื่อให้ agent เริ่มงาน issue นี้ (Decisions Q1 แก้ 17 Oct 2026) |
  | `agent:needs-info` | PO/BA triage ติดเมื่อ issue ยังขาดข้อมูล · BA/TL/QA เติมจากแหล่งในเรโป แล้ว triage ซ้ำ · ถามเจ้าของทาง Slack DM เฉพาะเมื่อไม่มีแหล่ง · ครบ 3 รอบ DM ช่องว่าง (docs/sdd/agent-po-triage) · ~~label ยังไม่มีในเรโป 17 Oct 2026~~ มีแล้ว 19 Oct 2026 ติดอยู่บน 10 issue (`gh issue list --label agent:needs-info` 20 Oct 2026) |
  | `agent:queued` | มีงาน `agent:building` ครบ 3 ใบแล้ว รอ dispatcher หยิบ (Decisions Q2) |
  | `agent:planning` | agent โพสต์ plan แล้ว รอ Gate 1 |
  | `agent:test-planning` | โพสต์ test plan แล้ว รอ Gate 2 |
  | `agent:building` | กำลังเขียนโค้ดบน `agent/issue-N` |
  | `agent:in-review` | PR เปิดอยู่ รอ Gate 3 |
  | `agent:merging` | merge job กำลังตรวจ approval และ CI |
  | `agent:on-test-env` | อยู่บน staging แล้ว รอรอบ release ของ QA Lead |
  | `agent:blocked` | ติดปัญหาที่อยู่นอกโค้ด (การรอ publish mock ของ Decisions Q4 ถอดออก 17 Oct 2026) |

- **Gates**:

  | Gate | วิธีอนุมัติ | ถ้าไม่ผ่าน |
  | :---: | :--- | :--- |
  | 1 Plan | คอมเมนต์ `/approve-plan` | `/revise <เหตุผล>` |
  | ~~Mock (เฉพาะ issue ที่แตะ UI)~~ | **removed 17 Oct 2026, owner** ("ต่อไปไม่สน mock เหมือนไม่เคยมีขั้นตอนนี่"; docs/sdd/remove-mock-first R10) · issue ที่แตะ UI ไปจาก Gate 1 ถึง Gate 2 ตรง · `/approve-mock` ไม่นับเป็น gate อีก | ไม่มี |
  | 2 Test plan | คอมเมนต์ `/approve-tests` | `/revise <เหตุผล>` |
  | 3 PR | Tech Lead รีวิวด้วย `code-review` ผ่านและ CI เขียวแล้ว merge เองเข้า `release/next` · **merge job** (ไม่ใช่ LLM) ตรวจและรายงานใน PR ว่า review ล่าสุดบน head SHA เป็น APPROVED โดย `Thitic9203` (`type == User`), job รีวิวแยกให้ APPROVE และ CI เขียว (Decisions Q3, Q5) | request changes |
  | Release | QA Lead deploy production หลัง regression ผ่านครบ แล้วปิดทุก issue ในรอบ | `/revise <เหตุผล>` |

  - การอนุมัติจะนับก็ต่อเมื่อ `sender.login == "Thitic9203"` และ `sender.type == "User"` และคอมเมนต์นั้นต้องไม่ถูกแก้ไข
  - ถ้าแก้ plan หลังอนุมัติ การอนุมัตินั้นเป็นโมฆะ
  - **PO ประเมินขนาดก่อน Gate 1** (docs/sdd/agent-office-live/spec.md R60, 16 Oct 2026): ใน plan comment หรือคอมเมนต์ของ App หลัง plan นั้น PO โพสต์บรรทัด `<!-- agent-office:size {"v":1,"size":"M","rules":6,"files":4,"risk":["ui"],"score":15} -->` และติด label `size:S`, `size:M`, `size:L` หรือ `size:XL` หนึ่งอัน · `rules` = จำนวนกฎในสเปก, `files` = จำนวนไฟล์ในตารางไฟล์ของ plan, `risk` = `ui` (แตะ UI หรือ mock), `rules` (`firestore.rules`), `workflows` (workflow หรือ secret), `data` (schema หรือ migration) · score = rules + files + 5 × จำนวน risk · S ≤ 6, M 7 ถึง 15, L 16 ถึง 30, XL มากกว่า 30 · `gateState` ของ `scripts/agent/gates.mjs` (โหมด `requireSize` ที่ context ของ agent ใช้) ไม่นับ `/approve-plan` จนกว่า App จะโพสต์ size marker ที่ถูกรูปแบบและไม่ถูกแก้ไขก่อนคำสั่งนั้น
  - `/revise` ใช้ได้ไม่จำกัดรอบ
- **หลักฐานรอบ release: ผล regression ใน Slack พร้อม sha**: คอมเมนต์เดียวที่อ่านบนมือถือได้ ประกอบด้วย ตารางจับคู่ test plan กับ PASS/FAIL, SHA ที่ deploy บน staging, ลิงก์ Playwright report ของ E2E ใน CI บน sha เดียวกัน, ผล `scripts/staging-smoke.mjs` และรูป 3 viewport (≥1280, 768 ถึง 1024, ≤430) × 2 theme (Decisions Q7: ไม่ใช้ credential บัญชีทดสอบ)
- **Cleanup strategy**: ใช้ branch `agent/issue-N` แยกต่อ issue · แต่ละ issue มี concurrency group `agent-issue-N` · เป้าหมายคือทำพร้อมกันได้สูงสุด 3 issue ใบที่เกินต้องรอในคิว
  - คิว: concurrency group ราย issue ไม่จำกัดจำนวนรวมทั้งเรโป และ group ที่ไม่ใส่ `queue: max` ทิ้ง run ที่รออยู่ได้ จึงออกแบบใหม่ตาม Q2 และสร้างแล้วใน PR #496: dispatcher อยู่ใน group เดียวทั้งเรโป `agent-dispatch` (`queue: max`) และนับเพดาน 3 เอง · group ราย issue `agent-issue-N` ก็ใช้ `queue: max` · คำอนุมัติอ่านจากประวัติคอมเมนต์ทุกครั้ง จึงไม่หายแม้ run ที่รอถูกยกเลิก
- **CI chain**: `agent-triage.yml` (PO/BA, วันละครั้ง, ตอนเปิด issue ใหม่ หรือสั่งด้วยมือ, แถว 18) หรือเจ้าของ ติด `agent:ready` → `issues.labeled` (`agent:ready`) / `issue_comment` / `pull_request_review` → dispatcher → agent workflow (GitHub App token + claude-code-action) → job รีวิวแยก → `open-pr` → merge job ตรวจและรายงาน → Tech Lead merge เข้า `release/next` → ครบ 10 → QA Lead เปิดรอบ → main CI → `deploy-staging` → QA regression → Slack → QA Lead deploy production · ทุก job ของ agent รันบน `ubuntu-latest` (R88) · ช่วงหลัง `deploy-staging` สร้างแล้วใน `agent-release.yml` (แถว 12, บน `main` ที่ `293c3b866`) แต่ยังไม่มี issue ของ agent ให้ทำงานจริง (17 Oct 2026: success 5 run ซึ่งทำงานแค่ job แรก ส่วน job ที่เหลือ skipped)
- **Failure handling**:
  - พังจากโค้ดของ agent เอง: agent หา root cause แล้วแก้ ห้าม rerun เพื่อให้เขียว, ห้าม skip เทสต์ และห้ามขยาย tolerance (กฎ global ข้อ 7, 18 และ 21)
  - พังจากสิ่งที่อยู่นอกโค้ด เช่น usage limit, Actions minutes หมด, creds, GitHub ล่ม หรือ job ชนเพดาน 6 ชั่วโมง: agent ติด `agent:blocked` พร้อม error จริง แล้วหยุด
- **Operate**: หยุดชั่วคราวด้วยการ disable workflow ในแท็บ Actions (event ที่เข้ามาระหว่างปิดจะหาย) · สั่งหยุดด้วยการ cancel job · ดูสถานะได้จาก label `agent:*` และหน้า Agent Office (แถว 11)
- **ตรวจสถาปัตยกรรม (2026-10-14)**: รัน `agent_planner.py` ของสกิล agent-designer (เครื่องมือให้คะแนนแบบกำหนดตายตัวจาก requirements) กับเป้าหมาย งาน 8 ขั้น เพดาน 3 งานพร้อมกัน และข้อกำหนดความปลอดภัยของแผนนี้ ได้รูปแบบ `SUPERVISOR` ซึ่งตรงกับที่สร้าง: dispatcher เป็นผู้คุม และแต่ละ issue เดินเป็น pipeline ที่มี gate ของเจ้าของคั่น · จุดที่เครื่องมือเตือนว่าผู้คุมเป็นคอขวด แผนนี้ไม่เจอ เพราะ dispatcher เป็นโค้ดล้วน ไม่ใช่ LLM · ที่เครื่องมือแนะนำแต่แผนนี้ตั้งใจไม่ทำ: retry แบบ exponential backoff (ขัดกับกฎ global ข้อ 21 ที่ให้หาเหตุ ไม่ rerun) และ auto scaling (เพดาน 3 งานตาม Q2) · ช่องว่างที่ยังเปิด: ยังไม่มีเพดานจำนวน run ต่อ issue หรือต่อวัน เพื่อกัน usage ของบัญชี Max หมดจาก `/revise` วน (judgment, อยู่ใต้ R83 ให้เจ้าของตัดสิน)
- **Repo rule exceptions** (ใช้เฉพาะ issue และ PR ของ agent ข้อความที่มีผลจริงคือ CLAUDE.md hard constraint 21 บน `main` ตั้งแต่ `aa0c349ef` ตารางนี้เป็นสรุป):

  | กฎ | ข้อยกเว้น |
  | :---: | :--- |
  | 7 | ไม่มีข้อยกเว้น ใช้กฎ 7 เต็ม · กฎ 7 เขียนใหม่ 17 Oct 2026: `src/` คือดีไซน์จริง ไม่มี mock · `/approve-mock` **removed 17 Oct 2026, owner** ("ต่อไปไม่สน mock เหมือนไม่เคยมีขั้นตอนนี่"; docs/sdd/remove-mock-first R10) |
  | 14, 19 | agent ทำหน้าที่ main thread สำหรับ PR ของตัวเอง · ตั้งแต่ 19 Oct 2026 (เจ้าของเลือก "แก้กฎข้อ 21 (แนะนำ)") agent ไม่เปิดรอบเอง และไม่ติด `agent:blocked` เพราะเรื่อง `round.mjs` แล้ว: Gate 3 merge เข้า `release/next` เท่านั้น ซึ่งไม่ใช่รอบ · รอบที่นำ `release/next` เข้า main เป็นของ main thread เปิดด้วย `round.mjs` และตรวจงบ CI ด้วย `budgetVerdict` · ห้าม push เข้า main · Dev ห้าม merge · Tech Lead merge เข้า `release/next` |
  | 11, 15 | ไม่ต้องทำขั้นเริ่ม session ใช้ plan ที่ผ่าน Gate 1 แทน checklist แต่ยังต้องอ่าน `ACTION_ITEMS` เป็น context |
  | 8 | PR ของ agent ไม่นับในเพดาน 7 PR แต่ยังต้องรีวิวจนจบ · ต้องมีโค้ดใน `pr-budget.mjs` ก่อน (ข้อ 13) |
  | 12 | ไม่มีข้อยกเว้น: งานรีวิวแยกของ Q5 ต้อง APPROVE ทุก PR ของ agent ที่แตะ `src/`, rules หรือ scripts |

- **Accepted risks** (บันทึกตามกฎ global ข้อ 7 ใน [RISK_REGISTER](https://github.com/Thitic9203/pluton-timesheet/blob/main/docs/RISK_REGISTER.md) R80 ถึง R83, R88 และ R89 บน `main` · สถานะ 16 Oct 2026: R80, R88, R89 accepted (owner 15 Oct 2026) · R82, R83 open · R81 retired · ตรวจซ้ำ 17 Oct 2026 สถานะเดิม และเพิ่ม R103 open: agent เริ่มงานโดยเจ้าของไม่ได้ติด label เอง ผ่าน PO/BA triage แถว 18):
  - **เลขชนรอบสอง (ตรวจ 15 Oct 2026):** บน `main` R84 และ R85 เป็นของ Agent Office และ R86 กับ R87 เป็นของแผน E2E แล้ว (R86 จาก commit `8c7cdc474` และ R87 เรื่อง constraint 17) เลขที่ว่างถัดไปคือ R88 และ R89 · แก้แล้ว: R88 และ R89 ขึ้น `main` ที่ `aa0c349ef` (เปลี่ยนเลขจาก R86, R87 ตามคอมเมนต์ปิด PR #494)
  1. ใช้ token ของ subscription Max ใน CI โดยไม่มีคนเฝ้า ยังไม่มีแหล่งใดยืนยันว่าเข้าข้อยกเว้นของ Consumer Terms §3 ข้อ 7 (R80 accepted โดยเจ้าของ 15 Oct 2026 · เดิม "ต้องทบทวนก่อนข้อ 5 วาง token")
  2. ~~ทุก issue ใหม่จะเริ่ม agent~~ เปลี่ยน 2026-10-14: เริ่มเฉพาะ `agent:ready` (Decisions Q1, R81 retired)
  3. ~~App merge ได้เอง~~ เปลี่ยน 2026-10-14: เจ้าของ merge เอง แต่ App ยังเขียน `main` ตรงได้เพราะไม่มี branch protection มีแค่การตรวจหลังเกิดเหตุ (Decisions Q3, R82) · เปลี่ยนอีกครั้งวันเดียวกัน: Tech Lead merge PR ที่ผ่านเข้า `release/next` และ QA Lead merge `release/next` เข้า `main` ตามรอบ (DECISION_LOG "Agent workflow design, quality bonuses, missions ..." · แผนคู่ข้อ 2a, 2b) · แถว 15 ทำแล้วใน PR #496 (merge เข้า `main` `293c3b866`): Tech Lead step merge PR ที่ผ่านเข้า `release/next` โดยยังต้องมี Gate 3 approval ของเจ้าของ
  4. revise ได้ไม่จำกัดรอบ
  5. ทำพร้อมกันได้ 3 issue (dispatcher เป็นตัวบังคับ Decisions Q2 · R83 open)
  6. PR ของ agent ไม่นับในเพดาน 7 PR
  7. หยุดชั่วคราวด้วยการ disable workflow ทำให้ event ที่เข้ามาระหว่างปิดหายไป
  8. โค้ดที่ agent เขียนรันใน CI และใน job ของ agent ก่อนเจ้าของรีวิว (R88) · ทุก job ของ agent รันบน `ubuntu-latest` แล้ว และ CI ของ PR จาก `agent/issue-` หรือที่ bot เปิดรันบน `ubuntu-latest` แล้ว (ข้อ 6, `ci.yml:78` บน `main`)
  9. ผู้รีวิวอ่านไฟล์ได้ทุก path และโพสต์สรุปลง PR (R89)
- **UNVERIFIED** (ต้องพิสูจน์ตอนสร้าง):
  - การ publish hosting ด้วย key secret ยังไม่เคยรันบน `ubuntu-latest`
  - วิธีตรวจว่าโควตาฟรีหมดแล้ว (billing API ใช้ได้เฉพาะ PAT จึงเสนอให้นับนาทีจากเวลา run แทน)
  - ~~`round.mjs` ทำงานนอก Mac ได้หรือไม่ (จนกว่าจะพิสูจน์ agent ไม่ขอ Gate 3 และติด `agent:blocked` ตาม CLAUDE.md hard constraint 21)~~ ไม่เป็นเงื่อนไขแล้ว 19 Oct 2026: constraint 21 ถูกแก้ ให้รอบเป็นของ main thread บน Mac (DECISION_LOG "Always-on dev agent: the go-live trial of 19 Oct") · ตรวจ 17 Oct 2026: `grep -rln "round.mjs\|budgetVerdict" .github/workflows/ scripts/agent/` พบแค่ `.github/workflows/ci.yml` คือยังไม่มีโค้ดของ agent ที่เปิดรอบหรือตรวจงบก่อน Gate 3 และไม่พบข้อความ "not proven" ใน `agent.yml` หรือ `scripts/agent/` · การ fail closed ตาม constraint 21 ยังไม่มีโค้ดยืนยัน ต้องดูในข้อ 10
  - merge ที่เจ้าของกดใน GitHub ไม่ผ่าน push hook จึงไม่ถูกนับใน round state (`scripts/lib/round-budget.mjs:75`, `scripts/verify-push-hook.mjs:101`) และไม่มีโค้ดตรวจรอบซ้ำตอนจะ merge รอบที่เปิดค้างไว้จึงไม่ถูกตรวจใหม่ มีแค่การนับของ CI หลัง merge (`scripts/lib/deploy-budget.mjs:39`)
  - การตรวจงบของ agent ต้องใช้สิทธิ์ actions: read บน token ของ App (input `permission-actions`) ซึ่งยังไม่อยู่ในชุดสิทธิ์ของ Q3 · ตรวจ 17 Oct 2026: `grep -n permission-actions .github/workflows/agent*.yml` ไม่พบ ยังเปิด
  - commit ของ App ที่ระบุผู้เขียนเป็นเจ้าของและ committer เป็น `web-flow` ตัวตรวจ `main` จับไม่ได้ (header ของ `scripts/agent/main-audit.mjs`) ต้องวัดกับ App จริงในข้อ 10 · 17 Oct 2026: `agent-main-audit.yml` รันจริงแล้ว success 11 ครั้ง แต่ยังไม่มี commit ของ App ให้วัด จึงยังเปิด
  - ~~(เพิ่ม 17 Oct 2026) PO/BA triage ยังไม่เคยรันสำเร็จ: run 39012662586 failure "--json-schema was provided but Claude did not return structured_output" ยังไม่ได้หาสาเหตุ (แถว 18)~~ ปิด 20 Oct 2026: สาเหตุคือ 401 OAuth ของ token และ run 39232074073, 39232940427 success หลังออก token ใหม่ (แถว 18)
  - ก่อนตั้ง `vars.AGENT_ENABLED` ข้อ 6 ต้องส่ง CI ของ branch `agent/*` ไปรันบน GitHub-hosted ก่อน เพื่อไม่ให้โค้ดของ agent รันบน Mac (R88) และเจ้าของต้องตัดสิน R89 · อัปเดต 16 Oct 2026: ข้อ 6 อยู่บน `main` แล้ว (`ci.yml:78`) และ R89 accepted (owner 15 Oct 2026) ส่วนการรันจริงบน GitHub-hosted ยังไม่เคยเกิด พิสูจน์ในข้อ 10 · อัปเดต 17 Oct 2026: เงื่อนไขก่อนตั้งผ่านแล้วและ `AGENT_ENABLED=true` ตั้งเมื่อ 2026-10-16T16:50:30Z · PR จาก `agent/issue-` ยังมี 0 ใบ CI ของ agent บน GitHub-hosted จึงยังไม่เคยรัน

---

## Open questions (review 2026-10-14)

รีวิวเอกสารเทียบกับ `origin/main` ที่ `3db9aaa9a` · ตัดสินแล้ว 6 ข้อในหัวข้อ Decisions ด้านล่าง (Q6 รอตัวเลขจากการวัด CI) · อัปเดต 16 Oct 2026: Q6 ปิดด้วยคำยืนยันของเจ้าของ 15 Oct 2026 ครบ 7 ข้อ (DECISION_LOG "Always-on dev agent: owner accepts R80, R88 and R89, confirms Q6, allows the GitHub App")

| Q | เรื่อง | ปัญหาที่พบ | ทางเลือกที่ต้องตัดสิน |
| :---: | :--- | :--- | :--- |
| 1 | issue ใดเริ่ม agent | ความเสี่ยงข้อ 2 ให้ทุก issue ใหม่เริ่ม agent แต่ feedback loop (กฎข้อ 20) เปิดและเดินงานบน issue ในเรโปเดียวกัน บอทสองตัวจะทำงานบน issue เดียวกัน · ข้าม BUG_WORKFLOW ขั้น 4 ที่ให้ถามก่อนว่าจะแก้เลยไหม · เนื้อหาจากฟอร์มผู้ใช้ภายนอกเข้าถึง agent ที่เขียนเรโปได้ (prompt injection) | เริ่มเฉพาะ issue ที่มี label `agent:ready` หรือคงทุก issue พร้อมกฎกันชนกับ feedback loop |
| 2 | คิวและ concurrency | concurrency group ไม่จำกัดรวม 3 และทิ้ง run ที่รออยู่ได้ (ดู Cleanup strategy) | ออกแบบคิวใหม่ เช่น dispatcher ที่นับ issue ที่มี `agent:building` ก่อนเริ่ม และอ่านคอมเมนต์อนุมัติย้อนหลังแทนการพึ่ง event |
| 3 | App เขียน `main` ตรงได้ | Contents: write ครอบ `main` และไม่มี branch protection (ดู Auth) | ยอมรับตามจริง (R82) หรือหาวิธีกันที่ไม่มีค่าใช้จ่าย หรือให้เจ้าของ merge เอง |
| 4 | ข้อยกเว้นกฎข้อ 7 | การ publish mock เดือนละครั้งขัดกับ CLAUDE.md ข้อ 7 ที่ให้ republish และยืนยันก่อนเริ่ม `src/` ทุกครั้ง และ commit guard ต้องการ `Mock commit:` กับ `Owner confirmed:` | เป็นการเปลี่ยนกฎ ต้องให้เจ้าของตัดสินและแก้ CLAUDE.md ข้อ 7 ด้วย หรือเพิ่มการยืนยัน mock เป็น gate |
| 5 | กฎข้อ 12 | ยังไม่ระบุว่า commit ที่แตะ `src/` ได้รับการรีวิวโดย agent ที่ไม่ได้เขียน | เพิ่มขั้นรีวิวแยกใน workflow หรือขอข้อยกเว้น |
| 6 | โควตา Actions (กฎ global ข้อ 3) | ยังไม่มีตัวเลขว่า `ci.yml` เต็มชุดบน `ubuntu-latest` ใช้กี่นาทีต่อรอบ และโควตาฟรีของเรโป private พอกี่รอบต่อเดือน | วัดจาก run จริงแล้วใส่ตัวเลขก่อนเริ่มข้อ 6 |
| 7 | secrets ของ Gate 4 | เทสต์บน staging ต้องใช้ credential บัญชีทดสอบ ซึ่งไม่อยู่ในข้อ 5 | เพิ่มเป็น secret ตัวที่ 4 (เจ้าของวางค่าเอง) (ก่อน 14 Oct 2026 · Gate 4 ถูกแทนด้วยรอบ release) |

### Decisions (2026-10-14)

ตัดสินโดย main thread ตามคำสั่งเจ้าของ 14 Oct 2026 "ทำต่อเลยไม่ถามเรา เราไม่อยู่" และ "ทำต่อยาวๆ เลยไม่ต้องถาม" ทุกข้อเลือกทางที่ไม่มีค่าใช้จ่าย และอ้างแหล่งที่มา (hard constraint 13) เจ้าของเปลี่ยนได้ทุกข้อ บันทึกใน [DECISION_LOG](https://github.com/Thitic9203/pluton-timesheet/blob/main/docs/DECISION_LOG.md) หัวข้อ "Always-on dev agent: six open questions decided by the main thread"

| Q | ตัดสิน | แหล่งที่มา |
| :---: | :--- | :--- |
| 1 | agent เริ่มเฉพาะ issue ที่มี label `agent:ready` และนับเฉพาะเมื่อ `sender.login == "Thitic9203"` เป็นคนติด label · issue ที่ feedback loop เปิดจะไม่เริ่ม agent จนกว่าเจ้าของติด label เอง · **แก้ 17 Oct 2026:** นับ App `<AGENT_APP_SLUG>[bot]` ด้วย เฉพาะ issue ที่ collaborator เปิด เพราะ PO/BA triage (`agent-triage.yml`) ติด label เอง สูงสุด 3 ใบต่อรอบ · Gate 1 และ Gate 3 ยังเป็นของเจ้าของ · เจ้าของสั่ง "ให้ agent PO หรือ BA ไปทำหน้าที่ รีวิวงานและติดลาเบลและเริ่มทำตามกระบวนการได้เลย" · spec `docs/sdd/agent-po-triage` · RISK_REGISTER R103 | ทางที่แผนนี้แนะนำไว้เองใน Accepted risks ข้อ 2 · BUG_WORKFLOW ขั้น 4 (ถามก่อนแก้) · CLAUDE.md hard constraint 20 (feedback loop เป็นเจ้าของ issue ของตัวเอง) |
| 2 | dispatcher เป็น job แรกของทุก event: นับ issue ที่มี `agent:building` ถ้าครบ 3 ให้ติด `agent:queued` แล้วจบ · เมื่องานใบใดจบ dispatcher หยิบ `agent:queued` ใบเก่าสุด · คำอนุมัติอ่านจากประวัติคอมเมนต์ของ issue ทุกครั้ง ไม่พึ่ง payload ของ event ที่ trigger จึงไม่หายเมื่อ run ที่รอถูกยกเลิก | พฤติกรรม concurrency ของ GitHub Actions (group หนึ่งมี run ที่รอได้ตัวเดียว) · Q2 ในตารางด้านบน |
| 3 | เจ้าของเป็นคนกด Merge เอง (ทำจากแอปมือถือได้) merge job เหลือหน้าที่ตรวจและรายงานเท่านั้น · เพิ่ม workflow ตรวจ commit บน `main` ทุกครั้ง ถ้าพบ commit ของ `<app>[bot]` ที่ไม่ได้มาจาก PR merge ให้ติด `agent:blocked` และแจ้งเจ้าของ · token ของ App ขอสิทธิ์เฉพาะที่ job นั้นใช้ผ่าน input `permission-*` ของ `actions/create-github-app-token` | ทางที่แผนนี้แนะนำไว้เองใน Accepted risks ข้อ 3 · R82 ยังเปิด เพราะการตรวจหลังเกิดเหตุไม่ได้ป้องกันการเขียน |
| 4 | **removed 17 Oct 2026, owner** ("ต่อไปไม่สน mock เหมือนไม่เคยมีขั้นตอนนี่"; docs/sdd/remove-mock-first R10): คำตอบเดิมด้านล่างเก็บไว้เป็นบันทึก · ไม่แก้ CLAUDE.md ข้อ 7 · issue ที่แตะ UI: agent commit mock บน branch แล้วติด `agent:blocked` พร้อมข้อความ "รอ publish mock" · เจ้าของ republish ทับลิงก์เดิมแล้วคอมเมนต์ `/approve-mock <url>` agent จึงใส่ `Mock commit:` และ `Owner confirmed:` แล้วทำ `src/` ต่อ | CLAUDE.md hard constraint 7 (republish และยืนยันก่อน `src/` ทุกครั้ง) · commit guard ที่ต้องการทั้งสองบรรทัด · ไม่มีคำสั่งเจ้าของให้เปลี่ยนกฎนี้ ข้อยกเว้นกฎ 7 ในตาราง Repo rule exceptions จึงยกเลิก |
| 5 | เพิ่ม job รีวิวแยก: เรียก `claude-code-action` อีกครั้งด้วย context ใหม่และสิทธิ์อ่านอย่างเดียว ต้องได้ APPROVE ก่อน agent ขอ Gate 3 สำหรับทุก PR ของ agent ที่แตะ `src/`, rules หรือ scripts · ผลรีวิวโพสต์ใน PR · widened 2026-10-14 to match CLAUDE.md constraint 12 | CLAUDE.md hard constraint 12 (commit ที่แตะ `src/`, rules หรือ scripts รีวิวโดย agent ที่ไม่ได้เขียน) |
| 6 | ปิดแล้ว 15 Oct 2026: เจ้าของยืนยันว่านาทีฟรีของ GitHub Actions พอ ("ใช่จ้า", DECISION_LOG "Always-on dev agent: owner accepts R80, R88 and R89, confirms Q6, allows the GitHub App") · ข้อความเดิม: ยังเปิด: วัดแล้วบนเครื่อง Mac (self-hosted) ผลรวมเวลา job ของ `ci.yml` ที่เขียว 5 รอบล่าสุดบน `main` = 26, 35, 71, 93 และ 187 นาที (run 38401250880, 37885171917, 38341410065, 38429388087, 38374480342) · ตัวเลขนี้ไม่ใช่นาทีบน `ubuntu-latest` และแพ็กเกจ GitHub ของบัญชีอ่านไม่ได้ด้วย token ที่มี (`gh api user -q .plan.name` คืนค่าว่าง) · ถ้าเป็น GitHub Free ได้ 2,000 นาทีต่อเดือน (Pro 3,000) ที่ค่ากลาง 71 นาทีจะได้ราว 28 รอบต่อเดือน เป็นค่าประมาณจากเวลาบน Mac เท่านั้น · ยังต้องวัดบน `ubuntu-latest` 1 รอบ และให้เจ้าของยืนยันแพ็กเกจ ก่อนเริ่มข้อ 6 | กฎ global ข้อ 3 · <a href="https://docs.github.com/en/billing/concepts/product-billing/github-actions" target="_blank" rel="noopener noreferrer">GitHub Actions billing ↗</a> (อ่าน 14 Oct 2026: self-hosted ฟรี · repo private ใช้โควตาตามแพ็กเกจ Free 2,000 / Pro 3,000 นาทีต่อเดือน) |
| 7 | ไม่เพิ่ม secret ตัวที่ 4 · หลักฐาน Gate 4 ใช้ (ก) E2E report ของ CI บน sha เดียวกัน (รันบน emulator ไม่ต้องใช้ credential) (ข) `scripts/staging-smoke.mjs` ที่อ่าน staging หลัง deploy โดยไม่ login และ (ค) รูปจาก E2E 3 viewport × 2 theme · การเดินหน้าจอด้วยบัญชีจริงเป็นส่วนที่เจ้าของทำเองตอนตัดสิน Gate 4 | workflow บน `main` ใช้ secret 6 ตัว (รวม `GITHUB_TOKEN`) และหลัง PR #496 เป็น 8 ตัว (เพิ่ม `CLAUDE_CODE_OAUTH_TOKEN`, `AGENT_APP_PRIVATE_KEY`) ไม่มีตัวใดเป็น credential บัญชีทดสอบ (`git grep -ohE 'secrets\.[A-Z0-9_]+' <ref> -- .github/workflows/ \| sort -u`, 14 Oct 2026) · ไม่เพิ่ม credential ใน CI ลดสิ่งที่รั่วได้ (ก่อน 14 Oct 2026 · Gate 4 ถูกแทนด้วยรอบ release) |

---

## Plan review (system design, 2026-10-14)

รีวิวทั้งแผนเทียบกับของที่สร้างจริงบน `origin/agent/row8-workflows` (PR #496) และ PR #494 · แถวที่มีหลักฐานเป็นคำสั่งคือสิ่งที่ตรวจแล้ว แถวที่ติด judgment คือข้อเสนอที่ยังไม่มีแหล่งยืนยัน

```
owner or PO/BA triage labels agent:ready ──► dispatch (repo-wide queue, limit 3)
   │                           │
   ▼                           ▼
 Gate 1 plan ──► Gate 2 tests ──► agent builds on agent/issue-N ──► review (read-only) ──► open-pr
                                                                                   │
 Tech Lead review + merge → release/next (Gate 3) ◄── merge-check reports ◄──────────────────────────┘
   │
   ▼
 main CI ──► deploy-staging ──► agent-release.yml (แถว 12, เดิม R2) ──► QA regression → Slack → QA Lead → production → close
```

| # | ข้อค้นพบ | ระดับ | หลักฐาน | สิ่งที่ทำ |
| :---: | :--- | :---: | :--- | :--- |
| R1 | แถว 6 และ CI chain เดิมให้ถอยไปใช้ Mac เมื่อโควตาหมด ขัดกับ R88 ที่ห้ามโค้ดของ agent รันบน Mac | สูง | R88 ใน PR #494 · `agent.yml` ทุก job เป็น `ubuntu-latest` ใน PR #496 | แก้แถว 6 และ CI chain แล้ว: โควตาหมดให้ติด `agent:blocked` |
| R2 | ไม่มีทางหลัง merge: ไม่มี job ใดติด `agent:on-test-env` รัน `staging-smoke.mjs` หรือโพสต์หลักฐาน Gate 4 หลัง `deploy-staging` ดังนั้น Success Criteria ข้อแรกทำไม่ได้ | สูง | `git grep -n -E 'staging-smoke\|approve-result' origin/agent/row8-workflows -- .github/workflows/agent.yml scripts/agent/cli.mjs` ไม่พบ `staging-smoke` และไม่พบ `/approve-result` ที่ปิด issue · `workflow_run` ใน `agent.yml` รับเฉพาะ branch `agent/` | เพิ่มแถว 12 (ก่อน 14 Oct 2026 · Gate 4 ถูกแทนด้วยรอบ release) |
| R3 | ข้อยกเว้นกฎข้อ 8 (PR ของ agent ไม่นับในเพดาน 7) ยังไม่มีโค้ดรองรับ PR ของ agent จะทำให้ `pr-budget` แดงเมื่อเกินเพดาน | กลาง | `git grep -n -i agent origin/main -- scripts/pr-budget.mjs` พบแค่ `user-agent` | เพิ่มแถว 13 |
| R4 | หน้า Agent Office ต้องใช้ credential ของ GitHub ฝั่ง Cloudflare (V1) ซึ่งไม่อยู่ในรายการ secret ของแถว 5 และต้องสร้าง Cloudflare Pages project ใหม่ 2 ตัว | กลาง | V1 resolution | ต้องรวมใน V5 และขออนุมัติเจ้าของก่อนสร้าง (กฎ global ข้อ 23) |
| R5 | ไม่มีเพดาน usage ของบัญชี Max: `/revise` ไม่จำกัดรอบ และไม่ได้ตั้ง `--max-turns` ให้ claude-code-action มีแค่ `timeout-minutes` ของ job (agent 120, review 30) | กลาง | `git grep -n 'max-turns\|timeout-minutes' origin/agent/row8-workflows -- .github/workflows/agent.yml` พบแค่ `timeout-minutes` | judgment: เพดาน run ต่อ issue ต่อวัน และ `--max-turns` ให้เจ้าของตัดสินใต้ R83 |
| R6 | ตาราง "Repo rule exceptions" แถว 14 และ 19 ด้านบนเป็นข้อความเดิม ล้าหลัง constraint 21 (round.mjs ปิดไว้จนพิสูจน์ได้ว่ารันนอก Mac, ตรวจ `budgetVerdict`) | ต่ำ | constraint 21 ใน PR #494 | แก้ตารางแล้วให้ตรงกับ constraint 21 · ข้อความที่มีผลจริงคือ constraint 21 เมื่อ #494 merge |
| R7 | สถานะเก็บใน label: ใครที่มีสิทธิ์ triage ถอด `agent:building` ได้ จะทำให้ dispatcher หยิบงานถัดไปเกินเพดาน | ต่ำ | dispatcher เชื่อ owner เฉพาะ `agent:ready` | judgment: ยอมรับได้ถ้าเรโปมีผู้มีสิทธิ์คนเดียว ยังไม่ได้ตรวจรายชื่อ collaborator |
| R8 | ขอบเขต: แผนบอก "ไม่ขยายไปหลาย repo" แต่ Agent Office ต้องรองรับหลายโปรเจกต์ | ต่ำ | บรรทัด "ทำ / ไม่ทำ" กับคำสั่งเจ้าของ 14 Oct | ชัดแล้ว: ตัว agent ยัง pilot เรโปเดียว ส่วนหน้า Agent Office อ่านได้หลายโปรเจกต์ผ่านไฟล์ตั้งค่า |

**ไม่ใช่ปัญหา (ตรวจแล้ว):** ประตูอนุมัติทั้ง 4 ใช้ owner `User` จากประวัติคอมเมนต์ (เทสต์ 47 ข้อของ gates และ dispatch) · merge เป็นของเจ้าของ App ตรวจได้หลังเกิดเหตุ (R82) · ทุก job ปิดด้วย `vars.AGENT_ENABLED` · ไม่มี secret ใน bundle · คิวและเพดาน 3 อยู่ใน group เดียวทั้งเรโป

**ต้องกลับมาดูเมื่อระบบโต:** เมื่อมีโปรเจกต์ที่สองจริงให้แยก adapter ของแหล่งสถานะ (Jira) และย้าย dispatcher เป็นแบบต่อโปรเจกต์ · เมื่อเปิดใช้จริงให้วัดนาทีของ `ubuntu-latest` ต่อ issue เพื่อปิด Q6 ด้วยตัวเลขจริง · อัปเดต 17 Oct 2026: โปรเจกต์ที่สอง (OLS) มีจริงแล้วที่แถว 19 แต่เดินแยกบน Mac (Desktop scheduled task `ols-agent`) และส่งการ์ดเข้า Agent Office ผ่าน `OLS_BOARD` (ols-real R13) ไม่ได้ผ่าน dispatcher ของแผนนี้ · `AGENT_ENABLED` ตั้งแล้วแต่ยังไม่มี run ของ agent ที่ทำงานจริง จึงยังวัดนาทีต่อ issue ไม่ได้

---

## Success Criteria

- [ ] issue ทดสอบ 1 ใบเดินครบ planning → Gate 1 → Gate 2 → PR → Gate 3 → merge → release/next → รอบ release → production → ปิด issue ตอนที่ Mac ปิดอยู่

  | Run | Date | Result | Note |
  | :---: | :--- | :---: | :--- |
  | ยังไม่มี | ยังไม่มี | ⬜ | ยังไม่ได้รัน |

- [ ] คอมเมนต์และ PR ของ agent ขึ้นชื่อเป็น `<app>[bot]` และคอมเมนต์อนุมัติปลอมจาก bot ไม่ถูกนับ (มีเทสต์ยืนยัน)
- [ ] merge job รายงานไม่ผ่านใน PR เมื่อไม่มี Approve จาก Thitic9203 บน head SHA, job รีวิวแยกไม่ APPROVE หรือ CI ไม่เขียว (Decisions Q3, Q5 · มีเทสต์ยืนยัน)
- [ ] workflow ตรวจ `main` แจ้งเตือนเมื่อพบ commit ของ `<app>[bot]` ที่ไม่ได้มาจาก PR merge (Decisions Q3 · มีเทสต์ยืนยัน)
- [ ] issue ที่ไม่มี `agent:ready` จากเจ้าของ (หรือจาก PO/BA triage บน issue ที่ collaborator เปิด ตาม Q1 แก้ 17 Oct 2026) ไม่เริ่ม agent และงานใบที่ 4 ติด `agent:queued` (Decisions Q1, Q2 · มีเทสต์ยืนยัน)
- [ ] CI ของงาน agent รันบน GitHub-hosted และ deploy ขึ้น staging ได้สำเร็จ
- [ ] ไม่มีค่าใช้จ่ายใหม่ ทั้ง Actions billing และบัญชี Claude ($0)
- [ ] ไม่มี token หรือ key ปรากฏใน log, คอมเมนต์ หรือไฟล์ในเรโป

---

## กฎการทำงานของทีม agent (เพิ่ม 15 Oct 2026)

> คำสั่งเจ้าของที่บันทึกวันที่ 14 Oct 2026 ใช้กับ agent ทุกตำแหน่ง · ส่วนนี้เป็นสรุปและลิงก์ รายละเอียดและคำพูดเต็มอยู่ที่แหล่งในแต่ละข้อ

1. **ถามและขออนุมัติทาง DM Slack:** "หลักๆ agent ถ้ามีไรถามเรา ส่งแจ้งเราใน DM Slack แล้วเราจะไป รีพลาย แล้วคุณค่อยมาทำงานต่อ" · agent ทุกตัวที่มีคำถาม ร่าง หรือเรื่องให้อนุมัติ ส่งเข้า DM ของเจ้าของเป็นเธรดของตัวเอง แล้วรอคำตอบในเธรดนั้นก่อนทำต่อ (แผนคู่ "หลักที่ไม่เปลี่ยน") · การแจ้งตามจังหวะงานยังโพสต์เป็นเธรดใน `C0C8TSRK1PE` (แถว 14, แผนคู่ข้อ 8) · **คำถามค้าง:** gate ของ Taskfolio ยังนับเฉพาะคำสั่งใน GitHub (`/approve-plan` ฯลฯ, `sender.login == "Thitic9203"`) เพราะ bot อ่านประวัติข้อความ Slack ไม่ได้ (แผนคู่ข้อ 8 แถว "การอนุมัติ") ยังไม่มีสเปกว่าคำตอบใน DM จะนับเป็นการอนุมัติ gate ได้อย่างไร
2. **สกิลต่อตำแหน่ง:** ตารางบังคับอยู่ใน [แผนคู่ข้อ 2a2](agent-workflow-and-economy.md) ข้อหลัก:
   - งาน OLS ทุกขั้นใช้สกิลจากเรโป OLS-QA (`~/GitHub/ols-qa/skills`) เสมอ
   - ติดปัญหาเรียก `superpowers:systematic-debugging` ก่อนแก้ทุกครั้ง
   - งาน automate ใช้ `playwright-best-practices`
   - รีวิวโค้ดใช้ `engineering:code-review` · รีวิวเอกสารใช้ `engineering:documentation`
   - เขียนโค้ดและวางแผนใช้ชุด superpowers
   - เริ่มงานที่ยังไม่เห็นทางใช้ `wayfinder`
   - สกิลเสริมใช้ได้เฉพาะรายชื่อที่เจ้าของอนุมัติ และระบุสกิลที่ใช้ใน PR และ DM ทุกครั้ง
   - ตารางนี้ใช้กับงานของทีม agent ส่วนการสร้างหน้า Agent Office ยังใช้รายการสกิลของหัวข้อ "Agent Office (visualization)"
3. **จำได้ ไม่ถามซ้ำ ไม่พลาดซ้ำ:** "agent ทุกตัวต้องจดจำ ไม่ถามซ้ำและไม่ผิดพลาดเรื่องเดิมหรือใกล้เคียงก็ตาม" · มีสมุดคำตอบต่อโปรเจกต์และสมุดบทเรียน (Taskfolio ใช้ `docs/PITFALLS.md`) ที่อ่านก่อนเริ่มทุกงาน · ค้นก่อนถามทุกครั้ง · บทเรียนที่ตรวจด้วยเครื่องได้ต้องมีตัวตรวจ · ถามซ้ำนับเป็นความผิดพลาด ([แผนคู่ข้อ 2a3](agent-workflow-and-economy.md))
4. **sweep หาจุดบอดเมื่อกล่องงานว่าง (แถว 16):**
   - เปิดใบด้วย `improvement.yml` ขึ้นต้น `[Improvement] ` พร้อมหลักฐาน ติด label `self-filed` เท่านั้น **ไม่ติด `agent:ready`** เพราะ `decide()` ใน `scripts/agent/dispatch.mjs` นับเฉพาะ label ที่เจ้าของติดเอง · อัปเดต 17 Oct 2026: dispatch นับ `agent:ready` ของ App ด้วยเมื่อมาจาก triage บน issue ที่ collaborator เปิด (Decisions Q1, agent-po-triage R2) แต่ triage ข้าม issue ที่มี `self-filed` (agent-po-triage R3) ใบของ sweep จึงยังเริ่มได้ด้วยเจ้าของเท่านั้น
   - เจ้าของติด `agent:ready` เองเมื่อต้องการให้เริ่ม
   - ค้นใบซ้ำ (เปิดอยู่ และปิดภายใน 30 วัน) ก่อนเปิด
   - เพดานตำแหน่งละ 1 ใบและทั้งทีมไม่เกิน 5 ใบ (judgment)
   - รันวันละครั้ง ต่อจาก PR #496 · เจ้าของอนุญาตถาวรภายใต้เพดาน (popup "อนุญาตถาวร มีเพดาน") เป็นข้อยกเว้นของกฎ global ข้อ 23 เฉพาะ sweep นี้
   - สิ่งที่เจอเป็น improvement เว้นแต่ขัดสเปกที่ยืนยันแล้ว จึงไปทาง `docs/BUG_WORKFLOW.md`
   - ที่มา: [แผนคู่ข้อ 2c](agent-workflow-and-economy.md), DECISION_LOG "Agent Office: pro render and motion sources, and the blind-spot sweep's filing rules" (ฉบับนี้แทนข้อความ "at `agent:ready`" ใน entry "Agent Office: no idle agent ..." ที่มาก่อน)
5. **รับงานหลายโปรเจกต์ (แถว 17 สเปก, แถว 19 ตัวจริง; เดิม "สเปกเท่านั้น" superseded 17 Oct 2026):** แหล่งจริงคือ [แมพ multi-project-intake](../../wayfinder/multi-project-intake/MAP.md) สรุป:
   - **กฎรับงาน OLS:** ใบที่ QA Owner (`customfield_12120`) เป็นเจ้าของและยังไม่ Done (P1, P3)
   - **มีเทสเคสแล้ว** คือ TC Status (`customfield_12128`) เป็น DONE หรือ QA REVIEWED
   - เขียนเทสเคสลง tab ใหม่ต่อ ticket ในชีท QA แบบ OLS-44 (P9: ตัวสร้างเดิมคือ `write_tabs.py` มีจุดต้องแก้ 5 ข้อ)
   - เทสด้วย `testing-ticket` และรีเทส bug หรือ task ด้วย `retest-bug`
   - QA Lead agent รีวิวเทสเคสด้วย `tc-review-workflow`
   - **เขียนกลับ Jira:** ทุกคอมเมนต์ ผลเทส และการเปลี่ยนสถานะเป็นร่างที่ส่งเข้า DM Slack ของเจ้าของก่อน · เจ้าของตอบ `passed` ในเธรดจึงทำต่อ
   - **ซ่อม e2e ใน `ols-qa-e2e` (P7, P8):** รับเคสไม่ผ่านจาก `run.json` ของ launchd smoke-watch บน dev
   - reproduce แล้วคัดแยกเป็นเทสต์พัง แอปพังจริง (ไปทาง bug ห้ามแก้เทสต์ให้ผ่าน) หรือ flaky
   - แก้ด้วย `playwright-best-practices` และ `flaky-test-doctor` ห้าม skip ห้าม retry กลบ
   - รันเคสที่แก้หลายรอบ และรันชุดเต็มบน dev เทียบกับผลก่อนแก้ ถ้ามีเคสอื่นพังเพิ่มแม้เคสเดียว ห้ามเปิด PR
   - QA Lead คนละตัวกับคนแก้รีวิวด้วย `code-review` แล้วเปิด PR และส่ง DM · เจ้าของตอบ `passed` แล้ว QA Lead agent merge เอง
   - หลัง merge รันเคสนั้นและชุดเต็มบน dev ซ้ำจาก worktree ที่ตรง `origin/main`
   - รันได้เองเฉพาะ dev ("อนุญาต dev ถาวร") pre-prod และ prod ต้องถามทุกครั้ง · smoke-watch ยังแจ้ง Discord เหมือนเดิม
   - ~~**ยังเปิด:** P4 ที่รันและ credential, P5 ป้ายโปรเจกต์บนการ์ด, P6 ไฟล์ตั้งค่าต่อโปรเจกต์ · เพดาน 3 ใบนับรวมทุกโปรเจกต์หรือแยก (แมพ "Not yet specified")~~ superseded: ตัดสินแล้ว 15 Oct 2026 (DECISION_LOG "Multi-project intake: per-project config, separate caps, one team account, OLS agent on this Mac") และใช้ใน `docs/sdd/ols-real` (P4 Desktop scheduled task บน Mac, P5 ป้าย `OLS` บนการ์ด, P6 สกิลในเรโป ols-qa)
   - **ตัวจริง (เพิ่ม 17 Oct 2026):** สร้างแล้วตามแถว 19 (`b6bd77c4e`, `888d48a43`) สเปก [ols-real](../../sdd/ols-real/spec.md) ยัง Status: draft · การ์ด OLS บน Agent Office รอ variable `OLS_BOARD` (ols-real R13)

---

## Agent Office (visualization)

> เพิ่ม 2026-10-14 ตามคำสั่งเจ้าของ: "อยากทำ AI agent ที่กำลังทำอยู่ให้ visualization แบบนี้ ... ปรับเป็นธีมโฮมออฟฟิศ" และ "ต้องรองรับการปรับไปใช้กับ project อื่นด้วย ไม่ใช่แค่ pluton-timesheet" · หลักคือใช้งานได้จริงก่อน แต่ความสวยงามน่าใช้ก็จำเป็นไม่แพ้กัน · เส้นทางและการตัดสินใจทั้งหมดอยู่ใน map [agent-office](../../wayfinder/agent-office/MAP.md) ส่วนนี้เป็นสรุป

**สิ่งที่ต้องมี (จากคำสั่งเจ้าของ):**

| ส่วน | รายละเอียด |
| :--- | :--- |
| ห้อง | ห้องประชุม, ห้องพักผ่อน, ห้องครัว, ห้องน้ำ, โซนทำงาน · Dev, QA, PO, BA, Tech Lead และ QA Lead นั่งรอบโต๊ะโดนัท · Head นั่งที่โต๊ะโดนัท · ห้องทำงานเดิมของ Head เป็นห้องสมาธิ (เจ้าของ 14 Oct 2026) |
| บทบาท | Head, PO, BA, Tech Lead 2 คน, Dev 3 คน, QA Lead, QA |
| จัดการคน | เพิ่มลดคน ย้ายตำแหน่ง และแก้หน้าที่หลักได้จากหน้าเว็บ |
| สภาพแวดล้อม | ตามเวลาจริง, เช้า, บ่าย, เย็น, กลางคืน แบบแผง "ปรับฉากออฟฟิศ" ในภาพอ้างอิง |
| หลายโปรเจกต์ | ทุกอย่างเฉพาะโปรเจกต์ (เรโป, label, สถานะ, roster, ห้อง) มาจากไฟล์ตั้งค่า ไม่ hardcode เพื่อใช้กับ OLS หรือโปรเจกต์อื่นต่อ |
| มาตรฐาน UI | กฎ global ข้อ 16 และ 19: GSAP แบบ `gsap.from()` + `clearProps` และ no-op เมื่อ reduce motion, สว่างและมืดครบ (กลางคืนคือโหมดมืด), 3 ความกว้าง, ปุ่มอย่างน้อย 44px, contrast ผ่าน, ตัวละครและสถานะมีเป็นข้อความจริงให้ screen reader |

**สกิลที่ใช้ได้ (ห้ามใช้ตัวอื่น):** งาน Agent Office ทุกขั้นใช้เฉพาะสกิลที่ติดตั้งอยู่แล้ว 4 ตัวนี้ `frontend-design` (ดีไซน์หน้าและแผงควบคุม), `gsap-core` และ `gsap-timeline` (ตัวละครเดิน, สลับกลางวันกลางคืน), `artifact-design` (prototype ที่เผยแพร่เป็น artifact) · ห้ามติดตั้งหรือเรียกสกิลภายนอกเพิ่ม ห้ามใช้สกิลหรือบริการสร้างภาพด้วย AI และห้ามใช้ Phaser หรือ Blender (hard constraint 1) · ยกเว้น Three.js ที่เจ้าของอนุมัติให้ใช้วาดออฟฟิศเป็น 3D จริง (เจ้าของ 14 Oct 2026 popup: "เปลี่ยนเป็น 3D จริง", ฟรี MIT โหลดจาก CDN, แทน SVG isometric ของ V2) · เจ้าของอนุมัติเพิ่มวันเดียวกัน: three.js r170 ผ่าน import map, ท่าทางจาก Quaternius CC0 เติมด้วย Tencent HY-Motion 1.0 ผ่าน HuggingFace Space ฟรี (popup "Quaternius CC0 ก่อน + HY-Motion เติม") และโมเดลรถ CC-BY 4.0 จาก Sketchfab ที่เจ้าของดาวน์โหลดเอง (popup "เราโหลดจาก Sketchfab") · ความเสี่ยงสัญญาอยู่ที่ R84 และ R85 บน `main` · รายละเอียดในแผนคู่ข้อ 9a · ต้องการสกิลอื่นต้องให้เจ้าของอนุมัติก่อนแล้วแก้รายการนี้ (เจ้าของ 14 Oct 2026: "เอาตามที่แนะนำ ... ใช้สกิลที่ติดตั้งอยู่แล้ว" และ "ใส่ไว้ในแพลน จะได้ป้องกันการไปใช้สกิลมั่ว")

**หน้านี้อ่านอย่างเดียว:** การอนุมัติ gate อยู่ใน GitHub ตาม Decisions Q1 ถึง Q5 · ไม่ใช่หน้าของแอป Taskfolio จึงไม่อยู่ใต้ `src/` แต่ต้องมี prototype ที่เจ้าของยืนยันก่อนสร้างจริง · อัปเดต 17 Oct 2026: ตัวจริงขึ้นแล้วที่ https://agent-office-prod.pages.dev (`version.txt` = `449014e27`) ตามสเปก [agent-office-live](../../sdd/agent-office-live/spec.md) มีหน้า sign-in ก่อนเข้า และข้อมูลจริงจาก snapshot ของ GitHub · ยังอ่านอย่างเดียวเหมือนเดิม

**ขั้นตอน (ticket ใน map):**

| Ticket | ชนิด | สถานะ |
| :--- | :--- | :--- |
| [V1 ที่โฮสต์และทางรับสถานะสดแบบฟรี](../../wayfinder/agent-office/tickets/V1.md) | research | ✅ Cloudflare Pages + Function อ่านอย่างเดียวแบบ Jira proxy, config ต่อโปรเจกต์ |
| [V2 วิธีวาดและ asset ฟรี](../../wayfinder/agent-office/tickets/V2.md) | research | ✅ เดิม SVG isometric วาดเอง · เปลี่ยน 14 Oct 2026 เป็น 3D จริงด้วย Three.js ตามเจ้าของ ข้อความ HTML ซ้อนบนเหมือนเดิม, GSAP ฟรี |
| [V3 บทบาท หน้าที่ และการจับคู่สถานะกับห้อง](../../wayfinder/agent-office/tickets/V3.md) | grilling (เจ้าของ) | 🟡 ที่นั่งตอบครบ: ticket บันทึกว่า "ส่วน head มีห้องส่วนตัวทำงาน แยก" แต่คำสั่งเจ้าของที่ตามมาวันเดียวกันให้ Head นั่งโต๊ะโดนัทและเปลี่ยนห้องเดิมของ Head เป็นห้องสมาธิ (DECISION_LOG "Agent workflow design, quality bonuses, missions ..." · ตาราง "สิ่งที่ต้องมี" ด้านบน) ตัว ticket ต้องตามแก้ · เหลือ: โต๊ะขยายหรือเพิ่มวง, Dev หลายคนแบ่งงาน, Head เป็นเจ้าของคนเดียวหรือเป็น agent ได้, ลบคนที่กำลังทำงาน |
| [V4 prototype ออฟฟิศ](../../wayfinder/agent-office/tickets/V4.md) | prototype (เจ้าของยืนยัน) | 🟡 รุ่นที่ 2 (14 Oct 2026) <a href="https://claude.ai/artifact/Wp7pFHwNt9jDjkPZPctVjG" target="_blank" rel="noopener noreferrer">Agent Office prototype ↗</a> เพิ่มแถบงานตาม label `agent:*` 9 สถานะและเพดาน 3 ใบ · เป็น 3D จริงแล้ว คนสมจริงเรียกตามตำแหน่ง ของในห้องครบ สระว่ายน้ำ มุมมัทฉะกาแฟ โทน cozy น้ำตาล ขาว ดำ และสภาพอากาศ 4 แบบ (รายละเอียดใน V4) · ต่อมาขึ้น v57 (three.js r170, render ชุดใหม่) และ v58 (batching, พื้นผิว CC0, ป้ายโปรเจกต์, บทพูด) ที่ลิงก์เดิม ชื่อหน้าเป็น "AI Agent Home Office" · ส่วนที่กำลังทำและรอ อยู่ในแผนคู่ข้อ 9 และ 9a · รอเจ้าของยืนยัน · อัปเดต 17 Oct 2026: prototype นี้กลายเป็นต้นแบบของตัวจริงบน production (สเปก agent-office-live) แต่ ticket V4 ยัง `status: open` และยังไม่พบบันทึกที่เจ้าของปิด ticket นี้ |
| [V5 ไฟล์ตั้งค่าโปรเจกต์](../../wayfinder/agent-office/tickets/V5.md) | grilling (เจ้าของ) | รอ V1, V3 · อัปเดต 17 Oct 2026: ไฟล์ตั้งค่า `agent-office/projects.config.json` มีอยู่และใช้บน production แล้ว (เช่น `economyStart` บรรทัด 59) แต่ ticket V5 ยัง `status: open` |
| ตัวจริง (production, เพิ่ม 17 Oct 2026) | build | 🟡 https://agent-office-prod.pages.dev ตอบ HTTP 200 `version.txt` = `449014e27` · สเปก [agent-office-live](../../sdd/agent-office-live/spec.md) ถึง R73 · `deploy-agent-office.yml` 30 run ล่าสุด success 26 failure 4 · การ์ด OLS รอ `OLS_BOARD` |

---

## สถานะต่อจาก handoff 19 Oct (ตรวจ 20 Oct 2026)

> เขียนเฉพาะที่มีหลักฐาน · ข้อ Open 1 ถึง 3 ของรายการ 19 Oct ด้านล่างถูกแทนด้วยรายการนี้

- **รอบ 73:** Configuration แดงที่ apostrophe ใน comment ของ index guard แก้ที่ `fbbc0b68d` และยกงบ step 15 เป็น 72 ที่ `1b55b00df`
- **รอบ 74** (`62fc03cbf`): ขึ้น staging แต่ไม่ถึง production (RISK_REGISTER R112) · เจ้าของยกงบเป็น 73 ให้รอบ 75 (`2d21dd4b6`, DECISION_LOG "Round 74 missed production; budget 73 for round 75")
- **รอบ 75** (`bf36b0343`, management-logs-time รวมงานรอบ 74): publish ขึ้น production ด้วยมือตามคำสั่งเจ้าของ โดยไม่ผ่าน staging, main CI, E2E และ app gates (`0c6e1feef`, RISK_REGISTER R113)
- **งานของเจ้าของจาก handoff 18 Oct ข้อ 4 (ออก token ใหม่):** ทำแล้ว 2026-10-19T09:42:03Z (แถว 18)
- **open:** ข้อ 4 ของรายการ 19 Oct (walk staging), guide retake, calendar meeting drafts, แถว 10, แถว 19 (ลงทะเบียน `ols-agent` และนำ `fix/ols-agent-host-login` ขึ้น `main`)

## งานที่เหลือ (handoff, 19 Oct 2026)

> ต่อจากรายการ 18 Oct ด้านล่าง (รายการนั้นไม่ได้แก้) · เขียนเฉพาะสิ่งที่มีหลักฐาน · ข้อที่ยังไม่จบติดป้าย **open**

**Round 72 (pushed):**
- push ขึ้น main เป็น `551a6289b` รวม 14 commits: R104 rules ของ emulator แบบ staging, #495 อ่าน period แบบมีขอบเขต, STG-STAFF-05 สลับ role, measured-constants reviewed entries และ commit หัวรอบมี `E2E: full` กับ `E2E-Group: full-desktop`
- ก่อน push: app-pass 12/12 บน tree `cf9264c9` · `npm run test:e2e` ในเครื่อง exit 0 (6 projects, 2702 passed, 0 failed, 4 skipped) · `npm run test:e2e:staging-emu` 235/235 (exit 0) จึงผ่านทั้ง STG-STAFF-04 และ STG-STAFF-05 บน emulator แบบ staging

**Main CI run 39199204216 (round 72):**
- Configuration ล้มที่ "Indexes with nothing guarding them: periods:submitterRole+weekStart" เพราะ #495 เพิ่ม index แต่ไม่ได้เพิ่มบรรทัดในรายการบังคับของ `ci.yml`
- Application และ Security rules ผ่าน · End to end ยังรันอยู่ตอนเขียน: result pending; the main thread fills it in
- Fix `d09c82c8c` (ci.yml, review APPROVE) รอไปกับ round 73 โดยยก budget เป็น 71

**Open (เรียงตามลำดับ):**
1. **open:** push round 73 และ main CI เขียวทุก job
2. **open:** สั่ง E2E-Group `full-touch` บน sha นั้น
3. **open:** `deploy-production.yml` สำหรับ sha นั้น (ปิด R105 และปิด R104 เมื่อบันทึกผล staging-emu เขียวแล้ว)
4. **open:** walk staging รวมรายงานของ team lead

**Done วันนี้:**
- **Staging work catalog ตรงกับ production** (owner 19 Oct): เสร็จ ดู DECISION_LOG entry "Staging work catalog set to match production · 2026-10-19"
- **Timesheet ของเจ้าของบน production, ศุกร์ 16 Oct 2026:** เพิ่ม Testing / Review test case 1 h 15 m (OLS-914, OLS-921) และกระจายวันให้ครบ 8 h · เสร็จ, ยังไม่ submit

**Guide retake (open):**
- GitHub Actions artifact storage เต็มถึง 1 Nov (หน้า billing: 372 GB-hr ใน Oct = 500 MB ฟรี) ดู RISK_REGISTER R108
- เจ้าของเลือกถ่ายบน Mac ("ถ่ายบนเครื่องแทน") และให้ role `roles/iam.serviceAccountTokenCreator` บน SA `taskfolio-e2e-staging` กับ user ของตัวเองแล้ว
- lane `docs/guide-retake-local` (spec `4d478de24`, `975a6aea2`) ถ่ายเมื่อเครื่องว่าง · **open:** จากนั้นเจ้าของอัปโหลด PDF ไป Drive folder `13er6_9EqT_A9ZPiAMBxM4K3_86eyxRL9` เอง (ไม่มี Drive tool)

**Calendar meeting drafts (feature ใหม่, owner 19 Oct, open):**
- design ผ่าน ("จัดไป") · spec อยู่บน branch `docs/calendar-meeting-drafts` (`cadaa83f4` และต่อจากนั้น) · เจ้าของตอบ Q1, Q3, Q4, Q6/Q7, Q8/Q11, Q10, Q12 แล้ว
- lane implementation เริ่มบน `feat/calendar-meeting-drafts`
- **open:** production รอข้อเปิดใน spec (Q2, Q5, Q9, วิธีของ Q10) และการทดสอบ consent บน staging

## งานที่เหลือ (handoff, 18 Oct 2026 ราว 10:50)

> จาก session meeting-project-optional ซึ่งรับงานต่อจาก handoff 17 Oct ด้านล่าง · ใช้รายการนี้แทนรายการ 17 Oct · ทุกข้อมีหลักฐาน

**ขึ้นแล้ว (ไม่ต้องทำซ้ำ):**
- **รอบ 71** `0f34d0ab4` (37 commits, CI run 39091741579 success ทุก job รวม app-gates, Deploy staging และ Staging smoke success): staging E2E fixes (docs/sdd/staging-e2e-17oct: หัวข้อ "Logged time by ...", Escape ปิด popover ของ top bar, STG-MGMT-04 อ่านเหตุผลเมื่อไม่มี PDF), หน้า Review พับวันบนมือถือ 2.43 จอ (docs/sdd/phone-density-review-export R6) และ My team `.act` (docs/sdd/team-actions-align), layout-gate 566 จุดเหลือ 0 (docs/sdd/layout-gate-reds: accent-600, `.daypick`, chip ห่าง 8px และ − / + ขึ้นบรรทัดใหม่ตามคำตอบเจ้าของ), triage digest เมื่อ judge ล้ม (agent-po-triage R13), E2E เต็มก่อนเข้า main บน emulator ที่จำลอง staging (docs/sdd/e2e-before-main: E2E บน staging ไม่รันเองหลัง deploy แล้ว ต้องใส่ `E2E-Staging: run` ใน commit หัวรอบเมื่อเจ้าของสั่งเท่านั้น), size budget CSS 19,088 B
- **E2E ก่อน push (ในเครื่อง ภายในรอบ 71):** `e2e/` 6 slice ผ่านครบ 2,706 (exit 0, 46.7 นาที) · `test:e2e:staging-emu` ผ่าน 231/235 (ดู R104)
- **staging (T7 ของ meeting-project-optional):** เปิด Project optional ให้ Sprint ceremony, Company all hands, 1:1 แล้ว · ลองบันทึก Meeting ไม่มี project ได้และไม่นับเป็น project work แล้ว Undo
- **timesheet 12–18 Oct บน prod (draft, ไม่ submit):** 23 h 30 m ตาม `timesheet-draft-12-15-16oct.md` · แถว ⚠ ใช้ Pluton แทน Taskfolio และ MICA2 ตามคำแนะนำในร่าง

**ขึ้น production แล้ว (18 Oct 2026, Firebase live release 17:26:08):** รอบ 71 `0f34d0ab4` publish ด้วยมือตามคำสั่งเจ้าของ ("เลือกและจัดารมาเลย", DECISION_LOG "Round 71 published to production by hand · 2026-10-18", RISK_REGISTER R105) · prod smoke ผ่าน · R7 นับแล้วไม่มีแถวค้าง (Company all hands 4 แถวไม่มี project, 1:1 ไม่มีแถว, Sprint ceremony 11 แถวมี project ทั้งหมด) · เปิด Project optional บน prod ครบ 3 ตัว · timesheet 12–18 Oct ครบ 24 h (draft, ไม่ submit)

**ค้าง (เรียงตามลำดับ):**
1. **E2E-Group full ที่ค้างจาก R105:** รอบถัดไปที่มีงานจริงต้องใส่ `E2E: full` และ `E2E-Group: full`
2. **R104 / e2e-before-main Q7:** STG-STAFF-04 (owner ส่งสัปดาห์เต็มให้ตัวเองด้วย self-approval) ถูก rules ปฏิเสธบน emulator (`PERMISSION_DENIED: evaluation error at L1392:24 ... L1896:24 ... L523:24`) หาสาเหตุก่อนรัน staging ครั้งถัดไป
3. **#495 (เปลี่ยนเป็น improvement):** วัดแล้ว (lane-495, emulator) ไม่มี loop อ่านซ้ำ เฉลี่ย 181 เอกสารต่อเทสต์ ชุด staging เต็มราว 42.5K ต่อรอบ จากโควตา 50K · การจำกัด query ประหยัดได้ราว 2–4% บน staging · เจ้าของเลือกไม่รัน E2E บน staging เองแล้ว (owner 17 Oct ราว 19:45)
4. **งานของเจ้าของ:** ออก `CLAUDE_CODE_OAUTH_TOKEN` ใหม่ด้วย `claude setup-token` แล้วสั่ง agent-triage ด้วยมือ (digest ใหม่จะบอกสาเหตุ)
5. **คำถามเปิดใน spec:** staging-e2e-17oct Q1 (Escape ในฟอร์ม AdminCompanies / InlineAdd ปิด popover ด้วย) · e2e-before-main Q1, Q3 (ใส่ staging-emu ใน CI ต้องอนุมัติตามกฎข้อ 17), Q5 (entries 192 จาก ~333), Q7 · layout-gate-reds Q1 (contrast มุมการ์ด dark 4.20), Q2 (gate ไม่อ่าน gradient) · หมายเหตุ Low จากรีวิว: test ของ fold ไม่ mount PeriodRoute และไม่มี try/finally, agent-workflow test ไม่มี `errors` ใน fixture
6. **checkout หลักยังมีไฟล์ค้างครึ่งทางของ fold** (`git status` ใน `/Users/thitichaya/GitHub/pluton-timesheet`) ซึ่งงานจริงขึ้นในรอบ 71 แล้ว ตรวจก่อนทิ้ง
7. **จากรายการ 17 Oct ที่ยังไม่ทำ:** guide-retake + Drive, walk staging ตาม ACTION_ITEMS ข้อ 11, ข้อเปิดอื่นของแผนนี้ (ข้อ 9 เดิม), `/catch-ai`

## งานที่เหลือ (handoff, 17 Oct 2026 ราว 18:30)

> แทนที่ด้วยรายการ 18 Oct ด้านบน เก็บไว้เป็นประวัติ

> จาก session ของ main thread ที่ทำ Agent Office production และรอบ 69 ถึง 70 · session ใหม่เริ่มจากรายการนี้ · ทุกข้อมีหลักฐานหรือที่อยู่ของงาน · **session นี้หยุดตามคำสั่งเจ้าของ (17 Oct 2026 ราว 18:40) ขณะที่ agent ของข้อ 1 และ 2 ยังทำไม่เสร็จ ไฟล์ที่ยังไม่ commit ใน checkout หลักจึงเป็นงานค้างครึ่งทาง ต้องตรวจทั้งหมดก่อนใช้ ไม่ถือว่าผ่านเทสต์หรือรีวิว**

**ต้องรู้ก่อนเริ่ม:**
- **งานค้างครึ่งทางใน checkout หลัก (ยังไม่ commit, ยังไม่ผ่านเทสต์หรือรีวิว):** agent ถูกหยุดระหว่างทำ ต้องตรวจทุกไฟล์ก่อนใช้ · การพับวันของหน้า Review (ข้อ 2): `src/components/WeekGrid.tsx`, `src/routes/ReviewRoute.tsx`, `src/styles/timesheet.css`, `src/routes/ReviewRoute.dayFold.test.tsx` (ใหม่), `docs/sdd/phone-density-review-export/spec.md`, `plan.md`, `tasks.md`, `docs/DECISION_LOG.md` (`git status --short` 17 Oct 2026 ราว 18:45) · การแก้ #495 (ข้อ 1): agent ถูกหยุดก่อนเขียนไฟล์ใดๆ ไม่มี `docs/sdd/read-scope-495/` และไม่มีการแก้ใน `src/services/` จึงต้องเริ่มใหม่ทั้งหมด
- **PO/BA triage (ข้อ 3), งานของเจ้าของ:** ตรวจหรือออก `CLAUDE_CODE_OAUTH_TOKEN` ใหม่ด้วย `claude setup-token` เพราะ run แรก (39012662586) ล้มก่อนเรียกโมเดล แต่ยังยืนยันสาเหตุไม่ได้ จนกว่าจะเก็บ log ของ run ไว้ได้ (step อัป execution file ที่เสนอในข้อ 3)

**ขึ้นแล้ว (ไม่ต้องทำซ้ำ):**
- รอบ 69 (`817c71a4a`) และรอบ 70 (`449014e27`, CI run 39025697156): Agent Office R66 ถึง R73 (แก้วกาแฟ 10 m, เงินอ่าน ledger จาก `economyStart` 2026-10-16, ชื่อโปรเจกต์, phase ของรอบ release, ตารางที่มาของค่าใช้จ่าย, chip ว่าง, จำกัดคำขอ GitHub 6 ตัว), ถอด mock-first ทั้งระบบ (docs/sdd/remove-mock-first), table gate ตามสัปดาห์จันทร์ (docs/sdd/table-gate-monday-week), catalog wrap, Export บนมือถือ 3.27 จอ, meeting-project-optional (R102), config แดงของ OLS (ols-real R16)
- Agent Office production: run 39026062368 success, `version.txt` = `449014e27`
- Taskfolio staging: Deploy staging และ Staging smoke ของรอบ 70 success

**ค้าง (เรียงตามลำดับที่ควรทำ):**
1. **บั๊ก #495 อ่านทั้ง collection (blocker ของ E2E บน staging):** วัดด้วย Cloud Monitoring (`firestore.googleapis.com/document/read_count`, project `taskfolio-staging`) ได้ว่า E2E บน staging รอบเดียวอ่าน 169,826 เอกสารใน 16 นาที (QUERY 168,652) หรือ 3.4 เท่าของโควตาวันละ 50K และไม่มีการอ่านอื่นหลังรีเซ็ต 14:00 · เจ้าของเลือก "แก้ #495 ก่อน" (ไม่ลดขอบเขต E2E) · ยังไม่เริ่ม: agent ที่ได้รับงานถูกหยุดก่อนเขียนไฟล์ใดๆ (ไม่มี `docs/sdd/read-scope-495/`) · จุดที่ต้องเริ่มจากการสืบ (ยังไม่ยืนยันทีละจุด): `src/services/periods.ts` (`getAllPeriods`, `getStaffPeriods`), `src/services/users.ts` (`listPeople`), `src/services/entries.ts`, `src/hooks/useReport.ts`, `src/routes/AdminProjectsRoute.tsx` · billing ปิดทั้ง staging และ prod (ไม่มีค่าใช้จ่าย)
2. **หน้า Review พับวันบนมือถือ:** เจ้าของเลือก "A พับวันบนมือถือ" (17 Oct) เพราะหน้า Review ที่ 375 วัดได้ 5.13 และ 4.47 จอ เกินงบ 3.5 (`scripts/lib/density-budget.mjs`) และเป็นข้อเดียวที่ทำให้ app-gates ของรอบ 70 แดง · งานอยู่ใน checkout หลักยังไม่ commit: `src/components/WeekGrid.tsx`, `src/routes/ReviewRoute.tsx`, `src/styles/timesheet.css`, `src/routes/ReviewRoute.dayFold.test.tsx`, `docs/sdd/phone-density-review-export/*`, `docs/DECISION_LOG.md` · ต้องผ่าน vitest, typecheck, lint, gate:app (ui-gate ผ่านงบ) และรีวิวแยก
3. **PO/BA triage รันครั้งแรกล้ม:** run 39012662586 "`--json-schema was provided but Claude did not return structured_output`" (docs/sdd/agent-po-triage, R103) · สืบแล้ว: ข้อความนี้ไม่ใช่สาเหตุจริง CLI จบใน 1,980 ms ด้วย `is_error: true`, `total_cost_usd: 0`, `modelUsage: {}` คือไม่ได้เรียกโมเดลเลย และ action (`anthropics/claude-code-action` v1.0.248, `base-action/src/run-claude-sdk.ts` ราวบรรทัด 254 ถึง 281) แสดงข้อความ schema ทับ error จริง · สมมติฐานหลัก (ยังไม่ยืนยัน): `CLAUDE_CODE_OAUTH_TOKEN` (สร้าง 2026-10-15T10:01:23Z) ถูกใช้จริงครั้งแรกใน run นี้และใช้ไม่ได้ · ทางแก้ที่เสนอ: เพิ่ม rule ใน spec ก่อน แล้วเพิ่ม step `if: failure()` อัป `steps.judge.outputs.execution_file` เป็น artifact เก็บ 3 วัน (คง `show_full_output: false`) พร้อมเทสต์ใน `scripts/lib/agent-workflow.test.mjs` · งานของเจ้าของ: ตรวจหรือ mint token ใหม่ด้วย `claude setup-token` แล้วสั่ง run ด้วยมือ
4. **รอบ 71:** รวมข้อ 1 ถึง 3 เป็นรอบเดียว (constraint 25) · งบรอบ step 15 ใช้ครบ 68/68 แล้ว ต้องเพิ่มใน `docs/action-items/deploy-budget.json` ตามคำสั่งเจ้าของ · ก่อนเปิดรอบ: app-pass บน tree ที่สะอาด (`node scripts/heavy.mjs --label app-pass -- node scripts/app-pass.mjs` ใน worktree ที่ไม่มีไฟล์ untracked) และ `TASKFOLIO_LANES_DIR` · ปิด NDLP VPN ระหว่าง deploy (L2TP แบบ full tunnel ทำให้ Node fetch ไป api.github.com หลุด, รอบ 69 deploy ล้มเพราะเรื่องนี้)
5. **E2E บน staging ให้เขียว:** เจ้าของสั่ง (17 Oct 2026) "รัน e2e บน emu ให้ผ่านหมดก่อน อย่าเพิ่งไปใช้โควต้ารันใน staging" จึงรัน E2E บน staging ใหม่ได้เมื่อ job E2E บน emulator ของรอบเขียว, ข้อ 1 ขึ้นแล้ว และโควตารีเซ็ต 14:00 แล้วเท่านั้น · ตัวแก้ spec ที่ล้าสมัย (ไม่เกี่ยวกับโควตา) อยู่บน branch `fix/staging-e2e-17oct` (worktree `/Users/thitichaya/GitHub/pt-stg-e2e`, ฐาน `449014e27`) ของ session meeting-project-optional: `c57956462` (docs/sdd/staging-e2e-17oct), `ea7bbefb6` (`src/routes/AppLayout.tsx`: Escape ปิด popover ของ top bar, STG-STAFF-09), `cc77ef0c0` (หัวข้อ "Logged time by ...", STG-MGMT-04) · ต้องรอรีวิวแยกของ session นั้น APPROVE ก่อนรอบ 71 จะพาขึ้นไป
6. **Meeting ขึ้น production:** เจ้าของเลือก "รอ E2E เขียว" · session meeting-project-optional เป็นคนสั่ง (R102 และขั้นข้อมูล R7) หลังได้ run id ของ E2E บน staging ที่เขียวบน sha ที่มีงาน meeting
7. **guide-retake + Drive:** สั่ง `guide-retake.yml` บน staging แล้วอัป PDF ขึ้นโฟลเดอร์ Drive เดิม · ทำหลังข้อ 5 เพราะต้องใช้โควตา staging
8. **walk staging:** ตาม ACTION_ITEMS ข้อ 11 · ทำหลังข้อ 7
9. **ข้อเปิดอื่นของแผนนี้:** แถว 10 (ทดลองจริงกับ issue ทดสอบ) ยังไม่เริ่ม · `AGENT_SWEEP_ENABLED` ยังไม่ตั้ง · `OLS_BOARD` ยังไม่มี · คำถามเปิด Q-R73 (timeout ของ GitHub client) ใน agent-office-live spec · คำถามเปิด Q3 และ Q4 ของ phone-density-review-export (หัววันที่ 375, seed week ของ gate)
10. **ปิดงาน:** `/catch-ai` หลังข้อ 1 ถึง 8 เสร็จ

**คำถามค้างจากการตรวจ CatchAI ของไฟล์นี้ (17 Oct 2026, ยืนยันไม่ได้จาก session นี้):**
- ลิงก์บอร์ด `PtxqqUiv3HrLjJaadg7Ppq` (แถว 1, References) อ่านไม่ได้: "artifact not found ... or it has not been shared with you" · ลิงก์ prototype `Wp7pFHwNt9jDjkPZPctVjG` (V4) อยู่ในอีกองค์กรของบัญชี ต้องให้เจ้าของเปิดดูเอง
- คำพูดเจ้าของ "แก้ข้อความให้ตรงของจริง" (แถว 6) และ "คง ✅ พร้อมหมายเหตุว่าปิดไว้" (แถว 16) ไม่พบใน DECISION_LOG (`grep -c -F` ได้ 0)
- "ใช้ครบ 68/68" (ข้อ 4) ตรงกับ `deploy-budget.json` `allowed: 68` แต่ตัวนับของ CI (`scripts/lib/deploy-budget.mjs:39`) นับได้ 20 run ที่ Deploy staging success ส่วนตัวนับของ `round-budget.mjs` อยู่ใน state ในเครื่อง
- สิทธิ์ของ App (Contents, Issues, Pull requests, Commit statuses ไม่มี Workflows) ต้องใช้สิทธิ์ผู้ดูแล App ตรวจ · ผล `agent_planner.py` (SUPERVISOR) ไม่มี output เก็บไว้
- `release/next` ยังอยู่ที่ `aa0c349ef` (`git ls-remote`) ซึ่งอยู่ก่อน PR #496 merge · PR แรกของ agent ที่เปิดเข้า branch นี้อาจไม่มี workflow ของ agent อยู่บน base ควรตัดสินก่อนข้อ 10 ของตาราง (ทดลองจริง) · ตัดสินแล้ว 19 Oct 2026: ดันตาม main ("ดันตาม main (แนะนำ)", DECISION_LOG go-live trial) เป็น `1b55b00df` · 20 Oct 2026 ตามไม่ทันอีก 37 commit

---

## References

- <a href="https://claude.ai/artifact/PtxqqUiv3HrLjJaadg7Ppq" target="_blank" rel="noopener noreferrer">Always-on Agent Board (live) ↗</a>
- <a href="https://code.claude.com/docs/en/github-actions" target="_blank" rel="noopener noreferrer">Claude Code GitHub Actions ↗</a>
- <a href="https://github.com/anthropics/claude-code-action" target="_blank" rel="noopener noreferrer">anthropics/claude-code-action ↗</a>
- <a href="https://code.claude.com/docs/en/authentication" target="_blank" rel="noopener noreferrer">Claude Code authentication (setup-token) ↗</a>
- <a href="https://www.anthropic.com/legal/consumer-terms" target="_blank" rel="noopener noreferrer">Anthropic Consumer Terms ↗</a>
- <a href="https://github.com/actions/create-github-app-token" target="_blank" rel="noopener noreferrer">actions/create-github-app-token ↗</a>
- <a href="https://code.claude.com/docs/en/routines" target="_blank" rel="noopener noreferrer">Claude Code routines (rejected runtime) ↗</a>
- <a href="https://github.com/Thitic9203/pluton-timesheet/blob/main/docs/superpowers/plans/feedback-form-to-github-slack.md" target="_blank" rel="noopener noreferrer">Feedback loop plan (rule 20 precedent) ↗</a>
