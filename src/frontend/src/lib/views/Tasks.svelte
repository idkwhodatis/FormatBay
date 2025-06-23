<script>
  import {ScrollArea} from "$lib/components/ui/scroll-area/index.js";
  import {Button,buttonVariants} from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {Separator} from "$lib/components/ui/separator/index.js";
  import {Plus,FolderPlus,Play,Square,Trash2,CirclePlay,CircleStop} from "@lucide/svelte";
  import {_} from 'svelte-i18n'
  import Task from "$lib/components/Task.svelte"

  import store from "$lib/store.svelte.js"
  import {getNextTaskID} from "$lib/utils.js"

  store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"started"}
  store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"queued"}
  store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"stopped"}
  store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"done"}
</script>

<div class="flex flex-wrap gap-3 pb-1 justify-center">
  <Button onclick={()=>{console.log($state.snapshot(store.tasks));console.log(store.tasks.length)}} variant="ghost" class="rounded-sm active:bg-gray-200">
    <Plus/>{$_("left.tasks.add.tooltip")}
  </Button>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button variant="ghost" class="rounded-sm active:bg-gray-200">
          <FolderPlus/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.addfolder.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button disabled={!store.selectedTask} size="icon" variant="ghost" class="rounded-sm active:bg-gray-200">
          <Play/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.start.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button disabled={!store.selectedTask} size="icon" variant="ghost" class="rounded-sm active:bg-gray-200">
          <Square/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.stop.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button disabled={!store.selectedTask} size="icon" variant="ghost" class="rounded-sm active:bg-gray-200">
          <Trash2/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.delete.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button size="icon" variant="ghost" class="rounded-sm active:bg-gray-200">
          <CirclePlay/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.startall.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button size="icon" variant="ghost" class="rounded-sm active:bg-gray-200">
          <CircleStop/>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{$_("left.tasks.stopall.tooltip")}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>
</div>
<Separator/>

<ScrollArea class="flex h-full w-full">
  {#each Object.entries(store.tasks) as [i,t]}
    <Task id={i} task={t}/>
  {/each}
</ScrollArea>