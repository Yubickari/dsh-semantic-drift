/**
 * The one place that turns a request (HTTP route or agent tool) into a store
 * operation or a scan.
 *
 * Both surfaces call exactly these methods, so the panel and an agent can never
 * disagree about validation, authorization or the guarantees of a scan. There
 * is no cached scan result: `scan()` computes from disk every time, which is
 * also why the panel re-scans instead of trusting a stored report.
 *
 * @module dsh-semantic-drift/service
 */

import { basename } from 'node:path'
import { DEFAULT_VOCABULARY_PATH, DETECTOR_IDS } from './protocol.ts'
import type {
  AcceptedException,
  Concept,
  Confidence,
  DetectorId,
  ScanResponse,
  StateResponse,
  ValidationIssue,
  VocabularyDocument,
  VocabularyState,
  WorkspaceOption,
} from './protocol.ts'
import {
  emptyVocabulary,
  hasErrors,
  loadVocabulary,
  saveRawVocabulary,
  saveVocabulary,
} from './store.ts'
import { scanWorkspace, ScanError } from './scan/index.ts'
import type { WorkspaceResolver, WorkspaceTarget } from './workspace.ts'
import { WorkspaceError } from './workspace.ts'

/** Live plugin settings the service reads on every call. */
export interface SemanticConfig {
  vocabularyPath: string
  announceToAgent: boolean
  citationStyle: 'file+symbol' | 'file:line'
  minConfidence: Confidence
  timeoutMs: number
  maxFindings: number
  maxFileBytes: number
  maxFiles: number
  detectors: DetectorId[]
}

/** Refusal returned by the service; the transport decides the status code. */
export class SemanticError extends Error {
  readonly code: string
  readonly issues: ValidationIssue[]

  constructor(code: string, message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'SemanticError'
    this.code = code
    this.issues = issues
  }
}

/** One scan request, with per-call overrides of the configured budgets. */
export interface ScanOverrides {
  detectors?: readonly DetectorId[]
  paths?: readonly string[]
  minConfidence?: Confidence | 'all'
  timeoutMs?: number
  maxFindings?: number
}

/** Service construction input. */
export interface SemanticServiceOptions {
  config: SemanticConfig
  workspace: WorkspaceResolver
  version: string
}

/** The vocabulary operations both halves share. */
export interface SemanticService {
  listWorkspaces(): WorkspaceOption[]
  resolve(requested?: string): Promise<WorkspaceTarget>
  state(requested?: string): Promise<StateResponse>
  scan(requested: string | undefined, overrides?: ScanOverrides): Promise<ScanResponse>
  save(requested: string | undefined, document: VocabularyDocument): Promise<VocabularyState>
  saveRaw(requested: string | undefined, text: string): Promise<VocabularyState>
  init(requested?: string): Promise<VocabularyState>
  accept(
    requested: string | undefined,
    input: { conceptId: string; symbol: string; path?: string; reason: string },
  ): Promise<{ state: VocabularyState; concept: Concept }>
  upsert(
    requested: string | undefined,
    input: { concept: Partial<Concept> & { id?: string }; mode?: 'merge' | 'replace' },
  ): Promise<{ state: VocabularyState; concept: Concept; created: boolean }>
}

/** Truncate the raw text the panel receives so one huge file cannot jam the UI. */
const MAX_STATE_TEXT = 1_048_576

function hasErrorIssues(state: VocabularyState): boolean {
  return hasErrors(state.issues)
}

function refuseInvalid(state: VocabularyState): never {
  throw new SemanticError(
    'invalid-vocabulary',
    `${state.relativeFile} has validation errors; fix the file before editing it through the panel or a tool.`,
    state.issues.filter(issue => issue.severity === 'error'),
  )
}

/** Normalize a partial concept from a tool call into a full entry. */
function coerceConcept(input: Partial<Concept> & { id?: string }, existing?: Concept): Concept {
  const canonical: Concept['canonical'] = { symbol: input.canonical?.symbol ?? existing?.canonical.symbol ?? '' }
  const type = input.canonical?.type ?? existing?.canonical.type
  if (type !== undefined) canonical.type = type
  const unit = input.canonical?.unit ?? existing?.canonical.unit
  if (unit !== undefined) canonical.unit = unit
  const note = input.note ?? existing?.note
  const accepted = input.accepted ?? existing?.accepted
  return {
    id: input.id ?? existing?.id ?? '',
    terms: input.terms ?? existing?.terms ?? [],
    kind: input.kind ?? existing?.kind ?? 'entity',
    canonical,
    ...(note === undefined ? {} : { note }),
    ...(accepted === undefined ? {} : { accepted }),
  }
}

/**
 * Create the service for one plugin activation.
 * @param options - live config, workspace resolver, package version.
 */
export function createSemanticService(options: SemanticServiceOptions): SemanticService {
  const { config, workspace } = options
  const relativePath = (): string =>
    config.vocabularyPath !== undefined && config.vocabularyPath.trim() !== ''
      ? config.vocabularyPath.trim()
      : DEFAULT_VOCABULARY_PATH

  const load = async (target: WorkspaceTarget): Promise<VocabularyState> =>
    await loadVocabulary(target.path, relativePath())

  const state = async (requested?: string): Promise<StateResponse> => {
    const target = await workspace.resolve(requested)
    const vocabulary = await load(target)
    const trimmed: VocabularyState = vocabulary.text !== undefined && vocabulary.text.length > MAX_STATE_TEXT
      ? { ...vocabulary, text: undefined }
      : vocabulary
    return {
      ok: true,
      workspace: {
        path: target.path,
        ...(target.title === undefined ? {} : { title: target.title }),
        resolvedFrom: target.resolvedFrom,
      },
      workspaces: workspace.list(),
      vocabulary: trimmed,
      citationStyle: config.citationStyle,
      minConfidence: config.minConfidence,
      version: options.version,
    }
  }

  const scan = async (requested: string | undefined, overrides: ScanOverrides = {}): Promise<ScanResponse> => {
    const target = await workspace.resolve(requested)
    const vocabulary = await load(target)
    const configured = config.detectors ?? []
    const detectors = overrides.detectors !== undefined && overrides.detectors.length > 0
      ? overrides.detectors
      : configured.length > 0
        ? configured
        : DETECTOR_IDS
    const minConfidence = overrides.minConfidence === 'all' ? undefined : (overrides.minConfidence ?? config.minConfidence)
    try {
      const summary = await scanWorkspace({
        root: target.path,
        document: vocabulary.document,
        citationStyle: config.citationStyle,
        timeoutMs: Math.min(overrides.timeoutMs ?? config.timeoutMs, 120_000),
        maxFindings: overrides.maxFindings ?? config.maxFindings,
        maxFileBytes: config.maxFileBytes,
        maxFiles: config.maxFiles,
        ...(minConfidence === undefined ? {} : { minConfidence }),
        detectors,
        ...(overrides.paths === undefined ? {} : { paths: overrides.paths }),
      })
      return {
        ok: true,
        workspace: {
          path: target.path,
          ...(target.title === undefined ? {} : { title: target.title }),
        },
        summary,
        vocabularyIssues: vocabulary.issues,
      }
    } catch (error) {
      if (error instanceof ScanError) throw new SemanticError('bad-request', error.message)
      throw error
    }
  }

  const save = async (requested: string | undefined, document: VocabularyDocument): Promise<VocabularyState> => {
    const target = await workspace.resolve(requested)
    const current = await load(target)
    if (current.exists && hasErrorIssues(current)) refuseInvalid(current)
    const result = await saveVocabulary(target.path, relativePath(), document)
    if (!result.ok) {
      throw new SemanticError('invalid-vocabulary', 'The vocabulary was not written because it failed validation.', result.issues)
    }
    return result.state
  }

  const saveRaw = async (requested: string | undefined, text: string): Promise<VocabularyState> => {
    const target = await workspace.resolve(requested)
    const result = await saveRawVocabulary(target.path, relativePath(), text)
    if (!result.ok) {
      throw new SemanticError('invalid-vocabulary', 'The vocabulary was not written because it failed validation.', result.issues)
    }
    return result.state
  }

  const init = async (requested?: string): Promise<VocabularyState> => {
    const target = await workspace.resolve(requested)
    const current = await load(target)
    if (current.exists) return current
    const document = emptyVocabulary(basename(target.path))
    const result = await saveVocabulary(target.path, relativePath(), document)
    if (!result.ok) {
      throw new SemanticError('invalid-vocabulary', 'Could not create the vocabulary file.', result.issues)
    }
    return result.state
  }

  const accept = async (
    requested: string | undefined,
    input: { conceptId: string; symbol: string; path?: string; reason: string },
  ): Promise<{ state: VocabularyState; concept: Concept }> => {
    const target = await workspace.resolve(requested)
    const current = await load(target)
    if (!current.exists) {
      throw new SemanticError('not-found', `No vocabulary file at ${current.relativeFile}.`)
    }
    if (hasErrorIssues(current)) refuseInvalid(current)
    const concept = current.document.concepts.find(entry => entry.id === input.conceptId)
    if (concept === undefined) {
      throw new SemanticError('not-found', `No concept with id ${input.conceptId}.`)
    }
    const symbol = input.symbol.trim()
    const reason = input.reason.trim()
    if (symbol === '') throw new SemanticError('bad-request', 'symbol is required.')
    if (reason === '') {
      throw new SemanticError('bad-request', 'reason is required: an accepted exception without a reason is an undocumented decision.')
    }
    const existing: AcceptedException[] = concept.accepted ?? []
    const duplicate = existing.some(entry => entry.symbol === symbol && (entry.path ?? '') === (input.path ?? ''))
    const nextConcept: Concept = duplicate
      ? concept
      : {
          ...concept,
          accepted: [
            ...existing,
            { symbol, ...(input.path === undefined || input.path === '' ? {} : { path: input.path }), reason },
          ],
        }
    const document: VocabularyDocument = {
      ...current.document,
      concepts: current.document.concepts.map(entry => (entry.id === concept.id ? nextConcept : entry)),
    }
    const result = await saveVocabulary(target.path, relativePath(), document)
    if (!result.ok) {
      throw new SemanticError('invalid-vocabulary', 'The exception was not written because it failed validation.', result.issues)
    }
    return { state: result.state, concept: nextConcept }
  }

  const upsert = async (
    requested: string | undefined,
    input: { concept: Partial<Concept> & { id?: string }; mode?: 'merge' | 'replace' },
  ): Promise<{ state: VocabularyState; concept: Concept; created: boolean }> => {
    const target = await workspace.resolve(requested)
    const current = await load(target)
    if (hasErrorIssues(current)) refuseInvalid(current)
    const id = input.concept.id?.trim()
    if (id === undefined || id === '') throw new SemanticError('bad-request', 'concept.id is required.')
    const existing = current.document.concepts.find(entry => entry.id === id)
    const mode = input.mode ?? 'merge'
    let next: Concept
    if (existing !== undefined && mode === 'replace') {
      next = coerceConcept(input.concept)
    } else {
      next = coerceConcept(input.concept, existing)
    }
    if (next.terms.length === 0) {
      throw new SemanticError('invalid-vocabulary', 'concept.terms must list at least one term.', [
        { code: 'terms-missing', message: '`terms` must list at least one Chinese term or alias.', severity: 'error', path: 'concept.terms' },
      ])
    }
    if (next.canonical.symbol === '') {
      throw new SemanticError('invalid-vocabulary', 'concept.canonical.symbol is required.', [
        { code: 'symbol-missing', message: '`canonical.symbol` is required.', severity: 'error', path: 'concept.canonical.symbol' },
      ])
    }
    const document: VocabularyDocument = {
      ...current.document,
      concepts: existing === undefined
        ? [...current.document.concepts, next]
        : current.document.concepts.map(entry => (entry.id === id ? next : entry)),
    }
    const result = await saveVocabulary(target.path, relativePath(), document)
    if (!result.ok) {
      throw new SemanticError('invalid-vocabulary', 'The concept was not written because the document failed validation.', result.issues)
    }
    return { state: result.state, concept: next, created: existing === undefined }
  }

  return {
    listWorkspaces: () => workspace.list(),
    resolve: async (requested?: string) => await workspace.resolve(requested),
    state,
    scan,
    save,
    saveRaw,
    init,
    accept,
    upsert,
  }
}

/** Translate a service refusal into an HTTP status. */
export function statusForError(error: unknown): number {
  if (error instanceof WorkspaceError) return error.code === 'forbidden' ? 403 : 404
  if (error instanceof SemanticError) {
    if (error.code === 'not-found') return 404
    if (error.code === 'invalid-vocabulary' || error.code === 'bad-request') return 400
    return 400
  }
  return 500
}
