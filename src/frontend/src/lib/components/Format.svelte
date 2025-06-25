<script>
  import {Button} from "$lib/components/ui/button/index.js";
  import {Star} from "@lucide/svelte";
  import {_} from 'svelte-i18n'
  
  import store from "$lib/store.svelte.js"

  let {type,format,showInFav=false}=$props();
  let faved=$derived(store.favorite[type][format])

  async function toggleFav(e){
    e.stopPropagation();
    store.favorite[type][format]=!store.favorite[type][format];
    await window.store.set("favorite",$state.snapshot(store.favorite));
  }
</script>

<button onclick={()=>{store.selectedFormat=[type,format]}} class="relative rounded-lg shadow-sm bg-white w-28 h-22 flex items-center justify-center border hover:bg-gray-200 active:bg-gray-300">
  {#if showInFav}
    <div class="absolute top-2 left-2 text-base italic">{$_("left.formats."+type.toLowerCase()+".title")}</div>
  {/if}
  <div class="absolute bottom-2 right-2 text-4xl font-medium tracking-tight text-muted-foreground">.{format}</div>

  <Button onclick={toggleFav} size="icon" variant="ghost" class="absolute top-1 right-1 h-6 w-6 p-0">
    <Star fill={faved?"primary":"none"} class="h-4 w-4"/>
  </Button>
</button>