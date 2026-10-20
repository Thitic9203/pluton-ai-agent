# Plan: agent-office-cost-plain

## Files

- `agent-office/lib/cost-method.mjs`: add `plain` to every entry and `r62Plain` to the result, built
  from `cfg` (R1, R2, R6). Rates, formulas and `panelText` unchanged, so the R64 tests keep holding.
- `agent-office/lib/money.mjs` `panelRows`: pass `plain` through; write the rates of a row grouped
  by origin, each origin once after its rates (R5); the r62 row gets `plain` (R6).
- `agent-office/public/app/office.js`: the cost-method row draws the plain sentence, then the
  "วันนี้" line, then a closed `<details>` with the technical text (R3, R4). Text only through
  `textContent`, no `innerHTML` of data.
- `agent-office/public/index.html`: styles for `.cm-plain`, `.cm-today`, `.cm-more summary` (44 px
  target, tokens only) (R7); `agent-office/public/_headers`: the CSP style hash follows.
- Tests: `agent-office/lib/cost-method.test.mjs`, `agent-office/lib/money.test.mjs`,
  `agent-office/page.test.mjs`.

## Data shape

Entry gains `plain: string`. Panel row gains `plain: string` and keeps `input`, `where`, `formula`,
`rates`. `formula` becomes the grouped rate text.

## Alternatives weighed

- Rewrite the technical text itself in plain words: loses the audit detail R64 requires. Rejected.
- Show only the plain sentence and drop the detail: breaks R64. Rejected.
- Fold with a tooltip: R64 says not a tooltip. Rejected; `<details>` is native, keyboard ready, free.

## What could break

- The CSP hash of the inline style block (page test checks it).
- `money.test.mjs` assertions on the `formula` string shape (`(ที่มา:` per rate): the grouped form
  changes it; R5 is the confirmed source for the new expected value.

Cost: none (no new service or dependency).
