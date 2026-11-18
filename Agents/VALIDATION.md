# Acceptance coverage and next platform checks

## Automated Linux coverage

The GitHub Actions workflow installs real FFmpeg/ffprobe and opusenc, checks all
required encode/decode/mux capabilities, runs tests with zero skips, and builds
the renderer from frozen locks. It does not launch Electron or prove GUI behavior.

Source decoding is verified before stream-copy and direct external-encoder paths,
since a demuxer can discard damaged packets and leave a superficially valid output.
Every produced intermediate/final output is also strictly decoded. Error-level
FFmpeg diagnostics are failures even if a version exits with code zero. Terminal
task state is emitted only after temporary-file cleanup settles.

Process-wrapper regressions cover a child ignoring graceful termination, bounded
stdout retention during forced termination, progress-consumer exceptions, and
literal argv preservation for Windows-style paths, Unicode and shell characters.
The same suite is also run by the Windows workflow, so successful Windows CI
adds native process/argv, NTFS publication, Unicode-path and real conversion
coverage; Linux results alone are not evidence of Windows execution.

## Windows CI and remaining manual acceptance

`.github/workflows/windows.yml` runs the complete no-skip suite on Windows Server
2025 with pinned, checksum-verified FFmpeg and opus-tools distributions linked
from their upstream download pages. It builds the renderer and launches the
locked official Electron binary using an isolated temporary profile. The smoke
harness checks the production window/renderer, sandboxed preload, real IPC and
normal application shutdown; it adds no test hooks to production code. It also
drives DOM controls through target/encoder selection, favorites, tab/language
changes, import cancellation/failure, real FFmpeg → opusenc conversion, completed
output reveal, bulk cancellation and task removal. Only native picker results
and the OS file-manager reveal call are stubbed in the standalone harness;
conversion processes, planning, file verification and IPC are not mocked.

A successful smoke is not a visual review, physical-input acceptance, interactive
native-dialog test or proof that Explorer selected a file.
Report the observed CI result, not just the existence of this workflow.

### Manual checks still required

The owner uses Windows. Preserve argv-array spawning (`shell:false`),
`windowsHide:true`, Node path APIs, and both separators in renderer display.
Before claiming Windows-ready, test the following on a real Windows desktop:

- Build/start with pinned Node/Bun and local FFmpeg/ffprobe; optionally add
  opusenc. Verify missing mandatory vs optional tool messages and restart discovery.
- Native file/folder/output dialogs: cancellation, empty folder, repeated clicks,
  output-folder reset, and import while switching tabs/targets.
- Paths with spaces, Chinese characters, ampersands and non-system drive letters.
  Confirm filenames remain literal and no shell window/command interpretation.
- Real video → audio and FFmpeg → opusenc routes; mono/stereo/5.1, float and
  integer PCM, corrupted inputs and same-format stream copy.
- NTFS: existing destination names produce a suffix; source and previous outputs
  remain unchanged. Unsupported hard-link volumes (including common exFAT USB
  drives) must fail clearly without overwriting anything. A safe fallback is not
  implemented and must not be claimed.
- Cancel during encoding and verification; close during active work. Check child
  processes stop, temporary files are cleaned or a concrete cleanup warning shown,
  and status never becomes done before cleanup settles.
- Favorite/offline settings survive restart and legacy settings migrate without
  replacement. Review late task updates, selection and repeated-action behavior.
- Inspect actual window layout, keyboard navigation, language switching and
  narrow-window behavior; the Linux build alone does not verify these.

Signing/installers and GPU/hardware encoding remain separate future scopes. Do not
add hardware flags or claim GPU support as part of the current audio pipeline.

## Packaged Windows acceptance

CI builds the actual unsigned x64 portable folder, then Playwright Electron
launches a relocated copy outside the checkout and empty cwd. It asserts
app.isPackaged, app.asar, the production renderer, context isolation and early
userData isolation. A minimal-PATH launch checks missing-tool UI; installed-tool
launch drives target/encoder/import/start/reveal through real UI and IPC, verifies
the FFmpeg→opusenc route, decodes output independently, and preserves input bytes.
Only OS picker return values and Explorer reveal are stubbed. These are not
interactive native dialog, signing, SmartScreen or installer tests. The artifact
contains matching tracked source, build provenance and inclusive license notices.
