#!/usr/bin/env node
// "No patches" invariant.
//
// Usage: node check-no-patches.js [repo-root]
//
// This repository's LICENSE says MIT, and that statement is only defensible
// while the repository contains no FFmpeg code. A patch file against FFmpeg is
// a derivative of LGPL-2.1 sources: the moment one lands here, MIT stops
// covering the repository and the README's "no patches are applied; the build
// uses the pinned upstream tarball verbatim" becomes false.
//
// The guard is deliberately dumb and absolute. If patching upstream ever
// becomes necessary, that is a licensing decision to be made explicitly — by
// relicensing the patch directory and rewriting the README — not by adding a
// file and watching CI stay green.

'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.join(__dirname, '..', '..');
const SKIP = new Set(['.git', 'node_modules', 'fixtures']);

const found = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(patch|diff)$/i.test(e.name)) found.push(path.relative(root, p));
  }
})(root);

if (found.length) {
  console.error(`FAIL: ${found.length} patch file(s) in the repository:`);
  for (const f of found) console.error(`  - ${f}`);
  console.error('\nA patch against FFmpeg is a derivative of LGPL-2.1 code; the MIT LICENSE');
  console.error('in this repository does not cover it, and the README claim that upstream is');
  console.error('used verbatim would be false. Remove it, or make the licensing change first.');
  process.exit(1);
}
console.log('no-patches invariant OK');
