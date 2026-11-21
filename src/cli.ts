#!/usr/bin/env node
/**
 * Read-only CLI for CI and local gates.
 *
 * `scan --changed` still scans the whole workspace: detectors such as
 * `duplicate-type` and `contract-drift` compare two declarations, and the other
 * side may live in a file this change did not touch. The flag filters the
 * *findings* to those touching a changed path, which keeps the gate correct
 * without pretending a one-file scan is a whole-repository answer.
 *
 * @module dsh-semantic-drift/cli
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isAbsolute, resolve } from 'node:path'
import { liveConfig } from './config.ts'
import { CONFIDENCE_LEVELS, DEFAULT_VOCABULARY_PATH, DETECTOR_IDS } from './protocol.ts'
import type { Confidence, DetectorId, DriftFinding, ValidationIssue } from './protocol.ts'
import type { SemanticConfig } from './service.ts'
import { hasErrors, loadVocabulary } from './store.ts'
import { ScanError, scanWorkspace } from './scan/index.ts'

/** Exit codes: a CI gate can distinguish "clean", "findings" and "misconfigured". */
const EXIT_CLEAN = 0
const EXIT_FINDINGS = 1
const EXIT_ERROR = 2

interface CliOptions {
  root: string
  vocabulary: string
  mode: 'changed' | 'all'
  base?: string
  json: boolean
  minConfidence: Confidence
  detectors: DetectorId[]
  paths: string[]
}

class CliError extends Error {
  readonly code: string
  readonly issues?: ValidationIssue[]

  constructor(code: string, message: string, issues?: ValidationIssue[]) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.issues = issues
  }
}

function packageVersion(): string {
  const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  return (JSON.parse(text) as { version: string }).version
}

function usage(): string {
  return [
    'Usage: dsh-semantic-drift scan [options]',
    '',
    'Options:',
    '  --all                     Report every finding (default: --changed)',
    '  --changed                 Report findings touching files changed since --base',
    '  --base <ref>              Git base ref (default: origin/main, then HEAD^)',
    '  --json                    Machine-readable output',
    '  --root <dir>              Workspace root (default: current directory)',
    '  --vocabulary <path>       Vocabulary file, relative to the root',
    `  --min-confidence <level>  ${CONFIDENCE_LEVELS.join(' | ')} (default: medium)`,
    `  --detectors <list>        Comma-separated subset of ${DETECTOR_IDS.join(', ')}`,
    '  --paths <list>            Comma-separated workspace-relative paths to scan',
    '  --version                 Print the package version',
    '  --help                    Print this help',
    '',
    'Exit codes: 0 no findings, 1 findings, 2 usage or runtime error.',
  ].join('\n')
}

function optionValue(argv: string[], index: number, name: string): { value: string; next: number } {
  const token = argv[index]
  const eq = token.startsWith(`${name}=`)
  if (eq) return { value: token.slice(name.length + 1), next: index + 1 }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new CliError('bad-request', `${name} needs a value.`)
  return { value, next: index + 2 }
}

function safeRelative(value: string, label: string): string {
  if (isAbsolute(value)) throw new CliError('bad-request', `${label} must be relative to the workspace root.`)
  const parts = value.split(/[\\/]+/)
  if (parts.includes('..')) throw new CliError('bad-request', `${label} cannot escape the workspace root.`)
  return value
}

function parseArgs(argv: string[], cwd: string): CliOptions | 'help' | 'version' {
  const args = argv[0] === 'scan' ? argv.slice(1) : argv
  const defaults = liveConfig<SemanticConfig>(undefined)
  const options: CliOptions = {
    root: cwd,
    vocabulary: defaults.vocabularyPath ?? DEFAULT_VOCABULARY_PATH,
    mode: 'changed',
    json: false,
    minConfidence: defaults.minConfidence,
    detectors: [...(defaults.detectors.length > 0 ? defaults.detectors : DETECTOR_IDS)],
    paths: [],
  }
  let modeSeen: 'changed' | 'all' | undefined
  for (let index = 0; index < args.length;) {
    const token = args[index]
    if (token === '--help' || token === '-h') return 'help'
    if (token === '--version' || token === '-v') return 'version'
    if (token === '--json') {
      options.json = true
      index++
      continue
    }
    if (token === '--changed' || token === '--all') {
      const mode = token === '--all' ? 'all' : 'changed'
      if (modeSeen !== undefined && modeSeen !== mode) {
        throw new CliError('bad-request', 'Pass either --changed or --all, not both.')
      }
      modeSeen = mode
      options.mode = mode
      index++
      continue
    }
    if (token === '--root') {
      const parsed = optionValue(args, index, '--root')
      options.root = resolve(cwd, parsed.value)
      index = parsed.next
      continue
    }
    if (token === '--vocabulary') {
      const parsed = optionValue(args, index, '--vocabulary')
      options.vocabulary = safeRelative(parsed.value, '--vocabulary')
      index = parsed.next
      continue
    }
    if (token === '--base') {
      const parsed = optionValue(args, index, '--base')
      options.base = parsed.value
      index = parsed.next
      continue
    }
    if (token === '--min-confidence') {
      const parsed = optionValue(args, index, '--min-confidence')
      if (!(CONFIDENCE_LEVELS as readonly string[]).includes(parsed.value)) {
        throw new CliError('bad-request', `--min-confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}.`)
      }
      options.minConfidence = parsed.value as Confidence
      index = parsed.next
      continue
    }
    if (token === '--detectors') {
      const parsed = optionValue(args, index, '--detectors')
      const values = parsed.value.split(',').map(value => value.trim()).filter(value => value !== '')
      const unknown = values.filter(value => !(DETECTOR_IDS as readonly string[]).includes(value))
      if (unknown.length > 0) throw new CliError('bad-request', `Unknown detector: ${unknown.join(', ')}.`)
      if (values.length === 0) throw new CliError('bad-request', '--detectors needs at least one detector.')
      options.detectors = values as DetectorId[]
      index = parsed.next
      continue
    }
    if (token === '--paths') {
      const parsed = optionValue(args, index, '--paths')
      options.paths = parsed.value
        .split(',')
        .map(value => value.trim())
        .filter(value => value !== '')
        .map(value => safeRelative(value, '--paths'))
      index = parsed.next
      continue
    }
    throw new CliError('bad-request', `Unknown argument: ${token}. Use --help.`)
  }

  let rootInfo
  try {
    rootInfo = statSync(options.root)
  } catch {
    throw new CliError('bad-request', `Workspace root does not exist: ${options.root}`)
  }
  if (!rootInfo.isDirectory()) throw new CliError('bad-request', `Workspace root is not a directory: ${options.root}`)
  return options
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function hasRef(root: string, ref: string): boolean {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

function resolveBase(root: string, explicit: string | undefined): string {
  if (explicit !== undefined && explicit !== '') return explicit
  for (const candidate of ['origin/main', 'HEAD^']) {
    if (hasRef(root, candidate)) return candidate
  }
  throw new CliError('bad-request', 'Cannot determine a base ref; pass --base <ref>, or use --all.')
}

/** Changed paths, including the working tree and untracked files. */
function changedFiles(root: string, base: string): string[] {
  const patterns = [
    ['diff', '--name-only', '--diff-filter=ACMRTUXB', `${base}...HEAD`, '--'],
    ['diff', '--name-only', '--diff-filter=ACMRTUXB', '--'],
    ['diff', '--name-only', '--cached', '--diff-filter=ACMRTUXB', '--'],
    ['ls-files', '--others', '--exclude-standard'],
  ]
  const paths = new Set<string>()
  for (const args of patterns) {
    let output: string
    try {
      output = git(root, args)
    } catch (error) {
      throw new CliError('bad-request', `git ${args.join(' ')} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const line of output.split('\n')) {
      const value = line.trim()
      if (value !== '') paths.add(toPosix(value))
    }
  }
  return [...paths].sort()
}

function toPosix(value: string): string {
  return value.split('\\').join('/')
}

function touchesChanged(finding: DriftFinding, changed: ReadonlySet<string>): boolean {
  if (changed.has(finding.path)) return true
  const other = finding.detail.primaryPath
  return other !== undefined && changed.has(other)
}

function findingView(finding: DriftFinding): Record<string, unknown> {
  return { ...finding }
}

function textOutput(options: CliOptions, base: string | undefined, changed: string[], findings: DriftFinding[], summary: {
  filesScanned: number
  filesSkipped: number
  durationMs: number
  truncated: boolean
  truncatedReason?: string
}): string {
  const lines: string[] = []
  const scope = options.mode === 'all' ? 'all files' : `${changed.length} changed file${changed.length === 1 ? '' : 's'}`
  lines.push(`Scanned ${summary.filesScanned} files (${scope}) in ${summary.durationMs} ms.`)
  if (summary.truncated) lines.push(`Result truncated (${summary.truncatedReason ?? 'limit'}).`)
  if (findings.length === 0) {
    lines.push('No drift findings.')
    return lines.join('\n')
  }
  lines.push(`${findings.length} finding${findings.length === 1 ? '' : 's'}:`)
  for (const finding of findings) {
    lines.push(`${finding.path}:${finding.line}  ${finding.symbol}  [${finding.detector}/${finding.confidence}]  ${finding.message}`)
  }
  if (base !== undefined && options.mode === 'changed') lines.push(`Changed since ${base}.`)
  return lines.join('\n')
}

/**
 * Run one CLI invocation. Exported so tests can drive it without a shell.
 * @param argv - arguments after the program name.
 * @param cwd - directory the process would start in.
 */
export async function runCli(argv: string[], cwd = process.cwd()): Promise<number> {
  const write = (text: string): void => { process.stdout.write(text.endsWith('\n') ? text : `${text}\n`) }
  const fail = (error: unknown): number => {
    const code = error instanceof CliError ? error.code : 'failed'
    const message = error instanceof Error ? error.message : String(error)
    const issues = error instanceof CliError ? error.issues : undefined
    if (argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify({ ok: false, code, message, ...(issues === undefined ? {} : { issues }) })}\n`)
    } else {
      process.stderr.write(`${message}\n`)
    }
    return EXIT_ERROR
  }

  try {
    const parsed = parseArgs(argv, cwd)
    if (parsed === 'help') {
      write(usage())
      return EXIT_CLEAN
    }
    if (parsed === 'version') {
      write(packageVersion())
      return EXIT_CLEAN
    }
    const options = parsed
    const state = await loadVocabulary(options.root, options.vocabulary)
    const errors = state.issues.filter(issue => issue.severity === 'error')
    if (hasErrors(state.issues)) {
      throw new CliError('invalid-vocabulary', `${options.vocabulary} has validation errors; fix it before scanning.`, errors)
    }

    let base: string | undefined
    let changed: string[] = []
    if (options.mode === 'changed') {
      base = resolveBase(options.root, options.base)
      changed = changedFiles(options.root, base)
      if (changed.length === 0) {
        if (options.json) {
          write(JSON.stringify({
            ok: true,
            workspace: options.root,
            vocabularyFile: options.vocabulary,
            mode: 'changed',
            base,
            changedFiles: [],
            total: 0,
            findings: [],
          }))
        } else {
          write('No changed files.')
        }
        return EXIT_CLEAN
      }
    }

    const defaults = liveConfig<SemanticConfig>(undefined)
    const summary = await scanWorkspace({
      root: options.root,
      document: state.document,
      citationStyle: defaults.citationStyle,
      timeoutMs: defaults.timeoutMs,
      maxFindings: defaults.maxFindings,
      maxFileBytes: defaults.maxFileBytes,
      maxFiles: defaults.maxFiles,
      detectors: options.detectors,
      minConfidence: options.minConfidence,
      ...(options.paths.length === 0 ? {} : { paths: options.paths }),
    })
    const changedSet = new Set(changed)
    const findings = options.mode === 'changed'
      ? summary.findings.filter(finding => touchesChanged(finding, changedSet))
      : summary.findings
    const counts: Record<string, number> = Object.fromEntries(DETECTOR_IDS.map(id => [id, 0]))
    for (const finding of findings) counts[finding.detector] = (counts[finding.detector] ?? 0) + 1

    if (options.json) {
      write(JSON.stringify({
        ok: true,
        workspace: options.root,
        vocabularyFile: options.vocabulary,
        vocabularyExists: state.exists,
        mode: options.mode,
        ...(base === undefined ? {} : { base }),
        ...(options.mode === 'changed' ? { changedFiles: changed } : {}),
        scanned: {
          files: summary.filesScanned,
          skipped: summary.filesSkipped,
          bytes: summary.bytesScanned,
          durationMs: summary.durationMs,
          truncated: summary.truncated,
          ...(summary.truncatedReason === undefined ? {} : { truncatedReason: summary.truncatedReason }),
        },
        counts,
        total: findings.length,
        findings: findings.map(findingView),
      }))
    } else {
      write(textOutput(options, base, changed, findings, summary))
    }
    return findings.length > 0 ? EXIT_FINDINGS : EXIT_CLEAN
  } catch (error) {
    if (error instanceof ScanError) return fail(new CliError('bad-request', error.message))
    return fail(error)
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  runCli(process.argv.slice(2)).then(code => {
    process.exitCode = code
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = EXIT_ERROR
  })
}
