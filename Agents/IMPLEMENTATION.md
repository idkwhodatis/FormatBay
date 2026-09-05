# IMPLEMENTATION.md — FormatBay Contributor Guide for Agents

## 1. Before You Change Code

1. Read `AGENTS.md` + `Agents/ARCHITECTURE.md` + `Agents/SCOPE.md`.
2. Check `git status --short` and `git log --oneline -10` — `App.svelte` often
   carries uncommitted local tweaks.
3. Run the app the manual way (no single dev command, no tests):
   ```powershell
   Set-Location src/frontend; bun install; bun run dev     # Vite :5173
   Set-Location .; bun install; bun run dev                # Electron .
   ```

## 2. How to Add Things

### 2.1 New output format (e.g. `avif` under a new `Image` category)

1. Edit `src/backend/consts/initData.json` — add format string to
   `outputFormats.<Category>`. This is the only list the UI renders
   (`Formats.svelte:34` iterates it).
2. Add locale keys in **both** `src/frontend/src/lib/localization/en-us.json`
   and `zh-cn.json`:
   `left.formats.<categorylower>.title`. Category lookup lowercases the type
   (`Formats.svelte:36`, `Task.svelte:42`), so `Image` → `image`.
3. Verify favorite migration still works (`App.svelte:24-33` rebuilds the map
   from `outputFormats`; unknown stored keys are dropped, new keys default `false`).
4. Manual check: tile appears, star toggles + survives reload
   (`window.store.get("favorite")` in DevTools console via preload).

### 2.2 New locale string

Add the key to **both** JSONs with identical paths. Missing keys fall back to
`en-us` silently (`i18n.js:6-9`) — easy to miss, so diff the two files.
To actually switch locales today you must call `locale.set("zh-cn")` — there is
no settings UI (`App.svelte:38-40` hardcodes `en-us`).

### 2.3 New IPC channel (example: `dialog:openFiles`)

Renderer is `sandbox:true` — never `require("electron")` or Node there.

1. `src/main.js`: add `ipcMain.handle("dialog:openFiles", handler)` next to
   `store:get/set` (`main.js:42-48`). Use `dialog.showOpenDialog(win, opts)`.
2. `src/preload.js`: expose it — `openFiles:(o)=>ipcRenderer.invoke("dialog:openFiles",o)`
   inside `contextBridge.exposeInMainWorld`.
3. Renderer: call `window.electronAPI.openFiles(...)`. This is the missing piece
   that `Tasks.svelte:addFile()` needs (it builds `options` but never sends).
4. Edit `main.js` + `preload.js` together; keep the table in `AGENTS.md` in sync.

### 2.4 New task status or task action

Statuses are closed-set in `Task.svelte:11-22` (`started|queued|stopped|done`).
Adding one means: extend the `switch`, pick a `@lucide/svelte` icon, add
`left.tasks.*.tooltip` keys if it needs a toolbar button, and handle the
`started`-only progress branch (`Task.svelte:45-49`). Toolbar buttons in
`Tasks.svelte:64-123` currently have no handlers — wire them to store mutations
first, IPC execution later.

## 3. Conventions

- **Svelte 5 runes only**: `$state`, `$derived`, `$derived.by`, `$props`
  (see `store.svelte.js`, `Format.svelte:8-9`). No legacy `$:` or `export let`.
- **`$lib` alias** → `src/frontend/src/lib` (`vite.config.js:7-11`). Import UI as
  `$lib/components/ui/<name>/index.js`, views as `$lib/views/*.svelte`.
- **Do not hand-edit `lib/components/ui/*`** — generated shadcn-svelte over
  bits-ui. Compose them instead (see `Topbar.svelte`, `Tasks.svelte`).
- **Styling**: Tailwind 4 (via `@tailwindcss/vite`), `cn()` from `lib/utils.js`
  for conditional classes, `truncatePath()` for paths. Toasts via
  `svelte-sonner` (`<Toaster>` already mounted in `Tasks.svelte:46`).
- **Persistence**: only `favorite` (nested `{Type:{fmt:bool}}`) and `offlineMode`
  (bool) go through `window.store`. Snapshot Svelte proxies with
  `$state.snapshot(...)` before `set` (`Format.svelte:14`).
- **IDs**: use `getNextTaskID()` from `lib/utils.js` for new tasks — do not reuse
  the hardcoded `0-3` dummy keys.

## 4. Pitfalls (Read Before Debugging)

| # | Trap | Detail |
| - | ---- | ------ |
| 1 | `consts.json` invalid | `src/backend/consts/consts.json:10` breaks `JSON.parse`. Nothing imports it — keep it that way until someone fixes the schema. |
| 2 | Dev-only entry | `main.js:22-23` always loads Vite + opens DevTools. No prod `loadFile`, no packaging config. |
| 3 | `getInitData` once-only | `preload.js:6` uses `ipcRenderer.once`. Second call never resolves. |
| 4 | Favorite shape drift | `store.favorite` starts `[]`, becomes `{}` after boot. Guards must handle both. |
| 5 | Dummy data overwrite | `Tasks.svelte:19-22` runs on every component init and clobbers `store.tasks`. Delete deliberately, not accidentally. |
| 6 | Silent i18n fallback | Missing `zh-cn` key shows English with no warning. |
| 7 | Drag region swallows clicks | `Topbar.svelte:17` sets `-webkit-app-region:drag`; interactive children need `.no-drag`. |
| 8 | `config.json` confusion | Root copy is a sample; runtime file lives wherever `electron-store` resolves `app.getAppPath()`. Never commit it. |

## 5. Definition of Done for Agent Tasks

- `Agents/SCOPE.md` moved if a stub became real (with file:line evidence).
- Both locale files updated if user-facing text changed.
- IPC table in `AGENTS.md` updated if channels changed.
- Manual verification noted: `vite dev` + `electron .`, clicked path taken,
  reload persistence checked.
- `git status --short` shows only intended files; `config.json` untouched.
