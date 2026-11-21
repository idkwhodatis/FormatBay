import {acceptsToolSnapshot} from './tool-catalog.js';
import {applyTaskSnapshot} from './task-snapshot.js';
import {buildTarget, targetKind} from './target-config.js';
const store = $state({
  init: false, offlineMode: true, favorite: {}, tasks: {}, taskRevision: -1,
  selectedFormat: null, selectedEncoder: '', selectedOptions: {}, selectedTask: null, outputDirectory: null,
  tab: 'formats', busy: false, dialogBusy: false, taskActionBusy: false, favoriteSaving: false, error: '', tools: [], toolManagement: {revision: -1, tools: [], busy: false}, toolPanel: false, toolPrompt: null, toolActionBusy: false, toolCancelBusy: false
});
export default store;
export const consts = $state({outputFormats: {}, installableFormats: {}, targetEncoders: {}, targetOptions: {}});
export function resetConfig() { store.selectedEncoder = ''; store.selectedOptions = {}; }
export function targetSelection() {
  return buildTarget(store.selectedFormat, store.selectedOptions, store.selectedEncoder,
    consts.outputFormats, consts.targetOptions, consts.targetEncoders);
}
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
  consts.targetOptions = data.targetOptions ?? {};
  store.tools = data.tools ?? [];
  store.outputDirectory = data.outputDirectory;
  updateTools(data.toolManagement);
  if (store.selectedFormat && !consts.outputFormats[store.selectedFormat[0]]?.includes(store.selectedFormat[1])) {
    store.selectedFormat = null; resetConfig();
  }
  if (!consts.targetEncoders.opus?.includes(store.selectedEncoder)) store.selectedEncoder = '';
}
export function promptTool(id) { store.toolPanel = true; store.toolPrompt = id; }
export function chooseFormat(type, format) {
  if (store.busy || store.dialogBusy || !targetKind(type)) return;
  if (!consts.outputFormats[type]?.includes(format)) { promptTool(type === 'Audio' && format === 'opus' && store.tools.some(tool => tool.id === 'ffmpeg' && tool.available) ? 'opusenc' : 'ffmpeg'); return; }
  if (store.selectedFormat?.[0] !== type || store.selectedFormat?.[1] !== format) resetConfig();
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
  if (store.busy || store.dialogBusy) return;
  const {target} = targetSelection();
  if (!target) return;
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
