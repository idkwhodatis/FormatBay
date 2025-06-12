const {app,BrowserWindow}=require('electron')

const createWindow=()=>{
  const win=new BrowserWindow({
    width:1280,
    height:980,
    // titleBarStyle:'hidden'
    // frame:false
  })

  // win.loadFile('src/index.html')
  win.loadURL("http://localhost:5173/");
}

app.whenReady().then(() => {
  createWindow()
})