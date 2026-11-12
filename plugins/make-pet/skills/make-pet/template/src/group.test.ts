import { describe, expect, it } from 'vitest'
import { group, place } from './group'

const GAME = 'C:\\Projects\\MyGame'
const WORKER = 'C:\\Projects\\MyGame-worktrees\\MyGame\\2-1-add-dark-mode-e78369'
const SCRATCH =
  'C:\\Users\\you\\AppData\\Roaming\\Claude\\scratch-workspaces\\47e4\\0b5b\\scratch-2026-11-06-ai-setup-review'

describe('place', () => {
  it('finds the orchestrator, its workers and scratch sessions', () => {
    expect(place(GAME)).toEqual({ project: 'MyGame', role: 'main', task: null })
    expect(place(WORKER)).toEqual({ project: 'MyGame', role: 'worker', task: '2-1-add-dark-mode-e78369' })
    expect(place(SCRATCH).project).toBe('No folder')
    expect(place('C:/Projects/Notes/')).toMatchObject({ project: 'Notes', role: 'main' })
  })
})

describe('group', () => {
  it('puts the orchestrator first, workers under it, newest group first', () => {
    const items = [
      { id: 'w1', cwd: WORKER, at: 50 },
      { id: 'notes', cwd: 'C:\\Projects\\Notes', at: 10 },
      { id: 'orch', cwd: GAME, at: 20 },
      { id: 'w2', cwd: 'C:\\Projects\\MyGame-worktrees\\MyGame\\13-2-faster-build', at: 60 },
    ]
    const groups = group(items, (i) => i.cwd, (i) => i.at)
    expect(groups.map((g) => g.project)).toEqual(['MyGame', 'Notes'])
    expect(groups[0].hasWorkers).toBe(true)
    expect(groups[0].rows.map((r) => r.item.id)).toEqual(['orch', 'w2', 'w1'])
    expect(groups[1].hasWorkers).toBe(false)
  })
})
