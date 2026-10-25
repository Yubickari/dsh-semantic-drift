/**
 * Light symbol table for the scanner.
 *
 * There is deliberately no compiler front end here: a single pass over the text
 * with a comment/string masker and brace pairing. A declaration the masker
 * cannot pair (an unbalanced file, an exotic template) is skipped and counted,
 * never guessed — a wrong member list would produce a wrong "contract drift"
 * finding, which is worse than a missing one.
 *
 * Covered ecosystems: C# (class/struct/interface/record/enum), TypeScript
 * (interface/type/enum/class), Python (class). Other languages are still masked
 * for comment/string evidence used by the term detector.
 *
 * @module dsh-semantic-drift/scan/symbol-table
 */

/** Languages with a dedicated type parser. */
export type Language = 'csharp' | 'typescript' | 'python' | 'java' | 'kotlin' | 'swift' | 'go' | 'rust' | 'c' | 'other'

/** Extensions the scanner reads. Everything else is ignored, never read. */
const EXTENSION_LANGUAGE: Record<string, Language> = {
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mjs': 'typescript',
  '.cjs': 'typescript',
  '.py': 'python',
  '.pyi': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'c',
  '.cpp': 'c',
  '.hpp': 'c',
  // Evidence-only formats: comments/strings/resources feed the term detector.
  '.resx': 'other',
  '.xaml': 'other',
  '.xml': 'other',
  '.properties': 'other',
  '.json': 'other',
}

/** One readable source file. */
export interface SourceFile {
  /** Workspace-relative posix path. */
  relPath: string
  /** Absolute path. */
  absPath: string
  language: Language
  text: string
  bytes: number
}

/** One type declaration with its member names. */
export interface TypeDeclaration {
  name: string
  /** Declaration keyword as written (`class`, `interface`, `enum`, ...). */
  keyword: string
  /** Member names, sorted and unique. */
  members: string[]
  /** Workspace-relative posix path. */
  path: string
  /** 1-based declaration line. */
  line: number
  /** Compilation unit (project/package directory). */
  unit: string
  language: Language
  /**
   * True for a `partial` declaration. A member list read from one file of a
   * partial type is incomplete by construction, so such a declaration is never
   * compared with another one.
   */
  partial?: boolean
  /**
   * Base types as written (`class Foo : Bar<T>, IBaz` -> `['Bar', 'IBaz']`).
   * Used to tell a parameterized derivative from a copy.
   */
  bases?: string[]
  /**
   * Single-line literal initializers per member name, e.g.
   * `ModuleName => "YNE20.Algorithm"` -> `{ ModuleName: ['YNE20.Algorithm'] }`.
   * Only simple literals are recorded; anything else stays absent, which keeps
   * the comparison on the conservative path.
   */
  literals?: Record<string, string[]>
  /** Members declared with `override`. */
  overrides?: string[]
  /**
   * True when the declaration sits inside another type or function body. A
   * nested helper is invisible outside its host, so two of them sharing a short
   * name are a naming coincidence rather than a shared contract.
   */
  nested?: boolean
  /** Declared visibility, when the language states one. */
  visibility?: 'public' | 'protected' | 'internal' | 'private' | 'file'
}

/** Language of a path, or `other` when the file is not read at all. */
export function languageOf(relPath: string): Language | undefined {
  const match = /\.([A-Za-z0-9]+)$/.exec(relPath)
  if (match === null) return undefined
  return EXTENSION_LANGUAGE[`.${match[1].toLowerCase()}`]
}

/** True when the extension is in the read whitelist. */
export function isScannable(relPath: string): boolean {
  return languageOf(relPath) !== undefined
}

/** File-name conventions of generated code, which is never a drift target. */
const GENERATED_FILE = /(?:^|\/)(?:[^/]+\.(?:designer|g|g\.i|generated|assemblyinfo|assemblyattributes)\.cs|\.min\.js|\.min\.css)$/i

/** Header markers of generated code, checked on the first lines of a file. */
const GENERATED_HEADER = /^\s*(?:\/\/|\/\*|#|<!--)[^\n]{0,80}auto-generated/im

/**
 * Whether a file is generated code.
 *
 * Generated files are excluded before parsing: a designer file repeats a shared
 * shape by construction, so reporting it as duplicated vocabulary would be
 * noise, and a hand edit to it is overwritten anyway.
 */
export function isGeneratedSource(relPath: string, text: string): boolean {
  if (GENERATED_FILE.test(relPath)) return true
  return GENERATED_HEADER.test(text.slice(0, 2_000))
}

/** Line-start offsets for index → line conversion. */
export function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

/** 1-based line at a character index. */
export function lineAt(starts: readonly number[], index: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= index) low = mid
    else high = mid - 1
  }
  return low + 1
}

/** Masked views of one file: code without comments/strings, and their exact opposite. */
export interface MaskedText {
  /** Same length as the source; comments and string literals are replaced by spaces. */
  code: string
  /** Same length as the source; everything except comment/string contents is spaces. */
  noise: string
}

function blank(count: number): string {
  return ' '.repeat(count)
}

/**
 * Split a source file into code and comment/string text, preserving offsets.
 *
 * Both outputs keep every newline of the input, so an index into either one maps
 * to the same line as the original text.
 */
export function maskSource(text: string, language: Language): MaskedText {
  const code: string[] = []
  const noise: string[] = []
  const hashComments = language === 'python' || language === 'other'
  let i = 0
  const pushBoth = (segment: string): void => {
    code.push(blank(segment.length))
    noise.push(segment)
  }
  const pushCode = (segment: string): void => {
    code.push(segment)
    noise.push(blank(segment.length))
  }
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]

    if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      pushBoth(text.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      pushBoth(text.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '<' && text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4)
      const stop = end === -1 ? text.length : end + 3
      pushBoth(text.slice(i, stop))
      i = stop
      continue
    }
    if (hashComments && ch === '#') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      pushBoth(text.slice(i, stop))
      i = stop
      continue
    }
    if (hashComments && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const quote = text.slice(i, i + 3)
      const end = text.indexOf(quote, i + 3)
      const stop = end === -1 ? text.length : end + 3
      pushBoth(text.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '@' && next === '"') {
      // C# verbatim string: "" escapes a quote, no backslash escapes.
      let j = i + 2
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      pushBoth(text.slice(i, j))
      i = j
      continue
    }
    if (ch === '$' && next === '"') {
      let j = i + 2
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === '"') {
          j++
          break
        }
        j++
      }
      pushBoth(text.slice(i, j))
      i = j
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      while (j < text.length) {
        const c = text[j]
        if (c === '\\') {
          j += 2
          continue
        }
        if (c === ch) {
          j++
          break
        }
        // A single-quoted C-family char literal or a template literal never
        // spans a blank line in practice; stopping at a newline keeps an
        // unterminated quote from swallowing the rest of the file.
        if (c === '\n' && ch !== '`') {
          break
        }
        j++
      }
      pushBoth(text.slice(i, j))
      i = j
      continue
    }
    pushCode(ch)
    i++
  }
  return { code: code.join(''), noise: noise.join('') }
}

const RESERVED = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'case', 'catch', 'try', 'finally', 'using', 'return', 'new',
  'throw', 'lock', 'await', 'yield', 'else', 'do', 'nameof', 'typeof', 'sizeof', 'default', 'when', 'var',
  'get', 'set', 'init', 'add', 'remove', 'value', 'where', 'select', 'from', 'in', 'is', 'as', 'with',
  'function', 'constructor', 'super', 'this', 'base', 'namespace', 'import', 'export', 'const', 'let',
])

/** Index of the matching close brace, or -1 when the text is unbalanced. */
export function findMatchingBrace(maskedCode: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < maskedCode.length; i++) {
    const ch = maskedCode[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** First `{` at or after `from`, or -1. */
function indexOfBrace(maskedCode: string, from: number): number {
  // A declaration may carry a primary constructor, generic constraints or a
  // base list before the body; stop at a `;` because that is a body-less
  // declaration (a C# record positional signature, a TS type alias).
  for (let i = from; i < maskedCode.length; i++) {
    const ch = maskedCode[i]
    if (ch === '{') return i
    if (ch === ';') return -1
  }
  return -1
}

/** Split a top-level comma list, ignoring nested brackets. */
function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{' || ch === '(' || ch === '[' || ch === '<') depth++
    else if (ch === '}' || ch === ')' || ch === ']' || ch === '>') depth = Math.max(0, depth - 1)
    else if (ch === separator && depth === 0) {
      parts.push(source.slice(start, i))
      start = i + 1
    }
  }
  parts.push(source.slice(start))
  return parts
}

/** Enumerator names of an enum body. */
function enumMembers(body: string): string[] {
  const members: string[] = []
  for (const part of splitTopLevel(body, ',')) {
    const match = /^\s*(?:\[[^\]]*\]\s*)*([A-Za-z_$][\w$]*)/.exec(part)
    if (match !== null && !RESERVED.has(match[1])) members.push(match[1])
  }
  return members
}

const LINE_PROPERTY = /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|readonly|const|required|override|virtual|abstract|new|event|volatile|extern|async|unsafe|sealed|export|declare|default)\s+)*([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?(?:\[\])?\??\s+([A-Za-z_$][\w$]*)\s*(?:[={;(])/
const LINE_METHOD = /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|new|partial|export|declare|default)\s+)*(?:<[^>]*>\s*)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/
const LINE_TS_PROPERTY = /^\s*(?:readonly\s+|static\s+|declare\s+)*([A-Za-z_$][\w$]*)\??\s*[:(]/

/** Member names declared directly inside a (masked) type body. */
function bodyMembers(body: string, keyword: string, typeName: string, language: Language): string[] {
  if (keyword === 'enum') return enumMembers(body)
  const names = new Set<string>()
  const lines = body.split('\n')
  let depth = 0
  for (const rawLine of lines) {
    const line = rawLine
    if (depth === 0) {
      const tsStyle = language === 'typescript' ? LINE_TS_PROPERTY.exec(line) : null
      if (tsStyle !== null && !RESERVED.has(tsStyle[1])) names.add(tsStyle[1])
      const property = LINE_PROPERTY.exec(line)
      if (property !== null && !RESERVED.has(property[2])) names.add(property[2])
      const method = LINE_METHOD.exec(line)
      if (method !== null && !RESERVED.has(method[1]) && method[1] !== typeName) names.add(method[1])
    }
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
  }
  return [...names]
}

/** Positional parameters of a C# record or a Kotlin primary constructor. */
function positionalMembers(code: string, from: number, to: number): string[] {
  const open = code.indexOf('(', from)
  if (open === -1 || open > to) return []
  let depth = 0
  let close = -1
  for (let i = open; i < to; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) return []
  const names: string[] = []
  for (const parameter of splitTopLevel(code.slice(open + 1, close), ',')) {
    const tokens = parameter.trim().split(/\s+/).filter(token => token !== '' && !token.startsWith('['))
    const last = tokens.at(-1)
    if (last === undefined) continue
    const name = /^([A-Za-z_$][\w$]*)\??$/.exec(last.replace(/=[\s\S]*$/, ''))
    if (name !== null && !RESERVED.has(name[1])) names.push(name[1])
  }
  return names
}

const MEMBER_LITERAL = /^\s*(?:(?:public|private|protected|internal|static|readonly|const|required|override|virtual|abstract|new|event)\s+)*[\w<>\[\],?.]+\s+([A-Za-z_$][\w$]*)\s*(?:=>|=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*;?\s*$/

/** Single-line literal initializers of one type body, keyed by member name. */
function memberLiterals(body: string): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {}
  let found = false
  for (const line of body.split('\n')) {
    const match = MEMBER_LITERAL.exec(line)
    if (match === null) continue
    const value = match[2] ?? match[3] ?? match[4] ?? match[5]
    if (value === undefined) continue
    const list = out[match[1]] ?? []
    if (!list.includes(value)) list.push(value)
    out[match[1]] = list
    found = true
  }
  return found ? out : undefined
}

/** Enumerator values of an enum body: `Idle = 1, Running` -> { Idle: ['1'] }. */
function enumLiterals(body: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const part of splitTopLevel(body, ',')) {
    const match = /^\s*(?:\[[^\]]*\]\s*)*([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?\s*$/.exec(part)
    if (match === null) continue
    out[match[1]] = [match[2].replace(/\s+/g, ' ').trim()]
  }
  return out
}

const MEMBER_OVERRIDE = /\boverride\b[^;{=]*\b([A-Za-z_$][\w$]*)\s*(?:[{=;]|=>)/

/** Members of one body declared with `override`. */
function overriddenMembers(body: string): string[] {
  const out: string[] = []
  for (const line of body.split('\n')) {
    if (!/\boverride\b/.test(line)) continue
    const match = MEMBER_OVERRIDE.exec(line)
    if (match !== null && !out.includes(match[1])) out.push(match[1])
  }
  return out
}

/** Base types of one declaration head (the text between the name and the body). */
function baseTypes(head: string): string[] | undefined {
  const colon = head.indexOf(':')
  if (colon < 0) return undefined
  const list = head
    .slice(colon + 1)
    .split(',')
    .map(part => part.trim())
    .map(part => /^(?:global::)?(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)(?:\s*<.*)?$/.exec(part)?.[1])
    .filter((name): name is string => name !== undefined)
  return list.length === 0 ? undefined : list
}

const CS_TYPE = /(?:^|[;{}\s])(?:(?:public|internal|private|protected|static|sealed|abstract|partial|readonly|file|unsafe|new)\s+)*\b(class|struct|interface|record|enum)\s+(?:(?:struct|class)\s+)?([A-Za-z_]\w*)/g
const TS_TYPE = /(?:^|[;{}\s])(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?\b(interface|type|enum|class)\s+([A-Za-z_$][\w$]*)/g

/** Extract every top-level-or-nested type declaration of one file. */
export function extractTypes(file: SourceFile, unitOf: (relPath: string) => string): TypeDeclaration[] {
  const language = file.language
  if (language === 'python') return extractPythonTypes(file, unitOf)
  if (language !== 'csharp' && language !== 'typescript' && language !== 'java' && language !== 'kotlin') return []
  const masked = maskSource(file.text, language)
  const starts = lineStarts(file.text)
  const out: TypeDeclaration[] = []
  const pattern = language === 'csharp' ? CS_TYPE : TS_TYPE
  pattern.lastIndex = 0
  interface Parsed {
    keyword: string
    name: string
    start: number
    after: number
    open: number
    close: number
    partial: boolean
    visibility?: TypeDeclaration['visibility']
  }
  const parsed: Parsed[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(masked.code)) !== null) {
    const keyword = match[1]
    const name = match[2]
    const declarationStart = match.index + match[0].indexOf(keyword)
    const lineStart = masked.code.lastIndexOf('\n', declarationStart) + 1
    const prefix = masked.code.slice(lineStart, declarationStart)
    const open = indexOfBrace(masked.code, pattern.lastIndex)
    if (open === -1) continue
    const close = findMatchingBrace(masked.code, open)
    if (close === -1) continue
    parsed.push({
      keyword,
      name,
      start: declarationStart,
      after: pattern.lastIndex,
      open,
      close,
      partial: /\bpartial\b/.test(prefix),
      ...(visibilityOf(prefix) === undefined ? {} : { visibility: visibilityOf(prefix) as TypeDeclaration['visibility'] }),
    })
  }
  const nested = (item: Parsed): boolean =>
    parsed.some(other => other.open < item.start && item.start < other.close)
  for (const item of parsed) {
    const { name, keyword } = item
    const body = masked.code.slice(item.open + 1, item.close)
    const originalBody = file.text.slice(item.open + 1, item.close)
    const members = bodyMembers(body, keyword, name, language)
    if (keyword === 'record' || language === 'kotlin') {
      for (const extra of positionalMembers(masked.code, item.after, item.open)) members.push(extra)
    }
    const bases = language === 'csharp' ? baseTypes(masked.code.slice(item.after, item.open)) : undefined
    const literals = {
      ...(memberLiterals(originalBody) ?? {}),
      ...(keyword === 'enum' ? enumLiterals(originalBody) : {}),
    }
    const overrides = language === 'csharp' ? overriddenMembers(body) : []
    out.push({
      name,
      keyword,
      members: [...new Set(members)].sort(),
      path: file.relPath,
      line: lineAt(starts, item.start),
      unit: unitOf(file.relPath),
      language,
      ...(item.partial ? { partial: true } : {}),
      ...(bases === undefined ? {} : { bases }),
      ...(Object.keys(literals).length === 0 ? {} : { literals }),
      ...(overrides.length === 0 ? {} : { overrides }),
      ...(nested(item) ? { nested: true } : {}),
      ...(item.visibility === undefined ? {} : { visibility: item.visibility }),
    })
  }
  return out
}

/** Visibility keyword in the text before a declaration, if it states one. */
function visibilityOf(prefix: string): TypeDeclaration['visibility'] | undefined {
  const match = /\b(private|protected|internal|public|file)\b/.exec(prefix)
  return match === null ? undefined : (match[1] as TypeDeclaration['visibility'])
}

const PY_CLASS = /^([ \t]*)class\s+([A-Za-z_]\w*)/gm

function extractPythonTypes(file: SourceFile, unitOf: (relPath: string) => string): TypeDeclaration[] {
  const masked = maskSource(file.text, 'python')
  const starts = lineStarts(file.text)
  const lines = masked.code.split('\n')
  const original = file.text.split('\n')
  const out: TypeDeclaration[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const match = PY_CLASS.exec(line)
    PY_CLASS.lastIndex = 0
    if (match === null) continue
    const baseIndent = match[1].replace(/\t/g, '    ').length
    const name = match[2]
    const members = new Set<string>()
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const bodyLine = lines[cursor]
      if (bodyLine.trim() === '') continue
      const indent = /^[ \t]*/.exec(bodyLine)?.[0].replace(/\t/g, '    ').length ?? 0
      if (indent <= baseIndent) break
      const source = original[cursor]
      const selfAssign = /^\s*self\.([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(source)
      if (selfAssign !== null) members.add(selfAssign[1])
      const def = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(source)
      if (def !== null && !RESERVED.has(def[1])) members.add(def[1])
      const classAssign = /^\s{1,}([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(source)
      if (classAssign !== null) members.add(classAssign[1])
      const annotated = /^\s{1,}([A-Za-z_]\w*)\s*:\s*[^=]+$/.exec(source)
      if (annotated !== null) members.add(annotated[1])
    }
    out.push({
      name,
      keyword: 'class',
      members: [...members].sort(),
      path: file.relPath,
      line: lineAt(starts, starts[index] ?? 0),
      unit: unitOf(file.relPath),
      language: 'python',
      ...(baseIndent > 0 ? { nested: true } : {}),
      visibility: name.startsWith('__') ? 'private' : name.startsWith('_') ? 'protected' : 'public',
    })
  }
  return out
}
