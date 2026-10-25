/**
 * D2 — a spelling variant of a concept's canonical symbol.
 *
 * Three rules, cheapest first:
 * 1. `normalized` — identical after removing `_`/`-` and case (`target_temp`
 *    for `TargetTemp`).
 * 2. `confusable` — a known misspelling/abbreviation of a token inside the
 *    symbol (`TempParms` for `TempParams`, `deviceConf` for `deviceConfig`).
 * 3. `edit-distance` — distance ≤ 2 on a declared name of length ≥ 6.
 *
 * Every rule is filtered a second time: the file must also contain one of the
 * concept's terms, or the spelling must share the canonical symbol's leading
 * token. Without that filter, edit distance alone floods a real repository with
 * matches, which is how a drift report becomes background noise.
 *
 * @module dsh-semantic-drift/scan/detectors/symbol-variant
 */

import { editDistance, leadingToken, makeFinding, normalizedSymbol } from '../types.ts'
import type { Detector, DetectorFile, DetectorContext } from '../types.ts'
import type { Concept, DriftFinding } from '../../protocol.ts'
import { lineAt, lineStarts } from '../symbol-table.ts'

/** Misspellings and abbreviations that appear in real code often enough to name. */
const KNOWN_CONFUSABLES: ReadonlyArray<readonly [correct: string, wrong: string]> = [
  ['params', 'parms'],
  ['param', 'parm'],
  ['config', 'conf'],
  ['configuration', 'config'],
  ['address', 'adress'],
  ['enums', 'enumus'],
  ['length', 'lenght'],
  ['receive', 'recieve'],
  ['separate', 'seperate'],
  ['definition', 'defination'],
  ['temperature', 'temprature'],
  ['template', 'templet'],
  ['message', 'mesage'],
  ['response', 'responce'],
  ['identifier', 'identifer'],
  ['threshold', 'treshold'],
  ['position', 'positon'],
  ['default', 'defualt'],
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `TargetTemp` -> a source that also matches `target_temp` and `TARGET-TEMP`. */
function variantSource(symbol: string): string {
  return [...symbol].map(character => escapeRegExp(character)).join('[_-]?')
}

function bounded(source: string): string {
  return `(?<![A-Za-z0-9_$])(?:${source})(?![A-Za-z0-9_$])`
}

interface ConceptPattern {
  concept: Concept
  canonical: string
  canonicalLower: string
  /** Matches any accepted spelling, used to attribute a combined-regex hit. */
  test: RegExp
  /** Regex sources this concept contributes to the combined scan. */
  sources: string[]
  /** Literal wrong forms this concept accepts as evidence (lowercased). */
  confusables: Set<string>
}

/** Per-concept cap, so one concept cannot dominate a scan. */
const PER_CONCEPT_LIMIT = 5
/** Cap on candidates kept while scanning; the orchestrator caps findings again. */
const PENDING_LIMIT = 2_000

/** Create a symbol-variant detector with isolated per-scan state. */
export function createSymbolVariantDetector(): Detector {
  let patterns: ConceptPattern[] = []
  let combined: RegExp | undefined
  let pending: DriftFinding[] = []
  let seen: Set<string> = new Set()
  let perConcept: Map<string, number> = new Map()

  const reported = (conceptId: string, path: string, symbol: string): boolean => {
    const key = `${conceptId}|${path}|${symbol}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }

  const countOf = (conceptId: string): number => perConcept.get(conceptId) ?? 0

  /**
   * The mandatory second filter: the file must talk about the concept (a term
   * appears in it), or the spelling must live in the canonical symbol's own
   * leading token namespace.
   */
  const sharesEvidence = (pattern: ConceptPattern, symbol: string, text: string): boolean => {
    for (const term of pattern.concept.terms) {
      if (term.length >= 2 && text.includes(term)) return true
    }
    return leadingToken(symbol) === leadingToken(pattern.canonical)
  }

  const ruleOf = (pattern: ConceptPattern, symbol: string): { rule: string; distance?: number } => {
    if (pattern.confusables.has(symbol.toLowerCase())) return { rule: 'confusable' }
    if (normalizedSymbol(symbol) === normalizedSymbol(pattern.canonical)) return { rule: 'normalized' }
    return { rule: 'edit-distance', distance: editDistance(symbol, pattern.canonical, 2) }
  }

  return {
    id: 'symbol-variant',
    start(ctx: DetectorContext): void {
      pending = []
      seen = new Set()
      perConcept = new Map()
      patterns = []
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol
        if (canonical === '') continue
        const sources = new Set<string>([variantSource(canonical)])
        const confusables = new Set<string>()
        for (const [correct, wrong] of KNOWN_CONFUSABLES) {
          if (!canonical.includes(correct)) continue
          const form = canonical.replace(correct, wrong)
          confusables.add(form.toLowerCase())
          sources.add(variantSource(form))
        }
        patterns.push({
          concept,
          canonical,
          canonicalLower: canonical.toLowerCase(),
          test: new RegExp(bounded([...sources].join('|')), 'i'),
          sources: [...sources],
          confusables,
        })
      }
      const allSources = new Set<string>()
      for (const pattern of patterns) for (const source of pattern.sources) allSources.add(source)
      combined = allSources.size === 0
        ? undefined
        : new RegExp(`(?<![A-Za-z0-9_$])(?:${[...allSources].join('|')})(?![A-Za-z0-9_$])`, 'gi')
    },
    onFile(ctx: DetectorContext, input: DetectorFile): void {
      if (combined === undefined || pending.length >= PENDING_LIMIT) return
      const code = input.masked.code
      const starts = lineStarts(input.file.text)
      combined.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = combined.exec(code)) !== null) {
        const symbol = match[0]
        if (symbol === '') {
          combined.lastIndex++
          continue
        }
        const pattern = patterns.find(candidate => candidate.test.test(symbol))
        if (pattern === undefined) continue
        if (symbol.toLowerCase() === pattern.canonicalLower) continue
        if (countOf(pattern.concept.id) >= PER_CONCEPT_LIMIT) continue
        if (!sharesEvidence(pattern, symbol, input.file.text)) continue
        if (!reported(pattern.concept.id, input.file.relPath, symbol)) continue
        perConcept.set(pattern.concept.id, countOf(pattern.concept.id) + 1)
        const rule = ruleOf(pattern, symbol)
        pending.push(
          makeFinding(ctx.citationStyle, {
            detector: 'symbol-variant',
            confidence: 'medium',
            path: input.file.relPath,
            line: lineAt(starts, match.index),
            symbol,
            expected: pattern.canonical,
            conceptId: pattern.concept.id,
            message: `"${symbol}" spells concept ${pattern.concept.id} differently from its canonical symbol "${pattern.canonical}".`,
            detail: {
              members: [pattern.canonical],
              term: pattern.concept.terms[0],
              rule: rule.rule,
              ...(rule.distance === undefined ? {} : { distance: rule.distance }),
            },
          }),
        )
      }
    },
    finish(ctx: DetectorContext): DriftFinding[] {
      const findings = [...pending]
      // Rule 3 runs over declared names only: that keeps the candidate set
      // bounded by real declarations instead of every identifier in the tree.
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol
        if (canonical.length < 6) continue
        const canonicalToken = leadingToken(canonical)
        for (const declaration of ctx.types) {
          const name = declaration.name
          if (name === canonical) continue
          if (name.length < 6 || canonical.length < 6) continue
          if (Math.abs(name.length - canonical.length) > 2) continue
          if (name[0]?.toLowerCase() !== canonical[0]?.toLowerCase()) continue
          if (leadingToken(name) !== canonicalToken) continue
          if (findings.length >= PENDING_LIMIT) break
          const distance = editDistance(name, canonical, 2)
          if (distance < 1 || distance > 2) continue
          if (countOf(concept.id) >= PER_CONCEPT_LIMIT) break
          if (!reported(concept.id, declaration.path, name)) continue
          perConcept.set(concept.id, countOf(concept.id) + 1)
          findings.push(
            makeFinding(ctx.citationStyle, {
              detector: 'symbol-variant',
              confidence: 'medium',
              path: declaration.path,
              line: declaration.line,
              symbol: name,
              expected: canonical,
              conceptId: concept.id,
              message: `Declared type "${name}" is ${distance} edits away from the canonical symbol "${canonical}".`,
              detail: { members: [canonical], rule: 'edit-distance', distance },
            }),
          )
        }
      }
      return findings
    },
  }
}
