# Always-on Agent: Workflow Design and Team Economy

> Owner: @Thitic9203 · Created: 2026-10-14 · Companion to [always-on-dev-agent](always-on-dev-agent.md) (the plan of record; this file does not change its decisions) · Visual: [Agent Office prototype](https://claude.ai/artifact/Wp7pFHwNt9jDjkPZPctVjG)

คำสั่งเจ้าของ 14 Oct 2026: "ช่วยดูแลเรื่อง workflow ให้ครบรอบทุกมุมมอง ทุกรายละเอียด รวมถึงคิดเรื่องระบบโบนัสเงินเข้ากองเงินสนับสนุนเมื่อ agent ทำผลงานได้ดี หรือไม่ค้างชำระหนี้ อยากให้มีเหมือน mission เล็กๆ ระหว่างที่ agent ทำงาน และได้เงิน เหมือนเล่นเกม"

## ภาพรวมสำหรับทีม (อ่านส่วนนี้ก่อน)

**งานนี้คืออะไร:** การทำ AI Agent แบบหลายตัว (multi-agent system) ให้ทีม agent ช่วยพัฒนา Taskfolio (`pluton-timesheet`) ตลอดเวลา โดยเจ้าของยังเป็นผู้ตัดสินในจุดสำคัญ

**แบ่งเป็นสองส่วน**

1. **ระบบจริง (always-on dev agent):** agent แบ่งตามตำแหน่ง PO, BA, Dev, Tech Lead, QA Lead, QA และ Head แต่ละตำแหน่งหยิบงานจาก GitHub เอง ไม่มีใครสั่งรายตัว งานเดินตาม label `agent:*` ทีละขั้นและมี gate คั่น (Gate 1 plan และ Gate 2 test plan เจ้าของอนุมัติ, Gate 3 Tech Lead รีวิวแล้ว merge, รอบ release QA Lead อนุมัติ) ถ้าตำแหน่งไหนไม่มีงาน ก็หาจุดบอดในขอบเขตของตัวเองแล้วเปิดใบ `[Improvement]` (ข้อ 2c) โค้ดอยู่ใน PR #496 ยังปิดสวิตช์ไว้จนเจ้าของเปิด
2. **AI Agent Home Office (หน้าแสดงผล):** แมป 3D แบบเกม Sims ที่ให้เห็นว่า agent แต่ละตัวทำอะไร อยู่ห้องไหน รออะไร ติดตรงไหน พร้อมเงินสนับสนุนทีม ค่าใช้จ่ายด้าน AI ค่าใช้จ่ายออฟฟิศ และภารกิจ (ข้อ 7) ตอนนี้ใช้ข้อมูลจำลอง ยังไม่ต่อกับระบบจริง · ลิงก์: [AI Agent Home Office](https://claude.ai/artifact/Wp7pFHwNt9jDjkPZPctVjG)

**สถานะ ณ 14 Oct 2026**

| ส่วน | สถานะ | ดูที่ |
| :--- | :--- | :--- |
| workflow และ gate | ออกแบบครบ โค้ด dispatcher อยู่ใน PR #496 ยังไม่ merge | ข้อ 1 ถึง 6 |
| ระบบหาจุดบอด (sweep) | ออกแบบครบ เจ้าของอนุญาตให้เปิดใบเองภายใต้เพดาน กำลังสร้างต่อจาก PR #496 รันวันละครั้ง | ข้อ 2c |
| เงินสนับสนุนทีม โบนัส ภารกิจ | จำลองในหน้า Home Office ครบ ยังไม่ต่อของจริง | ข้อ 7 |
| งานจากหลายโปรเจกต์ (OLS QA บน Jira, ซ่อม e2e ใน `ols-qa-e2e`) | กำลังออกแบบในแมพ [multi-project-intake](../../wayfinder/multi-project-intake/MAP.md): ร่างทุกชิ้นส่งเข้า DM Slack ของเจ้าของ ตอบ `passed` จึงทำต่อ | แมพ |
| ภาพและการเคลื่อนไหวระดับ Sims 4 | ขึ้นแล้ว v57 ถึง v60 (Three.js r170, batching, พื้นผิว CC0, ป้ายโปรเจกต์, บทพูด, กลางคืน ฟ้า น้ำ ฝน ต้นไม้, ลานโชว์รถ, เรือ, ตัวละคร Quaternius) · ทำเมื่อเจ้าของสั่ง: ท่าเสริม HY-Motion, รถ Sketchfab คันอื่น | ข้อ 9a |

**หลักที่ไม่เปลี่ยน:** agent ทุกตัวที่มีคำถาม ร่าง หรือเรื่องให้อนุมัติ ส่งเข้า DM Slack ของเจ้าของเป็นเธรดของตัวเอง แล้วรอจนเจ้าของตอบในเธรดนั้นจึงทำต่อ (เจ้าของ 14 Oct 2026: "หลักๆ agent ถ้ามีไรถามเรา ส่งแจ้งเราใน DM Slack แล้วเราจะไป รีพลาย แล้วคุณค่อยมาทำงานต่อ") · ไม่ใช้บริการเสียเงิน (ใช้แต่ของฟรีและ CC0) · ไม่แตะ production · เจ้าของเป็นคนเริ่มงานทุกใบด้วย `agent:ready` · ทุกการตัดสินใจบันทึกใน [DECISION_LOG](../../DECISION_LOG.md) และความเสี่ยงที่ยอมรับอยู่ใน [RISK_REGISTER](../../RISK_REGISTER.md) (R80 ถึง R85)

**วิธีอ่านแหล่งที่มา:** ทุกแถวบอกที่มา `source:` คือสิ่งที่มีอยู่แล้ว (แผน, PR #494/#496, CLAUDE.md) · `judgment:` คือข้อเสนอของ main thread ที่ยังไม่มีแหล่งยืนยัน เจ้าของเปลี่ยนได้ทุกข้อ (hard constraint 13)

---

## 1. Pattern

| เรื่อง | ตัดสิน | ที่มา |
| :--- | :--- | :--- |
| รูปแบบรวม | **Orchestrator + gated pipeline**: dispatcher (โค้ดล้วน ไม่ใช่ LLM) เป็นผู้คุม แต่ละ issue เดินเป็นลำดับขั้นที่มี gate คั่นทุกขั้น: Gate 1 และ 2 เป็นของเจ้าของ, Gate 3 ของ Tech Lead, รอบ release ของ QA Lead | source: แผนแม่ "ตรวจสถาปัตยกรรม" (`agent_planner.py` ได้ SUPERVISOR) |
| วงตรวจคุณภาพ | **Evaluator loop**: ผู้เขียน (Dev) → ผู้ตรวจ (Tech Lead คนที่ไม่ได้เขียน) ต้อง APPROVE และ CI เขียวก่อน merge | source: Decisions Q5, constraint 12; source: เจ้าของ 14 Oct 2026 "Tech lead สามารถใช้สกิลที่ดีที่สุดที่มี รีวิว PR ถ้าผ่านแล้วให้ merge ได้เลย" |
| ขนาน | สูงสุด 3 issue ใน `agent:building` พร้อมกัน ใบที่เกินเข้า `agent:queued` | source: Decisions Q2, `LIMIT = 3` ใน `scripts/agent/dispatch.mjs` (PR #496) |
| ไม่ใช้ | router หลายโมเดล, multi-agent fan-out ภายใน issue | judgment: งานต่อ issue เป็นเส้นตรงที่มี gate คนคั่น fan-out เพิ่ม token โดยไม่ลดเวลารอ gate |

## 2. Stages and handoff contracts

ทุกขั้นส่งต่อด้วย "สัญญา" ที่มีครบ 7 ช่องตามแม่แบบ agent-workflow-designer (`workflow_id`, `step_id`, `task`, `constraints`, `upstream_artifacts`, `budget_tokens`, `timeout_seconds`) · `workflow_id` = `issue-N` · ส่งต่อเฉพาะ artifact ไม่ส่ง context เต็ม (judgment ตามแม่แบบ: "Passing full upstream context instead of targeted artifacts" เป็น pitfall)

| step_id | ผู้ทำ | งาน | upstream_artifacts | ผลลัพธ์ที่ส่งต่อ | timeout | budget_tokens (judgment) |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| `dispatch` | โค้ด | ตรวจ owner label, นับเพดาน 3, อ่านคำอนุมัติจากประวัติคอมเมนต์ | issue event | action + issue no. | 5 นาที (source: `agent.yml:81`) | 0 |
| `plan` | agent (PO แล้ว BA) | เขียน plan จาก issue + `ACTION_ITEMS` เป็น context | issue body | คอมเมนต์ plan มี marker + hash, `.agent/issue-N/plan.md` | 120 นาที รวมทั้ง run (source: `agent.yml:120`) | S 0.4M · M 0.8M · L 1.5M · XL 3M |
| Gate 1 | เจ้าของ | `/approve-plan` หรือ `/revise` | plan | คำอนุมัติบน hash ของ plan | ไม่มี (รอคน) | 0 |
| `mock` (เฉพาะ UI) | agent + เจ้าของ | commit mock แล้ว `agent:blocked` รอ `/approve-mock <url>` | plan | mock commit + ลิงก์ที่ยืนยัน | ไม่มี | ในงบ `build` |
| `test-plan` | agent (QA Lead) | test plan ผูกกับ AC ใน plan | plan | คอมเมนต์ test plan | 120 นาที | 30% ของงบ plan |
| Gate 2 | เจ้าของ | `/approve-tests` | test plan | คำอนุมัติ | ไม่มี | 0 |
| `build` | agent (Dev) | เขียนโค้ด test-first บน `agent/issue-N` | plan + test plan | commits, head sha | 120 นาที | S 1M · M 3M · L 7M · XL 18M |
| `review` | job รีวิวแยก (Tech Lead) | อ่านอย่างเดียว APPROVE หรือ REQUEST_CHANGES | diff + plan | สถานะ + สรุป ≤ 4000 ตัวอักษร (source: R85) | 30 นาที (source: `agent.yml:269`) | 15% ของงบ build |
| `open-pr` | โค้ด | เปิด PR จาก checkout สะอาด ตรวจ sha | head sha | PR | 10 นาที (source: `agent.yml:229`) | 0 |
| Gate 3 | Tech Lead | รีวิวด้วยสกิล `code-review` (เพิ่ม `security-audit` ของ repo เมื่อแตะ rules, secrets หรือ workflow) · APPROVE และ CI ของ PR เขียว แล้ว merge เองเข้า `release/next` (ข้อ 2b) · ไม่ผ่านส่ง REQUEST_CHANGES กลับ Dev | PR, CI, review | merge commit บน `release/next` | 30 นาที | 15% ของงบ build |
| `merge-check` | โค้ด | รายงานใน PR ว่า approval, review, CI ครบ | PR | รายงาน | 10 นาที (source: `agent.yml:375`) | 0 |
| `release-queue` | โค้ด | นับ issue ที่ merge เข้า `release/next` แล้ว ครบ 10 แจ้ง QA Lead | merge commits | ข้อความ Slack ถึง QA Lead | 5 นาที | 0 |
| Gate 4 (release) | QA Lead + QA | ตามข้อ 2b: QA Lead อนุมัติ staging, QA รัน regression, QA Lead deploy production แล้วปิดทุก issue ในรอบ | ผล regression ใน Slack | issue ปิด | ไม่มี (รอคิว) | 10% ของงบ build ต่อ issue |

**กติกาสัญญา (judgment):** ทุกคอมเมนต์ของ agent ขึ้นต้นด้วยบรรทัดเครื่องอ่าน `<!-- agent:handoff {"workflow_id":"issue-N","step_id":"plan","sha":"…","tokens":…} -->` เพื่อให้ Agent Office และระบบเงินอ่านข้อเท็จจริงได้โดยไม่ต้องเชื่อข้อความที่ agent เขียนเอง

## 2a. Roles: who owns what, and work is pulled, never assigned

เจ้าของสั่งไว้ 14 Oct 2026: "แยกหน้าที่ให้ Tech lead, Dev, PO/BA, QA lead, QA ให้ชัดเจนเสมอ และเขาจะต้องรู้หน้าที่และรับงานไปทำงานโดยไม่รอให้สั่ง", "เราไม่สั่ง คุณต้องรู้หน้าที่ตนเอง"

| ตำแหน่ง | กล่องงานของตัวเอง (label ที่เฝ้า) | ทำอะไร | ส่งต่อให้ | ห้ามทำ | ไม่มีงานเข้า ทำเอง |
| :--- | :--- | :--- | :--- | :--- | :--- |
| PO | `agent:ready` | ตัดสินว่าทำอะไรและทำอะไรก่อน: Product Goal, คุณค่าที่ผู้ใช้ได้, ลำดับ backlog, ขอบเขต, AC ระดับผลลัพธ์ · ตอบคำถามขอบเขตของ BA และ Dev · ยอมรับผลรอบ release | BA | เขียน spec รายละเอียดเอง, เปลี่ยนแบบที่ Dev ออก, ข้ามลำดับ backlog เพราะใครขอ | จัดลำดับ backlog ใหม่ตามคุณค่า |
| BA | งานที่ PO ส่งมา | วิเคราะห์ว่าต้องทำอย่างไรให้ตรงความต้องการ: เก็บความต้องการจาก SPEC, DATA_MODEL และคำตอบเจ้าของ · เขียน flow, กฎธุรกิจ, edge case, ผลต่อข้อมูลและสิทธิ์ · ผูก AC กับ requirement ให้ตามรอยได้ · ประเมินผลกระทบเมื่อขอบเขตเปลี่ยน | เจ้าของ (Gate 1) แล้ว QA Lead | เปลี่ยนลำดับ, ขอบเขตหรือ AC ที่ PO ตั้ง, ตัดสินใจแทน PO, เขียนโค้ด | ตรวจหลังขึ้น production ว่างานที่ปิดแล้วแก้ปัญหาได้จริง (solution evaluation) |
| QA Lead | plan ที่ผ่าน Gate 1 · รอบ release ที่ครบ 10 | เขียน test plan ผูก AC ทุกข้อ · อนุมัติ deploy staging · ตรวจผล regression แล้ว deploy production | เจ้าของ (Gate 2) · QA (regression) | แก้ plan, เขียนโค้ด, deploy production ก่อนเห็นผล regression ผ่านครบใน Slack | ตรวจว่า AC ทุกข้อมีเทสต์ |
| Dev | test plan ที่ผ่าน Gate 2 (`agent:building`, เพดาน 3) | เขียนโค้ด test-first บน `agent/issue-N` | Tech Lead | รีวิวงานตัวเอง, merge | แก้ CI แดงบน branch agent |
| Tech Lead (2 คน) | PR ที่เปิดใหม่ | รีวิวด้วย `code-review` ผ่านแล้ว merge เองเข้า `release/next` (Gate 3) | คิว release (ข้อ 2b) | แก้โค้ดใน PR ที่ตัวเองรีวิว, merge PR ที่ CI แดง | ทบทวนความเสี่ยงเชิงสถาปัตย์ |
| QA | รอบ release ที่ QA Lead อนุมัติแล้ว | รัน regression อัตโนมัติที่มีบน staging, ส่งผลเข้า Slack | QA Lead | ข้ามเคสที่แดง, รันซ้ำเพื่อกลบ flaky | smoke staging รอบประจำ |
| Head | ทุก gate ที่รอเจ้าของ | ดูภาพรวม, ส่งเรื่องให้เจ้าของตัดสิน, ชำระค่าใช้จ่ายด้าน AI | เจ้าของ | อนุมัติ gate แทนเจ้าของ | ตรวจเงินสนับสนุนทีมและค่าใช้จ่ายด้าน AI ค้างชำระ |

**PO กับ BA แยกกันตามหลักสากล:** PO รับผิดชอบ "อะไรและทำไม" ตาม Scrum Guide 2020 หัวข้อ Product Owner: รับผิดชอบคุณค่าของ product, Product Goal, การสร้างและสื่อสาร Product Backlog item, การจัดลำดับ และความโปร่งใสของ backlog · PO เป็นคนเดียว ไม่ใช่คณะกรรมการ มอบงานเขียนให้คนอื่นได้แต่ยังรับผิดชอบเอง (source: https://scrumguides.org/scrum-guide.html) · BA รับผิดชอบ "อย่างไรให้ตรงความต้องการ" ตาม BABOK Guide v3 ของ IIBA ซึ่งนิยาม business analysis ว่า "enabling change in the context of an enterprise by defining needs and recommending solutions" และแบ่งงานเป็น 6 knowledge area ที่ใช้ตรงนี้: elicitation and collaboration, requirements analysis and design definition, requirements life cycle management (traceability), strategy analysis และ solution evaluation (source: https://www.iiba.org/career-resources/a-business-analysis-professionals-foundation-for-success/babok/) · เส้นแบ่ง: PO ตัดสิน BA วิเคราะห์ · BA ไม่เปลี่ยนลำดับหรือขอบเขต ถ้าเจอว่าควรเปลี่ยนให้เสนอ PO · PO ไม่เขียน spec รายละเอียดแทน BA

**Gate 3 เป็นของ Tech Lead** (source: เจ้าของ 14 Oct 2026 "Tech lead สามารถใช้สกิลที่ดีที่สุดที่มี รีวิว PR ถ้าผ่านแล้วให้ merge ได้เลย"): Tech Lead มี 2 คน หยิบ PR ที่เปิดใหม่เอง รีวิวด้วยสกิล `code-review` ที่ติดตั้งอยู่ และสกิล `security-audit` ของ repo เมื่อ PR แตะ rules, secrets หรือ workflow · ผ่านเมื่อรีวิว APPROVE และ CI เขียวครบ แล้ว merge เองเข้า `release/next` · ห้าม merge เมื่อ check แดง (guard `evidence-hook.mjs`) · ก่อนใช้จริงต้องแก้ branch protection และ `agent.yml` ที่ตอนนี้ให้เจ้าของเป็นคน merge (แถวในแผนแม่)

## 2a2. สกิลที่แต่ละตำแหน่งใช้ (ตารางบังคับ + รายชื่อเสริม)

source: เจ้าของ 14 Oct 2026 popup "ตารางสกิลต่องาน + สกิลเสริมจากรายชื่อที่อนุมัติ" (คำถาม: agent เลือกสกิลอย่างไร) · ตารางนี้คือ judgment ตั้งต้น เจ้าของแก้ได้ทุกช่อง

1. **สกิลบังคับ:** งานแต่ละชนิดของแต่ละตำแหน่งต้องเรียกสกิลในตารางก่อนลงมือ

   | ตำแหน่ง | งาน | สกิลบังคับ |
   |---|---|---|
   | PO | จัดลำดับ ตั้งขอบเขตและ AC | `product-management:write-spec` |
   | BA | วิเคราะห์ requirement เขียน plan | `superpowers:writing-plans` |
   | QA Lead | test plan ผูก AC | `engineering:testing-strategy` |
   | Dev | เขียนโค้ด | `superpowers:test-driven-development` |
   | Dev | CI แดงหรือบัค | `superpowers:systematic-debugging` |
   | Tech Lead | รีวิว PR (Gate 3) | `engineering:code-review` (เพิ่ม `security-review` เมื่อแตะสิทธิ์ rules หรือ secret) |
   | ทุกตำแหน่ง | ตอนเริ่มงานที่ยังไม่เห็นทาง ต้องควานหาแนวทาง (งานใหญ่ เกิน 1 session) | `wayfinder` ทำแมพใน `docs/wayfinder/` (เจ้าของ 14 Oct 2026: "ใช้ตอนเริ่มงาน และต้องควานหาแนวทาง") |
   | ทุกตำแหน่ง | ทุกงานเขียนโค้ดและวางแผน | ชุด superpowers เริ่มที่ `superpowers:using-superpowers` แล้วตามลำดับ `brainstorming` → `writing-plans` → `test-driven-development` หรือ `executing-plans` (เจ้าของ 14 Oct 2026: "ใช้เขียนโค้ดและทำงานวางแผน") |
   | ทุกตำแหน่ง | ทุกงานรีวิวเอกสาร (plan, spec, README, runbook, md ในเรโป) | `engineering:documentation` (เจ้าของ: "ใช้รีวิวเอกสาร") |
   | ทุกตำแหน่ง | ทุกงานรีวิวโค้ด รวมรีวิว PR ซ่อม e2e ของ QA Lead | `engineering:code-review` (เจ้าของ 14 Oct 2026: "ใช้รีวิวโค้ด") |
   | QA | ทดสอบบน staging | `testing-ticket-workflow` |
   | QA (OLS) | เขียนเทสเคส | `tc-fe-prep-workflow` หรือ `tc-api-prep-workflow` |
   | QA Lead (OLS) | รีวิวเทสเคส | `tc-review-workflow` |
   | QA (OLS) | รีเทส bug หรือ task | `retest-bug-workflow` |
   | QA Lead (OLS) | รีวิวผลเทส | `review-result-workflow` |
   | QA (ols-qa-e2e) | ซ่อม e2e | `playwright-best-practices` + `flaky-test-doctor` |
   | ทุกตำแหน่ง | ทุกงาน automate (เขียน แก้ หรือรีวิวเทสต์ Playwright ทุกเรโป) | `playwright-best-practices` (เจ้าของ 14 Oct 2026: "ใช้สำหรับงาน automate") |
   | ทุกตำแหน่ง | ก่อนบอกว่าเสร็จ | `superpowers:verification-before-completion` |

   - **งาน OLS ใช้สกิลจากเรโป OLS-QA เสมอ (เจ้าของ 14 Oct 2026):** "งานใน ols ที่ทำเทสเคสและเทส ทุกขั้นตอน ให้ใช้สกิลใน ols-qa repo เสมอ" ทุกแถว OLS และ ols-qa-e2e อ่านสกิลจาก `~/GitHub/ols-qa/skills` (ฉบับล่าสุดบน main ของเรโปนั้น) ไม่ใช้สำเนาอื่น
   - **ติดปัญหาเรียก systematic-debugging เสมอ (เจ้าของ 14 Oct 2026):** "ถ้าทำแล้วติดปัญหาให้เรียกสกิล /superpowers:systematic-debugging เสมอ เพื่อการตรวจสอบเชิงลึก" ทุกตำแหน่งที่ติดปัญหา (เทสต์แดง ผลไม่คงที่ เครื่องมือ error หรือผลไม่ตรงที่คาด) เรียก `superpowers:systematic-debugging` ก่อนแก้ทุกครั้ง หา root cause ก่อน ห้ามเดาแก้

2. **สกิลเสริม:** ใช้ได้เฉพาะจากรายชื่อที่เจ้าของอนุมัติ: `catch-ai`, `superpowers:brainstorming`, `engineering:debug`, `simplify` · ห้ามติดตั้งสกิลใหม่เอง · อยากใช้ตัวนอกรายชื่อให้ถามเจ้าของทาง DM Slack ก่อน
3. **บอกทุกครั้ง:** PR และข้อความ DM ระบุสกิลที่ใช้ในงานนั้น เพื่อให้ตรวจย้อนได้
4. **เหตุผล:** ผลคงที่และตรวจได้ คุม token เพราะไม่ต้องลองหลายสกิล ตรงกับที่เจ้าของเคยกำหนดให้ Tech Lead ใช้ `code-review`

## 2a3. agent จำได้ ไม่ถามซ้ำ ไม่พลาดซ้ำ

source: เจ้าของ 14 Oct 2026 "agent ทุกตัวต้องจดจำ ไม่ถามซ้ำและไม่ผิดพลาดเรื่องเดิมหรือใกล้เคียงก็ตาม"

1. **สมุดคำตอบต่อโปรเจกต์:** ทุกคำตอบของเจ้าของ (จาก DM Slack, popup หรือคอมเมนต์) บันทึกลงไฟล์คำตอบของโปรเจกต์นั้นในเรโปทันที พร้อมคำพูดจริงและวันที่ · ก่อนถามทุกครั้ง agent ค้นไฟล์นี้และ DECISION_LOG ก่อน ถ้ามีคำตอบแล้วใช้ของเดิม และบอกว่าใช้คำตอบไหน
2. **สมุดบทเรียน:** ทุกความผิดพลาดที่เจ้าของทักหรือที่ตรวจเจอ บันทึกเป็นบทเรียน: อาการ สาเหตุจริง (ผ่าน `superpowers:systematic-debugging`) วิธีป้องกัน และรูปแบบที่ใกล้เคียงที่ต้องระวังด้วย · โปรเจกต์นี้ใช้ `docs/PITFALLS.md` เป็นที่เก็บ
3. **อ่านก่อนเริ่มทุกงาน:** prompt ของทุก agent เริ่มด้วยการอ่านสมุดคำตอบและสมุดบทเรียนของโปรเจกต์ที่เกี่ยวข้อง
4. **กันซ้ำด้วยเครื่อง:** บทเรียนที่ตรวจได้ด้วยเครื่องต้องมีตัวตรวจ (เทสต์ gate หรือ assertion) ในงานเดียวกัน เพื่อไม่ให้พลาดเรื่องเดิมหรือเรื่องใกล้เคียงได้อีก
5. **ถามซ้ำนับเป็นความผิดพลาด:** ถามเรื่องที่มีคำตอบแล้ว บันทึกเป็นบทเรียนและหาสาเหตุเหมือนบัค

## 2a4. Spec-Driven Development: สเปกมาก่อนโค้ดเสมอ

source: เจ้าของ 15 Oct 2026 "อยากให้ Agent ประยุกใช้ แนวคิด Spec-Driven Development ... โดยใช้เป็นกฏที่ต้องทำเสมอ เราไม่ต้องสั่งไม่ต้องคอยบอก" · สกิล `engineering-advanced-skills:spec-driven-workflow` (เพิ่มในตารางข้อ 2a2 สำหรับ PO, BA และ Tech Lead)

สเปกคือ source of truth ตัวจริง ไม่ใช่โค้ด และเป็นเอกสารที่มีชีวิต: requirement เปลี่ยนเมื่อไร แก้สเปกก่อนเสมอ แล้วจึงให้ agent สร้างโค้ดส่วนที่เกี่ยวข้องใหม่จากสเปก ห้ามไล่แก้โค้ดทีละจุดโดยสเปกตามไม่ทัน

| ขั้น | ใครทำ | ผลลัพธ์ | จุดตรวจของคน |
| :--- | :--- | :--- | :--- |
| 1. Specify | PO และ BA | บล็อกสเปกใน issue: ระบบต้องทำอะไร เงื่อนไขเขียนเป็น "เมื่อเกิด X ระบบต้องทำ Y" ทุกข้อ ข้อจำกัด (เช่น จำนวนสูงสุด สิทธิ์ ข้อมูลที่ห้ามแสดง) และเกณฑ์ว่างานเสร็จ ที่ตรวจได้ด้วยเทสต์ | Gate 1 (เจ้าของ) |
| 2. Plan | Tech Lead | แผนเทคนิคจากสเปก: ไฟล์ที่จะแตะ library โครงสร้างข้อมูล และข้อไหนของสเปกตรงกับส่วนไหนของแผน | Gate 1 (เจ้าของ อนุมัติพร้อมสเปก) |
| 3. Tasks | Tech Lead และ QA | แตกแผนเป็นงานย่อยที่ทำได้ทีละชิ้น แต่ละงานมีเกณฑ์เสร็จของตัวเองและเทสต์ที่อ้างถึงเงื่อนไขในสเปก | Gate 2 (เจ้าของ อนุมัติ test plan) |
| 4. Implement | Dev | เขียนโค้ด test-first จากสเปกและแผนที่ผ่านการตรวจแล้วเท่านั้น ไม่เดาเอง เจอช่องว่างในสเปกให้หยุดและถามใน DM ไม่เติมเอง | Gate 3 (Tech Lead รีวิวเทียบกับสเปก) |

กติกาที่ทุก agent ถือ:

1. **ไม่มีสเปก ไม่เริ่มโค้ด:** issue ที่ยังไม่มีบล็อกสเปกที่ผ่าน Gate 1 ห้ามเข้า `agent:building`
2. **แก้สเปกก่อนเสมอ:** คำขอเปลี่ยนจากเจ้าของ (DM, คอมเมนต์ หรือ `/revise`) แก้บล็อกสเปกก่อน แล้วจึงแก้แผน งานย่อย และโค้ดตามลำดับ การอนุมัติเดิมเป็นโมฆะเมื่อสเปกเปลี่ยน
3. **ทุกเทสต์ชี้กลับไปที่สเปก:** ชื่อหรือคอมเมนต์ของเทสต์อ้างข้อในสเปกที่มันพิสูจน์ ข้อในสเปกที่ไม่มีเทสต์ถือว่ายังไม่เสร็จ
4. **รีวิวเทียบสเปก ไม่ใช่เทียบความรู้สึก:** Tech Lead ตรวจ PR ว่าทำครบทุกเงื่อนไขในสเปก และไม่ทำเกินสเปก
5. **ใช้กับงานทุกโปรเจกต์:** งาน OLS ใช้ AC และ EC ของ story เป็นสเปกตามสกิลใน ols-qa ไม่ต้องเขียนสเปกซ้ำ

## 2b. Release: a batch of 10, approved by the QA Lead

source: เจ้าของ 14 Oct 2026 "เมื่อมีงานรอดีพอยมากพอ เช่น 10 อัน ให้แจ้งไปยัง QA Lead แล้ว QA lead ถึงอนุมัติการดีพอย staging", "อนุมัติโดย QA Lead", popup: Gate 4 "แทนด้วยรอบ QA", prod "QA Lead กดเอง"

1. Tech Lead merge PR ที่ผ่านเข้า branch รวม `release/next` ไม่เข้า main ทีละใบ
2. ครบ 10 issue บน `release/next` ระบบแจ้ง QA Lead ใน Slack
3. QA Lead อนุมัติ แล้วเปิดรอบด้วย `round.mjs` merge `release/next` เข้า main ครั้งเดียว · CI เขียวครบแล้ว `deploy-staging` ขึ้นเอง (ข้อ 12, 17)
4. QA รัน regression อัตโนมัติที่มีอยู่บน staging (`scripts/e2e.mjs` ตามแผน E2E) แล้วส่งรายงานเข้า Slack `C0C8TSRK1PE` ด้วย `scripts/e2e-slack-report.mjs`
5. ผ่านครบทุกเคส QA แจ้ง QA Lead พร้อมลิงก์ข้อความผลใน Slack · แดงแม้เคสเดียว ไม่ไป production เปิด bug ตาม BUG_WORKFLOW แล้วแก้ใน `release/next`
6. QA Lead เห็นผลผ่านใน Slack แล้ว สั่ง `deploy-production.yml` ด้วย sha ที่ผ่าน regression เอง แจ้งเจ้าของใน Slack แล้วปิดทุก issue ในรอบ (Gate 4 เดิมที่เจ้าของตอบทีละใบ ถูกแทนด้วยรอบนี้)

**ทำไมใช้ branch รวม (judgment):** การ merge เข้า main ทีละ PR เริ่ม CI และ deploy staging ทุกครั้ง ซึ่งขัดกับการรอให้ครบ 10 และกินงบรอบของข้อ 19 · branch รวมไม่มีค่าใช้จ่าย ส่วน environment reviewer ของ GitHub บน repo private ต้องใช้ plan เสียเงิน (ข้อ 1 ห้าม)

**ยังต้องทำก่อนใช้จริง:** สร้าง `release/next` และให้ `agent.yml` เปิด PR เข้า branch นั้น · job นับคิวและแจ้ง QA Lead · ให้ QA Lead (agent) มีสิทธิ์สั่ง `deploy-production.yml` · แถวเหล่านี้เพิ่มในแผนแม่

**กติกาการหยิบงาน (pull):** ไม่มีใครแจกงาน · คนของตำแหน่งที่ว่างหยิบใบที่เก่าสุดในกล่องของตัวเองทันที แล้วเขียนคอมเมนต์ handoff (ข้อ 2) ว่าหยิบแล้ว · คนละตำแหน่งไม่หยิบงานข้ามกล่อง · กล่องว่างให้ไล่หาจุดบอดตามข้อ 2c ไม่นั่งรอ · ทุก gate ยังเป็นของเจ้าของคนเดียว (judgment: ใช้เพดานและ gate เดิมของ `agent.yml` ไม่เพิ่มสิทธิ์ใหม่)

## 2c. No idle agent: the blind-spot sweep

source: เจ้าของ 14 Oct 2026 "อยากให้ออกแบบให้ agent ไม่ว่าง หรือว่างเท่าที่จำเป็นจริง เช่น ถ้าไม่มีงานก็หาจุดบอดในระบบนั้นๆ แล้วดำเนินการสร้างใบงานใน GitHub แล้วก็ทำตามขั้นตอนตามลำดับเพื่อให้ระบบดีขึ้น"

1. **กล่องว่าง = เริ่ม sweep ทันที:** คนที่ไม่มี issue ในกล่องของตัวเอง ไล่หาจุดบอดในขอบเขตของตำแหน่งตัวเอง ไม่นั่งรอ

   | ตำแหน่ง | ขอบเขตที่ไล่ |
   |---|---|
   | PO | backlog ที่ยังไม่มี AC, issue ซ้ำ, ลำดับที่ไม่ตรงคุณค่า |
   | BA | flow และกฎธุรกิจที่ยังไม่มี edge case ใน SPEC |
   | Dev | TODO, dead code, dependency ที่ตามหลัง, โค้ดซ้ำ |
   | Tech Lead | สถาปัตย์ ความปลอดภัย performance |
   | QA Lead | AC ที่ยังไม่มีเทสต์ครอบ (coverage gap) |
   | QA | exploratory test บน staging |
   | Head | ไม่ sweep · ดูเงินสนับสนุนทีม ค่าใช้จ่ายด้าน AI และส่งเรื่องให้เจ้าของ |

2. **เจอแล้วเปิดใบงานใน GitHub:** ใช้ฟอร์ม `.github/ISSUE_TEMPLATE/improvement.yml` ขึ้นต้น `[Improvement] ` แนบหลักฐาน (`path:line`, คำสั่งที่รันและผล หรือภาพหน้าจอ) ติด label `self-filed` เท่านั้น **ไม่ติด `agent:ready`** (`decide()` ใน `scripts/agent/dispatch.mjs` นับ `agent:ready` เฉพาะที่บัญชีผู้ใช้ของเจ้าของติดเอง (`isOwnerAct`) จึงไม่นับ label ที่ bot ติด และ label ที่ขึ้นต้น `agent:` สงวนไว้ให้ dispatcher) · เจ้าของติด `agent:ready` เองเมื่อต้องการให้เริ่ม · เจ้าของอนุญาตถาวรให้ sweep เปิดใบเองภายใต้เพดานข้อ 5 (popup 14 Oct 2026 "อนุญาตถาวร มีเพดาน") เป็นข้อยกเว้นของกฎข้อ 23 เฉพาะ sweep นี้ · ใบนี้เดินทุกขั้นและทุก gate ตามลำดับเหมือนงานปกติ: PO จัดลำดับ, BA เขียน plan, Gate 1, Gate 2, Dev, Tech Lead (Gate 3), รอบ release ของ QA Lead
3. **ไม่ใช่ bug:** สิ่งที่ sweep เจอเป็น improvement เสมอ เว้นแต่ขัดกับสเปกที่ยืนยันแล้ว ซึ่งต้องอ้าง SPEC, DATA_MODEL หรือ DECISION_LOG ได้ จึงไปทาง `docs/BUG_WORKFLOW.md` (CLAUDE.md ส่วน "A bug takes a different route", กฎข้อ 10 และ 24 ของ global CLAUDE.md)
4. **ก่อนเปิดต้องค้นซ้ำ:** ค้นใบที่เปิดอยู่และที่ปิดภายใน 30 วันก่อน ถ้าซ้ำให้คอมเมนต์หลักฐานเพิ่มในใบเดิมแทน
5. **เพดาน (judgment):** ใบที่ agent เปิดเองค้างได้ตำแหน่งละ 1 ใบ และรวมทั้งทีมไม่เกิน 5 ใบ · ครบเพดานแล้วให้ทำงานประจำของตำแหน่ง (`own` ในต้นแบบ) แทน · เพดานนี้กันคิวท่วม ซึ่งคิวที่ล้นจะทำให้ issue ของเจ้าของต้องรอนาน
6. **ว่างได้เฉพาะเบรกสั้น:** พักเฉพาะหลังเปิดใบครบ 3 ใบ ช่วงละสั้น ๆ แล้วกลับมา sweep ต่อ · นอกจากนี้ไม่มีสถานะว่าง
7. **คุมค่าใช้จ่ายด้าน AI:** sweep ใช้ token และนับเข้าค่าใช้จ่ายด้าน AI · ตำแหน่งละ 1 sweep ต่อชั่วโมง อ่านเฉพาะส่วนที่จำเป็น (ข้อ 5 ของเอกสารนี้) · ถ้าค่าใช้จ่ายด้าน AI ค้างชำระ ให้หยุด sweep จนกว่าจะชำระครบ

**ในต้นแบบ:** สถานะ "หาจุดบอดในระบบ" (สีของตัวเอง) อยู่ใน roster, แถบสรุป และป้ายบนแมป · ใบที่เปิดเองมีป้าย `Improvement` ในตารางงานของแต่ละฝ่าย · ค่าตั้งอยู่ที่ `SWEEP` และ `SWEEPS` ใน `agent-office.html`

**สถานะโค้ด (15 Oct 2026):** PR #499 (ต่อจาก #496) มี `scripts/agent/sweep.mjs`, คำสั่ง `sweep` ใน `cli.mjs` (dry run เว้นแต่ `AGENT_SWEEP_FILE=1`) และ `.github/workflows/agent-sweep.yml` รันวันละครั้งบน `ubuntu-latest` · ปิดไว้จนตั้งทั้ง `vars.AGENT_ENABLED` และ `vars.AGENT_SWEEP_ENABLED` เป็น `'true'` · หยุดเมื่อ `vars.AGENT_AI_COST_UNPAID == 'true'` (repo ยังไม่มีสถานะค่าใช้จ่ายด้าน AI จริง) · เพดานเพิ่ม: ไม่เกิน 3 ใบใหม่ต่อรอบ · v1 หาจุดบอดแบบไม่เรียกโมเดล: PO (issue ที่ไม่มี checkbox Definition of done), Dev (TODO/FIXME/XXX/HACK พร้อม `path:line`), QA Lead (`coverage()` ของ `scripts/lib/e2e-coverage.mjs`) · BA, Tech Lead และ QA ยังไม่มีแหล่งแบบตายตัวใน v1

## 3. Budgets and limits

| ขีดจำกัด | ค่า | ที่มา |
| :--- | :--- | :--- |
| เวลาต่อ job | ตามตารางข้อ 2 | source: `timeout-minutes` ใน `agent.yml` |
| token ต่อขั้น | ตามตารางข้อ 2 · เกิน 100% ให้ agent หยุดและติด `agent:blocked` "เกินงบ token" | judgment (ปิดช่องว่าง R5 "ไม่มีเพดาน usage") |
| `--max-turns` ของ claude-code-action | plan 30 · build 80 · review 20 | judgment, ต้องอ่านเอกสาร claude-code-action ยืนยันชื่อ input ก่อนใส่ (UNVERIFIED) |
| run ต่อ issue ต่อวัน | 6 run · `/revise` ครั้งที่ 4 ขึ้นไปต้องให้เจ้าของพิมพ์ `/revise --force` | judgment, เสนอเข้า R83 ให้เจ้าของตัดสิน |
| วงรีวิว | REQUEST_CHANGES ได้ 2 รอบ รอบที่ 3 ติด `agent:blocked` | judgment ตามแม่แบบ evaluator (`max_iterations` 3) |

## 4. Failure handling

| เหตุ | ทำอะไร | ที่มา |
| :--- | :--- | :--- |
| โค้ดของ agent พัง (test, lint, CI) | หา root cause แก้ใน commit ถัดไป ห้าม rerun ให้เขียว ห้าม skip ห้ามขยาย tolerance | source: กฎ global 7, 18, 21 |
| นอกโค้ด (usage limit, Actions นาทีหมด, GitHub ล่ม, timeout 6 ชม.) | `agent:blocked` พร้อม error จริงแล้วหยุด ไม่ retry อัตโนมัติ | source: แผนแม่ "Failure handling" |
| run ถูกยกเลิกกลางคิว | คำอนุมัติอ่านจากประวัติ ไม่หาย run ถัดไปทำต่อ | source: Decisions Q2 |
| ผลลัพธ์ผิดสัญญา (ไม่มี handoff marker, sha ไม่ตรง) | dispatcher ไม่เดินขั้นต่อ ติด `agent:blocked` "handoff ไม่ครบ" | judgment |
| commit ของ App บน `main` ที่ไม่ใช่ merge | workflow ตรวจ `main` แจ้งเจ้าของ | source: Decisions Q3, `agent-main-audit.yml` |

## 5. Quality and token efficiency standards (ใส่ใน prompt ของ agent)

คำสั่งเจ้าของ 14 Oct 2026: "ทุก agent ต้องพยายามทำงานด้วยการประหยัดและใช้ token ให้คุ้มค่า และได้งานที่มีคุณภาพได้มาตรฐานระดับสากล"

| มาตรฐาน | วิธีวัด | ที่มา |
| :--- | :--- | :--- |
| อ่านเฉพาะไฟล์ที่ plan อ้าง ไม่อ่านทั้งเรโป | token ต่อขั้นเทียบงบ | judgment |
| prompt คงที่ไว้ต้น ส่วนที่เปลี่ยนไว้ท้าย เพื่อให้ cache ทำงาน | สัดส่วน cache read ต่อ input ≥ 70% | source: claude-api skill, Prompt Caching ("prefix match") |
| test-first: เทสต์ตกก่อนแก้ ผ่านหลังแก้ | หลักฐานใน PR | source: hard constraint 12 |
| UI ผ่าน gate 3 ความกว้าง × 2 ธีม, contrast, tap 44px | CI `app-gates`, `parity` | source: CLAUDE.md "Working is not the bar" |
| ความปลอดภัย: ไม่มี secret ใน log/คอมเมนต์ | success criteria ของแผนแม่ | source: แผนแม่ "Success Criteria" |

## 6. Observability

- **Agent Office** อ่าน label `agent:*`, handoff marker และ token ของแต่ละ run (source: V1 Cloudflare Pages Function อ่านอย่างเดียว)
- **token จริง** มาจาก usage ของแต่ละ run ของ claude-code-action (UNVERIFIED: ต้องยืนยันว่า action เปิด usage ออกมาให้ step ถัดไปอ่านได้ ก่อนเชื่อมระบบเงินจริง)
- **ราคา** Claude Opus 5.5 USD 4 input / 0.20 cache read / 20 output ต่อล้าน token (source: claude-api skill, cached 6 Oct 2026) · อัตรา USD→THB ใช้อัตราตลาดจาก ExchangeRate-API (open.er-api.com ฟรี ไม่ต้องใช้ key) อัปเดตทุกชั่วโมง ค่าใช้จ่ายแต่ละช่วงคิดด้วยอัตรา ณ เวลานั้น ไม่ตีราคาค่าใช้จ่ายด้าน AI ค้างชำระเก่าใหม่ (source: เจ้าของ 14 Oct 2026 "ไม่ตั้งเองสิ อิงตามสากลขณะ ณ เวลานั้นๆ")

---

## 7. Team economy: team support fund, debt, bonuses, missions

### 7.1 หลักการ (กันการเล่นเกมเพื่อเงิน)

1. **เงินคำนวณจากข้อเท็จจริงเท่านั้น**: label, คำอนุมัติของเจ้าของ, ผล CI, verdict ของ job รีวิว, token จาก usage · ไม่เชื่อสิ่งที่ agent เขียนว่าตัวเองทำได้ (judgment)
2. **agent ไม่เห็นเงินและภารกิจใน prompt**: prompt มีแค่มาตรฐานข้อ 5 เพื่อไม่ให้ agent เลี่ยงงานยากหรือแต่งตัวเลขเพื่อโบนัส · ระบบเงินเป็นกระดานผลงานให้เจ้าของดู (judgment)
3. **บวกอย่างเดียว ไม่มีค่าปรับ**: เกินงบ token ไม่หักเงิน แค่ไม่ได้โบนัสข้อนั้น ค่าใช้จ่ายด้าน AI ค้างชำระมีอยู่แล้วเป็นแรงจูงใจพอ (judgment)
4. **ทุกตัวเลขเป็นค่าจำลอง** ไม่มีใครได้รับเงินจริง · hard constraint 4 ใช้กับแอป Taskfolio ไม่ใช่หน้านี้ (source: DECISION_LOG "Agent Office prototype: Sims style commands, team fund, token debt and sound")

### 7.2 รายได้หลัก (เมื่อ issue ขึ้น production ในรอบ release และปิด)

S ฿300 · M ฿800 · L ฿2,000 · XL ฿5,000 (source: DECISION_LOG วันเดียวกัน, judgment ภายใต้การมอบหมายของเจ้าของ)

### 7.3 โบนัสคุณภาพ (คิดเป็น % ของรายได้หลัก รวมไม่เกิน +60%)

| โบนัส | เงื่อนไข (วัดจากข้อเท็จจริง) | % |
| :--- | :--- | :---: |
| Plan รอบเดียว | Gate 1 ผ่านโดยไม่มี `/revise` | +10 |
| Test plan รอบเดียว | Gate 2 ผ่านโดยไม่มี `/revise` | +10 |
| CI เขียวรอบแรก | run แรกของ head sha ใน PR เขียวทุก job | +15 |
| รีวิวผ่านรอบเดียว | job รีวิว APPROVE รอบแรก | +10 |
| ประหยัด token | token ทั้ง issue ≤ งบรวมของขนาดนั้น | +15 |
| ไม่ติดขัด | ไม่เคยมี `agent:blocked` ที่เกิดจากโค้ด | +5 |
| ชำระครบ | ตอนปิด issue ค่าใช้จ่ายด้าน AI ค้างชำระ ของทีมเป็น 0 | +5 |

### 7.4 ภารกิจ (missions)

| ชนิด | ตัวอย่าง | รางวัล | รีเซ็ต |
| :--- | :--- | :---: | :--- |
| ภารกิจประจำวัน | ปิด 2 issue วันนี้ · ทั้งวันไม่มีงานติด blocked · cache read ≥ 70% ของ input · ชำระค่าใช้จ่ายด้าน AIหมดก่อนเที่ยงคืน | ฿200 ถึง ฿500 | 00:00 Asia/Bangkok |
| ภารกิจสด (ระหว่างทำงาน) | สุ่มทีละ 1 ภารกิจ มีนับถอยหลัง เช่น "Dev ส่ง PR ที่ CI เขียวรอบแรกภายใน 30 นาที", "ทีมใช้ token ไม่เกิน 2M ใน 15 นาทีถัดไป", "Tech Lead รีวิวจบรอบเดียว" | ฿150 ถึง ฿300 | เมื่อสำเร็จหรือหมดเวลา |
| ภารกิจประจำสัปดาห์ | ปิดงาน XL 1 ใบ · ไม่มีค่าใช้จ่ายด้าน AI ค้างชำระข้ามคืนทั้งสัปดาห์ (streak) | ฿1,000 | วันอาทิตย์ (สัปดาห์เริ่มวันอาทิตย์ ตาม CLAUDE.md Conventions) |

**Head ชำระค่าใช้จ่ายด้าน AI ทันทีเสมอ:** ทุกรอบที่ระบบอัปเดต Head ตรวจยอด ถ้ามีค่าใช้จ่ายด้าน AI ค้างชำระ และเงินสนับสนุนทีมยังมีเหลือ Head ชำระทันทีเท่าที่เงินมี ไม่ปล่อยค้าง (source: เจ้าของ 14 Oct 2026 "Head ต้องคอย monitor เสมอ ถ้ามีค่าใช้จ่ายด้าน AI ค้างชำระ และมีเงินอยู่ต้องจ่ายชำระเลยเสมอ ไม่ค้างไว้") · ปุ่มชำระค่าใช้จ่ายด้าน AIด้วยมือยังอยู่

**Streak ชำระครบ:** ทุกวันที่จบวันโดยค่าใช้จ่ายด้าน AI ค้างชำระเป็น 0 นับ streak +1 · ครบ 3 วัน ฿300, 7 วัน ฿1,000 · วันไหนมีค่าใช้จ่ายด้าน AI ค้างชำระ streak กลับเป็น 0 (judgment)

### 7.4b ค่าสาธารณูปโภคและค่าเสบียง (จำลองในต้นแบบ)

source: เจ้าของ 14 Oct 2026 "เพิ่มระบบค่าสาธารณูปโภค เช่น ค่าน้ำ ค่าไฟ ค่าเน็ต ค่าอาหารเสบียงทีม ... ค่าอาหาร เกิดตอนที่กดที่ตู้เย็น แล้วเลือก สั่งเสบียง ใครก็กดได้ เราก็กดได้ แล้วหักเงินจากเงินสนับสนุนทีม"

| รายการ | วิธีคิด (judgment: อัตราประมาณ ไม่ใช่ราคาที่อ้างแหล่ง) |
| :--- | :--- |
| ไฟฟ้า | 4.20 บาทต่อหน่วย · โหลด 3.5 kW (แอร์ ตู้เย็น ไฟ) บวก 0.12 kW ต่อคนที่ทำงาน · 1 รอบจำลอง 4 วินาที = 15 นาทีออฟฟิศ |
| น้ำประปา | 18.50 บาทต่อลูกบาศก์เมตร · นับตามการใช้: ชักโครก 6 ลิตร, โถปัสสาวะ 2, อาบน้ำ 40, ล้างมือ 1, เครื่องล้างจาน 12, ทำอาหาร 5 |
| อินเทอร์เน็ต | 1,590 บาทต่อเดือน กระจายตามเวลา |
| เสบียง | เกิดเมื่อมีคนกดตู้เย็นแล้วเลือกสั่งเสบียงเท่านั้น ทั้งคนในทีมและเจ้าของ: วัตถุดิบ 12 จาน 1,200 บาท · เครื่องดื่ม 24 ขวด 600 บาท · ขนมและไอศกรีม 20 ชิ้น 500 บาท · ทำอาหาร หยิบเครื่องดื่ม หยิบขนม จะตัดจากของในสต็อก ถ้าหมดต้องสั่งใหม่ |

Head หักค่าใช้จ่ายทั้งหมดจากเงินสนับสนุนทีมอัตโนมัติเหมือนค่าใช้จ่ายด้าน AI ค้างชำระ ไม่ปล่อยค้าง

### 7.5 สิ่งที่ยังต้องพิสูจน์ก่อนต่อกับของจริง

- usage token ต่อ run ของ claude-code-action อ่านได้จาก step ถัดไป (ข้อ 6)
- "run แรกของ head sha" นับได้จาก GitHub API (`attempt` และ `head_sha` ของ workflow run)
- ที่เก็บยอดเงินสนับสนุนทีม (ตอนนี้เก็บในเบราว์เซอร์แต่ละคน) ต้องรอ V1/V5 ตัดสินที่เก็บ roster และ state

---

## 8. Slack notifications

คำสั่งเจ้าของ 14 Oct 2026: "การอัปเดตแจ้งเตือน ตั้งแต่เริ่มงาน ขอการตัดสินใจจากเรา หรือจบงาน แจ้งใน slack แบบที่เราเคยบอกไว้ในแพลน" · รูปแบบเดียวกับ [feedback-form-to-github-slack](feedback-form-to-github-slack.md) (source ทุกแถวด้านล่างอ้างแผนนั้น เว้นแต่ระบุ)

| เรื่อง | ตัดสิน | ที่มา |
| :--- | :--- | :--- |
| ที่โพสต์ | bot Taskfolio ใน channel `C0C8TSRK1PE` · **1 เธรดต่อ 1 issue** เก็บ `thread_ts` ใน handoff marker ของ issue | source: แผน feedback loop S2 "Ack", ข้อ "comment marker" |
| ผู้ถูก mention | `<@vars.SLACK_OWNER_ID>` เฉพาะ Gate 1, Gate 2, mock และติดปัญหา · ข้อความรอบ release mention QA Lead | source: แผน feedback loop "Owner member ID" |
| token | `secrets.SLACK_BOT_TOKEN` ของ GitHub Environment `staging` ต้องใส่ `environment: staging` ใน job ที่โพสต์ · ไม่มี token ใน log | source: แผน feedback loop, SLACK_BOT.md |
| การอนุมัติ | bot ส่งได้อย่างเดียว (ไม่มี `channels:history`) ข้อความจึงบอกลิงก์และคำสั่งที่ต้องพิมพ์ใน GitHub (`/approve-plan` ฯลฯ) จนกว่าเจ้าของตัดสิน D2 ของแผนนั้น | source: SLACK_BOT.md บรรทัด 62–64, แผน feedback loop D2 |
| สรุปรายวัน | 09:00 Asia/Bangkok หนึ่งข้อความ รวม issue ที่รอเจ้าของ และรอบ release ที่รอ QA Lead (ไม่โพสต์ถ้าไม่มี) | source: แผน feedback loop "ทุกวัน 09:00" |
| เตือนซ้ำ | รอเกิน 24 ชั่วโมง เตือนในเธรดหนึ่งครั้ง | source: แผน feedback loop "ไม่มีคำตอบใน 24 ชั่วโมง" |

**ข้อความแต่ละจังหวะ** (ข้อความเปิดเธรดคือจังหวะแรก ที่เหลือตอบในเธรด):

| จังหวะ | เมื่อไร (ข้อเท็จจริงที่ใช้) | ข้อความ |
| :--- | :--- | :--- |
| เริ่มงาน | dispatcher รับ `agent:ready` จากเจ้าของ | `▶️ เริ่มงาน #N <ชื่อ issue> · ขนาด M · งบ token 4.8M · <ลิงก์ issue>` |
| เข้าคิว | ใบที่ 4 ได้ `agent:queued` | `⏳ #N เข้าคิว รอที่ว่าง (กำลังทำ 3/3)` |
| ขอตัดสินใจ Gate 1 | โพสต์ plan แล้ว `agent:planning` | `@เจ้าของ 🟣 Gate 1 · plan ของ #N พร้อม · ตอบใน GitHub: /approve-plan หรือ /revise <เหตุผล> · <ลิงก์>` |
| ขอยืนยัน mock | issue แตะ UI ติด `agent:blocked` รอ mock | `@เจ้าของ 🟣 mock ของ #N commit แล้ว · republish ทับลิงก์เดิมแล้วตอบ /approve-mock <url>` |
| ขอตัดสินใจ Gate 2 | `agent:test-planning` | `@เจ้าของ 🟣 Gate 2 · test plan พร้อม · /approve-tests หรือ /revise` |
| Gate 3 merge แล้ว (แจ้งอย่างเดียว) | Tech Lead merge | `🔀 PR #P merge แล้ว โดย Tech Lead · รีวิว ✅ CI ✅ · รอ staging` |
| ติดปัญหา | `agent:blocked` นอกโค้ด | `@เจ้าของ 🔴 #N ติด: <error จริงบรรทัดเดียว> · ต้องการ: <สิ่งที่ต้องทำ>` |
| คิว release ครบ | `release/next` ครบ 10 issue | `@QA Lead 📦 รอบ release พร้อม 10 issue · อนุมัติ deploy staging` |
| regression จบ | QA รันครบ | `🧪 regression บน staging ผ่าน 120/120 · <ลิงก์รายงาน> · @QA Lead พร้อม deploy production` |
| ขึ้น production | QA Lead สั่ง deploy | `🚀 production sha <sha> · 10 issue · regression ผ่าน <ลิงก์ Slack>` |
| จบงาน | issue ปิดหลังขึ้น production | `✅ ปิด #N · ใช้ token 3.1M (฿…) · ทีมได้ ฿… รวมโบนัส +…% · ค้างชำระ ฿…` |

**ยังต้องทำก่อนใช้จริง:** แถว 14 ของแผนแม่ (job โพสต์ Slack ใน `agent.yml` พร้อมเทสต์ของตัวสร้างข้อความ) · ยืนยันว่า bot ถูก invite เข้า `C0C8TSRK1PE` แล้ว (แผน feedback loop แถว 5 ยังเปิด)

## 8a. ขออนุมัติทาง DM Slack (สเปกเสนอ รอเจ้าของยืนยัน)

source: เจ้าของ 14 Oct 2026 "หลักๆ agent ถ้ามีไรถามเรา ส่งแจ้งเราใน DM Slack แล้วเราจะไป รีพลาย แล้วคุณค่อยมาทำงานต่อ" และ "ถ้าเรา reply ว่า passed ก็ค่อยไปจัดการต่อได้" · ช่องว่างที่ต้องปิด: Decisions Q1 ของ always-on นับ `agent:ready` และ approve เฉพาะเมื่อบัญชี GitHub ของเจ้าของทำเอง (`isOwnerAct`) bot ทำแทนไม่ได้ และ bot อ่านประวัติ Slack ไม่ได้ (ข้อ 8) · ทั้งหมดในข้อนี้เป็น judgment จนกว่าเจ้าของตอบ

1. **ส่งออก:** ทุกคำถาม ร่าง หรือ gate ส่งเป็นข้อความใหม่ใน DM ของเจ้าของ หนึ่งเรื่องต่อหนึ่งเธรด มีหัวเรื่อง ลิงก์ issue หรือ PR สรุปสั้น และบอกว่าตอบ `passed` เพื่ออนุมัติ หรือพิมพ์เหตุผลเพื่อให้แก้
2. **อ่านคำตอบ:** worker ตั้งเวลาบน Mac แบบเดียวกับ `feedback-worker` ของ [feedback-form-to-github-slack](feedback-form-to-github-slack.md) อ่านเฉพาะเธรดที่ตัวเองเปิด ด้วย bot token ใน macOS Keychain (ต้องมี scope `im:history` ซึ่งยังไม่ได้ขอ) · นับเฉพาะข้อความจาก Slack user ID ของเจ้าของ คำตอบ `passed` (ตัดช่องว่าง ไม่สนตัวพิมพ์) คืออนุมัติ ข้อความอื่นคือคำสั่งแก้
3. **ทางเลือกที่ต้องให้เจ้าของเลือก:**
   - **(ก) Slack แจ้งอย่างเดียว:** DM มีลิงก์ไปคอมเมนต์ `/approve` บน GitHub เจ้าของกดเอง Q1 ไม่เปลี่ยน ปลอดภัยสุด แต่ต้องเปิด GitHub
   - **(ข) `passed` ใน DM นับเป็นการอนุมัติ:** worker คอมเมนต์บน GitHub แทนเจ้าของพร้อม permalink ของข้อความ Slack และ gate นับคอมเมนต์ของ worker ที่มี permalink ตรวจได้ ต้องแก้ Q1 และเพิ่ม R ใหม่ใน RISK_REGISTER เรื่อง token Slack ที่ใครได้ไปจะอนุมัติแทนเจ้าของได้
4. **งาน Jira ของ OLS** ใช้ (ข) ได้เลยเพราะไม่มี gate แบบ GitHub ตามที่เจ้าของสั่งไว้ในแมพ multi-project-intake · งานใน GitHub ของ Taskfolio ตั้งต้นที่ (ก) (main thread ตัดสิน 15 Oct 2026 ตามคำเจ้าของ "หาทางจัดการมา ไม่ใช่รอแต่เรา": คง Decisions Q1 ที่นับเฉพาะบัญชีเจ้าของ และไม่เพิ่มความเสี่ยงใหม่ที่ R82 กังวล) เจ้าของเปลี่ยนเป็น (ข) ได้ด้วยคำเดียว

5. **ตอบในเธรดภายใน 30 วินาทีเสมอ (เจ้าของ 15 Oct 2026):** "ตอบกลับภายใน 30 วินาที เสมอเท่านั้น ถ้าอะไรที่เช็คอยู่ ก็บอกเรามาในเธรดก่อนว่ากำลังตรวจสอบ ขอเวลาเท่าไหร่ โดยประมาณ ไม่ใช่การเงียบ" ข้อความอื่นที่ไม่ใช่ `passed` ต้องได้คำตอบที่ตรงคำถาม ไม่ใช่เงียบ · ตอบ passed ด้วยคำรับทราบและบอกขั้นต่อไป · เจ้าของ 15 Oct 2026: "ถ้าเราบอก passed แล้วคุณก็แค่รับทราบครับ แล้วจะทำอะไรต่อ ก็บอกมา" และไม่ส่งข้อความรับทราบลอยๆ อย่าง "กำลังอ่านและเตรียมคำตอบ" แจ้งเวลาเฉพาะเมื่อต้องตรวจนานจริง · ทดสอบผ่านกับ AI Agent Bot (แอป `A0ASSQ0EUNP`) ใน [P4](../../wayfinder/multi-project-intake/tickets/P4.md)

## 9. What is in the prototype today

หน้า Agent Office (artifact ลิงก์เดิม ฉบับล่าสุด) แสดงหน้าที่ของแต่ละตำแหน่งตามข้อ 2a ทุกคนหยิบงานเอง ไม่มีปุ่มสั่ง · งาน L และ XL ไปทำในห้องสมาธิ · ตารางตาม label เต็มความกว้าง ไม่มี scrollbar · จำลองทุกอย่างในข้อ 7 ด้วยข้อมูลตัวอย่าง: รายได้หลักตามขนาด, โบนัส 7 ข้อพร้อมรายละเอียดต่อ issue, ภารกิจประจำวัน ภารกิจสด และ streak ชำระครบ, ค่าใช้จ่ายด้าน AI, Head ชำระค่าใช้จ่ายด้าน AI อัตโนมัติ และปุ่มชำระ · ข้อ 2 ถึง 6 ยังเป็นการออกแบบ ต้องลงโค้ดตามแถวของแผนแม่ (แถว 9, 12, 13 และช่องว่าง R5)

**เพิ่มใน v58 (14 Oct 2026) ตามคอมเมนต์เจ้าของ:**

- ป้ายชื่อโปรเจกต์ Taskfolio และ OLS ที่มุมขวาของการ์ดงานแต่ละเลน พื้นคนละสีตามธีมบอร์ด (เจ้าของ: "มุมขวาของแต่ละงาน ต้องเป็นลาเบลชื่อโปรเจ็ค ... พื้นลาเบลคนละสี ให้ตรงธีมบอร์ด") · วัด contrast แล้ว (measured): Taskfolio 5.38 และ 4.82, OLS 7.46 และ 7.83
- แท็บที่สี่ "โปรเจกต์" หัวข้อ "โปรเจกต์ที่ทีม Agent รับดูแล" (คอมเมนต์เจ้าของที่ขอแท็บนี้)
- ช่อง Blocker ที่ว่างแสดง "ไม่มีงานที่ติดปัญหา" (เจ้าของ: "ปรับเป็น ไม่มีงานที่ติดปัญหา")
- คำบรรยายใต้ส่วนหัวของหน้าเป็นกลาง และเรียกชื่อผลิตภัณฑ์ว่า Taskfolio (เจ้าของ: "ไม่ใช้คำว่า pluton timesheet เพราะชื่อมันจริงๆ มันคือ Taskfolio")

### 9a. ภาพและการเคลื่อนไหวระดับมืออาชีพ (v57 ถึง v60 ขึ้นแล้ว)

**v60 (15 Oct 2026, ตามคำเจ้าของ "หาทางจัดการมา ไม่ใช่รอแต่เรา"):** ตัวละคร Quaternius ชายและหญิงมีหน้าและชุดทำงาน เปิดเป็นค่าเริ่มต้น (`?rig=off` กลับเป็นแบบเดิม) ได้มาจาก Poly Pizza ด้วยการดาวน์โหลดตรง ไม่ใช้บัญชี (CC0 ยกเว้นชุด Suit ผู้หญิง CC-BY 3.0) สีผิวไล่จากอ่อนถึงน้ำตาลเข้ม (measured จากพิกเซลจริง) · ซุปเปอร์คาร์ในลานโชว์รถเปลี่ยนเป็น Car Concept ของ Khronos (CC BY 4.0, เอาโลโก้ Khronos ออก) แทน Ferrari ของ three.js ที่ยืนยันสัญญาผู้สร้างไม่ได้ · เครดิตโมเดล 3D ครบ 3 บรรทัดใหม่ · ตรวจแล้ว: console สะอาด, `wallClash` 0, ของใช้ครบ, ลากเก้าอี้ 5/5, รถไม่ชน, ลาเบลครบ · **แผนนี้จบที่ v60:** สองข้อที่เหลือ คือท่าเสริม HY-Motion (โควตาฟรีคืน 15 Oct 2026 ราว 21:36) และรถ Sketchfab คันอื่น (ต้องใช้บัญชีเจ้าของดาวน์โหลด) ย้ายเป็นงานที่ทำเมื่อเจ้าของสั่งเท่านั้น ไม่มีงานเพิ่มนอกจากนี้ · popup วันเดียวกัน เจ้าของสั่งท่าเสริม HY-Motion "ทำคืนนี้หลัง 21:36" และรถ Sketchfab "พอแค่ v60 ก่อน" (ตัดสินตามเป้า /goal "ทำแค่ตามแพลน จบแล้วจบเลยไม่งอกเพิ่ม" และคำเจ้าของ "ทำสิ" 15 Oct 2026)

**v59 (15 Oct 2026, ทำระหว่างเจ้าของนอน ตาม /goal "ทำต่อให้จบครบตามแพลน ไม่ต้องถามไรเรา"):**
- ธรรมชาติ: บึงและแม่น้ำสะท้อนภาพ (shader แบบ Water.js + waternormals ของ three.js, MIT) สีน้ำไล่จากริมตลิ่งถึงกลางน้ำ สระใสมี caustics หญ้าเป็นกอพลิ้วตามลม 21,264 กอ ท้องฟ้า Sky.js พร้อมเมฆ ดาว และดวงจันทร์ ฝนเป็นเส้นพร้อมวงกระเพื่อม หิมะลงต้นไม้และหลังคา ใบเมเปิลร่วง ต้นไม้ใบจริงจาก ambientCG (CC0) โยกตามลม · กลางคืนห้องทีมสว่าง 51% ของตอนบ่าย (measured)
- ของและท่าทาง: ของ 341 ชิ้นมีกิจกรรมครบและถูกใช้ทุกชิ้น (measured `unused 0`) · ลากเก้าอี้ สตูล บีนแบ็ก โซฟา อาร์มแชร์ไปใช้แล้วคืนที่เดิม 0 ซม. · ท่าใช้ของผ่านเกณฑ์ ±3 ซม. 105 จาก 145 กรณี (เดิม 75) ที่เหลือส่วนใหญ่เพราะแขนสั้นและไม่มีข้อมือของตัวละครแบบเดิม รอตัวละคร Quaternius · กล่องคำพูดไม่ซ้อนกันทั้งสามขนาดจอ
- ยานพาหนะ: ระบบรถเปลี่ยนโมเดลได้บรรทัดเดียว วัสดุสีรถเคลือบเงาโทนเข้ม ลานโชว์รถริมแม่น้ำ 6 คันออกวิ่งผ่านหน้าออฟฟิศแล้วกลับช่องเดิม (720 วินาที ไม่ชนกัน) รถตำรวจและรถพยาบาลมีไฟกะพริบ รถไอติม เรือแท็กซี่และเรือหางยาวมีคนขับและผู้โดยสาร ไม่ชนสะพาน และมีเครดิตโมเดล 3D บนหน้า
- ตัวละครมีโครงกระดูก: ระบบพร้อมแต่ปิดไว้ (`?rig` ดูได้) เพราะตัวแทนชั่วคราว Xbot ไม่มีหน้า ซึ่งขัดกับกฎเดิมที่ตัวละครมีหน้าและชุดทำงาน เปิดใช้เมื่อได้ไฟล์ Quaternius
- หน้าเว็บ: ลาเบลโปรเจกต์ครบทุกการ์ด รอบ release แยกตามโปรเจกต์ "ภารกิจจำกัดเวลา" แทนคำเดิม การ์ด OLS มี Automate testing กล่องเงินอยู่ขวาบน

### 9a. ภาพและการเคลื่อนไหวระดับมืออาชีพ ประวัติ v57 และ v58

source: เจ้าของ 14 Oct 2026 "เราอยากให้ได้ 3D คมชัดที่สุด สมจริงที่สุด แบบระดับมือาชีพสากล", "อัปเดตแพลนและลงมือเลย" และย้ำเป้าหมายวันเดียวกัน "อยากเน้นเป้าหมายอีกครั้ง อยากให้ได้ความคมชัด สมูท สมจริง ของทุกอย่างในแมป และการเคลื่อนไหว เหมือนที่ใช้ใน the sims 4" · popup วันเดียวกัน: แนว "สมจริงแบบ Sims 4", "อัปเกรด" Three.js จาก r128, หน้าหนัก "ไม่เกิน ~15MB" (ภายหลังขยายเป็นราว 20 MB เพื่อรองรับโมเดลรถ ดูรายการ 9 ด้านล่าง), ท่าทาง "Quaternius CC0 ก่อน + HY-Motion เติม"

1. **การ render (ขึ้นแล้ว v57):** three.js r170 ผ่าน import map (รุ่นใหม่ไม่มี build แบบ non-module อย่างที่ r128 ใช้แล้ว: `build/three.js` หายไปตั้งแต่ r161) · แสงแบบ physically based ปรับสเกลใหม่ · RoomEnvironment ผ่าน PMREM · ACES tone mapping · เงา PCF soft ขนาด 2048 · GTAO · bloom แบบ threshold สูง · SMAA · pixel ratio ไม่เกิน 2 · anisotropy 16 · ลดคุณภาพเองเมื่อ FPS ต่ำ · วัดแล้ว (measured): ความสว่างเทียบ v56 ต่างกัน -3.1% ถึง +0.6% ใน 10 แบบของเวลาและอากาศ
2. **พื้นผิวและ batching (ขึ้นแล้ว v58):** PBR CC0 จาก Poly Haven และ ambientCG พร้อม HDRI กลางวัน และโมเดล Poly Haven 3 ชิ้น · รวม draw call แบบ static วัดแล้ว (measured) 6,957 เหลือ 1,813 และ 60 fps (ชนเพดาน vsync) เทียบ 43.7 บน v57 แต่เครื่องมีงานอื่นรันอยู่ทั้งสองรอบ จึงเป็นตัวเลขเชิงชี้แนะเท่านั้น · ที่นั่งที่ขยับได้ 42 ตัวไม่ถูกรวม และจำตำแหน่งเดิมไว้ (เจ้าของ: "ให้ตัวละคร ลากเก้าอี้ ลากโซฟา บีนแบ็กไปมาได้ แต่ต้องเก็บที่เดิมด้วย") · ไฟล์ .glb และ .hdr ฝังเป็น data URI เพราะ host ของ artifact ไม่ส่งไฟล์นามสกุลเหล่านี้
3. **ตัวละครและท่า (ตัวละครขึ้นแล้ว v60 · ท่าเสริมทำเมื่อเจ้าของสั่ง):** Quaternius Universal Animation Library (CC0, ใช้เชิงพาณิชย์ได้) เป็นตัวละครและท่าหลัก (ยืน เดิน นั่ง ว่ายน้ำ) · ท่าที่ขาด (พิมพ์ ดื่ม กิน นอน คุย ยืดเส้น) สร้างด้วย Tencent HY-Motion 1.0 ผ่าน HuggingFace Space ฟรี เก็บเฉพาะมุมข้อต่อ 22 ข้อ แล้ว retarget เข้าโครงกระดูก Quaternius · ห้ามใช้ mesh WoodenModel ที่แนบมาในไฟล์ FBX (ไม่มีสัญญาอนุญาต) · ความเสี่ยงสัญญา SMPL-H อยู่ที่ RISK_REGISTER R84 · สถานะ: รอเจ้าของดาวน์โหลด UAL และ Universal Base Characters จาก itch.io และโควตา HY-Motion กลับมา 15 Oct 2026 21:36
4. **ส่วนหน้าเว็บ:** ยังใช้ GSAP ตามกฎ UI · เจ้าของถาม "https://github.com/motiondivision/motion อันนี้ประกอบผสานพลังกันด้วยได้ไหม" คำตอบคือไม่เพิ่ม Motion (motiondivision) เพราะไม่ช่วยท่าทาง 3D และซ้ำกับ GSAP
5. **เป้าคุณภาพของทุกอย่างในแมป (เป้า ทำไปบางส่วน):** ตามที่เจ้าของย้ำ ความคมชัด ความสมูท และความสมจริงต้องได้ทั้งของในแมปและการเคลื่อนไหวแบบ The Sims 4
   - เฟอร์นิเจอร์และของประกอบฉากเป็นโมเดล 3D CC0 จริง ไม่ใช่แค่พื้นผิวบนกล่อง (Poly Haven ระบุ "Our assets are all licensed as CC0") · ขึ้นแล้ว 3 ชิ้นใน v58 ที่เหลือยังเป็นเป้า
   - เป้า 60 fps การเคลื่อนไหวทุกอย่างคิดจาก delta time และกล้องมี damping ให้หยุดนุ่ม · v58 วัดได้ 60 fps บนเครื่องที่มีงานอื่นรัน (เชิงชี้แนะ ยังไม่ใช่ผลวัดที่สรุปได้)
   - พื้นผิวคม: anisotropy 16 และ pixel ratio ไม่เกิน 2 ขึ้นแล้วใน v57
   - แสงหลักอุ่นและนุ่ม มี bloom เบา ๆ เฉพาะโคมไฟและหน้าต่าง · v57 ใช้ bloom แบบ threshold สูง
6. **NPC และบทพูด (ขึ้นแล้ว v58):** ชุด NPC ตามประเภทคนในออฟฟิศ (เจ้าของ: "คน NPC สมจริงเหมือนคนในออฟฟิศเราหน่อย ... ปรับมาให้ใกล้เคียงก่อน") · projector ขนาดใหญ่ในห้องประชุม (เจ้าของ: "อยากให้เพิ่ม projector ขนาดใหญ่ ไว้เผื่อประชุมทีมหรือคุยงานร่วมกัน ร่วมสมองระดมไอเดีย") · โมดูลบทพูดใหม่ 1,851 บรรทัดไม่ซ้ำ รวมบับเบิลความคิดและบทพูด NPC ตัวเดิมไม่พูดซ้ำภายใน 10 นาที (measured: harness 2,000 ครั้ง) (เจ้าของ: "เพิ่มบทสนทนา บทพูดของตัวละครให้หลากหลายไม่จำเจ ... เหมือนที่คนสมัยนี้คุยกัน", "พูดมีคำนึกออกมาได้") · จำกัดจำนวนบับเบิลตามความกว้างเวที: 2 เมื่อต่ำกว่า 560 px, 4 เมื่อต่ำกว่า 1025, 6 เมื่อกว้างกว่านั้น บทพูดของเหตุการณ์ได้เพิ่ม 1 หรือ 2 เพราะบับเบิลแน่นเกินในฉากกลางคืนที่ 390 px
7. **กฎถาวรของต้นแบบ (เจ้าของ 14 Oct 2026):**
   - ตรวจและแก้ทุกองค์ประกอบเองโดยไม่ต้องรอให้บอก ("จริงๆ คือทุกจุดอะ ไม่ต้องรอให้บอกเนอะ")
   - ตัวละครผลัดกันใช้สิ่งของทุกชิ้นจริง ไม่ใช่วางเป็นพร็อบ มีตัวนับการใช้งานเป็นหลักฐาน ("ตัวละครต้องผลัดกันใช้สิ่งของที่มีให้ครบ ไม่ใช่วางเป็นพร็อบไปงั้นๆ")
   - ท่าใช้สิ่งของต้องวัดได้ คลาดเกิน 3 cm ถือว่าตก ที่นั่งนุ่มยุบได้ไม่เกิน 8 cm ("เช็คความสมจริงของการใช้สิ่งของด้วย อย่างแบบ นั่งแล้วจมบีนแบ็กไปเลยครึ่งตัวก็ไม่ใช่") · audit ความสมจริงวัดได้ 118 กรณี (measured) เช่น บีนแบ็กยุบ 34 ถึง 44 cm เท้านอกอาคารลอย 8 cm และมีคนอยู่ในตู้เย็น ยังต้องแก้
   - ส่วนที่ยาก (น้ำ ฟ้า ต้นไม้ retargeting) ทำด้วย effort สูง (เจ้าของตอบ "จัดไป" หลังฟังคำอธิบายเรื่อง effort)
8. **ฉากภายนอก (ขึ้นแล้ว v59):** กลางคืนที่ดูเป็นกลางคืนจริง · Sky.js พร้อมดวงอาทิตย์ เมฆ ดาว และดวงจันทร์ · ทะเลสาบและแม่น้ำสะท้อนแสงด้วย Water.js และ waternormals ของ three.js (MIT) · สระน้ำใสพร้อม caustics · ฝนเป็นเส้นพร้อมละอองกระเด็น · ต้นไม้แบบ leaf card ไหวตามลม
9. **ยานพาหนะ (ขึ้นแล้ว v59 และ v60 · รถ Sketchfab คันอื่นทำเมื่อเจ้าของสั่ง):** โมเดล low-poly CC0 และ CC-BY 15 คัน (0.9 MB) ที่หามาได้ไม่สมจริงพอ · เจ้าของอยากได้ "แบบแลมโบ พอร์ช คาเยน แมคลาเรน" และ "ออดี้ กับ volvo และมินิคูเปอร์" · เจ้าของเลือกดาวน์โหลดโมเดล CC-BY 4.0 จาก Sketchfab ด้วยบัญชีของตัวเอง (รายชื่อ 13 คัน) ลบโลโก้ แสดงเครดิตบนหน้า และขยายงบขนาดหน้าเป็นราว 20 MB (ความเสี่ยงอยู่ที่ RISK_REGISTER R85) · ที่จอดโชว์รถริมแม่น้ำเยื้องออฟฟิศ รถจอดเรียงแล้วผลัดกันวิ่งผ่านหน้าออฟฟิศเป็นระยะ ("ริมแม่น้ำเยื้องออฟฟิศ มารถเหล่านั้นมาจอดเรียงกัน ฟีลที่จอดรถ โชว์รถ ให้สวยงามเหมาะสม แล้วค่อยวิ่งมาผ่านหน้าออฟฟิศเป็นระยะๆ") · สีเข้มและมีรสนิยม ("สีให้มันเข้มและเท่ห์มีเทสกว่านี้") · เรือสัญจรในแม่น้ำมีผู้โดยสารนั่งและคนขับ ("อยากให้มีเรือสัญจรจริงในแม่น้ำหน้าออฟฟิศ มีคนนั่ง มีคนขับ") · รถผ่านหลากหลาย เช่น ซูเปอร์คาร์ รถตำรวจ รถพยาบาล รถส่งพัสดุ และรถไอศกรีม

