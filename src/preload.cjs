const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getInitData: () => ipcRenderer.invoke('app:initData'),
  closeApp: () => ipcRenderer.send('app:close'),
  minimizeApp: () => ipcRenderer.send('app:minimize'),
  addFiles: (target, folder = false) => ipcRenderer.invoke('conversion:add', target, folder),
  chooseOutputDirectory: () => ipcRenderer.invoke('conversion:outputDirectory'),
  resetOutputDirectory: () => ipcRenderer.invoke('conversion:resetOutputDirectory'),
  taskAction: (action, id) => ipcRenderer.invoke('conversion:action', action, id),
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
