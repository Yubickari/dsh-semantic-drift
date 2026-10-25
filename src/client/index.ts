/**
 * Browser entry: one sidebar row and one center-column panel.
 *
 * Both registrations go through `ctx.slots.inject`, which fires only after the
 * owning shell entry declares the seat. A shell that cannot serve the seats
 * leaves the panel absent instead of failing the boot, and the plugin can load
 * before the shell plugin without an ordering dependency.
 *
 * @module dsh-semantic-drift/client
 */

import { PANEL_ID } from '../protocol.ts'
import { SemanticPanel } from './Panel.tsx'
import { SidebarIcon } from './icons.tsx'
import { dictionaries, setTranslator, t } from './locales.ts'

/** Required client services: the slot registry is the only hard one. */
export const inject = ['slots']

/** Glyph row order: after the shipped panels and the task board. */
const PANEL_ORDER = 30

/** Locale namespace this plugin owns. */
const NS = 'semantic-drift'

/** The shape of the slot service this plugin uses. */
interface SlotFace {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The client context surface this entry uses. */
interface ClientContext {
  slots: SlotFace
  effect(callback: () => () => void, label?: string): () => void
  locale?: {
    register(namespace: string, dictionaries: Record<string, unknown>): () => void
    bind(namespace: string): (key: string) => string
  }
}

/**
 * Mount the panel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): () => void {
  try {
    const locale = ctx.locale
    if (locale !== undefined) {
      ctx.effect(() => locale.register(NS, dictionaries), 'semantic-drift: dictionaries')
      setTranslator(locale.bind(NS) as unknown as (key: string) => string)
    }
  } catch {
    // No locale service: the built-in dictionaries are used directly.
  }

  const disposers: Array<() => void> = []
  try {
    disposers.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: PANEL_ORDER,
      label: () => t('entry.label'),
    }, SidebarIcon)))

    disposers.push(ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
    }, SemanticPanel)))
  } catch (error) {
    for (const dispose of disposers.splice(0)) dispose()
    // The web shell fails the whole boot when a plugin's apply throws.
    console.warn(`[${NS}] panel registration failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
