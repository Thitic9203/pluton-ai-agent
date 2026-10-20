#!/usr/bin/env node
// Agent Office live page, T16 (docs/sdd/agent-office-live/tasks.md).
// Spec: docs/sdd/agent-office-live/spec.md R19, R37. Plan: "Carrying the 3D page over".
//
// One-off extractor: the published mock embeds its models and its HDR sky as base64 data URIs in four maps
// (EMBED_GLB, EMBED_HDR, EMBED_VEH, EMBED_CHAR). This writes each blob to its own file under public/assets/,
// rewrites the map entry to that relative path (GLTFLoader and RGBELoader take a URL the same way), copies the
// mock's textures and motion clips beside them, and records every file with its size and sha256 in
// public/assets/manifest.json. Run:
//   node scripts/agent-office-split-assets.mjs <mock index.html> <mock assets dir> <out public dir> [split html out]
// The rewritten mock HTML goes to the optional fourth path (outside public/); the live page is built from it.
// It prints the total size of the public folder against the owner's ~15 MB budget (Plan B §9a).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUDGET_BYTES = 15 * 1024 * 1024;
export const MIN_BASE64_RUN = 400;

const MIME_DIR = {
  'model/gltf-binary': ['models', '.glb'],
  'application/octet-stream': ['hdr', '.hdr']
};

/** Folder for a blob by the map it sits in: characters keep the mock's own fallback path assets/chars/. */
function placeOf(map, key, mime) {
  const [dir, ext] = MIME_DIR[mime] || ['bin', '.bin'];
  if (map === 'EMBED_CHAR') return `assets/chars/${key}.glb`;
  if (map === 'EMBED_HDR') return 'assets/hdr/sky.hdr';
  return `assets/${dir}/${key}${ext}`;
}

/**
 * Pure: find every base64 data URI of the mock, return the rewritten HTML and the blobs.
 * Throws when a base64 run of MIN_BASE64_RUN or more characters remains anywhere, so nothing is left embedded.
 */
export function splitHtml(html) {
  const blobs = [];
  let map = null;
  const mapRe = /const (EMBED_[A-Z]+)\s*=/g;
  const marks = [];
  let m;
  while ((m = mapRe.exec(html))) marks.push([m.index, m[1]]);
  const mapAt = i => { let name = null; for (const [at, n] of marks) if (at <= i) name = n; return name; };
  const uriRe = /(?:'([A-Za-z0-9_]+)'\s*:\s*)?'data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)'/g;
  const out = html.replace(uriRe, (all, key, mime, b64, at) => {
    map = mapAt(at);
    if (!map) throw new Error(`data URI at ${at} is outside the EMBED_* maps`);
    const name = key || 'sky';
    const path = placeOf(map, name, mime);
    const bytes = Buffer.from(b64, 'base64');
    blobs.push({ map, key: name, mime, path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: bytes });
    return key ? `'${key}': '${path}'` : `'${path}'`;
  });
  const left = out.match(new RegExp(`[A-Za-z0-9+/=]{${MIN_BASE64_RUN},}`));
  if (left) throw new Error(`a base64 run of ${left[0].length} characters remains at ${left.index}`);
  return { html: out, blobs };
}

function walk(dir) {
  const files = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files.push(...walk(p)); else files.push(p);
  }
  return files;
}

export function folderBytes(dir) { return walk(dir).reduce((s, f) => s + statSync(f).size, 0); }

function main([mockHtml, mockAssets, outDir, splitOut]) {
  if (!mockHtml || !mockAssets || !outDir) {
    console.error('usage: node scripts/agent-office-split-assets.mjs <mock index.html> <mock assets dir> <out public dir>');
    process.exit(2);
  }
  const { html, blobs } = splitHtml(readFileSync(mockHtml, 'utf8'));
  const manifest = [];
  for (const b of blobs) {
    const to = join(outDir, b.path); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, b.data);
    manifest.push({ path: b.path, bytes: b.bytes, sha256: b.sha256, from: `${b.map}.${b.key} (${b.mime} data URI of the mock)` });
  }
  for (const f of walk(mockAssets)) {
    const rel = 'assets/' + relative(mockAssets, f).split('\\').join('/');
    const to = join(outDir, rel); mkdirSync(dirname(to), { recursive: true }); copyFileSync(f, to);
    const data = readFileSync(f);
    manifest.push({ path: rel, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), from: 'published file of the mock' });
  }
  manifest.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(outDir, 'assets', 'manifest.json'), JSON.stringify({ source: mockHtml.split('/').slice(-3).join('/'), files: manifest }, null, 2) + '\n');
  if (splitOut) writeFileSync(splitOut, html);
  const total = folderBytes(outDir);
  console.log(`blobs ${blobs.length} · files ${manifest.length} · page ${Buffer.byteLength(html)} bytes · public ${total} bytes of budget ${BUDGET_BYTES} · ${total <= BUDGET_BYTES ? 'WITHIN' : 'OVER'} budget`);
  if (total > BUDGET_BYTES) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
