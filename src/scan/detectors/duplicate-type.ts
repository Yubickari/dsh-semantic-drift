/**
 * D1a — the same type declared in two compilation units.
 *
 * Three outcomes, because "same member names" alone does not mean "copy":
 *
 * - `identical-members`: same names and the same literal values. This is a copy,
 *   and merging it is a safe suggestion.
 * - `derived-copy`: same names, different values, and a base type every
 *   declaration shares. This is a parameterized derivative — the base owns the
 *   behaviour and each unit fills in its own constants. Merging such a family
 *   changes which identity the value resolves against (an assembly, a tenant, a
 *   build target), so the finding must not suggest it.
 * - `literal-variant`: same names, different values, no shared base. Still not a
 *   copy, so still no merge suggestion.
 *
 * The differing branches used to be reported as duplicates, which trained readers
 * to dismiss the strongest signal the plugin has.
 *
 * @module dsh-semantic-drift/scan/detectors/duplicate-type
 */

import { compareLiterals, memberValueDiffs, sharedBase } from '../types.ts'
import { makeFinding } from '../types.ts'
import type { Detector } from '../types.ts'
import type { DriftFinding } from '../../protocol.ts'
import type { TypeDeclaration } from '../symbol-table.ts'

/** Group declarations by type name, preserving visit order. */
export function groupTypesByName(types: readonly TypeDeclaration[]): Map<string, TypeDeclaration[]> {
  const groups = new Map<string, TypeDeclaration[]>()
  for (const declaration of types) {
    const list = groups.get(declaration.name)
    if (list === undefined) groups.set(declaration.name, [declaration])
    else list.push(declaration)
  }
  return groups
}

/** True when two sorted member lists are identical. */
export function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

/**
 * Minimum members for a comparison.
 *
 * A one-member declaration is weak evidence: the same name plus one field is as
 * likely to be a coincidence as a copy, and reporting it trains readers to
 * ignore the list.
 */
export const MIN_COMPARABLE_MEMBERS = 2

/**
 * Whether a declaration is an entry point rather than a shared contract.
 *
 * Every console project has a `Program`, every ASP.NET project a `Startup`; they
 * all have a `Main` and share nothing meaningful. Comparing them produces drift
 * that is technically true and practically useless.
 */
export function isEntryPoint(declaration: TypeDeclaration): boolean {
  if (!/^(program|startup|main|entrypoint)$/i.test(declaration.name)) return false
  return declaration.members.some(member => /^(main|mainasync)$/i.test(member))
}

/** Declarations that may take part in a member comparison at all. */
export function comparableDeclarations(declarations: readonly TypeDeclaration[]): TypeDeclaration[] {
  return declarations.filter(declaration =>
    declaration.members.length >= MIN_COMPARABLE_MEMBERS
    && declaration.partial !== true
    && !isEntryPoint(declaration),
  )
}

/** Last dotted segment of a base reference, generic arguments stripped. */
export function simpleBaseName(reference: string): string {
  const withoutGenerics = reference.replace(/<[^>]*>/g, '')
  return (withoutGenerics.split('.').at(-1) ?? withoutGenerics).trim()
}

/**
 * True when `left` names `right`'s simple name in its base list.
 *
 * A type that shadows its own base (the same simple name in another namespace)
 * is a subclass, not a second definition: what looks like "missing members" is
 * inheritance, and reporting it as drift is a false positive.
 */
export function shadowsBase(left: TypeDeclaration, right: TypeDeclaration): boolean {
  return (left.bases ?? []).some(base => simpleBaseName(base) === right.name)
}

/**
 * A type nobody outside its enclosing type can see: a private nested helper.
 * Two helpers in different files that happen to share a short name are a naming
 * coincidence, not a shared contract.
 */
export function isLocalHelper(declaration: TypeDeclaration): boolean {
  return declaration.nested === true && declaration.visibility !== 'public'
}

export const duplicateTypeDetector: Detector = {
  id: 'duplicate-type',
  finish(ctx): DriftFinding[] {
    const findings: DriftFinding[] = []
    for (const [name, declarations] of groupTypesByName(ctx.types)) {
      const comparable = comparableDeclarations(declarations)
      if (comparable.length < 2) continue
      const units = new Set(comparable.map(declaration => declaration.unit))
      if (units.size < 2) continue
      const primary = comparable[0]
      const base = sharedBase(comparable)
      const concept = ctx.concepts.find(item => item.canonical.symbol === name)
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue
        if (!sameMembers(declaration.members, primary.members)) continue
        const relation = compareLiterals(primary, declaration)
        const valueDiffs = memberValueDiffs(primary, declaration)
        const rule = relation === 'same' || relation === 'unknown'
          ? 'identical-members'
          : base === undefined ? 'literal-variant' : 'derived-copy'
        const kindDiffers = primary.keyword !== declaration.keyword
        const message = rule === 'identical-members'
          ? `Type "${name}" is declared again in another compilation unit with the same ${declaration.members.length} members as ${primary.path}${relation === 'same' ? ' and the same values' : ''}${kindDiffers ? `, but as a ${primary.keyword} there and a ${declaration.keyword} here` : ''}.`
          : rule === 'derived-copy'
            ? `Type "${name}" derives from ${base ?? 'a shared base'} in another compilation unit and only fills in its own values; this is a parameterized derivative, not a copy — merging it would change which identity those values resolve against.`
            : `Type "${name}" repeats the member names of ${primary.path} but gives them different values (${valueDiffs.slice(0, 3).map(diff => `${diff.member}: ${diff.right ?? '?'} -> ${diff.left ?? '?'}`).join('; ')}); the two sides no longer agree on what those names mean.`
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: 'duplicate-type',
            confidence: 'high',
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...(concept === undefined ? {} : { conceptId: concept.id }),
            message,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: declaration.members,
              rule,
              sites: comparable.length,
              ...(base === undefined ? {} : { base }),
              ...(primary.literals === undefined ? {} : { literals: primary.literals }),
              ...(valueDiffs.length === 0 ? {} : { valueDiffs }),
              ...(kindDiffers ? { kinds: [primary.keyword, declaration.keyword] } : {}),
            },
          }),
        )
      }
    }
    return findings
  },
}
