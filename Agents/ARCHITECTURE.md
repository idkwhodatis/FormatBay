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
  Temps live on the output volume. Terminal task status and its revision are
  published only after cleanup settles, including cleanup warnings. Final publication uses exclusive hard links,
  never overwriting source or existing destinations. Filesystems without hard-link
  support fail explicitly. Cancellation/failure cleans temps; close aborts work.

## Task lifecycle and UI

Ready → queued → running → done/failed/cancelled. Unreachable/bad inputs become
blocked. Remove/re-add to retry or replan. Output-directory selection applies to
new imports, default beside input (reset available in the toolbar). Running-task removal requires cancellation.
Task snapshots are `{revision,tasks}` envelopes. Each task includes ID, inputPath,
target, plan, status, progress and output/error. Renderer ignores revisions already
applied, preventing late init/action replies from reverting newer pushed state.

Renderer keeps target selection independent from task target. Choose a target,
add files, inspect route/warnings, then start. Tasks toolbar provides individual
and batch start/cancel, with removal of nonrunning tasks. No fake tasks. Favorites,
language choice and offline preference remain. Tools missing on PATH are shown
explicitly. All implemented routes are local, regardless of offline switch.

## Scope boundaries

The graph supports A→F→L in unit tests and real FFmpeg → FLAC → opusenc
execution. Automatic prefers equivalent direct paths; an Opus encoder preference
can require opusenc as the final tool. Optional opusenc requires local Xiph
opus-tools and FFmpeg probing/full-decode verification, not automatic installation.
No OCR/data/video output adapter, binary bundling, automatic installer, package/sign
pipeline, durable queue/resume, drag-drop, recursive import or topology visualizer.

Encoding preserves channel count unless a declared encoder limit requires a
downmix (MP3: 2, Opus: 8), which is explicitly warned. Stream-copy paths preserve
channel count. The planned channel count is verified in the output.

## Optional Opus encoder

`conversion/opusenc.js` declares compatible mono-through-eight-channel WAV PCM /
FLAC input states and a lossy Opus edge. Startup exposes `targetEncoders` separately
from target formats. Narrow IPC accepts only advertised `encoder: opusenc` on an
Opus target. The planner includes the final-tool constraint in goal acceptance and
search-state pruning. An original input to an external encoder is fully validated
first; intermediates are already validated. Tool errors/cancel never publish partial
output. Task `phase` and `stepIndex` expose truthful per-step UI progress.
