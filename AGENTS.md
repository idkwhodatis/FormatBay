# AGENTS.md — FormatBay Agent Index

FormatBay is an offline-first desktop converter. The conversion-graph branch
implements target-first audio conversion from local video/audio files. Generic
multi-tool graph planning and real FFmpeg → opusenc execution are tested.

## Stack and commands

- Electron 45, electron-store 12; sandboxed/context-isolated renderer.
- Svelte 5, Vite 8, Tailwind 4, shadcn-svelte/bits-ui. Bun manages both lockfiles.
- Node >=22.12; latest verified dependency snapshot: `Agents/UPGRADE.md`.
- Install: `bun install` and `cd src/frontend && bun install`.
- Build: `bun run build`; start built app: `bun run start`.
- Development: `cd src/frontend && bun run dev`, then root `bun run dev`.
- Tests: `bun run test` (Node test runner). FFmpeg integration tests skip explicitly
  if system FFmpeg/ffprobe is unavailable; tests must not auto-download binaries.
- Windows x64 packages bundle our source-complete FFmpeg/ffprobe build. Source
  apps use a prepared release bundle, not PATH FFmpeg; opusenc is optional.

## Contributor map and rules

Read `Agents/ARCHITECTURE.md`, `Agents/SCOPE.md`, `Agents/IMPLEMENTATION.md` before
changes; keep them synchronized. Check status and don't overwrite unrelated work.

1. Production FFmpeg formats and Config fields come from the pinned release
   contract checked during packaging, not PATH or historical catalogs. Keep the
   contract, package checks and exercised formats synchronized.
2. Never commit `config.json`; settings use electron-store's user-data directory.
3. Keep en-us / zh-cn locale keys synchronized. Svelte 5 runes only.
4. Do not hand-edit generated `src/frontend/src/lib/components/ui/*` components.
5. Main/preload must change together. Preload is explicitly CommonJS (`.cjs`).
6. `consts/consts.json` remains invalid, unused historical data; do not import it.
7. No shell command strings, renderer-provided paths/plans, network conversion tools, or
   silent overwrite. Backend owns probing, plans, execution and task identity.

## IPC contract

All invoke/send channels validate the current window's main frame and exact app
URL. New windows/navigation and unrequested permissions are denied.

| Channel | Direction | Payload/result |
| --- | --- | --- |
| app:initData | invoke | catalog, tool availability, taskSnapshot, outputDirectory |
| app:close / app:minimize | send | no payload |
| store:get / store:set | invoke | allowlisted favorite/offlineMode only |
| conversion:add | invoke | target {kind:audio,format,encoder?}, folder boolean; native dialog selects paths |
| conversion:outputDirectory | invoke | native output-directory picker |
| conversion:resetOutputDirectory | invoke | restore beside-input output for future imports |
| conversion:action | invoke | start/cancel/remove + 1–500 unique backend task IDs; whole batch validated first |
| conversion:revealOutput | invoke | one completed backend task ID; reveal its existing regular output in the OS file manager |
| conversion:tasks | push | {revision,tasks}, no privileged event exposed |

## File ownership

- `src/main.js`, `src/preload.cjs`: lifecycle, native dialogs, IPC and settings.
- `src/backend/conversion/`: planner, FFmpeg adapter, process wrapper, service.
- `src/frontend/src/lib/store.svelte.js`: renderer snapshots/actions.
- `src/frontend/src/App.svelte`, views/components: target-first conversion UI.
- `test/`: planner, process, service and real-media integration checks.

## Approved Conversion-Graph Implementation Plan (2026-11-18)

The target-first workflow remains: choose a desired output, add input files,
inspect the proposed route and warnings, then start. This is a **capability
multigraph + route planner**, not topological sorting. Global capability graphs
may contain cycles; an individual executable plan must be bounded and acyclic.

### Architecture and invariants

- Backend owns the registry, file probing, planner, tool adapters and serial task
  executor. Renderer displays snapshots and sends narrow commands, never shell
  strings or arbitrary input paths. Native dialogs authorize selected files.
- Nodes describe actual artifact states (media kind, container, codecs/streams),
  not merely extensions. Each edge declares its real input predicate, output
  state, tool identity/version/availability, operation, quality cost and warnings.
  Do not form a false Cartesian product of a tool's input/output format lists.
- Prefer preservation over fewer steps: remux/copy when equivalent, lossless
  intermediate formats when chaining, then fewer steps. Lossless output does not
  restore quality already lost. Reject a silent video for an audio target.
- Same-format requests require one compatible tool operation. Never leave the
  format and re-enter it to satisfy a same-format edit or encoder choice.
- Probe actual streams and verify each produced intermediate and final file.
  Filter unavailable tools and network operations under offline policy before
  planning. Planning is deterministic and bounded, with no graph database or LLM.
- Tool processes use argument arrays, no shell. Restrict media protocols to local
  files, keep sandbox/context isolation, validate IPC senders and payloads.
- Each task owns temporary files, progress, cancellation and cleanup. Never
  overwrite inputs or existing outputs. Publish final output only after successful
  verification. No automatic downloads: reviewed app-local tool installs require
  explicit confirmation, never startup or format selection alone.

### Phases and acceptance criteria

1. Upgrade every declared dependency to the current stable registry release,
   regenerate Bun locks, and resolve compatibility/build failures first.
2. Implement pure registry/planner with fake tool A/B tests proving video A to
   audio F to audio L, including cycles, codec mismatch, no audio, missing tools,
   quality preferences and offline rejection.
3. Add real ffprobe/FFmpeg adapter and serial executor, explicit tool discovery,
   output management, cancellation, failure cleanup and integration tests.
4. Wire target-first catalog, file selection, live task actions and route/warnings
   into the existing Svelte UI; remove dummy tasks and the placeholder detail pane.
5. Independent review and final checks. Respect the owner's publication-time
   instructions; no merge without explicit authorization.

Initial deliverable deliberately focuses on real audio outputs from audio/video
inputs, with a generic multi-tool planner. OCR/data, video output encoding, multi-output/fan-out, signed installers and a global topology
visualizer remain future work. Do not advertise a format until its adapter can
actually produce it. Report unrun native UI/platform checks explicitly.

### Phase 2: optional opusenc adapter (implemented)

- `opusenc` accepts declared local PCM WAV/FLAC states and outputs Opus; no
  automatic tool downloads. FFmpeg is still required for probing and verification.
- Automatic chooses the best available route; if FFmpeg Opus encoding is absent,
  it can use a lossless intermediate and opusenc. Advanced Opus encoder selection
  constrains the final tool, without permitting arbitrary renderer tool commands.
- Before direct external encoding, validate the source; validate every intermediate
  and final output. Show current step and conversion/verification phase.
- Real video → FFmpeg FLAC → opusenc Opus, unavailable tools, damaged input,
  second-step failure and cancellation must be covered by tests.

### Continuous integration and stale-update protection

- `.github/workflows/ci.yml` runs on pushes/PRs with read-only permissions and
  pinned action SHAs, Node/Bun versions, locked installs and real FFmpeg/opusenc.
- `bun run check` verifies backend/bridge syntax and locale parity. CI additionally
  runs `bun run check:tools` and fails if any integration test is skipped.
- `snapshot()` returns `{revision,tasks}`; backend pushes and command replies use
  the same monotonic revision. Renderer ignores delayed older/equal snapshots.
- Shared UI locks cover tasks across tab remounts, favorite duplicates and file
  dialogs. Tests cover stale init/action replies and removal resurrection.
- Linux CI remains non-GUI. `windows.yml` adds the same real-tool suite plus
  isolated native Electron launch/renderer/preload/IPC smoke. Manual dialog,
  visual interaction and signing remain separate. Packaged portable acceptance is
  covered by a separate relocated-executable harness. The standalone
  workflow harness may stub OS picker results and file-manager reveal only; it
  must keep production UI, IPC, planning, conversion and verification real.

Windows acceptance requirements and unverified native coverage are tracked in
`Agents/VALIDATION.md`. GPU/hardware encoding is future scope, not implemented.

### Portable Windows packaging

- `package:win` builds unsigned x64 portable output in ignored `release/`, from
  an allowlisted runtime and fresh production-only frozen install. Include
  matching tracked sources and license notices, never local config/secrets.
- `packaged-smoke.mjs` must launch the relocated actual exe/app.asar with an
  isolated profile, no checkout module fallback, and both absent/present tools.
- Windows packages bundle our own source-complete FFmpeg build; optional opusenc
  installs only after explicit confirmation. Safe PATH discovery is optional-tools only.
  Resolve explicit absolute executables once; ignore implicit cwd, relative
  entries, Windows scripts and UNC paths. Never silently install/download tools.
- No native-picker, Explorer, signing or installer claims from boundary stubs.

### Tool-management contract (2026-11-18)

- `tools:install/remove/cancel` accept only a backend-known tool ID;
  `tools:refresh` has no payload. Replies are full app init data. `tools:state`
  pushes revisioned progress. Renderer never supplies a URL/hash/path/command.
- `outputFormats` remains the verified release contract; `installableFormats` is
  potential UI discovery only and cannot authorize import or execution.
- Block mutations while file dialogs or ready/queued/running tasks exist.
  Never replace executable paths underneath a prepared plan.
- HTTPS host allowlist, pinned SHA256, compressed/extracted size bounds, safe
  reviewed ZIP entries, cancellation/closed-stream cleanup and atomic rename.
- Bundle our source-built LGPL/BSD FFmpeg with all matching archives/recipes/
  notices. Do not bundle Gyan binaries with only FFmpeg's own source attached.
- Managed installation Windows x64 only; unsupported platforms show manual PATH
  guidance for optional tools. FFmpeg is never installable/removable in Tools.
  No automatic updates, unpinned latest downloads, admin/PATH changes,
  hidden installers or source/bundle/system deletions.
