# แผนทีม AI Agent: รับงานจากหลายโปรเจกต์ใน Jira และ GitHub ร่วมกับ 7 ฝ่าย

> **สถานะ:** ร่างเพื่อคุยกับทีม (draft for team review) · ยังไม่เริ่มสร้างตามแผนนี้ · เจ้าของแผน: @Thitic9203 · ปรับเมื่อ 21 Oct 2026
>
> **ที่มา:** เจ้าของ 21 Oct 2026 "ปรับแพลนในเรโป ต้องการโฟกัสการทำงาน AI Agent ที่รองรับงานจากหลายโปรเจ็คใน Jira, GitHub โดยผู้ร่วมงานจะมีหลายฝ่าย
> เช่น PO BA Tech Lead Dev QA Lead QA PM ... ปรับแพลนมาก่อน ยังไม่ต้องเริ่มทำ เราต้องเอาแพลนไปคุยกับทีม"
>
> **แผนนี้แทนอะไร:** เป็นแผนหลักของทิศทางใหม่ แผนเดิมยังเป็นบันทึกสิ่งที่สร้างแล้ว:
> [always-on-dev-agent](../superpowers/plans/always-on-dev-agent.md) (ตัว agent ฝั่ง GitHub ของ Taskfolio),
> [agent-workflow-and-economy](../superpowers/plans/agent-workflow-and-economy.md) (บทบาท สกิล รอบ release),
> แมพ [multi-project-intake](../wayfinder/multi-project-intake/MAP.md) (งาน QA ของ OLS) และแมพ
> [agent-all-roles](https://github.com/Thitic9203/pluton-timesheet/blob/main/docs/wayfinder/agent-all-roles/MAP.md) (PO/BA, DEV, QA จาก Jira)

---

## 1. เป้าหมาย (สิ่งที่ทีมจะได้)

1. ทีม agent รับงานเองจากหลายโปรเจกต์ ทั้ง **Jira** (เริ่มที่ OLS) และ **GitHub issue** (เริ่มที่ pluton-timesheet) โดยไม่ต้องมีคนสั่งทีละงาน
2. agent มี **7 บทบาท** คู่กับคนจริงในทีม: PO, BA, Tech Lead, Dev, QA Lead, QA, PM · agent ทำงานร่าง คนในบทบาทนั้นเป็นผู้ตัดสิน
3. ทุกการเขียนกลับระบบของทีม (Jira, GitHub, Sheet) **ผ่านการอนุมัติของคน** ก่อนเสมอ
4. เพิ่มโปรเจกต์ใหม่ได้ด้วย **ไฟล์ตั้งค่าหนึ่งไฟล์** ไม่ต้องแก้โค้ด
5. ไม่มีค่าใช้จ่ายใหม่ ถ้าไม่ได้อนุมัติเป็นรายกรณี (กฎ global ข้อ 3)

## 2. หลักการที่ไม่เปลี่ยน (ตัดสินแล้ว ไม่ต้องคุยซ้ำ)

| หลัก | ที่มา |
| :--- | :--- |
| agent **เริ่มงานเอง** ทุกวัน คนไม่ต้องสั่ง | เจ้าของ 20 Oct 2026 "Agent ทำเองอัตโนมัติทุกวัน ทุกครั้งไม่ต้องให้บอกนะ" |
| **จุดอนุมัติคงเดิม**: agent ร่าง คนอนุมัติ ก่อนเขียนกลับ | เจ้าของ popup 20 Oct 2026 "คงจุดอนุมัติเดิม" |
| agent รับเฉพาะงานที่ **ติด label `agent`** (Jira) หรือ `agent:ready` (GitHub) | A4, A5 ของแมพ agent-all-roles · Decisions Q1 ของแผน always-on |
| agent ไม่ deploy production เอง | แผน always-on "ไม่ทำใน pilot" |
| สเปกก่อนโค้ดทุกครั้ง (spec, plan, tasks) | CLAUDE.md hard constraint 22 |
| งาน Jira รันบน GitHub Actions ใน repo นี้ ยกเว้นขั้นที่ต้องเปิดเว็บใน VPN ของลูกค้า | A3, A7 ของแมพ agent-all-roles |
| โค้ดของ agent อยู่ใน `pluton-ai-agent` แยกจากโค้ดของ product | เจ้าของ 20 Oct 2026, spec [repo-split](../sdd/repo-split/spec.md) |

## 3. บทบาท: agent ทำอะไร คนตัดสินอะไร

แต่ละบทบาทมี agent หนึ่งตัวต่อโปรเจกต์ (หรือมากกว่าเมื่อเพดานอนุญาต) และมี **คนในบทบาทนั้น** เป็นผู้อนุมัติ

| บทบาท | agent รับงานจาก | agent ทำ (ร่าง) | คนในบทบาทตัดสิน | ส่งต่อให้ |
| :--- | :--- | :--- | :--- | :--- |
| **PO** | งานใหม่ที่ติด label `agent` | จัดลำดับ backlog, ร่างเป้าหมายและ AC ระดับผลลัพธ์, ตอบคำถามขอบเขต | ลำดับงาน, ขอบเขต, ยอมรับผลรอบ release | BA |
| **BA** | งานที่ PO ส่งต่อ / Jira `Ticket Detail Status` = Pending Details, Pending PO Review, Awaiting PO Clarification | ร่าง AC ละเอียด, flow, กฎธุรกิจ, edge case, ลิสต์คำถามที่ไม่มีแหล่ง, เสนอ `Ticket Detail Status` ใหม่ | AC ครบหรือยัง | Tech Lead, Dev, QA Lead |
| **Tech Lead** | งานที่ AC ครบ / PR ที่เปิดใหม่ | ร่างแนวทางเทคนิคและความเสี่ยง, แตก subtask, รีวิว PR ด้วย `code-review` | แนวทางเทคนิค (Gate 1), อนุมัติ PR | Dev, QA Lead |
| **Dev** | งานที่ผ่าน Gate 1 และ Gate 2 | เขียนโค้ด test-first บน branch `agent/...` แล้วเปิด PR | (ไม่ตัดสินเอง) | Tech Lead |
| **QA Lead** | plan ที่ผ่าน Gate 1 / รอบ release | ร่าง test plan ผูก AC ทุกข้อ, รีวิวเทสเคสด้วย `tc-review`, สรุปผลรอบ release | test plan (Gate 2), ผ่านหรือไม่ผ่านของรอบ | QA, PM |
| **QA** | ใบ READY TO TEST / TESTING ของตัวเอง (QA Owner) | เขียนเทสเคส, เทสด้วย `testing-ticket`, รีเทสด้วย `retest-bug`, ร่างผล | ผลเทส (`passed` ใน DM ก่อนเขียนกลับ) | QA Lead |
| **PM** | ภาพรวมทุกโปรเจกต์ (ไม่รับงานรายใบ) | ร่างสรุปสถานะรายวัน/รายสัปดาห์, ชี้งานที่ค้างนานหรือเสี่ยงเลยกำหนด, ร่างแผนรอบ release, ติดตามโควตาและค่าใช้จ่าย AI | ลำดับความสำคัญข้ามโปรเจกต์, วันที่ release | ทุกบทบาท |

> **PM เป็นบทบาทใหม่** ที่ยังไม่มีในแผนเดิม (เดิมมี "Head" ทำหน้าที่ใกล้เคียง) · หน้าที่ในตารางเป็น **ร่างให้ทีมคุย** ไม่ใช่ข้อตกลง (คำถาม Q1)
>
> **การประเมินขนาดงานทำร่วมกันทุกบทบาท** ไม่ใช่ฝ่ายเดียว (เจ้าของ popup 20 Oct 2026, A4)

## 4. แหล่งงานและโปรเจกต์

### 4.1 ต่อหนึ่งโปรเจกต์ ใช้ไฟล์ตั้งค่าหนึ่งไฟล์

ต่อยอดจากไฟล์ตั้งค่าหกช่องที่ตัดสินแล้ว (multi-project-intake P6) แล้วเพิ่มช่องบทบาทและคนอนุมัติ:

| ช่อง | ตัวอย่าง Taskfolio (GitHub) | ตัวอย่าง OLS (Jira) |
| :--- | :--- | :--- |
| แหล่งงาน | GitHub `Thitic9203/pluton-timesheet` label `agent:*` | Jira `skilllane.atlassian.net` project `OLS` label `agent` |
| กฎรับงานต่อบทบาท | ตามแผน always-on | BA: `cf[12127]` 3 ค่า · Dev: `Details Provided` หรือ Bug/Task · QA: QA Owner `cf[12120]` |
| repo โค้ด | `pluton-timesheet` | `SkillLane/ols-monorepo` (A2) |
| ที่รัน | GitHub Actions | GitHub Actions + Mac runner `ols-e2e` สำหรับขั้นที่ต้องผ่าน VPN (A7) |
| คนอนุมัติต่อบทบาท | เจ้าของ | (คำถาม Q2) |
| ช่องทางอนุมัติ | คอมเมนต์ GitHub `/approve-plan` ฯลฯ | Slack DM เธรดต่อ ticket ตอบ `passed` (A5) |
| สกิลต่อชนิดงาน | ตาราง 2a2 | สกิลในเรโป ols-qa |
| เพดานงานพร้อมกัน | 3 ใบ | 3 ใบ (แยกต่อโปรเจกต์, P6) |

### 4.2 ทางเดินของงานหนึ่งใบ (ทุกโปรเจกต์ใช้ทางเดียวกัน)

```
งานติด label agent
  → BA ร่าง AC + คำถาม (ทุกบทบาทช่วยประเมินขนาด)      → คน BA/PO อนุมัติ
  → Tech Lead ร่างแนวทาง (Gate 1)                     → คน Tech Lead อนุมัติ
  → QA Lead ร่าง test plan (Gate 2)                   → คน QA Lead อนุมัติ
  → Dev เขียนโค้ด + PR                                 → Tech Lead รีวิว, คนทีม dev ของโปรเจกต์ merge
  → QA เทสบน dev/staging, ร่างผล                       → คน QA อนุมัติผลก่อนเขียนกลับ
  → QA Lead สรุปรอบ release, PM ร่างแผน release        → คน PM/PO ตัดสินวัน release
```

## 5. สิ่งที่มีอยู่แล้ว (วันนี้)

| ส่วน | สถานะ | หลักฐาน |
| :--- | :--- | :--- |
| repo `pluton-ai-agent` (private) + โค้ด agent ย้ายมาแล้ว | ✅ ยังไม่เปิด Actions | main `658b87c`, เทสต์ 527/527 |
| App `taskfolio-dev-agent` ติดตั้งบน `pluton-timesheet` และ `pluton-ai-agent` | ✅ | หน้า installations "Selected 2 repositories" (21 Oct 2026) |
| PO/BA triage และ sweep รายวันของ Taskfolio | ✅ รันอยู่ใน pluton-timesheet | `AGENT_TRIAGE_ENABLED`, `AGENT_SWEEP_ENABLED` = true |
| QA ของ OLS (เขียนเทสเคส, เทส, รีเทส) | 🟡 โค้ดมีแล้ว ยังไม่รันรายวัน | branch `feat/ols-retest-procedure-guards` |
| ย้าย secret ไป repo ใหม่ | 🟡 workflow ร่างแล้ว รีวิวขอแก้ 1 ข้อ | `feat/agent-secrets-copy` `3412f44af` |
| งาน BA / Dev / PM จาก Jira | ⬜ ตัดสินแล้วบางส่วน (A4, A5) ยังไม่สร้าง | แมพ agent-all-roles A9 |

## 6. ขั้นตอนที่เสนอ (ยังไม่เริ่ม รอทีมตกลง)

| ขั้น | ทำอะไร | เสร็จเมื่อ |
| :---: | :--- | :--- |
| 1 | ทีมตกลงแผนนี้และตอบคำถามข้อ 7 | คำตอบทุกข้อบันทึกในแผน |
| 2 | ปิดงานแยก repo: คัดลอก secret, ทดลองรันจาก repo ใหม่, ปิด agent ฝั่งเดิม | triage และ sweep รันจาก pluton-ai-agent |
| 3 | ไฟล์ตั้งค่าต่อโปรเจกต์ (ข้อ 4.1) + ตัวรับงานจาก Jira ร่วมกับ GitHub | Taskfolio และ OLS อยู่ในไฟล์ตั้งค่าเดียวกัน |
| 4 | QA ของ OLS รันรายวัน | 1 ใบเดินครบถึงเขียนกลับ Jira หลัง `passed` |
| 5 | BA ของ OLS (ร่าง AC + คำถาม + ขนาดร่วม) | 1 story ถึง `Details Provided` หลังคนอนุมัติ |
| 6 | Tech Lead + Dev ของ OLS ถึง PR ใน ols-monorepo | 1 PR ที่ทีม dev ของ OLS รีวิวได้ (ต้องได้ App จาก org ก่อน) |
| 7 | QA Lead + PM: test plan, สรุปรอบ release, สรุปสถานะ | สรุปสัปดาห์แรกส่งให้ทีม |
| 8 | โปรเจกต์ที่สาม | เพิ่มด้วยไฟล์ตั้งค่าอย่างเดียว |

ทุกขั้นทำตาม SDD (spec, plan, tasks ก่อนโค้ด) และขึ้น staging ก่อนเสมอ

## 7. คำถามให้ทีมตัดสิน

| # | คำถาม | ทำไมต้องถาม |
| :---: | :--- | :--- |
| Q1 | หน้าที่ของ **PM agent** ตามข้อ 3 ถูกไหม ขาดหรือเกินอะไร | บทบาทใหม่ ยังไม่มีสเปก |
| Q2 | ต่อโปรเจกต์ **ใครเป็นคนอนุมัติ** ของแต่ละบทบาท (PO, BA, Tech Lead, QA Lead, QA, PM) | ตอนนี้มีแค่เจ้าของคนเดียวอนุมัติทุกจุด |
| Q3 | ช่องทางอนุมัติของแต่ละคน: Slack DM, คอมเมนต์ใน Jira หรือ GitHub | DM ใช้ได้กับเจ้าของแล้ว ยังไม่เคยใช้กับคนอื่น |
| Q4 | ใครสร้าง label `agent` ใน Jira ของแต่ละโปรเจกต์ และใครมีสิทธิ์ติด | เป็นการสร้างของในระบบที่ทีมใช้ร่วม (กฎ global ข้อ 23) |
| Q5 | org `SkillLane` ติดตั้ง App ให้ `ols-monorepo` ได้ไหม และนาที Actions / spending limit ของ org เท่าไร | PR ของ agent ใช้โควตาของ org (A2, A8) |
| Q6 | รวมขนาดงานจากหลายบทบาทเป็นขนาดเดียวอย่างไร | ตัดสินแล้วว่าทำร่วมกัน แต่ยังไม่มีสูตร |
| Q7 | โปรเจกต์ถัดไปคืออะไร และ site `humanintelligence` ต้องเปิดสิทธิ์ให้ agent อ่านไหม | A1: งานที่เปิดอยู่ของเจ้าของมีแค่ OLS |
| Q8 | เพดานงานพร้อมกัน 3 ใบต่อโปรเจกต์พอไหม เมื่อมี 7 บทบาท | บัญชี Max เดียวรับทุกงาน (R83) |
| Q9 | งานที่ต้องเปิดเว็บใน VPN ของลูกค้าคงบน Mac ได้ไหม (Mac ต้องเปิดและต่อ VPN) | A7: GitHub runner เข้าไม่ถึง |

## 8. ความเสี่ยงและค่าใช้จ่าย

- **ค่าใช้จ่าย:** ใช้บัญชี Claude Max เดิม (R80) และนาที GitHub Actions ฟรีของ repo ส่วนตัว · PR ใน repo ของ org ใช้โควตาของ org (Q5) · ไม่มีบริการเสียเงินใหม่
- **การเขียนข้ามระบบโดยไม่ผ่านคน:** กันด้วยร่างก่อนเขียนทุกครั้ง และ worker ไม่มี MCP หรือ WebFetch (R107 accepted)
- **credential ใหม่:** Jira token และ Slack token ต้องเป็น secret ใน repo นี้ ลง RISK_REGISTER ก่อนเปิดใช้
- **บัญชีเดียวรับทุกบทบาท:** usage ของบัญชี Max อาจหมดเมื่องานมากขึ้น (R83, Q8)
