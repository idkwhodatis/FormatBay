#!/usr/bin/env bash
# Build only official, hash-pinned sources. No system install or PATH mutation.
# Native Windows: MSYS2 UCRT64 with gcc/make/nasm/pkgconf/curl/tar/xz installed.
# Linux cross: CROSS_PREFIX=x86_64-w64-mingw32- bash scripts/build-bundled-ffmpeg.sh OUTPUT
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MANIFEST="$SCRIPT_DIR/bundled-ffmpeg-sources.tsv"
[[ $# == 1 ]] || { echo 'Usage: build-bundled-ffmpeg.sh OUTPUT_DIRECTORY' >&2; exit 2; }
mkdir -p -- "$1"
OUT=$(cd -- "$1" && pwd)
[[ -z $(ls -A "$OUT") ]] || { echo 'Output directory must be empty' >&2; exit 2; }
WORK=$(mktemp -d "/tmp/formatbay-ffmpeg-build.XXXXXXXX")
cleanup() {
  # Preserve diagnostics even when configure/build fails before normal copying.
  if [[ -d "$WORK/src" ]]; then
    while IFS= read -r file; do
      relative=${file#"$WORK/src/"}; mkdir -p "$OUT/source/build-logs/failed-or-final/$(dirname "$relative")"
      cp "$file" "$OUT/source/build-logs/failed-or-final/$relative"
    done < <(find "$WORK/src" -type f -name config.log)
  fi
  rm -rf -- "$WORK"
}
trap cleanup EXIT
mkdir -p "$OUT/bin" "$OUT/source/archives" "$OUT/source/build-logs" "$OUT/licenses" "$WORK/prefix" "$WORK/src"
exec > >(tee "$OUT/source/build-logs/build.log") 2>&1
cp "$0" "$MANIFEST" "$OUT/source/"
printf '%s\n' 'Build invoked at:' "$(date -u +%FT%TZ)" > "$OUT/source/BUILD-ENVIRONMENT.txt"
if [[ -n ${CROSS_PREFIX:-} ]]; then
  HOST=x86_64-w64-mingw32
  export CC="${CROSS_PREFIX}gcc" AR="${CROSS_PREFIX}ar" RANLIB="${CROSS_PREFIX}ranlib" STRIP="${CROSS_PREFIX}strip"
  FFCROSS=(--enable-cross-compile --cross-prefix="$CROSS_PREFIX")
  OBJDUMP="${CROSS_PREFIX}objdump"
else
  [[ ${MSYSTEM:-} == UCRT64 ]] || { echo 'Use MSYS2 UCRT64 or set a trusted MinGW CROSS_PREFIX' >&2; exit 2; }
  HOST=$(gcc -dumpmachine)
  export CC=gcc AR=ar RANLIB=ranlib STRIP=strip
  FFCROSS=()
  OBJDUMP=objdump
fi
for command in "$CC" "$AR" "$RANLIB" "$STRIP" "$OBJDUMP" make nasm pkg-config curl tar sha256sum; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command"; exit 2; }; done
"$CC" --version >> "$OUT/source/BUILD-ENVIRONMENT.txt"
nasm -v >> "$OUT/source/BUILD-ENVIRONMENT.txt"
if command -v pacman >/dev/null; then pacman -Q >> "$OUT/source/BUILD-ENVIRONMENT.txt"; fi
if command -v dpkg-query >/dev/null; then
  # Record installed toolchain packages; extracted cross toolchains may instead
  # supply their verified package/version/hash list through the explicit file.
  dpkg-query -W -f='${binary:Package}\t${Version}\n' 'gcc-mingw*' 'mingw-w64*' 'binutils-mingw*' make nasm pkg-config 2>/dev/null >> "$OUT/source/BUILD-ENVIRONMENT.txt" || true
fi
if [[ -n ${TOOLCHAIN_PROVENANCE_FILE:-} ]]; then
  cp "$TOOLCHAIN_PROVENANCE_FILE" "$OUT/source/TOOLCHAIN-PROVENANCE.txt"
fi
PREFIX="$WORK/prefix"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig" PKG_CONFIG_PATH= CFLAGS='-O2' LDFLAGS='-static -static-libgcc'
# Pin dependencies, not the network's current latest. Keep original archives as
# the corresponding sources; no source patches are applied by this recipe.
while IFS=$'\t' read -r name version archive sha url license; do
  [[ $name == \#* || -z $name ]] && continue
  target="$OUT/source/archives/$archive"
  if [[ -n ${SOURCE_CACHE:-} && -f "$SOURCE_CACHE/$archive" ]]; then cp "$SOURCE_CACHE/$archive" "$target";
  else curl --fail --location --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 30 --max-time 300 "$url" -o "$target.part"; mv "$target.part" "$target"; fi
  printf '%s  %s\n' "$sha" "$target" | sha256sum --check --status || { echo "Source checksum failed: $archive"; exit 1; }
  tar -xf "$target" -C "$WORK/src"
done < "$MANIFEST"
JOBS=${JOBS:-4}
[[ $JOBS =~ ^[1-9][0-9]*$ ]] || { echo 'JOBS must be positive integer'; exit 2; }
configure_library() {
  local folder=$1; shift
  (cd "$WORK/src/$folder"; ./configure --host="$HOST" --prefix="$PREFIX" --disable-shared --enable-static "$@"; cp config.log "$OUT/source/build-logs/$folder-config.log"; make -j"$JOBS"; make install)
}
configure_library libogg-1.3.6
configure_library libvorbis-1.3.7 --disable-docs --disable-examples
configure_library lame-3.100 --disable-frontend --disable-decoder --disable-nasm
configure_library opus-1.6.1 --disable-doc --disable-extra-programs
(
 cd "$WORK/src/zlib-1.4"
 CHOST="$HOST" ./configure --prefix="$PREFIX" --static
 cp configure.log "$OUT/source/build-logs/zlib-1.4-configure.log"
 make -j"$JOBS" libz.a
 make install
)
(
 cd "$WORK/src/ffmpeg-9.0.2"
 ./configure --prefix="$PREFIX" --target-os=mingw32 --arch=x86_64 "${FFCROSS[@]}" \
   --cc="$CC" --ar="$AR" --ranlib="$RANLIB" --strip="$STRIP" \
   --disable-autodetect --disable-gpl --disable-nonfree --disable-version3 \
   --disable-shared --enable-static --disable-doc --disable-debug --disable-ffplay \
   --disable-network --disable-hwaccels --disable-pthreads --enable-w32threads \
   --disable-indevs --enable-indev=lavfi --disable-outdevs \
   --enable-libmp3lame --enable-libvorbis --enable-libopus --enable-zlib \
   --pkg-config=pkg-config --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include" \
   --extra-ldflags="-L$PREFIX/lib -static -static-libgcc"
 cp ffbuild/config.log config.h config_components.h ffbuild/config.mak "$OUT/source/build-logs/"
 for feature in GPL NONFREE VERSION3 NETWORK; do
   grep -q "^#define CONFIG_${feature} 0$" config.h || { echo "Unexpected enabled feature: $feature"; exit 1; }
 done
 for codec in PCM_S16LE FLAC AAC LIBMP3LAME LIBVORBIS LIBOPUS PNG; do
   grep -q "^CONFIG_${codec}_ENCODER=yes$" ffbuild/config.mak || { echo "Missing encoder: $codec"; exit 1; }
 done
 make -j"$JOBS"
 cp ffmpeg.exe ffprobe.exe "$OUT/bin/"
)
for folder in ffmpeg-9.0.2 libogg-1.3.6 libvorbis-1.3.7 lame-3.100 opus-1.6.1 zlib-1.4; do
 mkdir -p "$OUT/licenses/$folder"
 find "$WORK/src/$folder" -maxdepth 1 -type f \( -iname 'COPYING*' -o -iname 'LICENSE*' -o -iname 'AUTHORS*' \) -exec cp {} "$OUT/licenses/$folder/" \;
done
# Reject accidental non-system DLL dependencies before packaging a portable tool.
for binary in "$OUT/bin/ffmpeg.exe" "$OUT/bin/ffprobe.exe"; do
 "$OBJDUMP" -p "$binary" > "$OUT/source/build-logs/$(basename "$binary").imports.txt"
 while IFS= read -r dll; do
   dll=${dll,,}
   [[ $dll =~ ^(bcrypt|kernel32|msvcrt|shell32|ucrtbase|advapi32|user32|ole32)\.dll$ || $dll =~ ^api-ms-win-crt-[a-z0-9-]+\.dll$ ]] || { echo "Unbundled/non-system DLL: $dll"; exit 1; }
 done < <(sed -n 's/^[[:space:]]*DLL Name: //p' "$OUT/source/build-logs/$(basename "$binary").imports.txt" | tr -d '\r')
done
# Include toolchain runtime copyright/exception notices as well as codec notices.
mkdir -p "$OUT/licenses/toolchain"
if [[ -n ${TOOLCHAIN_LICENSE_DIR:-} ]]; then
 cp -RL "$TOOLCHAIN_LICENSE_DIR/." "$OUT/licenses/toolchain/"
elif [[ -z ${CROSS_PREFIX:-} ]]; then
 cp -RL /ucrt64/share/licenses/. "$OUT/licenses/toolchain/"
else
 compiler_root=$(dirname "$(dirname "$(command -v "$CC")")")
 for folder in "$compiler_root"/share/doc/gcc-mingw* "$compiler_root"/share/doc/mingw-w64*; do
   if [[ -f "$folder/copyright" ]]; then cp -L "$folder/copyright" "$OUT/licenses/toolchain/$(basename "$folder")-copyright"; fi
 done
fi
[[ -n $(find "$OUT/licenses/toolchain" -type f -print -quit) ]] || { echo 'Provide TOOLCHAIN_LICENSE_DIR containing compiler/runtime license notices'; exit 1; }
(cd "$OUT"; sha256sum bin/*.exe > SHA256SUMS)
printf '%s\n' 'FFmpeg 9.0.2, built by FormatBay from the enclosed pinned source archives.' \
 'LGPL configuration: GPL, nonfree, version3-only components and autodetection disabled.' \
 'External codecs: LAME 3.100 (LGPL), libogg 1.3.6 (BSD), libvorbis 1.3.7 (BSD), Opus 1.6.1 (BSD); zlib 1.4 (Zlib) enables PNG.' \
 'Source archives, exact recipe, configuration and build environment are in source/.' \
 'This is a source-rebuild recipe, not a claim of bit-for-bit reproducibility across compilers.' \
 'Keep bin/, source/, licenses/ and SHA256SUMS together when redistributing.' > "$OUT/README.txt"
# Cross builds cannot run here. Native Windows builds verify the executable and
# capability surface; the application's real conversion suite remains mandatory.
if [[ -z ${CROSS_PREFIX:-} ]]; then
 "$OUT/bin/ffmpeg.exe" -version > "$OUT/source/build-logs/ffmpeg-version.txt"
 "$OUT/bin/ffprobe.exe" -version > "$OUT/source/build-logs/ffprobe-version.txt"
 "$OUT/bin/ffmpeg.exe" -hide_banner -encoders > "$OUT/source/build-logs/encoders.txt"
 for codec in pcm_s16le flac libmp3lame aac libvorbis libopus png; do
   grep -Eq "[[:space:]]${codec}[[:space:]]" "$OUT/source/build-logs/encoders.txt" || { echo "Missing encoder: $codec"; exit 1; }
 done
fi
printf 'Bundled FFmpeg built: %s\n' "$OUT"
