/**
 * D1b/D4 — the same type declared in two compilation units with different
 * members, i.e. a boundary whose two sides disagree about the contract.
 *
 * This is the dangerous branch of the D1 comparison: the copies have already
 * diverged, so a value produced on one side may not be understood on the other.
 * A finding carries the exact missing/extra member names, because "these two
 * enums differ" is useless without the difference.
 *
 * @module dsh-semantic-drift/scan/detectors/contract-drift
 */

import { makeFinding } from '../types.ts'
import type { Detector } from '../types.ts'
import type { DriftFinding } from '../../protocol.ts'
import { comparableDeclarations, groupTypesByName, isLocalHelper, shadowsBase } from './duplicate-type.ts'

export const contractDriftDetector: Detector = {
  id: 'contract-drift',
  finish(ctx): DriftFinding[] {
    const findings: DriftFinding[] = []
    for (const [name, declarations] of groupTypesByName(ctx.types)) {
      const comparable = comparableDeclarations(declarations)
      if (comparable.length < 2) continue
      const units = new Set(comparable.map(declaration => declaration.unit))
      if (units.size < 2) continue
      const primary = comparable[0]
      const primaryMembers = new Set(primary.members)
      for (const declaration of comparable.slice(1)) {
        if (declaration.unit === primary.unit || declaration.path === primary.path) continue
        // A type that shadows its own base inherits the "missing" members; the
        // difference is the class hierarchy, not a drifting contract.
        if (shadowsBase(declaration, primary) || shadowsBase(primary, declaration)) continue
        // Two private nested helpers with the same short name are local names,
        // not a boundary between two parts of the system.
        if (isLocalHelper(primary) && isLocalHelper(declaration)) continue
        const members = new Set(declaration.members)
        if (members.size === primaryMembers.size && [...members].every(member => primaryMembers.has(member))) continue
        const missing = primary.members.filter(member => !members.has(member))
        const extra = declaration.members.filter(member => !primaryMembers.has(member))
        // Values matter as much as names: an enum whose members swapped values is
        // a contract change that a name-only comparison reports as "identical".
        const valueDiffs: Array<{ member: string; left?: string; right?: string }> = []
        for (const member of declaration.members) {
          if (!primaryMembers.has(member)) continue
          const left = declaration.literals?.[member]
          const right = primary.literals?.[member]
          if (left === undefined || right === undefined) continue
          if (left.length === right.length && left.every(value => right.includes(value))) continue
          valueDiffs.push({
            member,
            ...(right === undefined ? {} : { right: right.join('|') }),
            ...(left === undefined ? {} : { left: left.join('|') }),
          })
        }
        // Nothing in common means the two declarations are different types that
        // happen to share a name (a `MainWindow` per application, say). Reporting
        // that as diverged vocabulary would be a name collision, not drift.
        if (missing.length === primary.members.length) continue
        const concept = ctx.concepts.find(item => item.canonical.symbol === name)
        const difference = [
          missing.length === 0 ? '' : `missing [${missing.join(', ')}]`,
          extra.length === 0 ? '' : `extra [${extra.join(', ')}]`,
          valueDiffs.length === 0
            ? ''
            : `values differ [${valueDiffs.slice(0, 3).map(diff => `${diff.member}: ${diff.right ?? '?'} -> ${diff.left ?? '?'}`).join('; ')}]`,
        ]
          .filter(part => part !== '')
          .join(', ')
        findings.push(
          makeFinding(ctx.citationStyle, {
            detector: 'contract-drift',
            confidence: 'high',
            path: declaration.path,
            line: declaration.line,
            symbol: name,
            ...(concept === undefined ? {} : { conceptId: concept.id }),
            message: `Type "${name}" differs between ${primary.path} and ${declaration.path}: ${difference}.`,
            detail: {
              primaryPath: primary.path,
              primaryLine: primary.line,
              unit: declaration.unit,
              members: primary.members,
              missing,
              extra,
              ...(valueDiffs.length === 0 ? {} : { valueDiffs }),
              rule: 'diverged-members',
            },
          }),
        )
      }
    }
    return findings
  },
}
