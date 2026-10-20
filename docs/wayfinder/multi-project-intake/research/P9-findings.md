---
ticket: P9
label: wayfinder:research
date: 2026-10-14
source: เรโป ols-qa (main ที่ 9b2b6d9 และทุก branch กับ stash) · โฟลเดอร์ ~/ols-qa-testing-bot · โฟลเดอร์ ~/ols-qa-tc-autodraft-bot · เรโป ols-qa-evidence · สกิลใน ~/.claude/skills และ plugin cache ของ helix · ประวัติ session ของ Claude Code ในโปรเจกต์ ols-qa · อ่านอย่างเดียว ไม่แก้ไฟล์ ไม่รัน git write
---

# P9 findings: ขั้นสร้าง tab ใหม่ต่อหนึ่งทิคเกตในชีท QA อยู่ที่ไหน

ทุกการอ้างไฟล์ของที่อื่นเขียนเป็น "ไฟล์ X บรรทัด N ของ Y" · ไม่ได้คัดลอก sheet id, token หรือค่า secret ใดๆ มีแต่ชื่อ · คำพูดภาษาไทยของเจ้าของยกมาจากประวัติ session ตามตัวอักษร

## สรุปสั้น

1. **พบแล้ว ตัวเขียนจริงคือไฟล์ write_tabs.py ในโฟลเดอร์ ~/ols-qa-tc-autodraft-bot** (โฟลเดอร์นี้ไม่ใช่ git repo) · ไม่ได้อยู่ในเรโป ols-qa และไม่ได้อยู่ในสกิล P2 จึงหาไม่เจอ · memory ของโปรเจกต์ ols-qa ก็บันทึกไว้ตรงกันว่า write_tabs.py เป็น "only per-ticket tab creator" (ไฟล์ reference_ols-tc-sheet-format-and-tooling.md บรรทัด 18 ถึง 20 ในโฟลเดอร์ memory ของโปรเจกต์ ols-qa)
2. **ชื่อ tab = Jira key ตรงตัว เช่น OLS-290** ไม่มีคำนำหน้าหรือคำต่อท้าย · ตัวอ่านทุกตัวหา tab ด้วย regex OLS-\d+
3. **หัวตาราง 16 คอลัมน์ "รูปแบบ OLS-44"**: Acceptance Criteria · Services Impacted · Test Case ID · Test Title · Precondition · Test Data · Test Steps · Expected Result · Priority · Type · QA Owner · Test Status · Actual Result · Capture Screen Link · Linked Bug · Remark
4. **credential**: ไฟล์ OAuth ของผู้ใช้ชื่อ .gcp-oauth.json ในโฟลเดอร์ ~/ols-qa-testing-bot (ใช้ฟิลด์ client_id, client_secret, refresh_token แลก access token) · ไม่ใช่ service account และไม่ใช่ env var · ตอนรันแบบ headless ไฟล์ run.sh ส่ง env ชื่อ CLAUDE_CODE_OAUTH_TOKEN, OLS_JIRA_CREDS, OLS_GCP_OAUTH, OLS_MAX_PER_ROUND
5. **ไม่ใช่ขั้นของสกิล tc-fe-prep-workflow**: สกิลทุกเวอร์ชันที่หาได้ (เรโป ols-qa, ~/.helix/tc-fe-prep, plugin cache helix 1.5.91 และ 1.5.120) ส่งผลเป็นคอมเมนต์ Jira แบบ ADF กับไฟล์ CSV เท่านั้น ไม่มีขั้นสร้าง tab · ที่ "สกิลเดิมเขียนลงชีท" เกิดจากสองทาง:
   - **ทางอัตโนมัติ**: บอท headless ชื่อ OLS TC auto-draft (launchd label com.thitichaya.ols-tc-autodraft ทุก 4 ชั่วโมง) ให้ Claude รันตามไฟล์ prompt.md แล้ว**ขั้นที่ 5 ของ prompt เรียก python3 write_tabs.py** · plist ถูกปิดไว้ตั้งแต่ 25 Jul 2026 (ชื่อไฟล์ลงท้าย .disabled-2026-07-25)
   - **ทางมือ**: เจ้าของสั่ง /tc-fe-prep-workflow พร้อม args ให้สร้าง tab เอง แล้ว agent เขียนสคริปต์ชั่วคราวใน scratchpad ที่ทำ addSheet ทุกครั้ง (22 Jul, 31 Jul, 4 Aug, 5 Aug 2026) · สคริปต์เหล่านั้นถูกลบไปพร้อม scratchpad แล้ว เหลือแค่ในประวัติ session
6. **ไม่พบการใช้ connector Google Sheets (MCP)** ในขั้นนี้ · การเรียก addSheet ทั้งหมดในประวัติ session ของโปรเจกต์ ols-qa มาจากเครื่องมือ Write, Edit, Bash และ Agent เท่านั้น (เรียก Sheets API v4 ผ่าน urllib ตรงๆ)

## 1. ตัวเขียน: write_tabs.py

ไฟล์ write_tabs.py ในโฟลเดอร์ ~/ols-qa-tc-autodraft-bot ยาว 134 บรรทัด แก้ล่าสุด 24 Jul 2026

| สิ่งที่ทำ | ที่อยู่ |
|---|---|
| อธิบายสี่ขั้น: สร้าง tab ใหม่ต่อทิคเกต (ข้ามถ้ามีและไม่ว่าง) · เขียนหัว 16 คอลัมน์และแถว · update หรือ append แถวใน Test Progress · เขียนหมายเหตุลงคอลัมน์ Remark ของ tab Summary (ไม่แตะ TC Status) | บรรทัด 7 ถึง 10 |
| credential: OAUTH ชี้ไปที่ .gcp-oauth.json ในโฟลเดอร์ ~/ols-qa-testing-bot | บรรทัด 31 และฟังก์ชัน mint บรรทัด 40 ถึง 45 |
| sheet id ฮาร์ดโค้ดเป็นค่าคงที่ SID (ไม่ได้คัดลอกค่า) | บรรทัด 33 |
| ค่าคงที่ HDR = หัว 16 คอลัมน์ข้างบน | บรรทัด 35 |
| validate แบบ fail closed: header ต้องตรง HDR · แถวละ 16 ช่อง · Test Case ID ต้องเป็น TC_01, TC_02 ต่อเนื่อง · Type ต้องเป็น Unit Test, Integration Test หรือ System Test และเรียง Unit ก่อน Integration ก่อน System · Test Status ต้องเป็น "Not Started" หรือ "BLOCKED" · แถว BLOCKED ต้องมี Remark ที่ระบุ QA Owner และคำว่า ติดต่อ | บรรทัด 52 ถึง 67 |
| สร้าง tab: batchUpdate ด้วย addSheet ที่ title = key ของทิคเกต สำหรับ key ที่ยังไม่มี tab | บรรทัด 84 ถึง 88 |
| เขียนหัวและแถวลง A1 ด้วย valueInputOption=USER_ENTERED เฉพาะเมื่อแถวแรกของ tab ว่าง | บรรทัด 93 ถึง 97 |
| update หรือ append แถวใน Test Progress - ALL TC - Revised โดยคอลัมน์ A เป็นสูตร HYPERLINK ไปที่ gid ของ tab ใหม่ | บรรทัด 98 ถึง 118 |
| เขียน summaryRemark ลงคอลัมน์ K ของ tab Summary | บรรทัด 119 ถึง 127 |

ข้อมูลเข้าคือไฟล์ work/OLS-XX.json หนึ่งไฟล์ต่อทิคเกต รูปแบบ key, qaOwner, summaryRemark, header (16 ชื่อ), rows (แถวละ 16 ช่อง) ตามที่บรรยายไว้ในบรรทัด 13 ถึง 15

## 2. สกิลหรือขั้นไหนเรียกมัน

### 2.1 บอท auto-draft (ทางอัตโนมัติ)

- ไฟล์ run.sh บรรทัด 2 ของโฟลเดอร์ ~/ols-qa-tc-autodraft-bot บอกว่ารันทุกราว 4 ชั่วโมง ร่าง TC ให้ทิคเกตที่ TC Status = TO DO และ Ticket Detail Status = Details Provided ที่ยังไม่มี TC
- ไฟล์ plist com.thitichaya.ols-tc-autodraft.plist.disabled-2026-07-25 ใน ~/Library/LaunchAgents ตั้งเวลา 0, 4, 8, 12, 16, 20 นาฬิกา และเรียก run.sh · **ปิดอยู่** (เปลี่ยนชื่อไฟล์เป็น .disabled ตั้งแต่ 25 Jul 2026) และ launchctl list ไม่มีงานนี้
- run.sh บรรทัด 86 ถึง 93 รัน Claude CLI แบบ --print ด้วยเนื้อหา prompt.md โดยส่ง env ตามข้อ 4 ของสรุป · บรรทัด 21 ถึง 23 อ่าน token จากไฟล์ .oauth_token, .jira_token และ .gcp-oauth.json (ชื่อไฟล์เท่านั้น)
- ไฟล์ prompt.md ของโฟลเดอร์เดียวกัน:
  - ขั้นที่ 1 บรรทัด 9 ถึง 21: รัน scan_todo.py ซึ่งเลือกทิคเกตที่ needsTC เป็นจริง คือยังไม่มี tab หรือ tab ว่าง (ไฟล์ scan_todo.py บรรทัด 4 ถึง 5)
  - ขั้นที่ 2: ดึง AC และ EC จาก Jira ด้วย curl REST และ OLS_JIRA_CREDS (บรรทัด 25)
  - ขั้นที่ 3 บรรทัด 43 ถึง 62: ส่ง subagent หนึ่งตัวต่อทิคเกตให้เขียน work/OLS-XX.json · บรรทัด 60 ถึง 62 ระบุหัว 16 คอลัมน์ตามลำดับ
  - **ขั้นที่ 5 บรรทัด 68 ถึง 71: "run python3 write_tabs.py" ซึ่งสร้าง tab ใหม่ต่อทิคเกต (OLS-44 16-col format)**

### 2.2 ใช้ /tc-fe-prep-workflow แล้วสั่งให้ลงชีท (ทางมือ)

ประวัติ session ของ Claude Code ในโปรเจกต์ ols-qa แสดงว่าเจ้าของเรียกสกิลแล้วสั่งปลายทางเป็นชีทเองใน args:

| วันที่ | session (8 ตัวแรก) | คำสั่งของเจ้าของ | สคริปต์ที่ agent เขียน |
|---|---|---|---|
| 22 Jul 2026 | b01087bc | "prep tc ลง google sheet TC นะ ไม่ต้องแอดเม้นใน Jira" | write_tab.py ใน scratchpad: addSheet ที่ title = key, 16 คอลัมน์ |
| 31 Jul 2026 | 714a2b30 | "ตามแนวทางคือสร้าง tab สำหรับทิคเกตนี้ และใช้ฟอแมตเหมือน OLS-44" (ทิคเกต OLS-290) | build290.py: addSheet แล้วเขียนหัว และไม่ยอมเขียนทับถ้ามี tab อยู่แล้ว |
| 4 Aug 2026 | 65308227 | "ทำและเรียก agent superpowers มารีวิว สองรอบ" | write_tc_tabs.py และ write_tc_260.py: addSheet ที่ title = key, columnCount 16, frozenRowCount 1 |
| 5 Aug 2026 | 1b295a01 | "ถ้าไม่มีแท้ปก็อัปเดตแบบที่เคยทำได้เลย ก็คือสร้าง tab ใหม่ และอัปเดตลิสต์ใน tab ที่เกี่ยวข้องให้ครบนะ" | create_tab.py: addSheet (plain grid) แล้ว PUT หัวและแถวแบบ RAW แล้ว addTable แล้ว updateTable ใส่ dropdown ของ Test Status ที่คอลัมน์ index 11 แล้วอ่านกลับมาตรวจ |

ทุก session ข้างบนโหลดสกิลในรูป "TC FE Prep (discovery stub)" ซึ่งชี้ไปที่ WORKFLOW.md ของสกิล ไม่มีขั้นที่สั่งให้สร้าง tab · ขั้นนี้มาจากคำสั่งของเจ้าของใน args และ agent ทำเองทุกครั้ง · ไฟล์สคริปต์ใน /private/tmp ของทั้งสี่ session ไม่มีแล้วตอนตรวจ (ls ได้ No such file or directory)

## 3. รูปแบบ tab ที่ถือเป็นมาตรฐาน (OLS-44)

- memory ของโปรเจกต์ ols-qa ไฟล์ reference_ols-tc-sheet-format-and-tooling.md บรรทัด 27 ถึง 31: tab OLS-44 เป็น Google Sheets Table ชื่อ OLS_44 ครอบ 16 คอลัมน์ A ถึง P (สคีมามาตรฐาน ไม่มีคอลัมน์ Cases Type) · dropdown เดียวคือ Test Status ที่คอลัมน์ index 11 ค่า NOT STARTED, TESTING, PASSED, PASSED WITH MINOR ISSUE, FAILED, BLOCKED, SKIPPED
- บรรทัด 18 ถึง 20 ของไฟล์เดียวกัน: write_tabs.py สร้างแค่ plain grid ไม่สร้าง Table และไม่ใส่ dropdown
- ไฟล์ references/ols-project-guide.md ของเรโป ols-qa บรรทัด 179: คลิก Key ในชีทแล้วเปิด tab ของทิคเกตนั้น · บรรทัด 181: ถ้าทิคเกตยังไม่มีแถว TC ในชีทให้บอกผู้ใช้ไปอัปเดตชีทก่อน · บรรทัด 186: ทุก tab TC ต่อทิคเกตเป็น Table object และ tab ที่สร้างด้วย addSheet ใหม่จะเป็น plain grid จนกว่าจะมีคนแปลงเป็น Table
- มีสองสคีมาในชีทจริง (มีหรือไม่มีคอลัมน์ Cases Type) ตัวอ่านจึงหาคอลัมน์จากชื่อหัว: ไฟล์ sheet_write.py บรรทัด 71 และ 138 ถึง 143 ของโฟลเดอร์ ~/ols-qa-testing-bot · ไฟล์ tc_result_sync.py บรรทัด 148 (หา tab ด้วย OLS-\d+) และ 177 ถึง 187 ของโฟลเดอร์เดียวกัน

## 4. ข้อควรระวังถ้าจะนำ write_tabs.py กลับมาใช้

ไม่ใช่ bug report · เป็นความต่างระหว่างโค้ดกับกติกาที่เขียนไว้ในที่อื่น ซึ่งควรให้เจ้าของตัดสินก่อนนำกลับมาใช้

1. **ค่า Test Status**: validate รับ "Not Started" แบบตัวพิมพ์ผสม (บรรทัด 61) แต่ไฟล์ docs/ai-assisted-testing-template.md บรรทัด 142 ของเรโป ols-qa-evidence บอกว่าคอลัมน์นี้เป็น dropdown ต้องใช้ตัวพิมพ์ใหญ่ทั้งหมด ไม่เช่นนั้นขึ้น validation error
2. **โหมดเขียน**: เขียนแบบ USER_ENTERED (บรรทัด 96) ขณะที่ไฟล์ references/ols-project-guide.md บรรทัด 182 ของเรโป ols-qa กำหนดให้เขียน RAW เสมอ
3. **ไม่สร้าง Table และ dropdown** จึงยังไม่ใช่รูปแบบ OLS-44 เต็ม (ข้อ 3) · สคริปต์ของ session 5 Aug เพิ่ม addTable และ updateTable แต่สคริปต์นั้นหายไปแล้ว
4. **เขียน tab Test Progress เอง** (บรรทัด 98 ถึง 118) แต่ไฟล์ references/ols-project-guide.md บรรทัด 176 ของเรโป ols-qa ระบุว่า tab นี้มีผู้เขียนคนเดียวคือ progress_build.py และ "no other flow may write it"
5. **sheet id ฮาร์ดโค้ด** ในไฟล์ (บรรทัด 33) และใน scan_todo.py · ถ้าจะใช้กับหลายโปรเจกต์ต้องย้ายไปเป็นค่าตั้งต่อโปรเจกต์

## 5. สิ่งที่ค้นแล้ว

| ที่ค้น | วิธี | ผล |
|---|---|---|
| เรโป ols-qa ทุก branch (80 ref) และ stash (1) | git log --all -S กับ addSheet, duplicateSheet, gspread, add_worksheet, batchUpdate, insertSheet, copyTo, spreadsheets, "Google Sheet", worksheet · grep working tree | addSheet มีแค่ในเอกสาร (ols-project-guide.md, CLAUDE-ARCHIVE.md, post-mortem) ไม่มีโค้ดสร้าง tab ต่อทิคเกต · ใน skills และ commands ไม่มี |
| โฟลเดอร์ ~/ols-qa-testing-bot (git, 28 ref) | grep และ git log --all -S addSheet | addSheet อยู่ใน backlog_sync.py (tab Backlog), summary_remark.py และ summary_remark_auto.py (tab ซ่อน _RemarkReasons), เทสต์ · ไม่มีตัวสร้าง tab ต่อทิคเกต · sheet_write.py เขียนผลลง tab ที่มีอยู่เท่านั้น |
| ~/GitHub/ols-qa-testing-bot | ls | มีแค่โฟลเดอร์ capture ไม่ใช่ git repo |
| ~/.claude/skills (ลิงก์ไป ~/.helix/tc-fe-prep และเรโป ols-qa) | grep -R ตามลิงก์ · git log --all -S ใน ~/.helix/tc-fe-prep (6 ref) | ไม่มีขั้นสร้าง tab · มีแค่การอ่าน glossary จากชีทและการอัปเดตผลแบบทั่วไปใน testing-ticket-workflow |
| plugin cache helix-dev (1.5.91, 1.5.120) และ marketplace helix-dev | grep และ git log --all -S | ไม่มีขั้นสร้าง tab |
| เรโปใน ~/GitHub ที่ชื่อมี qa, tc หรือ test (ols-qa-evidence, ols-qa-e2e และ worktree, ols-qa-worktrees, full-test-plugin, retest-bug-plugin, test01) | grep และ git log --all -S | addSheet ใน ols-qa-evidence เป็นแค่รีวิวที่อ้าง tab _gate_selftest · ไม่มีตัวสร้าง tab ต่อทิคเกต |
| ประวัติ session ของ Claude Code (33,803 ไฟล์ jsonl ใน ~/.claude/projects) | python สแกน tool_use ที่ input มี addSheet, duplicateSheet, add_worksheet, insertSheet | พบใน Write, Edit, Bash, Agent ของโปรเจกต์ ols-qa เท่านั้น · นำไปสู่ write_tabs.py และสคริปต์ชั่วคราวในข้อ 2.2 · ไม่พบเครื่องมือ MCP ของ Google Sheets |
| ~/Library/LaunchAgents | ls และ grep autodraft | พบ plist ของบอท auto-draft และ token-check ที่ปิดไว้ตั้งแต่ 25 Jul 2026 |

## Not verified

- ไม่ได้เปิดชีท QA จริงเพื่อดูว่า tab OLS-44 ปัจจุบันยังเป็น Table ชื่อ OLS_44 ที่มีหัว 16 คอลัมน์ตามที่ memory บันทึกไว้ (ข้อมูลรูปแบบมาจากไฟล์ memory ลงวันที่ 31 Jul 2026 และค่าคงที่ HDR ในโค้ด)
- ไม่ได้รัน write_tabs.py หรือ run.sh แม้แบบ DRYRUN · ไม่ทราบว่ายังใช้งานได้กับชีทปัจจุบันหรือไม่
- ไม่ทราบเหตุผลที่ปิดบอท auto-draft เมื่อ 25 Jul 2026 · ไม่พบบันทึกเหตุผลในที่ที่ค้น
- ไม่ได้ตรวจว่ามี Apps Script ที่ผูกกับชีท QA สร้าง tab ด้วยหรือไม่ (ไม่ได้เปิดโปรเจกต์ Apps Script ของชีทนั้น)
- รายการคำสั่งของเจ้าของในข้อ 2.2 มาจาก session ที่มีการเรียก addSheet เท่านั้น อาจมี session อื่นที่สร้าง tab ด้วยมือในหน้าเว็บโดยไม่ผ่าน API
