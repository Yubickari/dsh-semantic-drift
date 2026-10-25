/**
 * Pure helpers behind the panel's finding actions.
 *
 * Kept out of the React components so the two decisions that could be wrong —
 * which concept an accepted finding belongs to, and what id a promoted finding
 * suggests — are ordinary functions with tests, instead of closures only a
 * browser can exercise.
 *
 * @module dsh-semantic-drift/client/finding-actions
 */

import type { Concept, DriftFinding } from '../protocol.ts'

/** `NetworkStatus` -> `network_status`; `TEC_TargetTemp` -> `tec_target_temp`. */
export function snakeCase(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/** A valid id segment: lowercase letter first, then lowercase/digits/underscore. */
function segment(raw: string, fallback: string): string {
  const value = snakeCase(raw)
  if (value === '') return fallback
  return /^[a-z]/.test(value) ? value : `g_${value}`
}

/**
 * The concept an "accept" starts with: the finding's own concept, else the
 * concept whose canonical symbol it is, else the first concept in the file.
 */
export function defaultAcceptConcept(finding: DriftFinding, concepts: readonly Concept[]): string | undefined {
  if (finding.conceptId !== undefined) return finding.conceptId
  const bySymbol = concepts.find(concept => concept.canonical.symbol === finding.symbol)
  return bySymbol?.id ?? concepts[0]?.id
}

/**
 * A suggested concept id for a promoted finding: the finding's top-level folder
 * as the group, the symbol as the name, suffixed when that id is taken.
 *
 * The value is only a starting point in the editor; it always satisfies the
 * store's id pattern, so accepting the suggestion cannot fail validation for
 * the one reason the user did not type.
 */
export function suggestConceptId(finding: DriftFinding, existing: readonly Concept[]): string {
  const group = segment(finding.path.split('/')[0] ?? '', 'concept')
  const base = `${group}.${segment(finding.symbol, 'concept')}`
  let candidate = base
  let suffix = 2
  while (existing.some(concept => concept.id === candidate)) {
    candidate = `${base}_${suffix}`
    suffix++
  }
  return candidate
}
