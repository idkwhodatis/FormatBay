<script>
import {Play,ListEnd,Pause,Check} from "@lucide/svelte";
import {Progress} from "$lib/components/ui/progress/index.js";
import {cn} from "$lib/utils.js"
import {_} from 'svelte-i18n'

import store from "$lib/store.svelte.js"

let {id,task}=$props();

let Status=$derived.by(()=>{
  switch(task.status){
    case "started":
      return Play;
    case "queued":
      return ListEnd;
    case "stopped":
      return Pause;
    case "done":
      return Check;
  }
})

let selected=$derived(id===store.selectedTask);
function selectTask(){
  if(selected){
    store.selectedTask=null;
  }else{
    store.selectedTask=id;
  }
}
</script>

<button onclick={selectTask} class={cn("flex flex-col relative bg-white w-full h-20 flex border-b hover:bg-gray-100 active:bg-gray-200",selected ? "bg-gray-200":"")}>
  <div class="flex flex-row pt-2 pl-2 gap-1">
    <Status/>
    {task.title}
  </div>
  <div class="flex flex-row pl-2">
    {$_("left.formats."+task.type.toLowerCase()+".title")}.{task.format}
  </div>
  {#if task.status==="started"}
    <div class="p-2">
      <Progress value={33}/>
    </div>
  {/if}
</button>