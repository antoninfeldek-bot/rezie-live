// Most mezi režií (stránka) a vestavěným vysílacím jádrem
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rzNative', {
  info: () => ipcRenderer.invoke('rz:info'),
  start: cfg => ipcRenderer.invoke('rz:start', cfg),
  stop: () => ipcRenderer.invoke('rz:stop'),
  video: (u8, key) => ipcRenderer.send('rz:v', u8, key),
  audio: u8 => ipcRenderer.send('rz:a', u8),
  onStatus: cb => ipcRenderer.on('rz:status', (e, s) => cb(s)),
  onNeedKey: cb => ipcRenderer.on('rz:needKey', () => cb()),
  onLog: cb => ipcRenderer.on('rz:log', (e, l) => cb(l)),
  openFolder: p => ipcRenderer.invoke('rz:open', p),
  pickFolder: () => ipcRenderer.invoke('rz:pick')
});
