# FormatBay scope

## Implemented on conversion-graph branch

- Target-first real audio catalog from installed FFmpeg capabilities.
- Pure deterministic capability multigraph planner, quality-first bounded paths,
  offline/tool/input constraints and multi-tool test fixtures.
- Native bounded file/folder import, actual stream probing and per-file plans.
- FFmpeg audio copy/encode to available WAV/FLAC/MP3/AAC/OGG/Opus outputs.
- Serial queue, progress, cancel, remove and bulk task controls.
- Per-step probe/full-decode integrity and duration validation, per-task temp cleanup and no-overwrite publication.
- Route/warnings/errors/output paths shown in Svelte UI, no dummy tasks.
- Sandboxed narrow IPC, production loadFile, favorite/offline persistence,
  navigator language default and locale choice.
- Node tests including real tiny synthetic media fixtures, production build.
- Linux GitHub Actions workflow with real media tools, locked installs, skip-free
  integration enforcement, syntax/locale checks and build (no native GUI claim).
- Revision-aware task updates and shared UI operation locks.

## Explicit limitations

- Two production adapters: FFmpeg and optional Xiph opusenc. Real cross-tool
  routing is tested, including automatic fallback when FFmpeg Opus encoding is
  unavailable. FFmpeg remains required for probing/output verification.
- Audio-only outputs, first audio stream. Video/subtitles/chapters/metadata/artwork
  are discarded and disclosed; lossy or precision changes have warnings.
- Tool discovery is at startup; install FFmpeg/ffprobe and optional opus-tools
  manually and restart. No automated downloads.
- No downloads/network conversions; the offline toggle is retained but all
  implemented adapters are local. Playlist/manifest inputs are rejected.
- Output directory applies to newly imported tasks. Default is source directory.
  Publication requires hard-link support on that volume and fails safely otherwise.
- Tasks are session-local, no persistent queue/resume. Retry means remove/re-add.
- No recursive import, drag-drop, OCR/data/certificate/video output converters,
  multi-output fan-out, global graph viewer, packaging/signing or updater.
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
phase and current step are shown. Native GUI interaction remains unverified.
