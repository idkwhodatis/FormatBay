<script>
  import {Button} from '$lib/components/ui/button/index.js';
  import {_} from 'svelte-i18n';
  import Task from '$lib/components/Task.svelte';
  import store, {taskAction} from '$lib/store.svelte.js';
  let selected = $derived(store.tasks[store.selectedTask]);
  let tasks = $derived(Object.values(store.tasks));
  let acting = $derived(store.taskActionBusy);
  const act = taskAction;
</script>
<div class="flex flex-wrap gap-1 p-2 border-b">
  <Button data-testid="task-start" size="sm" variant="outline" disabled={acting || selected?.status !== 'ready'} onclick={() => act('start', [selected.id])}>{$_('left.tasks.start.tooltip')}</Button>
  <Button data-testid="task-cancel" size="sm" variant="outline" disabled={acting || !['running','queued'].includes(selected?.status)} onclick={() => act('cancel', [selected.id])}>{$_('left.tasks.stop.tooltip')}</Button>
  <Button data-testid="task-remove" size="sm" variant="ghost" disabled={acting || !selected || ['running','queued'].includes(selected.status)} onclick={() => act('remove', [selected.id])}>{$_('left.tasks.delete.tooltip')}</Button>
  <Button data-testid="task-start-all" size="sm" variant="ghost" disabled={acting || !tasks.some(t => t.status === 'ready')} onclick={() => act('start', tasks.filter(t => t.status === 'ready').map(t => t.id))}>{$_('left.tasks.startall.tooltip')}</Button>
  <Button data-testid="task-stop-all" size="sm" variant="ghost" disabled={acting || !tasks.some(t => ['running','queued'].includes(t.status))} onclick={() => act('cancel', tasks.filter(t => ['running','queued'].includes(t.status)).map(t => t.id))}>{$_('left.tasks.stopall.tooltip')}</Button>
</div>
{#each tasks as task (task.id)}<Task {task}/>{:else}<p class="p-4 text-sm text-muted-foreground">{$_('conversion.noTasks')}</p>{/each}
