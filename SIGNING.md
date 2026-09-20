# Verifying a release

Every release ships three files next to the bundle:

| File                             | What it is                                          |
|----------------------------------|-----------------------------------------------------|
| `ffprobe-<ver>-win-x64.zip`      | the bundle                                          |
| `ffprobe-<ver>-win-x64.zip.sig`  | base64 of the raw 64-byte Ed25519 signature over it |
| `SHA256SUMS`                     | its SHA-256, in coreutils format                    |

The public key is [`signing-key.pub`](signing-key.pub) in this repository. It is
a **different key** from the one used by `gpslab/qbittorrent-nox-win-build`:
signing secrets are per-repository, and sharing one key would mean a compromise
of either bundle compromised both.

The signature is produced and then verified against the committed public key in
the same CI run, so a key-pair mismatch fails the build instead of reaching a
consumer.

## Verify by hand

```bash
sha256sum -c SHA256SUMS

openssl pkeyutl -verify \
  -pubin -inkey signing-key.pub \
  -rawin -in ffprobe-9.0.2-win-x64.zip \
  -sigfile <(base64 -d ffprobe-9.0.2-win-x64.zip.sig)
```

## Verify from Node

```js
const fs = require('fs'), crypto = require('crypto');
const zip = fs.readFileSync('ffprobe-9.0.2-win-x64.zip');
const sig = Buffer.from(fs.readFileSync('ffprobe-9.0.2-win-x64.zip.sig', 'utf8').trim(), 'base64');
const key = crypto.createPublicKey(fs.readFileSync('signing-key.pub', 'utf8'));
console.log(crypto.verify(null, zip, key, sig)); // must print true
```

This is exactly what [`.github/scripts/verify-bundle.js`](.github/scripts/verify-bundle.js)
does, and exactly what a consumer should do **before** unpacking anything.

## Rotating the key

Generate a new pair, replace the repository secret and the committed public key
in the same commit, and re-release: consumers pin the public key, so a bundle
signed with a key they do not have is simply rejected.

```bash
openssl genpkey -algorithm ed25519 -out signing-key.pem
openssl pkey -in signing-key.pem -pubout -out signing-key.pub
# gh secret set FFPROBE_SIGNING_KEY_PEM < signing-key.pem
```
