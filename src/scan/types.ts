/**
 * Detector contract.
 *
 * A detector sees each file once through `onFile`, may keep state between files,
 * and returns its findings in `finish`. The orchestrator owns file reading,
 * masking, type extraction, budgets and the acceptance filter, so a detector can
 * never write to disk and never decides how much work it may do.
 *
 * @module dsh-semantic-drift/scan/types
 */

import { formatCitation } from '../protocol.ts'
import type { CitationStyle, Concept, DetectorId, DriftFinding, FindingDetail, Confidence } from '../protocol.ts'
import type { MaskedText, SourceFile, TypeDeclaration } from './symbol-table.ts'

/** How two declarations with the same member names relate by literal value. */
export type LiteralRelation = 'same' | 'differ' | 'unknown'

/**
 * Compare the literal initializers two declarations give their shared members.
 *
 * `unknown` is the conservative answer when either side has no recorded literal
 * for a member: the caller then falls back to name-only reasoning, which is the
 * pre-existing behaviour.
 */
export function compareLiterals(left: TypeDeclaration, right: TypeDeclaration): LiteralRelation {
  const leftLiterals = left.literals
  const rightLiterals = right.literals
  if (leftLiterals === undefined || rightLiterals === undefined) return 'unknown'
  let comparable = 0
  for (const member of left.members) {
    const a = leftLiterals[member]
    const b = rightLiterals[member]
    if (a === undefined || b === undefined) continue
    comparable++
    if (a.length !== b.length || a.some(value => !b.includes(value))) return 'differ'
  }
  return comparable === 0 ? 'unknown' : 'same'
}

/**
 * The literal values that are identical across every declaration of a name.
 *
 * This is the contract's fixed part: `BaseFileName = "Language"` is stable while
 * `ModuleName` varies per module, so only the stable part can identify the same
 * contract under a different type name.
 */
export function stableLiterals(declarations: readonly TypeDeclaration[]): Record<string, string[]> {
  if (declarations.length < 2) return {}
  const out: Record<string, string[]> = {}
  for (const member of declarations[0].members) {
    const values = declarations.map(declaration => declaration.literals?.[member])
    if (values.some(value => value === undefined)) continue
    const first = values[0] as string[]
    if (first.length !== 1) continue
    if (values.every(value => value !== undefined && value.length === 1 && value[0] === first[0])) {
      out[member] = [first[0]]
    }
  }
  return out
}

/** Members whose literal values disagree between two declarations. */
export function memberValueDiffs(
  left: TypeDeclaration,
  right: TypeDeclaration,
): Array<{ member: string; left?: string; right?: string }> {
  const out: Array<{ member: string; left?: string; right?: string }> = []
  for (const member of left.members) {
    if (!right.members.includes(member)) continue
    const a = left.literals?.[member]
    const b = right.literals?.[member]
    if (a === undefined || b === undefined) continue
    if (a.length === b.length && a.every(value => b.includes(value))) continue
    out.push({
      member,
      ...(b === undefined ? {} : { right: b.join('|') }),
      ...(a === undefined ? {} : { left: a.join('|') }),
    })
  }
  return out
}

/** Base types shared by every declaration of a group. */
export function sharedBase(declarations: readonly TypeDeclaration[]): string | undefined {
  if (declarations.length === 0) return undefined
  const first = declarations[0].bases
  if (first === undefined || first.length === 0) return undefined
  return first.find(base => declarations.every(declaration => declaration.bases?.includes(base) === true))
}

/** Shared state handed to every detector. */
export interface DetectorContext {
  /** Absolute workspace root. */
  root: string
  concepts: readonly Concept[]
  citationStyle: CitationStyle
  /** Types extracted from the files seen so far, in visit order. */
  types: TypeDeclaration[]
  /** Declarations skipped because their body could not be paired. */
  skippedTypes: number
  /** Epoch milliseconds after which the scan must stop. */
  deadline: number
  /** Clock injection point for tests. */
  now: () => number
  /** Workspace-relative paths the scan was restricted to, if any. */
  pathFilter?: readonly string[]
}

/** One file, already read and masked. */
export interface DetectorFile {
  file: SourceFile
  masked: MaskedText
}

/** A detector. */
export interface Detector {
  id: DetectorId
  /** Called once before the first file. */
  start?(ctx: DetectorContext): void
  /** Called once per file, in walk order. */
  onFile?(ctx: DetectorContext, input: DetectorFile): void
  /** Called once after the last file. */
  finish(ctx: DetectorContext): DriftFinding[]
}

/** Everything a detector must supply for one finding. */
export interface FindingInput {
  detector: DetectorId
  confidence: Confidence
  path: string
  line: number
  symbol: string
  expected?: string
  conceptId?: string
  message: string
  detail?: FindingDetail
}

/** Build a fully-populated finding (id + citation) for one style. */
export function makeFinding(style: CitationStyle, input: FindingInput): DriftFinding {
  return {
    id: `${input.detector}:${input.path}:${input.symbol}:${input.line}`,
    detector: input.detector,
    confidence: input.confidence,
    path: input.path,
    line: input.line,
    symbol: input.symbol,
    ...(input.expected === undefined ? {} : { expected: input.expected }),
    ...(input.conceptId === undefined ? {} : { conceptId: input.conceptId }),
    message: input.message,
    citation: formatCitation(style, input.path, input.symbol, input.line),
    detail: input.detail ?? {},
  }
}

/** Levenshtein distance, bounded: returns `limit + 1` as soon as it cannot win. */
export function editDistance(left: string, right: string, limit: number): number {
  if (left === right) return 0
  if (Math.abs(left.length - right.length) > limit) return limit + 1
  const previous = new Array<number>(right.length + 1)
  const current = new Array<number>(right.length + 1)
  for (let j = 0; j <= right.length; j++) previous[j] = j
  for (let i = 1; i <= left.length; i++) {
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (current[j] < rowMin) rowMin = current[j]
    }
    if (rowMin > limit) return limit + 1
    for (let j = 0; j <= right.length; j++) previous[j] = current[j]
  }
  return previous[right.length]
}

/** Strip separators and case, for `TargetTemp` vs `target_temp`. */
export function normalizedSymbol(symbol: string): string {
  return symbol.replace(/[_-]/g, '').toLowerCase()
}

/**
 * The leading word of a symbol: `TempParams` -> `temp`, `temp_params` -> `temp`.
 * Two symbols sharing this token are treated as one semantic namespace.
 */
export function leadingToken(symbol: string): string {
  const firstSegment = symbol.split(/[_.]/)[0]
  const camel = /^[A-Z]+(?![a-z])|^[A-Z][a-z0-9]*|^[a-z0-9]+/.exec(firstSegment)
  return (camel?.[0] ?? firstSegment).toLowerCase()
}
