#!/usr/bin/env node
// Composition gate — the single most important check in this repository.
//
// Usage: node check-components.js <path-to-ffprobe> <path-to-ffbuild/config.mak>
//
// WHY THIS EXISTS. FFmpeg's configure expands `--enable-decoder=a,b,c` into a
// single glob pattern and warns "did not match anything" only when the WHOLE
// list resolves to nothing (configure:4736). One misspelled name among twenty
// passes silently: the build is green, the release is signed, and the codec is
// simply absent. That is not a hypothetical — the first draft of this build's
// flag list carried four dead names (`mpeg` for `mpegps`, `dts` for `dca`,
// `mov_text` for `movtext`, `hdmv_pgs_subtitle` for `pgssub`). A human reading
// the flag list cannot catch this. A machine can.
//
// TWO SOURCES OF TRUTH, ON PURPOSE:
//
//   1. ffbuild/config.mak — configure's RESOLVED state after dependency
//      resolution. This is the only way to check parsers at all: ffprobe has no
//      `-parsers` CLI option (it has -decoders/-demuxers/-bsfs/-protocols and
//      no more), so a CLI-only gate would leave the parser list — the most
//      failure-prone part of the configuration — completely unchecked.
//   2. the built binary's own `-decoders`/`-demuxers`/`-bsfs`/`-protocols`.
//      config.mak says what configure decided; the binary says what actually
//      got linked and registered. A component can be lost between the two.
//
// The check is "every expected name is present", not set equality: upstream
// adding a component must not turn the build red.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffprobe = process.argv[2];
const configMak = process.argv[3];
if (!ffprobe || !configMak) {
  console.error('usage: check-components.js <ffprobe> <ffbuild/config.mak>');
  process.exit(2);
}

const expectedDir = path.join(__dirname, '..', '..', 'expected', 'components');

function readExpected(kind) {
  const file = path.join(expectedDir, `${kind}.txt`);
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function run(...args) {
  return execFileSync(ffprobe, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

// --- source 1: configure's resolved state -----------------------------------
const mak = fs.readFileSync(configMak, 'utf8');
const resolved = {};
for (const suffix of ['DECODER', 'DEMUXER', 'PARSER', 'BSF', 'PROTOCOL']) {
  const re = new RegExp(`^CONFIG_([A-Z0-9_]+)_${suffix}=yes$`, 'gm');
  const names = new Set();
  let m;
  while ((m = re.exec(mak)) !== null) names.add(m[1].toLowerCase());
  resolved[suffix.toLowerCase()] = names;
}

// --- source 2: the built binary ---------------------------------------------
// `-decoders`: a flags column of non-space chars, then the name.
function parseCodecList(out) {
  const names = new Set();
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*-{3,}\s*$/.test(l));
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*\S{6}\s+(\S+)/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

// `-demuxers`: " D   name,alias   Description". The flag column is three
// characters wide with unset flags rendered as SPACES, not dots — matching
// [D.][E.][d.] finds nothing at all. The name column may carry comma-separated
// aliases (matroska,webm), each of which counts as present.
function parseFormatList(out) {
  const names = new Set();
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*-{2,}\s*$/.test(l));
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*[DEd. ]{1,3}\s+(\S+)/.exec(line);
    if (m) for (const n of m[1].split(',')) names.add(n);
  }
  return names;
}

// The two namespaces do not always agree: configure knows COMPONENTS, the
// binary prints the AVCodec/AVInputFormat NAME, and for a handful of codecs
// they differ. ffprobe itself spells the relationship out in the description
// column ("MPEG-4 part 2 Microsoft variant version 3 (codec msmpeg4v3)").
// Listed here rather than pattern-matched, so that a new divergence shows up as
// a gate failure and gets looked at instead of being absorbed by a heuristic.
const CLI_ALIASES = {
  msmpeg4v3: 'msmpeg4',
  movtext: 'mov_text',
  ra_144: 'real_144',
  ra_288: 'real_288',
  mpegps: 'mpeg',
};

function parsePlainList(out, header) {
  const names = new Set();
  let seen = false;
  for (const line of out.split(/\r?\n/)) {
    if (!seen) { if (line.includes(header)) seen = true; continue; }
    const t = line.trim();
    if (!t || t.endsWith(':')) continue;
    names.add(t);
  }
  return names;
}

const binary = {
  decoder: parseCodecList(run('-decoders')),
  demuxer: parseFormatList(run('-demuxers')),
  bsf: parsePlainList(run('-bsfs'), 'Bitstream filters:'),
  protocol: parsePlainList(run('-protocols'), 'Input:'),
};

// --- compare ----------------------------------------------------------------
let failed = 0;

function check(kind, expected, actual, source) {
  const present = (n) => actual.has(n) || (CLI_ALIASES[n] && actual.has(CLI_ALIASES[n]));
  const missing = expected.filter((n) => !present(n));
  const label = `${kind} (${source})`;
  if (missing.length) {
    console.error(`FAIL ${label}: ${missing.length} expected name(s) absent: ${missing.join(', ')}`);
    failed += missing.length;
  } else {
    console.log(`ok   ${label}: all ${expected.length} expected names present`);
  }
}

for (const kind of ['decoder', 'demuxer', 'parser', 'bsf', 'protocol']) {
  const expected = readExpected(`${kind}s`);
  check(kind, expected, resolved[kind], 'configure resolved state');
  if (binary[kind]) check(kind, expected, binary[kind], 'built binary');
}

if (failed) {
  console.error(`\ncomposition gate FAILED: ${failed} missing component(s).`);
  console.error('Either a name in the configure flag list is wrong/renamed upstream, or a');
  console.error('component was dropped by an unsatisfied dependency. configure does not');
  console.error('report either case as an error — that is exactly why this gate exists.');
  process.exit(1);
}
console.log('\ncomposition gate OK');
