#!/usr/bin/env node
/*
 * Writes agent-office/wrangler.toml, agent-office/public/version.txt and agent-office/public/app/env.json (R48a,
 * from the environment's VITE_FIREBASE_* variables) for one Agent Office
 * environment: `node scripts/agent-office-config.mjs staging <sha>` or `... prod <sha>`. The values
 * and their tests are in scripts/lib/agent-office.mjs. Used by
 * .github/workflows/deploy-agent-office.yml right before `wrangler pages deploy`; none of the files is
 * committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGENT_OFFICE_ENVIRONMENTS, envJson, versionText, wranglerToml } from './lib/agent-office.mjs';

const [name, sha] = process.argv.slice(2);
const root = fileURLToPath(new URL('../agent-office/', import.meta.url));
try {
  const toml = wranglerToml(name);
  const version = versionText(sha);
  const firebase = envJson(name, process.env);
  writeFileSync(`${root}wrangler.toml`, toml);
  mkdirSync(`${root}public`, { recursive: true });
  writeFileSync(`${root}public/version.txt`, version);
  mkdirSync(`${root}public/app`, { recursive: true });
  writeFileSync(`${root}public/app/env.json`, firebase);
  const env = AGENT_OFFICE_ENVIRONMENTS[name];
  console.log(`Wrote agent-office/wrangler.toml for ${name}: project ${env.project}, APP_ORIGIN ${env.appOrigin}, FIREBASE_PROJECT_ID ${env.firebaseProjectId}; version.txt ${sha}; app/env.json for ${env.firebaseProjectId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
