# SCOPE.md — FormatBay Done vs. Planned

Source of truth for what agents may assume exists. When in doubt, trust code
over `README.md` roadmap and `supported.txt` wishlist.

## 1. Done (Safe to Build On)

| Area | Evidence |
| ---- | -------- |
| App shell, custom titlebar, minimize/close | `src/main.js:9-39`, `Topbar.svelte:112-137` |
| Renderer boot + init spinner | `App.svelte:19-43, 95-100` |
| Format catalog from backend constants | `initData.json:2-9`, `Formats.svelte:34-46` |
| Favorite toggle + persistence | `Format.svelte:11-15`, `App.svelte:23-33` |
| Offline-mode switch + persistence + hover explainer | `Topbar.svelte:96-110`, `en-us.json:27-38` |
| Left Tabs (Formats / Tasks) | `App.svelte:53-64` |
| Task row rendering (icon, truncated path, progress stub) | `Task.svelte:11-49` |
| i18n skeleton en-us + zh-cn, in sync | `lib/localization/*.json` (96 lines each) |
| Toast system wiring (used for add-without-format warning) | `Tasks.svelte:46, 26-30` |

## 2. Stub / Placeholder (Looks Real, Does Nothing Yet)

| Stub | Location | What is missing |
| ---- | -------- | --------------- |
| Right detail panel | `App.svelte:89-91` | renders literal `sb` when a task is selected |
| Task data | `Tasks.svelte:19-22` | 4 hardcoded dummy tasks (`C:/download/sb/...`), overwrite on every mount |
| Add file / folder | `Tasks.svelte:24-43` | builds `options` but never calls `dialog.showOpenDialog`; no IPC to main |
| Task actions | `Tasks.svelte:64-123` | Start/Stop/Delete/StartAll/StopAll buttons have no handlers (Start/Stop/Delete only `disabled` binding) |
| Menubar menus | `Topbar.svelte:19-88` | File/Edit/View/Settings/About all show identical `New Tab / New Window / Share / Print` |
| Output Folder button | `Topbar.svelte:92-94` | no `onclick`, no folder state |
| Progress | `Task.svelte:47-48` | hardcoded `value={33}` for every `started` task |
| Locale selection | `App.svelte:38-40` | hardcoded `en-us`; navigator locale ignored; no settings UI |
| Backend store | `src/backend/store.js` | `lastPath` / `cachedInputFormat` never read or written |
| Prod entry | `src/main.js:21`, `src/index.html` | `loadFile` commented out; `index.html` is stale hello-world |

## 3. Roadmap vs. Reality

`README.md:7-15`:

| Roadmap item | Status | Notes |
| ------------ | ------ | ----- |
| Basic Layout | ✅ Done | matches code |
| Video Conversion | 🔄 In-Progress | **no code exists** — no ffmpeg spawn, no progress IPC |
| Audio Conversion | ⬜ Planned | formats listed in `initData.json` only |
| OCR Integration | ⬜ Planned | `tesseract.js` not in any `package.json` |
| Structured Data Formats | ⬜ Planned | `json/yaml/xml/csv/xlsx` listed only |
| Encryption Algorithms | ⬜ Planned | only `crt/pem` listed under Certificate |

`supported.txt` lists video/audio/text/subtitle/unicode/json/obj/zip/images/font/
ppt/speech-to-text/text-to-speech — treat as **brainstorming notes**, not spec.
Canonical output list is `initData.json:2-9` (6 categories, 23 formats).

## 4. Explicitly Out of Scope (Until Scoped)

- FFmpeg / Tesseract integration, binary bundling, codec probing
  (`supported.txt:15` hints `ffmpeg -f lavfi ...` but no code calls it).
- Real file dialogs, drag-and-drop, recursive folder import.
- Conversion engine, queue scheduler, pause/resume/cancel, progress reporting.
- Output path management, overwrite rules, notifications on done.
- Settings page, locale switcher, theme, updater, crash reporting.
- Packaging/signing (`electron-builder` / `forge` absent), auto-update.
- Tests, lint, CI — none exist; do not assume hidden suites.

## 5. Working Agreements for Agents

1. Do not claim a roadmap item is done because its format string appears in
   `initData.json` — listing ≠ implementation.
2. Removing dummy tasks (`Tasks.svelte:19-22`) or the `sb` placeholder counts as
   a behavior change — call it out in the PR/summary.
3. New conversion features need an IPC + main-process design first (renderer is
   sandboxed). See `Agents/IMPLEMENTATION.md`.
4. Keep this file updated when a stub becomes real: move the row from §2 to §1
   with file:line evidence.
