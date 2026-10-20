# P1 findings: OLS Jira fields, statuses and the query for the owner's QA work

อ่านเมื่อ 14 Oct 2026 ผ่าน Atlassian Rovo MCP แบบอ่านอย่างเดียว (site `skilllane.atlassian.net`, cloudId `dfc2cd04-b24b-48cf-81a1-4a3e0ed7569f`) ไม่มีการเขียน Jira ใดๆ · "เรา" คือผู้ใช้ Atlassian ปัจจุบันตาม `atlassianUserInfo` (account_id `712020:482b37b5-7815-4628-84bd-fa661936e2db`) และใน JQL ใช้ `currentUser()` · เอกสารนี้ไม่คัดลอก summary หรือ description ของ ticket ใดๆ และไม่ใส่ชื่อเพื่อนร่วมทีม

## สรุป

- **QA Owner** คือ `customfield_12120` ชนิด people picker แบบหลายคน (`array` of `user`, `com.atlassian.jira.plugin.system.customfieldtypes:people`, `isMulti: true`)
- โปรเจกต์ OLS เป็น team-managed (`simplified: true`) ทุก issue type ใช้สถานะชุดเดียวกัน 8 สถานะ
- RTT จริงคือ `READY TO TEST` (id 11661) **อยู่ใน status category `new` (To Do)** ไม่ใช่ In Progress
- Testing จริงคือ `TESTING` (id 11662) category `indeterminate` (In Progress)
- Done มีสถานะเดียวคือ `Done` (id 11627) category `done`
- **JQL หลักและ sub-JQL ทั้งสามได้ 0 ticket สำหรับเจ้าของในวันนี้** (รายละเอียดและเหตุผลอยู่ด้านล่าง)
- มีคำถามเปิดหนึ่งข้อ: "อยู่ชื่อเรา" หมายถึง assignee หรือ QA Owner (ดูหัวข้อ "คำถามเปิด")

## Issue types ในโปรเจกต์ OLS

ที่มา: `getJiraProjectIssueTypesMetadata(projectIdOrKey=OLS)` คืน `"total": 5`

| ชื่อ | id | หมายเหตุ |
| :--- | :--- | :--- |
| Epic | 10997 | hierarchyLevel 1 |
| Subtask | 10998 | `subtask: true` ชื่อจริงคือ `Subtask` ไม่ใช่ `Sub-task` ถ้าเขียน `issuetype = Sub-task` ใน JQL จะไม่ตรงชื่อ |
| Task | 11000 | |
| Story | 11001 | |
| Bug | 11002 | |

## Field "QA Owner"

ที่มา: `getJiraIssueTypeMetaWithFields(OLS, issueTypeId=11001, requiredFieldsOnly=false)` คืน

```
"name": "QA Owner", "key": "customfield_12120",
"schema": {"type": "array", "items": "user", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:people", "customId": 12120, "configuration": {"isMulti": true}}
```

- ใช้ใน JQL ได้ทั้งชื่อ `"QA Owner"` และ `cf[12120]` (รันแล้วทั้งสองแบบ ดูตาราง JQL)
- มีบน Story (จาก metadata), Bug และ Task (หน้าแรกของผล `"QA Owner" = currentUser()` มี Bug 44 ใบ และ Task 6 ใบ)
- บน Subtask: `issuetype = Subtask AND "QA Owner" is not EMPTY` ได้ 0 จึงไม่มีหลักฐานว่า Subtask ใช้ field นี้

## สถานะของแต่ละ issue type

ที่มา: `getTransitionsForJiraIssue` บน Story OLS-887, Bug OLS-897, Task OLS-908, Subtask OLS-424 ทั้งสี่ใบมีปลายทางเป็นสถานะชุดเดียวกัน (Story และ Bug มี transition เพิ่ม `pick up by QA` ไป TESTING และ `block` ไป BLOCKED ส่วน Subtask มี `merge to dev` ไป DEPLOYING แต่สถานะปลายทางยังเป็นชุดเดิม)

| สถานะ | id | status category | Story | Bug | Task | Subtask |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| To Do | 11624 | new (To Do) | มี | มี | มี | มี |
| In Progress | 11625 | indeterminate | มี | มี | มี | มี |
| REVIEWING | 11626 | indeterminate | มี | มี | มี | มี |
| DEPLOYING | 11660 | indeterminate | มี | มี | มี | มี |
| READY TO TEST | 11661 | **new (To Do)** | มี | มี | มี | มี |
| TESTING | 11662 | indeterminate | มี | มี | มี | มี |
| BLOCKED | 11663 | indeterminate | มี | มี | มี | มี |
| Done | 11627 | done | มี | มี | มี | มี |

- ยืนยันว่า Done มีสถานะเดียว: `project = OLS AND statusCategory = Done AND status != Done` ได้ `"totalCount":0`
- ข้อควรระวัง: JQL ที่กรองด้วย `statusCategory = "In Progress"` จะไม่เจอ `READY TO TEST` ให้ใช้ชื่อสถานะตรงๆ หรือ `statusCategory != Done`
- ภาพรวมใบที่ยังไม่ done ทั้งโปรเจกต์ (113 ใบ อ่านครบสองหน้า) READY TO TEST พบใน Story 6 และ Bug 2 · TESTING พบเฉพาะ Story 5 · REVIEWING พบเฉพาะ Subtask 4

## JQL ตามกฎรับงาน

กฎของเจ้าของ (MAP Notes): "ทุกใบที่ ready to test และอยู่ชื่อเรา หรือ ใบไหนก็ตาม ที่ QA Owner เป็นเรา และสถานะยังไม่ done"

การตีความ (ตามคำสั่งงานนี้): "อยู่ชื่อเรา" = `assignee = currentUser()` · "ยังไม่ done" = `statusCategory != Done` (เท่ากับ `status != Done` เพราะมี done status เดียว)

### JQL หลัก

```
project = OLS AND ((status = "READY TO TEST" AND assignee = currentUser()) OR ("QA Owner" = currentUser() AND statusCategory != Done)) ORDER BY updated DESC
```

### Sub-JQL

(a) Story ที่ยังไม่ถึง RTT หรือ Testing และยังไม่ done (ในชุดงานของเจ้าของ จึงเข้าได้ทางกิ่ง QA Owner เท่านั้น)

```
project = OLS AND issuetype = Story AND "QA Owner" = currentUser() AND status NOT IN ("READY TO TEST", "TESTING") AND statusCategory != Done
```

(b) Story ที่อยู่ RTT หรือ Testing (ในชุดงานของเจ้าของ)

```
project = OLS AND issuetype = Story AND ((status = "READY TO TEST" AND assignee = currentUser()) OR ("QA Owner" = currentUser() AND status IN ("READY TO TEST", "TESTING")))
```

(c) Bug หรือ Task ที่อยู่ RTT หรือ Testing และเป็นชื่อเจ้าของ

```
project = OLS AND issuetype IN (Bug, Task) AND status IN ("READY TO TEST", "TESTING") AND assignee = currentUser()
```

### ผลที่รันจริง 14 Oct 2026

| JQL | totalCount | ตัวอย่าง key |
| :--- | :--- | :--- |
| JQL หลัก | 0 | ไม่มี |
| (a) | 0 | ไม่มี |
| (b) | 0 | ไม่มี |
| (c) | 0 | ไม่มี |
| `project = OLS AND "QA Owner" = currentUser()` (ทุกสถานะ) | 200 | หน้าแรก 50 ใบเป็น Done ทั้งหมด |
| `project = OLS AND cf[12120] = currentUser()` | 199 | |
| `project = OLS AND "QA Owner" is not EMPTY AND statusCategory != Done` (ทุกคน) | 25 | |
| `project = OLS AND status in ("READY TO TEST", "TESTING")` (ทุกคน) | 13 | ดูด้านล่าง |

ตัวอย่างรูปร่างของ ticket ที่จะเข้าเกณฑ์ (มาจากชุด 13 ใบของทุกคน ไม่ใช่ของเจ้าของ แสดงเฉพาะ key, type, status):

| key | type | status |
| :--- | :--- | :--- |
| OLS-887 | Story | READY TO TEST |
| OLS-799 | Story | TESTING |
| OLS-897 | Bug | READY TO TEST |

### ทำไมได้ 0

- งานที่เจ้าของเป็น QA Owner มีอยู่ (200 ใบ) แต่ไม่มีใบที่ยังไม่ done ในวันนี้
- ใน 13 ใบที่อยู่ READY TO TEST หรือ TESTING ทุกใบ assignee เป็นคนละคนกับทุกค่าของ QA Owner และ 4 ใบไม่มี QA Owner เลย แปลว่าใน OLS ตอนนี้ ticket ที่ RTT ยังคง assignee เป็นฝั่ง dev ส่วนความเป็นเจ้าของงาน QA ถูกเก็บที่ `customfield_12120`
- ดังนั้นกิ่ง "RTT และ assignee = เรา" น่าจะไม่ค่อยตรงกับใบไหนในทางปฏิบัติ ถ้าตีความ "อยู่ชื่อเรา" เป็น QA Owner กิ่งแรกจะถูกกิ่งที่สองครอบอยู่แล้ว

## สัญญาณว่า ticket "มีเทสเคสแล้ว"

Field บน Story (จาก metadata เดียวกัน) ที่เกี่ยวกับเทสเคส ชื่อ field เท่านั้น:

- `TC Status` (customfield_12128, required, default `TO DO`, ตัวเลือก TO DO, IN PROGRESS, BLOCKED, DONE, QA REVIEWED, NOT REQUIRED) สัญญาณที่มีโครงสร้างชัดที่สุด
- `AI-Assisted TC Draft` (customfield_12126, Yes หรือ No)
- `TC Approval Due Date` (customfield_12129)
- `Test Result Approval by QA` (customfield_12123)
- `Pair Testing Status` (customfield_12124)
- `Regression Status` (customfield_12334 มีตัวเลือก "Awaiting Test Cases")
- `Added to Regression Test Plan` (customfield_12197)
- `Test Method` (customfield_12616)

ผลที่รัน (count):

- `issuetype = Story AND statusCategory != Done AND "TC Status" in ("DONE", "QA REVIEWED")` ได้ 11
- `issuetype in (Bug, Task) AND "TC Status" is not EMPTY` ได้ 1 แปลว่า TC Status แทบไม่ถูกใช้บน Bug และ Task
- `issuetype = Story AND comment ~ "Qase"` ได้ 10 (text search แบบ fuzzy ใช้เป็นสัญญาณประกอบเท่านั้น)
- `issuetype = Story AND comment ~ "docs.google.com/spreadsheets"` ได้ 43 (fuzzy เช่นกัน)
- Remote links ของ OLS-799 คืน `[]`

ข้อเสนอสำหรับสเปก: ใช้ `TC Status` ไม่เท่ากับ `TO DO` เป็นเกณฑ์หลักของ "มีเทสเคสแล้ว" บน Story และใช้คอมเมนต์เป็นสัญญาณรอง ต้องให้เจ้าของยืนยันก่อน

## คำถามเปิด (ให้ main thread ยกเข้า MAP "Not yet specified")

1. "อยู่ชื่อเรา" หมายถึง assignee หรือ QA Owner · ข้อมูลวันนี้ชี้ว่า assignee ของใบ RTT เป็น dev เสมอ
2. เกณฑ์ "มีเทสเคสแล้ว" ใช้ `TC Status` ได้ไหม และค่าไหนนับว่ามี (DONE, QA REVIEWED, IN PROGRESS)
3. Subtask อยู่ในขอบเขตไหม เพราะไม่มีใบไหนตั้ง QA Owner

## Not verified

- ตัวเลข 200 ของ `"QA Owner" = currentUser()` ต่างจาก `cf[12120] = currentUser()` ที่ได้ 199 ยังไม่รู้สาเหตุ (อาจมี field ชื่อซ้ำ หรือ count เป็นค่าประมาณ) และไม่ได้ไล่ครบทุกหน้า
- Bug และ Task เคยเข้า TESTING จริงหรือไม่ เห็น transition แต่วันนี้ไม่มีใบไหนอยู่
- Remote links ตรวจแค่ใบเดียว · attachment (เช่น `Import_Qase_*.csv`) ไม่ได้ตรวจ
- ผล `comment ~` เป็น text search ไม่แม่นยำ
- metadata ของ field ดึงเฉพาะ Story ส่วน Bug, Task, Subtask อนุมานจากผล JQL
