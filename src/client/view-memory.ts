/**
 * What the panel was showing when it was last closed.
 *
 * The shell unmounts the panel whenever another panel is selected, so a selected
 * concept would otherwise be forgotten on every switch. This remembers one
 * selection per workspace, in `localStorage`: it is view state, not project data,
 * and it should survive a page reload just like the workspace pin does.
 *
 * Only the selection is remembered. Search, filters and open editors are
 * deliberately not: they describe a momentary task, and restoring them would make
 * a fresh visit feel like it was interrupted.
 *
 * @module dsh-semantic-drift/client/view-memory
 */

const KEY = 'dsh-semantic-drift:view'

/** A selection worth restoring. */
export type RememberedSelection =
  | { kind: 'concept'; id: string }
  | { kind: 'unclassified' }

interface StoredView {
  workspace: string
  selection: RememberedSelection
}

function store(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function read(): StoredView | undefined {
  const storage = store()
  if (storage === undefined) return undefined
  try {
    const raw = storage.getItem(KEY)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const view = parsed as Record<string, unknown>
    if (typeof view.workspace !== 'string' || view.selection === undefined || view.selection === null) return undefined
    const selection = view.selection as Record<string, unknown>
    if (selection.kind === 'unclassified') return { workspace: view.workspace, selection: { kind: 'unclassified' } }
    if (selection.kind === 'concept' && typeof selection.id === 'string' && selection.id !== '') {
      return { workspace: view.workspace, selection: { kind: 'concept', id: selection.id } }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Remember the selection of one workspace, replacing whatever was stored. */
export function rememberSelection(workspace: string, selection: RememberedSelection): void {
  const storage = store()
  if (storage === undefined) return
  try {
    storage.setItem(KEY, JSON.stringify({ workspace, selection } satisfies StoredView))
  } catch {
    // A full or disabled store only costs the convenience.
  }
}

/** The selection stored for this workspace, if it was stored for the same one. */
export function recallSelection(workspace: string): RememberedSelection | undefined {
  const view = read()
  return view !== undefined && view.workspace === workspace ? view.selection : undefined
}

/** Forget the stored selection (used when the selected concept is deleted). */
export function forgetSelection(): void {
  const storage = store()
  if (storage === undefined) return
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}
