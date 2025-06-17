<script>
  import "./app.css";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import Topbar from "$lib/components/Topbar.svelte";
  import Formats from "$lib/views/Formats.svelte";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";

  import {onMount} from "svelte";
  import "$lib/store.svelte.js"
  import store,{consts} from "$lib/store.svelte.js"

  onMount(async ()=>{
    const notFirstRun=await window.store.get("notFirstRun");
    if(!notFirstRun){
      await window.store.set("notFirstRun",true);
      const favorite=Object.fromEntries(
        Object.entries(consts.formats).map(([type,formats])=>[
          type,
          Object.fromEntries(formats.map(f=>[f,false]))
        ])
      );
      await window.store.set("favorite",favorite);
      store.favorite=favorite;
    }else{
      const favorite=await window.store.get("favorite");
      store.favorite=favorite;
    }
    store.init=true;
  });

  let mounted=false;
  $effect(async ()=>{
    if(!mounted){
      mounted=true;
      return;
    }
    await window.store.set("favorite",$state.snapshot(store.favorite));
  });
</script>

<main>
  {#if store.init}
    <div class="h-screen flex flex-col">
      <Topbar/>

      <div class="flex flex-1 h-full w-full">
        <div class="h-full w-1/3 border-r border-gray-300">
          <Tabs.Root value="formats" class="h-full w-full">
            <Tabs.List class="w-full">
              <Tabs.Trigger value="formats" class="rounded-sm transition-colors data-[state=active]:text-secondary data-[state=active]:bg-primary">Formats</Tabs.Trigger>
              <Tabs.Trigger value="tasks" class="rounded-sm transition-colors data-[state=active]:text-secondary data-[state=active]:bg-primary">Tasks</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="formats" class="h-full p-3 pt-0 pr-0">
              <Formats/>
            </Tabs.Content>
            <Tabs.Content value="tasks">
              Change your password here.
            </Tabs.Content>
          </Tabs.Root>
        </div>

        <div class="w-2/3 p-4">
          Right Panel
        </div>
      </div>
    </div>
  {:else}
    <div class="h-screen w-screen flex flex-col items-center justify-center gap-2 text-xl">
      <Loader2Icon class="animate-spin w-12 h-12" />
      <span>Loading...</span>
    </div>
  {/if}
</main>