ffprobe for Windows x64 — minimal static build
==============================================

This archive contains a single executable, ffprobe.exe, built from the pinned
upstream FFmpeg release tarball listed in versions.txt. It reads technical
metadata out of media files (containers, codecs, resolution, frame rate,
audio tracks, subtitle tracks) and prints it. It does nothing else: the build
is configured with --disable-network and contains no muxers, no encoders and
no protocols other than plain file access.

Contents
--------
  ffprobe.exe                single self-contained executable, no DLLs
  versions.txt               FFmpeg version and tarball hash, toolchain
                             versions, and the exact configure flags used
  THIRD-PARTY-LICENSES/      licence texts for everything linked into the
                             executable, plus the corresponding-source notice

Usage
-----
  ffprobe.exe -hide_banner -loglevel error \
              -show_format -show_streams -print_format json <file>

Licensing in one paragraph
--------------------------
ffprobe.exe is LGPL-2.1-or-later: the build carries neither --enable-gpl nor
--enable-version3 nor --enable-nonfree, and links no external libraries beyond
zlib. The corresponding source is the FFmpeg tarball attached to the same
release as this archive. No patches are applied to upstream. Details, full
texts and rebuild instructions: THIRD-PARTY-LICENSES/README.md.

Built by https://github.com/gpslab/ffprobe-win-build — an unofficial CI build
of ffprobe from the FFmpeg project, not affiliated with or endorsed by it.
