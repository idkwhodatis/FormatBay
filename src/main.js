import {app,BrowserWindow,ipcMain} from "electron";
import {fileURLToPath} from "node:url";
import Store from "electron-store";

let win;
const createWindow=()=>{
    win=new BrowserWindow({
        width:1280,
        height:980,
        webPreferences:{
            contextIsolation:true,
            sandbox:true,
            preload:fileURLToPath(new URL("preload.js",import.meta.url))
        },
        titleBarStyle:"hidden"
    });

    // win.loadFile("src/index.html")
    win.loadURL("http://localhost:5173/");
    win.webContents.openDevTools({mode:"right"});
}

app.whenReady().then(()=>{
    createWindow();
    ipcMain.on("app:close",()=>{
        app.quit()
    });

    ipcMain.on("app:minimize",()=>{
        win.minimize();
    });

    const persistStore=new Store({cwd:app.getAppPath()});
    ipcMain.handle("store:get",(event,key)=>{
        return persistStore.get(key);
    });

    ipcMain.handle("store:set",(event,key,value)=>{
        persistStore.set(key, value);
    });
})