/**
 * Contract shared by the host half and the browser half.
 *
 * Nothing in this module imports Node built-ins: the same source is bundled
 * into the host entry and into the browser artifact, so it must stay runtime
 * neutral. Types are erased; the constants are what keep both halves agreeing
 * on the route prefix, the file layout and the finding vocabulary.
 *
 * @module dsh-semantic-drift/protocol
 */

/** npm package name; also the browser module id the client artifact registers. */
export const PACKAGE_NAME = 'dsh-semantic-drift'

/** Sidebar row id, main-slot key and the client's local-storage namespace. */
export const PANEL_ID = 'semantic-drift'

/** Root-absolute route prefix the host registers. */
export const API_PREFIX = '/semantic-drift'

/** Vocabulary file format version written by this plugin. */
export const VOCABULARY_VERSION = 1

/** Default vocabulary location, relative to the workspace root. */
export const DEFAULT_VOCABULARY_PATH = '.dsh/semantics.yaml'

/** Concept kinds. A closed set: the panel renders one editor per kind. */
export const CONCEPT_KINDS = ['entity', 'quantity', 'enum', 'status', 'reference'] as const

/** Confidence levels, ordered from strongest evidence to weakest. */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const

/** Supported citation shapes (see the `citationStyle` config field). */
export const CITATION_STYLES = ['file+symbol', 'file:line'] as const

/** Detector ids as they appear in findings and in the `detectors` argument. */
export const DETECTOR_IDS = ['duplicate-type', 'contract-drift', 'symbol-variant', 'term-unmapped'] as const

export type ConceptKind = (typeof CONCEPT_KINDS)[number]
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]
export type CitationStyle = (typeof CITATION_STYLES)[number]
export type DetectorId = (typeof DETECTOR_IDS)[number]

/** One accepted exception: a finding this symbol/path pair must not report. */
export interface AcceptedException {
  /** Observed spelling that is accepted (not the canonical symbol). */
  symbol: string
  /** Glob, relative to the workspace root. Absent or `**` accepts every path. */
  path?: string
  /** Why it is accepted. Required: an exception without a reason rots. */
  reason: string
}

/** Canonical spelling of one business concept. */
export interface Canonical {
  symbol: string
  type?: string
  unit?: string
}

/** One concept: the vocabulary entry. */
export interface Concept {
  /** Dotted id, unique in the document, e.g. `device.target_temperature`. */
  id: string
  /** Chinese terms and aliases used by the scanner. At least one. */
  terms: string[]
  kind: ConceptKind
  canonical: Canonical
  note?: string
  accepted?: AcceptedException[]
}

/** The whole vocabulary file. */
export interface VocabularyDocument {
  version: number
  meta?: {
    project?: string
    updated?: string
  }
  /** Glob patterns, relative to the workspace root, pruned before scanning. */
  exclude: string[]
  concepts: Concept[]
}

/** One validation problem, addressed by file position and/or document path. */
export interface ValidationIssue {
  code: string
  message: string
  /** 1-based line in the YAML text, when the position is known. */
  line?: number
  /** 1-based column in the YAML text, when the position is known. */
  column?: number
  /** Document path such as `concepts[2].canonical.symbol`. */
  path?: string
  severity: 'error' | 'warning'
}

/** Detector-specific evidence. Kept JSON-shaped so tools and the panel share it. */
export interface FindingDetail {
  /** Path of the other definition this finding is compared against. */
  primaryPath?: string
  /** Line of that other definition. */
  primaryLine?: number
  /** Members present on both sides (or, for variants, the canonical spelling). */
  members?: string[]
  /** Members only the other side declares. */
  missing?: string[]
  /** Members only this side declares. */
  extra?: string[]
  /** Compilation unit (project/package) the definition belongs to. */
  unit?: string
  /** Term that triggered a term-level finding. */
  term?: string
  /** Edit distance, for spelling variants. */
  distance?: number
  /** Why the rule fired, as a stable code the panel can localize. */
  rule?: string
  /** Shared base type, for a parameterized derivative. */
  base?: string
  /** Literal values per member name, when they are simple single-line literals. */
  literals?: Record<string, string[]>
  /** Members whose literal values differ between the two declarations. */
  valueDiffs?: Array<{ member: string; left?: string; right?: string }>
  /** How many declarations of this contract exist (derived/copy families). */
  sites?: number
  /** Declaration keywords on each side, when they differ (`struct` vs `class`). */
  kinds?: string[]
}

/** One reported drift. */
export interface DriftFinding {
  /** Stable within one scan: `detector:path:symbol:line`. */
  id: string
  detector: DetectorId
  confidence: Confidence
  /** Path relative to the workspace root, always posix. */
  path: string
  /** 1-based line of the observed symbol. */
  line: number
  /** The spelling as written in the file. */
  symbol: string
  /** The canonical spelling this finding is expected to use, when it has one. */
  expected?: string
  /** Concept id when the finding mapped to exactly one concept. */
  conceptId?: string
  /** English one-liner for tools and logs; the panel renders its own localized text. */
  message: string
  /** Per `Config.citationStyle`, e.g. `src/File.cs::SymbolName`. */
  citation: string
  detail: FindingDetail
}

/** Outcome of one scan. */
export interface ScanSummary {
  /** Absolute workspace root that was scanned. */
  root: string
  startedAt: number
  durationMs: number
  filesScanned: number
  filesSkipped: number
  bytesScanned: number
  /** True when the deadline or the finding cap ended the scan early. */
  truncated: boolean
  truncatedReason?: 'timeout' | 'limit'
  findings: DriftFinding[]
  /** Findings per detector, after the acceptance filter. */
  counts: Record<string, number>
  /** Hypotheses the scanner could not evaluate, e.g. unparsable type bodies. */
  skippedTypes: number
  /**
   * Findings an accepted exception suppressed. They are not listed as findings —
   * that is the point of an exception — but the panel needs them to say how many
   * a scope mutes and to preview a narrower scope.
   */
  mutedFindings?: DriftFinding[]
  /** Per accepted entry: how many findings it actually muted, attributed once. */
  mutedByAccepted?: Array<{ conceptId: string; index: number; count: number }>
}

/** Vocabulary state as the browser and the tools see it. */
export interface VocabularyState {
  /** Absolute path of the vocabulary file. */
  file: string
  /** Workspace-relative path of the vocabulary file. */
  relativeFile: string
  exists: boolean
  /** Raw file text when it exists, for the raw editor. */
  text?: string
  document: VocabularyDocument
  issues: ValidationIssue[]
  /** True when the file parsed and validated without errors. */
  valid: boolean
  /** Last modification time in epoch milliseconds. */
  mtimeMs?: number
}

/** Settings the panel shows read-only, because DSH owns their editable form. */
export interface EffectiveConfig {
  vocabularyPath: string
  announceToAgent: boolean
  citationStyle: CitationStyle
  minConfidence: Confidence
  timeoutMs: number
  maxFindings: number
  maxFileBytes: number
  maxFiles: number
  detectors: DetectorId[]
}

/** One selectable workspace. */
export interface WorkspaceOption {
  id: string
  title: string
  path: string
}

/** `GET /semantic-drift/state` payload. */
export interface StateResponse {
  ok: true
  workspace: { path: string; title?: string; resolvedFrom: 'request' | 'session' | 'default' }
  workspaces: WorkspaceOption[]
  vocabulary: VocabularyState
  citationStyle: CitationStyle
  minConfidence: Confidence
  version: string
  /** The row's live settings; absent on a Host older than this field. */
  effective?: EffectiveConfig
}

/** `POST /semantic-drift/scan` payload. */
export interface ScanResponse {
  ok: true
  workspace: { path: string; title?: string }
  summary: ScanSummary
  /** Issues of the vocabulary the scan used; an invalid file still yields D1 findings. */
  vocabularyIssues: ValidationIssue[]
}

/** `POST /semantic-drift/save` payload: the whole document, replaced atomically. */
export interface SaveRequest {
  workspace?: string
  document: VocabularyDocument
}

/** `POST /semantic-drift/raw` payload: YAML as edited by the user. */
export interface SaveRawRequest {
  workspace?: string
  text: string
}

/** What a request does to one exception. */
export type ExceptionOp = 'add' | 'update' | 'remove' | 'clear'

/** `POST /semantic-drift/accept` payload: one exception lifecycle operation. */
export interface AcceptRequest {
  workspace?: string
  /** Defaults to `add`, so the original callers keep working unchanged. */
  op?: ExceptionOp
  conceptId: string
  /** Required for every op except `clear`. */
  symbol?: string
  /** New (add/update) or current (remove/update match) glob; absent = whole symbol. */
  path?: string
  /** Which existing exception an update or remove targets. */
  previousPath?: string
  /** Required for add and update. */
  reason?: string
  /** Disambiguates hand-edited duplicate entries; defaults to 0. */
  occurrence?: number
}

/** What an exception operation actually did. */
export type ExceptionChange = 'added' | 'updated' | 'removed' | 'unchanged'

/** Answer of every write route: the vocabulary as written. */
export interface WriteResponse {
  ok: true
  vocabulary: VocabularyState
  concept?: Concept
  /** Exception operations report their outcome, so `unchanged` is never silent. */
  changed?: ExceptionChange
}

/** Why a request was refused. Stable codes; the panel translates them. */
export type ApiErrorCode =
  | 'bad-request'
  | 'bad-json'
  | 'forbidden'
  | 'not-found'
  | 'method-not-allowed'
  | 'content-type'
  | 'invalid-vocabulary'
  | 'conflict'
  | 'unsupported'

/** Failure payload shared by every route. */
export interface ApiFailure {
  ok: false
  code: ApiErrorCode
  message: string
  issues?: ValidationIssue[]
  /** Diagnostics the panel shows verbatim under the failure. */
  detail?: string
}

/** Build a canonical citation string. */
export function formatCitation(style: CitationStyle, path: string, symbol: string, line: number): string {
  return style === 'file:line' ? `${path}:${line}` : `${path}::${symbol}`
}
