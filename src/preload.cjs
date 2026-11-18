const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getInitData: () => ipcRenderer.invoke('app:initData'),
  installTool: id => ipcRenderer.invoke('tools:install', id),
  cancelToolInstall: id => ipcRenderer.invoke('tools:cancel', id),
  removeTool: id => ipcRenderer.invoke('tools:remove', id),
  refreshTools: () => ipcRenderer.invoke('tools:refresh'),
  onTools: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('tools:state', listener);
    return () => ipcRenderer.removeListener('tools:state', listener);
  },
  closeApp: () => ipcRenderer.send('app:close'),
  minimizeApp: () => ipcRenderer.send('app:minimize'),
  addFiles: (target, folder = false) => ipcRenderer.invoke('conversion:add', target, folder),
  chooseOutputDirectory: () => ipcRenderer.invoke('conversion:outputDirectory'),
  resetOutputDirectory: () => ipcRenderer.invoke('conversion:resetOutputDirectory'),
  taskAction: (action, ids) => ipcRenderer.invoke('conversion:action', action, ids),
  revealOutput: id => ipcRenderer.invoke('conversion:revealOutput', id),
  onTasks: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('conversion:tasks', listener);
    return () => ipcRenderer.removeListener('conversion:tasks', listener);
  }
});
contextBridge.exposeInMainWorld('store', {
  get: key => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value)
});
