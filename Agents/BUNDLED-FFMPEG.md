# Bundled FFmpeg source build

The default Windows x64 bundle is built from the hash-pinned official archives in
`scripts/bundled-ffmpeg-sources.tsv`. It is **not** the third-party Gyan binary.
This avoids claiming that a bare FFmpeg source tarball is the complete source for
someone else's static build and its many external libraries.

## Build

On Windows, use an MSYS2 **UCRT64** shell with its official packages:

```
base-devel curl tar xz
mingw-w64-ucrt-x86_64-gcc
mingw-w64-ucrt-x86_64-nasm
mingw-w64-ucrt-x86_64-pkgconf
```

Run from the repository in that shell:

```sh
JOBS=4 bash scripts/build-bundled-ffmpeg.sh /c/build/formatbay-ffmpeg
```

The output directory must be empty. The script never installs into the system or
modifies system PATH. `SOURCE_CACHE` may name a directory with already downloaded
archives; every cached archive still must match its pinned SHA-256.

For a Linux MinGW cross-build, supply the trusted cross-compiler prefix:

```sh
CROSS_PREFIX=x86_64-w64-mingw32- JOBS=4 \
  bash scripts/build-bundled-ffmpeg.sh /tmp/formatbay-ffmpeg
```

Linux cross-compilation validates compilation, not Windows runtime behavior.
Windows CI must run the full real-media tests and the relocated packaged smoke
with this bundle, including the checked-in capability catalog and ffprobe. No macOS/Linux
bundled binary support is implied by this Windows build script.

## Scope and source provenance

FFmpeg 9.0.2 is built with its native decoders and codecs and these explicit
external libraries: LAME 3.100, libogg 1.3.6, libvorbis 1.3.7, Opus 1.6.1, and zlib 1.4 (including PNG support).
The LAME/Vorbis versions are deliberate compatibility pins, not a claim that all
upstream libraries are the latest release. GPL, nonfree, version3-only components,
automatic dependency detection, network protocols and hardware acceleration are
disabled. FFmpeg and ffprobe are separate executables, not linked into Electron.
Only the lavfi input device remains for deterministic real-media tests.

Source authenticity checked during preparation:

- FFmpeg 9.0.2 archive SHA-256 was computed after verifying its detached signature
  against official FFmpeg release key fingerprint
  `FCF986EA15E6E293A5644F10B4322F04D67658D8`.
- Xiph and LAME archives were fetched through their official distribution URLs.
  SHA-256 values are pinned in the manifest; Opus matches its published checksum.
- Sources: https://ffmpeg.org/download.html,
  https://downloads.xiph.org/releases/,
  https://sourceforge.net/projects/lame/files/lame/3.100/.

## Fixed release catalog

`src/backend/conversion/bundled-ffmpeg-contract.js` records the reviewed
capability subset. The Windows packager checks enabled build components and
probes the exact executables before staging the app. The desktop app never uses
ambient PATH for FFmpeg or ffprobe. Optional tools remain separate.

## Bundle contract and redistribution

Output contains:

- `bin/ffmpeg.exe` and `bin/ffprobe.exe`;
- `SHA256SUMS` for those binaries;
- `source/archives/`: every exact third-party source archive used;
- `source/`: the build script, manifest, environment record, and configuration logs;
- `licenses/`: upstream copyright/license files copied from the sources;
- `README.txt`: configuration and source-rebuild explanation.

Packaging must retain the **entire** source/notices directory alongside the
executables, not only the executable files. The packager may flatten `bin/` into
`resources/tools/ffmpeg/` and add its own verified installation metadata. Do not
remove the sources/notices when preparing downloadable artifacts.

These are LGPL/BSD/Zlib-selected components, but the original license texts control;
the recipe does not override them or make a blanket legal/patent clearance claim.
FFmpeg guidance: https://ffmpeg.org/legal.html. Preserve application GPL notices
separately. Toolchain/runtime license obligations still apply; record the compiler
package versions and do not silently introduce non-system runtime DLLs.

The build is reproducible from pinned sources in the practical rebuild sense. It
is **not** advertised as bit-for-bit reproducible across compiler versions or
build directories. A successful cross-build does not substitute for native tests.
