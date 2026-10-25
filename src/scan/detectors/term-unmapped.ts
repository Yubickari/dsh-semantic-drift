/**
 * D3 — a declared term that never reaches code.
 *
 * Signal: the concept declares Chinese terms (or aliases), the canonical symbol
 * appears nowhere in the scanned code, but a term does appear in comments,
 * resource strings or i18n files. That is the reverse of the usual finding: the
 * concept exists in the vocabulary and in human language, and the code just
 * never adopted it.
 *
 * Confidence is low on purpose — natural-language evidence is suggestive, not
 * proof — so these findings stay folded in the panel until asked for.
 *
 * @module dsh-semantic-drift/scan/detectors/term-unmapped
 */

import { makeFinding } from '../types.ts'
import type { Detector, DetectorContext, DetectorFile } from '../types.ts'
import type { DriftFinding } from '../../protocol.ts'
import { lineAt, lineStarts } from '../symbol-table.ts'

/** Concepts evaluated at most, so a large vocabulary cannot explode this rule. */
const MAX_CONCEPTS = 40
/** Occurrences kept per concept. */
const MAX_HITS_PER_CONCEPT = 2

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface ConceptTerms {
  conceptId: string
  canonical: string
  terms: string[]
}

interface TermHit {
  path: string
  line: number
  term: string
}

/** Create a term-unmapped detector with isolated per-scan state. */
export function createTermUnmappedDetector(): Detector {
  let entries: ConceptTerms[] = []
  let termIndex: Map<string, string> = new Map()
  let termRegex: RegExp | undefined
  let canonicalRegex: RegExp | undefined
  let canonicalSeen: Set<string> = new Set()
  let hits: Map<string, TermHit[]> = new Map()

  return {
    id: 'term-unmapped',
    start(ctx: DetectorContext): void {
      canonicalSeen = new Set()
      hits = new Map()
      entries = []
      termIndex = new Map()
      const terms: string[] = []
      for (const concept of ctx.concepts) {
        const canonical = concept.canonical.symbol
        if (canonical === '') continue
        const usable = concept.terms.filter(term => term.length >= 2)
        if (usable.length === 0) continue
        entries.push({ conceptId: concept.id, canonical, terms: usable })
        for (const term of usable) {
          if (termIndex.has(term)) continue
          termIndex.set(term, concept.id)
          terms.push(term)
        }
      }
      // Longest first: a longer term must win over a shorter one it contains.
      terms.sort((left, right) => right.length - left.length)
      termRegex = terms.length === 0 ? undefined : new RegExp(terms.map(escapeRegExp).join('|'), 'g')
      const canonicals = entries.slice(0, MAX_CONCEPTS).map(entry => escapeRegExp(entry.canonical))
      canonicalRegex = canonicals.length === 0
        ? undefined
        : new RegExp(`(?<![A-Za-z0-9_$])(?:${canonicals.join('|')})(?![A-Za-z0-9_$])`, 'g')
    },
    onFile(_ctx: DetectorContext, input: DetectorFile): void {
      // Resource formats (JSON, .resx, properties) are all strings, so their
      // masked code is empty: the raw text is the only meaningful haystack.
      const codeHaystack = input.file.language === 'other' ? input.file.text : input.masked.code
      if (canonicalRegex !== undefined) {
        canonicalRegex.lastIndex = 0
        let canonical: RegExpExecArray | null
        while ((canonical = canonicalRegex.exec(codeHaystack)) !== null) canonicalSeen.add(canonical[0])
      }
      if (termRegex === undefined) return
      const noise = input.masked.noise
      if (noise.trim() === '') return
      const conceptIdsInFile = new Set<string>()
      const starts = lineStarts(input.file.text)
      termRegex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = termRegex.exec(noise)) !== null) {
        const conceptId = termIndex.get(match[0])
        if (conceptId === undefined || conceptIdsInFile.has(conceptId)) continue
        const existing = hits.get(conceptId) ?? []
        if (existing.length >= MAX_HITS_PER_CONCEPT) continue
        conceptIdsInFile.add(conceptId)
        existing.push({ path: input.file.relPath, line: lineAt(starts, match.index), term: match[0] })
        hits.set(conceptId, existing)
      }
    },
    finish(ctx: DetectorContext): DriftFinding[] {
      const findings: DriftFinding[] = []
      for (const entry of entries.slice(0, MAX_CONCEPTS)) {
        if (canonicalSeen.has(entry.canonical)) continue
        for (const hit of hits.get(entry.conceptId) ?? []) {
          findings.push(
            makeFinding(ctx.citationStyle, {
              detector: 'term-unmapped',
              confidence: 'low',
              path: hit.path,
              line: hit.line,
              symbol: entry.canonical,
              expected: entry.canonical,
              conceptId: entry.conceptId,
              message: `Term "${hit.term}" appears here, but the canonical symbol "${entry.canonical}" never appears in the scanned code.`,
              detail: { term: hit.term, rule: 'canonical-missing' },
            }),
          )
        }
      }
      return findings
    },
  }
}
