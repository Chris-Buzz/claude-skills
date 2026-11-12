// Plays __PET_NAME__'s poses from the atlas on a canvas.
//
// Each pose is a small program over one atlas row: loop it, play it once and hold, or (idle)
// sit still and blink now and then. Timings come from atlas.json, which carries ChatGPT's
// frame durations.

export interface AtlasMeta {
  cell: { w: number; h: number }
  columns: number
  states: Record<string, { row: number; frames: number; durations: number[] }>
}

export type Program = 'idle' | 'working' | 'needs-you' | 'done' | 'blocked' | 'asleep' | 'wave' | 'run-right' | 'run-left'

interface Plan {
  row: string
  mode: 'loop' | 'once' | 'blink'
  last?: number // play only up to this frame, then hold it
  slow?: number // multiply every duration
  rest?: number // pause on frame 0 between loops (ms)
  still: number // the frame shown when Windows animations are off
}

const PLANS: Record<Program, Plan> = {
  idle: { row: 'idle', mode: 'blink', still: 0 },
  working: { row: 'working', mode: 'loop', still: 1 },
  'needs-you': { row: 'waiting', mode: 'loop', rest: 1000, still: 3 },
  done: { row: 'done', mode: 'once', still: 5 },
  blocked: { row: 'droop', mode: 'once', still: 7 },
  asleep: { row: 'droop', mode: 'once', last: 5, slow: 2.5, still: 5 },
  wave: { row: 'wave', mode: 'once', still: 2 },
  'run-right': { row: 'run-right', mode: 'loop', still: 0 },
  'run-left': { row: 'run-left', mode: 'loop', still: 0 },
}

// Idle sits on frame 0 and plays the blink-and-wink frames once every 6 to 9 seconds.
const BLINK_GAP_MS = [6000, 9000] as const

export class Sprite {
  private ctx: CanvasRenderingContext2D
  private program: Program | null = null
  private timer = 0
  private onEnd: (() => void) | null = null
  reducedMotion = false

  constructor(
    private canvas: HTMLCanvasElement,
    private atlas: HTMLImageElement,
    private meta: AtlasMeta,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  /** Sizes the canvas to CSS pixels, with a backing store at the screen's pixel density. */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.round(cssWidth * dpr)
    this.canvas.height = Math.round(cssHeight * dpr)
    const current = this.program
    this.program = null
    if (current) this.play(current, this.onEnd ?? undefined)
  }

  /** Switches to a program. Asking for the one already playing changes nothing. */
  play(program: Program, onEnd?: () => void): void {
    if (program === this.program) return
    window.clearTimeout(this.timer)
    this.program = program
    this.onEnd = onEnd ?? null
    const plan = PLANS[program]

    if (this.reducedMotion) {
      this.draw(plan.row, plan.still)
      if (this.onEnd) this.timer = window.setTimeout(() => this.finish(), 1200)
      return
    }
    if (plan.mode === 'blink') {
      this.draw(plan.row, 0)
      this.scheduleBlink(plan)
      return
    }
    this.step(plan, 0)
  }

  private step(plan: Plan, frame: number): void {
    const state = this.meta.states[plan.row]
    const last = plan.last ?? state.frames - 1
    this.draw(plan.row, frame)
    const wait = state.durations[frame] * (plan.slow ?? 1)

    if (frame < last) {
      this.timer = window.setTimeout(() => this.step(plan, frame + 1), wait)
    } else if (plan.mode === 'loop') {
      this.timer = window.setTimeout(() => this.step(plan, 0), wait + (plan.rest ?? 0))
    } else if (this.onEnd) {
      this.timer = window.setTimeout(() => this.finish(), wait)
    }
  }

  private scheduleBlink(plan: Plan): void {
    const [min, max] = BLINK_GAP_MS
    const gap = min + Math.random() * (max - min)
    this.timer = window.setTimeout(() => this.blink(plan, 1), gap)
  }

  private blink(plan: Plan, frame: number): void {
    const state = this.meta.states[plan.row]
    if (frame >= state.frames) {
      this.draw(plan.row, 0)
      this.scheduleBlink(plan)
      return
    }
    this.draw(plan.row, frame)
    this.timer = window.setTimeout(() => this.blink(plan, frame + 1), state.durations[frame])
  }

  private finish(): void {
    const done = this.onEnd
    this.onEnd = null
    done?.()
  }

  private draw(row: string, frame: number): void {
    const { cell, states } = this.meta
    const r = states[row].row
    const { width, height } = this.canvas
    this.ctx.clearRect(0, 0, width, height)
    this.ctx.imageSmoothingQuality = 'high'
    this.ctx.drawImage(this.atlas, frame * cell.w, r * cell.h, cell.w, cell.h, 0, 0, width, height)
  }
}
