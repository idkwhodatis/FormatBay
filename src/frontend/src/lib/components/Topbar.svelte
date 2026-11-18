<script>
  import {Button} from '$lib/components/ui/button/index.js';
  import {Minus, X, FolderOpen} from '@lucide/svelte';
  import {_, locale} from 'svelte-i18n';
  import store from '$lib/store.svelte.js';
  let choosing = $state(false);
  let savingOffline = $state(false);
  async function chooseOutput() {
    if (choosing) return;
    choosing = true;
    try { store.outputDirectory = await window.electronAPI.chooseOutputDirectory(); }
    catch (error) { store.error = error.message; }
    finally { choosing = false; }
  }
  async function resetOutput() {
    if (choosing) return;
    choosing = true;
    try { store.outputDirectory = await window.electronAPI.resetOutputDirectory(); }
    catch (error) { store.error = error.message; }
    finally { choosing = false; }
  }
  async function changeOffline(event) {
    const input = event.currentTarget;
    if (savingOffline) { input.checked = store.offlineMode; return; }
    const value = input.checked;
    savingOffline = true;
    try { await window.store.set('offlineMode', value); store.offlineMode = value; }
    catch (error) { input.checked = store.offlineMode; store.error = error.message; }
    finally { savingOffline = false; }
  }
</script>
<div class="flex gap-3 items-center border-b px-3 py-2" style="-webkit-app-region:drag">
  <strong class="mr-2">FormatBay</strong>
  <div class="no-drag flex items-center gap-3">
    <Button variant="ghost" disabled={choosing} onclick={chooseOutput}><FolderOpen/>{$_('topbar.outputfolder.tooltip')}</Button>
    {#if store.outputDirectory}<Button variant="ghost" disabled={choosing} onclick={resetOutput}>{$_('conversion.resetOutput')}</Button>{/if}
    <label class="text-xs flex items-center gap-1"><input type="checkbox" disabled={savingOffline} checked={store.offlineMode} onchange={changeOffline}/>{$_('topbar.offline.pure.title')}</label>
    <select aria-label={$_('conversion.language')} value={$locale} onchange={e => locale.set(e.currentTarget.value)} class="text-sm border rounded p-1">
      <option value="en-us">English</option><option value="zh-cn">简体中文</option>
    </select>
  </div>
  <div class="no-drag ml-auto flex">
    <Button size="icon" variant="ghost" aria-label={$_('topbar.minimize.tooltip')} onclick={() => window.electronAPI.minimizeApp()}><Minus/></Button>
    <Button size="icon" variant="ghost" aria-label={$_('topbar.close.tooltip')} onclick={() => window.electronAPI.closeApp()}><X/></Button>
  </div>
</div>
<style>.no-drag { -webkit-app-region: no-drag; }</style>
