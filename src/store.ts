/**
 * The vocabulary store: the only component that reads or writes
 * `.dsh/semantics.yaml`.
 *
 * Design rules this file enforces:
 * - One write path. Routes and agent tools both come through here, and writes
 *   are serialized per file, so the panel and a tool can never interleave.
 * - Validation happens before the write. A document that fails validation is
 *   never written; the caller gets positioned issues instead.
 * - Reads never mutate. Manual edits are picked up through an mtime check on
 *   the next read; no file watcher exists.
 * - Serialization is canonical and idempotent: parse(serialize(doc)) equals the
 *   same document, so repeated saves do not churn the file.
 *
 * @module dsh-semantic-drift/store
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { Document, isSeq, parseDocument } from 'yaml'
import { CONCEPT_KINDS, VOCABULARY_VERSION } from './protocol.ts'
import type {
  AcceptedException,
  Concept,
  ConceptKind,
  ValidationIssue,
  VocabularyDocument,
  VocabularyState,
} from './protocol.ts'
import { isValidGlob } from './glob.ts'

/** Patterns pruned by default. Kept in the file so they are visible and editable. */
export const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/bin/**',
  '**/obj/**',
  '.git/**',
  '**/.git/**',
  '**/target/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/.venv/**',
]

/** `group.concept`: at least one dot, lowercase snake segments. */
const CONCEPT_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

/** A canonical symbol must be a plain identifier. */
const SYMBOL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const KNOWN_CONCEPT_KEYS = new Set(['id', 'terms', 'kind', 'canonical', 'note', 'accepted'])
const KNOWN_TOP_LEVEL_KEYS = new Set(['version', 'meta', 'exclude', 'concepts'])

/** Today in `YYYY-MM-DD`, using the local calendar. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 1-based line of the first occurrence of `needle`, for issue positioning. */
function findLine(text: string, needle: string | undefined): number | undefined {
  if (needle === undefined || needle === '') return undefined
  const index = text.indexOf(needle)
  if (index < 0) return undefined
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** A vocabulary with defaults applied and no concepts. */
export function emptyVocabulary(project?: string): VocabularyDocument {
  return {
    version: VOCABULARY_VERSION,
    meta: { project: project ?? 'workspace', updated: today() },
    exclude: [...DEFAULT_EXCLUDES],
    concepts: [],
  }
}

/**
 * Coerce arbitrary parsed YAML into the v1 shape.
 *
 * Normalization is deliberately forgiving about missing optional fields and
 * strict about every field that changes behavior: a document that cannot be
 * normalized is reported as an issue instead of being silently repaired.
 */
export function normalizeDocument(raw: unknown, text: string): { document: VocabularyDocument; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const fallback = emptyVocabulary()
  if (!isPlainObject(raw)) {
    issues.push({
      code: 'document-shape',
      message: 'The vocabulary file must be a mapping with a `concepts` list.',
      severity: 'error',
      line: 1,
    })
    return { document: fallback, issues }
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      issues.push({
        code: 'unknown-key',
        message: `Unknown top-level key \`${key}\`; it is ignored.`,
        severity: 'warning',
        path: key,
        line: findLine(text, `${key}:`),
      })
    }
  }

  const version = typeof raw.version === 'number' ? raw.version : VOCABULARY_VERSION
  if (raw.version !== undefined && version !== VOCABULARY_VERSION) {
    issues.push({
      code: 'version-unsupported',
      message: `Vocabulary version ${String(raw.version)} is not supported; this plugin writes version ${VOCABULARY_VERSION}.`,
      severity: 'error',
      path: 'version',
      line: findLine(text, 'version:'),
    })
  }

  const metaRaw = isPlainObject(raw.meta) ? raw.meta : {}
  const project = asString(metaRaw.project)
  const updated = asString(metaRaw.updated)
  const exclude: string[] = []
  if (raw.exclude === undefined) {
    exclude.push(...DEFAULT_EXCLUDES)
  } else if (!Array.isArray(raw.exclude)) {
    issues.push({
      code: 'exclude-shape',
      message: '`exclude` must be a list of glob patterns.',
      severity: 'error',
      path: 'exclude',
      line: findLine(text, 'exclude:'),
    })
    exclude.push(...DEFAULT_EXCLUDES)
  } else {
    for (const [index, entry] of raw.exclude.entries()) {
      const pattern = asString(entry)
      if (pattern === undefined) {
        issues.push({
          code: 'exclude-entry',
          message: `\`exclude[${index}]\` must be a non-empty glob pattern.`,
          severity: 'error',
          path: `exclude[${index}]`,
          line: findLine(text, 'exclude:'),
        })
        continue
      }
      if (!isValidGlob(pattern)) {
        issues.push({
          code: 'exclude-glob',
          message: `\`exclude[${index}]\` is not a valid glob: ${pattern}`,
          severity: 'error',
          path: `exclude[${index}]`,
          line: findLine(text, pattern),
        })
        continue
      }
      exclude.push(pattern)
    }
  }

  const concepts: Concept[] = []
  if (raw.concepts !== undefined && !Array.isArray(raw.concepts)) {
    issues.push({
      code: 'concepts-shape',
      message: '`concepts` must be a list.',
      severity: 'error',
      path: 'concepts',
      line: findLine(text, 'concepts:'),
    })
  } else {
    for (const [index, entry] of (raw.concepts ?? []).entries()) {
      const at = `concepts[${index}]`
      if (!isPlainObject(entry)) {
        issues.push({ code: 'concept-shape', message: `\`${at}\` must be a mapping.`, severity: 'error', path: at })
        continue
      }
      for (const key of Object.keys(entry)) {
        if (!KNOWN_CONCEPT_KEYS.has(key)) {
          issues.push({
            code: 'unknown-key',
            message: `Unknown key \`${key}\` in \`${at}\`; it is ignored.`,
            severity: 'warning',
            path: `${at}.${key}`,
          })
        }
      }
      const id = asString(entry.id)
      if (id === undefined) {
        issues.push({ code: 'id-missing', message: `\`${at}.id\` is required.`, severity: 'error', path: `${at}.id` })
        continue
      }
      if (!CONCEPT_ID_PATTERN.test(id)) {
        issues.push({
          code: 'id-format',
          message: `Concept id \`${id}\` must look like \`group.name\`: lowercase letters, digits and underscores, at least one dot.`,
          severity: 'error',
          path: `${at}.id`,
          line: findLine(text, id),
        })
      }

      const terms: string[] = []
      if (!Array.isArray(entry.terms) || entry.terms.length === 0) {
        issues.push({
          code: 'terms-missing',
          message: `\`${at}.terms\` must list at least one Chinese term or alias.`,
          severity: 'error',
          path: `${at}.terms`,
          line: findLine(text, id),
        })
      } else {
        for (const [termIndex, term] of entry.terms.entries()) {
          const value = asString(term)
          if (value === undefined) {
            issues.push({
              code: 'term-empty',
              message: `\`${at}.terms[${termIndex}]\` must be a non-empty string.`,
              severity: 'error',
              path: `${at}.terms[${termIndex}]`,
            })
            continue
          }
          if (!terms.includes(value)) terms.push(value)
        }
      }

      const kindRaw = asString(entry.kind)
      let kind: ConceptKind = 'entity'
      if (kindRaw === undefined || !(CONCEPT_KINDS as readonly string[]).includes(kindRaw)) {
        issues.push({
          code: 'kind-invalid',
          message: `\`${at}.kind\` must be one of ${CONCEPT_KINDS.join(', ')}.`,
          severity: 'error',
          path: `${at}.kind`,
          line: findLine(text, id),
        })
      } else {
        kind = kindRaw as ConceptKind
      }

      const canonicalRaw = isPlainObject(entry.canonical) ? entry.canonical : undefined
      const symbol = canonicalRaw === undefined ? undefined : asString(canonicalRaw.symbol)
      if (symbol === undefined) {
        issues.push({
          code: 'symbol-missing',
          message: `\`${at}.canonical.symbol\` is required.`,
          severity: 'error',
          path: `${at}.canonical.symbol`,
          line: findLine(text, id),
        })
      } else if (!SYMBOL_PATTERN.test(symbol)) {
        issues.push({
          code: 'symbol-format',
          message: `Canonical symbol \`${symbol}\` must be a plain identifier.`,
          severity: 'error',
          path: `${at}.canonical.symbol`,
          line: findLine(text, symbol),
        })
      }

      const accepted: AcceptedException[] = []
      if (entry.accepted !== undefined) {
        if (!Array.isArray(entry.accepted)) {
          issues.push({
            code: 'accepted-shape',
            message: `\`${at}.accepted\` must be a list.`,
            severity: 'error',
            path: `${at}.accepted`,
          })
        } else {
          for (const [acceptedIndex, item] of entry.accepted.entries()) {
            const atAccepted = `${at}.accepted[${acceptedIndex}]`
            if (!isPlainObject(item)) {
              issues.push({ code: 'accepted-shape', message: `\`${atAccepted}\` must be a mapping.`, severity: 'error', path: atAccepted })
              continue
            }
            const acceptedSymbol = asString(item.symbol)
            const reason = asString(item.reason)
            const path = asString(item.path)
            if (acceptedSymbol === undefined) {
              issues.push({
                code: 'accepted-symbol',
                message: `\`${atAccepted}.symbol\` is required.`,
                severity: 'error',
                path: `${atAccepted}.symbol`,
              })
            }
            if (reason === undefined) {
              issues.push({
                code: 'accepted-reason',
                message: `\`${atAccepted}.reason\` is required: an exception without a reason is an undocumented decision.`,
                severity: 'error',
                path: `${atAccepted}.reason`,
              })
            }
            if (path !== undefined && !isValidGlob(path)) {
              issues.push({
                code: 'accepted-glob',
                message: `\`${atAccepted}.path\` is not a valid glob: ${path}`,
                severity: 'error',
                path: `${atAccepted}.path`,
              })
            }
            if (acceptedSymbol !== undefined) {
              accepted.push({ symbol: acceptedSymbol, ...(path === undefined ? {} : { path }), reason: reason ?? '' })
            }
          }
        }
      }

      const note = asString(entry.note)
      const canonicalType = canonicalRaw === undefined ? undefined : asString(canonicalRaw.type)
      const canonicalUnit = canonicalRaw === undefined ? undefined : asString(canonicalRaw.unit)
      concepts.push({
        id,
        terms,
        kind,
        canonical: {
          symbol: symbol ?? '',
          ...(canonicalType === undefined ? {} : { type: canonicalType }),
          ...(canonicalUnit === undefined ? {} : { unit: canonicalUnit }),
        },
        ...(note === undefined ? {} : { note }),
        ...(accepted.length === 0 ? {} : { accepted }),
      })
    }
  }

  const document: VocabularyDocument = {
    version: VOCABULARY_VERSION,
    ...(project === undefined && updated === undefined
      ? {}
      : { meta: { ...(project === undefined ? {} : { project }), ...(updated === undefined ? {} : { updated }) } }),
    exclude,
    concepts,
  }
  return { document, issues }
}

/**
 * Cross-entry validation: uniqueness, clashes, duplicates.
 * @param document - normalized document.
 * @param text - original YAML text, for line lookup.
 */
export function validateCrossEntries(document: VocabularyDocument, text = ''): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ids = new Map<string, number>()
  const symbols = new Map<string, number>()
  const terms = new Map<string, { index: number; conceptId: string }>()

  for (const [index, concept] of document.concepts.entries()) {
    const at = `concepts[${index}]`
    const line = findLine(text, concept.id)
    const firstId = ids.get(concept.id)
    if (firstId !== undefined) {
      issues.push({
        code: 'id-duplicate',
        message: `Concept id \`${concept.id}\` is already used by \`concepts[${firstId}]\`.`,
        severity: 'error',
        path: `${at}.id`,
        line,
      })
    } else {
      ids.set(concept.id, index)
    }

    const symbol = concept.canonical.symbol
    if (symbol !== '') {
      const firstSymbol = symbols.get(symbol)
      if (firstSymbol !== undefined) {
        issues.push({
          code: 'symbol-duplicate',
          message: `Canonical symbol \`${symbol}\` is already used by \`concepts[${firstSymbol}]\`; one symbol can name only one concept.`,
          severity: 'error',
          path: `${at}.canonical.symbol`,
          line: findLine(text, symbol),
        })
      } else {
        symbols.set(symbol, index)
      }
    }

    for (const term of concept.terms) {
      const seen = terms.get(term)
      if (seen !== undefined && seen.conceptId !== concept.id) {
        issues.push({
          code: 'term-duplicate',
          message: `Term \`${term}\` is already claimed by \`${seen.conceptId}\`; two concepts cannot share one term.`,
          severity: 'error',
          path: `${at}.terms`,
          line: findLine(text, term),
        })
      } else if (seen === undefined) {
        terms.set(term, { index, conceptId: concept.id })
      }
    }

    if (concept.kind === 'quantity' && concept.canonical.unit === undefined) {
      issues.push({
        code: 'unit-missing',
        message: `Quantity concept \`${concept.id}\` has no \`canonical.unit\`; the panel will show no unit and unit comparisons cannot run.`,
        severity: 'warning',
        path: `${at}.canonical.unit`,
        line,
      })
    }
  }
  return issues
}

/** Parse YAML text into a normalized document plus every issue found. */
export function parseVocabularyText(text: string): { document: VocabularyDocument; issues: ValidationIssue[] } {
  const doc = parseDocument(text, { prettyErrors: true })
  if (doc.errors.length > 0) {
    const issues: ValidationIssue[] = doc.errors.map(error => ({
      code: 'yaml-parse',
      message: error.message,
      severity: 'error' as const,
      ...(error.linePos?.[0] === undefined ? {} : { line: error.linePos[0].line, column: error.linePos[0].col }),
    }))
    return { document: emptyVocabulary(), issues }
  }
  let raw: unknown
  try {
    raw = doc.toJS()
  } catch (error) {
    return {
      document: emptyVocabulary(),
      issues: [{ code: 'yaml-parse', message: error instanceof Error ? error.message : String(error), severity: 'error' }],
    }
  }
  if (raw === null || raw === undefined) {
    return { document: emptyVocabulary(), issues: [] }
  }
  const normalized = normalizeDocument(raw, text)
  const issues = [...normalized.issues, ...validateCrossEntries(normalized.document, text)]
  return { document: normalized.document, issues }
}

/** True when the document has no error-severity issue. */
export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some(issue => issue.severity === 'error')
}

/** Canonical YAML for one document. Idempotent: re-parsing it yields the same document. */
export function serializeVocabulary(document: VocabularyDocument): string {
  const plain: Record<string, unknown> = { version: VOCABULARY_VERSION }
  if (document.meta?.project !== undefined || document.meta?.updated !== undefined) {
    plain.meta = {
      ...(document.meta.project === undefined ? {} : { project: document.meta.project }),
      ...(document.meta.updated === undefined ? {} : { updated: document.meta.updated }),
    }
  }
  plain.exclude = [...document.exclude]
  plain.concepts = document.concepts.map(concept => ({
    id: concept.id,
    terms: [...concept.terms],
    kind: concept.kind,
    canonical: {
      symbol: concept.canonical.symbol,
      ...(concept.canonical.type === undefined ? {} : { type: concept.canonical.type }),
      ...(concept.canonical.unit === undefined ? {} : { unit: concept.canonical.unit }),
    },
    ...(concept.note === undefined ? {} : { note: concept.note }),
    ...(concept.accepted === undefined || concept.accepted.length === 0
      ? {}
      : {
          accepted: concept.accepted.map(entry => ({
            symbol: entry.symbol,
            ...(entry.path === undefined ? {} : { path: entry.path }),
            reason: entry.reason,
          })),
        }),
  }))

  const doc = new Document(plain)
  // Flow style for the two short string lists keeps the file readable; the
  // rest stays block style because notes and reasons wrap.
  const excludeNode = doc.get('exclude', true)
  if (isSeq(excludeNode)) excludeNode.flow = true
  for (const [index] of document.concepts.entries()) {
    const termsNode = doc.getIn(['concepts', index, 'terms'], true)
    if (isSeq(termsNode)) termsNode.flow = true
  }
  return `${doc.toString({ lineWidth: 0, minContentWidth: 0 })}`
}

/** Absolute vocabulary path for a workspace. */
export function vocabularyFile(root: string, relativePath: string): string {
  return resolve(root, relativePath)
}

/** Cached parse result, invalidated by mtime+size. */
interface CacheEntry {
  mtimeMs: number
  size: number
  state: VocabularyState
}

const cache = new Map<string, CacheEntry>()
const writeQueues = new Map<string, Promise<unknown>>()

/** Serialize writes per file. Reads are unaffected. */
function withWriteQueue<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const next = previous.then(run, run)
  writeQueues.set(key, next.catch(() => undefined))
  return next
}

/**
 * Read the vocabulary of one workspace.
 * @param root - absolute workspace directory.
 * @param relativePath - vocabulary path relative to `root`.
 */
export async function loadVocabulary(root: string, relativePath: string): Promise<VocabularyState> {
  const file = vocabularyFile(root, relativePath)
  let info
  try {
    info = await stat(file)
  } catch {
    const document = emptyVocabulary(basename(root))
    return {
      file,
      relativeFile: relativePath,
      exists: false,
      document,
      issues: [],
      valid: true,
    }
  }
  const cached = cache.get(file)
  if (cached !== undefined && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.state
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    const issue: ValidationIssue = {
      code: 'read-failed',
      message: `Cannot read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'error',
    }
    const state: VocabularyState = {
      file,
      relativeFile: relativePath,
      exists: true,
      document: emptyVocabulary(basename(root)),
      issues: [issue],
      valid: false,
      mtimeMs: info.mtimeMs,
    }
    return state
  }
  const parsed = parseVocabularyText(text)
  const state: VocabularyState = {
    file,
    relativeFile: relativePath,
    exists: true,
    text,
    document: parsed.document,
    issues: parsed.issues,
    valid: !hasErrors(parsed.issues),
    mtimeMs: info.mtimeMs,
  }
  cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, state })
  return state
}

/** Write text atomically (sibling temp file, then rename). */
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, file)
}

/** Result of a write attempt. */
export type SaveResult =
  | { ok: true; state: VocabularyState; changed: boolean }
  | { ok: false; issues: ValidationIssue[] }

/**
 * Save a document through the store.
 *
 * `meta.updated` is refreshed and a missing `meta.project` is filled from the
 * workspace directory name, so the file always says what it describes.
 */
export async function saveVocabulary(
  root: string,
  relativePath: string,
  document: VocabularyDocument,
  options: { now?: Date } = {},
): Promise<SaveResult> {
  const file = vocabularyFile(root, relativePath)
  const project = document.meta?.project ?? basename(root)
  const next: VocabularyDocument = {
    version: VOCABULARY_VERSION,
    meta: { project, updated: today(options.now) },
    exclude: [...document.exclude],
    concepts: document.concepts,
  }
  const text = serializeVocabulary(next)
  // Validate exactly what will be on disk, not the in-memory object.
  const parsed = parseVocabularyText(text)
  if (hasErrors(parsed.issues)) return { ok: false, issues: parsed.issues }
  return withWriteQueue(file, async () => {
    const previous = cache.get(file)
    const before = previous?.state.text ?? undefined
    await writeAtomic(file, text)
    cache.delete(file)
    const state = await loadVocabulary(root, relativePath)
    return { ok: true, state, changed: before !== state.text }
  })
}

/**
 * Save raw YAML exactly as edited (after validation).
 *
 * Unlike {@link saveVocabulary} this preserves the author's formatting; it is
 * still idempotent because writing the same text twice produces the same file.
 */
export async function saveRawVocabulary(root: string, relativePath: string, text: string): Promise<SaveResult> {
  const file = vocabularyFile(root, relativePath)
  const body = text.endsWith('\n') ? text : `${text}\n`
  const parsed = parseVocabularyText(body)
  if (hasErrors(parsed.issues)) return { ok: false, issues: parsed.issues }
  return withWriteQueue(file, async () => {
    const previous = cache.get(file)
    const before = previous?.state.text ?? undefined
    await writeAtomic(file, body)
    cache.delete(file)
    const state = await loadVocabulary(root, relativePath)
    return { ok: true, state, changed: before !== state.text }
  })
}

/** Drop the read cache for one file (tests and manual repairs). */
export function forgetVocabulary(root: string, relativePath: string): void {
  cache.delete(vocabularyFile(root, relativePath))
}
