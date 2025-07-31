const {contextBridge,ipcRenderer}=require("electron")

contextBridge.exposeInMainWorld("electronAPI",{
    getInitData:()=>{
        return new Promise((resolve)=>{
            ipcRenderer.once("app:initData",(_,data)=>resolve(data))
        });
    },
    closeApp:()=>ipcRenderer.send("app:close"),
    minimizeApp:()=>ipcRenderer.send("app:minimize"),
});

contextBridge.exposeInMainWorld("store",{
  get:(key)=>ipcRenderer.invoke("store:get",key),
  set:(key,value)=>ipcRenderer.invoke("store:set",key,value)
});