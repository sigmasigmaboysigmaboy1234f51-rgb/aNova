// Blockfire desktop app (Electron). Opens the game in its own window.
// Online games are hosted from inside the game itself (see src/p2p.js).

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0f0e0b',
    title: 'Blockfire',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A host keeps running the game for friends even when minimised.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Links (like the README's) open in the normal browser, never in the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// No menu bar, which also means Ctrl+W can't close the game mid-sprint.
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  ipcMain.handle('quit', () => app.quit());
  createWindow();
});

app.on('window-all-closed', () => app.quit());
