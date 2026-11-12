import { describe, expect, it } from 'vitest'
import { LIMITS, folderName, pick, statusOf, type SessionFile } from './status'

const NOW = 1_800_000_000_000
const MIN = 60_000

function session(id: string, state: SessionFile['state'], minutesAgo: number): SessionFile {
  const at = NOW - minutesAgo * MIN
  return { id, state, at, started: at, cwd: null, transcript: null, detail: null }
}

describe('statusOf', () => {
  it('shows working until the turn has gone quiet for 20 minutes', () => {
    expect(statusOf(session('a', 'working', 19), NOW, 0)).toBe('working')
    expect(statusOf(session('a', 'working', 21), NOW, 0)).toBeNull()
  })

  it('keeps needs-you however long the user is away, until the file goes stale', () => {
    expect(statusOf(session('a', 'needs-you', 300), NOW, 0)).toBe('needs-you')
    expect(statusOf(session('a', 'needs-you', 13 * 60), NOW, 0)).toBeNull()
  })

  it('clears done and blocked once seen or after 15 minutes', () => {
    expect(statusOf(session('a', 'done', 2), NOW, 0)).toBe('done')
    expect(statusOf(session('a', 'done', 2), NOW, NOW - MIN)).toBeNull()
    expect(statusOf(session('a', 'blocked', 16), NOW, 0)).toBeNull()
  })

  it('treats a fresh session as nothing to report', () => {
    expect(statusOf(session('a', 'hello', 0), NOW, 0)).toBeNull()
  })
})

describe('pick', () => {
  it('uses ChatGPT priority: needs-you, blocked, done, working', () => {
    const files = [session('a', 'working', 1), session('b', 'done', 1), session('c', 'needs-you', 5)]
    expect(pick(files, NOW, 0, NOW).pose).toBe('needs-you')
    expect(pick(files.slice(0, 2), NOW, 0, NOW).pose).toBe('done')
    expect(pick([session('a', 'working', 1), session('b', 'blocked', 3)], NOW, 0, NOW).pose).toBe('blocked')
  })

  it('counts the sessions sharing the top status', () => {
    const files = [session('a', 'working', 1), session('b', 'working', 2), session('c', 'hello', 0)]
    expect(pick(files, NOW, 0, NOW)).toMatchObject({ pose: 'working', count: 2 })
  })

  it('is idle with no live status and asleep after 20 quiet minutes', () => {
    expect(pick([session('a', 'hello', 5)], NOW, 0, NOW - 60 * MIN).pose).toBe('idle')
    expect(pick([session('a', 'done', 25)], NOW, 0, NOW - 60 * MIN).pose).toBe('asleep')
    expect(pick([], NOW, 0, NOW - 5 * MIN).pose).toBe('idle')
    expect(pick([], NOW, 0, NOW - LIMITS.sleep).pose).toBe('asleep')
  })

  it('drops stale sessions from the list', () => {
    const picked = pick([session('a', 'done', 13 * 60), session('b', 'hello', 1)], NOW, 0, NOW)
    expect(picked.sessions.map((s) => s.session.id)).toEqual(['b'])
  })
})

describe('folderName', () => {
  it('names plain folders and orchestrate worktrees', () => {
    expect(folderName('C:\\Projects\\MyGame')).toBe('MyGame')
    expect(folderName('C:\\Projects\\MyGame-worktrees\\MyGame\\2-1-add-dark-mode-e78369')).toBe(
      'MyGame / 2-1-add-dark-mode-e78369',
    )
    expect(folderName(null)).toBe('No folder')
  })
})
