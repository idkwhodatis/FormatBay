import {applyTaskSnapshot} from './task-snapshot.js';
const store = $state({
  init: false, offlineMode: true, favorite: {}, tasks: {}, taskRevision: -1,
  selectedFormat: null, selectedEncoder: '', selectedTask: null, outputDirectory: null,
  tab: 'formats', busy: false, dialogBusy: false, taskActionBusy: false, favoriteSaving: false, error: '', tools: []
});
export default store;
export const consts = {};
export function updateTasks(snapshot) {
  const current = {revision: store.taskRevision, tasks: store.tasks, selectedTask: store.selectedTask};
  try {
    const next = applyTaskSnapshot(current, snapshot);
    if (next === current) return;
    store.taskRevision = next.revision;
    store.tasks = next.tasks;
    store.selectedTask = next.selectedTask;
  } catch (error) { store.error = error.message; }
}
export async function addFiles(folder = false) {
  if (!store.selectedFormat || store.busy || store.dialogBusy) return;
  const format = store.selectedFormat[1];
  const target = {kind: 'audio', format};
  if (format === 'opus' && store.selectedEncoder) target.encoder = store.selectedEncoder;
  store.busy = true;
  store.error = '';
  try {
    const before = new Set(Object.keys(store.tasks));
    updateTasks(await window.electronAPI.addFiles(target, folder));
    const added = Object.keys(store.tasks).find(id => !before.has(id));
    if (added) { store.selectedTask = added; store.tab = 'tasks'; }
  } catch (error) { store.error = error.message; }
  finally { store.busy = false; }
}
export async function taskAction(action, ids) {
  if (store.taskActionBusy) return;
  store.taskActionBusy = true;
  store.error = '';
  try {
    for (const id of ids) updateTasks(await window.electronAPI.taskAction(action, id));
  } catch (error) { store.error = error.message; }
  finally { store.taskActionBusy = false; }
}
