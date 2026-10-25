/**
 * A short-lived, per-tab memory of the last scan, keyed by workspace.
 *
 * The panel lives inside a shell that unmounts it whenever another panel is
 * selected, so a scan result held in component state disappears the moment the
 * user looks at something else — and re-opening the panel used to force a rescan
 * that the user did not ask for. This module keeps the report for the current tab
 * so re-entry is instant, without writing anything into the workspace.
 *
 * Deliberately bounded and honest:
 * - one entry per workspace, at most three, oldest dropped first;
 * - entries older than the configured retention are still returned but marked
 *   `expired`, so the panel can show them greyed out instead of pretending;
 * - an entry bigger than the storage budget is not persisted at all;
 * - the storage is `sessionStorage`: a closed tab forgets everything, and the
 *   agent tools never read it — a tool call always scans.
 *
 * @module dsh-semantic-drift/client/scan-cache
 */

import type { ScanResponse } from '../protocol.ts'

const KEY = 'dsh-semantic-drift:scan-cache'
/** Workspaces remembered at once. */
const MAX_ENTRIES = 3
/** One entry above this size is not persisted. */
const MAX_CHARS = 1_500_000
/** Entries this many times past the retention are dropped on write. */
const PRUNE_FACTOR = 4

interface StoredEntry {
  workspace: string
  at: number
  /** Vocabulary mtime when the scan ran, for the "the file changed" badge. */
  mtimeMs?: number
  response: ScanResponse
}

function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    // Access can throw in a hardened browser context; the panel then simply
    // behaves as if nothing was remembered.
    return undefined
  }
}

function isEntry(value: unknown): value is StoredEntry {
  if (value === null || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.workspace === 'string'
    && typeof entry.at === 'number'
    && typeof entry.response === 'object'
    && entry.response !== null
}

function read(): StoredEntry[] {
  const store = storage()
  if (store === undefined) return []
  try {
    const raw = store.getItem(KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry)
  } catch {
    return []
  }
}

function write(entries: readonly StoredEntry[]): void {
  const store = storage()
  if (store === undefined) return
  try {
    if (entries.length === 0) store.removeItem(KEY)
    else store.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Quota or a disabled store: remembering is a convenience, not a guarantee.
  }
}

/** Remember one report. A retention of 0 turns the whole cache off. */
export function rememberScan(input: {
  workspace: string
  response: ScanResponse
  retentionMinutes: number
  /** Vocabulary mtime read at scan time. */
  mtimeMs?: number
  now?: number
}): void {
  if (!(input.retentionMinutes > 0)) return
  const entry: StoredEntry = {
    workspace: input.workspace,
    at: input.now ?? Date.now(),
    ...(input.mtimeMs === undefined ? {} : { mtimeMs: input.mtimeMs }),
    response: input.response,
  }
  let encoded: string
  try {
    encoded = JSON.stringify(entry)
  } catch {
    return
  }
  if (encoded.length > MAX_CHARS) return
  const kept = read().filter(item => item.workspace !== entry.workspace)
  kept.push(entry)
  const now = input.now ?? Date.now()
  const horizon = input.retentionMinutes * 60_000 * PRUNE_FACTOR
  write(kept.filter(item => now - item.at <= horizon).slice(-MAX_ENTRIES))
}

/** One recalled report. */
export interface RecalledScan {
  response: ScanResponse
  at: number
  ageMs: number
  /** Older than the configured retention; show it, but say so. */
  expired: boolean
  /** Vocabulary mtime when it was scanned, if it was recorded. */
  mtimeMs?: number
}

/** Recall the report for one workspace. A retention of 0 recalls nothing. */
export function recallScan(input: {
  workspace: string
  retentionMinutes: number
  now?: number
}): RecalledScan | undefined {
  if (!(input.retentionMinutes > 0)) return undefined
  const now = input.now ?? Date.now()
  const entry = read().find(item => item.workspace === input.workspace)
  if (entry === undefined) return undefined
  const ageMs = Math.max(0, now - entry.at)
  return {
    response: entry.response,
    at: entry.at,
    ageMs,
    expired: ageMs > input.retentionMinutes * 60_000,
    ...(entry.mtimeMs === undefined ? {} : { mtimeMs: entry.mtimeMs }),
  }
}

/** Drop one workspace's report. */
export function forgetScan(workspace: string): void {
  write(read().filter(item => item.workspace !== workspace))
}

/** Drop everything (tests and a user-visible reset). */
export function clearScanCache(): void {
  write([])
}
