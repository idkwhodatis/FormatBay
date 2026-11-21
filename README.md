# FormatBay

Offline-first desktop format converter, built with Electron and Svelte.

## Conversion graph preview

Choose your **target format first**, add video/audio files, review the proposed
route and warnings, then start. FormatBay probes the actual audio stream and
chooses a compatible local conversion path. Matching audio can be copied without
re-encoding; other targets are encoded with FFmpeg or optional opusenc.

The **audio, video, still image and text subtitle** format list and Config
choices are fixed for each release. They come from a reviewed capability contract
for the pinned bundled FFmpeg/ffprobe pair, validated before packaging. Supported
copy-only formats require a compatible input codec and do not offer encoding controls. Choose
the output type, then open **Config** before importing files to set applicable
codec, quality, bitrate, dimensions, frame rate or track options. Each imported
task keeps its own settings. The app uses typed options, not raw FFmpeg commands.
Inputs and existing outputs are never overwritten.

Audio-only jobs still keep the first audio stream by default rather than claiming
to preserve video, subtitles, source metadata, chapters or artwork. Warnings
explain discarded streams, lossy encoding and precision changes.

The planner supports multi-step, multi-tool routes (covered with tool A/B tests).
FFmpeg and optional [Xiph opusenc](https://opus-codec.org/docs/opus-tools/opusenc.html)
are production adapters. With opus-tools installed on PATH, choose Opus and the
advanced opusenc encoder to route video → FFmpeg FLAC/WAV → opusenc Opus. Automatic
mode prefers a direct route when equivalent, or chains tools when FFmpeg lacks
Opus encoding on a cross-format conversion. Same-format requests require one
compatible tool operation and never round-trip through an intermediate.
Video routes can remux verified compatible streams or transcode as requested;
the Config page offers track selection and default-track editing where the
container supports them. Still image output from video is a single frame, not a
frame sequence. Subtitle output is limited to convertible text tracks.
Each stage is verified before the next runs. Completed tasks offer **Show in
folder**; moved or deleted outputs report an error rather than silently failing.

FFmpeg devices/network inputs or outputs, HLS and numbered file sequences,
arbitrary filters and unverified hardware encoders are not exposed by this
single-file workflow. OCR, structured data and a topology visualization remain
outside implemented scope.

## Windows portable preview

The Windows CI workflow builds an **unsigned Windows x64 portable preview** and
uploads it only after packaged-executable acceptance succeeds. Download the
`FormatBay-Windows-x64-unsigned-preview` artifact from a successful workflow run,
extract the entire directory, then run `FormatBay.exe`. This is not an installer
or a signed release. Do not bypass Windows security warnings on this project's behalf.

Windows x64 previews now include **FFmpeg and ffprobe**, built by this project
from pinned official sources with GPL/nonfree components, automatic dependency
detection, networking and hardware acceleration disabled. The complete matching
source archives, build recipe/configuration and notices travel with the tools.
See [bundled build details](Agents/BUNDLED-FFMPEG.md). This is a source-rebuild
recipe, not a claim of bit-for-bit reproducibility or blanket patent clearance.

Open **Tools** to inspect the bundled FFmpeg version and manage optional tools
such as **opusenc**. FormatBay never substitutes system or app-managed FFmpeg
for the bundle; a missing or damaged bundle must be repaired or reinstalled.
Optional downloads require a separate confirmation showing the
upstream URL, size and license. Downloads are HTTPS-only, size-bounded and
SHA-256 pinned; only reviewed ZIP entries are extracted into app-local storage.
Cancellation cleans temporary files. Managed copies can be removed into an
app-local recoverable Trash; bundled/system tools are never removed. There is
no automatic update check: published tool versions are pinned to this app release.

Managed installs currently support **Windows x64 only**. Linux/macOS retain
manual absolute-PATH setup for optional tools. Windows PATH discovery ignores
empty/relative, UNC and script entries. Refresh applies optional-tool availability
without restart but cannot change the bundled FFmpeg list. Finish/remove pending
conversion tasks and close file dialogs before changing tools. Media conversion stays local; the separate confirmed installation uses
network access even when the offline conversion preference is enabled.

To reproduce the portable package, build the source-complete FFmpeg bundle first,
set `FORMATBAY_FFMPEG_BUNDLE` to its output directory, install both frozen Bun
lockfiles, then run `bun run package:win` from a clean committed Windows checkout.
The output is `release/FormatBay-win32-x64/`. The package requires its complete
source/notices bundle, not arbitrary third-party FFmpeg executable files.
`bun run smoke:packaged -- release/FormatBay-win32-x64/FormatBay.exe` exercises
actual relocated app.asar UI with bundled FFmpeg, explicitly downloads/installs
opusenc, converts/decodes media, removes that managed copy, and checks PATH fallback.
Native picker results and Explorer reveal are test boundaries, not interactive
native-dialog, signing, SmartScreen or installer acceptance.

## Run from source

Requirements: Bun and Node >=22.12. To run the source app with conversions on
Windows x64, build the pinned release bundle, set `FORMATBAY_FFMPEG_BUNDLE` to
its output directory, and run `node scripts/package-windows.mjs --prepare-dev-tools`
from the repository root once. It verifies the bundle and stages the pair in
`.cache/bundled-tools/`. Source checkouts without the bundle can build the UI,
but cannot convert. Linux unit and real-media tests can still explicitly exercise
system tools as test inputs; they are not a Linux desktop distribution. Optional:
install Xiph opus-tools (`opusenc`) for the second encoder.

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
runs the same no-skip suite against the exact pinned FFmpeg bundle and
launches the production Electron app in an isolated profile. To run that native
renderer/preload/IPC smoke locally after building, use
`node scripts/electron-smoke.mjs` on Windows with `FORMATBAY_FFMPEG_BUNDLE`
configured and FFmpeg/ffprobe and optional opusenc on the test PATH. This also drives the real UI/conversion workflow
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
