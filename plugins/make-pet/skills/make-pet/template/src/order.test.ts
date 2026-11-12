import { describe, expect, it } from 'vitest'
import { group } from './group'
import { compareGroups, compareRows, type Ordered } from './order'
import type { Status } from './status'

interface Item extends Ordered {
  id: string
  cwd: string
}

const item = (id: string, cwd: string, status: Status | null, started: number): Item => ({
  id,
  cwd,
  status,
  session: { started },
})

const build = (items: Item[]) =>
  group(items, (i) => i.cwd, () => 0, { groups: compareGroups, rows: compareRows })

const WORKER = (task: string) => `C:\\Projects\\MyGame-worktrees\\MyGame\\${task}`

describe('board order', () => {
  it('puts groups that need the user first, then blocked, live and quiet ones, scratch sessions last in their rank', () => {
    const groups = build([
      item('scratch', 'C:\\x\\scratch-workspaces\\a', 'working', 1),
      item('quiet', 'C:\\Projects\\Alpha', null, 2),
      item('live', 'C:\\Projects\\Zed', 'working', 3),
      item('needs', 'C:\\Projects\\Mid', 'needs-you', 4),
      item('blocked', 'C:\\Projects\\Beta', 'blocked', 5),
    ])
    expect(groups.map((g) => g.project)).toEqual(['Mid', 'Beta', 'Zed', 'No folder', 'Alpha'])
  })

  it('keeps a group where it is when its sessions keep producing events', () => {
    const before = build([item('a', 'C:\\Projects\\Alpha', 'working', 1), item('b', 'C:\\Projects\\Beta', 'working', 2)])
    const after = build([item('a', 'C:\\Projects\\Alpha', 'done', 1), item('b', 'C:\\Projects\\Beta', 'working', 2)])
    expect(before.map((g) => g.project)).toEqual(after.map((g) => g.project))
  })

  it('shows the orchestrator first, then live workers, then quiet ones, each in start order', () => {
    const [game] = build([
      item('w-late', WORKER('9-late'), 'working', 30),
      item('w-quiet', WORKER('1-quiet'), null, 5),
      item('orch', 'C:\\Projects\\MyGame', null, 10),
      item('w-early', WORKER('2-early'), 'done', 20),
    ])
    expect(game.rows.map((r) => r.item.id)).toEqual(['orch', 'w-early', 'w-late', 'w-quiet'])
  })
})
