---
label: wayfinder:map
title: The agent team takes work from many projects, OLS QA on Jira first
opened: 2026-10-14
owner: @Thitic9203
---

# Map: multi-project intake, OLS QA first

## Destination

สเปกที่ล็อกแล้วของการให้ทีม AI agent ([agent-workflow-and-economy](../../superpowers/plans/agent-workflow-and-economy.md)) รับงานได้จากหลายโปรเจกต์ โดยโปรเจกต์แรกคือ OLS บน Jira ส่วนงาน QA: เขียนเทสเคส รีวิวเทสเคส ทดสอบ และรีวิวผลการทดสอบ ด้วยสกิลในเรโป OLS-QA (`~/GitHub/ols-qa/skills`) · สเปกบอกครบว่ารับใบไหน ทำอะไรกับใบแบบไหน เขียนผลไว้ที่ไหน ใครอนุมัติ รันที่ไหนด้วย credential อะไร และหน้า AI Agent Home Office แสดงโปรเจกต์ของแต่ละงานอย่างไร · ทุกข้อมีที่มา พร้อมส่งต่อเป็นแถวงานในแผน

## Notes

- เจ้าของ 14 Oct 2026 (คำสั่งตั้งต้น): "อยากให้ AI Agent นี้ รับงานจากหลาย project ได้ เช่น รับงานจาก OLS on Jira ในส่วน QA เพื่อนำมาเขียนเทสเคส รีวิวเทสเคส ทำการเทส และรีวิวผลการเทส โดยใช้สกิลการทดสอบจาก OLS-QA repo ส่วนอนาคตจะขยายภาพกว้างไปสู่ส่วนงาน project อื่นบน Jira ด้วย โดยใน artifact ต้องบอกว่า คนนั้น กำลังทำงานโปรเจ็คไหนอยู่ อาจจะเป็น ลาเบลเล็กๆ มุมขวา ในการ์ดงานที่อยู่ในเลน"
- ปลายทางเป็นสเปก (popup 14 Oct 2026 "สเปกที่ล็อกแล้ว") ไม่สร้างหรือรันระบบในแมพนี้
- **กฎรับงาน (popup 14 Oct 2026, คำของเจ้าของ):** "ทุกใบที่ ready to test และอยู่ชื่อเรา หรือ ใบไหนก็ตาม ที่ QA Owner เป็นเรา และสถานะยังไม่ done"
  - "เรา" คือ QA Owner (`customfield_12120`) อย่างเดียว ไม่ใช้ assignee (P3) · "มีเทสเคสแล้ว" คือ TC Status เป็น DONE หรือ QA REVIEWED (P3)
  - story ที่ยังไม่ถึง RTT หรือ Testing และยังไม่มีเทสเคส: เขียนเทสเคสใน Google Sheet ของ QA
  - story ที่อยู่ RTT หรือ Testing และยังไม่มีเทสเคส: เขียนเทสเคสใน Google Sheet ของ QA แล้วเริ่มเทสด้วยสกิล `testing-ticket`
  - bug หรือ task ที่อยู่ RTT หรือ Testing และเป็นชื่อเจ้าของ: รีเทสด้วยสกิล `retest-bug`
- **เขียนกลับ Jira (popup 14 Oct 2026):** "ร่างก่อน เจ้าของอนุมัติ" ทุกคอมเมนต์ ผลเทส และการเปลี่ยนสถานะ ตรงกับสกิล OLS-QA ที่โพสต์ "with approval" และกฎ global ข้อ 23 · ช่องทางขออนุมัติ (เจ้าของ 14 Oct 2026): "ส่งให้เราอนุมัติ ส่งมาใน DM Slack เรา" ร่างทุกชิ้นส่งเข้า DM Slack ของเจ้าของ · "ถ้าเรา reply ว่า passed ก็ค่อยไปจัดการต่อได้" คำตอบ `passed` ในเธรดของร่างนั้นคือการอนุมัติให้โพสต์หรือเปลี่ยนสถานะบน Jira
- อ่าน Jira ได้อย่างเดียวระหว่างทำแมพนี้ (Atlassian MCP แบบอ่าน) ห้ามคอมเมนต์ ห้ามเปลี่ยนสถานะ ห้ามสร้าง ticket
- คำว่า ticket ใช้กับ Jira issue เท่านั้น (กฎ global ข้อ 12) · improvement กับ bug ตามกฎ global ข้อ 24
- ห้ามใช้เงิน (hard constraint 1) · ห้ามมี secret ใน repo หรือในหน้า artifact (hard constraint 2)
- **งานที่สอง ซ่อม e2e อัตโนมัติ (เจ้าของ 14 Oct 2026):** "อยากให้รองรับงานการแก้ automate e2e ใน repo ols-qa-e2e ด้วยน่ะ โดยรับจากการที่พบว่ามีเคสที่รันไม่ผ่าน ใน dev env จากนั้น QA ทำการนำงานมาตรวจสอบโดยอัตโนมัติ แก้ไขโดยใช้สกิลที่เหมาะสมที่สุด เช่นสกิลจาก playwright และรีวิวอย่างถี่ถ้วน จากนั้นสร้าง pr ในเรโป แล้วแจ้งชั้นมาใน DM Slack" · โครงที่เสนอ (judgment, รอ P7 และ P8): sequential มีวงตรวจ (evaluator)
  1. **รับงาน:** รอบ dev จาก launchd smoke-watch (`run.json`) ที่มีเคสไม่ผ่าน กลายเป็นงานหนึ่งใบต่อเคส (P7)
  2. **คัดแยก (QA):** reproduce ก่อนเสมอ แยกเป็นสามแบบ: เทสต์พัง (selector, timing, ข้อมูลทดสอบ), แอปพังจริง (ผิดจากสเปกที่ยืนยันแล้ว ไปทาง bug ห้ามแก้เทสต์ให้ผ่าน), หรือ flaky (ผลไม่คงที่ = fail ต้องหาเหตุ ห้าม retry กลบ)
  3. **แก้ (QA):** เฉพาะเทสต์พังและ flaky ด้วยสกิล `playwright-best-practices` และ `flaky-test-doctor` ห้ามลดเกณฑ์ ห้าม skip ห้ามเพิ่ม timeout ลอย ๆ
  4. **ยืนยัน:** รันเคสที่แก้ซ้ำหลายรอบบน dev ต้องผ่านทุกรอบ และต้องไม่กระทบเคสอื่น (เจ้าของ 14 Oct 2026: "และต้องไม่กระทบเคสอื่น ไม่ทำเคสอื่นพัง"): รันทุกเคสที่ใช้ไฟล์ helper fixture หรือ page object ที่ถูกแก้ แล้วรันชุดเต็มบน dev เทียบกับผลก่อนแก้ ถ้ามีเคสใหม่ที่ไม่ผ่านแม้แต่เคสเดียว ห้ามเปิด PR · หลัง merge ข้อ 7 รันชุดเต็มบน dev อีกครั้งด้วย
  5. **รีวิว (QA Lead คนละตัวกับคนแก้):** สกิล `code-review` ตรวจ diff ทุกบรรทัด เทียบกับ requirement ของเคส
  6. **ส่ง:** เปิด PR ใน `ols-qa-e2e` แนบหลักฐาน แล้วส่ง DM Slack ให้เจ้าของ · เจ้าของ 14 Oct 2026: "จากนั้นถ้าเรารีพลายว่า passed ทาง QA Lead agent ก็ทำการ merge ได้เลย" ตอบ `passed` ในเธรด DM แล้ว QA Lead agent merge PR เอง
  7. **ยืนยันหลัง merge (เจ้าของ 14 Oct 2026):** "และไปรีรันเคสนั้นว่าผ่านแล้วจริงบน dev" หลัง merge รันเคสนั้นซ้ำบน dev จาก main ที่ merge แล้ว ผลแนบกลับในเธรด DM เดิม ถ้าไม่ผ่าน งานกลับไปขั้นคัดแยก
- สกิลที่ใช้: สกิลในเรโป OLS-QA (`tc-fe-prep-workflow`, `tc-api-prep-workflow`, `tc-review-workflow`, `testing-ticket-workflow`, `review-result-workflow`, `retest-bug-workflow`) อ่านจากเรโปนั้นเป็นแหล่งจริง

## Decisions so far

<!-- one line per closed ticket -->

- [Research the OLS Jira fields, statuses and the query that finds the owner's QA work](tickets/P1.md): QA Owner คือ `customfield_12120`, READY TO TEST อยู่หมวด To Do, กฎรับงานแบบ assignee ได้ 0 ใบเพราะคนเทสอยู่ที่ QA Owner, `TC Status` บอกว่ามีเทสเคสแล้ว
- [Research what each OLS-QA skill needs and produces, and whether an agent can run it unattended](tickets/P2.md): ไม่มีสกิลเขียนเทสเคสลงชีท QA, AI เทสได้เมื่อ READY TO TEST และ TC Status `QA Reviewed`, เทสกับรีเทสแตะคนครั้งเดียว ส่วนเขียนเทสเคสรออนุมัติหลายจุด, แจ้งผลผ่าน Discord
- [Research how ols-qa-e2e runs on dev, reports failures and takes changes](tickets/P7.md): รอบ dev จริงมาจาก launchd smoke-watch ไม่ใช่ GitHub, อ่านเคสพังจาก `run.json`, PR ไม่มี CI, แก้ `fixtures/test` หรือ `helpers` ต้องรันชุดเต็ม, รันหลัง merge ต้องใช้ worktree แยก
- [Grill the owner on the QA flow per ticket type: the sheet, TC review and result review](tickets/P3.md): ใช้ QA Owner อย่างเดียว, TC Status DONE หรือ QA REVIEWED = มีเทสเคสแล้ว, QA Lead agent รีวิวแล้ว DM ให้เจ้าของตอบ `passed`, เทสเคสเขียนลง tab ใหม่ต่อ ticket ในชีท QA (หาที่มาใน P9)
- [Grill the owner on the e2e fix loop: trigger, triage rule, PR and the Slack DM](tickets/P8.md): รันบน dev ได้ถาวร (เฉพาะ dev), แจ้งทาง DM Slack ส่วน Discord คงเดิม, หลักฐานคือรันชุดเต็มบน dev เทียบก่อนแก้, `passed` แล้ว QA Lead merge และรันซ้ำบน dev
- [Research where the existing TC skill creates a sheet tab per ticket](tickets/P9.md): ตัวสร้าง tab คือ `write_tabs.py` ใน `~/ols-qa-tc-autodraft-bot` ไม่ใช่สกิล, tab ชื่อตาม key, 16 คอลัมน์แบบ OLS-44, มีจุดต้องแก้ 5 ข้อก่อนใช้ซ้ำ
- [Grill the owner on where the tab-per-ticket TC writer may live, given the sheet write rule](tickets/P10.md): ทางเลือกที่ 1 (เจ้าของ 15 Oct 2026 "หาทางจัดการมา ไม่ใช่รอแต่เรา") โหมด `--create-tab` ใน `sheet_write.py` ([ols-qa-testing-bot#5](https://github.com/Thitic9203/ols-qa-testing-bot/pull/5)) และขั้น 6.5 ของ tc-fe-prep ([ols-qa#36](https://github.com/Thitic9203/ols-qa/pull/36)) รอเจ้าของ merge
- [Prototype the project label on each lane card in AI Agent Home Office](tickets/P5.md): ลาเบลขึ้นทุกการ์ดตั้งแต่ v58 เจ้าของตัดสิน "ต้องมีลาเบล ชื่อโปรเจ็คทุกงานนะ บังคับ", contrast ผ่าน 4.5:1 ทั้งสองธีม
- [Grill the owner on the per-project config: source, intake rule, roles and skills](tickets/P6.md): ไฟล์ตั้งค่าหกช่องใช้ได้ทั้งสองโปรเจกต์, เพดาน 3 ใบแยกต่อโปรเจกต์, งาน OLS ได้เงินเข้ากองเดียวกันและรวมบัญชีเดียว
- [Grill the owner on where the OLS agent runs and which credentials it may hold](tickets/P4.md): Desktop scheduled task บนเครื่องนี้ ดึง Jira ทุก 30 นาทีในเวลางาน, credential อยู่ใน `~/.ols-qa-secrets/` นอก repo, DM ผ่าน AI Agent Bot ส่งและอ่าน `passed` ได้ครบวง

## Not yet specified

- **ทริกเกอร์ของรีวิวเทสเคสและรีวิวผลเทส:** คำสั่งตั้งต้นมีสี่งาน แต่กฎรับงานพูดถึงเขียนเทสเคส ทดสอบ และรีเทส · รีวิวเทสเคส (`tc-review-workflow`) และรีวิวผลเทส (`review-result-workflow`) เกิดเมื่อไร ใครรีวิวงานของใคร (เช่น QA Lead รีวิวงาน QA) ชัดขึ้นหลัง "Grill the owner on the QA flow per ticket type"
- **โปรเจกต์ Jira อื่นในอนาคต:** เปิดเมื่อมีโปรเจกต์ที่สองบน Jira จริง

## Out of scope

- สร้างหรือรันระบบรับงานจริง (ปลายทางเป็นสเปก)
- เปลี่ยนกติกาของงาน pluton-timesheet เดิม (แผนแม่ยังเป็นแหล่งจริง)
