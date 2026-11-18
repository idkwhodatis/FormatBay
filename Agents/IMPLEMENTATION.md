# FormatBay contributor guide

Read AGENTS.md, ARCHITECTURE.md and SCOPE.md, then inspect git status before edits.

## Adding converters

1. Implement a main-process adapter with discover/probe/capabilities/execute.
2. Declare exact input predicates and output artifact state, tool/version,
   availability, quality cost, network requirement and user-visible loss warnings.
   Do not infer every input/output pair is compatible.
3. Add pure planner fixtures first, including inaccessible routes and cycles.
4. Integrate with backend service, not renderer. Extend output validation for any
   new media kind. Current executor/target validation is deliberately audio-only.
5. Update the actual runtime catalog, IPC validation and both locales together.
6. Add cancellation, malformed input, per-step failure, no-overwrite, cleanup and
   real-tool tests. Never auto-download tools or execute renderer-supplied commands.

## UI and IPC

Use Svelte 5 runes; `$lib` aliases src/lib. Compose generated ui/* components,
never edit them. Main and preload.cjs changes must stay in sync. Renderer task
state uses monotonic `{revision,tasks}` snapshots; never apply stale replies; all actions go through backend IDs. Subscribe to task changes
before requesting init to avoid missing updates; unregister listeners on teardown.
Output-directory changes affect new imports only. Keep en-us/zh-cn keys in sync.

## Running checks

`bun install`; `cd src/frontend && bun install`; root `bun run test` and
`bun run build`, plus `bun run check`. CI also requires `bun run check:tools`
and zero skipped integration tests. Start built app with `bun run start`; dev uses two terminals:
frontend `bun run dev` and root `bun run dev` (explicit --dev).

Definition of done: relevant tests and build pass, manual/native coverage stated
honestly, docs and locale keys synchronized, no config.json/artifacts committed,
independent review addressed, publication permitted by owner timing, no merge.
