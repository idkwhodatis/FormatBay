# ARCHITECTURE.md — FormatBay System Architecture

## 1. Process Model (Electron)

```
┌──────────────┐   IPC (send/invoke + push)   ┌─────────────────────┐
│ Electron     │ ◄──────────────────────────► │ Preload bridge      │
│ Main         │                               │ src/preload.js      │
│ src/main.js  │                               │ contextBridge only  │
└──────┬───────┘                               └──────────┬──────────┘
       │ loads                                         │ exposes
       │ http://localhost:5173                         │ window.electronAPI
       ▼                                               │ window.store
┌──────────────────────────────────────────────────────▼──────────┐
│ Renderer: Svelte 5 + Vite dev server (src/frontend/)            │
│ App.svelte → Topbar + Tabs(Formats | Tasks) + right detail pane │
└─────────────────────────────────────────────────────────────────┘
```

Window config (`src/main.js:9-24`): `1280x980`, `titleBarStyle:"hidden"`,
`contextIsolation:true, sandbox:true`, preload at `src/preload.js:16`.
Renderer has **no Node access** — everything privileged goes through IPC.

`src/index.html` (root) is a stale Electron hello-world. It is **not** loaded;
`win.loadFile` is commented out (`src/main.js:21`). Dev entry is Vite only.

## 2. Backend (`src/backend/`)

Almost entirely stub:

- `consts/initData.json` — **canonical runtime constants**, pushed to renderer
  on every load via `app:initData` (`src/main.js:6,29-31`):
  ```json
  { "outputFormats": { "Video": [...8], "Audio": [...4], "OCR": [...2],
    "Text": [...2], "Data": [...5], "Certificate": [...2] },
    "locales": { "en-us": "English", "zh-cn": "简体中文" } }
  ```
- `consts/consts.json` — **broken, unused**. Line 10 (`"mkv","webm",...` without
  keys) is invalid JSON. Nothing imports it. Do not import until fixed.
- `store.js:1-9` — unused frontend-shape stub (`lastPath`, `cachedInputFormat`).
  Real persistence is `electron-store` in main (`src/main.js:41-48`,
  `cwd:app.getAppPath()`).

## 3. Bridge (`src/preload.js:3-16`)

```js
window.electronAPI.getInitData() // once("app:initData") → Promise<initData>
window.electronAPI.closeApp()    // send("app:close")
window.electronAPI.minimizeApp() // send("app:minimize")
window.store.get(key)            // invoke("store:get", key)
window.store.set(key, value)     // invoke("store:set", key, value)
```

`getInitData` uses `ipcRenderer.once` — resolves only on first load.
Calling it twice hangs the second call.

## 4. Frontend (`src/frontend/src/`)

Entry: `main.js:1-9` mounts `App.svelte` into `#app`. `app.css` is Tailwind 4.

### 4.1 Boot sequence (`App.svelte:19-43`)

1. `await window.electronAPI.getInitData()` → `Object.assign(consts, initData)`.
2. `await window.store.get("favorite")` → build favorite map from
   `consts.outputFormats` (default `false`), write back, assign to
   `store.favorite`.
3. `await window.store.get("offlineMode") ?? true` → `store.offlineMode`.
4. `locale.set("en-us")` (hardcoded, overrides navigator), then `store.init=true`.
5. Until `init`, UI shows spinner (`App.svelte:96-99`).

### 4.2 Global state (`lib/store.svelte.js:1-11`)

```js
store = $state({ init:false, offlineMode:true, favorite:[],
                 tasks:{}, selectedFormat:null, selectedTask:null })
export const consts = {}; // mutated in place by App.svelte
```

Note shape drift: initial `favorite:[]` becomes an object keyed by type after
boot. `selectedFormat=[type, format]` pair; `selectedTask=id` string key into
`tasks{}`.

### 4.3 Layout (`App.svelte:48-93`)

- Left `w-1/3`: `Tabs.Root(value="formats")` → `Formats.svelte` | `Tasks.svelte`.
- Right `w-2/3`: header `Converting To: {Type}.{format}` + close `X` if
  `selectedFormat`; body is 3-way conditional — no selection → `right.hintformat`,
  format-only → `right.hinttask`, task selected → literal `sb` placeholder.

### 4.4 Views and components

- `lib/views/Formats.svelte` — Favorite accordion (derived from
  `store.favorite===true`) + one accordion per `consts.outputFormats` entry.
  Renders `Format.svelte` tiles.
- `lib/components/Format.svelte` — tile button: click sets
  `store.selectedFormat`; star toggles `store.favorite[type][format]` +
  `window.store.set("favorite", snapshot)`.
- `lib/views/Tasks.svelte` — toolbar (Add/AddFolder/Start/Stop/Delete/
  StartAll/StopAll) + `ScrollArea` of `Task.svelte`. `addFile()` only toasts
  when no format is selected; otherwise builds unused `options` object.
- `lib/components/Task.svelte` — row button: icon by `status`
  (`started→Play, queued→ListEnd, stopped→Pause, done→Check`),
  `truncatePath(path)`, progress bar only when `started` (hardcoded `33`).
- `lib/components/Topbar.svelte` — draggable `Menubar` (5 placeholder menus),
  Output Folder button (no-op), offline `Switch` persisted on change
  (`Topbar.svelte:99`), minimize/close wired to IPC. `.no-drag` CSS re-enables
  clicks inside drag region.

### 4.5 i18n (`lib/localization/`)

`svelte-i18n`, `register('en-us'|'zh-cn', lazy import)` + `init({fallback:'en-us'})`
in `i18n.js`. Both JSONs are 96 lines, keys in sync. Templates use
`$_("left.formats."+type.toLowerCase()+".title")` — so category keys **must**
stay lowercase-matching (`video, audio, ocr, text, data, certificate`).
Additional keys: `left.tasks.*.tooltip`, `topbar.offline.pure|download.*`.

### 4.6 Utils (`lib/utils.js`)

`cn(...inputs)` (clsx + tailwind-merge), `getNextTaskID()` (monotonic counter,
currently unused — dummy tasks use literal `0-3`), `truncatePath(path, l=35)`
keeps ends with `.....` middle.

## 5. Config, Build, Dependencies

- Root `package.json`: `electron@37`, `electron-store@10`, scripts `dev→electron .`.
- Frontend `package.json`: `svelte@5`, `vite@7`, `tailwindcss@4` (via
  `@tailwindcss/vite`), `bits-ui`, `@lucide/svelte`, `svelte-i18n`,
  `svelte-sonner`. Alias `$lib → src/lib` (`vite.config.js:7-11`).
- No test runner, linter, formatter, CI, or packaging (no electron-builder/forge).
- `config.json` at root is a sample of persisted shape (`favorite`, `offlineMode`);
  gitignored, never commit changes to it.
