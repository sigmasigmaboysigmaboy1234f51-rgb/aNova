// The only desktop features the game page can reach.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockfireDesktop', {
  quit: () => ipcRenderer.invoke('quit'),
});
