#!/usr/bin/env node
// Non-ASCII name / long path gate (Windows only).
//
// Usage: node check-longpath.js <path-to-ffprobe> <path-to-a-fixture>
//
// Anime releases are not stored in C:\media\a.mkv. They sit in folders named
// after the group and the title, in Japanese, Russian and brackets, nested
// several levels below a drive root — routinely past the 260-character MAX_PATH
// that a lot of Windows software still quietly breaks on. A media prober that
// works in CI and returns "file not found" on a real library is worse than no
// prober, because the failure looks like missing media rather than a broken
// tool.
//
// The check copies a fixture to a deep directory under a non-ASCII name,
// probes it, and requires the result to be identical to the short-path probe
// except for the filename itself.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ffprobe = process.argv[2];
const fixture = process.argv[3];
if (!ffprobe || !fixture) {
  console.error('usage: check-longpath.js <ffprobe> <fixture>');
  process.exit(2);
}

function probe(file) {
  const out = execFileSync(ffprobe, [
    '-hide_banner', '-loglevel', 'error',
    '-show_format', '-show_streams', '-print_format', 'json', file,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(out);
  delete json.format.filename;   // the only field that legitimately differs
  return json;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffprobe-longpath-'));

// Nest until the FULL path — directories plus the file name — comfortably
// exceeds MAX_PATH (260). Measure the finished path rather than estimating the
// file name's contribution: the first version of this check guessed, landed on
// 219 characters, and would have reported success while proving nothing.
const segment = '[Fansub]_テスト_Тест_Сезон-01_[BDRip_1080p_HEVC]';
const fileName = `テスト_Тест_[1080p]${path.extname(fixture)}`;
let dir = root;
while (path.join(dir, segment, fileName).length < 290) {
  dir = path.join(dir, segment);
}
fs.mkdirSync(dir, { recursive: true });

const target = path.join(dir, fileName);
fs.copyFileSync(fixture, target);

console.log(`short path : ${fixture}`);
console.log(`long path  : ${target}`);
console.log(`length     : ${target.length} characters (MAX_PATH is 260)`);
if (target.length <= 260) {
  console.error('FAIL: the constructed path is not actually longer than MAX_PATH — the check would prove nothing');
  process.exit(1);
}

let expected;
let actual;
try {
  expected = probe(fixture);
} catch (e) {
  console.error(`FAIL: probing the short path failed: ${e.message.split('\n')[0]}`);
  process.exit(1);
}
try {
  actual = probe(target);
} catch (e) {
  console.error(`FAIL: probing the long non-ASCII path failed: ${e.message.split('\n')[0]}`);
  console.error('ffprobe cannot read files where real users keep them.');
  process.exit(1);
}

// `size`/`duration` are identical for a byte-for-byte copy; anything else
// differing means the prober saw a different file or lost information.
const strip = (j) => JSON.stringify({ ...j, format: { ...j.format, size: undefined } });
if (strip(expected) !== strip(actual)) {
  console.error('FAIL: the long non-ASCII path produced a different result than the short path');
  console.error('--- short ---'); console.error(strip(expected));
  console.error('--- long ---');  console.error(strip(actual));
  process.exit(1);
}

fs.rmSync(root, { recursive: true, force: true });
console.log('long-path / non-ASCII gate OK: identical result from both paths');
