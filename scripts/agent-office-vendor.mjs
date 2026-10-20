// One-off: copy the exact third-party files the page loads into agent-office/public/vendor/ (plan.md "Carrying the 3D
// page over"; review B3). Sources are the npm tarballs unpacked in <dl>. Writes vendor/manifest.json with sizes,
// sha256 and every edit made to a copied file.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
const [dl, pub] = process.argv.slice(2);
const out = join(pub, 'vendor');
rmSync(out, { recursive: true, force: true });
const files = [];
const sha = b => createHash('sha256').update(b).digest('hex');
function put(rel, data, from, edits = []) {
  const to = join(out, rel); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, data);
  files.push({ path: 'vendor/' + rel, bytes: Buffer.byteLength(data), sha256: sha(data), from, edits });
}

// three@0.170.0: the core module and every addon the page imports, plus what they import in turn.
const T = join(dl, 'three-0.170.0', 'package');
const ENTRY = ['build/three.module.js', ...['controls/OrbitControls.js', 'environments/RoomEnvironment.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
  'postprocessing/GTAOPass.js', 'postprocessing/SMAAPass.js', 'postprocessing/OutputPass.js', 'postprocessing/UnrealBloomPass.js', 'postprocessing/ShaderPass.js',
  'utils/BufferGeometryUtils.js', 'loaders/GLTFLoader.js', 'libs/meshopt_decoder.module.js', 'loaders/RGBELoader.js', 'utils/SkeletonUtils.js', 'objects/Sky.js'].map(p => 'examples/jsm/' + p)];
const seen = new Set(), queue = [...ENTRY];
while (queue.length) {
  const rel = queue.shift(); if (seen.has(rel)) continue; seen.add(rel);
  const text = readFileSync(join(T, rel), 'utf8');
  for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2] || m[3];
    if (spec === 'three') continue; // the import map points it at build/three.module.js, already an entry
    if (!spec.startsWith('.')) throw new Error(`${rel} imports ${spec}, which the import map does not cover`);
    queue.push(posix.normalize(posix.join(posix.dirname(rel), spec)));
  }
}
for (const rel of [...seen].sort()) put('three@0.170.0/' + rel, readFileSync(join(T, rel)), 'npm three@0.170.0 package/' + rel);

// GSAP 3.12.5: the file the mock's script tag loads from cdnjs (gsap/3.12.5/gsap.min.js) is dist/gsap.min.js.
put('gsap@3.12.5/gsap.min.js', readFileSync(join(dl, 'gsap-3.12.5', 'package', 'dist', 'gsap.min.js')), 'npm gsap@3.12.5 package/dist/gsap.min.js');

// Firebase 12.19.0 (the app's pinned version): the same ES module builds gstatic serves, shipped in the npm package.
const F = join(dl, 'firebase-12.19.0', 'package');
const stripMap = s => s.replace(/\n\/\/# sourceMappingURL=[^\n]+\n?$/, '\n');
{
  const app = stripMap(readFileSync(join(F, 'firebase-app.js'), 'utf8'));
  put('firebase@12.19.0/firebase-app.js', app, 'npm firebase@12.19.0 package/firebase-app.js', ['removed the sourceMappingURL comment (the map is not shipped)']);
  const from = 'from"https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"';
  let auth = readFileSync(join(F, 'firebase-auth.js'), 'utf8');
  if (auth.split(from).length !== 2) throw new Error('firebase-auth.js: the gstatic import of firebase-app.js was not found exactly once');
  auth = stripMap(auth.replace(from, 'from"./firebase-app.js"'));
  put('firebase@12.19.0/firebase-auth.js', auth, 'npm firebase@12.19.0 package/firebase-auth.js', ['import of https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js pointed at ./firebase-app.js', 'removed the sourceMappingURL comment (the map is not shipped)']);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log('vendored', files.length, 'files,', files.reduce((s, f) => s + f.bytes, 0), 'bytes');
