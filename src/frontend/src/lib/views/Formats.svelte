<script>
  import {ScrollArea} from "$lib/components/ui/scroll-area/index.js";
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import {consts} from "$lib/store.svelte.js"
  import Format from "$lib/components/Format.svelte"
  import {_} from 'svelte-i18n'

  import store from "$lib/store.svelte.js"

  let favedFormat=$derived.by(()=>{
    return Object.entries(store.favorite).flatMap(([type,formats])=>
      Object.entries(formats)
        .filter(([,val])=>val===true)
        .map(([format])=>[type,format])
    );
  })
</script>

<ScrollArea class="flex h-full w-full pr-3">
  <Accordion.Root type="multiple">
    <Accordion.Item>
      <Accordion.Trigger class="pt-3 pb-3">{$_("left.formats.favorite.title")}</Accordion.Trigger>
      <Accordion.Content>
        <div class="flex flex-wrap gap-x-2 gap-y-4">
          {#each favedFormat as i}
            <Format type={i[0]} format={i[1]} showInFav="true"/>
            <br/>
          {:else}
            No favorite item.
          {/each}
        </div>
      </Accordion.Content>
    </Accordion.Item>
    {#each Object.entries(consts.outputFormats) as [type,format]}
      <Accordion.Item>
        <Accordion.Trigger class="pt-3 pb-3">{$_("left.formats."+type.toLowerCase()+".title")}</Accordion.Trigger>
        <Accordion.Content>
          <div class="flex flex-wrap gap-x-2 gap-y-4">
            {#each format as i}
              <Format type={type} format={i}/>
              <br/>
            {/each}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    {/each}
  </Accordion.Root>
</ScrollArea>