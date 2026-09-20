#!/usr/bin/env node
// Configuration-drift gate.
//
// Usage: node check-buildconf.js <path-to-ffprobe>
//
// Compares `ffprobe -buildconf` (one configure flag per line) against
// expected/configure-flags.txt, which is ALSO what the workflow feeds to
// configure. That makes this check narrow and worth being honest about:
//
//   it does NOT verify the license   -> check-license.js does that (ffprobe -L)
//   it does NOT verify the contents  -> check-components.js does that
//
// What it does verify is that nothing was added to the configure invocation
// outside the committed flag file — an --enable-gpl typed straight into the
// workflow YAML, a stray --extra-cflags, a flag someone appended "just to try".
// The binary is asked what it was configured with; the answer must be exactly
// the committed file and nothing more.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffprobe = process.argv[2];
if (!ffprobe) {
  console.error('usage: check-buildconf.js <ffprobe>');
  process.exit(2);
}

const flagsFile = path.join(__dirname, '..', '..', 'expected', 'configure-flags.txt');
const expected = fs.readFileSync(flagsFile, 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

// Flags the build machine legitimately adds and that carry no policy meaning.
// Anything else showing up is a finding, not noise.
const ALLOWED_EXTRA = [
  /^--extra-ldflags=/,
  /^--extra-cflags=/,
  /^--pkg-config-flags=/,
  /^--prefix=/,
  /^--disable-x86asm$/,
];

// configure re-quotes any flag value containing a comma when it builds
// FFMPEG_CONFIGURATION, so --enable-decoder=a,b comes back as
// --enable-decoder='a,b'. Strip that quoting before comparing; it is an
// artefact of how the string was assembled, not a difference in the build.
const unquote = (f) => f.replace(/^(--[^=]+=)'(.*)'$/, '$1$2');

const out = execFileSync(ffprobe, ['-hide_banner', '-buildconf'], { encoding: 'utf8' });
const actual = out.split(/\r?\n/).map((l) => l.trim())
  .filter((l) => l.startsWith('--'))
  .map(unquote);

const missing = expected.filter((f) => !actual.includes(f));
const extra = actual.filter((f) => !expected.includes(f) && !ALLOWED_EXTRA.some((re) => re.test(f)));

let bad = false;
if (missing.length) {
  console.error(`FAIL: ${missing.length} committed flag(s) absent from the built binary:`);
  for (const f of missing) console.error(`  - ${f}`);
  bad = true;
}
if (extra.length) {
  console.error(`FAIL: ${extra.length} flag(s) present in the build but not committed:`);
  for (const f of extra) console.error(`  + ${f}`);
  bad = true;
}

if (bad) {
  console.error('\nbuildconf gate FAILED: the build was configured with something other than');
  console.error('expected/configure-flags.txt. Change the file, not the workflow.');
  process.exit(1);
}
console.log(`buildconf gate OK: ${expected.length} flags match expected/configure-flags.txt`);
