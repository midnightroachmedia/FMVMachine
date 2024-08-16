const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    }
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
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

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
