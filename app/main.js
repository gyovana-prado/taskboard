// Janela flutuante que lê ~/.claude/taskboard/sessions/*.json (escritos pelo hook)
// e mostra as tasks das sessões abertas. Mesmo padrão de janela do Clauddy.
const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SESSIONS_DIR = process.env.TASKBOARD_DIR
  ? path.join(process.env.TASKBOARD_DIR, 'sessions')
  : path.join(os.homedir(), '.claude', 'taskboard', 'sessions')
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

function readSessions() {
  const out = []
  let names = []
  try { names = fs.readdirSync(SESSIONS_DIR) } catch { return out }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try { out.push(JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, name), 'utf8'))) } catch {}
  }
  return out
}

function tick() {
  if (!win || win.isDestroyed()) return
  const payload = JSON.stringify({
    sessions: readSessions(),
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
ipcMain.on('taskboard:quit', () => app.quit())

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Taskboard', submenu: [{ role: 'quit' }] }]))
  createWindow()
})
app.on('window-all-closed', () => app.quit())
