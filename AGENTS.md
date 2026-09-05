# AGENTS.md — FormatBay Agent Index

> Offline-first, AI-era entry point for human and AI contributors.
> Source of truth for how this repo is structured and how to work in it.

## What Is This Repo?

FormatBay is an offline-first desktop format converter + OCR tool (`README.md:2`).
Current state (Sep 2026): **UI shell only**. Basic layout is done, no real
conversion logic exists yet. See `Agents/SCOPE.md` for done vs. planned.

## Stack

- Shell: Electron 44 (Chromium 152, Node 24) (`src/main.js`, `src/preload.js`)
- Frontend: Svelte 5.57 + Vite 8 (Rolldown) + Tailwind CSS 4.3 + shadcn-svelte (bits-ui 2.19) in `src/frontend/`
- Package manager: Bun (root `bun.lock` + `src/frontend/bun.lock`)
- Persistence: `electron-store` via IPC
- i18n: `svelte-i18n`, locales `en-us` / `zh-cn`
- Claimed but NOT integrated: FFmpeg, Tesseract.js (`README.md:27-28`)

## Agent Docs Map

| File | Purpose |
| ---- | ------- |
| `Agents/ARCHITECTURE.md` | Process model, IPC contract, data flow, frontend tree |
| `Agents/SCOPE.md` | What is done, what is stub/placeholder, roadmap |
| `Agents/IMPLEMENTATION.md` | How to add formats, locales, IPC, tasks; conventions + pitfalls |
| `Agents/UPGRADE.md` | Dependency upgrade snapshot (2026-09-05), deprecated list, migration checklists |

Read the relevant file before changing code. Keep all three in sync with code changes.

## Quickstart (Two Processes, No Single Dev Command)

There is no unified `dev` script. `dev.bat` only opens terminals, it runs nothing.

```powershell
# Terminal 1 — frontend (Vite dev server on http://localhost:5173)
Set-Location src/frontend; bun install; bun run dev

# Terminal 2 — Electron shell (expects Vite already running)
Set-Location .; bun install; bun run dev
```

Root `package.json:8` → `electron .`. Frontend `src/frontend/package.json:7` → `vite`.
`src/main.js:22` hardcodes `win.loadURL("http://localhost:5173/")` — prod `loadFile`
path is commented out. DevTools opens unconditionally (`src/main.js:23`).

## IPC Contract (Do Not Break)

Defined in `src/main.js:29-48` + exposed in `src/preload.js:3-16`:

| Channel | Direction | Payload |
| ------- | --------- | ------- |
| `app:initData` | main → renderer (push on `did-finish-load`) | contents of `src/backend/consts/initData.json` |
| `app:close` | renderer → main (`send`) | — quits app |
| `app:minimize` | renderer → main (`send`) | — minimizes window |
| `store:get` | renderer → main (`invoke`) | `(key)` → persisted value |
| `store:set` | renderer → main (`invoke`) | `(key, value)` → void |

Frontend access is only via `window.electronAPI.*` and `window.store.*`.
`contextIsolation:true, sandbox:true` (`src/main.js:13-15`) — no direct Node in renderer.

## Golden Rules for Agents

1. **Canonical format list** is `src/backend/consts/initData.json:2-9`. Do not treat
   `supported.txt` or `README.md` roadmap as spec — they are aspirational.
2. **Never commit `config.json`.** It is gitignored (`.gitignore:37`) but a sample
   copy exists at repo root. Runtime persistence lives in `electron-store`.
3. **Keep `en-us.json` / `zh-cn.json` keys in sync.** Key pattern:
   `topbar.*`, `left.formats.*`, `left.tasks.*`, `right.*`.
4. **Svelte 5 runes only** (`$state`, `$derived`, `$props`). Alias `$lib` →
   `src/frontend/src/lib` (`src/frontend/vite.config.js:7-11`).
5. **Do not hand-edit `src/frontend/src/lib/components/ui/*`.** Generated shadcn-svelte.
6. **Known-broken, docs-only flags (do not silently depend on these):**
   - `src/backend/consts/consts.json:10` is invalid JSON — nothing imports it today.
   - Right detail panel is placeholder (`src/frontend/src/App.svelte:90` renders `sb`).
   - `src/frontend/src/lib/views/Tasks.svelte:19-22` hardcodes 4 dummy tasks.
   - `addFile()` builds dialog options but never opens a dialog (`Tasks.svelte:24-43`).
   - All menubar menus show identical placeholder items (`Topbar.svelte:19-88`).

## File Ownership

- Electron lifecycle/window: `src/main.js`
- Bridge surface: `src/preload.js` (edit with `main.js` together)
- Global UI state: `src/frontend/src/lib/store.svelte.js`
- Format/task UI: `src/frontend/src/lib/views/`, `src/frontend/src/lib/components/Format.svelte`, `Task.svelte`, `Topbar.svelte`
