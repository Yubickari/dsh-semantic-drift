/**
 * Browser entry: one sidebar row, one center-column panel and this bundle's own
 * page in the installed-plugin detail view.
 *
 * Every registration goes through `ctx.slots.inject`, which fires only after the
 * owning shell entry declares the seat. A shell that cannot serve a seat leaves
 * that piece absent instead of failing the boot, and the plugin can load before
 * the shell plugin without an ordering dependency.
 *
 * The settings page is a live form over the settings domain's `configForms`
 * service, so it is registered only while the Host serves this plugin's
 * namespace: a deployment that composes no settings domain shows no trace of it.
 *
 * @module dsh-semantic-drift/client
 */

import { PACKAGE_NAME, PANEL_ID, ROW_ID } from '../protocol.ts'
import { ConfigPage, bindConfigForms } from './ConfigPage.tsx'
import { SemanticPanel } from './Panel.tsx'
import { SidebarIcon } from './icons.tsx'
import { dictionaries, setTranslator, t } from './locales.ts'

/** Required client services: the slot registry is the only hard one. */
export const inject = ['slots']

/** Glyph row order: after the shipped panels and the task board. */
const PANEL_ORDER = 30

/** Locale namespace this plugin owns. */
const NS = 'semantic-drift'

/** Bundle settings seat: one page per installed bundle, keyed by its package name. */
const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'

/**
 * Namespaces this page follows, most specific first.
 *
 * The settings domain addresses a plugin by its Host entry id, and falls back to
 * the package name, so the page watches both and edits whichever one is served.
 */
const CONFIG_NAMESPACES = [ROW_ID, PACKAGE_NAME]

/** The shape of the slot service this plugin uses. */
interface SlotFace {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The client context surface this entry uses. */
interface ClientContext {
  slots: SlotFace
  effect(callback: () => () => void, label?: string): () => void
  /** Cordis fiber inject; absent on a shell that resolves services another way. */
  inject?: (services: string[], callback: (face: unknown) => unknown) => unknown
  locale?: {
    register(namespace: string, dictionaries: Record<string, unknown>): () => void
    bind(namespace: string): (key: string) => string
  }
}

/** One line of failure text for a console warning. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The namespace the Host actually serves.
 *
 * `whileServed` hands over every served namespace, and the served collection is
 * a set in the shell's own service while a stub may pass a list.
 * @param served - namespaces the settings domain reports.
 */
function pickNamespace(served: unknown): string {
  const namespaces = served instanceof Set ? [...(served as Set<string>)] : Array.isArray(served) ? served : []
  return namespaces.includes(ROW_ID) ? ROW_ID : PACKAGE_NAME
}

/**
 * Register the bundle's configuration page while the Host serves its namespace.
 *
 * Its own catcher on purpose: a shell without the settings service, or without
 * the bundle-config seat, must leave the page absent and the panel untouched.
 * @param ctx - client root context.
 * @param disposers - the teardown list of `apply`; the watch ends with the plugin.
 */
function registerBundleConfig(ctx: ClientContext, disposers: Array<() => void>): void {
  if (typeof ctx.inject !== 'function') return
  try {
    ctx.inject(['configForms'], (face: unknown) => {
      try {
        const service = bindConfigForms(face)
        if (service === undefined) return
        const watch = service.whileServed(CONFIG_NAMESPACES, served => ctx.slots.inject(BUNDLE_CONFIG_SLOT, () => ctx.slots.register({
          name: BUNDLE_CONFIG_SLOT,
          key: PACKAGE_NAME,
          locale: NS,
          // The page reads the namespace it edits; the form itself stays with
          // the page, because the shell passes only `view` to the component.
          inject: () => ({ namespace: pickNamespace(served) }),
        }, ConfigPage)))
        disposers.push(watch)
      } catch (error) {
        console.warn(`[${NS}] config page registration skipped: ${messageOf(error)}`)
      }
    })
  } catch (error) {
    console.warn(`[${NS}] config page registration skipped: ${messageOf(error)}`)
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
    console.warn(`[${NS}] panel registration failed: ${messageOf(error)}`)
  }

  // Self-contained: the settings page may appear long after the panel, and
  // nothing it does can take the two registrations above down with it.
  registerBundleConfig(ctx, disposers)

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
