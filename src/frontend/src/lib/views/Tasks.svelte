<script>
  import {ScrollArea} from "$lib/components/ui/scroll-area/index.js";
  import {Button,buttonVariants} from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {Separator} from "$lib/components/ui/separator/index.js";
  import {toast} from "svelte-sonner";
  import {Toaster} from "$lib/components/ui/sonner/index.js";
  import {Plus,FolderPlus,Play,Square,Trash2,CirclePlay,CircleStop} from "@lucide/svelte";
  import {_} from 'svelte-i18n'
  import Task from "$lib/components/Task.svelte"

  import store from "$lib/store.svelte.js"
  import {getNextTaskID} from "$lib/utils.js"

  // store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"started",path:"C:/download/sb/snveds/svdsffdbjnttnjtyas"}
  // store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"queued",path:"C:/download/sb/snveds/svd"}
  // store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"stopped",path:"C:/download/sb/snveds/svd"}
  // store.tasks[getNextTaskID()]={title:"test",type:"video",format:"mp4",status:"done",path:"C:/download/sb/snveds/svd"}
  store.tasks[0]={title:"test",type:"video",format:"mp4",status:"started",path:"C:/download/sb/snveds/svdsffdbjnttnjs"}
  store.tasks[1]={title:"test",type:"video",format:"mp4",status:"queued",path:"C:/download/sb/snveds/svd"}
  store.tasks[2]={title:"test",type:"video",format:"mp4",status:"stopped",path:"C:/download/sb/snveds/svd"}
  store.tasks[3]={title:"test",type:"video",format:"mp4",status:"done",path:"C:/download/sb/snveds/svd"}

  function addFile(e,folder=false){
    if(store.selectedFormat==null){
      toast.info($_("left.tasks.add.warning"),{
        action:{
          label:"OK",
          onClick:()=>{}
      }})
    }else{
      let options={
        filters:[],
        properties:[]
      }
      if(folder){
        options.properties.push("openDirectory");
      }else{
        options.properties.push("openFile");
        options.properties.push("multiSelections");
      }
    }
  }
</script>

<Toaster position="top-center" duration={3000}/>

<div class="flex flex-wrap gap-3 pb-1 justify-center">
  <Button onclick={addFile} variant="ghost" class="rounded-sm active:bg-gray-200">
    <Plus/>{$_("left.tasks.add.tooltip")}
  </Button>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger>
        <Button onclick={(e)=>{addFile(e,true)}} variant="ghost" class="rounded-sm active:bg-gray-200">
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