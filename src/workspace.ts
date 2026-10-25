/**
 * Workspace resolution and authorization.
 *
 * Every route and every tool receives a directory to work on, and that
 * directory is the plugin's whole blast radius: the vocabulary file is written
 * inside it. So the rule is one function, used by both halves of the plugin:
 * a requested directory is accepted only when it is a registered DSH workspace
 * or lies inside one (or inside the Host's default working directory). Anything
 * else is a forbidden path, not a scan.
 *
 * Both optional services are probed with `ctx.get`, so a Host without a
 * workspace registry still serves the default directory.
 *
 * @module dsh-semantic-drift/workspace
 */

import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { WorkspaceOption } from './protocol.ts'

/** A directory this request may read and write. */
export interface WorkspaceTarget {
  path: string
  title?: string
  resolvedFrom: 'request' | 'session' | 'default'
}

/** A workspace request the plugin refuses. */
export class WorkspaceError extends Error {
  readonly code: 'forbidden' | 'missing' | 'not-directory'

  constructor(code: 'forbidden' | 'missing' | 'not-directory', message: string) {
    super(message)
    this.name = 'WorkspaceError'
    this.code = code
  }
}

/** The shape of `ctx.workspaceRegistry` this plugin relies on. */
interface WorkspaceRegistryFace {
  list(): Array<{ id: unknown; title?: unknown; path: unknown; sessionIds?: readonly unknown[] }>
}

/** The shape of `ctx.workingDirectory` this plugin relies on. */
interface WorkingDirectoryFace {
  readonly defaultDirectory: string
}

/** The minimal context surface this module needs. */
export interface WorkspaceContext {
  get(name: string): unknown
}

/** Canonical absolute path plus an existence check. */
async function canonicalDirectory(path: string): Promise<string> {
  const absolute = resolve(path)
  let real: string
  try {
    real = await realpath(absolute)
  } catch {
    throw new WorkspaceError('missing', `Directory does not exist: ${absolute}`)
  }
  let info
  try {
    info = await stat(real)
  } catch {
    throw new WorkspaceError('missing', `Directory does not exist: ${absolute}`)
  }
  if (!info.isDirectory()) throw new WorkspaceError('not-directory', `Not a directory: ${absolute}`)
  return real
}

function contains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
}

/** Workspace resolution bound to one plugin activation. */
export interface WorkspaceResolver {
  /** Registered workspaces, in registry order. */
  list(): WorkspaceOption[]
  /** The Host's deployment default directory. */
  defaultDirectory(): string
  /** Authorize one requested directory, or resolve the default. */
  resolve(requested?: string): Promise<WorkspaceTarget>
  /** Best-effort workspace of a session; falls back to the default. */
  resolveForSession(sessionId?: string): Promise<WorkspaceTarget>
}

/** Create the resolver for one plugin activation. */
export function createWorkspaceResolver(ctx: WorkspaceContext): WorkspaceResolver {
  const registry = (): WorkspaceRegistryFace | undefined => {
    try {
      return ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
    } catch {
      return undefined
    }
  }
  const workingDirectory = (): WorkingDirectoryFace | undefined => {
    try {
      return ctx.get('workingDirectory') as WorkingDirectoryFace | undefined
    } catch {
      return undefined
    }
  }
  const defaultDirectory = (): string => {
    const face = workingDirectory()
    const value = face?.defaultDirectory
    return typeof value === 'string' && value !== '' ? value : process.cwd()
  }
  const list = (): WorkspaceOption[] => {
    const face = registry()
    if (face === undefined) return []
    try {
      return face.list().flatMap(workspace => {
        if (typeof workspace.path !== 'string' || workspace.path === '') return []
        return [{
          id: String(workspace.id),
          title: typeof workspace.title === 'string' ? workspace.title : workspace.path,
          path: workspace.path,
        }]
      })
    } catch {
      return []
    }
  }

  const resolve = async (requested?: string): Promise<WorkspaceTarget> => {
    const workspaces = list()
    if (requested === undefined || requested.trim() === '') {
      const fallback = workspaces[0]
      const path = await canonicalDirectory(fallback?.path ?? defaultDirectory())
      return {
        path,
        ...(fallback?.title === undefined ? {} : { title: fallback.title }),
        resolvedFrom: 'default',
      }
    }
    if (!isAbsolute(requested)) {
      throw new WorkspaceError('forbidden', `Workspace path must be absolute: ${requested}`)
    }
    const target = await canonicalDirectory(requested)
    for (const workspace of workspaces) {
      let canonicalRoot: string
      try {
        canonicalRoot = await canonicalDirectory(workspace.path)
      } catch {
        continue
      }
      if (!contains(canonicalRoot, target)) continue
      return { path: target, title: workspace.title, resolvedFrom: 'request' }
    }
    try {
      const canonicalDefault = await canonicalDirectory(defaultDirectory())
      if (contains(canonicalDefault, target)) return { path: target, resolvedFrom: 'request' }
    } catch {
      // No usable default directory: only registered workspaces are allowed.
    }
    throw new WorkspaceError(
      'forbidden',
      `${target} is not a registered workspace and is not inside the Host's default directory.`,
    )
  }

  const resolveForSession = async (sessionId?: string): Promise<WorkspaceTarget> => {
    if (sessionId !== undefined && sessionId !== '') {
      const registryFace = registry()
      try {
        const owner = registryFace
          ?.list()
          .find(workspace => (workspace.sessionIds ?? []).some(id => String(id) === sessionId))
        if (owner !== undefined && typeof owner.path === 'string') {
          const path = await canonicalDirectory(owner.path)
          return {
            path,
            ...(typeof owner.title === 'string' ? { title: owner.title } : {}),
            resolvedFrom: 'session',
          }
        }
      } catch {
        // A registry failure must degrade to the default, not fail a tool call.
      }
    }
    return await resolve()
  }

  return { list, defaultDirectory, resolve, resolveForSession }
}
