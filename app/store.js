// Leitura e escrita nos registros do Claude Code. Sem dependência do Electron, testável com node.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions')   // sessões vivas, um json por pid
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks')         // <sessionId>/N.json por task
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')
const branchCache = new Map()
const aliveCache = new Map()

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


function writeAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// patch: { status?, subject? }. status 'deleted' apaga o arquivo, como o próprio Claude Code faz.
function taskSet(sessionId, id, patch) {
  const file = path.join(TASKS_DIR, sessionId, `${id}.json`)
  const t = readJson(file)
  if (!t) throw new Error(`task ${id} não encontrada em ${sessionId}`)
  if (patch.status === 'deleted') {
    fs.unlinkSync(file)
    return null
  }
  if (patch.status) t.status = patch.status
  if (typeof patch.subject === 'string' && patch.subject.trim()) t.subject = patch.subject.trim()
  writeAtomic(file, t)
  return t
}

function taskAdd(sessionId, subject) {
  const dir = path.join(TASKS_DIR, sessionId)
  fs.mkdirSync(dir, { recursive: true })
  let hw = 0
  try { hw = Number.parseInt(fs.readFileSync(path.join(dir, '.highwatermark'), 'utf8'), 10) || 0 } catch {}
  const existing = readTasks(sessionId).tasks.map((t) => Number(t.id)).filter(Number.isFinite)
  const id = Math.max(hw, ...existing, 0) + 1
  const t = {
    id: String(id),
    subject: subject.trim(),
    description: 'Criada manualmente no Taskboard.',
    status: 'pending',
    blocks: [],
    blockedBy: [],
  }
  writeAtomic(path.join(dir, `${id}.json`), t)
  fs.writeFileSync(path.join(dir, '.highwatermark'), String(id))
  return t
}

module.exports = { readSessions, readTasks, taskSet, taskAdd, TASKS_DIR, SESSIONS_DIR }
