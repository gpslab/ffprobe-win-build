# Third-party licenses

This bundle contains one executable, `ffprobe.exe`, built from Free/Open-Source
software. Every component statically linked into it is listed below with its
licence, and the full text of each licence is in [`texts/`](texts/).

The texts in `texts/` are **not** copies kept in the build repository. They are
taken at build time from the pinned upstream source tarball and from the
toolchain that actually produced the binary, so they cannot drift away from what
is really inside it. Component versions are recorded in `versions.txt` next to
this file.

| Component                     | Licence                                   | Text                                       |
|-------------------------------|-------------------------------------------|--------------------------------------------|
| FFmpeg (libavformat, libavcodec, libavutil, libswresample, fftools/ffprobe) | LGPL-2.1-or-later, conveyed here under LGPL-2.1 | [`texts/COPYING.LGPLv2.1`](texts/COPYING.LGPLv2.1), per-file map in [`texts/FFmpeg-LICENSE.md`](texts/FFmpeg-LICENSE.md) |
| MinGW-w64 runtime             | aggregate — see the text (includes BSD, ISC, MIT, Lucent, Sun, and LGPL-2.1+ parts) | [`texts/COPYING.MinGW-w64-runtime.txt`](texts/COPYING.MinGW-w64-runtime.txt) |
| libgcc (static)               | GPL-3.0 **with** the GCC Runtime Library Exception 3.1 | [`texts/RUNTIME.LIBRARY.EXCEPTION`](texts/RUNTIME.LIBRARY.EXCEPTION) |
| zlib                          | zlib licence                              | [`texts/zlib-LICENSE.txt`](texts/zlib-LICENSE.txt) |
| libwinpthread (mingw-w64)     | MIT-style, see the text                   | [`texts/winpthreads-LICENSE.txt`](texts/winpthreads-LICENSE.txt) |
| Universal C Runtime (`ucrtbase.dll`, `api-ms-win-*`) | Microsoft, component of the operating system | not bundled — see below |

## FFmpeg and LGPL-2.1

`ffprobe.exe` statically links the FFmpeg libraries. This build is configured
**without** `--enable-gpl`, **without** `--enable-version3` and **without**
`--enable-nonfree`, and links no external libraries other than zlib, so the
result is LGPL-2.1-or-later; it is conveyed here under LGPL version 2.1.

LGPL-2.1 §6 requires a copy of that licence to accompany the work, which is
`texts/COPYING.LGPLv2.1`. Unlike LGPLv3 §4(b), LGPL-2.1 does not additionally
require the text of the GNU GPL, so it is not included.

Most files in FFmpeg are LGPL-2.1-or-later; some are under MIT/X11 or BSD-style
terms. The authoritative per-file map is FFmpeg's own `LICENSE.md`, shipped
verbatim as `texts/FFmpeg-LICENSE.md`.

## Independent JPEG Group

**This software is based in part on the work of the Independent JPEG Group.**

The IDCT routine `libavcodec/jrevdct.c` originates from the Independent JPEG
Group's software, Copyright (C) 1991, 1992 Thomas G. Lane. It is linked into
this binary through FFmpeg's `CONFIG_IDCTDSP`, which the MPEG-1/2, MPEG-4 and
VC-1 decoders require. Where a build also enables `CONFIG_FDCTDSP`, the same
origin applies to `libavcodec/jfdctfst.c` and `libavcodec/jfdctint_template.c`.

As condition (1) of the IJG licence requires: the versions of those files used
here are **modified** relative to the original libjpeg. The modifications are
the FFmpeg project's own and are fully visible in the corresponding source (see
below); **no modifications of our own are applied** — this build uses the
upstream tarball verbatim, with no patches. The IJG copyright and no-warranty
notice is preserved at the top of each of those files in that source.

## Corresponding source, and rebuilding

The complete corresponding source for `ffprobe.exe` is the upstream FFmpeg
release tarball, attached as an asset to **the same GitHub Release as this
bundle** — not merely linked to an upstream server, so it stays available for as
long as the binary is distributed. Its SHA-256 is recorded in `versions.txt`.

The complete build recipe — configure flags, toolchain, resolved package
versions — is in `versions.txt` and in the public build repository:

    https://github.com/gpslab/ffprobe-win-build

Because the FFmpeg libraries are linked statically, the LGPL right to modify
them and rebuild is exercised by rebuilding the executable: take the source
tarball and the recipe, modify the libraries as you wish, rebuild `ffprobe.exe`,
and replace the file in this bundle with your build. Nothing in the surrounding
application links against any FFmpeg library — `ffprobe.exe` is executed as a
separate process and communicates over its command line and standard output.

## Threading runtime

FFmpeg on mingw uses Windows' own threading, but MSYS2's GCC is built with
`--enable-threads=posix`, so `libwinpthread` is linked into the static binary
regardless. This was measured on the build rather than reasoned about: its
symbols are present in `ffprobe.exe`. Its licence therefore travels with it.

## Operating-system components

`ffprobe.exe` imports only libraries that are part of Windows itself (the
Universal C Runtime and the usual `kernel32`/`user32` family). Those are not
redistributed with this bundle and are covered by the carve-out in LGPL-2.1 §6
for components normally distributed with the operating system.
