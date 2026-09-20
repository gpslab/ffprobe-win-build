#!/usr/bin/env node
// Field-coverage gate.
//
// Usage: node check-fields.js <path-to-ffprobe> [fixtures-dir]
//
// WHAT IT PROVES. A trimmed FFmpeg does not fail loudly when a piece is
// missing: avformat_find_stream_info() simply leaves profile / level / pix_fmt /
// sample_fmt / channel_layout unset, and ffprobe prints a stream block with
// holes in it. Worse, the extract_extradata bitstream filter — which
// --disable-everything switches off along with every other bsf — is looked up
// by name in libavformat/demux.c and, when absent, skipped with `goto finish`
// and NO log line at any verbosity. For h264/hevc/av1/mpeg2video/mpeg4/vc1 in
// MPEG-TS that silently costs the entire extradata-derived half of the stream
// description. This gate is the only thing standing between that failure and a
// signed release.
//
// WHAT IT DOES NOT PROVE. The fixtures are synthetic, so the gate covers only
// codecs upstream FFmpeg can actually ENCODE. Three of the decoders in this
// build have no encoder anywhere in FFmpeg (pgssub, vc1, wmv3) and one more
// cannot be produced from a text subtitle source (dvdsub). They are listed in
// notCoveredBySynthetics in expected-fields.json and are NOT checked here.
// A green run of this gate is not a statement about real-world rips.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ffprobe = process.argv[2];
const fixturesDir = process.argv[3] || path.join(__dirname, '..', '..', 'fixtures');
if (!ffprobe) {
  console.error('usage: check-fields.js <ffprobe> [fixtures-dir]');
  process.exit(2);
}

const spec = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'expected', 'expected-fields.json'), 'utf8'));

const EMPTY = new Set(spec.emptyValues);
const isEmpty = (v) => v === undefined || v === null || EMPTY.has(String(v).trim());

function probe(file) {
  const out = execFileSync(ffprobe, [
    '-hide_banner', '-loglevel', 'error',
    '-show_format', '-show_streams', '-print_format', 'json', file,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures += 1; };

for (const fx of spec.fixtures) {
  const file = path.join(fixturesDir, fx.file);
  if (!fs.existsSync(file)) { fail(`${fx.file}: fixture missing`); continue; }

  let json;
  try {
    json = probe(file);
  } catch (e) {
    fail(`${fx.file}: ffprobe exited non-zero: ${e.message.split('\n')[0]}`);
    continue;
  }

  const req = { ...spec.requiredFields, ...(fx.require || {}) };

  // format block
  for (const f of req.format || []) {
    if (isEmpty(json.format?.[f])) fail(`${fx.file}: format.${f} is empty or absent`);
  }

  const streams = json.streams || [];
  const codecs = streams.map((s) => s.codec_name);
  for (const want of fx.expectCodecs) {
    if (!codecs.includes(want)) {
      fail(`${fx.file}: expected a ${want} stream, got [${codecs.join(', ')}]`);
    }
  }

  for (const [i, s] of streams.entries()) {
    const scope = s.codec_type; // video | audio | subtitle
    for (const f of req[scope] || []) {
      if (isEmpty(s[f])) fail(`${fx.file}: stream #${i} (${scope}/${s.codec_name}).${f} is empty or absent`);
    }
    for (const t of (fx.requireTags?.[scope] || [])) {
      if (isEmpty(s.tags?.[t])) fail(`${fx.file}: stream #${i} (${scope}/${s.codec_name}).tags.${t} is empty or absent`);
    }
    if (fx.requireDisposition?.[scope]) {
      for (const d of fx.requireDisposition[scope]) {
        if (s.disposition?.[d] !== 1) fail(`${fx.file}: stream #${i} (${scope}) disposition.${d} is not set`);
      }
    }
  }

  if (!failures) console.log(`ok   ${fx.file}: ${streams.length} stream(s) [${codecs.join(', ')}]`);
  else console.log(`--   ${fx.file}: ${streams.length} stream(s) [${codecs.join(', ')}]`);
}

const nc = spec.notCoveredBySynthetics;
console.log('\nnot exercised by any fixture (their presence is checked by the composition gate,');
console.log('their output by nothing here):');
console.log(`  no encoder exists upstream        : ${nc.noEncoderExistsUpstream.join(', ') || '—'}`);
console.log(`  cannot be made from a text source : ${nc.cannotBeTranscodedFromText.join(', ') || '—'}`);
console.log(`  no fixture written yet            : ${nc.noFixtureYet.join(', ') || '—'}`);

if (failures) {
  console.error(`\nfield-coverage gate FAILED: ${failures} problem(s).`);
  process.exit(1);
}
console.log('field-coverage gate OK');
