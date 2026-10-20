---
ticket: P2
label: wayfinder:research
date: 2026-10-14
source: ~/GitHub/ols-qa (อ่านอย่างเดียว ไม่แก้ไฟล์ ไม่รัน git write)
---

# P2 findings: สกิล OLS-QA ต้องการอะไร ผลิตอะไร และรันแบบไม่มีคนเฝ้าได้แค่ไหน

ทุก path ด้านล่างนับจาก `~/GitHub/ols-qa/` · คำพูดที่ยกมาแทนขีดยาวในต้นฉบับด้วย ` · ` ตามกฎ no-dashes ของเรโปนี้ · ไม่ได้คัดลอก sheet id, URL ที่มี token, รหัสผ่าน หรือค่าบัญชีทดสอบใดๆ (path ที่ชื่อชนกับไฟล์หรือโฟลเดอร์บนสุดของเรโปนี้ เช่น `CLAUDE.md` และ `docs/` เขียนเต็มเป็น `~/GitHub/ols-qa/...` เพื่อไม่ให้ code-citations อ่านเป็นไฟล์ของเรโปนี้) · (ต้นฉบับเองก็ใช้ placeholder เช่น `<QA_TRACKING_SHEET_ID>` ตามกฎ `~/GitHub/ols-qa/CLAUDE.md:53`)

## สรุปสั้น

1. **ไม่มีสกิลไหนในหกตัวเขียนเทสเคสลง Google Sheet ของ QA** · `tc-fe-prep-workflow` เขียนไฟล์ในเวิร์กสเปซ (`.md`, `Draft_Jira_{KEY}.csv`, `Import_Qase_{KEY}.csv`, CSV แยกตาม Type) แล้วอัปโหลดเป็น attachment พร้อมคอมเมนต์เดียวบน story ใน Jira (`skills/procedures/tc-fe-prep-workflow/WORKFLOW.md:161-168`, `:318`) · `tc-api-prep-workflow` เขียนคอมเมนต์ที่ลิงก์ที่ผู้ใช้ให้ และหรือ CSV/xlsx ในเวิร์กสเปซ (`skills/procedures/tc-api-prep-workflow/WORKFLOW.md:118-121`, `:228-231`) · คำสั่งเจ้าของ "ทำเทสเคสซะในกูเกิลชีท qa" จึง**ยังไม่มีสกิลรองรับ** ต้องเป็นขั้นใหม่ หรือแก้สกิล (นอกขอบเขต P2)
2. **มีชีท QA จริงในเอกสารโปรเจกต์ แต่ไม่มี ID จริงในเรโป** · `references/ols-project-guide.md:168` หัวข้อ "QA tracking sheet (ticket list + TC status)" ระบุ Sheet เป็น placeholder `<QA_TRACKING_SHEET_ID>` (`:174`) และแต่ละ ticket มีแท็บ TC ของตัวเอง (`:179`) · ค่าจริงอยู่ใน `~/.ols-qa-secrets/` (`~/GitHub/ols-qa/CLAUDE.md:53`, `:37`) ซึ่งไม่ได้เปิดอ่านในงานนี้
3. **ชีทนั้นคือเงื่อนไขก่อนเทส**: "Eligibility for AI testing | **Status = `READY TO TEST`** AND **TC Status = `QA Reviewed`**" (`references/ols-project-guide.md:180`) และ "Ticket has no TC rows in sheet | TCs not yet pasted → tell user to update the sheet first; do **not** start testing" (`:181`) · แปลว่าเส้นทางปัจจุบันคือ คนวาง TC ลงชีทเอง แล้วรีวิวจนเป็น QA Reviewed ก่อน AI เทส
4. **ทุกสกิลที่เขียนออกนอกแชทมีจุดอนุมัติของคน** · testing-ticket และ retest-bug ถูกออกแบบให้มี "single human touch" ตอนจบรอบ (`references/round-time-contract.md:29-45`) ส่วน tc-fe-prep และ tc-api-prep มีด่านรอคำตอบหลายจุดระหว่างทาง
5. **ช่องทางแจ้งผลในสกิลคือ Discord ไม่ใช่ Slack** (`skills/procedures/retest-bug-workflow/WORKFLOW.md:457`, `closeout-and-notify.md:181`, `~/GitHub/ols-qa/CLAUDE.md:93-95`) · ต่างจากช่องทางอนุมัติที่เจ้าของเลือก (DM Slack ตาม MAP.md Notes)

## ตารางรวมต่อสกิล

| สกิล | input ที่ต้องมี | ปลายทางที่เขียน | ด่านคน | รันไม่มีคนเฝ้า |
|---|---|---|---|---|
| tc-fe-prep | Jira story, Figma/PRD (ถามถ้าไม่มี), Qase suite, Jira credential | ไฟล์ในเวิร์กสเปซ + attachment และคอมเมนต์บน story | 5 จุดขึ้นไป | ไม่ได้ |
| tc-api-prep | API spec + Swagger, คอลัมน์, ปลายทาง | CSV/xlsx ในเวิร์กสเปซ และหรือคอมเมนต์ที่ลิงก์ | 4 จุด | ไม่ได้ |
| tc-review | เอกสาร TC + ticket ที่มี AC/EC | แชทเท่านั้น, ส่งออก Discord เมื่อสั่ง | อนุมัติก่อนส่งออก | ส่วนรีวิวได้ ส่วนส่งออกไม่ได้ |
| testing-ticket | Ticket, URL, User, Password, VPN, Confluence, Swagger, Figma | แชท, ปลายทางผลตาม guide (Jira/Sheet/Confluence/CSV) | ป็อปอัปตัดสินใจ + อนุมัติ 1 ครั้งตอนจบ | ได้ถึงก่อนป็อปอัปอนุมัติ |
| review-result | ชีทผล/รายการเคส, คลิปหลักฐาน, ขอบเขตชุด | ไดเรกทอรีงาน, live board, ชีทผล | ถามเจ้าของเมื่อ ER ไม่มีจอรองรับ | ได้บางส่วน |
| retest-bug | Jira bug/task, retest guide (URL, credential, transition) | คอมเมนต์ Jira, transition, unblock story, Discord notify | ป็อปอัปตัดสินใจ + อนุมัติ 1 ครั้ง | ได้ถึงก่อนป็อปอัปอนุมัติ |

## 1. tc-fe-prep-workflow

ตัว stub: `skills/tc-fe-prep-workflow/SKILL.md` · ขั้นตอนจริง: `skills/procedures/tc-fe-prep-workflow/WORKFLOW.md` (`SKILL.md:17`)

**Input**
- Jira story key หรือ URL: "MUST NOT start until the user provides a Jira story key or URL and required config is resolved." (`SKILL.md:77`)
- ยืนยัน key ก่อนเริ่ม: "**Before Step 0:** confirm the **story** issue key with the user" (`WORKFLOW.md:80`)
- project config (Jira domain, portal, shared login role, export format, publish method) ถามทีละส่วนถ้ายังไม่มี guide (`WORKFLOW.md:102-107`)
- PRD และ Figma: ถามถ้าไม่พบในตั๋ว "If either is missing, ask the user once:" (`requirement-gates.md:77`)
- Qase suite: "Inspect the OLS project's existing suite tree first (Qase web UI → Test cases → suite sidebar, or ask the user to paste the current suite list · there is no Qase MCP)" (`WORKFLOW.md:159`)
- Dependencies: "Atlassian MCP", "Jira REST credentials (ADF-direct publish)", "Qase", "a browser for the HTML preview" (`SKILL.md:89-92`)
- Swagger, VPN, บัญชีทดสอบ, Confluence: ไม่อยู่ในรายการที่สกิลนี้ขอ

**ด่านที่ถามคนหรือรออนุมัติ**
1. ขอ ticket: "**Wait for an answer.**" (`WORKFLOW.md:92`)
2. AC/EC ซ้ำหรือขัดกัน: ถามสามทางเลือก แล้ว "**Wait for the user's answer.**" (`requirement-gates.md:59`) · "Do NOT proceed past Step 2.6 until the user has decided" (`requirement-gates.md:65`)
3. PRD/Figma ที่หาย: "**Wait for the user's response.**" (`requirement-gates.md:87`)
4. ความขัดกับ PRD/Figma: "present recommendations in chat and wait for the user to confirm or override." (`requirement-gates.md:135`)
5. คำศัพท์ glossary: "**STOP and ask** what word to use." (`requirement-gates.md:193`) · "**Wait for the user's answers.**" (`requirement-gates.md:198`)
6. coverage: "MUST NOT show the full TC table until **Ready for draft: YES**" (`design-and-review.md:220`)
7. คำไทยกับอังกฤษ: "the user MUST see and approve the term choices **before** any content is written to the real TC file." (`design-and-review.md:286`)
8. ร่าง HTML ใน Chrome: "**Wait for approval** or edit requests." (`WORKFLOW.md:149`) · "Step 6 starts only on approval" (`WORKFLOW.md:151`)

**Output และปลายทาง**
- ไฟล์ในเวิร์กสเปซ: `references/{ISSUE_KEY}_FE_TC.md`, `references/Draft_Jira_{ISSUE_KEY}.csv`, `references/Import_Qase_{ISSUE_KEY}.csv` และ CSV แยก Type (`WORKFLOW.md:161-168`)
- HTML ร่าง `references/{ISSUE_KEY}_FE_TC_draft.html` (`WORKFLOW.md:140`)
- Jira: อัปโหลด CSV แล้วโพสต์คอมเมนต์ ADF ผ่าน JS ในหน้า Jira ที่ล็อกอินอยู่: "upload `Draft_Jira` → upload `Import_Qase` → post ADF comment" (`WORKFLOW.md:318`) · "publish **one comment** on **that story only**" (`WORKFLOW.md:11`)
- Qase: สกิลทำแค่ไฟล์ CSV สำหรับ import ไม่ได้ import เข้า Qase เอง (`WORKFLOW.md:284` ข้อความลิงก์ "Qase import file พร้อม import เข้า OLS project")
- Google Sheet: ไม่มี · คำว่า sheet ในขั้นตอนนี้หมายถึง glossary ที่อ่านอย่างเดียว (`requirement-gates.md:163`) และกฎตั้ง Test Status = BLOCKED "in the tracking sheet / result table" (`design-and-review.md:237`) ซึ่งเป็นกฎสถานะแถว ไม่ใช่ขั้นเขียน TC ลงชีท

**รันไม่มีคนเฝ้าไม่ได้ เพราะ**: ด่านรอคำตอบ 8 จุดข้างบนไม่มีโหมด delegated หรือ unattended ในสกิลนี้ (ค้น `unattended|bot mode` ในโฟลเดอร์นี้ไม่พบ ดูคำสั่งในส่วนหลักฐาน) · ขั้น Qase suite ต้องเปิด Qase web UI หรือให้คนวางรายการ · การโพสต์ใช้ session เบราว์เซอร์ที่ล็อกอิน Jira (`WORKFLOW.md:316-318`)

## 2. tc-api-prep-workflow

**Input**
- "MUST NOT start without API spec + Swagger and delivery choices confirmed." (`skills/tc-api-prep-workflow/SKILL.md:71`)
- API Spec (ลิงก์, ไฟล์, Confluence หรือข้อความ) และ Swagger/OpenAPI (`WORKFLOW.md:76-79`)
- VPN และ session: "Fetch URL with authenticated session if needed (ask user)." (`WORKFLOW.md:84`) · "If load fails → stop and report; ask for export file or VPN." (`WORKFLOW.md:88`)
- Jira key: ไม่บังคับ ปลายทางคอมเมนต์คือ "paste the full URL (e.g. Jira issue, Confluence page)" (`WORKFLOW.md:120`)
- Figma, บัญชีทดสอบ, Qase: ไม่อยู่ในรายการที่สกิลนี้ขอ

**ด่านที่ถามคนหรือรออนุมัติ**
1. แหล่ง API: "**Wait** until both are answered" (`WORKFLOW.md:80`)
2. คอลัมน์: "**Wait for an answer.** Record final column list" (`WORKFLOW.md:109`)
3. ปลายทาง A หรือ B: "**Wait for an answer** before generating the full draft (Phase E)." (`WORKFLOW.md:132`)
4. ร่างในแชท: "**Wait for approval** or edits." (`WORKFLOW.md:218`) · "MUST NOT post a comment or write files until the user approves the draft in chat (Phase F)" (`WORKFLOW.md:54`)
5. ก่อนโพสต์: "Show draft comment → user may waive second approval if they already approved Phase F table." (`WORKFLOW.md:251`)

**Output และปลายทาง**: `references/{SCOPE}_API_TC.md` และ `.csv` หรือ `.xlsx` (`WORKFLOW.md:228-231`) · คอมเมนต์ ADF ที่ลิงก์ปลายทาง พร้อมแนบไฟล์เมื่อเลือกทั้งสองทาง (`WORKFLOW.md:244`, `:343`) · ไม่มี Google Sheet ไม่มี Qase

**รันไม่มีคนเฝ้าไม่ได้ เพราะ**: ด่าน 1 ถึง 4 รอคำตอบ และ Swagger หลัง VPN อาจต้องคนเชื่อมต่อ (`WORKFLOW.md:88`)

## 3. tc-review-workflow (รีวิวเทสเคส)

ไฟล์เดียว `skills/tc-review-workflow/SKILL.md` ไม่มี procedures

**Input**
- "MUST NOT start without both: · the **TC document** · a sheet, CSV, or markdown file, reachable and readable this session; · the **governing ticket** · a Jira issue key or URL carrying AC/EC" (`SKILL.md:83-87`)
- จดที่มาของเอกสาร "sheet id + tab/gid, file path, or URL" (`SKILL.md:100`) · จึงอ่านจาก Google Sheet ได้ถ้ามีสิทธิ์
- Figma/PRD เฉพาะเมื่อผู้ใช้ต้องการ cross-check (`SKILL.md:105`, `:327`)
- source sweep บังคับ ต้องมี clone ของ product repo: "clone of the product repo (`{MONOREPO}`) for the source sweep" (`SKILL.md:328`, ขั้นตอนที่ `:162-171`)
- ตั๋วข้ามไซต์ Atlassian: "say so and ask the user to grant it (or paste the AC/EC directly)" (`SKILL.md:91-93`)

**ด่านคน**
- "Post the review in chat and get the user's go-ahead before any external send (Step 5)" (`SKILL.md:207-208`)
- Step 5 "Only on explicit request, and only to a destination and identity the user names" (`SKILL.md:214`) · mention ต้อง "ask for the exact id" (`SKILL.md:217`)
- ถามภาษาเมื่อปนกัน "ask once if genuinely mixed" (`SKILL.md:202`)

**Output**: รายการ Good และ Need Improve ในแชท (`SKILL.md:173-186`) · ส่งออกได้ทาง Discord webhook (`SKILL.md:224`, `:228`) · "MUST NOT post to Jira/Confluence/GitHub or send an external message before the user has seen the review in chat" (`SKILL.md:292`) · สกิลนี้**ไม่แก้เอกสาร TC**: "Designing or editing test cases · this workflow only judges what is already written." (`SKILL.md:271`)

**ใครเป็นคนรัน**: สกิลไม่ระบุบทบาท พูดถึงแค่ "the user" · ผลรีวิวมีไว้ให้ "the TC author" (`SKILL.md:186`) · ในเอกสารโปรเจกต์ เมื่อรีวิวเสร็จให้ "flip **both** the Sheet's Summary!TC Status cell AND this Jira field to `QA REVIEWED`" (`references/ols-project-guide.md:184`) แต่ขั้นนี้**ไม่อยู่ในสกิล tc-review** และไม่ได้ระบุว่าใครเปลี่ยน

**รันไม่มีคนเฝ้า**: ส่วนรีวิวในแชทรันได้ถ้ามีสิทธิ์อ่านชีทและ Jira · การส่งออกและการเปลี่ยน TC Status ต้องมีคนอนุมัติ

## 4. testing-ticket-workflow (ทดสอบ)

**Input** (Phase A, `skills/procedures/testing-ticket-workflow/WORKFLOW.md:162-170`): Ticket, URL ของแอป, User, Password, VPN (`Required` / `Not required`), Confluence (ไม่บังคับ), Swagger (ไม่บังคับ) · "MUST refuse to reach Phase B until **Ticket** and **URL** are provided" (`WORKFLOW.md:138`) · CONTEXT.md นิยามเหมือนกัน "**Intake** | Ticket, URL, User, Password, VPN, Confluence, Swagger" (`CONTEXT.md:37`)
- env และบัญชีบังคับ: "**Environment + account are a hard intake item · always settle them, never assume.**" (`WORKFLOW.md:181`) · กฎเรโป "ยืนยัน env + account กับ user ก่อนเทสทุกครั้ง ห้ามเลือกเอง (dev/pre-prod ต้อง VPN ..." (ไฟล์ docs/ENVIRONMENT.md บรรทัด 3 ของเรโป ols-qa)
- VPN: "**Required** · User must connect before tests" (`references/session-intake.md:22`) · dev และ pre-prod ต้อง VPN (`references/ols-project-guide.md:733-734`)
- Figma บังคับทุกฉาก UI (`skills/testing-ticket-workflow/SKILL.md:23`, `WORKFLOW.md:203-221`)
- บัญชีหลายตัว "one leased account per lane" (`SKILL.md:25`)
- ค่าจาก guide ไม่ถามซ้ำ "Workspace-guide values are not asked again" (`WORKFLOW.md:174`)
- Qase: ไม่ใช้

**ด่านคน**
- Phase C ไม่รอ: "Print the plan below, then start Phase D **without waiting**" (`WORKFLOW.md:239`)
- **ขัดกันเอง**: ไฟล์อ้างอิง `references/session-intake.md:38` ยังเขียนว่า "receive **confirm** before Playwright starts" และ `CONTEXT.md:38` "**Confirm gate** | User approves summary before Playwright" ขณะที่ WORKFLOW และ `round-time-contract.md:25` บอกว่า "Show the plan, then run" · ฉบับที่ใหม่กว่าคือ WORKFLOW (ยังไม่ได้ยืนยันด้วย git log)
- login ล้ม: "🛑 stop ... do **not** start testing until it is cleared or the user explicitly says to skip the failing role" (`WORKFLOW.md:142`)
- ไม่มี Figma ของจอ: แจ้งคนหรือช่องทางที่มอบงาน · "Unattended/bot mode: same request to the triggering channel with the project's @mention, visual points BLOCKED + remark, run continues." (`WORKFLOW.md:221`)
- ตอนจบรอบ: "**Decisions popup** · only when questions are queued. One `AskUserQuestion`" (`execute-and-summarize.md:340`) · "**Approval popup** · one approval for the whole bundle" (`execute-and-summarize.md:346`) · "No queued decisions → step 2 is skipped and the round has a single human touch." (`execute-and-summarize.md:351`)
- เปิดบั๊กต้อง "Only a live *Open it* answer from the owner routes to create-bug." (`execute-and-summarize.md:343`)

**Output และปลายทาง**
- สรุปในแชท Phase F (`execute-and-summarize.md:184-215`)
- ปลายทางผลไม่บังคับ อ่านจาก guide: "Whether results go somewhere else (Jira comment, Google Sheet, Confluence table, CSV file, etc.) is read from the workspace guide's results destination." (`results-update.md:27-28`) · กฎ Google Sheet: "**Detect the result columns from the header row · never assume fixed column letters**" (`results-update.md:58`) · เขียนเฉพาะแถวที่เป็นของรอบนี้ (`results-update.md:66-70`)
- ในโปรเจกต์ OLS ผลเขียนลงแท็บ TC ของ ticket ในชีท QA ผ่านเครื่องมือนอกเรโป: "เขียนผ่าน `sheet_write.py` (`--dry-run` ก่อน · ทุกแถวมี `"tc"` anchor) **ห้ามยิง Sheets API เขียน tab TC เอง**" (`references/ols-project-guide.md:183`)
- `references/helix-handoff-{KEY}.md` ทุกรอบ (`execute-and-summarize.md:352`)

**รันไม่มีคนเฝ้า**: เตรียม เทส และสรุปได้ถึงก่อนป็อปอัปอนุมัติ ถ้า VPN ต่ออยู่แล้วและ env กับบัญชีอยู่ใน guide · การเขียนผลออกนอกแชทต้องผ่านป็อปอัปอนุมัติ ซึ่งในสกิลเป็น `AskUserQuestion` ในเซสชัน ไม่ใช่ DM Slack

## 5. review-result-workflow (รีวิวผลเทส)

**Input**: "MUST NOT start without all of: · the **result sheet or case list** · for each case: its tab, its role, its steps, and its expected results; · the **recorded evidence** for those cases, reachable on disk; · the **suite scope**" (`skills/procedures/review-result-workflow/WORKFLOW.md:91-95`) · เครื่องมือ: "QA capture and verify tools", "ffmpeg / ffprobe", "`tools/result-gate`" (`skills/review-result-workflow/SKILL.md:78-81`) · ไม่ใช้ Jira, Figma, Swagger, VPN, บัญชีทดสอบโดยตรง (ไม่พบในรายการ dependency)

**ด่านคน**
- ER ที่ไม่มีจอแสดง: "**Stop and ask the owner.** Do not invent a surface for it" (`WORKFLOW.md:319`)
- ยังตัดสินไม่ได้หลังไล่สามชั้น "that is a **question for the owner**, raised explicitly." (`WORKFLOW.md:250`)
- เปิดบั๊ก "never file without the owner" (`SKILL.md:38`)

**Output**: ไดเรกทอรีงาน `sheets/`, `contact/`, `board/` (`WORKFLOW.md:113-116`) · สถานะปิดสามแบบ `PASSED`, `FAILED`, `AWAITING RE-REVIEW` (`SKILL.md:27`) · live board ทุกรอบ "updated **the moment a status changes**" (`WORKFLOW.md:264-265`) · ชีทผล: ลำดับเลขต่อเนื่องและห้ามเปลี่ยนชื่อคลิป (`WORKFLOW.md:179`, `:339`) · ไม่มีขั้นโพสต์ Jira หรือ Slack ในสกิล

**ใครเป็นคนรัน**: สกิลไม่ระบุบทบาท ใช้คำว่า "the owner" สำหรับคนตอบคำถาม · ใช้กับชุดที่อัดคลิปไว้แล้ว "Works for any recorded set · unit, system, integration, or another suite." (`SKILL.md:5`) จึงเป็นงานรีวิวหลักฐานรวมชุด ไม่ใช่ต่อ ticket

**รันไม่มีคนเฝ้า**: ตัดสินคลิปได้เองเกือบทั้งหมด · หยุดที่คำถาม F และคำถามสเปค · ทริกเกอร์ว่าเกิดเมื่อไรไม่มีในสกิล

## 6. retest-bug-workflow (รีเทส)

**Input**
- "MUST NOT start without a Jira issue key/URL · a **Bug**, or a **Task / Story** whose fix is being re-verified · and reachable environment config." (`skills/retest-bug-workflow/SKILL.md:77`)
- config จาก `references/*-retest-guide.md`: Jira domain, env + base URL + Swagger path, portal และ login, "Test credentials (never commit production secrets)", transition (`skills/procedures/retest-bug-workflow/WORKFLOW.md:179-185`) · ถามทีละข้อถ้าไม่มี (`WORKFLOW.md:179`)
- Figma บังคับทุก UI retest (`SKILL.md:24`)
- Dependencies: "curl + Jira REST credentials", "Atlassian MCP", "Figma", "Playwright", "notify channel webhook / bot", "macOS-only tools (`sips`)" (`SKILL.md:90-99`)

**ด่านคน**
- ขอ ticket "**Wait for an answer.**" (`WORKFLOW.md:167`)
- แผนไม่รอ: "**Show the plan, then run** · print it and start execution without waiting for an approval" (`WORKFLOW.md:266`)
- Figma หาย, unattended: "**Unattended / bot mode:** send the same request to the triggering channel with the project's" @mention (`WORKFLOW.md:326`)
- ตอนจบรอบ: ป็อปอัปตัดสินใจ แล้ว "**One approval popup for the whole bundle**" ที่ระบุคอมเมนต์, transition, assign, unblock, notify, result update (`comment-and-post.md:332-334`) · "**No second approval.**" (`comment-and-post.md:337`)
- โหมด delegated: "when the owner has delegated the round ("don't ask", "don't wait", "handle it"), ... the approval wait is skipped (layer 19) ... Opening new bugs still needs a live yes." (`comment-and-post.md:316`)
- ก่อน transition ถ้าฝังหลักฐานไม่ได้ "**STOP. Do NOT transition.** Report the specific gap to the user" (`closeout-and-notify.md:43`)

**Output และปลายทาง**
- คอมเมนต์ Jira ที่ render จาก run.json และผ่าน `retest_guard.js` (`SKILL.md:83`, `comment-and-post.md:187`)
- transition ตามชื่อใน guide (`closeout-and-notify.md:47-53`) · OLS ไม่เปลี่ยน assignee (`closeout-and-notify.md:74`) · unblock story ที่ลิงก์ (`closeout-and-notify.md:76`)
- โหมด AI autotest ของ OLS: "a non-pass goes to **BLOCKED** with the comment "AI ทดสอบไม่ผ่าน รอ QA reproduce" · never FAILED, never In Progress, never a new bug" (`references/ols-project-guide.md:93`, คำตัดสินเจ้าของ 2026-10-05)
- notify ช่องทาง QA: Discord webhook (`closeout-and-notify.md:181`) · "MUST `--dry-run` Discord notify before real send" (`WORKFLOW.md:457`) · ผู้รับมาจากฟิลด์ QA Owner ของ ticket (`WORKFLOW.md:458`)
- ไม่มี Google Sheet หรือ Qase

**รันไม่มีคนเฝ้า**: รันได้ถึงก่อนป็อปอัปอนุมัติ หรือจบทั้งรอบในโหมด delegated · ข้อจำกัดคือ `sips` ใช้ได้บน macOS เท่านั้น, ต้องมี Jira REST credential และ VPN สำหรับ dev/pre-prod

## Google Sheet: ค้นแล้วพบอะไร

คำสั่ง: `grep -rnIi -E "google ?sheet|spreadsheets/d/|sheet id|sheet_id|SHEET_ID|gid=|กูเกิลชีท|gsheet" --exclude-dir=node_modules --exclude-dir=.git .` ใน `~/GitHub/ols-qa`

- ไม่พบ sheet ID จริงในเรโป พบเฉพาะ placeholder: `<QA_TRACKING_SHEET_ID>` (`references/ols-project-guide.md:174`), `<CUSTOMER_UAT_SHEET_ID>` (`:231`), `<SMOKE_SHEET_ID>` (`:160`), `<SYS_SHEET_ID>` `<INTEG_SHEET_ID>` `<UNIT_SHEET_ID>` (`:630-632`), `<BUGMIRROR_SHEET_ID>` (`:352`) · กฎ "ค่าจริงอยู่ `~/.ols-qa-secrets/` เท่านั้น" (`~/GitHub/ols-qa/CLAUDE.md:53`)
- ชีทที่ตรงกับ "กูเกิลชีท qa" มากที่สุดคือ **QA tracking sheet**: แท็บ Summary เป็นรายการ ticket มีคอลัมน์ QA Owner และ TC Status (`references/ols-project-guide.md:175`) · แต่ละ ticket มีแท็บ TC ของตัวเอง (`:179`) · แท็บ TC เป็น Google Sheets Table object (`:186`)
- เขียนลงแท็บ TC ได้เฉพาะแถวว่างหรือ NOT STARTED ผ่าน `sheet_write.py` นอกเรโป (`:183`) · กฎนี้เขียนถึงการเขียน**ผลเทส** ไม่มีขั้นใดในหกสกิลที่**สร้างแท็บใหม่หรือวางแถว TC ใหม่**
- ชีท regression ของลูกค้าแช่แข็งแล้ว "ทั้ง Lot1 และ Lot2 = ส่งมอบแล้วและแช่แข็ง (เจ้าของสั่ง 2026-08-15) · ห้าม workflow ใดเขียนอีก" (`:225`) · ไม่ใช่ปลายทางของ TC ใหม่
- เอกสารนอกสกิล `natty-doc/ols-preprod-regression-lot1-125cases-automation.md:7` ห้ามแตะ Google Sheets สำหรับงาน automation ชุดนั้น (คนละงานกับ P2)

**ช่องว่าง**: คำสั่งเจ้าของให้เขียน TC ลงชีท QA แต่ tc-fe-prep เขียนลง Jira comment + CSV ของ Qase · ถ้าจะทำตามคำสั่ง ต้องมีขั้นแปลงแถว TC ที่อนุมัติแล้วลงแท็บ `OLS-<key>` ของชีท QA ด้วยกฎ Integrity และ Write scope (`:182-183`) ซึ่งยังไม่มีในสกิล และต้องถามเจ้าของว่ายังต้องโพสต์คอมเมนต์ Jira และ CSV Qase ด้วยหรือไม่

## รีวิว TC และรีวิวผล: ต้องการอะไร ใครรัน

- **รีวิว TC** (`tc-review-workflow`) ต้องมีเอกสาร TC ที่มีอยู่แล้ว + ticket ที่มี AC/EC (`SKILL.md:83-87`) ผู้รันคือ "the user" ไม่ระบุบทบาท · เชื่อมกับชีทผ่านกฎโปรเจกต์ที่ให้เปลี่ยน TC Status เป็น QA REVIEWED ทั้งชีทและ Jira เมื่อรีวิวเสร็จ (`references/ols-project-guide.md:184`) และสถานะนี้คือเงื่อนไขให้ AI เทส (`:180`) · แปลว่าถ้า agent เขียน TC เองแล้ว agent รีวิวเองจะผ่านเงื่อนไขนี้ด้วยมือเดียว ต้องให้เจ้าของตัดสินว่าใครเป็นผู้รีวิว
- **รีวิวผล** (`review-result-workflow`) ต้องมีชีทผลหรือรายการเคส + คลิปหลักฐานบนดิสก์ + ขอบเขตชุด (`WORKFLOW.md:91-95`) ผู้รันไม่ระบุบทบาท ใช้คำว่า owner สำหรับผู้ตอบคำถาม · ทริกเกอร์ไม่มีในสกิล

## สิ่งที่ต้องให้เจ้าของตัดสิน (ส่งต่อให้ตั๋ว grill)

1. เขียน TC ลงแท็บไหนของชีท QA และยังต้องโพสต์ Jira comment กับ CSV Qase ตาม tc-fe-prep หรือไม่
2. ใครเป็นผู้รีวิว TC ที่ agent เขียน ก่อนเปลี่ยน TC Status เป็น QA Reviewed
3. ป็อปอัปอนุมัติของสกิล (`AskUserQuestion` ในเซสชัน) จะแทนด้วยร่างใน DM Slack + คำตอบ `passed` ตาม MAP.md อย่างไร และ notify Discord ของ retest ยังส่งหรือไม่
4. ด่านรอคำตอบของ tc-fe-prep (8 จุด) และ tc-api-prep (4 จุด) จะใช้โหมด delegated แบบ retest ได้หรือไม่ ปัจจุบันสกิลไม่มีโหมดนี้
5. VPN และเครื่องที่รัน (dev และ pre-prod ต้อง VPN, `sips` ต้อง macOS)

## หลักฐานการค้น (คำสั่งที่รัน)

- `cat -n` ของ SKILL.md ทั้งหกตัว, `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`
- `grep -nEi "approv|AskUserQuestion|wait for|popup|..."` ในแต่ละ `skills/procedures/<skill>/`
- `sed -n` ช่วงบรรทัดที่อ้างใน WORKFLOW.md, requirement-gates.md, results-update.md, execute-and-summarize.md, comment-and-post.md, closeout-and-notify.md, `references/round-time-contract.md`, `references/ols-project-guide.md`
- `grep -rnEi "unattended|bot mode" references/round-time-contract.md references/no-wait-decision-gate.md references/helix-session-constraints.md skills/procedures/*/WORKFLOW.md` พบใน testing-ticket, retest-bug และ round-time-contract เท่านั้น ไม่พบใน tc-fe-prep, tc-api-prep, review-result

## ยังไม่ได้ตรวจ

- ไม่ได้อ่านไฟล์ references ที่ทุกสกิลโหลดครบทุกไฟล์ (เช่น `shared-must-never.md`, `no-wait-decision-gate.md` ทั้ง 20 ชั้น, `figma-design-comparison.md`, `parallel-test-lanes.md`) อ่านเฉพาะส่วนที่ตอบคำถาม
- ไม่ได้อ่าน `~/.ols-qa-secrets/` จึงไม่รู้ว่า ID จริงของชีท QA ตรงกับ "กูเกิลชีท qa" ที่เจ้าของหมายถึงหรือไม่
- ไม่ได้อ่าน `docs/JIRA_CONFLUENCE.md`, `docs/DISCORD_SFD.md`, `docs/AGENT_BOARD.md` ทั้งไฟล์ (ค้นคำว่า approve ใน JIRA_CONFLUENCE ไม่พบผล)
- ไม่ได้ตรวจด้วย git log ว่า `session-intake.md:38` (confirm ก่อนเทส) เก่ากว่า WORKFLOW (ไม่รอ) จริง
- ไม่ได้ตรวจว่าโหมด `OLS_MODE=autotest` มีโค้ดรองรับที่ไหน พบเพียงในตารางกฎ `references/ols-project-guide.md:93`
- ไม่ได้อ่านเครื่องมือนอกเรโป `~/ols-qa-testing-bot/` (`sheet_write.py`)
