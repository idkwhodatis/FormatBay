# FormatBay scope

## Expanded FFmpeg support

- A checked-in release contract fixes the audio, video, image and text subtitle
  format and configuration choices. Packaging checks the exact bundled binaries.
  Copy-only profiles require compatible source streams and have no encode options.
- Config captures typed options before import. Non-audio operations run one
  verified FFmpeg step; automatic audio still uses the tool graph.
- FFmpeg/ffprobe are bundled only. No system or managed replacement. Network and
  device conversion, arbitrary filters, image sequences/HLS and unverified GPU
  encoders remain out of scope. Optional tools can still be installed explicitly.

## Implemented on conversion-graph branch

- Target-first real audio catalog from the bundled release contract.
- Pure deterministic capability multigraph planner, quality-first bounded paths,
  offline/tool/input constraints and multi-tool test fixtures.
- Native bounded file/folder import, actual stream probing and per-file plans.
- FFmpeg audio copy/encode to available WAV/FLAC/MP3/AAC/OGG/Opus outputs.
- Serial queue, progress, cancel, remove and bulk task controls.
- Per-step probe/full-decode integrity and duration validation, per-task temp cleanup and no-overwrite publication.
- Route/warnings/errors/output paths shown in Svelte UI, no dummy tasks.
- Completed outputs can be revealed in the OS file manager via a task-ID-only
  action; moved/deleted outputs report an error.
- Sandboxed narrow IPC, production loadFile, favorite/offline persistence,
  navigator language default and locale choice.
- Node tests including real tiny synthetic media fixtures, production build.
- Linux GitHub Actions workflow with real media tools, locked installs, skip-free
  integration enforcement, syntax/locale checks and build (no native GUI claim).
- Windows workflow runs the same suite with the checksum-pinned FFmpeg bundle and optional
  opusenc plus isolated production Electron smoke; native interactive/visual
  acceptance remains separate from automated launch/IPC checks.
- Revision-aware task updates and shared UI operation locks.

## Explicit limitations

- Two production adapters: FFmpeg and optional Xiph opusenc. Real cross-tool
  routing is tested, including automatic fallback when FFmpeg Opus encoding is
  unavailable. FFmpeg remains required for probing/output verification.
- Audio-only jobs use the first audio stream. Video/subtitles/chapters/metadata/artwork
  are discarded and disclosed; lossy or precision changes have warnings.
- Same-format output never detours through an intermediate format. Existing
  MKV subtitles and default tracks can be edited; external subtitle import is not implemented.
- The required pair must be present in the bundle. Optional tool availability can
  be refreshed in Tools. No automated downloads.
- No downloads/network conversions; the offline toggle is retained but all
  implemented adapters are local. Playlist/manifest inputs are rejected.
- Output directory applies to newly imported tasks. Default is source directory.
  Publication requires hard-link support on that volume and fails safely otherwise.
- Tasks are session-local, no persistent queue/resume. Retry means remove/re-add.
- No recursive import, drag-drop, OCR/data/certificate converters,
  multi-output fan-out, global graph viewer, signed installer or updater.
- Historical catalog/consts and supported.txt remain unused ideas, not support claims.

## Validation honesty

Use `node --test` and the frontend production build. Tests explicitly mark real
FFmpeg integration skipped when the tools are absent. Passing build/unit tests
alone does not mean native Windows/macOS dialogs, encoding variants or packaging
have been verified. Document actual native smoke coverage in the delivery summary.

Speaker layout, not just channel count, is probed and verified in every real
output. Normal conversion targets preserve the source speaker layout; MP3 may
explicitly downmix to stereo with a warning. Opus/FLAC/Vorbis encoding currently
accepts only canonical mono, stereo, 3.0, quad, 5.0, 5.1, 6.1 and 7.1 layouts.
Unknown/noncanonical multichannel layouts (including 2.1 and 5.1(side)) and Opus
inputs above eight channels are conservatively blocked for those encodings, not
silently remapped.
The planner cannot bypass preservation by introducing a lossy stereo intermediate.
Only unambiguous mono/stereo layout is inferred when a header omits it.

Advanced Opus encoder selection can require opusenc; conversion/verification
phase and current step are shown. Real Electron DOM workflow coverage uses
controlled native-picker results and a file-manager spy only in its standalone
test harness. Native dialog/Explorer interaction and visual acceptance remain
unverified.

## Windows portable packaging

An unsigned x64 portable build and relocated packaged-executable acceptance are
provided. CI publishes the folder artifact only after real packaged conversion
passes. The current preview bundles our own source-complete FFmpeg/ffprobe;
optional opusenc is explicitly installed through Tools or safe PATH. Native picker and
Explorer boundaries remain stubbed in automation. No signed release is claimed.

## Managed tools and bundled FFmpeg (2026-11-18)

Windows x64 packages include our pinned-source FFmpeg/ffprobe build with matching
source/notices. Tools UI supports explicit pinned opusenc installation, progress,
cancellation, discovery refresh and recoverable managed removal. Bundled FFmpeg
is shown for status only and cannot be replaced.
Linux/macOS managed downloads, automatic updates, installers/signing and GPU
encoding remain outside implemented scope. Earlier external-only preview notes
are superseded by this section; see BUNDLED-FFMPEG.md for provenance and limits.
