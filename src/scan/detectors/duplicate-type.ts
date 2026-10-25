/**
 * D1a — the same type declared in two compilation units with the same members.
 *
 * Signal: a type name appears in two or more units (projects/packages) and the
 * member lists are identical. The finding says "duplicate definition": the code
 * works, but two copies now have to be kept in step by hand.
 *
 * The differing branch of the same comparison is {@link contractDriftDetector};
 * both are reported, with different labels, because "copy" and "already
 * inconsistent" call for different work.
 *
 * @module dsh-semantic-drift/scan/detectors/duplicate-type
 */

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

/** True when two sorted member lists are identical. */
export function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
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
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue
        if (!sameMembers(declaration.members, primary.members)) continue
        const concept = ctx.concepts.find(item => item.canonical.symbol === name)
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: 'duplicate-type',
            confidence: 'high',
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...(concept === undefined ? {} : { conceptId: concept.id }),
            message: `Type "${name}" is declared again in another compilation unit with the same ${declaration.members.length} members as ${primary.path}.`,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: declaration.members,
              rule: 'identical-members',
            },
          }),
        )
      }
    }
    return findings
  },
}
