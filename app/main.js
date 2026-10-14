// Janela flutuante que lê ~/.claude/taskboard/sessions/*.json (escritos pelo hook)
// e mostra as tasks das sessões abertas. Mesmo padrão de janela do Clauddy.
const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions')   // sessões vivas, um json por pid
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks')         // <sessionId>/N.json por task
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')
const WIDTH = 360
const MAX_HEIGHT = 520
const POLL_MS = 1000

let win = null
let lastPayload = ''
const state = { x: null, y: null, mode: 'expanded', showClosed: false, collapsed: [] }
const stateFile = () => path.join(app.getPath('userData'), 'state.json')
const branchCache = new Map()
const aliveCache = new Map()

function loadState() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(stateFile(), 'utf8'))) } catch {}
}
function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
    fs.writeFileSync(stateFile(), JSON.stringify(state))
  } catch {}
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function pidAlive(pid) {
  const hit = aliveCache.get(pid)
  if (hit && Date.now() - hit.at < 5000) return hit.alive
  let alive
  try {
    process.kill(pid, 0)
    const comm = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8', timeout: 1000 })
    alive = comm.toLowerCase().includes('claude')
  } catch (e) {
    alive = e && e.code === 'EPERM'
  }
  aliveCache.set(pid, { at: Date.now(), alive })
  return alive
}

function gitBranch(cwd) {
  if (!cwd) return null
  const hit = branchCache.get(cwd)
  if (hit && Date.now() - hit.at < 10000) return hit.branch
  let branch = null
  try {
    branch = execFileSync('git', ['-C', cwd, 'branch', '--show-current'], { encoding: 'utf8', timeout: 2000 }).trim() || null
  } catch {}
  branchCache.set(cwd, { at: Date.now(), branch })
  return branch
}

function cwdFromTranscript(sessionId) {
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS_DIR) } catch { return null }
  for (const d of dirs) {
    const f = path.join(PROJECTS_DIR, d, `${sessionId}.jsonl`)
    if (!fs.existsSync(f)) continue
    try {
      const head = fs.readFileSync(f, { encoding: 'utf8', flag: 'r' }).slice(0, 60000)
      const m = head.match(/"cwd":"([^"]+)"/)
      if (m) return m[1]
    } catch {}
  }
  return null
}

function liveSessions() {
  const out = new Map()
  let names = []
  try { names = fs.readdirSync(SESSIONS_DIR) } catch { return out }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const d = readJson(path.join(SESSIONS_DIR, name))
    if (!d || !d.sessionId || typeof d.pid !== 'number' || !pidAlive(d.pid)) continue
    out.set(d.sessionId, d)
  }
  return out
}

function readTasks(sessionId) {
  const dir = path.join(TASKS_DIR, sessionId)
  const tasks = []
  let latest = 0
  let names = []
  try { names = fs.readdirSync(dir) } catch { return { tasks, latest } }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = path.join(dir, name)
    const t = readJson(file)
    if (!t || t.status === 'deleted') continue
    try { latest = Math.max(latest, fs.statSync(file).mtimeMs) } catch {}
    tasks.push({
      id: String(t.id ?? path.basename(name, '.json')),
      subject: t.subject || '(sem título)',
      status: t.status || 'pending',
      blocked: Array.isArray(t.blockedBy) && t.blockedBy.length > 0,
    })
  }
  tasks.sort((a, b) => {
    const na = Number(a.id), nb = Number(b.id)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
    return a.id.localeCompare(b.id)
  })
  return { tasks, latest }
}

function readSessions(includeDead) {
  const live = liveSessions()
  const ids = new Set(live.keys())
  if (includeDead) {
    try {
      for (const d of fs.readdirSync(TASKS_DIR, { withFileTypes: true })) if (d.isDirectory()) ids.add(d.name)
    } catch {}
  }
  const out = []
  for (const sid of ids) {
    const meta = live.get(sid)
    const { tasks, latest } = readTasks(sid)
    const cwd = meta?.cwd || cwdFromTranscript(sid)
    const name = meta?.nameSource === 'derived' ? null : meta?.name || null
    out.push({
      session_id: sid,
      pid: meta?.pid ?? null,
      cwd,
      project: cwd ? path.basename(cwd) : '?',
      branch: gitBranch(cwd),
      name,
      kind: meta?.kind || null,
      busy: meta?.status === 'busy',
      status: meta ? 'open' : 'closed',
      updated_at: new Date(latest || meta?.startedAt || 0).toISOString(),
      tasks,
    })
  }
  return out
}

function tick() {
  if (!win || win.isDestroyed()) return
  const payload = JSON.stringify({
    sessions: readSessions(state.showClosed),
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
