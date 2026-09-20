#!/usr/bin/env bash
# Regenerate the synthetic media fixtures in fixtures/.
#
# The fixtures are committed to the repository on purpose. Generating them in CI
# would mean pinning an upstream ffmpeg build as a test tool, and every published
# Windows build of ffmpeg churns or expires; a committed fixture set makes the
# field-coverage gate hermetic and reproducible instead.
#
# Everything here is SYNTHETIC: testsrc2/sine/smptebars generators plus subtitle
# text written by this script. No third-party media, no copyrighted content.
#
# Requires a full upstream ffmpeg (libx264, libx265, an AV1 encoder, libvpx,
# libvorbis, libopus, libmp3lame, libtheora). Run from the repository root:
#
#     tools/make-fixtures.sh
#
# Codecs with NO encoder in FFmpeg at all cannot be covered here and are listed
# in expected/expected-fields.json under "notCoveredBySynthetics".

set -euo pipefail

FF="${FFMPEG:-ffmpeg}"
OUT="fixtures"
D=1            # seconds per fixture — long enough for find_stream_info, short enough to commit
V="-f lavfi -i testsrc2=size=320x240:rate=24:duration=$D"
A="-f lavfi -i sine=frequency=440:sample_rate=48000:duration=$D"
A2="-f lavfi -i sine=frequency=660:sample_rate=48000:duration=$D"
Q="-hide_banner -loglevel error -y"

mkdir -p "$OUT"
rm -f "$OUT"/*

# --- subtitle sources -------------------------------------------------------
cat > /tmp/fx.ass <<'ASS'
[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Bold, Alignment, Encoding
Style: Default,Arial,20,&H00FFFFFF,0,2,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Synthetic fixture line
ASS

cat > /tmp/fx.srt <<'SRT'
1
00:00:00,000 --> 00:00:01,000
Synthetic fixture line
SRT

cat > /tmp/fx.vtt <<'VTT'
WEBVTT

00:00:00.000 --> 00:00:01.000
Synthetic fixture line
VTT

# --- matroska: h264 + aac + ass, with language/title tags and dispositions ---
$FF $Q $V $A -i /tmp/fx.ass \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -ac 2 -c:s ass \
  -metadata:s:v:0 language=und -metadata:s:v:0 title="Synthetic video" \
  -metadata:s:a:0 language=jpn -metadata:s:a:0 title="Japanese 2.0" \
  -metadata:s:s:0 language=rus -metadata:s:s:0 title="Russian subs" \
  -disposition:a:0 default -disposition:s:0 "default+forced" \
  "$OUT/mkv-h264-aac-ass.mkv"

# --- matroska: hevc 10-bit + eac3 5.1 + subrip ------------------------------
$FF $Q $V $A -i /tmp/fx.srt \
  -c:v libx265 -preset ultrafast -x265-params log-level=none -pix_fmt yuv420p10le \
  -c:a eac3 -ac 6 -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng \
  "$OUT/mkv-hevc10-eac3-subrip.mkv"

# --- matroska: av1 + opus + webvtt ------------------------------------------
if $FF -hide_banner -h encoder=libsvtav1 >/dev/null 2>&1; then AV1="libsvtav1"; else AV1="libaom-av1 -cpu-used 8"; fi
# shellcheck disable=SC2086
$FF $Q $V $A -i /tmp/fx.vtt \
  -c:v $AV1 -pix_fmt yuv420p -c:a libopus -ac 2 -c:s webvtt \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng \
  "$OUT/mkv-av1-opus-webvtt.mkv"

# --- matroska: vp9 + flac + ssa ---------------------------------------------
# No dvdsub fixture: FFmpeg cannot transcode text subtitles to a bitmap format
# ("only possible from text to text or bitmap to bitmap"), and no synthetic
# bitmap-subtitle source exists. dvdsub joins pgssub in notCoveredBySynthetics.
$FF $Q $V $A -i /tmp/fx.ass \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -pix_fmt yuv420p \
  -c:a flac -ac 2 -c:s ssa \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng \
  "$OUT/mkv-vp9-flac-ssa.mkv"

# --- matroska: truehd + dca (lossless/HD audio decoders) --------------------
$FF $Q $A $A2 \
  -map 0:a -map 1:a -c:a:0 truehd -ac:a:0 2 -c:a:1 dca -ac:a:1 2 -strict -2 \
  -metadata:s:a:0 language=eng -metadata:s:a:1 language=jpn \
  "$OUT/mkv-truehd-dca.mkv"

# --- mp4: h264 + aac + mov_text ---------------------------------------------
$FF $Q $V $A -i /tmp/fx.srt \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -ac 2 -c:s mov_text \
  -metadata:s:a:0 language=jpn -metadata:s:s:0 language=eng \
  "$OUT/mp4-h264-aac-movtext.mp4"

# --- mpegts: h264 + ac3 — the extract_extradata canary ----------------------
$FF $Q $V $A \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a ac3 -ac 2 \
  -f mpegts "$OUT/ts-h264-ac3.ts"

# --- mpegts: mpeg2video + mp3 — mpegvideo parser canary ---------------------
$FF $Q $V $A \
  -c:v mpeg2video -pix_fmt yuv420p -c:a libmp3lame -ac 2 \
  -f mpegts "$OUT/ts-mpeg2-mp3.ts"

# --- mpegps: mpeg2video + mp2 ------------------------------------------------
$FF $Q $V $A \
  -c:v mpeg2video -pix_fmt yuv420p -c:a mp2 -ac 2 \
  -f vob "$OUT/ps-mpeg2-mp2.mpg"

# --- avi: mpeg4 + mp3 --------------------------------------------------------
$FF $Q $V $A \
  -c:v mpeg4 -vtag DX50 -pix_fmt yuv420p -c:a libmp3lame -ac 2 \
  "$OUT/avi-mpeg4-mp3.avi"

# --- asf: wmv2 + wmav2 -------------------------------------------------------
$FF $Q $V $A \
  -c:v wmv2 -pix_fmt yuv420p -c:a wmav2 -ac 2 \
  "$OUT/asf-wmv2-wmav2.asf"

# --- flv: h264 + aac ---------------------------------------------------------
$FF $Q $V $A \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -ac 2 \
  "$OUT/flv-h264-aac.flv"

# --- ogg: theora + vorbis ----------------------------------------------------
$FF $Q $V $A \
  -c:v libtheora -pix_fmt yuv420p -c:a libvorbis -ac 2 \
  "$OUT/ogg-theora-vorbis.ogg"

# --- bare audio / subtitle containers ---------------------------------------
$FF $Q $A -c:a flac        "$OUT/flac-only.flac"
$FF $Q $A -c:a libmp3lame  "$OUT/mp3-only.mp3"
$FF $Q $A -c:a aac -f adts "$OUT/aac-only.aac"
$FF $Q $A -c:a ac3 -f ac3  "$OUT/ac3-only.ac3"
$FF $Q $A -c:a dca -strict -2 -ac 2 -f dts "$OUT/dts-only.dts"
$FF $Q $A -c:a pcm_s16le   "$OUT/wav-pcm16.wav"

cp /tmp/fx.ass "$OUT/sub-standalone.ass"
cp /tmp/fx.srt "$OUT/sub-standalone.srt"
cp /tmp/fx.vtt "$OUT/sub-standalone.vtt"

rm -f /tmp/fx.ass /tmp/fx.srt /tmp/fx.vtt

echo "fixtures written to $OUT/:"
ls -l "$OUT"
du -sh "$OUT"
