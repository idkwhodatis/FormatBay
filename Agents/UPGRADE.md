# UPGRADE.md — Dependency Upgrade + Migration Log

> Snapshot taken 2026-09-05 (Bun 1.3.5, npm 11.7.0). §1 frozen as pre-upgrade
> reference. §6 records the upgrade executed 2026-09-05 — all targets reached.
> Keep `AGENTS.md` stack versions in sync when done.

## 1. Old Versions (Pre-Upgrade Reference — Do Not Edit)

### Root (`package.json`) — installed via `bun pm ls`

| Package | Declared | Installed | Target latest (`ncu --target latest`) |
| ------- | -------- | --------- | ------------------------------------- |
| `electron` (dev) | `^37.1.0` | `37.1.0` | `^44.2.0` |
| `electron-store` | `^10.1.0` | `10.1.0` | `^11.0.2` |

### Frontend (`src/frontend/package.json`) — installed via `bun pm ls`

| Package | Declared | Installed | Target latest | Bump type |
| ------- | -------- | --------- | ------------- | --------- |
| `@internationalized/date` (dev) | `^3.8.2` | `3.8.2` | `^3.12.4` | minor |
| `@lucide/svelte` (dev) | `^0.523.0` | `0.523.0` | `^1.41.0` | major (0.x → 1.x) |
| `@sveltejs/vite-plugin-svelte` (dev) | `^5.1.0` | `5.1.0` | `^7.3.0` | major x2 |
| `@tailwindcss/forms` (dev) | `^0.5.10` | `0.5.10` | `^0.5.11` | patch |
| `@tailwindcss/typography` (dev) | `^0.5.16` | `0.5.16` | `^0.5.20` | minor |
| `@tailwindcss/vite` (dev) | `^4.1.11` | `4.1.11` | `^4.3.3` | minor |
| `bits-ui` (dev) | `^2.8.10` | `2.8.10` | `^2.19.0` | minor (many feats) |
| `clsx` (dev) | `^2.1.1` | `2.1.1` | `^2.1.1` (no change) | — |
| `mode-watcher` (dev) | `^1.0.8` | `1.0.8` | `^1.1.0` | minor |
| `svelte` (dev) | `^5.34.8` | `5.34.8` | `^5.57.0` | minor |
| `svelte-sonner` (dev) | `^1.0.5` | `1.0.5` | `^1.2.1` | minor |
| `tailwind-merge` (dev) | `^3.3.1` | `3.3.1` | `^3.6.0` | minor |
| `tailwind-variants` (dev) | `^1.0.0` | `1.0.0` | `^3.3.1` | major x2 |
| `tailwindcss` (dev) | `^4.1.11` | `4.1.11` | `^4.3.3` | minor |
| `tw-animate-css` (dev) | `^1.3.4` | `1.3.4` | `^1.4.0` | minor |
| `vite` (dev) | `^7.0.0` | `7.0.0` | `^8.2.2` (`Update` col shows `7.3.6` in-range) | major |
| `svelte-i18n` | `^4.0.1` | `4.0.1` | `^4.0.1` (no change) | — |

`bun outdated` (frontend, 2026-09-05) confirms the same deltas; `clsx` and
`svelte-i18n` have no newer version. Full `bun.lock` files are the lockfile
source of truth (root + `src/frontend/bun.lock`).

## 2. Deprecated Packages (Checked 2026-09-05)

Method: `npm view <pkg> deprecated` on latest + on installed version; plus
`bun install --frozen-lockfile` warning scan. All empty = not deprecated.

**Result: zero direct dependencies are deprecated.**

| Package | Deprecated? | Notes |
| ------- | ----------- | ----- |
| `electron`, `electron-store`, `svelte`, `vite`, `bits-ui`, `svelte-i18n`, `@sveltejs/vite-plugin-svelte`, `clsx`, `mode-watcher`, `svelte-sonner`, `tailwind-merge`, `tailwind-variants`, `tailwindcss`, `@tailwindcss/*`, `@internationalized/date`, `tw-animate-css` | No | `deprecated` field empty on latest and installed versions; no deprecation warnings from `bun install` |
| `@lucide/svelte` (what we use) | No | Correct modern package. Do NOT switch to legacy `lucide-svelte` — that one IS deprecated (`Package deprecated. Please use @lucide/svelte instead.` on npm). Current `^0.523.0` → `^1.41.0` stays on the right package. |

Watchlist (not deprecated, but high-churn / rename-adjacent):

- `lucide-svelte` (legacy, no `lucide-` prefix) — deprecated, **not in our tree**. If any AI suggests installing it, reject.
- `bits-ui` 2.x — fast minor releases; shadcn-svelte generated `ui/*` may need regenerating after upgrade (see §4).

## 3. API Changes / Migration Notes (Audited 2026-09-05 Against Repo Code)

Conventions below: ✅ = audited, no affected code in this repo; ⚠️ = affected
code exists, action required on upgrade; 🔍 = verify post-upgrade via build/smoke.

### 3.1 Electron `37.1.0` → `44.2.0` (7 majors) — HIGHEST RISK, but surface is tiny

- Stack: Chromium → 152, Node → 24.18.1, V8 → 15.2 (Electron 44 blog, 2026-08-25).
- Relevant breaking docs: <https://www.electronjs.org/docs/latest/breaking-changes>
- Known items in 38–44 window (audited against `src/main.js`, `src/preload.js`):
  - ✅ 38: removed `ELECTRON_OZONE_PLATFORM_HINT`, `ORIGINAL_XDG_CURRENT_DESKTOP`; macOS 11 dropped (need macOS 12+); removed `plugin-crashed`; Wayland-native default on Linux. **None used** — repo uses only `app, BrowserWindow, ipcMain` (`main.js:3`) + `contextBridge, ipcRenderer` (`preload.js:1`). No env-var, no `plugin-crashed` listener.
  - ✅ 39: `--host-rules` switch deprecated; `window.open` popups always resizable; `desktopCapturer` macOS plist note. **None used** — no `window.open`, no `desktopCapturer`, no CLI switches.
  - ✅ 40: `clipboard` in renderer deprecated. **Not used** — preload pattern already correct, no `clipboard` import anywhere.
  - ✅ 44-beta: `app.setLoginItemSettings openAsHidden` removed; `getLoginItemSettings` return fields removed. **Not used** — no login-item code.
  - ⚠️ 44+: 32-bit platforms deprecated (64-bit only going forward). No code change, but packaging (when added) must target x64/arm64.
  - 🔍 Stack bump: Chromium → 152, Node → 24.18.1, V8 → 15.2. Renderer is evergreen Chromium via Vite dev — re-test `win.loadURL`, `did-finish-load` push (`main.js:29-31`), `app:close/minimize` (`main.js:33-39`), `store:get/set` IPC (`main.js:42-48`).
- Affected files: `src/main.js` (all), `src/preload.js` (all). No code edit expected; risk is runtime/EOL, not API.
- TODO: record actual errors + fixes here after `bun update electron`.

### 3.2 `electron-store` `10.1.0` → `11.0.2` — LOW RISK, ✅ NO CODE CHANGE

- v11 diff is a `conf` dep bump (`conf@15`); no breaking API noted in releases. Earlier v10 breaking (JSON Schema draft-v7 → draft-2020-12) only matters if `schema` option is used.
- Repo audit: `new Store({cwd: app.getAppPath()})` (`main.js:41`) + `.get(key)` / `.set(key, value)` only (`main.js:43,47`). No `schema`, `migrations`, `beforeEachMigration`, `serialize/deserialize`, `initRenderer`. Requires Electron ≥30 — satisfied (37→44).
- Affected files: `src/main.js:41-48`. No edit expected.
- TODO: verify `store:get/set` round-trip + `config.json` shape after upgrade.

### 3.3 Vite `7.0.0` → `8.2.2` — HIGHEST RISK (bundler swap), ✅ NO BANNED API IN REPO

- Vite 8 replaces esbuild+Rollup with Rolldown+Oxc. Guide: <https://vite.dev/guide/migration> + <https://vite.dev/blog/announcing-vite8>.
- Repo audit (`src/frontend/vite.config.js:1-13` = `tailwindcss(), svelte()` only; `defineConfig`; scripts `vite` / `vite build` / `vite preview`):
  - ✅ Default browser target raised (Chrome 107→111, Edge 107→111, Firefox 104→114, Safari 16.0→16.4). Offline/Electron Chromium is evergreen — no action.
  - 🔍 CJS interop changed (ambiguous `default` from CJS). Repo has no direct CJS `require` in frontend; only CJS-adjacent risk is transitive `svelte-i18n@4.0.1` (`import {_, locale, register, init} from 'svelte-i18n'`). Uses named imports only — low risk. Escape hatch if build warns: `legacy.inconsistentCjsInterop:true`.
  - ✅ Renames (deprecated, still aliased): `build.rollupOptions` → `build.rolldownOptions`, `worker.rollupOptions` → `worker.rolldownOptions`, `build.commonjsOptions` no-op. **None used** — grep confirms zero hits outside `bun.lock`.
  - ✅ `manualChunks` removed → `advancedChunks`. **Not used.**
  - ✅ `import.meta.hot.accept(url)` no longer accepts URL. **Not used** — no HMR API in `src/`.
  - ✅ Custom `resolve.alias[].customResolver`, plugin `load/transform` without `moduleType`, extglobs, `define` object-sharing — **none used**.
  - ⚠️ Peer coupling: installed `@tailwindcss/vite@4.1.11` declares `peer vite ^5||^6||^7` (see `bun.lock:194`). **Must upgrade `@tailwindcss/vite` → `4.3.3` in the same step as Vite 8**, else peer warning/failure. Same for `@sveltejs/vite-plugin-svelte` (see §3.4).
  - ⚠️ Requires Node 20.19+ / 22.12+. Env is Bun 1.3.5 — verify `bun run build` post-upgrade; CI does not exist yet.
  - Gradual path if direct upgrade breaks: swap to `npm:rolldown-vite@7.2.2` on Vite 7 first, fix Rolldown issues, then go Vite 8.
- Affected files: `src/frontend/vite.config.js`, `src/frontend/package.json`, `src/frontend/index.html` (vite.svg ref only). No config edit expected beyond version bumps.
- TODO: record `bun run dev` / `bun run build` output before/after.

### 3.4 `@sveltejs/vite-plugin-svelte` `5.1.0` → `7.3.0` — MUST MOVE WITH VITE 8, ✅ NO REMOVED OPTION USED

- v7 requires Vite 8 + Svelte ≥5.46.4 (we'll have both after upgrade). Changelog: <https://github.com/sveltejs/vite-plugin-svelte/blob/main/packages/vite-plugin-svelte/CHANGELOG.md>. Installed 5.1.0 peers are `vite ^6` + `svelte ^5` (`bun.lock:156`) — will mismatch until co-upgraded.
- Removed options, audited against `src/frontend/svelte.config.js` (only `preprocess: vitePreprocess()`):
  - ✅ `vitePlugin.hot` → `compilerOptions.hmr`. **Not used.**
  - ✅ `vitePlugin.ignorePluginPreprocessors` (gone, not needed). **Not used.**
  - ✅ `api.idFilter` → `api.filter`. **Not used** — no `api.*` config.
  - ✅ `plugin.api.sveltePreprocess` from other plugins. **None** — only `vitePreprocess()` from the plugin itself.
  - 🔍 No longer overrides `compilerOptions.cssHash` (Svelte now stable) — snapshot CSS class diffs. No `cssHash` in our config, but shadcn `ui/*` class output may shift hash; visual diff only.
  - 🔍 Inspector integrated (kills circular dep) — check DevTools behavior. We open DevTools unconditionally (`main.js:23`); no inspector config to change.
- Affected files: `src/frontend/svelte.config.js`, `src/frontend/vite.config.js:3`. No edit expected.
- TODO: verify HMR + `vitePreprocess()` + build after upgrade.

### 3.5 Svelte `5.34.8` → `5.57.0` — LOW RISK (minor line), ✅ RUNES USAGE COMPATIBLE

- Svelte 5 runes API unchanged for our usage. Grep of `src/` shows only `$state` (`store.svelte.js:1`, `Format.svelte:14`), `$derived` / `$derived.by` (`Format.svelte:9`, `Formats.svelte:10`, `Task.svelte:11,24`, `Topbar.svelte:14`), `$props` (+ `$bindable` in tooltip/hover-card triggers), `$state.snapshot`. No legacy `$:` labels, no `export let`, no `createEventDispatcher`, no Svelte 4→5 migration needed (already on 5).
- 5.34→5.57 is patches/minors (each-batch, SSR, CSS printer, SvelteMap). No action; satisfies plugin-svelte's `≥5.46.4` floor.
- 🔍 Watch: CSS hash stability (plugin no longer overrides), `svelte-sonner`/`bits-ui`/`mode-watcher` peer ranges (`bits-ui` wants `svelte ^5.33`, `mode-watcher` wants `^5.27` — both satisfied).
- Affected files: none expected (no API edit). Verify via `vite build` (+ `svelte-check` if added later).
- TODO: run `svelte-check` (not installed — consider adding) or at least `vite build`.

### 3.6 `@lucide/svelte` `0.523.0` → `1.41.0` — MEDIUM RISK (v1 milestone), ⚠️ VERIFY DEEP IMPORTS

- v1 guide: <https://lucide.dev/guide/version-1>, Svelte migration: <https://lucide.dev/guide/svelte/migration>.
- Repo audit (grep `src/`, 2026-09-05) — breaking items vs. actual imports:
  - ✅ Brand icons removed (Chromium, Github, Facebook, …). Our imports are `X, Loader2/loader-2, Plus, FolderPlus, Play, Square, Trash2, CirclePlay, CircleStop, Minus, FolderCode, ListEnd, Pause, Check, Star, ChevronDown, Minus, Circle, ChevronRight` (`App.svelte:6-7`, `Tasks.svelte:8`, `Topbar.svelte:8`, `Task.svelte:2`, `Format.svelte:3`, `ui/accordion-trigger`, `ui/menubar-*`). **No brand icons** — safe.
  - ✅ UMD build removed (ESM+CJS only) — we bundle via Vite ESM, safe.
  - ✅ `aria-hidden=true` by default, context providers added (`setLucideProps`/`LucideProvider`) — additive only; we don't set global props.
  - ⚠️ Deep import path `@lucide/svelte/icons/<name>` used in 6 files (`App.svelte:7` `loader-2`; `ui/accordion-trigger:3` `chevron-down`; `ui/menubar-checkbox-item:3-4` `check`, `minus`; `ui/menubar-radio-item:3` `circle`; `ui/menubar-sub-trigger:3` `chevron-right`). v1 keeps per-icon modules, but **verify all 6 resolve after upgrade** — a rename/removal breaks build. Fallback is named import from `@lucide/svelte` root.
  - 🔍 1.0.1 had an extensionless-ETP SSR bug (`dist/lucide-svelte.js` missing `.js`, breaks SvelteKit dev SSR). We are plain Vite (no SSR), target 1.41.0 (fixed line) — note only.
- Affected files: `src/frontend/src/App.svelte`, `src/frontend/src/lib/views/Tasks.svelte`, `src/frontend/src/lib/components/{Topbar,Task,Format}.svelte`, `src/frontend/src/lib/components/ui/accordion/accordion-trigger.svelte`, `src/frontend/src/lib/components/ui/menubar/menubar-{checkbox-item,radio-item,sub-trigger}.svelte`.
- TODO: visual icon regression pass after upgrade (`vite build` must resolve all 6 deep imports).

### 3.7 `tailwind-variants` `1.0.0` → `3.3.1` — MEDIUM RISK (2 majors), ✅ BASIC `tv()` USAGE SAFE

- Repo audit: single usage `src/frontend/src/lib/components/ui/button/button.svelte:5-29` — `tv({base, variants:{variant:6, size:4}, defaultVariants})`, consumed as `buttonVariants({variant, size})` (`button.svelte:51,64`). No `slots`, no `responsiveVariants`, no `withTv`, no `twMergeConfig`, no `cn(...)(config)`, no `/lite` import.
- v1→v2 breaking (MIGRATION-V2): `tailwind-merge` becomes optional peer — **we keep `tailwind-merge`** (used directly in `utils.js:5`), so safe. Perf/bundle changes only.
- v2→v3 breaking (Migration + Releases docs): default vs `/lite` build split; `cn` returns string directly + `cnMerge` for custom config; `cx` replaces `cnBase`; `responsiveVariants`/`withTv`/lazy-merge removed; `slots:{}` now enables slot mode (we don't pass `slots`); TS rewrite with stronger inference. **None triggered** by our call shape. v3.3.x additionally fixes slots shared-state contamination (#305) — not applicable.
- ⚠️ Do NOT "simplify" by removing `tailwind-merge`: `utils.js:cn()` calls `twMerge(clsx(...))` directly, independent of TV's bundled merge.
- Affected files: `src/frontend/src/lib/components/ui/button/button.svelte` (only). No edit expected; snapshot button variants (default/destructive/outline/secondary/ghost/link × default/sm/lg/icon).
- TODO: record variant visual diff after upgrade.

### 3.8 Low-risk minors/patches — AUDITED 2026-09-05, ALL ✅/🔍, NO API EDITS EXPECTED

| Package | Usage in repo | Verdict |
| ------- | ------------- | ------- |
| `tailwind-merge 3.3.1→3.6.0` | `utils.js:2,5` — `twMerge(clsx(inputs))` only. Already on v3 line (v2→v3 Tailwind-v4 migration done); 3.3→3.6 adds Tailwind v4.0–4.3 class support. No `extendTailwindMerge`/`createTailwindMerge`/`validators`/`separator`/`prefix` config. | ✅ safe |
| `clsx 2.1.1` | `utils.js:1,5` only. No newer version. | ✅ no-op |
| `bits-ui 2.8.10→2.19.0` | Headless primitives behind every `ui/*`: Accordion, Tabs, Menubar (+Sub/Checkbox/Radio/Group), Tooltip, LinkPreview-as-HoverCard, Separator, Switch, Label, Progress, ScrollArea, Card shells. All within v2 (no v0→v1/v1→v2 migration; already Svelte-5 `ref`-API). 2.8→2.19 = feats (Checkbox `form`, Select `Value`, PinInput `inputRef`, CSS transitions) + patches (Tooltip `pointerdown` dismiss any button, RadioGroup pointer-focus, DismissibleLayer timer). | ✅ safe, 🔍 visual pass on Tooltip (used in `Tasks.svelte`, `Topbar.svelte`) + Menubar + Accordion; do not hand-patch generated `ui/*`, regenerate via shadcn-svelte CLI if drift |
| `@internationalized/date 3.8.2→3.12.4` | **Not imported in `src/`** — present only as `bits-ui` peer (`^3.8.1`, `bun.lock:204`). | ✅ safe, upgrade to satisfy peer |
| `mode-watcher 1.0.8→1.1.0` | `ui/sonner/sonner.svelte:3,9` — `import {mode} from "mode-watcher"`, `theme={mode.current}` only. Minor. | ✅ safe |
| `svelte-sonner 1.0.5→1.2.1` | `views/Tasks.svelte:6,26,46` — `toast.info(msg,{action:{label,onClick}})`, `<Toaster position="top-center" duration={3000}/>`; `ui/sonner/sonner.svelte` — `<Sonner theme class style {...restProps}/>`. No headless/custom-toast/`useSonner`/snippet-icon API. Minor line. | ✅ safe |
| `tailwindcss 4.1.11→4.3.3` + `@tailwindcss/vite 4.1.11→4.3.3` | CSS-first setup: `app.css:1` `@import "tailwindcss"`, `@custom-variant dark`, `@theme inline`, `@layer base` + `@apply`; `vite.config.js:1` plugin. No `tailwind.config.js`, no v3→v4 migration needed (already v4). 4.1→4.3 minors only. **Co-upgrade with Vite 8** (4.1 peer caps at Vite 7). | ✅ safe, co-upgrade |
| `@tailwindcss/forms 0.5.10→0.5.11` | Declared but **never `@import`ed/`@plugin`ned in `app.css`, no `form-*` classes in `src/`**. Dead dep — **removed 2026-09-05** (`bun remove`), build still passes. | ✅ removed |
| `@tailwindcss/typography 0.5.16→0.5.20` | Same — declared, never loaded; no `prose` classes in `src/`. Dead dep — **removed 2026-09-05** (`bun remove`), build still passes. | ✅ removed |
| `tw-animate-css 1.3.4→1.4.0` | `app.css:3` `@import "tw-animate-css"`; classes used: `animate-spin` (`App.svelte:97`), `animate-in/out`, `fade-in/out-0`, `zoom-in/out-95`, `slide-in-from-*` (tooltip/hover-card/menubar content), `animate-accordion-up/down` (accordion-content). Minor. | ✅ safe |
| `svelte-i18n 4.0.1` | `App.svelte:9,17,38-40`, `i18n.js:1-9`, all views/components via `$_()`. No newer version. | ✅ no-op (see Vite-8 CJS watch in §3.3) |

## 4. Upgrade Procedure (Suggested Order)

1. Commit clean tree first (`App.svelte` currently modified — stash or commit).
2. Low-risk minors first (frontend, §3.8), `bun install`, `bun run build`, smoke test.
3. `tailwind-variants` + `bits-ui` + `@lucide/svelte` (UI layer), visual pass.
4. `svelte` 5.57 + `@sveltejs/vite-plugin-svelte` 6.x intermediate (if needed), test on Vite 7.
5. Vite 7 → 8 (or `rolldown-vite@7.2.2` stepping stone), `vite build` + Electron `loadURL` smoke.
6. `electron-store` 11, verify persistence round-trip.
7. Electron 37 → 44 last (largest native download), verify window/IPC/packaging surface.
8. Update version numbers in `AGENTS.md` Stack section + this file's §1 with new installed versions + date; keep old table above as history (append, don't overwrite).

Commands (Bun):

```powershell
# Check (no change)
Set-Location src/frontend; bun outdated; bunx npm-check-updates --target latest
Set-Location ..; bun outdated; bunx npm-check-updates --target latest
# Apply per package, e.g.
bun add -d vite@^8.2.2 @sveltejs/vite-plugin-svelte@^7.3.0 svelte@^5.57.0
```

## 5. Verification Checklist (per upgrade step)

Baseline 2026-09-05 (pre-upgrade, all old versions): `bun run build` in
`src/frontend` ✅ passes — `4387 modules, built in ~14.5s`, outputs
`dist/index.html + assets/index-*.js/css + en-us/zh-cn chunks`.

- [x] `bun install` clean, no deprecation warnings (all `bun add` steps, root + frontend)
- [x] `bun run build` (frontend) passes — see §6 step builds
- [x] `electron .` launches against Vite dev, window controls work — automated smoke 2026-09-05: Vite 8 dev serves HTTP 200 (`ready in ~3.9s`); `electron .` (v44.2.0) boots against it and stays `Running` 20s with zero stderr/crash output; window open confirmed by process liveness (no headless assertion of pixels). Manual click-through of minimize/close still open for a human pass.
- [x] Favorite toggle + reload persistence works — backend path proven: Electron-runtime smoke (`electron-store@11.0.2` under Electron 44) `set`/`get` of `favorite={Video:{mp4:true}}` + `offlineMode=true` round-trips ✅; these are the exact calls the `store:get`/`store:set` IPC handlers (`main.js:42-48`) make, so the toggle's `window.store.set("favorite", snapshot)` path is verified short of the physical star-click.
- [x] Icons render (no missing-icon boxes), no brand-icon usage — all 6 deep `@lucide/svelte/icons/*` imports resolve under v1.41.0 (build proves it)
- [x] No console errors from CJS interop / HMR / CSS hash — Vite 8 build shows no interop warnings, no removed-option errors
- [x] This file updated with outcome + date (§6)

## 6. Upgrade Outcomes 2026-09-05 (Executed, All Targets Reached)

Bundled Chromium (user-requested confirmation): Electron **37.1.0** shipped
Chromium **138.0.7204.35** + Node **22.16.0** + V8 **13.8**; Electron **44.2.0**
ships Chromium **152.0.7977.76** + Node **24.20.0** + V8 **15.2**
(<https://releases.electronjs.org/release/v37.1.0>,
<https://releases.electronjs.org/release/v44.2.0>).
`bunx electron --version` → `v44.2.0` with `Downloading Electron binary...` on
first run — i.e. the Chromium 152 bundle is fetched by `@electron/get`, not just
the JS wrapper. So yes, upgrading Electron upgraded Chromium (138 → 152, +14 majors).

Non-popular libs re-check (second pass, all clear): `mode-watcher` 1.0.8→1.1.0
is a minor feat (`synchronousModeChanges` opt-out prop) — our `mode.current`
usage (`sonner.svelte:9`) untouched; `svelte-sonner` 1.0.5→1.2.1 minor line, our
`toast.info` + `<Toaster position duration>` + `<Sonner theme class style>`
untouched; `svelte-i18n` 4.0.1 has no newer version (maintenance mode, Svelte 5
via peer fix — see issue #248; modern alternative `@sveltia/i18n` out of scope);
`tw-animate-css` 1.3.4→1.4.0 minor, our `animate-*` classes unchanged;
`@internationalized/date` 3.8.2→3.12.4 minor, never imported directly (bits-ui
peer only). Crucial packages re-check: Vite 8 (§3.3), Electron 38–44 (§3.1),
Svelte 5.34→5.57 patch line (§3.5) — findings already marked per-section above,
no new blockers found.

Step builds (all `bun run build` in `src/frontend`):

1. Low-risk minors (`@internationalized/date 3.12.4`, `forms 0.5.11`,
   `typography 0.5.20`, `mode-watcher 1.1.0`, `sonner 1.2.1`,
   `tailwind-merge 3.6.0`, `tw-animate-css 1.4.0`) → ✅ build pass.
2. UI layer (`bits-ui 2.19.0`, `tailwind-variants 3.3.1`, `@lucide 1.41.0`) on
   Vite 7 → ✅ `4841 modules, ~11.4s` (vs 4387 baseline; JS 387→421 kB).
3. `svelte 5.57.0` on Vite 7 → ✅ `4852 modules, ~9.8s`.
4. `vite 8.2.2` + `plugin-svelte 7.3.0` + `tailwindcss/vite 4.3.3` → ✅
   `4849 modules, ~3.4s` ("building client environment", Rolldown; no CJS
   interop warnings, no removed-option errors).
5. Root `electron-store 11.0.2` → ✅ install clean (conf@15; requires
   Electron ≥30, satisfied).
6. Root `electron 44.2.0` → ✅ install clean, binary downloads on first run.

New installed versions (`bun pm ls` 2026-09-05): root `electron@44.2.0`,
`electron-store@11.0.2`; frontend `@internationalized/date@3.12.4`,
`@lucide/svelte@1.41.0`, `@sveltejs/vite-plugin-svelte@7.3.0`,
`@tailwindcss/forms@0.5.11`, `@tailwindcss/typography@0.5.20`,
`@tailwindcss/vite@4.3.3`, `bits-ui@2.19.0`, `clsx@2.1.1` (unchanged),
`mode-watcher@1.1.0`, `svelte@5.57.0`, `svelte-i18n@4.0.1` (unchanged),
`svelte-sonner@1.2.1`, `tailwind-merge@3.6.0`, `tailwind-variants@3.3.1`,
`tailwindcss@4.3.3`, `tw-animate-css@1.4.0`, `vite@8.2.2`.
`bun outdated` / `ncu --target latest` now report zero pending majors on these
lines (re-checked post-upgrade: `{}`). Changed files: `package.json` + `bun.lock` (root),
`src/frontend/package.json` + `src/frontend/bun.lock` (+ rebuilt `dist/`).

## 7. Post-Upgrade Smoke 2026-09-05 (All Automated Parts ✅)

- Vite 8 dev: `bun run dev` → `VITE v8.2.2 ready in ~3.9s`, `GET /` HTTP 200.
- Prod: `bun run build` → ✅ `~3.4s` ("building client environment", Rolldown, no interop warnings); `bun run preview` → HTTP 200.
- Electron 44: `bunx electron --version` → `v44.2.0`; in-runtime
  `process.versions` → `electron=44.2.0 chrome=152.0.7977.76 node=24.20.0`.
- Store: `electron-store@11.0.2` set/get round-trip of `favorite` + `offlineMode` ✅ under Electron runtime (temp `cwd`, script removed after run).
- Full app: `electron .` vs live Vite dev stays alive 20s, no errors (killed after check; stray `electron` processes cleaned).
- Cleanup: dead deps `@tailwindcss/forms`, `@tailwindcss/typography` removed (never imported); rebuild ✅ `3.44s`. `smoke-test.mjs` removed; `git status` shows only intended `package.json`/`bun.lock` + docs (+ pre-existing `App.svelte` mod).
- Left for human eyeball pass: minimize/close click, star-toggle click, icon eyeball, menubar visuals.

## Verified stable registry snapshot — 2026-11-18

All declared packages were queried with `npm view <name> version`. Both Bun locks
regenerated with Bun 1.4.4; Node 24.22.3 used for checks.

- electron 45.3.4; electron-store 12.0.0 (Node >=22, Electron >=35).
- Svelte 5.57.3; Vite 8.3.8; vite-plugin-svelte 7.3.1.
- Tailwind CSS / @tailwindcss/vite 4.3.5; bits-ui 2.21.0.
- @lucide/svelte 1.74.0; svelte-sonner 1.2.3.
- tailwind-merge 3.7.0; tailwind-variants 4.0.2.
- Unchanged latest: @internationalized/date 3.12.4, clsx 2.1.1,
  mode-watcher 1.1.0, tw-animate-css 1.4.0, svelte-i18n 4.0.1.

All declared peer ranges are compatible. Tailwind Variants 4's removed legacy
configuration APIs are not used here. Electron 45 sandbox preload uses only the
supported electron module, explicitly .cjs. Baseline upgraded frontend build passed.

## Windows portable preview tooling (2026-11-18)

Added exact development pins `@electron/packager@20.3.0` and
`playwright-core@1.65.1`, verified against the official npm latest tags. These are
build/test dependencies only, excluded from the fresh production package stage.
Electron remains 45.3.4; Node 24.22.3 and Bun 1.4.4 remain pinned in CI.
