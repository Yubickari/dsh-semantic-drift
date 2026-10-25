/**
 * The two view preferences the panel remembers: whether it follows the current
 * DSH workspace, and which workspace it was pinned to last.
 *
 * They live in `localStorage`, not in the vocabulary file and not in plugin
 * config: they describe what one browser is looking at, not what the project
 * means. A browser that refuses storage still gets the behaviour for the current
 * page — the preference simply does not survive a reload.
 *
 * @module dsh-semantic-drift/client/preferences
 */

/** Stable key; changing it resets every reader's preference once. */
const KEY = 'dsh-semantic-drift:prefs'

/** What the panel remembers between reloads. */
export interface PanelPreferences {
  /** True when the panel follows the current session's workspace. */
  auto: boolean
  /** Last workspace the user picked, used while `auto` is off. */
  workspace?: string
  /** Seconds before a notification closes itself; 0 keeps it until dismissed. */
  notificationSeconds: number
  /** Whether low-confidence findings are listed. */
  showLow: boolean
}

/** Defaults: follow the workspace, no pin yet. */
export function defaultPreferences(): PanelPreferences {
  return { auto: true, notificationSeconds: 3, showLow: false }
}

/** Read the stored preferences, falling back to the defaults. */
export function loadPreferences(): PanelPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw === null || raw === undefined) return defaultPreferences()
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return defaultPreferences()
    const record = parsed as Record<string, unknown>
    const seconds = typeof record.notificationSeconds === 'number' && Number.isFinite(record.notificationSeconds)
      ? Math.max(0, Math.min(600, record.notificationSeconds))
      : 3
    return {
      auto: typeof record.auto === 'boolean' ? record.auto : true,
      ...(typeof record.workspace === 'string' && record.workspace !== '' ? { workspace: record.workspace } : {}),
      notificationSeconds: seconds,
      showLow: record.showLow === true,
    }
  } catch {
    return defaultPreferences()
  }
}

/** Persist the preferences; a storage failure is not worth reporting. */
export function savePreferences(preferences: PanelPreferences): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // Private mode or a full quota: the in-memory state still works.
  }
}
