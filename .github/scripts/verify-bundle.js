#!/usr/bin/env node
// Verify a signed release bundle against the repo's public key.
//
// Usage: node verify-bundle.js <path-to-zip> [path-to-public-key-pem]
//
// Defaults the public key to ./signing-key.pub. Recomputes and checks:
//   1. the raw Ed25519 signature in <zip>.sig against the public key
//   2. the sha256 recorded in SHA256SUMS (if present next to the zip)
//
// This is the exact check a consumer performs: crypto.verify(null, bytes,
// publicKey, sig). Running it in CI right after signing proves the signing key
// and the committed public key are a matching pair — the one failure mode that
// would otherwise be discovered by the consumer, after publication.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const zipPath = process.argv[2];
const pubPath = process.argv[3] || 'signing-key.pub';
if (!zipPath) {
  console.error('usage: verify-bundle.js <path-to-zip> [path-to-public-key-pem]');
  process.exit(2);
}

const zip = fs.readFileSync(zipPath);
const name = path.basename(zipPath);

const sigB64 = fs.readFileSync(`${zipPath}.sig`, 'utf8').trim();
const sig = Buffer.from(sigB64, 'base64');
if (sig.length !== 64) {
  console.error(`unexpected signature length ${sig.length} (expected 64 raw Ed25519 bytes)`);
  process.exit(1);
}

const publicKey = crypto.createPublicKey(fs.readFileSync(pubPath, 'utf8'));
if (publicKey.asymmetricKeyType !== 'ed25519') {
  console.error(`expected an ed25519 public key, got ${publicKey.asymmetricKeyType}`);
  process.exit(1);
}

const ok = crypto.verify(null, zip, publicKey, sig);
console.log(`signature check against ${pubPath}: ${ok}`);
if (!ok) {
  console.error('SIGNATURE VERIFICATION FAILED — key pair mismatch or corrupted bundle');
  process.exit(1);
}

const sumsPath = path.join(path.dirname(zipPath), 'SHA256SUMS');
if (fs.existsSync(sumsPath)) {
  const want = fs.readFileSync(sumsPath, 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\s+/))
    .find((cols) => cols[cols.length - 1] === name);
  if (!want) {
    console.error(`SHA256SUMS has no entry for ${name}`);
    process.exit(1);
  }
  const got = crypto.createHash('sha256').update(zip).digest('hex');
  if (got !== want[0]) {
    console.error(`sha256 mismatch: SHA256SUMS=${want[0]} actual=${got}`);
    process.exit(1);
  }
  console.log(`sha256 check against SHA256SUMS: ok (${got})`);
}

console.log('self-verification OK');
