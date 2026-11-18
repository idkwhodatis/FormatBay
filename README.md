# FormatBay

Offline-first desktop format converter, built with Electron and Svelte.

## Conversion graph preview

Choose your **target format first**, add video/audio files, review the proposed
route and warnings, then start. FormatBay probes the actual audio stream and
chooses a compatible local conversion path. Matching audio can be copied without
re-encoding; other targets are encoded with FFmpeg.

This branch supports **WAV, FLAC, MP3, AAC, OGG and Opus audio outputs**, depending
on the encoders installed with your FFmpeg. Only the first audio stream is kept;
video/subtitles/metadata/artwork are discarded. Warnings explain lossy encoding
and precision changes. Inputs and existing outputs are never overwritten.

The planner supports multi-step, multi-tool routes (covered with tool A/B tests).
FFmpeg is the first production adapter. Video output, a second tool adapter, OCR,
structured data and a topology visualization are not yet implemented.

## Run from source

Requirements: Bun, Node >=22.12, and `ffmpeg` / `ffprobe` installed on PATH.
FormatBay does not automatically download tools or upload your files.

```sh
bun install
cd src/frontend && bun install && cd ../..
bun run build
bun run start
```

Development uses two terminals: frontend `bun run dev` from `src/frontend`, and
root `bun run dev`. Tests: `bun run test`. Real-media tests explicitly skip when
FFmpeg/ffprobe is unavailable.

Outputs default beside each input as `name-converted.ext`, with numeric suffixes
when necessary. Choosing an output folder applies to newly imported tasks. Folder
import is non-recursive and limited to 200 files. Tasks are session-local; remove
and re-add to retry. Atomic publication requires a filesystem supporting hard links
(on the chosen output volume); unsupported volumes fail safely without overwriting.

No installer/signing or Windows/macOS native validation is included yet.
See [agent architecture](Agents/ARCHITECTURE.md) and [scope](Agents/SCOPE.md).

## Open source tools

[Electron](https://www.electronjs.org/), [Svelte](https://svelte.dev/),
[shadcn-svelte](https://www.shadcn-svelte.com/),
[Tailwind](https://tailwindcss.com/), [Lucide](https://lucide.dev/),
[Bun](https://bun.sh/), [Vite](https://vite.dev/) and [FFmpeg](https://ffmpeg.org/).
Tesseract integration remains planned. Thanks to their contributors.

Encoding preserves channel count unless a declared encoder limit requires a
downmix (MP3: 2, Opus: 8), which is explicitly warned. Stream-copy paths preserve
channel count. The planned channel count is verified in the output.
