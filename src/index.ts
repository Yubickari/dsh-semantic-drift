/**
 * Host entry: mounts the store-backed service onto one DSH process.
 *
 * Three surfaces, each registered through an effect so unloading the row
 * removes it again:
 * - five agent tools (`semantic_*`, `drift_scan`), registered globally, from any
 *   session;
 * - the `/semantic-drift/*` routes the browser half talks to;
 * - one system-prompt section, registered unconditionally: it goes silent by
 *   returning an empty text while `announceToAgent` is off, so flipping that
 *   switch — a volatile field the Loader commits in place — needs no reload.
 *
 * `webServer` is probed with `ctx.get` instead of injected: a Host without the
 * browser carrier still gets the tools and the prompt, which is the graceful
 * degradation the plugin promises. Tools and the prompt registry are hard
 * dependencies because the plugin has nothing to offer without them.
 *
 * @module dsh-semantic-drift
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, announceEnabled, liveConfig, liveValue } from './config.ts'
import type { Volatile } from './config.ts'
import { PROMPT_SECTION, PROMPT_SECTION_ORDER, buildPromptText } from './prompt.ts'
import { PACKAGE_NAME, ROW_ID } from './protocol.ts'
import { makeSemanticRoutes } from './routes.ts'
import { SemanticError, createSemanticService } from './service.ts'
import type { SemanticConfig } from './service.ts'
import { buildSemanticTools } from './tools.ts'
import { createWorkspaceResolver, workspaceKey } from './workspace.ts'

export { Config }

/** Package version, kept in sync with package.json by a test. */
export const VERSION = '0.1.6'

/**
 * Services this plugin cannot work without.
 *
 * `webServer` is injected rather than probed on purpose: the routes ARE this
 * plugin's browser half, and probing meant a cold boot could run `apply` before
 * the HTTP carrier existed, silently registering no routes at all. Declaring the
 * dependency is what tells the Loader to wait. A Host without a web carrier now
 * reports the row as un-activatable instead of half-mounting it.
 */
export const inject = ['tools', 'systemPrompt', 'webServer']

/** The context surface this entry uses, spelled structurally to stay version tolerant. */
interface PluginContext {
  get(name: string): unknown
  webServer?: { register(route: unknown): () => void }
  effect(callback: () => () => void, label?: string): () => void
  tools: { register(definition: unknown): () => void }
  systemPrompt: { section(section: {
    name: string
    order: number
    text: string | ((context?: unknown) => string)
  }): () => void }
  logger?(name: string): { info(message: string): void; warn(message: string): void }
}

/** Config as it arrives from the Loader: live references, one per volatile field. */
type LoaderConfig = Record<string, Volatile<unknown>>

const CONSOLE_LOGGER = (name: string) => ({
  info: (message: string) => console.info(`[${name}] ${message}`),
  warn: (message: string) => console.warn(`[${name}] ${message}`),
})

/**
 * Resolve a logger that can never stop the plugin.
 *
 * Logging is diagnostics, and a diagnostic that throws would abort `apply` —
 * which is exactly how a plugin ends up half mounted with no explanation. Both
 * the lookup and each call are therefore wrapped.
 */
function loggerOf(ctx: PluginContext, name: string): { info(message: string): void; warn(message: string): void } {
  let underlying: { info(message: string): void; warn(message: string): void } | undefined
  try {
    underlying = ctx.logger?.(name)
  } catch {
    underlying = undefined
  }
  if (underlying === undefined) return CONSOLE_LOGGER(name)
  return {
    info: message => {
      try {
        underlying?.info(message)
      } catch {
        // Never let a log line break a plugin.
      }
    },
    warn: message => {
      try {
        underlying?.warn(message)
      } catch {
        // Never let a log line break a plugin.
      }
    },
  }
}

/**
 * Mount the plugin.
 * @param ctx - host context.
 * @param rawConfig - validated plugin config (see {@link Config}).
 */
export function apply(ctx: Context, rawConfig: LoaderConfig): void {
  const context = ctx as unknown as PluginContext
  // Every field is volatile, so the Loader hands over live references. Reading
  // them through one wrapper is what makes tools, routes and the prompt see a
  // settings change in place, without the row being reloaded.
  const config = liveConfig<SemanticConfig>(rawConfig)
  const log = loggerOf(context, PACKAGE_NAME)

  /** What this activation actually mounted, reported by `/semantic-drift/health`. */
  const health: { tools: number; routes: number; prompt: boolean } = { tools: 0, routes: 0, prompt: false }

  const workspace = createWorkspaceResolver(context)
  const service = createSemanticService({ config, workspace, version: VERSION })

  context.effect(() => {
    let disposers: Array<() => void> = []
    try {
      disposers = buildSemanticTools({ service, resolveForSession: id => workspace.resolveForSession(id) })
        .map(tool => ctx.tools.register(tool))
    } catch (error) {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // A failed mount must not mask the original error.
        }
      }
      log.warn(`agent tools were not registered: ${error instanceof Error ? error.message : String(error)}`)
      return () => undefined
    }
    health.tools = disposers.length
    log.info(`${disposers.length} agent tools registered`)
    return () => {
      for (const dispose of disposers.splice(0).reverse()) dispose()
    }
  }, 'semantic-drift: agent tools')

  // Injected above, so this is present; the fallback keeps a hand-mounted
  // context (tests, embedders) working without the property.
  const webServer = context.webServer ?? (() => {
    try {
      return context.get('webServer') as { register(route: unknown): () => void } | undefined
    } catch {
      return undefined
    }
  })()

  /**
   * The config editor is probed, not injected: a Host without one still gets
   * tools, routes and the prompt, and only the panel's injection switch is
   * unavailable (it says where to edit the setting instead).
   */
  interface LoaderEntry {
    id?: string
    patchId?: string
    name?: string
  }
  interface ConfigEditorLike {
    entries(): LoaderEntry[]
    configuration?(): Array<{ entry: LoaderEntry }>
    edit(
      entry: unknown,
      change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
    ): Promise<void>
  }
  /** Same-address test for the row this bundle inserts: its name, or its patch id. */
  const isOurEntry = (entry: LoaderEntry | undefined): boolean => {
    if (entry === undefined) return false
    if (entry.name === PACKAGE_NAME || entry.patchId === ROW_ID || entry.id === ROW_ID) return true
    return typeof entry.id === 'string' && entry.id.endsWith(`:${ROW_ID}`)
  }

  const configEditorEntry = (): { editor: ConfigEditorLike; entry: LoaderEntry } => {
    // Resolved per call, not at mount: an optional service can appear after this
    // row activates, and a captured `undefined` would never recover.
    let editor: ConfigEditorLike | undefined
    try {
      editor = context.get('configEditor') as ConfigEditorLike | undefined
    } catch {
      editor = undefined
    }
    if (editor === undefined) {
      throw new SemanticError('unsupported', 'This Host exposes no config editor; edit the plugin row under Plugins → Installed Plugins → this plugin → Configuration.')
    }
    const withConfig = editor.configuration?.() ?? []
    const entry = withConfig.map(item => item.entry).find(isOurEntry) ?? editor.entries().find(isOurEntry)
    if (entry === undefined) {
      const seen = (editor.entries() ?? []).map(candidate => candidate.name ?? candidate.id).slice(0, 6)
      throw new SemanticError(
        'unsupported',
        `${PACKAGE_NAME} is not a Loader entry in this profile (saw: ${seen.join(', ') || 'none'}); edit it under Plugins → Installed Plugins → this plugin → Configuration.`,
      )
    }
    return { editor, entry }
  }

  const editPluginConfig = async (patch: Record<string, unknown>): Promise<void> => {
    const { editor, entry } = configEditorEntry()
    await editor.edit(entry, current => ({ ...current, ...patch }))
  }

  /**
   * Write one workspace's prompt-injection choice into the hidden
   * `announceByWorkspace` map on this plugin's row. A map write is the smallest
   * change the Host's config editor can commit, and the prompt section reads the
   * same map live.
   */
  const editWorkspaceAnnounce = async (workspacePath: string, enabled: boolean): Promise<void> => {
    const { editor, entry } = configEditorEntry()
    const current = liveValue(config.announceByWorkspace) ?? {}
    const next = { ...current, [workspaceKey(workspacePath)]: enabled }
    await editor.edit(entry, currentConfig => ({ ...currentConfig, announceByWorkspace: next }))
  }

  if (webServer !== undefined) {
    context.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const route of makeSemanticRoutes(service, () => ({
          version: VERSION,
          vocabularyPath: config.vocabularyPath,
          announceToAgent: announceEnabled(config.announceToAgent),
          citationStyle: config.citationStyle,
          minConfidence: config.minConfidence,
          detectors: config.detectors,
          tools: health.tools,
          routes: health.routes,
          promptSection: health.prompt,
        }), { editConfig: editPluginConfig, editWorkspaceAnnounce })) disposers.push(webServer.register(route))
      } catch (error) {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // Keep the original failure.
          }
        }
        log.warn(`routes were not registered: ${error instanceof Error ? error.message : String(error)}`)
        return () => undefined
      }
      health.routes = disposers.length
      log.info(`${disposers.length} routes registered`)
      return () => {
        for (const dispose of disposers.splice(0).reverse()) dispose()
      }
    }, 'semantic-drift: routes')
  } else {
    // The panel cannot load, but nothing else depends on it.
    log.info('no webServer service: the panel is unavailable, tools and prompt stay active')
  }

  // Registered even while the switch is off: the section is the unit the Host
  // assembles, so mounting and unmounting it per edit would reload the row for
  // a setting that only has to change what one string says.
  context.effect(() => {
    const dispose = ctx.systemPrompt.section({
      name: PROMPT_SECTION,
      order: PROMPT_SECTION_ORDER,
      text: () => {
        try {
          return buildPromptText(context, config, workspace)
        } catch {
          // A prompt section must never fail an assembly.
          return ''
        }
      },
    })
    health.prompt = true
    return () => {
      health.prompt = false
      dispose()
    }
  }, 'semantic-drift: prompt section')
}
