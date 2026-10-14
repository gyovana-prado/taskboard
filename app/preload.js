const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('taskboard', {
  onUpdate: (cb) => ipcRenderer.on('taskboard:update', (_e, data) => cb(data)),
  resize: (height) => ipcRenderer.send('taskboard:resize', height),
  set: (patch) => ipcRenderer.send('taskboard:set', patch),
  quit: () => ipcRenderer.send('taskboard:quit'),
})
