<script>
  import "./app.css";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import Topbar from "$lib/components/Topbar.svelte";
  import Formats from "$lib/views/Formats.svelte";

  import {onMount} from "svelte";
  import "$lib/store.svelte.js"
  import store from "$lib/store.svelte.js"

  onMount(async ()=>{
    const favorite=await window.store.get("favorite",[]);
    if(favorite!=undefined){
      store.favorite.splice(0,store.favorite.length);
      store.favorite.push(...favorite);
    }
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
</main>