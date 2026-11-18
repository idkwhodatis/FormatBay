# FormatBay architecture

## Trust boundary

`src/main.js` creates a sandboxed, context-isolated Electron renderer without
Node integration. `src/preload.cjs` exposes narrow invokes and task subscriptions.
IPC verifies sender webContents, top-level frame and exact entry URL. Dev mode
requires `--dev`; normal start loads the Vite build with relative assets. Settings
are restricted to favorites/offline preference in electron-store's user-data dir.
Native dialogs select input files and output directories; renderer cannot submit
arbitrary paths, command strings or executable plans. Import is bounded to 200
files per dialog/500 tasks, folders are non-recursive.

## Conversion core

- `conversion/planner.js`: pure bounded graph search. State includes kind, format,
  audio codec and stream presence. Capability predicates define valid edges;
  availability/offline policy filters them. Quality cost precedes step count.
  Route steps snapshot capability ID, tool/version, input/output and warnings.
- `conversion/ffmpeg.js`: discovers FFmpeg/ffprobe and actual encoders, decoders,
  muxers. Supported output targets are WAV/FLAC/MP3/AAC/OGG/Opus when available.
  Probes local regular media files; excludes playlist/network protocols. Copies
  matching audio codecs where possible, otherwise encodes the first audio stream.
  Explicit warnings cover removed streams/metadata, lossy encoding and precision.
- `conversion/process.js`: argv-only spawn, no shell; cancellation, timeout and
  bounded diagnostics. Actual conversion progress is parsed from FFmpeg.
- `conversion/service.js`: backend-owned tasks and serial queue. Imports probe and
  plan; execution rechecks file identity and route. Each step is probed and fully decoded with fail-on-error; known audio durations
  are checked with a padding tolerance before publication.
  Temps live on the output volume. Final publication uses exclusive hard links,
  never overwriting source or existing destinations. Filesystems without hard-link
  support fail explicitly. Cancellation/failure cleans temps; close aborts work.

## Task lifecycle and UI

Ready → queued → running → done/failed/cancelled. Unreachable/bad inputs become
blocked. Remove/re-add to retry or replan. Output-directory selection applies to
new imports, default beside input (reset available in the toolbar). Running-task removal requires cancellation.
Task snapshots include ID, inputPath, target, plan, status, progress, output/error.

Renderer keeps target selection independent from task target. Choose a target,
add files, inspect route/warnings, then start. Tasks toolbar provides individual
and batch start/cancel, with removal of nonrunning tasks. No fake tasks. Favorites,
language choice and offline preference remain. Tools missing on PATH are shown
explicitly. All implemented routes are local, regardless of offline switch.

## Scope boundaries

The graph is generic and supports A→F→L across tools in unit tests; production
currently has one real adapter and generally selects a direct FFmpeg path. No
OCR/data/video output adapter, binary bundling, automatic installer, package/sign
pipeline, durable queue/resume, drag-drop, recursive import or topology visualizer.

Encoding preserves channel count unless a declared encoder limit requires a
downmix (MP3: 2, Opus: 8), which is explicitly warned. Stream-copy paths preserve
channel count. The planned channel count is verified in the output.
