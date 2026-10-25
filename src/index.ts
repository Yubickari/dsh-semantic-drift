/**
 * Host entry: mounts the store-backed service onto one DSH process.
 *
 * Three surfaces, each registered through an effect so unloading the row
 * removes it again:
 * - five agent tools (`semantic_*`, `drift_scan`), registered globally, from any
 *   session;
 * - the `/semantic-drift/*` routes the browser half talks to;
 * - one system-prompt section, when `announceToAgent` is on.
 *
 * `webServer` is probed with `ctx.get` instead of injected: a Host without the
 * browser carrier still gets the tools and the prompt, which is the graceful
 * degradation the plugin promises. Tools and the prompt registry are hard
 * dependencies because the plugin has nothing to offer without them.
 *
 * @module dsh-semantic-drift
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { PROMPT_SECTION, PROMPT_SECTION_ORDER, buildPromptText } from './prompt.ts'
import { PACKAGE_NAME } from './protocol.ts'
import { makeSemanticRoutes } from './routes.ts'
import { createSemanticService } from './service.ts'
import type { SemanticConfig } from './service.ts'
import { buildSemanticTools } from './tools.ts'
import { createWorkspaceResolver } from './workspace.ts'

export { Config }

/** Package version, kept in sync with package.json by a test. */
export const VERSION = '0.1.0'

/** Services this plugin cannot work without. */
export const inject = ['tools', 'systemPrompt']

/** The context surface this entry uses, spelled structurally to stay version tolerant. */
interface PluginContext {
  get(name: string): unknown
  effect(callback: () => () => void, label?: string): () => void
  tools: { register(definition: unknown): () => void }
  systemPrompt: { section(section: {
    name: string
    order: number
    text: string | ((context?: unknown) => string)
  }): () => void }
  logger?(name: string): { info(message: string): void; warn(message: string): void }
}

/** Config as it arrives from the Loader. */
type LoaderConfig = SemanticConfig

function loggerOf(ctx: PluginContext, name: string): { info(message: string): void; warn(message: string): void } {
  try {
    const logger = ctx.logger?.(name)
    if (logger !== undefined) return logger
  } catch {
    // Fall through to console.
  }
  return {
    info: message => console.info(`[${name}] ${message}`),
    warn: message => console.warn(`[${name}] ${message}`),
  }
}

/**
 * Mount the plugin.
 * @param ctx - host context.
 * @param rawConfig - validated plugin config (see {@link Config}).
 */
export function apply(ctx: Context, rawConfig: LoaderConfig): void {
  const context = ctx as unknown as PluginContext
  const config = rawConfig as unknown as SemanticConfig
  const log = loggerOf(context, PACKAGE_NAME)

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
    log.info(`${disposers.length} agent tools registered`)
    return () => {
      for (const dispose of disposers.splice(0).reverse()) dispose()
    }
  }, 'semantic-drift: agent tools')

  const webServer = (() => {
    try {
      return context.get('webServer') as { register(route: unknown): () => void } | undefined
    } catch {
      return undefined
    }
  })()

  if (webServer !== undefined) {
    context.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const route of makeSemanticRoutes(service)) disposers.push(webServer.register(route))
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
      log.info(`${disposers.length} routes registered`)
      return () => {
        for (const dispose of disposers.splice(0).reverse()) dispose()
      }
    }, 'semantic-drift: routes')
  } else {
    // The panel cannot load, but nothing else depends on it.
    log.info('no webServer service: the panel is unavailable, tools and prompt stay active')
  }

  context.effect(() => {
    if (config.announceToAgent === false) return () => undefined
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
    return dispose
  }, 'semantic-drift: prompt section')
}
