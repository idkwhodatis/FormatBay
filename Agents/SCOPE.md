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

## Explicit limitations

- Single production adapter. Generic multi-hop routing is tested with fake A/B
  tools; no claim that a second production converter is integrated.
- Audio-only outputs, first audio stream. Video/subtitles/chapters/metadata/artwork
  are discarded and disclosed; lossy or precision changes have warnings.
- Tool discovery is at startup; install FFmpeg/ffprobe manually and restart.
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

Encoding preserves channel count unless a declared encoder limit requires a
downmix (MP3: 2, Opus: 8), which is explicitly warned. Stream-copy paths preserve
channel count. The planned channel count is verified in the output.
