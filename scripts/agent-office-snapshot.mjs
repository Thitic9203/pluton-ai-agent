#!/usr/bin/env node
/*
 * Writes agent-office/public/data/state.json, the board snapshot of
 * docs/sdd/agent-office-live/spec.md R65. Run by .github/workflows/deploy-agent-office.yml right
 * before `wrangler pages deploy`, with the job's GITHUB_TOKEN (read scopes only, R41) and
 * AGENT_ENABLED from `vars.AGENT_ENABLED`, AGENT_APP_LOGIN (`vars.AGENT_APP_SLUG` + `[bot]`, R59), and
 * for the internet line (R61) CLOUDFLARE_ANALYTICS_TOKEN (the environment's read-only analytics
 * secret), CLOUDFLARE_ACCOUNT_ID and AGENT_OFFICE_PROJECT, all as environment variables, never as arguments. The
 * logic and its tests are in scripts/lib/agent-office-snapshot.mjs. On any GitHub failure it exits
 * 1 and writes nothing (E1). It prints counts only: never the token, never an issue title.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGitHubClient } from '../agent-office/lib/github.mjs';
import { loadConfig, CONFIG_URL, loadMenu, MENU_URL } from '../agent-office/lib/config.mjs';
import { readUsdThb } from '../agent-office/lib/fx.mjs';
import { readFunctionRequests } from '../agent-office/lib/cloudflare.mjs';
import { snapshotToFile } from './lib/agent-office-snapshot.mjs';

try {
  const config = loadConfig(readFileSync(CONFIG_URL, 'utf8'));
  const menu = loadMenu(readFileSync(MENU_URL, 'utf8'));
  const analytics = {
    token: process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? '',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    project: process.env.AGENT_OFFICE_PROJECT ?? '',
  };
  const agentEnabled = process.env.AGENT_ENABLED === 'true';
  const client = agentEnabled ? createGitHubClient({ token: process.env.GITHUB_TOKEN ?? '' }) : null;
  // ols-real R13: each mac-snapshot project's repository variable, passed by the workflow as env (data only)
  const boards = Object.fromEntries(config.projects.filter((p) => p.source.kind === 'mac-snapshot').map((p) => [p.source.variable, process.env[p.source.variable] ?? '']));
  const snapshot = await snapshotToFile({
    config,
    client,
    agentEnabled,
    agentAppLogin: process.env.AGENT_APP_LOGIN,
    menu,
    readFx: () => readUsdThb(),
    readRequests: ({ since, until }) => readFunctionRequests({ ...analytics, since, until }),
    boards,
    write: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  });
  console.log(`Wrote the Agent Office snapshot read at ${snapshot.readAt}: agent ${snapshot.agentEnabled ? 'on' : 'off'}, ${snapshot.issues.length} issues on the board, ${snapshot.warnings.length} data warnings, money ${snapshot.money?.fund === null || snapshot.money?.fund === undefined ? 'without a ledger' : 'from the ledger'} (${snapshot.money?.reads ?? 0} history reads, ${snapshot.money?.warnings?.length ?? 0} money warnings).`);
} catch (error) {
  console.error(`The Agent Office snapshot was not written: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
