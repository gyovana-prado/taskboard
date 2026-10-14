const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('taskboard', {
  onUpdate: (cb) => ipcRenderer.on('taskboard:update', (_e, data) => cb(data)),
  resize: (height) => ipcRenderer.send('taskboard:resize', height),
  set: (patch) => ipcRenderer.send('taskboard:set', patch),
  taskSet: (sessionId, id, patch) => ipcRenderer.send('taskboard:task-set', { sessionId, id, patch }),
  taskAdd: (sessionId, subject) => ipcRenderer.send('taskboard:task-add', { sessionId, subject }),
  quit: () => ipcRenderer.send('taskboard:quit'),
})
