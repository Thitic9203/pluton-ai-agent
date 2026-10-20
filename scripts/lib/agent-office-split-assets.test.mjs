// T16 test. Spec: docs/sdd/agent-office-live/spec.md R19, R37.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitHtml, folderBytes, BUDGET_BYTES, MIN_BASE64_RUN } from '../agent-office-split-assets.mjs';

const b64 = n => Buffer.alloc(n, 7).toString('base64');
const FIXTURE = `<script>
const EMBED_GLB = {'table': 'data:model/gltf-binary;base64,${b64(600)}', 'kettle': 'data:model/gltf-binary;base64,${b64(500)}'};
const EMBED_HDR = 'data:application/octet-stream;base64,${b64(700)}';
const EMBED_CHAR = { 'xbot': 'data:model/gltf-binary;base64,${b64(800)}' };
</script>`;

test('every blob is listed with its size, and the rebuilt HTML holds no long base64 run', () => {
  const { html, blobs } = splitHtml(FIXTURE);
  assert.deepEqual(blobs.map(b => [b.path, b.bytes]), [
    ['assets/models/table.glb', 600], ['assets/models/kettle.glb', 500], ['assets/hdr/sky.hdr', 700], ['assets/chars/xbot.glb', 800]
  ]);
  for (const b of blobs) assert.match(b.sha256, /^[0-9a-f]{64}$/);
  assert.equal(new RegExp(`[A-Za-z0-9+/=]{${MIN_BASE64_RUN},}`).test(html), false);
  assert.match(html, /'table': 'assets\/models\/table.glb'/);
  assert.match(html, /const EMBED_HDR = 'assets\/hdr\/sky.hdr'/);
});

test('a data URI outside the EMBED maps is refused, never silently kept', () => {
  assert.throws(() => splitHtml(`const X = 'data:model/gltf-binary;base64,${b64(600)}';`), /outside the EMBED_\* maps/);
});

test('a long base64 run that is not a data URI fails the split', () => {
  assert.throws(() => splitHtml(`const EMBED_GLB = {}; const raw = '${b64(600)}';`), /base64 run/);
});

// The committed output: the manifest lists every file under public/assets with its real size, and public/ fits the budget.
const pub = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'agent-office', 'public');
test('the committed public folder matches its manifest and stays within ~15 MB', () => {
  assert.ok(existsSync(join(pub, 'assets', 'manifest.json')), 'public/assets/manifest.json is missing');
  const { files } = JSON.parse(readFileSync(join(pub, 'assets', 'manifest.json'), 'utf8'));
  assert.ok(files.length > 0);
  for (const f of files) assert.equal(readFileSync(join(pub, f.path)).length, f.bytes, f.path);
  assert.ok(folderBytes(pub) <= BUDGET_BYTES, `public is ${folderBytes(pub)} bytes`);
});
