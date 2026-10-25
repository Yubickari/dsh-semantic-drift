/**
 * Agent tools.
 *
 * Five tools, all bound to the same service the panel uses: the vocabulary file
 * is the only state either surface can change, and neither can bypass the
 * validation the store performs.
 *
 * Output is always JSON: `{ ok: true, ... }` or `{ ok: false, code, message }`.
 * A refusal is a value, not an exception, because a model can act on
 * `code: "concept-not-found"` but not on a thrown stack trace.
 *
 * @module dsh-semantic-drift/tools
 */

import { defineTool } from './define-tool.ts'
import type { ToolDefinition } from './define-tool.ts'
import { CONCEPT_KINDS, CONFIDENCE_LEVELS, DETECTOR_IDS } from './protocol.ts'
import type { Concept, ConceptKind, Confidence, DetectorId, DriftFinding, ExceptionOp } from './protocol.ts'
import { SemanticError } from './service.ts'
import type { SemanticService } from './service.ts'
import type { WorkspaceTarget } from './workspace.ts'

/** Registered tool names, in registration order. */
export const SEMANTIC_TOOL_NAMES = [
  'semantic_list',
  'semantic_get',
  'semantic_upsert',
  'drift_scan',
  'semantic_accept',
] as const

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function renderJson(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

function json(value: unknown): Json {
  return value as Json
}

function refused(code: string, message: string): Json {
  return json({ ok: false, code, message })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The calling session id, used to pick the workspace the agent is working in. */
function sessionOf(exec: { agent?: unknown }): string | undefined {
  const agent = exec.agent as { session?: { id?: unknown; header?: { id?: unknown } } } | undefined
  const id = agent?.session?.id ?? agent?.session?.header?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/** Split a comma or newline separated argument into trimmed values. */
function splitList(value: string | undefined): string[] {
  if (value === undefined) return []
  return value
    .split(/[,\n]/)
    .map(part => part.trim())
    .filter(part => part !== '')
}

function conceptView(concept: Concept): Record<string, unknown> {
  return {
    id: concept.id,
    terms: concept.terms,
    kind: concept.kind,
    canonical: concept.canonical,
    ...(concept.note === undefined ? {} : { note: concept.note }),
    ...(concept.accepted === undefined || concept.accepted.length === 0 ? {} : { accepted: concept.accepted }),
  }
}

function findingView(finding: DriftFinding): Record<string, unknown> {
  return {
    detector: finding.detector,
    confidence: finding.confidence,
    path: finding.path,
    line: finding.line,
    symbol: finding.symbol,
    ...(finding.expected === undefined ? {} : { expected: finding.expected }),
    ...(finding.conceptId === undefined ? {} : { conceptId: finding.conceptId }),
    citation: finding.citation,
    message: finding.message,
    ...(Object.keys(finding.detail).length === 0 ? {} : { detail: finding.detail }),
  }
}

/** The narrow service face the tools depend on. */
export interface SemanticToolHost {
  resolveForSession(sessionId?: string): Promise<WorkspaceTarget>
  service: SemanticService
}

function toolError(error: unknown): Json {
  if (error instanceof SemanticError) {
    return json({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.issues.length === 0 ? {} : { issues: error.issues }),
    })
  }
  return refused('failed', messageOf(error))
}

/**
 * Build the five tools bound to one host.
 * @param host - workspace resolution plus the shared service.
 */
export function buildSemanticTools(host: SemanticToolHost): ToolDefinition[] {
  const { service } = host

  const list = defineTool({
    name: 'semantic_list',
    description: [
      'List the project vocabulary: one entry per concept, with its dotted id, canonical symbol, kind and note.',
      'Use it before naming a field, type, enum or message so the new name matches the recorded concept.',
      '`hasDrift` is expensive: it runs a scan and returns each concept\'s finding count.',
    ].join(' '),
    parameters: {
      group: { type: 'string', description: 'Only concepts whose id starts with this group, e.g. "device".' },
      query: { type: 'string', description: 'Case-insensitive match against id, terms and canonical symbol.' },
      hasDrift: { type: 'boolean', description: 'Run a scan and keep only concepts with findings (costs one scan).' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec))
        const state = await service.state(target.path)
        const query = args.query?.trim().toLowerCase() ?? ''
        const group = args.group?.trim()
        let concepts = state.vocabulary.document.concepts
        if (group !== undefined) concepts = concepts.filter(concept => concept.id === group || concept.id.startsWith(`${group}.`))
        if (query !== '') {
          concepts = concepts.filter(concept =>
            concept.id.toLowerCase().includes(query)
            || concept.canonical.symbol.toLowerCase().includes(query)
            || concept.terms.some(term => term.toLowerCase().includes(query)),
          )
        }
        let counts: Map<string, number> | undefined
        if (args.hasDrift === true) {
          const scan = await service.scan(target.path, { minConfidence: 'medium' })
          counts = new Map()
          for (const finding of scan.summary.findings) {
            const key = finding.conceptId ?? `symbol:${finding.symbol}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
          }
          concepts = concepts.filter(concept => (counts?.get(concept.id) ?? 0) > 0)
        }
        return json({
          ok: true,
          workspace: state.workspace.path,
          vocabularyFile: state.vocabulary.relativeFile,
          vocabularyExists: state.vocabulary.exists,
          total: state.vocabulary.document.concepts.length,
          valid: state.vocabulary.valid,
          ...(state.vocabulary.issues.length === 0 ? {} : { issues: state.vocabulary.issues.slice(0, 3) }),
          concepts: concepts.map(concept => ({
            ...conceptView(concept),
            ...(counts === undefined ? {} : { driftCount: counts.get(concept.id) ?? 0 }),
          })),
        })
      } catch (error) {
        return toolError(error)
      }
    },
  })

  const get = defineTool({
    name: 'semantic_get',
    description: [
      'Read one concept by id or by canonical symbol, including its accepted exceptions.',
      'Call this before changing a data model: it says which spelling the project treats as canonical.',
      'Add `includeDrift` to also scan this concept for drift (costs one scan).',
    ].join(' '),
    parameters: {
      id: { type: 'string', description: 'Concept id, e.g. "device.target_temperature".' },
      symbol: { type: 'string', description: 'Canonical symbol, when the id is unknown.' },
      includeDrift: { type: 'boolean', description: 'Run a scan and return findings for this concept (default false).' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec))
        const state = await service.state(target.path)
        const id = args.id?.trim()
        const symbol = args.symbol?.trim()
        if ((id === undefined || id === '') && (symbol === undefined || symbol === '')) {
          return refused('missing-argument', 'Pass either id or symbol.')
        }
        const concept = state.vocabulary.document.concepts.find(entry =>
          (id !== undefined && id !== '' && entry.id === id)
          || (symbol !== undefined && symbol !== '' && entry.canonical.symbol === symbol),
        )
        if (concept === undefined) {
          return refused('concept-not-found', `No concept matches ${id ?? ''}${symbol === undefined ? '' : `/${symbol}`}.`)
        }
        let findings: Record<string, unknown>[] | undefined
        let truncated: boolean | undefined
        if (args.includeDrift === true) {
          const scan = await service.scan(target.path, { minConfidence: 'medium' })
          findings = scan.summary.findings
            .filter(finding => finding.conceptId === concept.id)
            .map(findingView)
          truncated = scan.summary.truncated
        }
        return json({
          ok: true,
          workspace: state.workspace.path,
          valid: state.vocabulary.valid,
          ...(state.vocabulary.issues.length === 0 ? {} : { issues: state.vocabulary.issues.slice(0, 3) }),
          concept: conceptView(concept),
          ...(findings === undefined ? {} : { drift: findings, driftTruncated: truncated }),
        })
      } catch (error) {
        return toolError(error)
      }
    },
  })

  const upsert = defineTool({
    name: 'semantic_upsert',
    description: [
      'Create or update one vocabulary concept, using the same validation the panel uses.',
      'Validation failures are returned as `ok:false` with positioned `issues`; nothing is written then.',
      'In merge mode (the default) omitted fields keep their current value, so a partial update is safe.',
    ].join(' '),
    parameters: {
      conceptId: { type: 'string', required: true, description: 'Dotted id, e.g. "device.target_temperature". Required and cannot be renamed.' },
      terms: { type: 'string', description: 'Comma separated Chinese terms and aliases. Required when creating.' },
      kind: { type: 'string', enum: [...CONCEPT_KINDS], description: 'Concept kind. Defaults to entity when creating.' },
      symbol: { type: 'string', required: true, description: 'Canonical symbol. Required when creating; must be unique across the vocabulary.' },
      symbolType: { type: 'string', description: 'Free-text canonical type, for display.' },
      unit: { type: 'string', description: 'Canonical unit; meaningful for kind=quantity.' },
      note: { type: 'string', description: 'One sentence describing the concept.' },
      mode: { type: 'string', enum: ['merge', 'replace'], description: 'merge keeps omitted fields; replace rebuilds the entry (default merge).' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec))
        const terms = splitList(args.terms)
        const concept: Partial<Concept> & { id?: string } = { id: args.conceptId }
        if (terms.length > 0) concept.terms = terms
        if (args.kind !== undefined) concept.kind = args.kind as ConceptKind
        if (args.note !== undefined) concept.note = args.note
        if (args.symbol !== undefined || args.symbolType !== undefined || args.unit !== undefined) {
          const canonical: { symbol?: string; type?: string; unit?: string } = {}
          if (args.symbol !== undefined && args.symbol !== '') canonical.symbol = args.symbol
          if (args.symbolType !== undefined) canonical.type = args.symbolType
          if (args.unit !== undefined) canonical.unit = args.unit
          ;(concept as { canonical?: typeof canonical }).canonical = canonical
        }
        const result = await service.upsert(target.path, {
          concept,
          ...(args.mode === 'merge' || args.mode === 'replace' ? { mode: args.mode } : {}),
        })
        return json({
          ok: true,
          created: result.created,
          concept: conceptView(result.concept),
          vocabularyFile: result.state.relativeFile,
        })
      } catch (error) {
        return toolError(error)
      }
    },
  })

  const scan = defineTool({
    name: 'drift_scan',
    description: [
      'Scan the workspace for drift between the vocabulary and the code, and return structured findings.',
      'The scan is read-only: it opens files for reading and never writes, renames or deletes anything.',
      'Findings carry `detector`, `confidence` and a `citation` in the format configured for the project.',
    ].join(' '),
    parameters: {
      detectors: { type: 'string', description: `Comma separated subset of: ${DETECTOR_IDS.join(', ')}. Default: all configured.` },
      paths: { type: 'string', description: 'Comma separated workspace-relative directories or files to restrict the scan to.' },
      minConfidence: { type: 'string', enum: [...CONFIDENCE_LEVELS], description: 'Keep findings at or above this level. Default: the plugin setting.' },
      concept: { type: 'string', description: 'Only return findings for this concept id.' },
      limit: { type: 'integer', description: 'Maximum findings returned (default 200).' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec))
        const detectors = splitList(args.detectors).filter((value): value is DetectorId =>
          (DETECTOR_IDS as readonly string[]).includes(value),
        )
        const paths = splitList(args.paths)
        const minConfidence = (CONFIDENCE_LEVELS as readonly string[]).includes(args.minConfidence ?? '')
          ? (args.minConfidence as Confidence)
          : undefined
        const result = await service.scan(target.path, {
          ...(detectors.length === 0 ? {} : { detectors }),
          ...(paths.length === 0 ? {} : { paths }),
          ...(minConfidence === undefined ? {} : { minConfidence }),
        })
        const requestedLimit = Number.isFinite(args.limit) && args.limit !== undefined ? Math.max(1, Math.trunc(args.limit)) : 200
        const concept = args.concept?.trim()
        const matching = concept === undefined || concept === ''
          ? result.summary.findings
          : result.summary.findings.filter(finding => finding.conceptId === concept)
        return json({
          ok: true,
          workspace: result.workspace.path,
          scanned: {
            files: result.summary.filesScanned,
            skipped: result.summary.filesSkipped,
            bytes: result.summary.bytesScanned,
            durationMs: result.summary.durationMs,
            truncated: result.summary.truncated,
            ...(result.summary.truncatedReason === undefined ? {} : { truncatedReason: result.summary.truncatedReason }),
          },
          counts: result.summary.counts,
          total: matching.length,
          returned: Math.min(matching.length, requestedLimit),
          findings: matching.slice(0, requestedLimit).map(findingView),
          ...(matching.length > requestedLimit
            ? { omitted: matching.length - requestedLimit, hint: 'Narrow with detectors, paths, minConfidence or concept, or raise limit.' }
            : {}),
          ...(result.vocabularyIssues.some(issue => issue.severity === 'error')
            ? { vocabularyIssues: result.vocabularyIssues.filter(issue => issue.severity === 'error') }
            : {}),
        })
      } catch (error) {
        return toolError(error)
      }
    },
  })

  const accept = defineTool({
    name: 'semantic_accept',
    description: [
      'Manage accepted exceptions: add one, change its scope or reason, remove one, or clear a concept.',
      'An exception needs a reason: it is a documented decision, not a silenced warning.',
      '`path` is a glob; without it the symbol is accepted everywhere. Removing an exception makes the findings it muted reappear on the next scan.',
      'To change or remove an existing exception, locate it with `previousPath` (and `occurrence` when the same symbol and path repeat); `path` is the scope an update moves to, not the lookup key.',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        enum: ['add', 'update', 'remove', 'clear'],
        description: 'add (default), update, remove, or clear every exception of the concept.',
      },
      conceptId: { type: 'string', required: true, description: 'Concept the exception belongs to.' },
      symbol: { type: 'string', description: 'The observed spelling. Required for every action except clear.' },
      path: { type: 'string', description: 'add/update: the scope to accept or move to, as a workspace-relative glob, e.g. "src/Legacy/**". Omit for the whole symbol. Not a lookup key for update/remove.' },
      previousPath: { type: 'string', description: 'update/remove: locate the existing exception by its current path. Omit for the whole-symbol one. This is the field that picks the entry to change.' },
      reason: { type: 'string', description: 'Required for add and update. Why this spelling is allowed to stay.' },
      occurrence: { type: 'integer', description: 'Which duplicate to target when a hand-edited file repeats the same symbol and path (default 0).' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args, exec) {
      try {
        const target = await host.resolveForSession(sessionOf(exec))
        const action = (args.action ?? 'add') as ExceptionOp
        const result = await service.changeException(target.path, {
          op: action,
          conceptId: args.conceptId,
          ...(args.symbol === undefined ? {} : { symbol: args.symbol }),
          ...(args.path === undefined ? {} : { path: args.path }),
          ...(args.previousPath === undefined ? {} : { previousPath: args.previousPath }),
          ...(args.reason === undefined ? {} : { reason: args.reason }),
          ...(args.occurrence === undefined ? {} : { occurrence: args.occurrence }),
        })
        return json({ ok: true, changed: result.changed, concept: conceptView(result.concept) })
      } catch (error) {
        return toolError(error)
      }
    },
  })

  return [list, get, upsert, scan, accept]
}
