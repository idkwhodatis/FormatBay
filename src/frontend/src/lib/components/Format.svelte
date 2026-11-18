<script>
  import {Star} from '@lucide/svelte';
  import {_} from 'svelte-i18n';
  import store from '$lib/store.svelte.js';
  let {type, format, showInFav = false} = $props();
  let faved = $derived(store.favorite[type]?.[format] === true);
  async function toggleFav() {
    if (store.favoriteSaving) return;
    store.favoriteSaving = true;
    const previous = faved;
    store.favorite[type][format] = !previous;
    try { await window.store.set('favorite', $state.snapshot(store.favorite)); }
    catch (error) { store.favorite[type][format] = previous; store.error = error.message; }
    finally { store.favoriteSaving = false; }
  }
</script>
<div class="relative rounded-lg border w-28 h-22" class:bg-muted={store.selectedFormat?.[1] === format}>
  <button class="w-full h-full text-left p-3 pt-8 rounded-lg hover:bg-muted" aria-pressed={store.selectedFormat?.[1] === format} onclick={() => {if (store.selectedFormat?.[0] !== type || store.selectedFormat?.[1] !== format) store.selectedEncoder = ''; store.selectedFormat = [type, format]; store.selectedTask = null;}}>
    {#if showInFav}<span class="text-xs">{$_('left.formats.' + type.toLowerCase() + '.title')}</span>{/if}
    <span class="text-2xl block">.{format}</span>
  </button>
  <button disabled={store.favoriteSaving} onclick={toggleFav} aria-label={`${$_('left.formats.favorite.title')} .${format}`} aria-pressed={faved} class="absolute top-1 right-1 p-1 rounded hover:bg-gray-200"><Star size={16} fill={faved ? 'currentColor' : 'none'}/></button>
</div>
