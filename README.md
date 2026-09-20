# ffprobe-win-build

CI build of a **minimal, statically linked `ffprobe.exe` for Windows x64**,
compiled from a pinned upstream [FFmpeg](https://ffmpeg.org/) release tarball
and published as a signed bundle on the [Releases](../../releases) page.

This is an **unofficial** build of `ffprobe`, a program of the FFmpeg project.
It is not affiliated with or endorsed by the FFmpeg project. This repository
adds no functionality of its own: it is a build recipe, in the spirit of a
distribution packaging script.

## Why build it instead of using a published one

Published Windows FFmpeg builds are full builds: every codec, every external
library, GPL-configured, 80–180 MB. Putting one inside an installer makes the
person shipping that installer a distributor of all of it — with the obligation
to keep the corresponding source of some sixty dependencies available for as
long as the binary is distributed, on servers they do not control, with no
source tarballs published in the first place.

Building it here inverts that. The configuration carries no `--enable-gpl`, no
`--enable-version3`, no `--enable-nonfree` and no external libraries other than
zlib, so the binary is **LGPL-2.1-or-later** and its corresponding source is a
single upstream tarball — attached to the very same release, not linked to
someone else's server. The result is a few megabytes and does one job: read
technical metadata out of a local media file.

## What is built

| File                    | Purpose                                                        |
|-------------------------|----------------------------------------------------------------|
| `ffprobe.exe`           | single self-contained executable, no DLLs                      |
| `versions.txt`          | FFmpeg version and tarball hash, toolchain versions, configure flags |
| `THIRD-PARTY-LICENSES/` | full licence texts for every component linked in               |

Pinned versions and the complete flag list live in
[`expected/configure-flags.txt`](expected/configure-flags.txt), which the
workflow reads directly — the build and its own drift gate cannot disagree
about what was requested.

| Component | Version |
|-----------|---------|
| FFmpeg    | `9.0.2` (release tarball from ffmpeg.org, SHA-256 pinned in the workflow) |
| Toolchain | MSYS2 **UCRT64** + mingw-w64 GCC, fully static (`-static`) |

UCRT64 rather than MINGW64: MSYS2 deprecated the msvcrt-based MINGW64
environment in March 2026, and the UCRT ships with Windows 10 and later.

The resulting `ffprobe.exe` is 10.4 MB and imports only `KERNEL32.dll`,
`SHELL32.dll`, `bcrypt.dll` and the `api-ms-win-crt-*` UCRT set — nothing that
is not part of Windows. (`ffprobe_g.exe`, the unstripped link target sitting
next to it in the build directory, is 48.5 MB; that is why the bundle step
copies by name and the bundle gate refuses the file.) MSYS2's GCC is built with
`--enable-threads=posix`, so `libwinpthread` ends up statically linked in even
though FFmpeg itself uses w32threads — measured with `strings`, not assumed, and
its licence ships accordingly.

## The gates, and why each exists

A trimmed FFmpeg build fails quietly. That is the whole problem this repository
is organised around, so most of the CI is gates rather than build steps. Each
one fails the run.

**Composition** ([`check-components.js`](.github/scripts/check-components.js)) —
the important one. FFmpeg's `configure` expands `--enable-decoder=a,b,c` into a
single glob and warns "did not match anything" only when the *whole* list
resolves to nothing. One misspelled name among twenty passes silently: green
build, signed release, missing codec. This is not hypothetical — the first draft
of this configuration carried four dead names (`mpeg` for `mpegps`, `dts` for
`dca`, `mov_text` for `movtext`, `hdmv_pgs_subtitle` for `pgssub`), and a fifth
(`flv1` for `flv`) was caught by this gate while it was being written. Every
requested name is checked against both configure's resolved state and the built
binary's own listings.

Note that `ffprobe` has **no `-parsers` option** — only `-decoders`,
`-demuxers`, `-bsfs` and `-protocols`. Parsers are therefore checked against
`ffbuild/config.mak`, configure's resolved output. Without that source the most
failure-prone part of the configuration would go unchecked, because decoders do
*not* reliably pull in their parsers: `ac3`, `mlp`, `truehd` and `vp9` do,
while `h264`, `hevc`, `av1`, `mpeg4`, `mpeg2video`, `vc1`, `aac`, `opus` and
`vorbis` do not.

**License** ([`check-license.js`](.github/scripts/check-license.js)) — compares
`ffprobe -L` against a reference text taken from upstream source. Deliberately
*not* a comparison of the `configuration:` line from `ffprobe -version`: that
string is assembled literally from the argv the workflow passed in, so checking
it against a copy stored in the same repository is a tautology. `-L` reports the
licence that was actually compiled in.

**Configuration drift** ([`check-buildconf.js`](.github/scripts/check-buildconf.js))
— asserts the binary was configured with exactly the committed flag file and
nothing appended in the workflow YAML.

**Self-containment** ([`check-imports.js`](.github/scripts/check-imports.js)) —
every import must be an OS-provided library. One forgotten `-static` turns
`libgcc_s_seh-1.dll` into a dependency that exists on the build machine and on
no user's machine.

**Field coverage** ([`check-fields.js`](.github/scripts/check-fields.js)) — runs
the built `ffprobe` over the committed synthetic fixtures and requires the
fields in [`expected/expected-fields.json`](expected/expected-fields.json) to be
present and non-empty. `avformat_find_stream_info()` does not fail when a piece
is absent, it just leaves fields unset, and the `extract_extradata` lookup in
`libavformat/demux.c` is skipped with no log line at any verbosity when the
filter was not built.

That last failure needed measuring rather than assuming. A build made without
`--enable-bsf=extract_extradata` was probed against the same fixtures: `profile`,
`level` and `pix_fmt` still arrived on the MPEG-TS fixtures — the parser supplies
them — and an earlier version of this gate passed the broken build cleanly. The
one field that actually disappears is `extradata_size` (35 bytes for h264, 22 for
mpeg2video, absent entirely without the filter), and it is not part of the
default `-show_streams` output, so the gate asks for it in a second pass. Without
that, the most silent failure mode in this build would have gone unchecked by the
check written for it.

**Long path / non-ASCII** ([`check-longpath.js`](.github/scripts/check-longpath.js))
— probes a fixture copied to a path past `MAX_PATH` under a Japanese and
Cyrillic name, and requires an identical result. Real libraries are not stored
in `C:\media\a.mkv`.

**Bundle completeness** ([`check-bundle.js`](.github/scripts/check-bundle.js)) —
every licence text that must ship is present and non-empty, `ffprobe_g.exe`
(the unstripped link target, three to four times the size) is absent, and no
DLL crept in.

**No patches** ([`check-no-patches.js`](.github/scripts/check-no-patches.js)) —
a `*.patch` against FFmpeg would be a derivative of LGPL code, which the MIT
licence on this repository does not cover.

### What the gates do NOT prove

The fixtures are synthetic — generated by
[`tools/make-fixtures.sh`](tools/make-fixtures.sh) from `testsrc2`/`sine` and
subtitle text written by the script itself, with no third-party media involved.
That bounds what they can cover: FFmpeg has **no encoder at all** for `pgssub`,
`vc1` or `wmv3`, and cannot transcode text subtitles into `dvdsub`, so those
four decoders are exercised by nothing here. They are listed under
`notCoveredBySynthetics` in `expected-fields.json`.

**A green field-coverage gate is therefore not a statement about real-world
rips.** That question is answered separately, by running the built binary over
an actual library and inspecting which fields come back.

## Building and releasing

Everything is driven by
[`.github/workflows/build-ffprobe.yml`](.github/workflows/build-ffprobe.yml) on
`windows-latest`. A pull request or a push to `master` builds and runs every
gate; a tag of the form `ffprobe-<version>_<build>` (for example
`ffprobe-9.0.2_1`) additionally publishes a Release with the bundle, its
signature, `SHA256SUMS` **and the FFmpeg source tarball it was built from**.

Release runs are never cancelled by a later run; branch and PR runs are.

To regenerate the fixtures (needs a full upstream ffmpeg with x264, x265, an
AV1 encoder, libvpx, libvorbis, libopus, libmp3lame and libtheora):

```bash
tools/make-fixtures.sh
```

## Licensing

The build scripts and workflow in **this** repository are licensed under
[MIT](LICENSE). That covers the scripts only — it grants no rights over the
compiled binary, which remains under its own licence. No patches are applied to
upstream FFmpeg; the build uses the pinned tarball verbatim.

The published bundle contains software under **LGPL-2.1-or-later** (FFmpeg),
the **MinGW-w64 runtime** licence aggregate, **GPL-3.0 with the GCC Runtime
Library Exception** (static libgcc) and the **zlib** licence. Full texts and the
corresponding-source notice travel inside every release archive, in
[`THIRD-PARTY-LICENSES/`](THIRD-PARTY-LICENSES/README.md).

This repository is public and stays public: the corresponding-source directions
shipped inside the bundle point at it, and at the release assets hosted here.

Releases are signed with Ed25519; the public key is
[`signing-key.pub`](signing-key.pub) and verification steps are in
[`SIGNING.md`](SIGNING.md).
