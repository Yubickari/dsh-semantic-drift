/**
 * Scan orchestrator.
 *
 * One pass over the workspace: read a file, mask it, extract its type
 * declarations, hand it to every enabled detector, drop its text. Findings are
 * computed per scan and never cached — the vocabulary file is the only state
 * this plugin keeps.
 *
 * Guarantees enforced here:
 * - read-only: nothing in the scan path opens a file for writing;
 * - bounded: a deadline and a finding cap always end the scan, and the result
 *   says which one did;
 * - deterministic: files are visited in walk order and findings are sorted, so
 *   an unchanged tree yields the same list;
 * - accepted exceptions and the minimum confidence are applied last, so what
 *   the caller sees is exactly what the vocabulary allows.
 *
 * @module dsh-semantic-drift/scan
 */

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { matchesGlob, compileGlobs } from '../glob.ts'
import { CONFIDENCE_LEVELS } from '../protocol.ts'
import type { Concept, Confidence, DetectorId, DriftFinding, ScanSummary, VocabularyDocument } from '../protocol.ts'
import { contractDriftDetector } from './detectors/contract-drift.ts'
import { duplicateTypeDetector } from './detectors/duplicate-type.ts'
import { createSymbolVariantDetector } from './detectors/symbol-variant.ts'
import { createTermUnmappedDetector } from './detectors/term-unmapped.ts'
import type { Detector, DetectorContext } from './types.ts'
import { extractTypes, isGeneratedSource, languageOf, maskSource } from './symbol-table.ts'
import type { SourceFile } from './symbol-table.ts'
import { makeUnitResolver, walkWorkspace } from './walk.ts'

/** Files read concurrently per batch. Order of processing stays sequential. */
const READ_BATCH = 8

/** A scan could not start. */
export class ScanError extends Error {
  readonly code: 'root-missing' | 'root-not-directory'

  constructor(code: 'root-missing' | 'root-not-directory', message: string) {
    super(message)
    this.name = 'ScanError'
    this.code = code
  }
}

/** One scan request. */
export interface ScanOptions {
  /** Absolute workspace directory. */
  root: string
  document: VocabularyDocument
  citationStyle: 'file+symbol' | 'file:line'
  /** Wall-clock budget in milliseconds. */
  timeoutMs: number
  /** Hard cap on returned findings. */
  maxFindings: number
  /** Files larger than this are skipped, not read. */
  maxFileBytes: number
  maxFiles?: number
  /** Keep findings at or above this confidence. Absent keeps everything. */
  minConfidence?: Confidence
  /** Detector subset; absent runs all of them. */
  detectors?: readonly DetectorId[]
  /** Workspace-relative path prefixes to restrict the scan to. */
  paths?: readonly string[]
  /** Clock injection point for tests. */
  now?: () => number
}

/** Every detector this build ships, in report order. */
export function allDetectors(): Detector[] {
  return [duplicateTypeDetector, contractDriftDetector, createSymbolVariantDetector(), createTermUnmappedDetector()]
}

/** Sorting key that keeps the report stable across runs and machines. */
function compareFindings(left: DriftFinding, right: DriftFinding): number {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1
  if (left.line !== right.line) return left.line - right.line
  if (left.detector !== right.detector) return left.detector < right.detector ? -1 : 1
  return left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0
}

/**
 * The accepted exception that mutes this finding, if any.
 *
 * Returning the owner (concept + index) instead of a boolean is what lets a scan
 * report *how many* findings each exception suppressed: the count is attributed
 * where the decision is made, so it cannot drift from the filter itself.
 */
export function acceptedBy(
  finding: DriftFinding,
  concepts: readonly Concept[],
): { conceptId: string; index: number } | undefined {
  for (const concept of concepts) {
    const accepted = concept.accepted ?? []
    for (let index = 0; index < accepted.length; index++) {
      const exception = accepted[index]
      if (exception.symbol !== finding.symbol) continue
      if (matchesGlob(exception.path, finding.path)) return { conceptId: concept.id, index }
    }
  }
  return undefined
}

/** True when the concept vocabulary mutes this finding. */
export function isAccepted(finding: DriftFinding, concepts: readonly Concept[]): boolean {
  return acceptedBy(finding, concepts) !== undefined
}

function confidenceRank(level: Confidence): number {
  return CONFIDENCE_LEVELS.indexOf(level)
}

function normalizePrefix(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/**
 * Scan one workspace with one vocabulary.
 * @param options - root, vocabulary, budgets.
 * @returns the findings plus what the budgets cost.
 */
export async function scanWorkspace(options: ScanOptions): Promise<ScanSummary> {
  const now = options.now ?? (() => Date.now())
  const startedAt = now()
  const root = resolve(options.root)
  let rootStat
  try {
    rootStat = await stat(root)
  } catch {
    throw new ScanError('root-missing', `Workspace directory does not exist: ${root}`)
  }
  if (!rootStat.isDirectory()) throw new ScanError('root-not-directory', `Not a directory: ${root}`)

  const deadline = startedAt + Math.max(1, options.timeoutMs)
  const excludes = compileGlobs(options.document.exclude)
  const walk = await walkWorkspace({
    root,
    excludes,
    maxFileBytes: options.maxFileBytes,
    ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
  })
  const unitOf = makeUnitResolver(walk.unitDirs)

  const prefixes = (options.paths ?? []).map(normalizePrefix).filter(prefix => prefix !== '')
  const files = prefixes.length === 0
    ? walk.files
    : walk.files.filter(file => prefixes.some(prefix => file.relPath === prefix || file.relPath.startsWith(`${prefix}/`)))

  const enabled = allDetectors().filter(detector =>
    options.detectors === undefined || options.detectors.includes(detector.id),
  )

  const ctx: DetectorContext = {
    root,
    concepts: options.document.concepts,
    citationStyle: options.citationStyle,
    types: [],
    skippedTypes: 0,
    deadline,
    now,
    ...(prefixes.length === 0 ? {} : { pathFilter: prefixes }),
  }
  for (const detector of enabled) detector.start?.(ctx)

  const findings: DriftFinding[] = []
  let filesScanned = 0
  let filesSkipped = walk.skippedBySize + walk.skippedUnreadable
  let bytesScanned = 0
  let truncated = walk.truncated
  let truncatedReason: 'timeout' | 'limit' | undefined = walk.truncated ? 'limit' : undefined

  for (let offset = 0; offset < files.length; offset += READ_BATCH) {
    if (now() > deadline) {
      truncated = true
      truncatedReason = 'timeout'
      break
    }
    const batch = files.slice(offset, offset + READ_BATCH)
    const texts = await Promise.all(batch.map(async file => {
      try {
        return await readFile(file.absPath, 'utf8')
      } catch {
        return undefined
      }
    }))
    for (const [index, file] of batch.entries()) {
      const text = texts[index]
      if (text === undefined) {
        filesSkipped++
        continue
      }
      if (isGeneratedSource(file.relPath, text)) {
        filesSkipped++
        continue
      }
      const language = languageOf(file.relPath) ?? 'other'
      const source: SourceFile = {
        relPath: file.relPath,
        absPath: file.absPath,
        language,
        text,
        bytes: file.bytes,
      }
      const masked = maskSource(text, language)
      const declarations = extractTypes(source, unitOf)
      for (const declaration of declarations) {
        if (declaration.members.length === 0) ctx.skippedTypes++
      }
      ctx.types.push(...declarations)
      filesScanned++
      bytesScanned += Buffer.byteLength(text)
      for (const detector of enabled) detector.onFile?.(ctx, { file: source, masked })
    }
  }

  for (const detector of enabled) findings.push(...detector.finish(ctx))

  // A concept that is present under a variant spelling is not "unmapped": the
  // variant detector already reported the actionable fact for that file, and
  // repeating it as a low-confidence term finding would only inflate the list.
  const variantKeys = new Set(
    findings
      .filter(finding => finding.detector === 'symbol-variant')
      .map(finding => `${finding.conceptId ?? ''}|${finding.path}`),
  )
  const deduped = findings.filter(finding =>
    finding.detector !== 'term-unmapped' || !variantKeys.has(`${finding.conceptId ?? ''}|${finding.path}`),
  )

  // Split before the confidence filter: a muted low-confidence finding still
  // counts as muted, otherwise the number a concept shows would move whenever
  // the reader changes the confidence floor.
  const mutedFindings: DriftFinding[] = []
  const mutedCounts = new Map<string, { conceptId: string; index: number; count: number }>()
  const unmuted: DriftFinding[] = []
  for (const finding of deduped) {
    const owner = acceptedBy(finding, ctx.concepts)
    if (owner === undefined) {
      unmuted.push(finding)
      continue
    }
    mutedFindings.push(finding)
    const key = `${owner.conceptId}#${owner.index}`
    const entry = mutedCounts.get(key) ?? { conceptId: owner.conceptId, index: owner.index, count: 0 }
    entry.count++
    mutedCounts.set(key, entry)
  }

  const visible = unmuted
    .filter(finding =>
      options.minConfidence === undefined
        ? true
        : confidenceRank(finding.confidence) <= confidenceRank(options.minConfidence),
    )
    .sort(compareFindings)

  const capped = visible.length > options.maxFindings ? visible.slice(0, options.maxFindings) : visible
  if (visible.length > capped.length) {
    truncated = true
    truncatedReason = 'limit'
  }

  const counts: Record<string, number> = {}
  for (const id of ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped']) counts[id] = 0
  for (const finding of capped) counts[finding.detector] = (counts[finding.detector] ?? 0) + 1

  return {
    root,
    startedAt,
    durationMs: now() - startedAt,
    filesScanned,
    filesSkipped,
    bytesScanned,
    truncated,
    ...(truncatedReason === undefined ? {} : { truncatedReason }),
    findings: capped,
    counts,
    skippedTypes: ctx.skippedTypes,
    mutedFindings: mutedFindings.sort(compareFindings),
    mutedByAccepted: [...mutedCounts.values()].sort((left, right) =>
      left.conceptId === right.conceptId ? left.index - right.index : left.conceptId < right.conceptId ? -1 : 1,
    ),
  }
}
