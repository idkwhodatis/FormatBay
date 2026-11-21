<script>
  import {_} from 'svelte-i18n';
  import {Button} from '$lib/components/ui/button/index.js';
  import store, {toolAction} from '$lib/store.svelte.js';
  const managed = tool => tool.id !== 'ffmpeg';
  const active = tool => ['downloading', 'verifying', 'installing'].includes(tool.status);
  const size = bytes => Number.isFinite(bytes) && bytes > 0 ? `${(bytes / 1048576).toFixed(1)} MiB` : $_('toolManager.unknownSize');
  async function confirm(tool) {
    if (!managed(tool)) return;
    store.toolPrompt = null;
    await toolAction('installTool', tool.id);
  }
</script>
<div class="border-b px-3 py-2">
  <Button data-testid="tool-manager-toggle" variant="outline" aria-expanded={store.toolPanel} onclick={() => {store.toolPanel = !store.toolPanel; store.toolPrompt = null;}}>{$_('toolManager.manage')}</Button>
  {#if store.toolPanel}
    <section aria-label={$_('toolManager.manage')} class="mt-3 max-h-80 overflow-auto space-y-3">
      <p class="text-sm">{$_('toolManager.manual')}</p>
      <Button data-testid="tools-refresh" variant="outline" disabled={store.toolActionBusy || store.toolManagement.busy} onclick={() => toolAction('refreshTools')}>{$_('toolManager.refresh')}</Button>
      {#each store.toolManagement.tools as tool (tool.id)}
        {@const version = tool.installedVersion ?? (managed(tool) ? tool.version : null)}
        <article data-testid={`tool-${tool.id}`} class="border rounded p-3 space-y-2">
          <h2 class="font-medium">{tool.label}{#if version} · {version}{/if}</h2>
          <p class="text-sm">{$_('toolManager.source')}: {tool.source} · {$_('toolManager.status')}: {tool.status}</p>
          {#if !managed(tool)}<p class="text-sm">{$_('toolManager.ffmpegBundled')}</p>{/if}
          {#if tool.error}<p role="alert" class="text-red-700 break-words">{tool.error}</p>{/if}
          {#if tool.unsupportedReason}<p class="text-sm">{tool.unsupportedReason}</p>{/if}
          {#if managed(tool) && active(tool)}
            <p role="status" class="text-sm">{size(tool.bytes)} / {size(tool.total)}</p>
            <progress aria-label={tool.label} max={tool.total || 1} value={tool.total ? tool.bytes : undefined}></progress>
            <Button disabled={store.toolCancelBusy} onclick={() => toolAction('cancelToolInstall', tool.id)}>{$_('toolManager.cancelDownload')}</Button>
          {:else if managed(tool)}
            {#if tool.canInstall || tool.canUpdate}<Button data-testid={`tool-install-${tool.id}`} disabled={store.toolActionBusy || store.toolManagement.busy} onclick={() => {store.toolPrompt = tool.id;}}>{$_(tool.canUpdate ? 'toolManager.update' : 'toolManager.install')}</Button>{/if}
            {#if tool.canRemove}<Button data-testid={`tool-remove-${tool.id}`} variant="outline" disabled={store.toolActionBusy || store.toolManagement.busy} onclick={() => toolAction('removeTool', tool.id)}>{$_('toolManager.remove')}</Button>{/if}
          {/if}
          {#if managed(tool) && store.toolPrompt === tool.id}
            <div data-testid={`tool-confirm-${tool.id}`} class="border rounded p-3 space-y-2 bg-muted">
              <p>{$_('toolManager.network')}</p>
              <p class="text-sm break-all">{$_('toolManager.source')}: {tool.downloadURL}</p>
              <p class="text-sm">{$_('toolManager.size')}: {tool.total ? size(tool.total) : tool.maxBytes ? `${$_('toolManager.maximum')} ${size(tool.maxBytes)}` : size(tool.total)}</p>
              <p class="text-sm break-all">{$_('toolManager.license')}: {tool.license} · {tool.licenseURL}</p>
              {#if tool.canInstall || tool.canUpdate}<Button data-testid={`tool-confirm-install-${tool.id}`} disabled={store.toolActionBusy || store.toolManagement.busy} onclick={() => confirm(tool)}>{$_('toolManager.confirm')}</Button>{:else}<p>{$_('toolManager.manual')}</p>{/if}
              <Button data-testid="tool-dismiss" variant="outline" onclick={() => {store.toolPrompt = null;}}>{$_('toolManager.dismiss')}</Button>
            </div>
          {/if}
        </article>
      {:else}<p>{$_('toolManager.manual')}</p>{/each}
    </section>
  {/if}
</div>
