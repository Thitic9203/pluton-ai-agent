# V1 research: where the Agent Office lives and how it gets live state for free

Read 14 Oct 2026 by a research agent; each fact carries the URL it was read from that day. Local facts were re-checked by the main thread (`ls functions/api` printed `jira slack`; `functions/api/jira/_middleware.ts:17` reads `const appOrigin = validateAppOrigin(context.env.APP_ORIGIN);`).

## Recommendation

A static page on its own Cloudflare Pages projects (staging and prod), with a small read-only Pages Function that holds the GitHub credential server side and checks a Firebase ID token, the pattern the Jira proxy already uses (`functions/api/jira/_middleware.ts`, CLAUDE.md "Jira access"). Project specifics live in a config file (`projects.config.json`: id, source `github` or `jira`, repo or key, label map). The only option that stays live with no Mac or Claude session running and never puts a token in the browser.

Runner up: a Claude artifact. Private by default with a shared `db` that suits the editable roster, but nothing documented lets GitHub Actions or the browser write agent state into it; the feed would need a Claude session (a scheduled task writing rows) or a GitHub connector, and none is connected.

Roster: separate from project config. Project config is a file; people and duties are edited from the page, so they need a store with write rules (a Firestore collection behind rules, or the artifact `db`).

## Sources

- S1 https://docs.github.com/en/get-started/learning-about-github/githubs-plans: Free lists "GitHub Pages in public repositories".
- S2 https://docs.github.com/en/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site: "To publish a GitHub Pages site privately, your organization must use GitHub Enterprise Cloud."
- S3 https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site: "GitHub Pages sites are publicly available on the internet, even if the repository for the site is private".
- S5 https://docs.github.com/en/billing/concepts/product-billing/github-actions: private repos get 2,000 min/month on Free, 3,000 on Pro; self-hosted runners are free.
- S6 https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows: schedule at most every 5 minutes, may be delayed or dropped.
- S7 https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api: App installation at least 5,000 requests/hour.
- S8 https://firebase.google.com/docs/hosting/usage-quotas-pricing: without Blaze, 10 GB/month transfer; above it "your sites are disabled".
- S10 https://firebase.google.com/docs/hosting/test-preview-deploy: preview URLs "are public".
- S11 https://developers.cloudflare.com/pages/functions/pricing/: Functions share the Workers Free daily quota (100,000 requests/day); static asset requests "free and unlimited".
- S12 https://developers.cloudflare.com/pages/configuration/preview-deployments/: Cloudflare Access protects only preview deployments.
- S14 the artifact-capabilities skill read in session: `db` shared rows with rules, `mcp` uses the viewer's connectors, artifacts "private by default"; no GitHub connector is connected.

## Comparison

| | Claude artifact | Actions JSON snapshot | GitHub Pages | Extra Firebase Hosting site | Cloudflare Pages + read-only proxy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Cost | $0 (S14) | $0 only within the minute quota (S5) | needs Pro or a public repo (S1, S3) | $0 within 10 GB/month, sites disabled above (S8) | $0, 100k function requests/day (S11) |
| Privacy | private by default | depends on where it is published | public even from a private repo (S2, S3): fails | public; preview URLs public (S10) | shell public, data only after a server side ID token check |
| Freshness | only as fresh as its writer | event driven or a 5 minute cron that can drop (S6) | redeploy per change | redeploy or Firestore | live per load or poll (S7) |
| Roster | artifact `db` | repo file | repo file | Firestore of `taskfolio-staging` (couples to the app) | Firestore behind rules, or config file by PR |
| Second project | one artifact per project or a switcher | one workflow per repo | one public site per repo | up to 36 sites, adapters still needed | config file entry per project; one App installation covers several repos; Jira proxy already exists |

Feed (b) is a feed, not a host. GitHub Pages is ruled out by S2 and S3. An extra Firebase site spends the staging project's shared transfer quota, and over use would disable the real staging app (S8).

## Not verified

- A claude.ai GitHub connector usable from an artifact; whether an artifact can fetch an external origin; any documented way for Actions to write artifact rows.
- The exact sentence that Pro allows Pages from a private repo.
- Cloudflare Zero Trust free plan user count (S13); behaviour when the Functions daily quota is exceeded.
- Workers KV or D1 limits if the roster lived on Cloudflare.
- The owner's GitHub plan.
