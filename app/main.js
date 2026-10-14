// Janela flutuante que lê ~/.claude/taskboard/sessions/*.json (escritos pelo hook)
// e mostra as tasks das sessões abertas. Mesmo padrão de janela do Clauddy.
const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const store = require('./store')

const WIDTH = 360
const MAX_HEIGHT = 520
const POLL_MS = 1000

let win = null
let lastPayload = ''
const state = { x: null, y: null, mode: 'expanded', showClosed: false, collapsed: [] }
const stateFile = () => path.join(app.getPath('userData'), 'state.json')

function loadState() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile(), 'utf8'))) } catch {}
}
function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
    fs.writeFileSync(stateFile(), JSON.stringify(state))
  } catch {}
}

function tick() {
  if (!win || win.isDestroyed()) return
  const payload = JSON.stringify({
    sessions: store.readSessions(state.showClosed),
    mode: state.mode,
    showClosed: state.showClosed,
    collapsed: state.collapsed,
    maxHeight: MAX_HEIGHT,
  })
  if (payload === lastPayload) return
  lastPayload = payload
  win.webContents.send('taskboard:update', JSON.parse(payload))
}

function createWindow() {
  loadState()
  const { workArea } = screen.getPrimaryDisplay()
  const x = state.x ?? workArea.x + workArea.width - WIDTH - 16
  const y = state.y ?? workArea.y + 16
  win = new BrowserWindow({
    width: WIDTH,
    height: 120,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'floating')
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.on('moved', () => {
    const [nx, ny] = win.getPosition()
    state.x = nx
    state.y = ny
    saveState()
  })
  win.webContents.on('did-finish-load', () => { lastPayload = ''; tick() })
  setInterval(tick, POLL_MS)
}

ipcMain.on('taskboard:resize', (_e, height) => {
  if (!win || win.isDestroyed()) return
  const maxH = Math.min(MAX_HEIGHT, screen.getDisplayMatching(win.getBounds()).workArea.height - 32)
  const h = Math.max(44, Math.min(Math.round(height), maxH))
  const [w] = win.getSize()
  win.setSize(w, h, false)
})
ipcMain.on('taskboard:set', (_e, patch) => {
  Object.assign(state, patch)
  saveState()
  lastPayload = ''
  tick()
})
ipcMain.on('taskboard:task-set', (_e, { sessionId, id, patch }) => {
  try { store.taskSet(sessionId, id, patch) } catch (err) { console.error('task-set', err) }
  lastPayload = ''
  tick()
})
ipcMain.on('taskboard:task-add', (_e, { sessionId, subject }) => {
  try { store.taskAdd(sessionId, subject) } catch (err) { console.error('task-add', err) }
  lastPayload = ''
  tick()
})
ipcMain.on('taskboard:quit', () => app.quit())

// uma instância só: o LaunchAgent e o `open` podem tentar abrir de novo
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (win && !win.isDestroyed()) win.show() })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Taskboard', submenu: [{ role: 'quit' }] }]))
  createWindow()
})
app.on('window-all-closed', () => app.quit())
