// The board's sort order. It changes only when something meaningful happens (a session needs
// the user, or goes quiet), never because a session produced another event, so a row does not
// move away while the user is reaching for it. Pure functions, tested in order.test.ts.
import { NO_FOLDER, type Group } from './group'
import type { Status } from './status'

export interface Ordered {
  status: Status | null
  session: { started: number }
}

/** 0: a session needs the user, 1: one is blocked, 2: one is live, 3: all quiet. */
function rank<T extends Ordered>(g: Group<T>): number {
  const has = (test: (s: Status | null) => boolean) => g.rows.some((r) => test(r.item.status))
  if (has((s) => s === 'needs-you')) return 0
  if (has((s) => s === 'blocked')) return 1
  return has((s) => s !== null) ? 2 : 3
}

/** Groups that need the user first, then blocked, live and quiet ones; by project name within a
 *  rank, with app scratch sessions last. */
export function compareGroups<T extends Ordered>(a: Group<T>, b: Group<T>): number {
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if ((a.project === NO_FOLDER) !== (b.project === NO_FOLDER)) return a.project === NO_FOLDER ? 1 : -1
  return a.project.localeCompare(b.project, undefined, { sensitivity: 'base' })
}

/** The orchestrator before its workers, live sessions before quiet ones, then in the order
 *  they were started. */
export function compareRows<T extends Ordered>(
  a: Group<T>['rows'][number],
  b: Group<T>['rows'][number],
): number {
  if (a.placed.role !== b.placed.role) return a.placed.role === 'main' ? -1 : 1
  const liveA = a.item.status !== null
  if (liveA !== (b.item.status !== null)) return liveA ? -1 : 1
  return a.item.session.started - b.item.session.started
}
