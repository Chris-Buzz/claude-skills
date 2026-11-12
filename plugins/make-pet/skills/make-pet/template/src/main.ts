// The pet window: __PET_NAME__, its status pill, dragging, clicks and the right-click menu.
import '@fontsource-variable/geist'
import './styles.css'
import { invoke } from '@tauri-apps/api/core'
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import { LogicalSize, PhysicalPosition, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { Sprite, type AtlasMeta, type Program } from './sprite'
import { LABELS, LIMITS, ago, folderName, pick, type Picked, type SessionFile } from './status'

const BASE = { w: 192, h: 208 } // ChatGPT's pet cell, in CSS pixels at Medium
const PILL_SPACE = 30
const SIZES = { small: 0.75, medium: 1, large: 1.25 } as const
type Size = keyof typeof SIZES
const POLL_MS = 500

const win = getCurrentWindow()
// Menu wording follows the system: a Mac calls Alt "Option" and says "Open at login".
const MAC = navigator.userAgent.includes('Mac')
const SHOW_HIDE_KEYS = MAC ? 'Ctrl+Option+P' : 'Ctrl+Alt+P'
const canvas = document.querySelector<HTMLCanvasElement>('#pet')!
const pill = document.querySelector<HTMLDivElement>('#pill')!
const pillText = pill.querySelector<HTMLSpanElement>('.text')!

const startedAt = Date.now()
let lastTouch = startedAt // app start or the user's last click
let seenAt = readNumber('seenAt') // done and blocked older than this are cleared
let lastHello = startedAt // newest session start already greeted
let picked: Picked = { pose: 'idle', count: 0, sessions: [] }
let waving = true // greet on start
let dragDirection: Program | null = null
let size: Size = readSize()

const meta: AtlasMeta = await (await fetch('/pet/atlas.json')).json()
const atlas = new Image()
atlas.src = '/pet/atlas.webp'
await atlas.decode()
const sprite = new Sprite(canvas, atlas, meta)

const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
sprite.reducedMotion = motion.matches
motion.addEventListener('change', () => {
  sprite.reducedMotion = motion.matches
  render(true)
})

const sleepMinutes = await invoke<number | null>('sleep_minutes')
const limits = sleepMinutes ? { ...LIMITS, sleep: sleepMinutes * 60000 } : LIMITS

await applySize(size)
render()
await firstRun()
window.setInterval(poll, POLL_MS)
poll()

// ---- what __PET_NAME__ shows ----

function render(restart = false): void {
  const program: Program = dragDirection ?? (waving ? 'wave' : picked.pose)
  if (restart) sprite.resize(BASE.w * SIZES[size], BASE.h * SIZES[size])
  sprite.play(program, program === 'wave' ? endWave : undefined)

  const status = picked.pose
  const shown = status !== 'idle' && status !== 'asleep'
  pill.classList.toggle('shown', shown)
  pill.classList.toggle('needs', status === 'needs-you')
  if (shown) {
    pillText.textContent = picked.count > 1 ? `${LABELS[status]} · ${picked.count}` : LABELS[status]
    const top = picked.sessions.find((s) => s.status === status)
    pill.title = top ? folderName(top.session.cwd) : ''
  }
}

function endWave(): void {
  waving = false
  render()
}

function wave(): void {
  waving = true
  render()
}

async function poll(): Promise<void> {
  const files = await invoke<SessionFile[]>('read_sessions')
  const now = Date.now()
  const before = picked.pose
  picked = pick(files, now, seenAt, lastTouch, limits)

  const newestHello = Math.max(0, ...files.filter((f) => f.state === 'hello').map((f) => f.at))
  const greeted = newestHello > lastHello
  if (greeted) lastHello = newestHello
  if (greeted || (before === 'asleep' && picked.pose !== 'asleep')) wave()
  else render()
}

// ---- dragging and clicking ----

// A press that moves more than a few pixels becomes a drag (Windows moves the window);
// one that does not is a click.
let pressedAt: { x: number; y: number } | null = null
let lastX = 0
let dragEnd = 0

canvas.addEventListener('mousedown', (e) => {
  // Control-click is a right-click on a Mac, so it opens the menu and is not also a click.
  if (e.button !== 0 || e.ctrlKey) return
  pressedAt = { x: e.screenX, y: e.screenY }
  watchRelease()
})

// When __PET_NAME__'s window is not the active one, Windows spends the button release of the click
// that activates it, and the page never sees a mouseup. So the page also asks Windows whether
// the button is still held, and takes the press as a click once it is let go.
function watchRelease(): void {
  const check = async () => {
    if (!pressedAt) return // a mouseup or a drag has already dealt with this press
    const held = await invoke<boolean | null>('left_button_down')
    if (held === null) return // not Windows: the mouseup arrives normally
    if (held) window.setTimeout(check, 40)
    else click()
  }
  window.setTimeout(check, 40)
}

window.addEventListener('mousemove', async (e) => {
  if (!pressedAt || !(e.buttons & 1)) return
  if (Math.hypot(e.screenX - pressedAt.x, e.screenY - pressedAt.y) < 4) return
  pressedAt = null
  lastX = (await win.outerPosition()).x
  dragDirection = e.screenX >= lastX ? 'run-right' : 'run-left'
  scheduleDragEnd(400)
  render()
  await win.startDragging()
})

window.addEventListener('mouseup', () => click())

// A click marks Done and Blocked as seen and opens or closes __PET_NAME__'s board.
function click(): void {
  if (!pressedAt) return
  pressedAt = null
  touch()
  markSeen()
  void invoke('toggle_board')
}

// Windows does not report the end of a drag to the page, so the drag ends once the window
// has stopped moving for a quarter of a second.
await win.onMoved(({ payload }) => {
  if (!dragDirection) return
  if (payload.x !== lastX) dragDirection = payload.x > lastX ? 'run-right' : 'run-left'
  lastX = payload.x
  scheduleDragEnd(250)
  render()
})

function scheduleDragEnd(ms: number): void {
  window.clearTimeout(dragEnd)
  dragEnd = window.setTimeout(() => {
    dragDirection = null
    render()
    void invoke('save_position')
  }, ms)
}

function touch(): void {
  const wasAsleep = picked.pose === 'asleep'
  lastTouch = Date.now()
  if (wasAsleep) wave()
}

// Shared with the board page (same origin, same storage), so both clear the same sessions.
function markSeen(): void {
  seenAt = Date.now()
  try {
    localStorage.setItem('seenAt', String(seenAt))
  } catch {
    // The pet still clears them; the board shows them until they time out.
  }
  void poll()
}

// ---- right-click menu ----

canvas.addEventListener('contextmenu', async (e) => {
  e.preventDefault()
  const now = Date.now()
  const rows = picked.sessions.slice(0, 8).map(({ session, status }) =>
    MenuItem.new({
      text: `${folderName(session.cwd)}    ${status ? LABELS[status] : 'Idle'} · ${ago(now - session.at)}`,
      enabled: false,
    }),
  )
  if (rows.length === 0) rows.push(MenuItem.new({ text: 'No Claude sessions yet', enabled: false }))

  const sizeItems = (Object.keys(SIZES) as Size[]).map((s) =>
    CheckMenuItem.new({
      text: s[0].toUpperCase() + s.slice(1),
      checked: s === size,
      action: () => void applySize(s),
    }),
  )
  const menu = await Menu.new({
    items: [
      ...(await Promise.all(rows)),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ text: 'Open __PET_NAME__’s desk', action: () => void invoke('toggle_board') }),
      await MenuItem.new({ text: 'Mark all seen', action: markSeen }),
      await Submenu.new({
        text: 'Size',
        items: [
          ...(await Promise.all(sizeItems)),
          await MenuItem.new({ text: 'Reset size', action: () => void applySize('medium') }),
        ],
      }),
      await CheckMenuItem.new({
        text: MAC ? 'Open at login' : 'Start with Windows',
        checked: await isEnabled(),
        action: async () => ((await isEnabled()) ? disable() : enable()),
      }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ text: `Hide __PET_NAME__ (${SHOW_HIDE_KEYS})`, action: () => void win.hide() }),
      await MenuItem.new({ text: 'Quit', action: () => void invoke('quit') }),
    ],
  })
  await menu.popup()
})

// ---- size and first run ----

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0)
  } catch {
    return 0
  }
}

function readSize(): Size {
  try {
    const saved = localStorage.getItem('size')
    if (saved && saved in SIZES) return saved as Size
  } catch {
    // Storage unavailable: use the default size.
  }
  return 'medium'
}

async function applySize(next: Size): Promise<void> {
  size = next
  try {
    localStorage.setItem('size', next)
  } catch {
    // Not remembered this time; the size still applies.
  }
  const scale = SIZES[next]
  await win.setSize(new LogicalSize(Math.round(BASE.w * scale), Math.round(BASE.h * scale) + PILL_SPACE))
  render(true)
}

// On the first run __PET_NAME__ sits at the bottom-right of the main screen, above the taskbar,
// and starting at login is turned on. After that its spot and the menu tick are remembered.
async function firstRun(): Promise<void> {
  try {
    if (localStorage.getItem('firstRunDone')) return
    localStorage.setItem('firstRunDone', '1')
  } catch {
    return
  }
  const monitor = await primaryMonitor()
  if (monitor) {
    const { position, size: area } = monitor.workArea
    const outer = await win.outerSize()
    const margin = Math.round(24 * monitor.scaleFactor)
    await win.setPosition(
      new PhysicalPosition(position.x + area.width - outer.width - margin, position.y + area.height - outer.height),
    )
    await invoke('save_position')
  }
  if (!(await isEnabled())) await enable()
}
