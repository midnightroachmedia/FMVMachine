const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    autoHideMenuBar: true,
    frame: process.platform !== 'darwin',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    icon: path.join(__dirname, 'assets', 
      process.platform === 'win32' ? 'icoWindows.ico' : 
      process.platform === 'darwin' ? 'icoMacOs.icns' : 'icoLinux.png')
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
        "default-src 'self' file:; script-src 'self' 'unsafe-inline' file:; style-src 'self' 'unsafe-inline' file:;"
        ]
      }
    })
  });

  win.loadFile('index.html');
  // Uncomment the following line to open DevTools on start
  //win.webContents.openDevTools();
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  if (process.platform === 'darwin') {
    const template = [];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}

app.whenReady().then(createWindow);

if (process.platform === 'darwin') {
  app.dock.setIcon(path.join(__dirname, 'assets', 'icoMacOs.icns'));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('import-video', (event) => {
  dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] }]
  }).then(result => {
    if (!result.canceled) {
      event.reply('video-imported', result.filePaths[0]);
    }
  }).catch(err => {
    console.log(err);
  });
});

ipcMain.handle('show-save-dialog', (event, options) => {
  return dialog.showSaveDialog(options);
});

ipcMain.handle('show-open-dialog', (event, options) => {
  return dialog.showOpenDialog(options);
});

ipcMain.handle('get-temp-dir', async () => {
  const tempDir = path.join(os.tmpdir(), 'fmvmachine');
  await fs.ensureDir(tempDir);
  return tempDir;
});
