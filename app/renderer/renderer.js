const ICON = { pending: '○', in_progress: '◐', completed: '●' }
const NEXT_STATUS = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' }
let editing = null // { sessionId, id } enquanto um título está em edição; segura o re-render
let adding = null // sessionId com a linha de nova task aberta
let pendingDelete = null // { sessionId, id, until }

const card = document.getElementById('card')
const body = document.getElementById('body')
const summary = document.getElementById('summary')
const dot = document.getElementById('dot')
const btnMode = document.getElementById('btn-mode')
const btnClosed = document.getElementById('btn-closed')
const btnQuit = document.getElementById('btn-quit')

let current = { sessions: [], mode: 'expanded', showClosed: false, collapsed: [], maxHeight: 520 }

function age(iso) {
  const t = Date.parse(iso || '')
  if (Number.isNaN(t)) return ''
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function visibleSessions() {
  return current.sessions
    .filter((s) => (s.tasks || []).length > 0)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
}

function render() {
  const sessions = visibleSessions()
  const total = sessions.reduce((n, s) => n + s.tasks.length, 0)
  const done = sessions.reduce((n, s) => n + s.tasks.filter((t) => t.status === 'completed').length, 0)
  const active = sessions.some((s) => s.tasks.some((t) => t.status === 'in_progress'))

  summary.textContent = total ? `${done}/${total} · ${sessions.length} ${sessions.length === 1 ? 'sessão' : 'sessões'}` : ''
  dot.classList.toggle('active', active)
  card.classList.toggle('compact', current.mode === 'compact')
  btnMode.textContent = current.mode === 'compact' ? '▸' : '▾'
  btnClosed.classList.toggle('on', current.showClosed)

  body.replaceChildren()
  if (current.mode === 'compact') return schedule()
  if (sessions.length === 0) {
    body.append(el('div', 'empty', 'Nenhuma sessão com tasks.'))
    return schedule()
  }
  const collapsed = new Set(current.collapsed || [])
  for (const s of sessions) {
    const isCollapsed = collapsed.has(s.session_id)
    const box = el('section', `session${isCollapsed ? ' collapsed' : ''}`)
    const head = el('div', 'session-head')
    head.title = isCollapsed ? 'Expandir sessão' : 'Recolher sessão'
    head.addEventListener('click', () => toggleSession(s.session_id))
    head.append(el('span', 'chev', isCollapsed ? '▸' : '▾'))
    if (s.busy) head.append(el('span', 'busy', '●'))
    head.append(el('span', 'project', s.project || '?'))
    if (s.branch) head.append(el('span', 'branch', `(${s.branch})`))
    if (s.kind === 'bg') head.append(el('span', 'kind', 'bg'))
    if (s.name) head.append(el('span', 'name', s.name))
    head.append(el('span', 'age', age(s.updated_at)))
    if (s.status === 'closed') head.append(el('span', 'closed', 'encerrada'))
    head.append(el('span', 'spacer'))
    const d = s.tasks.filter((t) => t.status === 'completed').length
    head.append(el('span', 'count', `${d}/${s.tasks.length}`))
    const addBtn = el('button', 'mini', '+')
    addBtn.title = 'Nova task nesta sessão'
    addBtn.addEventListener('click', (ev) => { ev.stopPropagation(); adding = s.session_id; render() })
    head.append(addBtn)
    box.append(head)
    for (const t of s.tasks) {
      const row = el('div', `task ${t.status}`)
      const icon = el('button', 'icon', ICON[t.status] || '?')
      icon.title = 'Clique: muda o status (pendente → em andamento → concluída)'
      icon.addEventListener('click', () => window.taskboard.taskSet(s.session_id, t.id, { status: NEXT_STATUS[t.status] || 'pending' }))
      row.append(icon)
      row.append(el('span', 'num', `${t.id}.`))
      const subject = el('span', 'subject', t.subject)
      subject.title = 'Duplo clique: editar o título'
      subject.addEventListener('dblclick', () => startEdit(subject, s.session_id, t.id, t.subject))
      row.append(subject)
      const isPending = pendingDelete && pendingDelete.sessionId === s.session_id && pendingDelete.id === t.id && Date.now() < pendingDelete.until
      const del = el('button', `del${isPending ? ' confirm' : ''}`, isPending ? 'excluir?' : '×')
      del.title = isPending ? 'Clique de novo pra excluir' : 'Excluir task'
      del.addEventListener('click', () => {
        if (isPending) {
          pendingDelete = null
          window.taskboard.taskSet(s.session_id, t.id, { status: 'deleted' })
        } else {
          pendingDelete = { sessionId: s.session_id, id: t.id, until: Date.now() + 2500 }
          render()
          setTimeout(() => { if (pendingDelete && Date.now() >= pendingDelete.until) { pendingDelete = null; render() } }, 2600)
        }
      })
      row.append(del)
      box.append(row)
    }
    if (adding === s.session_id) {
      const row = el('div', 'task adding')
      row.append(el('span', 'icon', '○'))
      const input = el('input', 'new-task')
      input.placeholder = 'Nova task… (Enter salva, Esc cancela)'
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && input.value.trim()) {
          window.taskboard.taskAdd(s.session_id, input.value)
          adding = null
        } else if (ev.key === 'Escape') {
          adding = null
          render()
        }
      })
      row.append(input)
      box.append(row)
      requestAnimationFrame(() => input.focus())
    }
    body.append(box)
  }
  schedule()
}

function startEdit(span, sessionId, id, original) {
  editing = { sessionId, id }
  span.contentEditable = 'plaintext-only'
  span.classList.add('editing')
  span.focus()
  const range = document.createRange()
  range.selectNodeContents(span)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
  const finish = (save) => {
    span.contentEditable = 'false'
    span.classList.remove('editing')
    editing = null
    const text = span.textContent.trim()
    if (save && text && text !== original) window.taskboard.taskSet(sessionId, id, { subject: text })
    else render()
  }
  span.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true) }
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false) }
  })
  span.addEventListener('blur', () => finish(true), { once: true })
}

function toggleSession(id) {
  const set = new Set(current.collapsed || [])
  if (set.has(id)) set.delete(id)
  else set.add(id)
  window.taskboard.set({ collapsed: [...set] })
}

let raf = 0
function schedule() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    // corpo rola a partir da altura máxima; a janela cresce até lá e para
    const header = document.getElementById('header').offsetHeight
    body.style.maxHeight = `${current.maxHeight - header - 12}px`
    window.taskboard.resize(card.offsetHeight + 2)
  })
}

btnMode.addEventListener('click', () => {
  window.taskboard.set({ mode: current.mode === 'compact' ? 'expanded' : 'compact' })
})
btnClosed.addEventListener('click', () => window.taskboard.set({ showClosed: !current.showClosed }))
btnQuit.addEventListener('click', () => window.taskboard.quit())
document.getElementById('header').addEventListener('dblclick', () => btnMode.click())

window.taskboard.onUpdate((data) => {
  current = data
  if (editing) return // o próximo update redesenha
  render()
})
// idade das sessões muda mesmo sem evento novo
setInterval(() => { if (!editing && !adding) render() }, 30000)
