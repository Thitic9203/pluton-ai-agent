# Spec: the "ที่มาของค่าใช้จ่าย" panel reads in plain Thai first

Status: confirmed · Owner request 19 Oct 2026 (chat, on a screenshot of the production panel's
income row): "อัปเดตให้กระชับกว่านี้ และอ่านเข้าใจได้ง่ายแม้เป็นคน non-tech".

Scope: the Agent Office money panel "ที่มาของค่าใช้จ่าย" (`agent-office/lib/cost-method.mjs`,
`agent-office/lib/money.mjs` `panelRows`, `agent-office/public/app/office.js`,
`agent-office/public/index.html`). It amends how R64 of
[agent-office-live](../agent-office-live/spec.md) is laid out; it removes no fact R64 requires.
Out of scope: every other panel, the `mnote` lines, the numbers themselves.

## Rules

- **R1.** When the panel draws a row, the system must show first one short plain Thai sentence that
  says what the row means for the team, in words a person with no engineering background reads
  (no field names, no API names, no formulas). Source: owner 19 Oct 2026 (above).
  Done when: every entry of `costMethod()` has a non-empty `plain` string and the page shows it as
  the first text of the row.
- **R2.** When a plain sentence names a number (a size price, a bonus cap, a per minute price, a free
  quota), the system must read that number from the same config object the calculator reads; no rate
  is typed into the sentence. Source: R64 of agent-office-live ("no rate is typed into the page text").
  Done when: a test changes `tiers.L` and `office.prices.actionsMinute.value` and sees the plain
  sentence change.
- **R3.** When a row has a figure for today, the system must show it on its own line right after the
  plain sentence. Source: R64 ("today's figure"), owner 19 Oct 2026 (concise).
  Done when: the page renders "วันนี้ …" under the plain sentence for every row of `TODAY_ROWS`.
- **R4.** The full technical detail of R64 (what it counts, where it is read, the formula, every rate
  with its source and date) must stay in the row, folded under a control labelled
  "ดูวิธีคิดแบบละเอียด" that is closed by default and opens with a click or the keyboard. Source:
  R64 (every rate stays visible in the panel, not a tooltip); owner 19 Oct 2026 (concise).
  Done when: the existing `cost-method.test.mjs` rate walk still passes and the page test finds a
  closed `<details>` per row whose text holds the formula and rates.
- **R5.** Inside the folded detail, a source that several rates share must be written once, after
  those rates, not once per rate. Source: owner 19 Oct 2026 (concise); the screenshot repeats one
  source fourteen times.
  Done when: the income row's detail text contains its sizing source string exactly once.
- **R6.** The R62 statement must also read as one plain sentence first ("ข้อมูลหนึ่งอย่างคิดเงินได้
  ครั้งเดียว ไม่นับซ้ำ"), with its full list folded as in R4. Source: R62, owner 19 Oct 2026.
  Done when: the r62 row shows the plain sentence and folds the list.
- **R7.** The row must keep the UI standards: tap target of the fold control at least 44 px tall,
  text wraps inside the card at 430, 768 and 1280 px in both themes, no horizontal scroll, colours
  from tokens. Source: CLAUDE.md "Every UI change ships complete", global rule 16 and 19.
  Done when: the page test asserts the summary min-height and wrap rule, and the staging walk at the
  three widths in both themes shows no overflow.

## Edge cases

- No config read (no source): the row shows the existing no-source text, nothing folded.
- Supplies sub-rows (today's servings): they already read short (name, what counts, price); they get
  no plain sentence and no fold.
- A menu with no prices: the supplies plain sentence still reads; its detail lists no menu rates.

## Open questions

- Q1. Should the folded detail move to a separate "สำหรับทีมเทคนิค" page later? Not needed for this
  request; left open.
