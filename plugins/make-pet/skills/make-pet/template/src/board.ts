// __PET_NAME__'s board: every Claude Code session grouped by project (orchestrator first, workers
// under it), what each is doing, numbers from its transcript, buttons to open it, and a
// Quick Chat box (typed or dictated) that starts a new Claude Code session.
import '@fontsource-variable/geist'
import './board.css'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { group, place } from './group'
import { compareGroups, compareRows } from './order'
import { LABELS, LIMITS, PRIORITY, ago, statusOf, type SessionFile, type Status } from './status'

interface Stats {
  title: string | null
  model: string | null
  branch: string | null
  firstAt: string | null
  lastAt: string | null
  turns: number
  toolCalls: number
  outputTokens: number
  contextTokens: number
  turnsToday: number
  outputToday: number
  lastPrompt: string | null
  lastReply: string | null
}

interface Row {
  session: SessionFile
  status: Status | null
  stats: Stats | null
}

/** Which of __PET_NAME__'s faces stands for each status. */
const FACES: Record<Status, string> = {
  'needs-you': 'waiting',
  blocked: 'droop',
  done: 'done',
  working: 'working',
}

const win = getCurrentWindow()
const list = document.querySelector<HTMLElement>('#list')!
const summary = document.querySelector<HTMLElement>('#summary')!
const portrait = document.querySelector<HTMLImageElement>('#portrait')!
const today = document.querySelector<HTMLElement>('#today')!
const chat = document.querySelector<HTMLFormElement>('#chat')!
const ask = document.querySelector<HTMLInputElement>('#ask')!
const folder = document.querySelector<HTMLSelectElement>('#folder')!
let expanded: string | null = null
let justOpened: string | null = null // a row the user just opened, scrolled into view after the redraw
let drawn = '' // what the list was last drawn from, so an unchanged board is not redrawn
let timer = 0
let micState: 'idle' | 'recording' | 'working' = 'idle'

// Losing focus means the user clicked elsewhere, so the board closes. Two exceptions: while the
// mic records or whisper writes (the words need somewhere to land), and in the first moments
// after opening, when Windows can hand the foreground back to the app that had it before
// the user could possibly have clicked away.
const SETTLE_MS = 700
let focusedAt = 0

await win.onFocusChanged(({ payload: focused }) => {
  if (focused) {
    focusedAt = Date.now()
    void refresh()
    window.clearInterval(timer)
    timer = window.setInterval(refresh, 2000)
  } else if (micState === 'idle' && Date.now() - focusedAt > SETTLE_MS) {
    window.clearInterval(timer)
    void invoke('hide_board')
  }
})

// ---- the mic: click to record, click again to stop; the words land in the Quick Chat box ----

const MIC_LIMIT_S = 60 // the recorder also stops itself here
const mic = document.querySelector<HTMLButtonElement>('#mic')!
const micTime = document.querySelector<HTMLElement>('#mic-time')!
let micStarted = 0
let micTicker = 0

mic.hidden = !(await invoke<boolean>('dictation_ready'))
mic.addEventListener('click', () => {
  if (micState === 'idle') void startMic()
  else if (micState === 'recording') void stopMic()
})

function setMic(state: typeof micState): void {
  micState = state
  mic.dataset.state = state
  mic.setAttribute('aria-label', state === 'recording' ? 'Stop and write it down' : 'Dictate')
  mic.title = mic.getAttribute('aria-label')!
  ask.placeholder = state === 'recording' ? 'Listening' : state === 'working' ? 'Writing it down' : 'Ask Claude something new'
  if (state !== 'recording') micTime.textContent = ''
}

async function startMic(): Promise<void> {
  try {
    await invoke('start_recording')
  } catch (error) {
    showChatError(String(error))
    return
  }
  setMic('recording')
  micStarted = Date.now()
  micTicker = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - micStarted) / 1000)
    micTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    if (seconds >= MIC_LIMIT_S) void stopMic()
  }, 250)
}

async function stopMic(): Promise<void> {
  window.clearInterval(micTicker)
  setMic('working')
  try {
    const text = await invoke<string>('stop_recording')
    if (text) ask.value = `${ask.value.trim()} ${text}`.trim()
  } catch (error) {
    showChatError(String(error))
  } finally {
    setMic('idle')
    ask.focus()
  }
}

function showChatError(message: string): void {
  ask.setCustomValidity(message)
  ask.reportValidity()
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (micState === 'idle') void invoke('hide_board')
  else if (micState === 'recording') void stopMic()
})

// ---- Quick Chat ----

// Quick Chat opens a terminal Claude Code session in the chosen folder with the text filled
// in, through Claude Code's documented claude-cli:// link. Nothing is sent until Enter there.
chat.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = ask.value.trim()
  if (!text) return
  const cwd = folder.value ? `cwd=${encodeURIComponent(folder.value)}&` : ''
  try {
    await invoke('quick_chat', { url: `claude-cli://open?${cwd}q=${encodeURIComponent(text)}` })
    ask.value = ''
    void invoke('hide_board')
  } catch (error) {
    showChatError(String(error))
  }
})
ask.addEventListener('input', () => ask.setCustomValidity(''))

/** Folders the user has run Claude in, newest first: project folders only, not worktrees. */
function updateFolders(files: SessionFile[]): void {
  const seen = new Set<string>()
  const folders = [...files]
    .sort((a, b) => b.at - a.at)
    .filter((f) => f.cwd && place(f.cwd).role === 'main' && place(f.cwd).project !== 'No folder')
    .map((f) => f.cwd!)
    .filter((cwd) => !seen.has(cwd) && seen.add(cwd))
  // Rebuilding the list while it is open would close it, so only rebuild when it changed.
  const current = [...folder.options].map((o) => o.value).filter(Boolean)
  if (current.join('\n') === folders.join('\n') && folder.options.length) return
  // First fill: the most recent project. After that, keep whatever the user picked.
  const chosen = folder.options.length ? folder.value : (folders[0] ?? '')
  folder.replaceChildren(
    ...folders.map((cwd) => new Option(place(cwd).project, cwd, false, cwd === chosen)),
    new Option('home folder', '', false, chosen === ''),
  )
}

// ---- the session list ----

async function refresh(): Promise<void> {
  const now = Date.now()
  const seenAt = Number(localStorage.getItem('seenAt') ?? 0)
  const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const files = (await invoke<SessionFile[]>('read_sessions')).filter((f) => now - f.at <= LIMITS.stale)
  updateFolders(files)

  const rows: Row[] = await Promise.all(
    files.map(async (session) => ({
      session,
      status: statusOf(session, now, seenAt),
      stats: session.transcript
        ? await invoke<Stats | null>('session_stats', { transcript: session.transcript, since }).catch(() => null)
        : null,
    })),
  )

  renderHeader(rows, now, since)

  // Redraw only when something visible changed: a redraw every two seconds would drop the
  // scroll position, the keyboard focus and a button's "Copied" note.
  const signature = JSON.stringify([
    expanded,
    rows.map((r) => [
      r.session.id,
      r.status,
      r.session.detail,
      ago(now - r.session.at),
      r.stats?.title,
      r.session.id === expanded ? [r.stats, Math.floor(now / 60000)] : null,
    ]),
  ])
  if (signature === drawn) return
  drawn = signature

  const restore = rememberPlace()
  if (rows.length === 0) {
    list.replaceChildren(emptyState())
  } else {
    const order = { groups: compareGroups, rows: compareRows }
    list.replaceChildren(
      ...group(rows, (r) => r.session.cwd, (r) => r.session.at, order).map((g) => {
        // Several sessions can run in the project folder itself; the orchestrator is taken to
        // be the one active most recently.
        const mains = g.rows.filter((r) => r.placed.role === 'main').map((r) => r.item)
        const lead = g.hasWorkers ? mains.reduce((a, b) => (b.session.at > a.session.at ? b : a)) : null
        const section = el('section', 'group')
        section.append(el('h2', '', g.project))
        for (const { item, placed } of g.rows) {
          section.append(renderRow(item, placed.role === 'worker', item === lead, now))
        }
        return section
      }),
    )
  }
  restore()
  if (justOpened) {
    list.querySelector(`[data-id="${CSS.escape(justOpened)}"]`)?.scrollIntoView({ block: 'nearest' })
    justOpened = null
  }
}

// The header answers the first question: does anything need me? Its portrait is __PET_NAME__ in the
// pose it has on the desktop.
function renderHeader(rows: Row[], now: number, since: string): void {
  const count = (status: Status) => rows.filter((r) => r.status === status).length
  const words: Record<Status, string> = { 'needs-you': 'needs you', blocked: 'blocked', working: 'working', done: 'done' }
  const parts = (['needs-you', 'blocked', 'working', 'done'] as Status[])
    .filter((status) => count(status) > 0)
    .map((status) => `${count(status)} ${words[status]}`)

  summary.replaceChildren()
  if (count('needs-you') > 0) summary.append(el('span', 'dot'))
  summary.append(document.createTextNode(parts.join(' · ') || (rows.length ? 'All quiet' : 'No Claude sessions yet')))

  const top = PRIORITY.find((status) => count(status) > 0)
  const newest = Math.max(0, ...rows.map((r) => r.session.at))
  portrait.src = `/pet/faces/${top ? FACES[top] : now - newest > LIMITS.sleep ? 'asleep' : 'idle'}.png`

  const live = rows.filter((r) => r.stats?.lastAt && r.stats.lastAt >= since)
  const turns = live.reduce((n, r) => n + (r.stats?.turnsToday ?? 0), 0)
  const tokens = live.reduce((n, r) => n + (r.stats?.outputToday ?? 0), 0)
  today.hidden = rows.length === 0
  today.textContent = `Today · ${plural(live.length, 'session')} · ${plural(turns, 'turn')} · ${short(tokens)} tokens out`
}

function emptyState(): HTMLElement {
  const box = el('div', 'empty')
  const img = el('img', '') as HTMLImageElement
  img.src = '/pet/faces/asleep.png'
  img.alt = ''
  box.append(img, el('p', 'empty-title', 'No Claude sessions yet'), el('p', 'empty-hint', 'Start one and __PET_NAME__ will notice.'))
  return box
}

/** Keeps the scroll position and a focused row across a redraw. */
function rememberPlace(): () => void {
  const top = list.scrollTop
  const active = document.activeElement
  const focused = active?.classList.contains('row-head') ? active.closest<HTMLElement>('[data-id]')?.dataset.id : undefined
  return () => {
    list.scrollTop = top
    if (focused) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"] .row-head`)?.focus({ preventScroll: true })
  }
}

// Up and Down move between sessions; Enter or Space opens one (the rows are buttons).
list.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const heads = [...list.querySelectorAll<HTMLElement>('.row-head')]
  const at = heads.indexOf(document.activeElement as HTMLElement)
  const next = at < 0 ? (e.key === 'ArrowDown' ? heads[0] : undefined) : heads[at + (e.key === 'ArrowDown' ? 1 : -1)]
  if (next) {
    e.preventDefault()
    next.focus()
  }
})

function renderRow(row: Row, worker: boolean, orchestrator: boolean, now: number): HTMLElement {
  const { session, status, stats } = row
  const quiet = now - session.at
  const face = status ? FACES[status] : quiet > LIMITS.sleep ? 'asleep' : 'idle'
  const open = expanded === session.id

  const attention = status === 'needs-you' || status === 'blocked'
  const wrap = el('div', `row${worker ? ' worker' : ''}${attention ? ' attention' : ''}${status ? '' : ' quiet'}`)
  wrap.dataset.id = session.id
  const name = stats?.title ?? folderLabel(session.cwd)
  const head = el('button', 'row-head')
  head.title = name
  head.setAttribute('aria-expanded', String(open))
  head.addEventListener('click', () => {
    expanded = open ? null : session.id
    justOpened = expanded
    void refresh()
  })

  const avatar = el('span', 'face')
  const img = el('img', '') as HTMLImageElement
  img.src = `/pet/faces/${face}.png`
  img.alt = ''
  avatar.append(img)

  const text = el('span', 'row-text')
  const title = el('span', 'title')
  title.append(el('span', 'name', name))
  if (orchestrator) title.append(el('span', 'tag', 'Orchestrator'))
  const line = el('span', 'status')
  if (status === 'needs-you') line.append(el('span', 'dot'))
  line.append(document.createTextNode(describe(session, status)))
  text.append(title, line)
  head.append(avatar, text, el('span', 'when', ago(quiet)))
  wrap.append(head)

  if (open) wrap.append(details(session, stats, now))
  return wrap
}

function details(session: SessionFile, stats: Stats | null, now: number): HTMLElement {
  const box = el('div', 'details')
  if (stats?.lastPrompt) box.append(said('You', stats.lastPrompt))
  if (stats?.lastReply) box.append(said('Claude', stats.lastReply))

  const ran = stats?.firstAt ? now - Date.parse(stats.firstAt) : null
  const facts: [string, string, boolean?][] = [
    ['Turns', String(stats?.turns ?? 0)],
    ['Tool calls', String(stats?.toolCalls ?? 0)],
    ['Tokens out', short(stats?.outputTokens ?? 0)],
    ['Context now', short(stats?.contextTokens ?? 0)],
    ['Running', ran === null ? '-' : duration(ran)],
    ['Model', stats?.model?.replace(/^claude-/, '') ?? '-'],
  ]
  if (stats?.branch) facts.push(['Branch', stats.branch, true])
  // The buttons come before the numbers: opening the session is why the row was opened.
  const actions = el('div', 'actions')
  actions.append(
    button('Show Claude', () => invoke('show_claude'), { primary: true }),
    button('VS Code', () => invoke('open_in_code', { path: session.cwd })),
    button('Copy id', () => navigator.clipboard.writeText(session.id), { done: 'Copied' }),
  )
  box.append(actions)

  const grid = el('dl', 'numbers')
  for (const [label, value, wide] of facts) {
    const cell = el('div', wide ? 'fact wide' : 'fact')
    cell.append(el('dt', '', label), el('dd', '', value))
    grid.append(cell)
  }
  box.append(grid)
  return box
}

function describe(s: SessionFile, status: Status | null): string {
  switch (status) {
    case 'needs-you':
      return s.detail ? `Needs you · ${s.detail}` : 'Needs you'
    case 'blocked':
      return s.detail ? `Blocked · ${s.detail.replace(/_/g, ' ')}` : 'Blocked'
    case null:
      return 'Quiet'
    default:
      return LABELS[status]
  }
}

function folderLabel(cwd: string | null): string {
  return cwd?.split(/[\\/]/).filter(Boolean).pop() ?? 'Claude session'
}

function said(who: string, text: string): HTMLElement {
  const p = el('p', 'said')
  p.append(el('span', 'who', who), el('span', 'text', text))
  return p
}

// A button shows why it failed (Claude not open, folder deleted) or a short "done" note for a
// moment, then its label comes back.
function button(label: string, action: () => Promise<unknown>, options: { primary?: boolean; done?: string } = {}): HTMLElement {
  const b = el('button', options.primary ? 'action primary' : 'action', label)
  const note = (text: string, ms: number) => {
    b.textContent = text
    window.setTimeout(() => (b.textContent = label), ms)
  }
  b.addEventListener('click', async () => {
    try {
      await action()
      if (options.done) note(options.done, 1500)
    } catch (error) {
      note(String(error), 2500)
    }
  })
  return b
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function short(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function duration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d`
}
