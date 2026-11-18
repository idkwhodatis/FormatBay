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

## Windows portable preview

The Windows CI workflow builds an **unsigned Windows x64 portable preview** and
uploads it only after packaged-executable acceptance succeeds. Download the
`FormatBay-Windows-x64-unsigned-preview` artifact from a successful workflow run,
extract the entire directory, then run `FormatBay.exe`. This is not an installer
or a signed release. Do not bypass Windows security warnings on this project's behalf.

Media command-line tools are **not bundled or auto-installed**. Install FFmpeg
and ffprobe from [FFmpeg's upstream-linked downloads](https://ffmpeg.org/download.html),
and optionally [Xiph opus-tools](https://opus-codec.org/downloads/), into an
absolute local directory on PATH; restart FormatBay after changing PATH.
Windows discovery accepts local drive-qualified PATH directories and `.exe`
files only, never implicit current-directory, relative/empty/UNC entries or
`.cmd`/`.bat` scripts. Missing FFmpeg/ffprobe produces an unavailable catalog.

To reproduce on Windows with Node 24.22.3 and Bun 1.4.4, install both frozen
lockfiles as below, then commit changes and use `bun run package:win` from a clean checkout. The output is
`release/FormatBay-win32-x64/`. Matching project source, build inventory and
license/notices accompany the portable folder. Packaging uses a fresh
production-only dependency stage; development/test tools are not included.
`bun run smoke:packaged -- release/FormatBay-win32-x64/FormatBay.exe` relocates
that folder outside the checkout, verifies actual `app.asar` execution and an
isolated profile, then checks both missing-tool UI and a real FFmpeg → opusenc
conversion. Native picker results and Explorer reveal are stubbed only in the
harness; interactive dialogs, signing and consumer-desktop acceptance remain open.

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
