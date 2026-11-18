import {fileURLToPath, pathToFileURL} from 'node:url';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {app, BrowserWindow, ipcMain, dialog, shell} from 'electron';
import Store from 'electron-store';
import {ConversionService} from './backend/conversion/service.js';
import {FFmpegAdapter} from './backend/conversion/ffmpeg.js';
import {OpusencAdapter} from './backend/conversion/opusenc.js';
import {ToolManager} from './backend/conversion/tool-manager.js';
import {revealTaskOutput} from './backend/conversion/output.js';
import {assertTrustedSender, validateTarget, validateSetting, runTaskActionBatch} from './ipc-policy.js';
import {migrateLegacySettings} from './settings-migration.js';

const dev = !app.isPackaged && process.argv.includes('--dev');
const entry = fileURLToPath(new URL('./frontend/dist/index.html', import.meta.url));
const allowedURL = dev ? 'http://localhost:5173/' : pathToFileURL(entry).href;
let win;
let quitting = false;
let shutdownComplete = false;
let dialogOpen = false;
let outputDirectory = null;
let catalog;
let manager;
let toolOperation = false;
const installableFormats = {Audio: ['wav','flac','mp3','aac','ogg','opus']};
const initData = () => ({...catalog, installableFormats, toolManagement: manager.snapshot(), taskSnapshot: service.snapshot(), outputDirectory});
function noToolOperation() { if (toolOperation) throw new Error('Wait for tool management to finish'); }
function canManageTools() {
  noToolOperation();
  if (dialogOpen || service.list().some(task => ['ready','queued','running'].includes(task.status))) {
    throw new Error('Finish or remove pending conversion tasks and close file dialogs before changing tools.');
  }
}
async function rediscoverTools() {
  await manager.refresh();
  const commands = manager.commands();
  service.adapters = [new FFmpegAdapter({ffmpeg:commands.ffmpeg ?? 'ffmpeg', ffprobe:commands.ffprobe ?? 'ffprobe'}), new OpusencAdapter({command:commands.opusenc ?? 'opusenc'})];
  service.adapter = service.adapters[0];
  catalog = await service.initialize();
  manager.applyDiscovery(catalog.tools);
}
async function manageTool(fn) {
  canManageTools(); toolOperation = true;
  try { await fn(); await rediscoverTools(); return initData(); }
  finally { toolOperation = false; }
}
const service = new ConversionService({onChange: (tasks, revision) => {
  if (win && !win.isDestroyed()) win.webContents.send('conversion:tasks', {revision, tasks});
}});

function verify(event) { assertTrustedSender(event, win, allowedURL, quitting); }
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => { verify(event); return fn(...args); });
}
async function withDialog(fn) {
  if (dialogOpen) throw new Error('A file dialog is already open');
  dialogOpen = true;
  try { return await fn(); } finally { dialogOpen = false; }
}

app.whenReady().then(async () => {
  manager = new ToolManager({root:path.join(app.getPath('userData'),'tools'),bundledRoot:app.isPackaged ? path.join(process.resourcesPath,'tools') : undefined,onChange:snapshot=>{
    if(win && !win.isDestroyed())win.webContents.send('tools:state',snapshot);
  }});
  await rediscoverTools();
  const settings = new Store();
  await migrateLegacySettings(settings, path.join(app.getAppPath(), 'config.json'), catalog.outputFormats);
  const settingKeys = new Set(['favorite', 'offlineMode']);
  handle('app:initData', initData);
  handle('tools:install', id => manageTool(() => manager.install(id)));
  handle('tools:remove', id => manageTool(() => manager.remove(id)));
  handle('tools:refresh', () => manageTool(async () => {}));
  handle('tools:cancel', id => { manager.cancel(id); return initData(); });
  handle('store:get', key => {
    if (!settingKeys.has(key)) throw new Error('Unsupported setting');
    return settings.get(key);
  });
  handle('store:set', (key, value) => settings.set(key, validateSetting(key, value, installableFormats)));
  handle('conversion:add', (target, folder = false) => {
    noToolOperation();
    const validatedTarget = validateTarget(target, catalog.outputFormats, catalog.targetEncoders);
    if (typeof folder !== 'boolean') throw new Error('Invalid folder flag');
    return withDialog(async () => {
      const result = await dialog.showOpenDialog(win, {properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections']});
      if (result.canceled || quitting) return service.snapshot();
      let paths = result.filePaths;
      if (folder) {
        const entries = await readdir(paths[0], {withFileTypes: true});
        paths = entries.filter(e => e.isFile()).map(e => path.join(paths[0], e.name));
      }
      if (!paths.length) throw new Error('The selected folder contains no regular files. Folder import does not include subfolders.');
      if (paths.length > 200) throw new Error('Select at most 200 files. Folder import is non-recursive.');
      await service.addFiles(paths, validatedTarget);
      return service.snapshot();
    });
  });
  handle('conversion:outputDirectory', () => withDialog(async () => {
    const result = await dialog.showOpenDialog(win, {properties: ['openDirectory', 'createDirectory']});
    if (!result.canceled && !quitting) {
      await service.setOutputDirectory(result.filePaths[0]);
      outputDirectory = result.filePaths[0];
    }
    return outputDirectory;
  }));
  handle('conversion:resetOutputDirectory', async () => {
    if (dialogOpen) throw new Error('Wait for the current file operation to finish');
    await service.setOutputDirectory(null);
    outputDirectory = null;
    return null;
  });
  handle('conversion:action', (action, ids) => { noToolOperation(); return runTaskActionBatch(service, action, ids); });
  handle('conversion:revealOutput', id => revealTaskOutput(service, id, output => shell.showItemInFolder(output)));
  ipcMain.on('app:close', event => { try { verify(event); app.quit(); } catch {} });
  ipcMain.on('app:minimize', event => { try { verify(event); win.minimize(); } catch {} });
  win = new BrowserWindow({width: 1280, height: 980, minWidth: 850, minHeight: 600,
    titleBarStyle: 'hidden', webPreferences: {contextIsolation: true, sandbox: true,
      nodeIntegration: false, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url))}});
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', (event, url) => { if (url !== allowedURL) event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  // Use the exact canonical URL also checked at the IPC boundary.
  await win.loadURL(allowedURL);
}).catch(error => {
  dialog.showErrorBox('FormatBay failed to start', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  Promise.all([service.shutdown(),manager?.shutdown()]).catch(console.error).finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
