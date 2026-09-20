#!/usr/bin/env node
// Bundle-completeness gate.
//
// Usage: node check-bundle.js <bundle-dir>
//
// Attribution that lives only in a workflow step is attribution that quietly
// stops shipping the day someone reorders the steps. This checks the assembled
// bundle directory — the thing that actually becomes the zip — for every file
// the licenses oblige us to ship, and for two things that must NOT be there.
//
// The obligations, each traceable to a source:
//   COPYING.LGPLv2.1          LGPL-2.1 §6: "You must supply a copy of this
//                             License." (LGPL-2.1 does not pull in the GPL text
//                             the way LGPLv3 §4(b) does — one text is enough.)
//   FFmpeg-LICENSE.md         upstream's authoritative per-file licence map,
//                             and the only place stating the IJG condition.
//   COPYING.MinGW-w64-runtime.txt
//                             its own preamble: "Some parts of the runtime are
//                             under licenses which require that the copyright
//                             and license notices are included when
//                             distributing the code in binary form."
//   zlib-LICENSE.txt          zlib is statically linked in (--enable-zlib).
//   winpthreads-LICENSE.txt   MSYS2's GCC is built with --enable-threads=posix,
//                             so libwinpthread is linked in even though FFmpeg
//                             itself uses w32threads. Measured, not assumed:
//                             `strings ffprobe.exe` finds its symbols.
//   RUNTIME.LIBRARY.EXCEPTION GCC RLE 3.1 — libgcc is statically linked; the
//                             exception is what makes that unencumbered, so it
//                             travels with the binary that relies on it.
//   README.md                 the index, the IJG credit, and the corresponding
//                             source directions.
//   versions.txt              without recorded versions neither the notices nor
//                             the "you may rebuild this" claim are checkable.
//
// Forbidden: ffprobe_g.exe (the unstripped link target — 3-4x the size, ships
// nothing useful) and any *.dll (the bundle is a single self-contained exe).

'use strict';
const fs = require('fs');
const path = require('path');

const bundle = process.argv[2];
if (!bundle) {
  console.error('usage: check-bundle.js <bundle-dir>');
  process.exit(2);
}

const REQUIRED = [
  'ffprobe.exe',
  'versions.txt',
  'BUNDLE-README.txt',
  'THIRD-PARTY-LICENSES/README.md',
  'THIRD-PARTY-LICENSES/texts/COPYING.LGPLv2.1',
  'THIRD-PARTY-LICENSES/texts/FFmpeg-LICENSE.md',
  'THIRD-PARTY-LICENSES/texts/COPYING.MinGW-w64-runtime.txt',
  'THIRD-PARTY-LICENSES/texts/zlib-LICENSE.txt',
  'THIRD-PARTY-LICENSES/texts/winpthreads-LICENSE.txt',
  'THIRD-PARTY-LICENSES/texts/RUNTIME.LIBRARY.EXCEPTION',
];

let failed = 0;

for (const rel of REQUIRED) {
  const p = path.join(bundle, rel);
  if (!fs.existsSync(p)) {
    console.error(`FAIL missing: ${rel}`);
    failed += 1;
  } else if (fs.statSync(p).size === 0) {
    console.error(`FAIL empty:   ${rel}`);
    failed += 1;
  } else {
    console.log(`ok   ${rel} (${fs.statSync(p).size} bytes)`);
  }
}

const all = [];
(function walk(dir, prefix = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel);
    else all.push(rel);
  }
})(bundle);

for (const f of all) {
  if (/ffprobe_g\.exe$/i.test(f)) {
    console.error(`FAIL: ${f} — the unstripped link target must not ship. Copy ffprobe.exe by name, never a glob.`);
    failed += 1;
  }
  if (/\.dll$/i.test(f)) {
    console.error(`FAIL: ${f} — the bundle is a single self-contained executable; no DLLs belong in it.`);
    failed += 1;
  }
}

// The IJG condition is a documentation obligation, so it has to be IN the
// shipped index, not merely in a workflow comment.
const index = fs.readFileSync(path.join(bundle, 'THIRD-PARTY-LICENSES', 'README.md'), 'utf8');
for (const needle of ['Independent JPEG Group', 'jrevdct.c']) {
  if (!index.includes(needle)) {
    console.error(`FAIL: THIRD-PARTY-LICENSES/README.md does not mention "${needle}" (IJG credit / modification notice)`);
    failed += 1;
  }
}

console.log(`\nbundle contains ${all.length} file(s)`);
if (failed) {
  console.error(`bundle gate FAILED: ${failed} problem(s).`);
  process.exit(1);
}
console.log('bundle gate OK');
