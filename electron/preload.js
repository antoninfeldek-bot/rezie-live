// Most mezi režií (stránka) a vestavěným vysílacím jádrem
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rzNative', {
  info: () => ipcRenderer.invoke('rz:info'),
  start: cfg => ipcRenderer.invoke('rz:start', cfg),
  stop: () => ipcRenderer.invoke('rz:stop'),
  state: () => ipcRenderer.invoke('rz:state'),
  ndiStart: cfg => ipcRenderer.invoke('rz:ndi:start', cfg),
  ndiStop: () => ipcRenderer.send('rz:ndi:stop'),
  ndiVideo: u8 => { ipcRenderer.send('rz:ndi:v', u8); return true; },
  ndiAudio: u8 => ipcRenderer.send('rz:ndi:a', u8),
  onNdi: cb => ipcRenderer.on('rz:ndi:status', (e, s) => cb(s)),
  resume: cfg => ipcRenderer.invoke('rz:resume', cfg),
  video: (u8, key) => ipcRenderer.send('rz:v', u8, key),
  audio: u8 => ipcRenderer.send('rz:a', u8),
  onStatus: cb => ipcRenderer.on('rz:status', (e, s) => cb(s)),
  onNeedKey: cb => ipcRenderer.on('rz:needKey', () => cb()),
  onLog: cb => ipcRenderer.on('rz:log', (e, l) => cb(l)),
  openFolder: p => ipcRenderer.invoke('rz:open', p),
  pickFolder: () => ipcRenderer.invoke('rz:pick')
});
