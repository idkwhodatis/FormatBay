<script>
  import "./app.css";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import {Button} from "$lib/components/ui/button/index.js";
  import {Separator} from "$lib/components/ui/separator/index.js";
  import {X} from "@lucide/svelte";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import "$lib/localization/i18n.js";
  import {_} from 'svelte-i18n'
  import Topbar from "$lib/components/Topbar.svelte";
  import Formats from "$lib/views/Formats.svelte";
  import Tasks from "$lib/views/Tasks.svelte"

  import {onMount} from "svelte";
  import "$lib/store.svelte.js"
  import store,{consts} from "$lib/store.svelte.js"
  import {locale} from "svelte-i18n"

  onMount(async ()=>{
    const receivedConsts=await window.electronAPI.getConsts();
    Object.assign(consts,receivedConsts);

    const storedFavorite=await window.store.get("favorite") ?? {};
    const favorite=Object.fromEntries(
      Object.entries(consts.formats).map(([type,format])=>[
        type,
        Object.fromEntries(
          format.map(f=>[f,storedFavorite?.[type]?.[f] ?? false])
        )
      ])
    );
    await window.store.set("favorite",favorite);
    store.favorite=favorite;

    const storedOfflineMode=await window.store.get("offlineMode") ?? true;
    store.offlineMode=storedOfflineMode;

    locale.set("zh-cn");
    // locale.set("en-us");
    locale.subscribe(()=>console.log('locale change'));

    store.init=true;
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
              <Tabs.Trigger value="formats" class="rounded-sm data-[state=active]:text-secondary data-[state=active]:bg-primary">{$_("left.formats.title")}</Tabs.Trigger>
              <Tabs.Trigger value="tasks" class="rounded-sm data-[state=active]:text-secondary data-[state=active]:bg-primary">{$_("left.tasks.title")}</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="formats" class="h-full p-3 pt-0 pr-0">
              <Formats/>
            </Tabs.Content>
            <Tabs.Content value="tasks">
              <Tasks/>
            </Tabs.Content>
          </Tabs.Root>
        </div>

        <div class="w-2/3">
          {#if store.selectedFormat!=null}
            <div class="flex flex-row items-center gap-2">
              <div class="font-bold pl-4">
                {$_("right.topbar")}
              </div>
              {$_("left.formats."+store.selectedFormat[0].toLowerCase()+".title")}.{store.selectedFormat[1]}
              <Button onclick={()=>{store.selectedFormat=null}} variant="ghost" class="rounded-none active:bg-gray-200">
                <X/>
              </Button>
            </div>
            <Separator/>
          {/if}

          {#if store.selectedFormat==null&&store.selectedTask==null}
            <div class="flex w-full h-full justify-center items-center text-2xl relative">
              {$_("right.hintformat")}
            </div>
          {:else if store.selectedTask==null}
            <div class="flex w-full h-full justify-center items-center text-2xl relative">
              {$_("right.hinttask")}
            </div>
          {:else}
            sb
          {/if}
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