---
label: wayfinder:map
title: Agent Office, a live home office view of the always-on dev agent
opened: 2026-10-14
owner: @Thitic9203
---

# Map: Agent Office

## Destination

สเปกที่ล็อกแล้วของหน้า "Agent Office": ภาพ isometric ของโฮมออฟฟิศที่แสดงงานของ [always-on dev agent](../../superpowers/plans/always-on-dev-agent.md) แบบสด มีห้องประชุม ห้องพักผ่อน ห้องครัว ห้องน้ำ และโซนทำงาน ตัวละครตามบทบาท Head, PO/BA, QA, Dev, Tech Lead และ QA Lead เพิ่มลดคนและแก้หน้าที่หลักได้ สลับกลางวันกลางคืนได้ และย้ายไปใช้กับโปรเจกต์อื่นได้ด้วยการตั้งค่า ไม่ผูกกับ pluton-timesheet (เช่น OLS) ทุกข้อในสเปกมีที่มา ทั้งที่โฮสต์ ทางรับข้อมูลสด วิธีวาด asset และ mock ที่เจ้าของยืนยันแล้ว พร้อมส่งต่อเป็นแถวงานในแผน

## Notes

- เจ้าของ 14 Oct 2026: "หลักๆ คือโฟกัสการใช้งานแต่ความสวยงามน่าใช้ก็จำเป็นไม่แพ้กัน" ภาพอ้างอิงคือคลิปออฟฟิศ AI แบบ isometric ที่มีแผง "ปรับฉากออฟฟิศ" (ช่วงเวลา ตามเวลาจริง/เช้า/บ่าย/เย็น/กลางคืน, บรรยากาศรอบออฟฟิศ, โทนสี) และป้ายชื่อพร้อมสถานะเหนือตัวละคร
- เจ้าของ 14 Oct 2026: "ทำต่อยาวๆ จนเสร็จ ไม่ต้องถามระหว่างทาง" ดังนั้น ticket HITL (grilling, prototype) รอเจ้าของ ห้ามตอบแทนเจ้าของ
- เจ้าของ 14 Oct 2026: "ต้องรองรับการปรับไปใช้กับ project อื่นด้วย ไม่ใช่แค่ pluton-timesheet ในอนาคต อาจจะใช้กับ OLS หรืออื่นๆ" ดังนั้นทุกอย่างที่เฉพาะโปรเจกต์ (เรโป, prefix ของ label, ชื่อสถานะ, roster, ห้อง) ต้องมาจากไฟล์ตั้งค่า ไม่ hardcode ในโค้ด
- ห้ามใช้เงิน (hard constraint 1) · ห้ามมี secret ใน bundle ของเบราว์เซอร์ (hard constraint 2) · asset ต้องใช้ฟรีและมี license ที่อ้างได้
- กฎ UI global ข้อ 16 และ 19 ใช้เต็ม: GSAP แบบ `gsap.from()` + `clearProps` และ no-op เมื่อ reduce motion · ธีมสว่างและมืดครบ (กลางคืนคือโหมดมืด) · verify 3 ความกว้าง ≥1280, 768 ถึง 1024, ≤430 · ปุ่มอย่างน้อย 44px · contrast ผ่านเกณฑ์ · ห้าม native `<select>` บนมือถือ
- หน้านี้ไม่ใช่หน้าของแอป Taskfolio จึงไม่อยู่ใต้ `src/` และไม่อยู่ใต้ hard constraint 7 แต่ยังต้องผ่าน prototype ที่เจ้าของยืนยันก่อนสร้างจริง (ticket "Prototype the office")
- แผนแม่: แถว 11 และหัวข้อ "Agent Office (visualization)" ของ [always-on-dev-agent](../../superpowers/plans/always-on-dev-agent.md)
- ใช้สกิลที่ติดตั้งอยู่แล้วเท่านั้น: `frontend-design`, `gsap-core`, `gsap-timeline` และ `artifact-design` ไม่ติดตั้งสกิลภายนอก (เจ้าของ 14 Oct 2026: "เอาตามที่แนะนำ ... ใช้สกิลที่ติดตั้งอยู่แล้ว") เหตุผล: ค้น `npx skills find` คำว่า isometric, pixel art, game ui และ svg illustration แล้ว ตัวที่ใกล้ที่สุดใช้บริการสร้างภาพที่น่าจะเสียเงิน, สร้างภาพ hyper-realistic หรือผูกกับ Phaser, Three.js หรือ Blender ซึ่งไม่ตรงกับ V2 (SVG วาดเอง + GSAP)

## Decisions so far

- [Research where the office page lives and how it gets live agent state for free](tickets/V1.md): Cloudflare Pages แยก staging/prod + Function อ่านอย่างเดียวตรวจ Firebase ID token แบบ Jira proxy, config ต่อโปรเจกต์ใน `projects.config.json` · สำรองคือ Claude artifact · GitHub Pages ตกเพราะเป็นสาธารณะ
- [Research a free rendering approach and art source for an isometric office](tickets/V2.md): SVG isometric วาดเอง + ข้อความเป็น HTML ซ้อนบน, กลางคืนด้วย CSS variable และ `mix-blend-mode`, GSAP ฟรี · สำรองคือ canvas 2D กับ Kenney CC0

## Not yet specified

- roster เก็บที่ไหนจริง: Firestore ของโปรเจกต์ Taskfolio เดิม (ผูกกับข้อมูลแอป) หรือโปรเจกต์ Firebase ใหม่แยกสำหรับ Agent Office หรือไฟล์ตั้งค่าแก้ผ่าน PR · ตัดสินหลัง V3 และ V5
- รายละเอียดแอนิเมชัน: ตัวละครเดินระหว่างห้องตอนสถานะเปลี่ยน, ความเร็ว, เส้นทาง
- เสียงและการแจ้งเตือน (เช่น เสียงตอนงานรอเจ้าของที่ห้องประชุม)
- ประวัติย้อนหลัง: ดูว่าเมื่อวานใครทำอะไร (replay) หรือแค่สถานะปัจจุบัน
- การแตะตัวละครแล้วเปิดอะไร (issue, PR, log ของ run) และหน้าตารายละเอียด
- แหล่งสถานะที่ไม่ใช่ GitHub label (เช่น โปรเจกต์ที่ใช้ Jira อย่าง OLS) จะต่อผ่าน adapter แบบไหน เปิดเมื่อมีโปรเจกต์ที่สองจริง
- บรรยากาศรอบออฟฟิศและโทนสีแบบในคลิป (สวน ทะเล ภูเขา เมือง, โทนอบอุ่น พาสเทล มินิมอล) จะเอาเข้ารุ่นแรกหรือไม่

## Out of scope

- สั่งงานหรืออนุมัติ gate จากหน้านี้: การอนุมัติอยู่ใน GitHub เท่านั้นตาม Decisions Q1 ถึง Q5 ของแผน หน้านี้อ่านอย่างเดียว
