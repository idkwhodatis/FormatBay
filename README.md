# FormatBay

Offline-first desktop format converter, built with Electron and Svelte.

## Conversion graph preview

Choose your **target format first**, add video/audio files, review the proposed
route and warnings, then start. FormatBay probes the actual audio stream and
chooses a compatible local conversion path. Matching audio can be copied without
re-encoding; other targets are encoded with FFmpeg or optional opusenc.

This branch supports **WAV, FLAC, MP3, AAC, OGG and Opus audio outputs**, depending
on the installed tools and their encoders. Only the first audio stream is kept;
video/subtitles/metadata/artwork are discarded. Warnings explain lossy encoding
and precision changes. Inputs and existing outputs are never overwritten.

The planner supports multi-step, multi-tool routes (covered with tool A/B tests).
FFmpeg and optional [Xiph opusenc](https://opus-codec.org/docs/opus-tools/opusenc.html)
are production adapters. With opus-tools installed on PATH, choose Opus and the
advanced opusenc encoder to route video → FFmpeg FLAC/WAV → opusenc Opus. Automatic
mode prefers a direct route when equivalent, or chains tools when FFmpeg lacks
Opus encoding. Each stage is verified before the next runs. Completed tasks offer **Show in
folder**; moved or deleted outputs report an error rather than silently failing.

Video output, OCR, structured data and a topology visualization are not yet implemented.

## Run from source

Requirements: Bun, Node >=22.12, and `ffmpeg` / `ffprobe` installed on PATH.
Optional: install Xiph opus-tools (`opusenc`) for the second encoder.
FormatBay does not automatically download tools or upload your files.

```sh
bun install
cd src/frontend && bun install && cd ../..
bun run build
bun run start
```

Development uses two terminals: frontend `bun run dev` from `src/frontend`, and
root `bun run dev`. Tests: `bun run test`. Real-media tests explicitly skip when
FFmpeg/ffprobe is unavailable; opusenc integration tests also require opus-tools.
`bun run check` validates syntax/locale keys; `bun run check:tools` requires all
real integration capabilities. Linux CI uses pinned Node/Bun and frozen lockfiles,
runs real conversions with no skipped tests, then builds the renderer. This is
not native Electron GUI or packaging validation. The separate Windows workflow
runs the same no-skip suite with checksum-pinned upstream-linked media tools and
launches the production Electron app in an isolated profile. To run that native
renderer/preload/IPC smoke locally after building, use
`node scripts/electron-smoke.mjs` on a machine that can run Electron with both
FFmpeg and opusenc installed. This also drives the real UI/conversion workflow
with controlled native-picker results and a file-manager spy confined to the
harness, not interactive native dialog or Explorer acceptance.

Outputs default beside each input as `name-converted.ext`, with numeric suffixes
when necessary. Choosing an output folder applies to newly imported tasks. Folder
import is non-recursive and limited to 200 files. Tasks are session-local; remove
and re-add to retry. Atomic publication requires a filesystem supporting hard links
(on the chosen output volume); unsupported volumes fail safely without overwriting.

Installer/signing, interactive native file-dialog testing, visual acceptance and
macOS native validation remain unimplemented. Windows CI smoke is not a substitute
for those checks; see [acceptance coverage](Agents/VALIDATION.md).
See [agent architecture](Agents/ARCHITECTURE.md) and [scope](Agents/SCOPE.md).

## Open source tools

[Electron](https://www.electronjs.org/), [Svelte](https://svelte.dev/),
[shadcn-svelte](https://www.shadcn-svelte.com/),
[Tailwind](https://tailwindcss.com/), [Lucide](https://lucide.dev/),
[Bun](https://bun.sh/), [Vite](https://vite.dev/) and [FFmpeg](https://ffmpeg.org/).
Tesseract integration remains planned. Thanks to their contributors.

Speaker layouts are preserved and verified, not inferred from multichannel
counts. MP3's stereo downmix is warned. Opus/FLAC/Vorbis encoding currently
requires canonical speaker layouts; 2.1, 5.1(side), unknown multichannel layouts
and more than eight Opus channels are blocked rather than silently remapped.
