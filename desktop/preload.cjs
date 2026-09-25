// The only desktop features the game page can reach.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockfireDesktop', {
  host: (port) => ipcRenderer.invoke('host', port),
  stopHost: () => ipcRenderer.invoke('stopHost'),
  quit: () => ipcRenderer.invoke('quit'),
});
