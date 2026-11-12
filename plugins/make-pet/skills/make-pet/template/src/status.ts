// Decides what __PET_NAME__ shows from the session files the Claude Code hook writes.
// Pure functions with no Tauri calls, so they are tested directly (status.test.ts).
import { place } from './group'

/** What the hook last recorded for one Claude Code session. */
export interface SessionFile {
  id: string
  state: 'hello' | 'working' | 'needs-you' | 'done' | 'blocked'
  at: number // when that event fired (ms since epoch)
  started: number // first event seen for the session
  cwd: string | null
  transcript: string | null
  detail: string | null // tool waiting for approval, or the API error type
}

/** A session's status as shown, in ChatGPT's order of priority (first wins). */
export const PRIORITY = ['needs-you', 'blocked', 'done', 'working'] as const
export type Status = (typeof PRIORITY)[number]
export type Pose = Status | 'idle' | 'asleep'

export const LIMITS = {
  stale: 12 * 60 * 60 * 1000, // a session file this old belongs to a closed or crashed session
  working: 20 * 60 * 1000, // working this long with no event: the turn was interrupted
  unseen: 15 * 60 * 1000, // done or blocked stays shown this long unless the user clicks first
  sleep: 20 * 60 * 1000, // no activity this long: __PET_NAME__ falls asleep
}
export type Limits = typeof LIMITS

/** The status a session shows now, or null when it has nothing to say. */
export function statusOf(s: SessionFile, now: number, seenAt: number, limits: Limits = LIMITS): Status | null {
  const age = now - s.at
  if (age > limits.stale) return null
  switch (s.state) {
    case 'needs-you':
      return 'needs-you'
    case 'working':
      return age > limits.working ? null : 'working'
    case 'done':
    case 'blocked':
      return s.at <= seenAt || age > limits.unseen ? null : s.state
    case 'hello':
      return null
  }
}

export interface Picked {
  pose: Pose
  count: number // sessions sharing the top status
  sessions: { session: SessionFile; status: Status | null }[] // live sessions, newest first
}

/**
 * Picks __PET_NAME__'s pose across every session: the highest-priority status any session shows,
 * otherwise idle, or asleep once nothing has happened for a while. lastTouch is the latest
 * of app start and the user's last click, so __PET_NAME__ does not wake up asleep.
 */
export function pick(
  files: SessionFile[],
  now: number,
  seenAt: number,
  lastTouch: number,
  limits: Limits = LIMITS,
): Picked {
  const sessions = files
    .filter((s) => now - s.at <= limits.stale)
    .sort((a, b) => b.at - a.at)
    .map((session) => ({ session, status: statusOf(session, now, seenAt, limits) }))

  for (const status of PRIORITY) {
    const count = sessions.filter((s) => s.status === status).length
    if (count > 0) return { pose: status, count, sessions }
  }

  const lastActivity = Math.max(lastTouch, ...sessions.map((s) => s.session.at))
  return { pose: now - lastActivity >= limits.sleep ? 'asleep' : 'idle', count: 0, sessions }
}

/** Short folder name for a session: "MyGame", or "MyGame / 2-1-golf" for a worktree. */
export function folderName(cwd: string | null): string {
  const { project, task } = place(cwd)
  return task ? `${project} / ${task}` : project
}

export const LABELS: Record<Status, string> = {
  'needs-you': 'Needs you',
  blocked: 'Blocked',
  done: 'Done',
  working: 'Working',
}

/** "now", "4m", "2h" */
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}
