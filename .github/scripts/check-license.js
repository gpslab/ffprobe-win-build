#!/usr/bin/env node
// License gate.
//
// Usage: node check-license.js <path-to-ffprobe>
//
// Compares `ffprobe -L` against expected/license.txt verbatim.
//
// WHY NOT THE `configuration:` STRING. The obvious gate — "compare the
// configuration line from `ffprobe -version` against a copy committed here" —
// is a tautology. FFMPEG_CONFIGURATION is assembled literally from the argv the
// workflow passed to configure (configure:4553), so such a gate compares the
// workflow's own string with a copy of itself. It catches exactly one mistake
// ("edited the workflow, forgot the reference file") and is blind to the thing
// it would be written for: a drift in what those flags actually RESOLVE to.
//
// `ffprobe -L` prints the license that was actually compiled in: show_license()
// selects the text by CONFIG_NONFREE / CONFIG_GPLV3 / CONFIG_GPL / CONFIG_LGPLV3
// and falls through to LGPL-2.1 (fftools/opt_common.c:79). If --enable-gpl or
// --enable-version3 ever leaks in — directly, or pulled by some future
// dependency — this output changes and the build goes red.
//
// The reference text is committed from upstream source, NOT captured from the
// first green run. A gate that learns its own expectation is the tautology
// above wearing a different hat.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffprobe = process.argv[2];
if (!ffprobe) {
  console.error('usage: check-license.js <ffprobe>');
  process.exit(2);
}

const expectedPath = path.join(__dirname, '..', '..', 'expected', 'license.txt');
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

const expected = norm(fs.readFileSync(expectedPath, 'utf8'));
const actual = norm(execFileSync(ffprobe, ['-hide_banner', '-L'], { encoding: 'utf8' }));

if (actual !== expected) {
  console.error('LICENSE GATE FAILED: `ffprobe -L` does not match expected/license.txt\n');
  console.error('--- expected ---');
  console.error(expected);
  console.error('--- actual ---');
  console.error(actual);
  if (/General Public License/.test(actual) && !/Lesser/.test(actual)) {
    console.error('\nThe build is GPL, not LGPL. --enable-gpl (or a GPL-only component) leaked in.');
  }
  if (/nonfree/.test(actual)) {
    console.error('\nThe build has nonfree parts compiled in and is NOT legally redistributable.');
  }
  process.exit(1);
}

console.log('license gate OK: ffprobe -L matches the expected LGPL-2.1-or-later text');
