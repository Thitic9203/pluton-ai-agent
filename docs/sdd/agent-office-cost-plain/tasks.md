# Tasks: agent-office-cost-plain

- **T1 (R1, R2, R6).** Test first in `cost-method.test.mjs`: every entry has `plain`; changing
  `tiers.L` and `actionsMinute` changes the plain text; `r62Plain` exists. Then add `plain` and
  `r62Plain` in `cost-method.mjs`. Done when the new tests fail before and pass after.
- **T2 (R5, R6).** Test first in `money.test.mjs`: the income row's `formula` holds its sizing source
  once; rows carry `plain`. Then group rates by origin in `panelRows`. Done when green.
- **T3 (R3, R4, R7).** Test first in `page.test.mjs`: the renderer builds `.cm-plain`, `.cm-today`
  and a `details.cm-more` with summary "ดูวิธีคิดแบบละเอียด"; the style gives the summary
  `min-height: 44px`. Then change `office.js`, `index.html`, `_headers`. Done when green.
- **T4 (R7).** Staging: walk the panel at 430, 768, 1280 in light and dark; then production with the
  staging sha. Done when the rendered after file is sent and both `version.txt` show the sha.
