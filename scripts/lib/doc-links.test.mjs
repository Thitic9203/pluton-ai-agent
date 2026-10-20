// docs/sdd/repo-split/spec.md R14: every relative markdown link in docs/** resolves to a file of this
// repository; a link into pluton-timesheet is an absolute GitHub URL instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p);
    return p.endsWith('.md') ? [p] : [];
  });
}

/** Text without fenced blocks and inline code spans, where a `](x)` is not a link. */
export function proseOf(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

/** Relative link targets of a markdown text: no scheme, no pure anchor, the path part only. */
export function relativeTargets(text) {
  const out = [];
  const prose = proseOf(text);
  const inline = [...prose.matchAll(/\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1] ?? m[2]);
  const refs = [...prose.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*<?([^\s>]+)>?/gm)].map((m) => m[1]);
  for (const href of [...inline, ...refs]) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) continue;
    const path = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (path) out.push(path);
  }
  return out;
}

test('R14: the link reader skips URLs, anchors and code, and keeps relative paths', () => {
  const md = '[a](../x.md#h) [b](https://e.com/y) [c](#top) `[d](no.md)`\n```\n[e](no2.md)\n```\n[f](<sp ace.md>)\n[g]: ref.md';
  assert.deepEqual(relativeTargets(md), ['../x.md', 'sp ace.md', 'ref.md']);
});

test('R14: no relative link in docs/** points to a file missing from this repository', () => {
  const broken = [];
  for (const file of markdownFiles(join(root, 'docs'))) {
    for (const target of relativeTargets(readFileSync(file, 'utf8'))) {
      if (!existsSync(resolve(dirname(file), target))) broken.push(`${relative(root, file)} -> ${target}`);
    }
  }
  assert.deepEqual(broken, [], `${broken.length} broken relative links`);
});
