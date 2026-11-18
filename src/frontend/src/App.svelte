<script>
  import './app.css';
  import '$lib/localization/i18n.js';
  import {onMount} from 'svelte';
  import {_, locale} from 'svelte-i18n';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import {Button} from '$lib/components/ui/button/index.js';
  import Topbar from '$lib/components/Topbar.svelte';
  import Formats from '$lib/views/Formats.svelte';
  import Tasks from '$lib/views/Tasks.svelte';
  import store, {consts, updateTasks, addFiles} from '$lib/store.svelte.js';
  let bootError = $state('');
  let revealing = $state(false);
  async function revealOutput(id) {
    if (revealing) return;
    revealing = true; store.error = '';
    try { await window.electronAPI.revealOutput(id); }
    catch (error) { store.error = error.message; }
    finally { revealing = false; }
  }
  let selected = $derived(store.tasks[store.selectedTask]);
  onMount(() => {
    let disposed = false;
    const unsubscribe = window.electronAPI?.onTasks(updateTasks);
    (async () => {
      if (!window.electronAPI) throw new Error('Open FormatBay in Electron, not a browser.');
      const data = await window.electronAPI.getInitData();
      if (disposed) return;
      Object.assign(consts, data);
      store.tools = data.tools ?? [];
      store.outputDirectory = data.outputDirectory;
      updateTasks(data.taskSnapshot);
      const saved = await window.store.get('favorite') ?? {};
      store.favorite = Object.fromEntries(Object.entries(data.outputFormats).map(([type, formats]) =>
        [type, Object.fromEntries(formats.map(format => [format, saved[type]?.[format] === true]))]));
      store.offlineMode = await window.store.get('offlineMode') ?? true;
      locale.set(navigator.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en-us');
      store.init = true;
    })().catch(error => { bootError = error.message; });
    return () => { disposed = true; unsubscribe?.(); };
  });
</script>

<main class="h-screen flex flex-col bg-background text-foreground">
  {#if store.init}
    <Topbar/>
    {#if store.error}<div role="alert" class="p-3 bg-red-50 text-red-800 border-b">{store.error}</div>{/if}
    <div class="flex flex-1 min-h-0">
      <aside class="w-2/5 max-w-lg border-r flex flex-col min-h-0">
        <div class="p-3 border-b flex flex-wrap gap-2">
          <Button data-testid="add-files" disabled={!store.selectedFormat || store.busy || store.dialogBusy} onclick={() => addFiles()}>{$_('left.tasks.add.tooltip')}</Button>
          <Button data-testid="add-folder" variant="outline" disabled={!store.selectedFormat || store.busy || store.dialogBusy} onclick={() => addFiles(true)}>{$_('left.tasks.addfolder.tooltip')}</Button>
          <p class="text-xs text-muted-foreground w-full">{$_('conversion.importHint')}</p>
        </div>
        <Tabs.Root bind:value={store.tab} class="flex-1 min-h-0">
          <Tabs.List class="w-full">
            <Tabs.Trigger data-testid="tab-formats" value="formats">{$_('left.formats.title')}</Tabs.Trigger>
            <Tabs.Trigger data-testid="tab-tasks" value="tasks">{$_('left.tasks.title')} ({Object.keys(store.tasks).length})</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="formats" class="overflow-auto p-3"><Formats/></Tabs.Content>
          <Tabs.Content value="tasks" class="overflow-auto"><Tasks/></Tabs.Content>
        </Tabs.Root>
      </aside>
      <section class="flex-1 min-w-0 overflow-auto p-6 space-y-6">
        <header>
          <p class="text-sm text-muted-foreground">{$_('conversion.targetFirst')}</p>
          <h1 class="text-2xl font-semibold mt-1">{store.selectedFormat ? `.${store.selectedFormat[1]}` : $_('right.hintformat')}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{$_('conversion.audioScope')}</p>
          {#if store.selectedFormat?.[1] === 'opus' && consts.targetEncoders?.opus?.includes('opusenc')}
            <label class="flex items-center gap-2 mt-3 text-sm">
              {$_('conversion.encoder')}
              <select data-testid="encoder-select" bind:value={store.selectedEncoder} disabled={store.busy} class="border rounded p-2">
                <option value="">{$_('conversion.autoEncoder')}</option>
                <option value="opusenc">{$_('conversion.opusencEncoder')}</option>
              </select>
            </label>
            <p class="mt-1 text-xs text-muted-foreground">{$_('conversion.encoderHint')}</p>
          {/if}
        </header>
        {#each store.tools.filter(tool => !tool.available && !tool.optional) as tool}
          <div role="status" class="p-4 border rounded-lg bg-amber-50 text-amber-950">
            <strong>{tool.id}: {$_('conversion.unavailable')}</strong><p class="text-sm">{tool.detail}</p>
            <p class="text-sm mt-2">{$_('conversion.installTools')}</p>
          </div>
        {/each}
        {#if store.selectedFormat?.[1] === 'opus'}
          {#each store.tools.filter(tool => !tool.available && tool.optional) as tool}
            <p class="text-xs text-muted-foreground">{tool.id}: {$_('conversion.optionalTool')}</p>
          {/each}
        {/if}
        {#if selected}
          <article data-testid="task-detail" data-task-id={selected.id} data-status={selected.status} class="border rounded-lg p-5 space-y-4">
            <div class="flex justify-between gap-3"><h2 class="font-semibold break-all">{selected.inputPath.split(/[\\/]/).pop()}</h2><span>{$_(`conversion.status.${selected.status}`)}</span></div>
            <p class="text-xs text-muted-foreground break-all">{selected.inputPath}</p>
            <h3 class="font-medium">{$_('conversion.route')} → .{selected.target.format}</h3>
            {#if selected.target.format === 'opus'}<p class="text-sm text-muted-foreground">{$_('conversion.encoder')}: {selected.target.encoder ?? $_('conversion.autoEncoder')}</p>{/if}
            {#if selected.plan}
              <ol class="space-y-3">
                {#each selected.plan.steps as step, i}
                  <li data-testid="route-step" data-tool-id={step.toolId} class="p-3 bg-muted rounded" class:ring-2={selected.status === 'running' && selected.stepIndex === i} aria-current={selected.status === 'running' && selected.stepIndex === i ? 'step' : undefined}><span class="font-medium">{i + 1}. {step.label}</span><span class="text-sm text-muted-foreground block">{step.toolId} → {step.output?.format ?? step.output?.container ?? step.output?.kind ?? ''}</span></li>
                {/each}
              </ol>
              {#each selected.plan.warnings ?? [] as warning}<p data-testid="route-warning" class="text-sm text-amber-800">{warning}</p>{/each}
            {/if}
            {#if selected.error}<p role="alert" class="text-red-700 break-words">{selected.error}</p>{/if}
            {#if selected.status === 'running'}
              {#if ['converting', 'verifying'].includes(selected.phase)}
                <p class="text-sm" role="status">{$_('conversion.phase.' + selected.phase)}{#if Number.isInteger(selected.stepIndex)} · {selected.stepIndex + 1} / {selected.plan?.steps.length ?? 0}{/if}</p>
              {/if}
              <progress aria-label={$_('conversion.progress')} class="w-full" max="100" value={selected.progress ?? 0}></progress>
            {/if}
            {#if selected.outputPath}<p data-testid="task-output" class="text-sm break-all">{$_('conversion.output')}: {selected.outputPath}</p>{/if}
            {#if selected.status === 'done' && selected.outputPath}<Button data-testid="reveal-output" variant="outline" disabled={revealing} onclick={() => revealOutput(selected.id)}>{$_('conversion.revealOutput')}</Button>{/if}
          </article>
        {:else}
          <p class="py-12 text-muted-foreground">{store.selectedFormat ? $_('right.hinttask') : $_('conversion.chooseTarget')}</p>
        {/if}
        <p class="text-xs text-muted-foreground">{$_('conversion.outputHint')}</p>
        <p class="text-xs text-muted-foreground break-all">{$_('conversion.output')}: {store.outputDirectory ?? $_('conversion.besideInput')}</p>
      </section>
    </div>
  {:else}
    <div class="m-auto p-8" role="status">{bootError || 'Loading FormatBay…'}</div>
  {/if}
</main>
