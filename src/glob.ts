/**
 * Glob support for the `exclude` and `accepted[].path` fields.
 *
 * The vocabulary file stores globs, not regular expressions, because that is
 * what people write and review. This module is the single translation point:
 * the scanner prunes directories with it and the store validates patterns with
 * it, so an accepted exception and a scan exclusion can never disagree about
 * what `**\/bin/**` means.
 *
 * Supported syntax: `*` (within one segment), `?`, `**` (across segments),
 * `[abc]`/`[a-z]` character classes, `{a,b}` alternation. Patterns match
 * workspace-relative posix paths.
 *
 * @module dsh-semantic-drift/glob
 */

const REGEX_SPECIAL = /[.+^$()|\\]/

function escapeChar(ch: string): string {
  return REGEX_SPECIAL.test(ch) ? `\\${ch}` : ch
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Normalize a pattern or path to posix, without a leading `./`. */
export function toPosix(value: string): string {
  let out = value.replace(/\\/g, '/')
  while (out.startsWith('./')) out = out.slice(2)
  return out
}

/**
 * Translate one glob into an anchored regular expression.
 * @param pattern - glob as written in the vocabulary file.
 * @returns the compiled expression.
 */
export function globToRegExp(pattern: string): RegExp {
  const source = toPosix(pattern.trim())
  let out = '^'
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '*') {
      if (source[i + 1] === '*') {
        while (source[i + 1] === '*') i++
        if (source[i + 1] === '/') {
          i++
          out += '(?:[^/]+/)*'
        } else {
          out += '.*'
        }
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (ch === '?') {
      out += '[^/]'
      continue
    }
    if (ch === '[') {
      const end = source.indexOf(']', i + 1)
      if (end === -1) {
        out += '\\['
      } else {
        const body = source.slice(i + 1, end).replace(/\\/g, '\\\\')
        out += `[${body}]`
        i = end
      }
      continue
    }
    if (ch === '{') {
      const end = source.indexOf('}', i + 1)
      if (end === -1) {
        out += '\\{'
      } else {
        const parts = source.slice(i + 1, end).split(',').map(part => escapeLiteral(part.trim()))
        out += `(?:${parts.join('|')})`
        i = end
      }
      continue
    }
    out += escapeChar(ch)
  }
  out += '$'
  return new RegExp(out)
}

/** A pattern the store will accept. */
export function isValidGlob(pattern: string): boolean {
  if (typeof pattern !== 'string') return false
  const trimmed = pattern.trim()
  if (trimmed === '') return false
  // Unbalanced character class or alternation is almost always a typo, and a
  // typo here silently disables an exclusion.
  const withoutEscapes = trimmed.replace(/\\[[\]]/g, '')
  if ((withoutEscapes.match(/\[/g)?.length ?? 0) !== (withoutEscapes.match(/\]/g)?.length ?? 0)) return false
  if ((trimmed.match(/\{/g)?.length ?? 0) !== (trimmed.match(/\}/g)?.length ?? 0)) return false
  try {
    globToRegExp(trimmed)
    return true
  } catch {
    return false
  }
}

/** Precompiled pattern set. */
export interface GlobSet {
  patterns: string[]
  regexps: RegExp[]
}

/** Compile a pattern list once. Invalid patterns are dropped by the caller's validation. */
export function compileGlobs(patterns: readonly string[]): GlobSet {
  const kept: string[] = []
  const regexps: RegExp[] = []
  for (const pattern of patterns) {
    if (!isValidGlob(pattern)) continue
    kept.push(pattern)
    regexps.push(globToRegExp(pattern))
  }
  return { patterns: kept, regexps }
}

/**
 * Test one relative path against a compiled set.
 * @param set - compiled patterns.
 * @param path - workspace-relative posix path.
 * @param isDirectory - directories are tested with a trailing separator so
 *   `**\/bin/**` prunes the directory itself, not only its children.
 */
export function matchesGlobs(set: GlobSet, path: string, isDirectory = false): boolean {
  const candidate = toPosix(path) + (isDirectory ? '/' : '')
  for (const regexp of set.regexps) {
    if (regexp.test(candidate)) return true
  }
  return false
}

/** Convenience for one-off checks (the panel's accepted exceptions). */
export function matchesGlob(pattern: string | undefined, path: string): boolean {
  if (pattern === undefined || pattern.trim() === '' || pattern.trim() === '**') return true
  if (!isValidGlob(pattern)) return false
  return globToRegExp(pattern).test(toPosix(path))
}
