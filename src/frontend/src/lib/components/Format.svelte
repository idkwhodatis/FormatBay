<script>
  import {Button} from "$lib/components/ui/button/index.js";
  import {Star} from "@lucide/svelte";
  
  import store from "$lib/store.svelte.js"

  let {type,format,showInFav=false}=$props();
  let faved=$derived(store.favorite)

  function favorite(){
    console.log(type);
    console.log(format);
  }
</script>

<div class="relative p-4 rounded-xl border shadow-sm bg-white w-32 h-24 flex items-center justify-center text-sm">
  {#if showInFav}
    {type}
  {/if}
  .{format}

  <Button onclick={favorite} size="icon" variant="ghost" class="absolute top-1 right-1 h-6 w-6 p-0">
    <Star class="h-4 w-4"/>
  </Button>
</div>