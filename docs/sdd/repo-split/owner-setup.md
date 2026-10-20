# Owner setup for pluton-ai-agent (spec R11)

Only the owner can do these: secrets cannot be read or copied by API, and the guard on the Mac refuses
`gh api` writes to repository settings. Do them in order; the main thread does everything else.

1. **Disable Actions until the cutover** (spec R10): Settings → Actions → General → "Disable actions" →
   Save. The copied workflows include `deploy-agent-office.yml`, which runs on every push to main.
   The main thread asks you to re-enable it at the cutover step.
2. **Install the GitHub App `taskfolio-dev-agent` on pluton-ai-agent too** (spec R4, R6): GitHub →
   Settings → Applications → taskfolio-dev-agent → Configure → Repository access → add
   `pluton-ai-agent` (keep `pluton-timesheet`).
3. **Repository secrets** (Settings → Secrets and variables → Actions → Repository secrets), same
   values as in pluton-timesheet:
   - `AGENT_APP_PRIVATE_KEY`
   - `CLAUDE_CODE_OAUTH_TOKEN`
4. **Environment `staging`** (Settings → Environments → New environment `staging`), environment secrets:
   - `SLACK_BOT_TOKEN`
   - `CLOUDFLARE_API_TOKEN_STAGING`
   - `CLOUDFLARE_ANALYTICS_TOKEN_STAGING`
5. **Environment `production`**, environment secrets:
   - `CLOUDFLARE_API_TOKEN_PROD`
   - `CLOUDFLARE_ANALYTICS_TOKEN_PROD`

Variables (`AGENT_APP_CLIENT_ID`, `AGENT_APP_SLUG`, `AGENT_QA_LEAD`, `SLACK_OWNER_ID`, `SLACK_QA_LEAD_ID`,
`CLOUDFLARE_ACCOUNT_ID`, `VITE_FIREBASE_*`) are copied by the main thread. `AGENT_ENABLED`,
`AGENT_TRIAGE_ENABLED` and `AGENT_SWEEP_ENABLED` stay unset until the cutover (R10).
