<script>
  import {_} from 'svelte-i18n';
  import store from '$lib/store.svelte.js';
  let {task} = $props();
</script>
<button data-testid="task-row" data-task-id={task.id} data-status={task.status} onclick={() => { store.selectedTask = task.id; }} aria-pressed={store.selectedTask === task.id}
  class="w-full text-left border-b p-3 hover:bg-muted focus-visible:outline-2" class:bg-muted={store.selectedTask === task.id}>
  <div class="flex justify-between gap-2"><span class="font-medium truncate">{task.inputPath.split(/[\\/]/).pop()}</span><span>.{task.target.format}</span></div>
  <div class="text-xs text-muted-foreground mt-1">{$_(`conversion.status.${task.status}`)}</div>
  {#if task.status === 'running'}<progress aria-label={$_('conversion.progress')} class="w-full mt-2" max="100" value={task.progress ?? 0}></progress>{/if}
</button>
