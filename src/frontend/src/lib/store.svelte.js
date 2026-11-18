import {acceptsToolSnapshot} from './tool-catalog.js';
import {applyTaskSnapshot} from './task-snapshot.js';
const store = $state({
  init: false, offlineMode: true, favorite: {}, tasks: {}, taskRevision: -1,
  selectedFormat: null, selectedEncoder: '', selectedTask: null, outputDirectory: null,
  tab: 'formats', busy: false, dialogBusy: false, taskActionBusy: false, favoriteSaving: false, error: '', tools: [], toolManagement: {revision: -1, tools: [], busy: false}, toolPanel: false, toolPrompt: null, toolActionBusy: false, toolCancelBusy: false
});
export default store;
export const consts = $state({outputFormats: {}, installableFormats: {}, targetEncoders: {}});
export function updateTools(snapshot) {
  if (acceptsToolSnapshot(store.toolManagement.revision, snapshot)) store.toolManagement = snapshot;
}
export function applyInitData(data) {
  updateTasks(data.taskSnapshot);
  // A delayed reply must not undo newer download progress or catalog changes.
  if (data.toolManagement && !acceptsToolSnapshot(store.toolManagement.revision, data.toolManagement)) return;
  consts.outputFormats = data.outputFormats ?? {};
  consts.installableFormats = data.installableFormats ?? {};
  consts.targetEncoders = data.targetEncoders ?? {};
  store.tools = data.tools ?? [];
  store.outputDirectory = data.outputDirectory;
  updateTools(data.toolManagement);
  if (store.selectedFormat && !consts.outputFormats[store.selectedFormat[0]]?.includes(store.selectedFormat[1])) {
    store.selectedFormat = null; store.selectedEncoder = '';
  }
  if (!consts.targetEncoders.opus?.includes(store.selectedEncoder)) store.selectedEncoder = '';
}
export function promptTool(id) { store.toolPanel = true; store.toolPrompt = id; }
export function chooseFormat(type, format) {
  if (!consts.outputFormats[type]?.includes(format)) { promptTool(format === 'opus' && store.tools.some(tool => tool.id === 'ffmpeg' && tool.available) ? 'opusenc' : 'ffmpeg'); return; }
  if (store.selectedFormat?.[0] !== type || store.selectedFormat?.[1] !== format) store.selectedEncoder = '';
  store.selectedFormat = [type, format]; store.selectedTask = null;
}
export async function toolAction(action, id) {
  const cancel = action === 'cancelToolInstall';
  if (cancel ? store.toolCancelBusy : store.toolActionBusy) return;
  if (cancel) store.toolCancelBusy = true; else store.toolActionBusy = true;
  store.error = '';
  try { applyInitData(await window.electronAPI[action](id)); }
  catch (error) { store.error = error.message; }
  finally { if (cancel) store.toolCancelBusy = false; else store.toolActionBusy = false; }
}
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
  if (!store.selectedFormat || !consts.outputFormats[store.selectedFormat[0]]?.includes(store.selectedFormat[1]) || store.busy || store.dialogBusy) return;
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
    updateTasks(await window.electronAPI.taskAction(action, ids));
  } catch (error) { store.error = error.message; }
  finally { store.taskActionBusy = false; }
}
