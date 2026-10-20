#!/usr/bin/env node
/*
 * `node scripts/agent-office-smoke.mjs <deployment url> <sha>`: judges a fresh Agent Office
 * deployment once it serves <sha>. The logic and its tests are in scripts/lib/agent-office-smoke.mjs.
 */
import { smoke } from './lib/agent-office-smoke.mjs';

const [url, sha] = process.argv.slice(2);
try {
  for (const line of await smoke({ url, sha })) console.log(line);
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
