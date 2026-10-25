/**
 * System-prompt section: what the model needs to know about the vocabulary
 * before it names something.
 *
 * The section is a function, not a string, so it is rebuilt for every prompt
 * assembly. The file itself is read synchronously and cached by mtime: the
 * vocabulary is a few kilobytes, and a stale prompt would be worse than a
 * millisecond of I/O.
 *
 * Budget: at most 200 lines. Concepts beyond that are summarized as a count, so
 * a large vocabulary cannot crowd out the rest of the prompt.
 *
 * @module dsh-semantic-drift/prompt
 */

import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ConceptKind } from './protocol.ts'
import { CONCEPT_KINDS, DEFAULT_VOCABULARY_PATH } from './protocol.ts'
import type { SemanticConfig } from './service.ts'
import type { WorkspaceResolver } from './workspace.ts'

/** Stable section name; a scoped section with this name shadows the global one. */
export const PROMPT_SECTION = 'plugin:semantic-drift'

/** Order inside the shared tool-guidance band. */
export const PROMPT_SECTION_ORDER = 210

/** Hard line budget for the whole section. */
const MAX_LINES = 200

/** Concepts listed at most; the rest is summarized. */
const MAX_CONCEPTS = 120

/** Cached concept lines, keyed by absolute vocabulary path. */
interface CachedLines {
  mtimeMs: number
  size: number
  lines: string[]
  count: number
}

const cache = new Map<string, CachedLines>()

function oneLine(text: string, limit = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the concept lines of one vocabulary file, tolerating any hand edit. */
function conceptLines(file: string): { lines: string[]; count: number } | undefined {
  let info
  try {
    info = statSync(file)
  } catch {
    return undefined
  }
  const cached = cache.get(file)
  if (cached !== undefined && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    return cached
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  let raw: unknown
  try {
    raw = parseYaml(text)
  } catch {
    return undefined
  }
  if (!isRecord(raw) || !Array.isArray(raw.concepts)) return undefined
  const concepts = raw.concepts.filter(isRecord) as Array<Record<string, unknown>>
  const lines: string[] = []
  for (const entry of concepts.slice(0, MAX_CONCEPTS)) {
    const id = typeof entry.id === 'string' ? entry.id : ''
    const canonical = isRecord(entry.canonical) ? entry.canonical : {}
    const symbol = typeof canonical.symbol === 'string' ? canonical.symbol : ''
    if (id === '' || symbol === '') continue
    const kind = typeof entry.kind === 'string' && (CONCEPT_KINDS as readonly string[]).includes(entry.kind)
      ? (entry.kind as ConceptKind)
      : undefined
    const note = typeof entry.note === 'string' ? oneLine(entry.note) : ''
    const head = kind === undefined ? `${id} -> ${symbol}` : `${id} (${kind}) -> ${symbol}`
    lines.push(note === '' ? `- ${head}` : `- ${head}: ${note}`)
  }
  const result: CachedLines = { mtimeMs: info.mtimeMs, size: info.size, lines, count: concepts.length }
  cache.set(file, result)
  return result
}

/** The vocabulary file that applies to the calling session, when it can be found. */
function vocabularyFileFor(ctx: unknown, config: SemanticConfig, workspace: WorkspaceResolver): {
  file: string
  workspacePath: string
} {
  const relative = config.vocabularyPath !== undefined && config.vocabularyPath.trim() !== ''
    ? config.vocabularyPath.trim()
    : DEFAULT_VOCABULARY_PATH
  const context = ctx as { get?: (name: string) => unknown }
  const list = workspace.list()
  let ownerPath: string | undefined
  try {
    const agents = context.get?.('agents') as { currentInitiator?: () => { id: string } | undefined } | undefined
    const sessionId = agents?.currentInitiator?.()?.id
    if (sessionId !== undefined) {
      const registry = context.get?.('workspaceRegistry') as
        | { list(): Array<{ path: string; sessionIds?: readonly unknown[] }> }
        | undefined
      const owner = registry?.list().find(item => (item.sessionIds ?? []).some(id => String(id) === sessionId))
      if (owner !== undefined && typeof owner.path === 'string') ownerPath = owner.path
    }
  } catch {
    ownerPath = undefined
  }
  const workspacePath = ownerPath ?? list[0]?.path ?? workspace.defaultDirectory()
  return { file: resolve(workspacePath, relative), workspacePath }
}

/**
 * Build the prompt section text for the current assembly.
 * @param ctx - host context, used only to find the calling session.
 * @param config - live plugin config.
 * @param workspace - workspace resolver.
 */
export function buildPromptText(ctx: unknown, config: SemanticConfig, workspace: WorkspaceResolver): string {
  const header = [
    '## Project vocabulary (dsh-semantic-drift)',
    'This project records its business concepts in one versioned vocabulary file.',
    'Rules:',
    '- Before adding or renaming a data field, type, enum or message, call `semantic_get` with the concept id or canonical symbol.',
    '- Name the thing exactly as `canonical.symbol` spells it.',
    '- If the concept is missing from the list below, call `semantic_upsert` to register it first.',
    '- If a known spelling must stay, call `semantic_accept` with a reason.',
  ]
  let body: string[]
  try {
    const { file, workspacePath } = vocabularyFileFor(ctx, config, workspace)
    const lines = conceptLines(file)
    if (lines === undefined) {
      body = [
        '',
        `No concept is recorded yet for ${basename(workspacePath)} (expected vocabulary file: \`${file}\`).`,
        'When you introduce a domain term, register it with `semantic_upsert`; a vocabulary that starts empty stays empty.',
      ]
    } else {
      body = ['', `Concepts (${lines.count}):`, ...lines.lines]
      if (lines.count > lines.lines.length) {
        body.push(`- ... ${lines.count - lines.lines.length} more; call \`semantic_list\` for the rest.`)
      }
    }
  } catch {
    body = ['', 'The vocabulary file could not be read; call `semantic_list` to check it.']
  }
  const all = [...header, ...body]
  if (all.length <= MAX_LINES) return all.join('\n')
  return [...all.slice(0, MAX_LINES - 1), `- (truncated at ${MAX_LINES} lines)`].join('\n')
}
