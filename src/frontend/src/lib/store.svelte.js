const store = $state({
  init: false, offlineMode: true, favorite: {}, tasks: {},
  selectedFormat: null, selectedTask: null, outputDirectory: null,
  tab: 'formats', busy: false, error: '', tools: []
});
export default store;
export const consts = {};
export function updateTasks(tasks) {
  store.tasks = Object.fromEntries(tasks.map(task => [task.id, task]));
  if (store.selectedTask && !store.tasks[store.selectedTask]) store.selectedTask = null;
}
export async function addFiles(folder = false) {
  if (!store.selectedFormat || store.busy) return;
  const format = store.selectedFormat[1];
  store.busy = true;
  store.error = '';
  try {
    const before = new Set(Object.keys(store.tasks));
    updateTasks(await window.electronAPI.addFiles({kind: 'audio', format}, folder));
    const added = Object.keys(store.tasks).find(id => !before.has(id));
    if (added) { store.selectedTask = added; store.tab = 'tasks'; }
  } catch (error) { store.error = error.message; }
  finally { store.busy = false; }
}
export async function taskAction(action, ids) {
  store.error = '';
  try {
    for (const id of ids) updateTasks(await window.electronAPI.taskAction(action, id));
  } catch (error) { store.error = error.message; }
}
