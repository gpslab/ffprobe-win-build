#!/usr/bin/env node
// Sign a release bundle with Ed25519 and emit sidecar files.
//
// Usage: node sign-bundle.js <path-to-zip>
//
// Reads the Ed25519 private key (PEM) from FFPROBE_SIGNING_KEY_PEM (a GitHub
// Actions secret). The key is never written to disk and never logged. The key
// pair is specific to THIS repository — it is deliberately not shared with
// gpslab/qbittorrent-nox-win-build, so a compromise of one bundle's signing key
// does not extend to the other.
//
// Produces, next to the zip:
//   <zip>.sig    base64 of the raw 64-byte Ed25519 signature over the zip bytes
//   SHA256SUMS   "<hex sha256>  <zip basename>" (coreutils-compatible)

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('usage: sign-bundle.js <path-to-zip>');
  process.exit(2);
}

const pem = process.env.FFPROBE_SIGNING_KEY_PEM;
if (!pem || !pem.includes('PRIVATE KEY')) {
  console.error('FFPROBE_SIGNING_KEY_PEM is missing or is not a PEM private key');
  process.exit(1);
}

let privateKey;
try {
  privateKey = crypto.createPrivateKey(pem);
} catch (e) {
  console.error('failed to parse private key from FFPROBE_SIGNING_KEY_PEM:', e.message);
  process.exit(1);
}
if (privateKey.asymmetricKeyType !== 'ed25519') {
  console.error(`expected an ed25519 private key, got ${privateKey.asymmetricKeyType}`);
  process.exit(1);
}

const zip = fs.readFileSync(zipPath);
const name = path.basename(zipPath);

const sig = crypto.sign(null, zip, privateKey); // raw 64-byte Ed25519 signature
if (sig.length !== 64) {
  console.error(`unexpected signature length ${sig.length} (expected 64)`);
  process.exit(1);
}
fs.writeFileSync(`${zipPath}.sig`, `${sig.toString('base64')}\n`);

const sha = crypto.createHash('sha256').update(zip).digest('hex');
const sumsPath = path.join(path.dirname(zipPath), 'SHA256SUMS');
fs.writeFileSync(sumsPath, `${sha}  ${name}\n`);

console.log(`signed ${name} (${zip.length} bytes)`);
console.log(`  sha256      : ${sha}`);
console.log(`  sig (base64): ${sig.toString('base64')}`);
