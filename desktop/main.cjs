// Blockfire desktop app (Electron). Opens the game in its own window and can
// run a multiplayer server on this computer when you click "Host game".

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { createServer, DEFAULT_PORT } = require('../server/server.cjs');

let win = null;
let server = null;

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
  ipcMain.handle('host', async (_event, port) => {
    port = Number(port) || DEFAULT_PORT;
    if (!server) {
      try {
        server = await createServer({ port, log: (s) => console.log(s) });
      } catch (err) {
        return {
          ok: false,
          error:
            err.code === 'EADDRINUSE'
              ? `Port ${port} is already in use. Close any other Blockfire server and try again.`
              : `Could not start the server: ${err.message}`,
        };
      }
    }
    return { ok: true, port: server.port, addresses: server.addresses };
  });
  ipcMain.handle('stopHost', async () => {
    if (server) {
      const s = server;
      server = null;
      await s.close();
    }
    return { ok: true };
  });
  ipcMain.handle('quit', () => app.quit());
  createWindow();
});

app.on('window-all-closed', () => app.quit());
