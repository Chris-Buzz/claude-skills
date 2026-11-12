// Groups sessions for __PET_NAME__'s board: one group per project, the orchestrator first and its
// workers under it. Pure functions, tested in group.test.ts.
//
// The rule comes from how /orchestrate lays out worktrees: a worker for repo X runs in
// <parent>/X-worktrees/X/<task>, and the orchestrator runs in <parent>/X.

export interface Placed {
  project: string // "MyGame", or "No folder" for app scratch sessions
  role: 'main' | 'worker'
  task: string | null // a worker's task folder, e.g. "2-1-add-dark-mode-e78369"
}

export const NO_FOLDER = 'No folder'

export function place(cwd: string | null): Placed {
  if (!cwd) return { project: NO_FOLDER, role: 'main', task: null }
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  if (parts.some((p) => p.toLowerCase() === 'scratch-workspaces')) {
    return { project: NO_FOLDER, role: 'main', task: null }
  }
  const at = parts.findIndex((p) => p.endsWith('-worktrees'))
  if (at >= 0 && parts.length > at + 2) {
    return { project: parts[at + 1], role: 'worker', task: parts.slice(at + 2).join('/') }
  }
  return { project: parts[parts.length - 1], role: 'main', task: null }
}

export interface Group<T> {
  project: string
  hasWorkers: boolean // when true, the main sessions are the orchestrator
  rows: { item: T; placed: Placed }[]
  latest: number
}

type Compare<X> = (a: X, b: X) => number

/** Optional sort orders. Without them: newest group first, orchestrator first, newest row first. */
export interface Order<T> {
  groups?: Compare<Group<T>>
  rows?: Compare<Group<T>['rows'][number]>
}

/** Groups items (anything with a cwd and a last-event time). */
export function group<T>(items: T[], cwdOf: (t: T) => string | null, atOf: (t: T) => number, order: Order<T> = {}): Group<T>[] {
  const groups = new Map<string, Group<T>>()
  for (const item of items) {
    const placed = place(cwdOf(item))
    const g = groups.get(placed.project) ?? { project: placed.project, hasWorkers: false, rows: [], latest: 0 }
    g.rows.push({ item, placed })
    g.hasWorkers ||= placed.role === 'worker'
    g.latest = Math.max(g.latest, atOf(item))
    groups.set(placed.project, g)
  }
  const byRecent: Compare<Group<T>['rows'][number]> = (a, b) => {
    if (a.placed.role !== b.placed.role) return a.placed.role === 'main' ? -1 : 1
    return atOf(b.item) - atOf(a.item)
  }
  for (const g of groups.values()) g.rows.sort(order.rows ?? byRecent)
  return [...groups.values()].sort(order.groups ?? ((a, b) => b.latest - a.latest))
}
